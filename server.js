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
app.use(express.static(path.join(__dirname, 'public'), {
    setHeaders: (res, path) => {
        if (path.endsWith('.html')) {
            res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
            res.setHeader('Pragma', 'no-cache');
            res.setHeader('Expires', '0');
        }
    }
}));

// Admin credentials (should also be env vars in production)
async function requireRoom(req, res, next) {
  const roomCode = req.headers['x-room-code'] || req.body.roomCode || req.query.room;
  if (!roomCode) return res.status(401).json({ ok: false, message: 'Missing room credentials' });
  const { data: room, error } = await supabase.from('rooms').select('id').eq('room_code', roomCode).single();
  if (error || !room) return res.status(404).json({ ok: false, message: 'Room not found' });
  req.roomId = room.id;
  next();
}

// Middleware to authenticate room admin
async function requireAdmin(req, res, next) {
  const roomCode = req.headers['x-room-code'] || req.body.roomCode || req.query.room;
  const adminId = req.headers['x-admin-id'] || req.body.adminId;
  
  if (!roomCode || !adminId) return res.status(401).json({ ok: false, message: 'Missing room or admin credentials' });
  
  const { data: room, error } = await supabase.from('rooms').select('id, admin_id').eq('room_code', roomCode).single();
  
  if (error || !room || room.admin_id !== adminId) {
    return res.status(401).json({ ok: false, message: 'Unauthorized: You are not the admin of this room.' });
  }
  
  req.roomId = room.id;
  next();
}

// Middleware to authenticate any valid admin (globally)
async function requireGlobalAdmin(req, res, next) {
  const adminId = req.headers['x-admin-id'] || req.body.adminId;
  if (!adminId) return res.status(401).json({ ok: false, message: 'Missing admin credentials' });
  
  // Basic UUID format validation to prevent bad data
  const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
  if (!uuidRegex.test(adminId)) {
    return res.status(401).json({ ok: false, message: 'Unauthorized: Invalid admin format.' });
  }
  
  req.adminId = adminId;
  next();
}

app.post('/api/admin/login', async (req, res) => {
  const { username, password } = req.body || {};
  if (!username || !password) return res.status(400).json({ ok: false, message: 'Missing credentials' });

  // Call the secure RPC function to verify admin
  const { data: adminId, error } = await supabase.rpc('verify_admin', { p_username: username, p_password: password });
  
  if (error || !adminId) {
    return res.status(401).json({ ok: false, message: 'Invalid admin credentials' });
  }
  
  return res.json({ ok: true, adminId, username });
});

app.post('/api/rooms/create', requireGlobalAdmin, async (req, res) => {
  const { adminId } = req.body;
  if (!adminId) return res.status(400).json({ ok: false, message: 'Admin ID required' });

  let roomCode = '';
  let roomCreated = false;
  let roomId = null;

  // Try generating a unique 6-character code
  for (let i = 0; i < 5; i++) {
    roomCode = Math.random().toString(36).substring(2, 8).toUpperCase();
    const { data: existing } = await supabase.from('rooms').select('id').eq('room_code', roomCode).single();
    if (!existing) {
      const { data: newRoom, error } = await supabase.from('rooms').insert([{ 
        admin_id: adminId, 
        room_code: roomCode, 
        status: 'ACTIVE' 
      }]).select('id').single();
      
      if (!error && newRoom) {
        roomId = newRoom.id;
        roomCreated = true;
        break;
      } else {
        console.error("Room creation error/no room returned. Error:", error, "newRoom:", newRoom);
        if (error && error.code === '23503') {
           // Foreign key violation on admin_id
           return res.status(401).json({ ok: false, message: 'Your admin session is invalid (ID not found in database). Please log out and log in again.' });
        }
      }
    } else {
        console.error("Room already exists? existing:", existing);
    }
  }

  if (!roomCreated) return res.status(500).json({ ok: false, message: 'Failed to generate unique room code' });

  // Initialize game state
  await supabase.from('game_state').insert([{ room_id: roomId, buzzer_locked: true }]);

  res.json({ ok: true, roomCode });
});

app.post('/api/teams/join', async (req, res) => {
  const { memberName, teamName, roomCode, additionalMembers } = req.body;
  if (!memberName || !teamName || !roomCode) return res.status(400).json({ ok: false, message: 'Name, Team, and Room Code required' });

  // Find room and check status
  const { data: room } = await supabase.from('rooms').select('id, status').eq('room_code', roomCode).single();
  if (!room) return res.status(404).json({ ok: false, message: 'Room not found' });
  if (room.status !== 'ACTIVE' && room.status !== 'WAITING') return res.status(403).json({ ok: false, message: 'This room is closed or ended' });

  const roomId = room.id;

  let team;
  const { data: existingTeam } = await supabase.from('teams').select('*').eq('team_name', teamName).eq('room_id', roomId).single();
  if (existingTeam) team = existingTeam;
  else {
    const { data: newTeam, error: teamErr } = await supabase.from('teams').insert([{ room_id: roomId, team_name: teamName, score: 0 }]).select().single();
    if (teamErr) return res.status(500).json({ ok: false, message: teamErr.message });
    team = newTeam;
  }

  const { data: member, error: memberErr } = await supabase.from('team_members').insert([{ team_id: team.id, member_name: memberName }]).select().single();
  if (memberErr) return res.status(500).json({ ok: false, message: memberErr.message });

  if (additionalMembers && Array.isArray(additionalMembers)) {
    const validMembers = additionalMembers.filter(m => typeof m === 'string' && m.trim().length > 0);
    if (validMembers.length > 0) {
      const inserts = validMembers.map(m => ({ team_id: team.id, member_name: m.trim() }));
      await supabase.from('team_members').insert(inserts);
    }
  }

  res.json({ ok: true, teamId: team.id, memberId: member.id, roomId });
});



