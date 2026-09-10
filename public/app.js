const app = document.getElementById('app');

console.log("--- App.js Loaded v2 ---");
let globalState = {
  isLoaded: false,
  teams: [],
  questions: [],
  state: {
    buzzerLocked: true,
    buzzedTeamId: null,
    currentQuestionId: null,
    currentSlideIndex: 0,
    flashEvent: null
  },
  myTeam: JSON.parse(localStorage.getItem('myTeam') || 'null'),
  adminLoggedIn: localStorage.getItem('adminLoggedIn') === 'true'
};

const supabaseUrl = 'https://lbdpaedflraegmyeyiat.supabase.co';
const supabaseKey = 'sb_publishable_fc7Gs9mzlB7IrVS-PyijdQ_isJxONfg';

let supabaseClient = null;
if (window.supabase) {
  supabaseClient = window.supabase.createClient(supabaseUrl, supabaseKey);
} else {
  console.warn("Supabase CDN failed to load or index.html is cached. Realtime disabled.");
}

async function initApp() {
  try {
    const res = await apiCall('/api/initial-state', 'GET');
    globalState.teams = res.teams.map(t => ({id: t.id, memberName: t.member_name, teamName: t.team_name, score: t.score, assignedRound: t.assigned_round, assignedBatch: t.assigned_batch}));
    globalState.questions = res.questions;
    globalState.state = {
      buzzerLocked: res.state.buzzer_locked,
      buzzedTeamId: res.state.buzzed_team_id,
      currentQuestionId: res.state.current_question_id,
      currentSlideIndex: res.state.current_slide_index || 0,
      flashEvent: res.state.flash_type ? { type: res.state.flash_type, timestamp: res.state.flash_timestamp } : null,
      activeRound: res.state.active_round || 1,
      activeBatch: res.state.active_batch || 1,
      tournamentConfig: res.state.tournament_config || { rounds: [] }
    };
    globalState.isLoaded = true;
    render();
  } catch(e) { console.error('Failed to fetch initial state', e); }

  // Setup Supabase Realtime
  if (supabaseClient) {
    supabaseClient.channel('public:db_changes')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'game_state' }, payload => {
        const row = payload.new;
        if (!row) return;
        const oldFlash = globalState.state.flashEvent;
        globalState.state.buzzerLocked = row.buzzer_locked;
        globalState.state.buzzedTeamId = row.buzzed_team_id;
        globalState.state.currentQuestionId = row.current_question_id;
        globalState.state.currentSlideIndex = row.current_slide_index || 0;
        globalState.state.flashEvent = row.flash_type ? { type: row.flash_type, timestamp: row.flash_timestamp } : null;
        globalState.state.activeRound = row.active_round || 1;
        globalState.state.activeBatch = row.active_batch || 1;
        globalState.state.tournamentConfig = row.tournament_config || { rounds: [] };
        
        if (globalState.state.flashEvent && (!oldFlash || oldFlash.timestamp !== globalState.state.flashEvent.timestamp)) {
          triggerFlash(globalState.state.flashEvent.type);
        }
        render();
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'teams' }, payload => {
        if (payload.eventType === 'INSERT') {
          globalState.teams.push({ id: payload.new.id, memberName: payload.new.member_name, teamName: payload.new.team_name, score: payload.new.score, assignedRound: payload.new.assigned_round, assignedBatch: payload.new.assigned_batch });
        } else if (payload.eventType === 'UPDATE') {
          const idx = globalState.teams.findIndex(t => t.id === payload.new.id);
          if (idx !== -1) {
            globalState.teams[idx].score = payload.new.score;
            globalState.teams[idx].memberName = payload.new.member_name;
            globalState.teams[idx].teamName = payload.new.team_name;
            globalState.teams[idx].assignedRound = payload.new.assigned_round;
            globalState.teams[idx].assignedBatch = payload.new.assigned_batch;
          }
        } else if (payload.eventType === 'DELETE') {
          globalState.teams = globalState.teams.filter(t => t.id !== payload.old.id);
        }
        render();
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'questions' }, payload => {
        if (payload.eventType === 'INSERT') {
          globalState.questions.push(payload.new);
        }
        render();
      })
      .subscribe();
  }
}

