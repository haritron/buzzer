const express = require('express');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const app = express();
const PORT = process.env.PORT || 3000;
const DATA_FILE = path.join(__dirname, 'data.json');

app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, 'public')));

function ensureDataFile() {
  if (!fs.existsSync(DATA_FILE)) {
    const defaultData = {
      teams: [],
      questions: [],
      admin: {
        username: 'admin',
        password: 'admin123',
      },
      competition: {
        currentRound: 1,
        currentQuestionIndex: 0,
        timerSeconds: 0,
        timerRunning: false,
        timerStartedAt: null,
        timerRemaining: 0,
        questionStatus: 'idle',
        stage: 'setup',
        showLeaderboard: false,
        winner: null,
        runnerUp: null,
        secondRunnerUp: null,
      },
      rounds: {
        1: { activeTeams: [], qualifiers: [], completed: false },
        2: { activeTeams: [], qualifiers: [], completed: false },
        3: { activeTeams: [], qualifiers: [], completed: false },
      },
      state: {
        currentQuestion: null,
        questionStartedAt: null,
      },
    };
    fs.writeFileSync(DATA_FILE, JSON.stringify(defaultData, null, 2));
  }
}

function loadData() {
  ensureDataFile();
  return JSON.parse(fs.readFileSync(DATA_FILE, 'utf8'));
}

function saveData(data) {
  fs.writeFileSync(DATA_FILE, JSON.stringify(data, null, 2));
}

function randomCode() {
  return crypto
    .randomBytes(3)
    .toString('hex')
    .slice(0, 5)
    .toUpperCase();
}

function deepClone(obj) {
  return JSON.parse(JSON.stringify(obj));
}

app.get('/api/health', (req, res) => {
  res.json({ ok: true });
});

app.post('/api/admin/login', (req, res) => {
  const data = loadData();
  const { username, password } = req.body || {};
  if (username === data.admin.username && password === data.admin.password) {
    return res.json({ ok: true });
  }
  return res.status(401).json({ ok: false, message: 'Invalid admin credentials' });
});

app.get('/api/data', (req, res) => {
  const data = loadData();
  res.json(data);
});

app.post('/api/data/backup', (req, res) => {
  const data = loadData();
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const backupPath = path.join(__dirname, `backup-${timestamp}.json`);
  fs.writeFileSync(backupPath, JSON.stringify(data, null, 2));
  res.json({ ok: true, backupPath });
});

app.post('/api/teams', (req, res) => {
  const data = loadData();
  const team = {
    id: crypto.randomUUID(),
    teamNumber: req.body.teamNumber || data.teams.length + 1,
    teamName: req.body.teamName || `Team ${data.teams.length + 1}`,
    code: req.body.code || randomCode(),
    status: 'waiting',
    connected: false,
    score: 0,
    submitted: false,
    manualAdjustments: [],
    currentQuestionIndex: 0,
    solvedGroups: [],
    selectedCards: [],
    qualified: false,
    eliminated: false,
    roundAccess: {
      1: true,
      2: false,
      3: false,
    },
    joinedAt: new Date().toISOString(),
  };

  data.teams.push(team);
  saveData(data);
  res.json({ ok: true, team });
});

app.put('/api/teams/:id', (req, res) => {
  const data = loadData();
  const team = data.teams.find((t) => t.id === req.params.id);
  if (!team) return res.status(404).json({ ok: false });
  Object.assign(team, req.body);
  saveData(data);
  res.json({ ok: true, team });
});

app.delete('/api/teams/:id', (req, res) => {
  const data = loadData();
  data.teams = data.teams.filter((t) => t.id !== req.params.id);
  saveData(data);
  res.json({ ok: true });
});

app.post('/api/teams/:code/join', (req, res) => {
  const data = loadData();
  const team = data.teams.find((t) => t.code.toUpperCase() === req.params.code.toUpperCase());
  if (!team) return res.status(404).json({ ok: false, message: 'Invalid team code' });

  team.connected = true;
  team.status = 'waiting';
  team.lastConnectedAt = new Date().toISOString();
  saveData(data);

  res.json({ ok: true, team });
});

app.post('/api/teams/:id/score', (req, res) => {
  const data = loadData();
  const team = data.teams.find((t) => t.id === req.params.id);
  if (!team) return res.status(404).json({ ok: false });

  const adjustment = Number(req.body.adjustment || 0);
  team.score = Math.max(0, Number(team.score || 0) + adjustment);
  team.manualAdjustments.push({
    type: adjustment >= 0 ? 'add' : 'subtract',
    amount: Math.abs(adjustment),
    createdAt: new Date().toISOString(),
  });

  saveData(data);
  res.json({ ok: true, team });
});

