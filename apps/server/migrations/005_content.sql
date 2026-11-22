-- Live content tuning patches (versioned, one active)
CREATE TABLE IF NOT EXISTS content_patch (
  version SERIAL PRIMARY KEY,
  data JSONB NOT NULL,
  note TEXT,
  created_by UUID REFERENCES accounts(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  active BOOLEAN NOT NULL DEFAULT FALSE
);
CREATE UNIQUE INDEX IF NOT EXISTS content_patch_one_active ON content_patch (active) WHERE active;