initApp();

async function apiCall(url, method = 'POST', body = null) {
  const opts = { method, headers: { 'Content-Type': 'application/json' } };
  if (body) opts.body = JSON.stringify(body);
  const res = await fetch(url, opts);
  const json = await res.json();
  if (!res.ok) throw new Error(json.message || 'API Error');
  return json;
}

// Router
function navigate(path) {
  window.history.pushState({}, '', path);
  render();
}

window.addEventListener('popstate', render);

function render() {
  const path = window.location.pathname;
  app.innerHTML = '';
  
  if (path === '/admin') {
    if (!globalState.adminLoggedIn) renderAdminLogin();
    else renderAdminDashboard();
  } else if (path === '/display') {
    renderDisplay();
  } else {
    if (!globalState.myTeam) renderPlayerJoin();
    else renderPlayerDashboard();
  }
}

// ---------------------------------
// PLAYER VIEW
// ---------------------------------
function renderPlayerJoin() {
  app.innerHTML = `
    <div class="join-container panel">
      <h2 class="text-center mb-4">Join Quiz</h2>
      <div id="joinError" style="color: #ef4444; margin-bottom: 15px; text-align: center; display: none;"></div>
      <input id="memberName" type="text" placeholder="Your Name" />
      <input id="teamName" type="text" placeholder="Team Name" />
      <button class="btn" style="width:100%" onclick="joinTeam()">JOIN GAME</button>
    </div>
  `;
}

async function joinTeam() {
  const memberName = document.getElementById('memberName').value.trim();
  const teamName = document.getElementById('teamName').value.trim();
  const errorEl = document.getElementById('joinError');
  const joinBtn = document.querySelector('.join-container button');
  
  if (!memberName || !teamName) {
    errorEl.textContent = "Please enter both Your Name and Team Name.";
    errorEl.style.display = "block";
    return;
  }
  
  errorEl.style.display = "none";
  
  // Disable button to prevent multiple clicks while waiting for the server
  if (joinBtn) {
    joinBtn.disabled = true;
    joinBtn.textContent = "Joining...";
    joinBtn.style.opacity = "0.7";
    joinBtn.style.cursor = "not-allowed";
  }
  
  try {
    const res = await apiCall('/api/teams/join', 'POST', { memberName, teamName });
    globalState.myTeam = res.team;
    localStorage.setItem('myTeam', JSON.stringify(res.team));
    
    // Optimistically add to teams list so render() doesn't think it was deleted
    const existingIdx = globalState.teams.findIndex(t => t.id === res.team.id);
    if (existingIdx === -1) {
      globalState.teams.push(res.team);
    } else {
      globalState.teams[existingIdx] = res.team;
    }

    render();
  } catch(e) { 
    errorEl.textContent = e.message;
    errorEl.style.display = "block";
    
    // Re-enable button if there's an error so they can try again
    if (joinBtn) {
      joinBtn.disabled = false;
      joinBtn.textContent = "JOIN GAME";
      joinBtn.style.opacity = "1";
      joinBtn.style.cursor = "pointer";
    }
  }
}