app.post('/api/teams/:id/reset-score', (req, res) => {
  const data = loadData();
  const team = data.teams.find((t) => t.id === req.params.id);
  if (!team) return res.status(404).json({ ok: false });

  team.score = 0;
  team.manualAdjustments.push({
    type: 'reset',
    createdAt: new Date().toISOString(),
  });
  saveData(data);
  res.json({ ok: true, team });
});

app.post('/api/questions', (req, res) => {
  const data = loadData();
  const question = {
    id: req.body.id || crypto.randomUUID(),
    round: req.body.round || 1,
    difficulty: req.body.difficulty || 'Standard',
    timeLimit: Number(req.body.timeLimit || 180),
    items: Array.isArray(req.body.items) ? req.body.items : [],
    groups: Array.isArray(req.body.groups) ? req.body.groups : [],
    title: req.body.title || `Question ${data.questions.length + 1}`,
  };

  if (req.body.editingId) {
    data.questions = data.questions.map((q) => (q.id === req.body.editingId ? question : q));
  } else {
    data.questions.push(question);
  }

  saveData(data);
  res.json({ ok: true, question });
});

app.get('/api/questions', (req, res) => {
  const data = loadData();
  res.json(data.questions);
});

app.get('/api/questions/:id', (req, res) => {
  const data = loadData();
  const q = data.questions.find((item) => item.id === req.params.id);
  if (!q) return res.status(404).json({ ok: false });
  res.json(q);
});

app.get('/api/display', (req, res) => {
  const data = loadData();
  const displayData = {
    competition: data.competition,
    currentQuestion: data.state.currentQuestion,
    teams: data.teams,
  };
  res.json(displayData);
});

app.post('/api/competition/state', (req, res) => {
  const data = loadData();
  data.competition = { ...data.competition, ...req.body };
  saveData(data);
  res.json({ ok: true, competition: data.competition });
});

app.post('/api/competition/current-question', (req, res) => {
  const data = loadData();
  data.state.currentQuestion = req.body.question;
  data.competition.currentQuestionIndex = req.body.index || 0;
  saveData(data);
  res.json({ ok: true, currentQuestion: data.state.currentQuestion });
});

app.post('/api/teams/:id/update-state', (req, res) => {
  const data = loadData();
  const team = data.teams.find((t) => t.id === req.params.id);
  if (!team) return res.status(404).json({ ok: false });

  team.status = req.body.status || team.status;
  team.connected = true;
  if (req.body.score !== undefined) team.score = req.body.score;
  if (req.body.solvedGroups) team.solvedGroups = req.body.solvedGroups;
  saveData(data);
  res.json({ ok: true, team });
});

app.post('/api/teams/:id/disconnect', (req, res) => {
  const data = loadData();
  const team = data.teams.find((t) => t.id === req.params.id);
  if (!team) return res.status(404).json({ ok: false });

  team.connected = false;
  team.status = 'disconnected';
  saveData(data);
  res.json({ ok: true, team });
});

app.post('/api/advance-round', (req, res) => {
  const data = loadData();
  const round = Number(req.body.round || 1);
  const selectedIds = Array.isArray(req.body.selectedIds) ? req.body.selectedIds : [];

  if (round === 1) {
    data.rounds[1].qualifiers = selectedIds;
    data.rounds[2].activeTeams = data.teams.filter((team) => selectedIds.includes(team.id));
    data.rounds[2].activeTeams.forEach((team) => {
      team.roundAccess[2] = true;
      team.qualified = true;
    });
  }

  if (round === 2) {
    data.rounds[2].qualifiers = selectedIds;
    data.rounds[3].activeTeams = data.teams.filter((team) => selectedIds.includes(team.id));
    data.rounds[3].activeTeams.forEach((team) => {
      team.roundAccess[3] = true;
      team.qualified = true;
    });
  }

  if (round === 3) {
    data.competition.winner = req.body.winner || null;
    data.competition.runnerUp = req.body.runnerUp || null;
    data.competition.secondRunnerUp = req.body.secondRunnerUp || null;
  }

  saveData(data);
  res.json({ ok: true });
});

app.post('/api/reset', (req, res) => {
  const data = loadData();
  data.teams = [];
  data.questions = [];
  data.competition = {
    currentRound: 1,
    currentQuestionIndex: 0,
    timerSeconds: 0,
    timerRunning: false,
    timerStartedAt: null,
    timerRemaining: 0,
    questionStatus: 'idle',
    stage: 'setup',
    showLeaderboard: false,
    winner: null,
    runnerUp: null,
    secondRunnerUp: null,
  };
  data.rounds = {
    1: { activeTeams: [], qualifiers: [], completed: false },
    2: { activeTeams: [], qualifiers: [], completed: false },
    3: { activeTeams: [], qualifiers: [], completed: false },
  };
  data.state = {
    currentQuestion: null,
    questionStartedAt: null,
  };
  saveData(data);
  res.json({ ok: true });
});

app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.listen(PORT, () => {
  console.log(`Connections Competition app running on http://localhost:${PORT}`);
});
