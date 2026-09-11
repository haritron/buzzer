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
    team_id UUID NOT NULL REFERENCES teams(id) ON DELETE CASCADE,
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
    question_id UUID NOT NULL REFERENCES questions(id) ON DELETE CASCADE,
    slide_order INTEGER NOT NULL,
    background TEXT,
    transition TEXT,
    UNIQUE(question_id, slide_order)
);

-- 5. SLIDE ELEMENTS (The Canvas Elements)
CREATE TABLE slide_elements (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    slide_id UUID NOT NULL REFERENCES slides(id) ON DELETE CASCADE,
    element_type TEXT NOT NULL,
    content TEXT NOT NULL,
    element_order INTEGER NOT NULL DEFAULT 0,
    properties JSONB DEFAULT '{}'::jsonb
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

-- Insert initial game state
INSERT INTO game_state (id, buzzer_locked) VALUES (1, true);

-- Enable Realtime
ALTER PUBLICATION supabase_realtime ADD TABLE teams;
ALTER PUBLICATION supabase_realtime ADD TABLE team_members;
ALTER PUBLICATION supabase_realtime ADD TABLE game_state;
ALTER PUBLICATION supabase_realtime ADD TABLE questions;
ALTER PUBLICATION supabase_realtime ADD TABLE slides;
ALTER PUBLICATION supabase_realtime ADD TABLE slide_elements;

-- Enable Row Level Security (RLS)
ALTER TABLE teams ENABLE ROW LEVEL SECURITY;
ALTER TABLE team_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE game_state ENABLE ROW LEVEL SECURITY;
ALTER TABLE questions ENABLE ROW LEVEL SECURITY;
ALTER TABLE slides ENABLE ROW LEVEL SECURITY;
ALTER TABLE slide_elements ENABLE ROW LEVEL SECURITY;

-- Allow anonymous access to teams
CREATE POLICY "Allow public select on teams" ON teams FOR SELECT USING (true);
CREATE POLICY "Allow public insert on teams" ON teams FOR INSERT WITH CHECK (true);
CREATE POLICY "Allow public update on teams" ON teams FOR UPDATE USING (true);
CREATE POLICY "Allow public delete on teams" ON teams FOR DELETE USING (true);

-- Allow anonymous access to team_members
CREATE POLICY "Allow public select on team_members" ON team_members FOR SELECT USING (true);
CREATE POLICY "Allow public insert on team_members" ON team_members FOR INSERT WITH CHECK (true);
CREATE POLICY "Allow public update on team_members" ON team_members FOR UPDATE USING (true);
CREATE POLICY "Allow public delete on team_members" ON team_members FOR DELETE USING (true);

-- Allow anonymous access to game_state
CREATE POLICY "Allow public select on game_state" ON game_state FOR SELECT USING (true);
CREATE POLICY "Allow public update on game_state" ON game_state FOR UPDATE USING (true);

-- Allow anonymous access to questions
CREATE POLICY "Allow public select on questions" ON questions FOR SELECT USING (true);
CREATE POLICY "Allow public insert on questions" ON questions FOR INSERT WITH CHECK (true);
CREATE POLICY "Allow public update on questions" ON questions FOR UPDATE USING (true);
CREATE POLICY "Allow public delete on questions" ON questions FOR DELETE USING (true);

-- Allow anonymous access to slides
CREATE POLICY "Allow public select on slides" ON slides FOR SELECT USING (true);
CREATE POLICY "Allow public insert on slides" ON slides FOR INSERT WITH CHECK (true);
CREATE POLICY "Allow public update on slides" ON slides FOR UPDATE USING (true);
CREATE POLICY "Allow public delete on slides" ON slides FOR DELETE USING (true);

-- Allow anonymous access to slide_elements
CREATE POLICY "Allow public select on slide_elements" ON slide_elements FOR SELECT USING (true);
CREATE POLICY "Allow public insert on slide_elements" ON slide_elements FOR INSERT WITH CHECK (true);
CREATE POLICY "Allow public update on slide_elements" ON slide_elements FOR UPDATE USING (true);
CREATE POLICY "Allow public delete on slide_elements" ON slide_elements FOR DELETE USING (true);

-- 7. LINKUP ROUNDS (New game mode)
DROP TABLE IF EXISTS linkup_rounds CASCADE;
CREATE TABLE linkup_rounds (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    round_name TEXT NOT NULL,
    batch_name TEXT NOT NULL,
    slide_type TEXT DEFAULT 'connection',
    theme TEXT DEFAULT 'ocean',
    question TEXT,
    answer TEXT,
    reveal_mode TEXT DEFAULT 'all',
    images JSONB DEFAULT '[]'::jsonb,
    answer_image TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    order_index INTEGER DEFAULT 0
);

-- ADD TO GAME STATE
ALTER TABLE game_state ADD COLUMN active_linkup_round_id UUID REFERENCES linkup_rounds(id) ON DELETE SET NULL;
ALTER TABLE game_state ADD COLUMN linkup_revealed BOOLEAN DEFAULT false;
ALTER TABLE game_state ADD COLUMN linkup_clue_index INTEGER DEFAULT 0;

-- REALTIME & RLS
ALTER PUBLICATION supabase_realtime ADD TABLE linkup_rounds;

ALTER TABLE linkup_rounds ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Allow public select on linkup_rounds" ON linkup_rounds FOR SELECT USING (true);
CREATE POLICY "Allow public insert on linkup_rounds" ON linkup_rounds FOR INSERT WITH CHECK (true);
CREATE POLICY "Allow public update on linkup_rounds" ON linkup_rounds FOR UPDATE USING (true);
CREATE POLICY "Allow public delete on linkup_rounds" ON linkup_rounds FOR DELETE USING (true);
