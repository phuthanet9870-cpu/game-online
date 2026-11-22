-- Phase 4: guilds and auction house
CREATE TABLE IF NOT EXISTS guilds (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  tag TEXT NOT NULL,
  hardcore BOOLEAN NOT NULL DEFAULT FALSE,
  data JSONB NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS guilds_name_lower ON guilds (lower(name));
CREATE UNIQUE INDEX IF NOT EXISTS guilds_tag ON guilds (tag);

CREATE TABLE IF NOT EXISTS auction_listings (
  id TEXT PRIMARY KEY,
  seller_char TEXT NOT NULL REFERENCES characters(id),
  seller_account UUID NOT NULL REFERENCES accounts(id),
  item_uid TEXT NOT NULL,
  price BIGINT NOT NULL CHECK (price > 0),
  hardcore BOOLEAN NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('active', 'sold', 'expired', 'closed')),
  data JSONB NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  expires_at TIMESTAMPTZ NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS auction_open ON auction_listings (status, hardcore, price) WHERE status <> 'closed';
CREATE INDEX IF NOT EXISTS auction_seller ON auction_listings (seller_char) WHERE status <> 'closed';
-- An item can be escrowed by at most one open listing (duplication guard at the database level)
CREATE UNIQUE INDEX IF NOT EXISTS auction_item_open ON auction_listings (item_uid) WHERE status = 'active';