function renderPlayerDashboard() {
  if (!globalState.isLoaded) {
    app.innerHTML = `<div class="text-center mt-5" style="color: var(--text-secondary);">Loading...</div>`;
    return;
  }

  const myTeamData = globalState.teams.find(t => t.id === globalState.myTeam.id);
  if (!myTeamData) { // Server restarted / team deleted
    globalState.myTeam = null;
    localStorage.removeItem('myTeam');
    return renderPlayerJoin();
  }

  const isMyTurn = myTeamData.assignedRound === globalState.state.activeRound && myTeamData.assignedBatch === globalState.state.activeBatch;
  const locked = globalState.state.buzzerLocked || !isMyTurn;
  const isMeBuzzed = globalState.state.buzzedTeamId === myTeamData.id;
  const isSomeoneElse = globalState.state.buzzedTeamId && !isMeBuzzed;

  let btnText = 'BUZZ';
  let btnClass = '';
  if (!isMyTurn) { btnText = 'NOT YOUR BATCH'; btnClass = ''; }
  else if (locked && !globalState.state.buzzedTeamId) btnText = 'LOCKED';
  if (isMeBuzzed) { btnText = 'BUZZED!'; btnClass = 'pressed'; }
  if (isSomeoneElse) btnText = 'TOO LATE';

  app.innerHTML = `
    <div class="player-dashboard">
      <div style="background: rgba(255,255,255,0.1); padding: 5px 15px; border-radius: 20px; font-size: 0.9rem; margin-bottom: 15px; color: var(--text-secondary)">
        Round ${globalState.state.activeRound} • Batch ${globalState.state.activeBatch}
      </div>
      <h2>${myTeamData.teamName} <small style="color:var(--text-secondary)">(${myTeamData.memberName})</small></h2>
      <div class="score-display">Score: ${myTeamData.score}</div>
      <button 
        class="buzzer-btn ${btnClass}" 
        ${locked || globalState.state.buzzedTeamId ? 'disabled' : ''} 
        onclick="buzz()">
        ${btnText}
      </button>
    </div>
  `;
}

async function buzz() {
  try {
    await apiCall('/api/buzz', 'POST', { teamId: globalState.myTeam.id });
  } catch(e) { console.error(e); }
}

// ---------------------------------
// ADMIN VIEW
// ---------------------------------
function renderAdminLogin() {
  app.innerHTML = `
    <div class="admin-login panel">
      <h2 class="text-center mb-4">Admin Login</h2>
      <input id="adminUser" type="text" placeholder="Username" />
      <input id="adminPass" type="password" placeholder="Password" />
      <button class="btn" style="width:100%" onclick="adminLogin()">LOGIN</button>
    </div>
  `;
}

async function adminLogin() {
  try {
    await apiCall('/api/admin/login', 'POST', {
      username: document.getElementById('adminUser').value,
      password: document.getElementById('adminPass').value
    });
    globalState.adminLoggedIn = true;
    localStorage.setItem('adminLoggedIn', 'true');
    render();
  } catch(e) { alert(e.message); }
}

