-- Phase 6: live operations, moderation, staff MFA
ALTER TABLE accounts ADD COLUMN IF NOT EXISTS muted_until TIMESTAMPTZ;
ALTER TABLE accounts ADD COLUMN IF NOT EXISTS ban_reason TEXT;
ALTER TABLE accounts ADD COLUMN IF NOT EXISTS totp_secret TEXT;
ALTER TABLE accounts ADD COLUMN IF NOT EXISTS totp_enabled BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE auth_sessions ADD COLUMN IF NOT EXISTS mfa_ok BOOLEAN NOT NULL DEFAULT FALSE;

CREATE TABLE IF NOT EXISTS live_config (
  version SERIAL PRIMARY KEY,
  data JSONB NOT NULL,
  note TEXT,
  created_by UUID REFERENCES accounts(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  active BOOLEAN NOT NULL DEFAULT FALSE
);
CREATE UNIQUE INDEX IF NOT EXISTS live_config_one_active ON live_config (active) WHERE active;
