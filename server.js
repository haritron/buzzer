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
  
  if (!memberName || !teamName) return res.status(400).json({ ok: false, message: 'Name and Team required' });

  // 1. Find or create the team
  let team;
  const { data: existingTeam, error: teamErr } = await supabase.from('teams').select('*').eq('team_name', teamName).single();
  
  if (existingTeam) {
    team = existingTeam;
  } else {
    const { data: newTeam, error: newTeamErr } = await supabase.from('teams').insert([{ team_name: teamName }]).select().single();
    if (newTeamErr) return res.status(500).json({ ok: false, message: newTeamErr.message });
    team = newTeam;
  }

  // 2. Insert member into team_members
  const { error: memberErr } = await supabase.from('team_members').insert([{ team_id: team.id, member_name: memberName }]);
  if (memberErr) return res.status(500).json({ ok: false, message: memberErr.message });

  res.json({ ok: true, team: { id: team.id, teamName: team.team_name, score: team.score, assignedRound: team.assigned_round, assignedBatch: team.assigned_batch } });
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
  if (newState.buzzerLocked !== undefined) {
    updateData.buzzer_locked = newState.buzzerLocked;
    if (newState.buzzerLocked === false) {
      updateData.buzzer_unlocked_at = Date.now();
    }
  }
  if (newState.buzzedTeamId === null) {
    updateData.buzzed_team_id = null;
    updateData.buzzed_at = null;
  }
  if (newState.currentQuestionId !== undefined) updateData.current_question_id = newState.currentQuestionId;
  if (newState.currentSlideIndex !== undefined) updateData.current_slide_index = newState.currentSlideIndex;
  
  if (newState.activeRound !== undefined) updateData.active_round = newState.activeRound;
  if (newState.activeBatch !== undefined) updateData.active_batch = newState.activeBatch;
  if (newState.tournamentConfig !== undefined) updateData.tournament_config = newState.tournamentConfig;
  
  if (newState.activeLinkupRoundId !== undefined) updateData.active_linkup_round_id = newState.activeLinkupRoundId;
  if (newState.linkupRevealed !== undefined) updateData.linkup_revealed = newState.linkupRevealed;
  if (newState.linkupClueIndex !== undefined) updateData.linkup_clue_index = newState.linkupClueIndex;

  const { error } = await supabase
    .from('game_state')
    .update(updateData)
    .eq('id', 1);

  if (error) return res.status(500).json({ ok: false, message: error.message });
  res.json({ ok: true });
});

