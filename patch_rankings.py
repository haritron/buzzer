import os
import re

app_js_path = r'd:\Projects\New folder\public\app.js'
linkup_html_path = r'd:\Projects\New folder\public\linkup.html'

# 1. Update app.js
with open(app_js_path, 'r', encoding='utf-8') as f:
    app_content = f.read()

# Add buttons to Admin Dashboard
buttons_html = """
        <div>
          <button class="btn btn-primary" style="background:#f59e0b; border-color:#f59e0b; margin-right:8px;" onclick="downloadRankings()">Download CSV ⬇</button>
          <button class="btn btn-primary" style="background:#8b5cf6; border-color:#8b5cf6; margin-right:8px;" onclick="toggleLeaderboard()">
            ${st.showLeaderboard ? 'Hide Leaderboard' : 'Show Leaderboard 🏆'}
          </button>
          <button class="btn btn-primary" style="background:#087f79; border-color:#087f79; margin-right:8px;" onclick="openMainPresenterModal()">Open presenter screen ↗</button>
          <button class="btn btn-secondary" onclick="logout()">Logout</button>
        </div>
"""
app_content = re.sub(r'<div>\s*<button class="btn btn-primary"[^>]*>Open presenter screen ↗</button>\s*<button class="btn btn-secondary" onclick="logout\(\)">Logout</button>\s*</div>', buttons_html.strip(), app_content)

# Add JS functions
js_funcs = """
async function toggleLeaderboard() {
  await apiCall('/api/admin/state', 'POST', { showLeaderboard: !globalState.state.showLeaderboard });
}

function downloadRankings() {
  const teams = [...globalState.teams].sort((a, b) => b.score - a.score);
  let csvContent = "data:text/csv;charset=utf-8,Rank,Team Name,Member Name,Score,Round,Batch\\n";
  
  teams.forEach((t, index) => {
    const row = [
      index + 1,
      `"${(t.teamName || '').replace(/"/g, '""')}"`,
      `"${(t.memberName || '').replace(/"/g, '""')}"`,
      t.score,
      `"${(t.assignedRound || '').replace(/"/g, '""')}"`,
      `"${(t.assignedBatch || '').replace(/"/g, '""')}"`
    ].join(",");
    csvContent += row + "\\n";
  });

  const encodedUri = encodeURI(csvContent);
  const link = document.createElement("a");
  link.setAttribute("href", encodedUri);
  link.setAttribute("download", `rankings_room_${roomCode}_${new Date().toISOString().split('T')[0]}.csv`);
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
}
"""
if "function downloadRankings" not in app_content:
    app_content = app_content.replace("async function toggleBuzzer() {", js_funcs + "\nasync function toggleBuzzer() {")

with open(app_js_path, 'w', encoding='utf-8') as f:
    f.write(app_content)


# 2. Update linkup.html
with open(linkup_html_path, 'r', encoding='utf-8') as f:
    linkup_content = f.read()

