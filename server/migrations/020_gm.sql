-- GM system (server/src/gm.ts): accounts that unlocked the GM menu, and the moderation state GMs set.
ALTER TABLE accounts
  ADD COLUMN gm           boolean NOT NULL DEFAULT false,
  ADD COLUMN banned_until timestamptz,
  ADD COLUMN muted_until  timestamptz;
