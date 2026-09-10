-- Drop existing tables
DROP TABLE IF EXISTS team_members CASCADE;
DROP TABLE IF EXISTS teams CASCADE;
DROP TABLE IF EXISTS slide_elements CASCADE;
DROP TABLE IF EXISTS slides CASCADE;
DROP TABLE IF EXISTS questions CASCADE;
DROP TABLE IF EXISTS game_state CASCADE;

-- 1. TEAMS
CREATE TABLE teams (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    team_name TEXT NOT NULL UNIQUE,
    score INTEGER DEFAULT 0,
    joined_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    assigned_round INTEGER DEFAULT 1,
    assigned_batch INTEGER DEFAULT 1
);

-- 2. TEAM MEMBERS (Many-to-One)
CREATE TABLE team_members (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    team_id UUID REFERENCES teams(id) ON DELETE CASCADE,
    member_name TEXT NOT NULL
);

-- 3. QUESTIONS
CREATE TABLE questions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    title TEXT NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 4. SLIDES
CREATE TABLE slides (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    question_id UUID REFERENCES questions(id) ON DELETE CASCADE,
    slide_order INTEGER NOT NULL,
    background TEXT,
    transition TEXT
);

-- 5. SLIDE ELEMENTS (The Canvas Elements)
CREATE TABLE slide_elements (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    slide_id UUID REFERENCES slides(id) ON DELETE CASCADE,
    element_type TEXT NOT NULL, -- 'text', 'image', 'audio', 'video'
    content TEXT NOT NULL, -- Text string or Supabase Storage URL
    position_x INTEGER DEFAULT 0,
    position_y INTEGER DEFAULT 0,
    size_width INTEGER,
    size_height INTEGER,
    animation TEXT,
    element_order INTEGER DEFAULT 0
);

-- 6. GAME STATE
CREATE TABLE game_state (
    id INTEGER PRIMARY KEY CHECK (id = 1),
    buzzer_locked BOOLEAN DEFAULT true,
    buzzed_team_id UUID REFERENCES teams(id) ON DELETE SET NULL,
    buzzed_at TIMESTAMP WITH TIME ZONE,
    current_question_id UUID REFERENCES questions(id) ON DELETE SET NULL,
    current_slide_id UUID REFERENCES slides(id) ON DELETE SET NULL,
    flash_type TEXT, 
    flash_timestamp BIGINT,
    tournament_config JSONB DEFAULT '{}'::jsonb,
    active_round INTEGER DEFAULT 1,
    active_batch INTEGER DEFAULT 1,
    buzzer_unlocked_at BIGINT
);

INSERT INTO game_state (id, buzzer_locked) VALUES (1, true);

-- Enable Realtime
ALTER PUBLICATION supabase_realtime ADD TABLE teams;
ALTER PUBLICATION supabase_realtime ADD TABLE team_members;
ALTER PUBLICATION supabase_realtime ADD TABLE game_state;
ALTER PUBLICATION supabase_realtime ADD TABLE questions;
ALTER PUBLICATION supabase_realtime ADD TABLE slides;
ALTER PUBLICATION supabase_realtime ADD TABLE slide_elements;
