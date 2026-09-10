-- Drop existing tables if re-running
DROP TABLE IF EXISTS teams;
DROP TABLE IF EXISTS questions;
DROP TABLE IF EXISTS game_state;

-- Create Teams table
CREATE TABLE teams (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    member_name TEXT NOT NULL,
    team_name TEXT NOT NULL,
    score INTEGER DEFAULT 0,
    joined_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create Questions table
CREATE TABLE questions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    title TEXT NOT NULL,
    slides JSONB NOT NULL DEFAULT '[]'::jsonb
);

-- Create Game State table (Singleton)
CREATE TABLE game_state (
    id INTEGER PRIMARY KEY CHECK (id = 1),
    buzzer_locked BOOLEAN DEFAULT true,
    buzzed_team_id UUID REFERENCES teams(id) ON DELETE SET NULL,
    buzzed_at TIMESTAMP WITH TIME ZONE,
    current_question_id UUID REFERENCES questions(id) ON DELETE SET NULL,
    current_slide_index INTEGER DEFAULT 0,
    flash_type TEXT, -- 'green' or 'red'
    flash_timestamp BIGINT
);

-- Insert the default singleton row for game_state
INSERT INTO game_state (id, buzzer_locked, current_slide_index) VALUES (1, true, 0);

-- Enable Realtime for all tables
ALTER PUBLICATION supabase_realtime ADD TABLE teams;
ALTER PUBLICATION supabase_realtime ADD TABLE questions;
ALTER PUBLICATION supabase_realtime ADD TABLE game_state;
