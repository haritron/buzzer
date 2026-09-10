require('dotenv').config();
const express = require('express');
const path = require('path');
const { createClient } = require('@supabase/supabase-js');

const app = express();
const PORT = process.env.PORT || 3000;

// Initialize Supabase Client (Service Role Key recommended for backend)
const supabaseUrl = process.env.SUPABASE_URL || 'https://lbdpaedflraegmyeyiat.supabase.co';
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY || 'sb_publishable_fc7Gs9mzlB7IrVS-PyijdQ_isJxONfg';
const supabase = createClient(supabaseUrl, supabaseKey);

app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, 'public')));

// Admin credentials (should also be env vars in production)
const ADMIN_USER = process.env.ADMIN_USER || 'admin';
const ADMIN_PASS = process.env.ADMIN_PASS || 'admin123';

app.post('/api/admin/login', (req, res) => {
  const { username, password } = req.body || {};
  if (username === ADMIN_USER && password === ADMIN_PASS) {
    return res.json({ ok: true });
  }
  return res.status(401).json({ ok: false, message: 'Invalid admin credentials' });
});

app.post('/api/teams/join', async (req, res) => {
  const { memberName, teamName } = req.body;
  if (!memberName || !teamName) return res.status(400).json({ ok: false, message: 'Missing fields' });
  
  // Fetch all existing teams to check for username usage and existing team names
  const { data: existingTeams, error: errMem } = await supabase.from('teams').select('*');
  if (errMem) return res.status(500).json({ ok: false, message: errMem.message });

  let existingTeam = null;
  let nameAlreadyUsed = false;
  
  for (const t of existingTeams) {
    const members = t.member_name.split(', ').map(n => n.toLowerCase());
    if (members.includes(memberName.toLowerCase())) {
      if (t.team_name.toLowerCase() === teamName.toLowerCase()) {
        // Re-joining their own team
        existingTeam = t;
        nameAlreadyUsed = false;
      } else {
        // Username taken by another team
        nameAlreadyUsed = true;
      }
    }
    if (t.team_name.toLowerCase() === teamName.toLowerCase()) {
      existingTeam = t;
    }
  }

  if (nameAlreadyUsed) {
    return res.status(400).json({ ok: false, message: 'This username is already taken by someone else.' });
  }

  if (existingTeam) {
    const members = existingTeam.member_name.split(', ').map(n => n.toLowerCase());
    if (!members.includes(memberName.toLowerCase())) {
      // Add new member to existing team
      const newMemberName = existingTeam.member_name + ', ' + memberName;
      const { data, error } = await supabase
        .from('teams')
        .update({ member_name: newMemberName })
        .eq('id', existingTeam.id)
        .select()
        .single();
      if (error) return res.status(500).json({ ok: false, message: error.message });
      return res.json({ ok: true, team: { id: data.id, memberName: data.member_name, teamName: data.team_name, score: data.score } });
    } else {
      // Re-joining with same name
      return res.json({ ok: true, team: { id: existingTeam.id, memberName: existingTeam.member_name, teamName: existingTeam.team_name, score: existingTeam.score } });
    }
  } else {
    // Create entirely new team
    const { data, error } = await supabase
      .from('teams')
      .insert([{ member_name: memberName, team_name: teamName }])
      .select()
      .single();

    if (error) return res.status(500).json({ ok: false, message: error.message });
    res.json({ ok: true, team: { id: data.id, memberName: data.member_name, teamName: data.team_name, score: data.score } });
  }
});

app.post('/api/buzz', async (req, res) => {
  const { teamId } = req.body;
  
  // ATOMIC UPDATE: Only update if buzzer_locked is false
  const { data, error } = await supabase
    .from('game_state')
    .update({ 
      buzzer_locked: true, 
      buzzed_team_id: teamId, 
      buzzed_at: new Date().toISOString() 
    })
    .eq('id', 1)
    .eq('buzzer_locked', false)
    .select();

  if (error) {
    return res.status(500).json({ ok: false, message: error.message });
  }

  // If rows updated > 0, this team won the race!
  if (data && data.length > 0) {
    return res.json({ ok: true, buzzed: true });
  } else {
    return res.status(400).json({ ok: false, message: 'Buzzer is locked or someone else won the race' });
  }
});

app.post('/api/admin/state', async (req, res) => {
  const newState = req.body;
  
  const updateData = { flash_type: null, flash_timestamp: null };
  if (newState.buzzerLocked !== undefined) updateData.buzzer_locked = newState.buzzerLocked;
  if (newState.buzzedTeamId === null) {
    updateData.buzzed_team_id = null;
    updateData.buzzed_at = null;
  }
  if (newState.currentQuestionId !== undefined) updateData.current_question_id = newState.currentQuestionId;
  if (newState.currentSlideIndex !== undefined) updateData.current_slide_index = newState.currentSlideIndex;

  const { error } = await supabase
    .from('game_state')
    .update(updateData)
    .eq('id', 1);

  if (error) return res.status(500).json({ ok: false, message: error.message });
  res.json({ ok: true });
});

app.post('/api/admin/flash', async (req, res) => {
  const { type } = req.body; // 'green' or 'red'
  
  const { error } = await supabase
    .from('game_state')
    .update({ 
      flash_type: type, 
      flash_timestamp: Date.now() 
    })
    .eq('id', 1);

  if (error) return res.status(500).json({ ok: false, message: error.message });
  res.json({ ok: true });
});

app.post('/api/admin/score', async (req, res) => {
  const { teamId, amount } = req.body;
  
  // Get current score
  const { data: teamData } = await supabase.from('teams').select('score').eq('id', teamId).single();
  if (teamData) {
    const { error } = await supabase
      .from('teams')
      .update({ score: teamData.score + amount })
      .eq('id', teamId);
    if (error) return res.status(500).json({ ok: false, message: error.message });
  }
  res.json({ ok: true });
});

app.delete('/api/teams/:id', async (req, res) => {
  const { error } = await supabase.from('teams').delete().eq('id', req.params.id);
  if (error) return res.status(500).json({ ok: false, message: error.message });
  res.json({ ok: true });
});

app.post('/api/questions', async (req, res) => {
  const { title, slides } = req.body; 
  const { data, error } = await supabase
    .from('questions')
    .insert([{ title, slides: slides || [] }])
    .select()
    .single();

  if (error) return res.status(500).json({ ok: false, message: error.message });
  res.json({ ok: true, question: data });
});

app.post('/api/reset-data', async (req, res) => {
  // Clear teams and reset game state
  await supabase.from('teams').delete().neq('id', '00000000-0000-0000-0000-000000000000');
  await supabase.from('game_state').update({
    buzzer_locked: true,
    buzzed_team_id: null,
    buzzed_at: null,
    current_question_id: null,
    current_slide_index: 0,
    flash_type: null,
    flash_timestamp: null
  }).eq('id', 1);

  res.json({ ok: true });
});

app.get('/api/initial-state', async (req, res) => {
  // Fetch initial data for clients who just connected
  const [teamsRes, questionsRes, stateRes] = await Promise.all([
    supabase.from('teams').select('*').order('joined_at', { ascending: true }),
    supabase.from('questions').select('*').order('id', { ascending: true }),
    supabase.from('game_state').select('*').eq('id', 1).single()
  ]);

  res.json({
    ok: true,
    teams: teamsRes.data || [],
    questions: questionsRes.data || [],
    state: stateRes.data || {}
  });
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
