import os
import re

html_file = r'd:\Projects\New folder\public\linkup.html'
with open(html_file, 'r', encoding='utf-8') as f:
    content = f.read()

# 1. Add CSS
css_to_add = """
		/* Buzzer Overlay Styles */
		.flash-overlay { position: fixed; top: 0; left: 0; width: 100%; height: 100%; pointer-events: none; opacity: 0; z-index: 2000; transition: opacity 0.5s ease; }
		.flash-green { background: rgba(0, 255, 0, 0.4); opacity: 1; }
		.flash-red { background: rgba(255, 0, 0, 0.4); opacity: 1; }
		
		.buzzer-overlay { position: fixed; top: 20%; left: 50%; transform: translateX(-50%) scale(0.8); background: rgba(0, 0, 0, 0.85); color: #fff; padding: 30px 60px; border-radius: 20px; box-shadow: 0 10px 50px rgba(0,0,0,0.5); text-align: center; opacity: 0; pointer-events: none; transition: all 0.3s cubic-bezier(0.175, 0.885, 0.32, 1.275); z-index: 2100; }
		.buzzer-overlay.show { opacity: 1; transform: translateX(-50%) scale(1); }
		.buzzer-text { font-size: 24px; font-weight: bold; color: var(--presenter-accent, #f7ca62); text-transform: uppercase; letter-spacing: 4px; margin-bottom: 10px; }
		.buzzer-name { font-size: 64px; font-weight: 900; letter-spacing: -2px; }

		.result-overlay { position: fixed; bottom: 10%; left: 50%; transform: translateX(-50%) scale(0.5); font-size: 80px; font-weight: 900; letter-spacing: -2px; text-transform: uppercase; color: #fff; text-shadow: 0 5px 20px rgba(0,0,0,0.5); opacity: 0; pointer-events: none; transition: all 0.3s cubic-bezier(0.175, 0.885, 0.32, 1.275); z-index: 2200; }
		.result-overlay.correct { color: #4ade80; opacity: 1; transform: translateX(-50%) scale(1); }
		.result-overlay.wrong { color: #f87171; opacity: 1; transform: translateX(-50%) scale(1); }
"""
if '.flash-overlay {' not in content:
    content = content.replace('/* Presenter Selection Modal */', css_to_add + '\n\t\t/* Presenter Selection Modal */')

# 2. Add HTML
html_to_add = """
				<div class="shortcut-hint">← / → previous or next slide · Space reveal clue · R reveal answer · Esc host controls</div>
				
				<!-- Buzzer Elements -->
				<div id="buzzerFlashOverlay" class="flash-overlay"></div>
				<div id="buzzerTeamOverlay" class="buzzer-overlay">
					<div class="buzzer-text">BUZZED IN!</div>
					<div id="buzzedTeamName" class="buzzer-name"></div>
				</div>
				<div id="resultOverlay" class="result-overlay"></div>
"""
if 'buzzerFlashOverlay' not in content:
    content = content.replace('<div class="shortcut-hint">← / → previous or next slide · Space reveal clue · R reveal answer · Esc host controls</div>', html_to_add)


# 3. Add JS state for teams and keyboard listeners
js_to_add = """
		let teamsList = [];
		let currentBuzzedTeamId = null;

		async function handleBuzzerKeys(event) {
			if ($('presenterView').hidden) return;
			
			const key = event.key.toLowerCase();
			if (['g', 'w', 'c'].includes(key)) {
				event.preventDefault();
				
				if (key === 'g') {
					$('buzzerFlashOverlay').className = 'flash-overlay flash-green';
					$('resultOverlay').className = 'result-overlay correct';
					$('resultOverlay').textContent = 'CORRECT';
					await fetch('/api/admin/flash', { method: 'POST', headers: { 'Content-Type': 'application/json', 'x-room-code': roomCode, 'x-admin-id': localStorage.getItem('adminId') }, body: JSON.stringify({ type: 'green' }) });
				} 
				else if (key === 'w') {
					$('buzzerFlashOverlay').className = 'flash-overlay flash-red';
					$('resultOverlay').className = 'result-overlay wrong';
					$('resultOverlay').textContent = 'WRONG';
					await fetch('/api/admin/flash', { method: 'POST', headers: { 'Content-Type': 'application/json', 'x-room-code': roomCode, 'x-admin-id': localStorage.getItem('adminId') }, body: JSON.stringify({ type: 'red' }) });
				} 
				else if (key === 'c') {
					$('buzzerFlashOverlay').className = 'flash-overlay';
					$('resultOverlay').className = 'result-overlay';
					$('buzzerTeamOverlay').classList.remove('show');
					await fetch('/api/admin/state', { method: 'POST', headers: { 'Content-Type': 'application/json', 'x-room-code': roomCode, 'x-admin-id': localStorage.getItem('adminId') }, body: JSON.stringify({ buzzedTeamId: null, buzzedAt: null, buzzerLocked: false }) });
				}
			}
		}

		document.addEventListener('keydown', handleBuzzerKeys);
"""
if 'handleBuzzerKeys' not in content:
    content = content.replace("document.addEventListener('keydown', event => {", js_to_add + "\n\t\tdocument.addEventListener('keydown', event => {")


# 4. Modify initLinkup
teams_init_js = """
					const { data: teamsData } = await supabaseClient.from('teams').select('*').eq('room_id', currentRoomId);
					teamsList = teamsData || [];

					supabaseClient.channel('public:teams')
						.on('postgres_changes', { event: '*', schema: 'public', table: 'teams', filter: `room_id=eq.${currentRoomId}` }, payload => {
							if (payload.eventType === 'INSERT') teamsList.push(payload.new);
							if (payload.eventType === 'UPDATE') teamsList = teamsList.map(t => t.id === payload.new.id ? payload.new : t);
							if (payload.eventType === 'DELETE') teamsList = teamsList.filter(t => t.id !== payload.old.id);
						}).subscribe();
"""
if "supabaseClient.channel('public:teams')" not in content:
    content = content.replace("const state = stateRes.data || {};", teams_init_js + "\n\t\t\t\t\tconst state = stateRes.data || {};")

buzzer_sync_js = """
						if (payload.new.buzzed_team_id !== currentBuzzedTeamId) {
							currentBuzzedTeamId = payload.new.buzzed_team_id;
							if (currentBuzzedTeamId) {
								const team = teamsList.find(t => t.id === currentBuzzedTeamId);
								if (team) {
									$('buzzedTeamName').textContent = team.team_name;
									$('buzzerTeamOverlay').classList.add('show');
								}
							} else {
								$('buzzerTeamOverlay').classList.remove('show');
							}
						}
"""
if "currentBuzzedTeamId = payload.new.buzzed_team_id;" not in content:
    content = content.replace("if (payload.new.linkup_revealed !== undefined)", buzzer_sync_js + "\n\t\t\t\t\t\t\tif (payload.new.linkup_revealed !== undefined)")


initial_buzzer_js = """
					currentBuzzedTeamId = state.buzzed_team_id || null;
					if (currentBuzzedTeamId) {
						const team = teamsList.find(t => t.id === currentBuzzedTeamId);
						if (team) {
							$('buzzedTeamName').textContent = team.team_name;
							$('buzzerTeamOverlay').classList.add('show');
						}
					}
"""
if "currentBuzzedTeamId = state.buzzed_team_id" not in content:
    content = content.replace("clueRevealIndex = state.linkup_clue_index || 0;", "clueRevealIndex = state.linkup_clue_index || 0;\n" + initial_buzzer_js)

with open(html_file, 'w', encoding='utf-8') as f:
    f.write(content)
print("done patching linkup buzzer")