# Add CSS for leaderboard
leaderboard_css = """
		/* Leaderboard Overlay */
		.leaderboard-overlay { position: fixed; top: 0; left: 0; width: 100%; height: 100%; background: rgba(15, 23, 42, 0.95); backdrop-filter: blur(10px); z-index: 3000; display: flex; flex-direction: column; align-items: center; padding: 40px; transform: translateY(-100%); transition: transform 0.6s cubic-bezier(0.22, 1, 0.36, 1); color: #fff; overflow-y: auto; }
		.leaderboard-overlay.show { transform: translateY(0); }
		.leaderboard-title { font-size: 48px; font-weight: 900; color: #f7ca62; margin-bottom: 40px; text-transform: uppercase; letter-spacing: 4px; text-shadow: 0 4px 15px rgba(247, 202, 98, 0.4); }
		.leaderboard-list { width: 100%; max-width: 800px; display: flex; flex-direction: column; gap: 12px; }
		.lb-row { display: flex; align-items: center; background: rgba(255,255,255,0.05); padding: 20px 30px; border-radius: 16px; border: 1px solid rgba(255,255,255,0.1); transition: transform 0.2s; }
		.lb-row:hover { transform: scale(1.02); background: rgba(255,255,255,0.1); }
		.lb-rank { font-size: 32px; font-weight: 900; width: 60px; color: rgba(255,255,255,0.5); }
		.lb-name { flex: 1; font-size: 28px; font-weight: bold; }
		.lb-score { font-size: 36px; font-weight: 900; color: #4ade80; }
		
		.lb-row.rank-1 { background: linear-gradient(90deg, rgba(251,191,36,0.2) 0%, rgba(255,255,255,0.05) 100%); border-color: rgba(251,191,36,0.4); box-shadow: 0 0 20px rgba(251,191,36,0.1); }
		.lb-row.rank-1 .lb-rank { color: #fbbf24; font-size: 42px; }
		.lb-row.rank-2 { background: linear-gradient(90deg, rgba(148,163,184,0.2) 0%, rgba(255,255,255,0.05) 100%); border-color: rgba(148,163,184,0.4); }
		.lb-row.rank-2 .lb-rank { color: #94a3b8; font-size: 38px; }
		.lb-row.rank-3 { background: linear-gradient(90deg, rgba(180,83,9,0.2) 0%, rgba(255,255,255,0.05) 100%); border-color: rgba(180,83,9,0.4); }
		.lb-row.rank-3 .lb-rank { color: #b45309; font-size: 36px; }
"""
if "/* Leaderboard Overlay */" not in linkup_content:
    linkup_content = linkup_content.replace("/* Buzzer Overlay Styles */", leaderboard_css + "\n\t\t/* Buzzer Overlay Styles */")

# Add HTML for leaderboard
leaderboard_html = """
				<!-- Leaderboard Overlay -->
				<div id="leaderboardOverlay" class="leaderboard-overlay">
					<div class="leaderboard-title">RANKINGS</div>
					<div id="leaderboardList" class="leaderboard-list"></div>
				</div>
"""
if "leaderboardOverlay" not in linkup_content:
    linkup_content = linkup_content.replace("<!-- Buzzer Elements -->", leaderboard_html + "\n\t\t\t\t<!-- Buzzer Elements -->")

# Add JS render logic
leaderboard_js = """
		function updateLeaderboard() {
			const sortedTeams = [...teamsList].sort((a, b) => b.score - a.score);
			const listEl = $('leaderboardList');
			listEl.innerHTML = sortedTeams.map((t, index) => `
				<div class="lb-row rank-${index + 1}">
					<div class="lb-rank">#${index + 1}</div>
					<div class="lb-name">${escapeHtml(t.team_name)}</div>
					<div class="lb-score">${t.score}</div>
				</div>
			`).join('');
		}
"""
if "function updateLeaderboard" not in linkup_content:
    linkup_content = linkup_content.replace("function escapeHtml(value)", leaderboard_js + "\n\t\tfunction escapeHtml(value)")

# Modify the game_state subscription in linkup.html to listen to show_leaderboard
game_state_sync_js = """
						if (st.show_leaderboard !== undefined) {
							if (st.show_leaderboard) {
								updateLeaderboard();
								$('leaderboardOverlay').classList.add('show');
							} else {
								$('leaderboardOverlay').classList.remove('show');
							}
						}
"""
if "if (st.show_leaderboard !== undefined)" not in linkup_content:
    linkup_content = linkup_content.replace("if (st.active_linkup_round_id !== undefined)", game_state_sync_js + "\n\t\t\t\t\t\tif (st.active_linkup_round_id !== undefined)")

initial_leaderboard_js = """
					if (state.show_leaderboard) {
						updateLeaderboard();
						$('leaderboardOverlay').classList.add('show');
					}
"""
if "state.show_leaderboard" not in linkup_content:
    linkup_content = linkup_content.replace("renderPresenter();", initial_leaderboard_js + "\n\t\t\t\t\trenderPresenter();")

with open(linkup_html_path, 'w', encoding='utf-8') as f:
    f.write(linkup_content)

print("done")
