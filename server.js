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

let clients = [];

function ensureDataFile() {
  if (!fs.existsSync(DATA_FILE)) {
    const defaultData = {
      teams: [],
      questions: [],
      admin: {
        username: 'admin',
        password: 'admin123',
      },
      state: {
        buzzerLocked: true,
        buzzedTeamId: null,
        buzzedAt: null,
        currentQuestionId: null,
        currentSlideIndex: 0,
        flashEvent: null,
      }
    };
    fs.writeFileSync(DATA_FILE, JSON.stringify(defaultData, null, 2));
  }
}

function loadData() {
  ensureDataFile();
  try {
    return JSON.parse(fs.readFileSync(DATA_FILE, 'utf8'));
  } catch (err) {
    // If file is corrupted or old format crashes, fallback to default structure
    fs.unlinkSync(DATA_FILE);
    ensureDataFile();
    return JSON.parse(fs.readFileSync(DATA_FILE, 'utf8'));
  }
}

function saveData(data) {
  fs.writeFileSync(DATA_FILE, JSON.stringify(data, null, 2));
  broadcastState(data);
}

function broadcastState(data) {
  const payload = JSON.stringify({
    teams: data.teams,
    state: data.state,
    questions: data.questions
  });
  clients.forEach(client => {
    client.res.write(`data: ${payload}\n\n`);
  });
}

// SSE Event Stream
app.get('/api/events', (req, res) => {
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');

  const clientId = Date.now();
  const newClient = { id: clientId, res };
  clients.push(newClient);

  const data = loadData();
  res.write(`data: ${JSON.stringify({ teams: data.teams, state: data.state, questions: data.questions })}\n\n`);

  req.on('close', () => {
    clients = clients.filter(client => client.id !== clientId);
  });
});

app.post('/api/admin/login', (req, res) => {
  const data = loadData();
  const { username, password } = req.body || {};
  if (username === data.admin.username && password === data.admin.password) {
    return res.json({ ok: true });
  }
  return res.status(401).json({ ok: false, message: 'Invalid admin credentials' });
});

app.post('/api/teams/join', (req, res) => {
  const data = loadData();
  const { memberName, teamName } = req.body;
  if (!memberName || !teamName) return res.status(400).json({ ok: false, message: 'Missing fields' });
  
  const team = {
    id: crypto.randomUUID(),
    memberName,
    teamName,
    score: 0,
    joinedAt: new Date().toISOString()
  };

  data.teams.push(team);
  saveData(data);
  res.json({ ok: true, team });
});

app.post('/api/buzz', (req, res) => {
  const data = loadData();
  const { teamId } = req.body;
  
  if (data.state.buzzerLocked) {
    return res.status(400).json({ ok: false, message: 'Buzzer is locked' });
  }
  
  if (data.state.buzzedTeamId) {
    return res.status(400).json({ ok: false, message: 'Someone already buzzed' });
  }

  const team = data.teams.find(t => t.id === teamId);
  if (!team) return res.status(404).json({ ok: false, message: 'Team not found' });

  data.state.buzzedTeamId = teamId;
  data.state.buzzedAt = new Date().toISOString();
  // We lock the buzzer immediately when someone buzzes to prevent ties
  data.state.buzzerLocked = true; 
  saveData(data);
  res.json({ ok: true });
});

app.post('/api/admin/state', (req, res) => {
  const data = loadData();
  const newState = req.body;
  data.state = { ...data.state, ...newState, flashEvent: null };
  saveData(data);
  res.json({ ok: true });
});

app.post('/api/admin/flash', (req, res) => {
  const data = loadData();
  const { type } = req.body; // 'green' or 'red'
  data.state.flashEvent = { type, timestamp: Date.now() };
  saveData(data);
  res.json({ ok: true });
});

app.post('/api/admin/score', (req, res) => {
  const data = loadData();
  const { teamId, amount } = req.body;
  const team = data.teams.find(t => t.id === teamId);
  if (team) {
    team.score += amount;
    saveData(data);
  }
  res.json({ ok: true });
});

app.delete('/api/teams/:id', (req, res) => {
  const data = loadData();
  data.teams = data.teams.filter(t => t.id !== req.params.id);
  saveData(data);
  res.json({ ok: true });
});

app.post('/api/questions', (req, res) => {
  const data = loadData();
  const { title, slides } = req.body; // slides: [{ type: 'text'|'image'|'sound', content: '...' }]
  const question = {
    id: crypto.randomUUID(),
    title,
    slides: slides || []
  };
  data.questions.push(question);
  saveData(data);
  res.json({ ok: true, question });
});

app.post('/api/reset-data', (req, res) => {
  const defaultData = {
    teams: [],
    questions: [],
    admin: {
      username: 'admin',
      password: 'admin123',
    },
    state: {
      buzzerLocked: true,
      buzzedTeamId: null,
      buzzedAt: null,
      currentQuestionId: null,
      currentSlideIndex: 0,
      flashEvent: null,
    }
  };
  fs.writeFileSync(DATA_FILE, JSON.stringify(defaultData, null, 2));
  broadcastState(defaultData);
  res.json({ ok: true });
});

app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

if (process.env.NODE_ENV !== 'production' && !process.env.VERCEL) {
  app.listen(PORT, () => {
    console.log(`Live Quiz app running on http://localhost:${PORT}`);
  });
}

module.exports = app;