function renderAdminDashboard() {
  const st = globalState.state;
  const buzzedTeam = globalState.teams.find(t => t.id === st.buzzedTeamId);

  app.innerHTML = `
    <div class="admin-container">
      <div class="admin-header">
        <h2>Admin Dashboard</h2>
        <div>
          <button class="btn btn-secondary" onclick="navigate('/display')" target="_blank">Open Display</button>
          <button class="btn btn-secondary" onclick="logout()">Logout</button>
        </div>
      </div>
      
      <div class="panel">
        <h3 class="mb-4">Teams</h3>
        <div class="team-list">
          ${globalState.teams.map(t => `
            <div class="team-item ${t.id === st.buzzedTeamId ? 'buzzed' : ''}" style="${t.id === st.buzzedTeamId ? 'border-color:var(--warning); background:rgba(245,158,11,0.2)' : ''}">
              <div>
                <strong>${t.teamName}</strong> <br/>
                <small>${t.memberName}</small>
                <div style="margin-top:5px; font-size:0.8rem; display:flex; align-items:center; gap:5px;">
                  R: <input type="number" value="${t.assignedRound || 1}" onchange="assignTeam('${t.id}', this.value, ${t.assignedBatch || 1})" style="width:40px; padding:2px; margin:0; background:var(--bg-panel); color:white; border:1px solid rgba(255,255,255,0.2);">
                  B: <input type="number" value="${t.assignedBatch || 1}" onchange="assignTeam('${t.id}', ${t.assignedRound || 1}, this.value)" style="width:40px; padding:2px; margin:0; background:var(--bg-panel); color:white; border:1px solid rgba(255,255,255,0.2);">
                </div>
              </div>
              <div class="score-controls">
                <button class="btn btn-secondary" onclick="changeScore('${t.id}', -10)">-10</button>
                <strong style="font-size:1.5rem; width:40px; text-align:center">${t.score}</strong>
                <button class="btn btn-secondary" onclick="changeScore('${t.id}', 10)">+10</button>
                <button class="btn btn-danger" onclick="deleteTeam('${t.id}')">X</button>
              </div>
            </div>
          `).join('')}
        </div>
      </div>

      <div class="panel">
        <h3 class="mb-4">Controls</h3>
        
        <div style="background:rgba(0,0,0,0.3); padding:20px; border-radius:12px; margin-bottom:20px; text-align:center">
          <div style="font-size:1.2rem; margin-bottom:10px">Active Match: 
            <strong>Round ${st.activeRound} • Batch ${st.activeBatch}</strong>
          </div>
          <div style="display:flex; gap:10px; justify-content:center; margin-bottom:20px">
            <input type="number" id="setRound" value="${st.activeRound}" min="1" style="width:70px; margin:0; padding:5px" title="Round" />
            <input type="number" id="setBatch" value="${st.activeBatch}" min="1" style="width:70px; margin:0; padding:5px" title="Batch" />
            <button class="btn btn-secondary" onclick="updateActiveMatch()" style="padding:5px 15px">SET MATCH</button>
          </div>
          
          <div style="font-size:1.2rem; margin-bottom:10px; border-top:1px solid rgba(255,255,255,0.1); padding-top:20px;">Buzzer Status: 
            <span class="status-indicator ${st.buzzerLocked ? 'locked' : 'unlocked'}">${st.buzzerLocked ? 'LOCKED' : 'UNLOCKED'}</span>
          </div>
          ${buzzedTeam ? `<h1 style="color:var(--warning); margin: 20px 0">${buzzedTeam.teamName} BUZZED!</h1>` : ''}
          <div style="display:flex; gap:10px; justify-content:center; margin-top:20px">
            <button class="btn ${st.buzzerLocked ? 'btn-success' : 'btn-danger'}" onclick="toggleBuzzer()">
              ${st.buzzerLocked ? 'UNLOCK BUZZER' : 'LOCK BUZZER'}
            </button>
            <button class="btn btn-secondary" onclick="clearBuzzer()">CLEAR BUZZER</button>
          </div>
        </div>

        <h3 class="mb-4 mt-4">Questions</h3>
        <div style="display:flex; gap:10px; margin-bottom: 20px">
          <select id="qSelect" style="margin:0; flex:1">
            <option value="">-- Select Question --</option>
            ${globalState.questions.map(q => `<option value="${q.id}" ${q.id === st.currentQuestionId ? 'selected' : ''}>${q.title}</option>`).join('')}
          </select>
          <button class="btn" onclick="setQuestion()">SET</button>
        </div>

        <div style="display:flex; gap:10px; justify-content:center">
          <button class="btn btn-secondary" onclick="prevSlide()">Prev Slide</button>
          <button class="btn btn-secondary" onclick="nextSlide()">Next Slide</button>
        </div>
        <div class="text-center mt-4">Current Slide: ${st.currentSlideIndex + 1}</div>

        <h3 class="mb-4 mt-4">Manual Flash & Auto-Score</h3>
        <p style="font-size:0.8rem; color:var(--text-secondary); margin-bottom:10px">Clicking these will flash the screen AND auto-apply positive/negative points to the buzzed team based on your Tournament Settings.</p>
        <div style="display:flex; gap:10px;">
          <button class="btn btn-success" style="flex:1" onclick="flash('green')">CORRECT (Green)</button>
          <button class="btn btn-danger" style="flex:1" onclick="flash('red')">INCORRECT (Red)</button>
        </div>

        <h3 class="mb-4 mt-4">Tournament Settings (JSON)</h3>
        <p style="font-size:0.8rem; color:var(--text-secondary); margin-bottom:10px">Configure rules. Set <code>timeBasedDecay</code> to true for answering speed bonuses!</p>
        <textarea id="tournamentConfig" rows="8" style="font-family:monospace; font-size:0.8rem" placeholder='{"rounds":[{"roundNumber":1, "pointsSetting":{"positiveBase":10, "negativeBase":-5, "timeBasedDecay":true, "maxTimeBonus":5}}]}'>${JSON.stringify(st.tournamentConfig, null, 2)}</textarea>
        <button class="btn btn-secondary mt-2" style="width:100%" onclick="saveTournamentConfig()">Save Config</button>

        <h3 class="mb-4 mt-4">Add New Question</h3>
        <input id="newQTitle" type="text" placeholder="Question Title" />
        <textarea id="newQSlides" rows="6" placeholder='[{"type":"text", "content":"Question?"}, {"type":"image", "content":"http..."}, {"type":"sound", "content":"http..."}, {"type":"html", "content":"<marquee>Animated!</marquee>"}]'></textarea>
        <button class="btn btn-secondary mt-2" style="width:100%" onclick="addNewQuestion()">Save Custom Question</button>
        
        <button class="btn btn-secondary mt-4" style="width:100%" onclick="addDemoQuestion()">Add Demo Question</button>
        <button class="btn btn-danger mt-4" style="width:100%" onclick="resetGame()">Reset Game Data</button>
      </div>
    </div>
  `;
}