app.post('/api/admin/flash', async (req, res) => {
  const { type } = req.body; // 'green' or 'red'
  
  const { data: state, error: errState } = await supabase.from('game_state').select('*').eq('id', 1).single();
  if (errState) return res.status(500).json({ ok: false, message: errState.message });

  // Auto-score logic based on rules
  if (state.buzzed_team_id) {
    const config = state.tournament_config || {};
    const rounds = config.rounds || [];
    const activeRoundCfg = rounds.find(r => r.roundNumber === state.active_round) || {
      pointsSetting: { positiveBase: 10, negativeBase: -10, timeBasedDecay: false, maxTimeBonus: 0 }
    };
    
    let scoreChange = 0;
    const rules = activeRoundCfg.pointsSetting || { positiveBase: 10, negativeBase: -10, timeBasedDecay: false, maxTimeBonus: 0 };

    if (type === 'green') {
      scoreChange = parseInt(rules.positiveBase) || 0;
      if (rules.timeBasedDecay && state.buzzer_unlocked_at && state.buzzed_at) {
        const timeTakenMs = new Date(state.buzzed_at).getTime() - parseInt(state.buzzer_unlocked_at);
        const maxBonus = parseInt(rules.maxTimeBonus) || 0;
        let bonus = Math.floor(maxBonus * (1 - (timeTakenMs / 10000)));
        if (bonus < 0) bonus = 0;
        if (bonus > maxBonus) bonus = maxBonus;
        scoreChange += bonus;
      }
    } else if (type === 'red') {
      scoreChange = parseInt(rules.negativeBase) || 0;
    }

    if (scoreChange !== 0) {
      const { data: teamData } = await supabase.from('teams').select('score').eq('id', state.buzzed_team_id).single();
      if (teamData) {
        await supabase.from('teams').update({ score: teamData.score + scoreChange }).eq('id', state.buzzed_team_id);
      }
    }
  }

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

app.post('/api/admin/team-assign', async (req, res) => {
  const { teamId, assignedRound, assignedBatch } = req.body;
  const { error } = await supabase.from('teams')
    .update({ assigned_round: assignedRound, assigned_batch: assignedBatch })
    .eq('id', teamId);
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
  const { title } = req.body;
  const { data, error } = await supabase.from('questions').insert([{ title }]).select().single();
  if (error) return res.status(500).json({ ok: false, message: error.message });
  res.json({ ok: true, question: data });
});

app.post('/api/slides', async (req, res) => {
  const { questionId, slideOrder, background, transition } = req.body;
  const { data, error } = await supabase.from('slides').insert([{ 
    question_id: questionId, slide_order: slideOrder, background, transition 
  }]).select().single();
  if (error) return res.status(500).json({ ok: false, message: error.message });
  res.json({ ok: true, slide: data });
});

app.post('/api/slide-elements', async (req, res) => {
  const { slideId, elementType, content, properties, order } = req.body;
  const { data, error } = await supabase.from('slide_elements').insert([{
    slide_id: slideId, element_type: elementType, content, properties: properties || {}, element_order: order
  }]).select().single();
  if (error) return res.status(500).json({ ok: false, message: error.message });
  res.json({ ok: true, element: data });
});

app.post('/api/slide-elements/clear', async (req, res) => {
  const { slideId } = req.body;
  const { error } = await supabase.from('slide_elements').delete().eq('slide_id', slideId);
  if (error) return res.status(500).json({ ok: false, message: error.message });
  res.json({ ok: true });
});

app.post('/api/delete-question', async (req, res) => {
  const { id } = req.body;
  await supabase.from('questions').delete().eq('id', id);
  res.json({ ok: true });
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
    flash_timestamp: null,
    active_round: 1,
    active_batch: 1,
    active_linkup_round_id: null,
    linkup_revealed: false,
    linkup_clue_index: 0
  }).eq('id', 1);

  res.json({ ok: true });
});

app.post('/api/linkup/rounds', async (req, res) => {
  const { id, round_name, batch_name, slide_type, theme, question, answer, reveal_mode, images, answer_image, order_index } = req.body;
  let result;
  if (id) {
    result = await supabase.from('linkup_rounds').update({
      round_name, batch_name, slide_type, theme, question, answer, reveal_mode, images, answer_image, order_index
    }).eq('id', id).select().single();
  } else {
    result = await supabase.from('linkup_rounds').insert([{
      round_name, batch_name, slide_type, theme, question, answer, reveal_mode, images, answer_image, order_index
    }]).select().single();
  }
  if (result.error) return res.status(500).json({ ok: false, message: result.error.message });
  res.json({ ok: true, round: result.data });
});

app.post('/api/linkup/rounds/delete', async (req, res) => {
  const { id } = req.body;
  const { error } = await supabase.from('linkup_rounds').delete().eq('id', id);
  if (error) return res.status(500).json({ ok: false, message: error.message });
  res.json({ ok: true });
});

app.get('/api/initial-state', async (req, res) => {
  // Fetch initial data for clients who just connected
  const [teamsRes, membersRes, questionsRes, slidesRes, elementsRes, stateRes, linkupRes] = await Promise.all([
    supabase.from('teams').select('*').order('joined_at', { ascending: true }),
    supabase.from('team_members').select('*'),
    supabase.from('questions').select('*').order('id', { ascending: true }),
    supabase.from('slides').select('*').order('slide_order', { ascending: true }),
    supabase.from('slide_elements').select('*').order('element_order', { ascending: true }),
    supabase.from('game_state').select('*').eq('id', 1).single(),
    supabase.from('linkup_rounds').select('*').order('order_index', { ascending: true })
  ]);

  res.json({
    ok: true,
    teams: teamsRes.data || [],
    teamMembers: membersRes.data || [],
    questions: questionsRes.data || [],
    slides: slidesRes.data || [],
    slideElements: elementsRes.data || [],
    linkupRounds: linkupRes.data || [],
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
