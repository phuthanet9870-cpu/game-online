-- Phase 5: leaderboards (best value per character per board)
CREATE TABLE IF NOT EXISTS leaderboard (
  board TEXT NOT NULL,
  char_id TEXT NOT NULL REFERENCES characters(id),
  name TEXT NOT NULL,
  cls TEXT NOT NULL,
  hardcore BOOLEAN NOT NULL,
  value BIGINT NOT NULL,
  achieved_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (board, char_id)
);
CREATE INDEX IF NOT EXISTS leaderboard_rank ON leaderboard (board, hardcore, value DESC);