async function changeScore(teamId, amount) {
  await apiCall('/api/admin/score', 'POST', { teamId, amount });
}
async function deleteTeam(teamId) {
  await apiCall(`/api/teams/${teamId}`, 'DELETE');
}
async function toggleBuzzer() {
  await apiCall('/api/admin/state', 'POST', { buzzerLocked: !globalState.state.buzzerLocked });
}
async function clearBuzzer() {
  await apiCall('/api/admin/state', 'POST', { buzzedTeamId: null, buzzedAt: null });
}
async function flash(type) {
  await apiCall('/api/admin/flash', 'POST', { type });
}
async function setQuestion() {
  const qid = document.getElementById('qSelect').value;
  await apiCall('/api/admin/state', 'POST', { currentQuestionId: qid, currentSlideIndex: 0 });
}
async function prevSlide() {
  const i = Math.max(0, globalState.state.currentSlideIndex - 1);
  await apiCall('/api/admin/state', 'POST', { currentSlideIndex: i });
}
async function nextSlide() {
  const i = globalState.state.currentSlideIndex + 1;
  await apiCall('/api/admin/state', 'POST', { currentSlideIndex: i });
}
async function resetGame() {
  if(confirm('Are you sure? This deletes all teams and resets game state.')){
    await apiCall('/api/reset-data', 'POST');
  }
}
async function updateActiveMatch() {
  const r = parseInt(document.getElementById('setRound').value);
  const b = parseInt(document.getElementById('setBatch').value);
  await apiCall('/api/admin/state', 'POST', { activeRound: r, activeBatch: b, buzzerLocked: true, buzzedTeamId: null });
}
async function assignTeam(teamId, r, b) {
  await apiCall('/api/admin/team-assign', 'POST', { teamId, assignedRound: parseInt(r), assignedBatch: parseInt(b) });
}
async function saveTournamentConfig() {
  try {
    const config = JSON.parse(document.getElementById('tournamentConfig').value);
    await apiCall('/api/admin/state', 'POST', { tournamentConfig: config });
    alert('Config Saved!');
  } catch(e) { 
    alert('Invalid JSON formatting in Tournament Settings!'); 
  }
}
async function addDemoQuestion() {
  await apiCall('/api/questions', 'POST', {
    title: 'Demo Question',
    slides: [
      { type: 'text', content: 'What is the capital of France?' },
      { type: 'image', content: 'https://images.unsplash.com/photo-1502602898657-3e91760cbb34?w=800' },
      { type: 'text', content: 'Answer: Paris' }
    ]
  });
}
async function addNewQuestion() {
  const title = document.getElementById('newQTitle').value;
  let slides;
  try {
    slides = JSON.parse(document.getElementById('newQSlides').value);
  } catch (e) {
    return alert('Invalid JSON in slides field. Please check the format.');
  }
  if (!title) return alert('Please enter a title');
  await apiCall('/api/questions', 'POST', { title, slides });
  document.getElementById('newQTitle').value = '';
  document.getElementById('newQSlides').value = '';
  alert('Question added successfully!');
}
function logout() {
  globalState.adminLoggedIn = false;
  localStorage.removeItem('adminLoggedIn');
  render();
}