app.post('/api/buzz', requireRoom, async (req, res) => {
  const { teamId } = req.body;
  
  // ATOMIC UPDATE: Only update if buzzer_locked is false
  const { data, error } = await supabase
    .from('game_state')
    .update({ 
      buzzer_locked: true, 
      buzzed_team_id: teamId, 
      buzzed_at: new Date().toISOString() 
    })
    .eq('room_id', req.roomId)
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

app.post('/api/admin/state', requireAdmin, async (req, res) => {
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
  
  if (newState.showLeaderboard !== undefined) updateData.show_leaderboard = newState.showLeaderboard;

  const { error } = await supabase
    .from('game_state')
    .update(updateData)
    .eq('room_id', req.roomId);

  if (error) return res.status(500).json({ ok: false, message: error.message });
  res.json({ ok: true });
});

app.post('/api/admin/flash', requireAdmin, async (req, res) => {
  const { type } = req.body; // 'green' or 'red'
  
  const { data: state, error: errState } = await supabase.from('game_state').select('*').eq('room_id', req.roomId).single();
  if (errState) return res.status(500).json({ ok: false, message: errState.message });

  // Auto-score logic based on rules
  if (state.buzzed_team_id) {
    const config = state.tournament_config || {};
    const rounds = config.rounds || [];
    const activeRoundCfg = rounds.find(r => r.roundNumber === state.active_round) || {
      pointsSetting: { positiveBase: 2, negativeBase: 0, timeBasedDecay: false, maxTimeBonus: 0 }
    };
    
    let scoreChange = 0;
    const rules = activeRoundCfg.pointsSetting || { positiveBase: 2, negativeBase: 0, timeBasedDecay: false, maxTimeBonus: 0 };

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
    .eq('room_id', req.roomId);

  if (error) return res.status(500).json({ ok: false, message: error.message });
  res.json({ ok: true });
});

app.post('/api/admin/team-assign', requireAdmin, async (req, res) => {
  const { teamId, assignedRound, assignedBatch } = req.body;
  const { error } = await supabase.from('teams')
    .update({ assigned_round: assignedRound, assigned_batch: assignedBatch })
    .eq('id', teamId);
  if (error) return res.status(500).json({ ok: false, message: error.message });
  res.json({ ok: true });
});

app.post('/api/admin/score', requireAdmin, async (req, res) => {
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

app.post('/api/admin/get-upload-url', requireGlobalAdmin, async (req, res) => {
  const { path } = req.body;
  if (!path) return res.status(400).json({ ok: false, message: 'Path required' });
  
  // Use service role key to generate a signed upload URL
  const { data, error } = await supabase.storage.from('linkup_images').createSignedUploadUrl(path);
  if (error) return res.status(500).json({ ok: false, message: error.message });
  
  res.json({ ok: true, path: data.path, token: data.token });
});

app.post('/api/admin/delete-images', requireGlobalAdmin, async (req, res) => {
  const { paths } = req.body;
  if (!paths || !paths.length) return res.status(400).json({ ok: false, message: 'Paths required' });
  
  const { data, error } = await supabase.storage.from('linkup_images').remove(paths);
  if (error) return res.status(500).json({ ok: false, message: error.message });
  
  res.json({ ok: true });
});

app.post('/api/reset-data', async (req, res) => {
  // Clear teams and reset game state
  await supabase.from('teams').delete().neq('id', '00000000-0000-0000-0000-000000000000');
  await supabase.from('game_state').update({
    buzzer_locked: true,
    buzzed_team_id: null,
    buzzed_at: null,
    flash_type: null,
    flash_timestamp: null,
    active_linkup_round_id: null,
    linkup_revealed: false,
    linkup_clue_index: 0
  }).eq('room_id', req.roomId);

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
  const roomCode = req.query.room;
  if (!roomCode) return res.status(400).json({ ok: false, message: 'Room code required' });
  const { data: room } = await supabase.from('rooms').select('id').eq('room_code', roomCode).single();
  if (!room) return res.status(404).json({ ok: false, message: 'Room not found' });
  req.roomId = room.id;

  // Fetch initial data for clients who just connected
  const [
    { data: teams },
    { data: state },
    { data: linkupRounds }
  ] = await Promise.all([
    supabase.from('teams').select('*, team_members(member_name)').eq('room_id', req.roomId).order('joined_at', { ascending: true }),
    supabase.from('game_state').select('*').eq('room_id', req.roomId).single(),
    supabase.from('linkup_rounds').select('*').order('order_index', { ascending: true })
  ]);

  // Map the member name from the joined table
  const mappedTeams = (teams || []).map(t => {
    return {
      ...t,
      member_name: t.team_members && t.team_members.length > 0 ? t.team_members[0].member_name : 'Unknown'
    };
  });

  let gameState = state;
  if (!gameState) {
    const { data: newState } = await supabase.from('game_state').insert([{ room_id: req.roomId, buzzer_locked: true }]).select().single();
    gameState = newState || { buzzer_locked: true };
  }

  res.json({
    ok: true,
    teams: mappedTeams,
    linkupRounds: linkupRounds || [],
    state: gameState
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
