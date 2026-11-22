-- ASTRA: ECLIPSE CHRONICLES — initial schema
CREATE TABLE IF NOT EXISTS accounts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  username TEXT NOT NULL,
  pass_hash TEXT NOT NULL,
  role TEXT NOT NULL DEFAULT 'player' CHECK (role IN ('player', 'moderator', 'admin')),
  progress JSONB NOT NULL DEFAULT '{}'::jsonb,
  banned BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_login_at TIMESTAMPTZ
);
CREATE UNIQUE INDEX IF NOT EXISTS accounts_username_lower ON accounts (lower(username));

CREATE TABLE IF NOT EXISTS auth_sessions (
  token_hash TEXT PRIMARY KEY,
  account_id UUID NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  expires_at TIMESTAMPTZ NOT NULL,
  ip TEXT
);
CREATE INDEX IF NOT EXISTS auth_sessions_account ON auth_sessions (account_id);

CREATE TABLE IF NOT EXISTS characters (
  id TEXT PRIMARY KEY,
  account_id UUID NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  cls TEXT NOT NULL,
  hardcore BOOLEAN NOT NULL,
  dead BOOLEAN NOT NULL DEFAULT FALSE,
  level INT NOT NULL DEFAULT 1 CHECK (level BETWEEN 1 AND 100),
  data JSONB NOT NULL,
  version INT NOT NULL DEFAULT 1,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  deleted_at TIMESTAMPTZ
);
CREATE UNIQUE INDEX IF NOT EXISTS characters_name_lower ON characters (lower(name)) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS characters_account ON characters (account_id) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS characters_ladder ON characters (hardcore, level DESC) WHERE deleted_at IS NULL;

CREATE TABLE IF NOT EXISTS audit_log (
  id BIGSERIAL PRIMARY KEY,
  at TIMESTAMPTZ NOT NULL DEFAULT now(),
  account_id UUID,
  char_id TEXT,
  action TEXT NOT NULL,
  data JSONB
);
CREATE INDEX IF NOT EXISTS audit_log_account ON audit_log (account_id, at DESC);
CREATE INDEX IF NOT EXISTS audit_log_action ON audit_log (action, at DESC);