// Keyboard shortcuts for admin and display
window.addEventListener('keydown', (e) => {
  const path = window.location.pathname;
  if (path === '/admin' || path === '/display') {
    if (e.ctrlKey && e.shiftKey) {
      if (e.key.toLowerCase() === 'g') { e.preventDefault(); flash('green'); }
      if (e.key.toLowerCase() === 't') { e.preventDefault(); flash('red'); }
    }
    // Allow slide navigation via arrow keys
    if (e.key === 'ArrowRight') { e.preventDefault(); nextSlide(); }
    if (e.key === 'ArrowLeft') { e.preventDefault(); prevSlide(); }
    if (e.key === 'Escape') { e.preventDefault(); clearBuzzer(); }
  }
});


// ---------------------------------
// DISPLAY VIEW (PROJECTOR)
// ---------------------------------
function renderDisplay() {
  const st = globalState.state;
  let slideHtml = '';
  
  if (st.currentQuestionId) {
    const q = globalState.questions.find(q => q.id === st.currentQuestionId);
    if (q && q.slides[st.currentSlideIndex]) {
      const slide = q.slides[st.currentSlideIndex];
      if (slide.type === 'text') slideHtml = `<div class="question-slide">${slide.content}</div>`;
      if (slide.type === 'image') slideHtml = `<div class="question-slide"><img src="${slide.content}"/></div>`;
      if (slide.type === 'html') slideHtml = `<div class="question-slide" style="width:100%;height:100%">${slide.content}</div>`;
      if (slide.type === 'sound') slideHtml = `<div class="question-slide">🔊 Playing Audio...<audio src="${slide.content}" autoplay></audio></div>`;
    }
  }

  const buzzedTeam = globalState.teams.find(t => t.id === st.buzzedTeamId);

  app.innerHTML = `
    <div class="display-container">
      <div id="flashOverlay" class="flash-overlay"></div>
      
      <div style="position:absolute; top:20px; right:30px; font-size:1.5rem; color:rgba(255,255,255,0.5); font-weight:bold;">
        Round ${st.activeRound} • Batch ${st.activeBatch}
      </div>

      ${slideHtml || '<div class="question-slide" style="color:var(--text-secondary)">Waiting for question...</div>'}
      
      <div class="buzzer-overlay ${buzzedTeam ? 'show' : ''}">
        ${buzzedTeam ? buzzedTeam.teamName : ''}
      </div>
    </div>
  `;
}

function triggerFlash(type) {
  const flashEl = document.getElementById('flashOverlay');
  if (flashEl) {
    flashEl.className = `flash-overlay flash-${type}`;
    // Force reflow to restart animation
    void flashEl.offsetWidth;
    flashEl.classList.add('active');
  }
}

// Initial render
render();
