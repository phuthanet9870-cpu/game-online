-- Phase 2 foundation schema. Immutable IDs; ledgers/audit are append-only (see triggers).
create table accounts (
  id              bigserial primary key,
  username        text not null,
  username_lower  text not null unique,
  password_hash   text not null,
  role            text not null default 'player'
                  check (role in ('player','helper','moderator','gm','senior_gm','administrator','owner')),
  disabled        boolean not null default false,
  failed_logins   int not null default 0,
  locked_until    timestamptz,
  created_at      timestamptz not null default now()
);

create table sessions (
  id          bigserial primary key,
  token_hash  bytea not null unique,
  account_id  bigint not null references accounts(id) on delete cascade,
  created_at  timestamptz not null default now(),
  expires_at  timestamptz not null,
  revoked_at  timestamptz,
  ip          text,
  user_agent  text
);
create index sessions_account on sessions(account_id);

create table login_history (
  id          bigserial primary key,
  account_id  bigint references accounts(id) on delete set null,
  username    text not null,
  success     boolean not null,
  ip          text,
  user_agent  text,
  at          timestamptz not null default now()
);

create table characters (
  id          bigserial primary key,
  account_id  bigint not null references accounts(id),
  name        text not null,
  name_lower  text not null,
  weapon      text not null check (weapon in ('staff','sword','dagger','bow','grimoire','gauntlet')),
  level       int not null default 1 check (level between 1 and 100),
  xp          bigint not null default 0 check (xp >= 0),
  gold        bigint not null default 0 check (gold >= 0),
  hp          int,
  map_id      text not null default 'DEV-TRAINING-01',
  pos_x       real,
  pos_y       real,
  created_at  timestamptz not null default now(),
  deleted_at  timestamptz,
  version     bigint not null default 0
);
create unique index characters_live_name on characters(name_lower) where deleted_at is null;
create index characters_account on characters(account_id) where deleted_at is null;

-- Idempotency anchor: every economic change carries a unique tx_id; re-applying is a no-op.
create table transactions (
  tx_id         text primary key,
  kind          text not null,
  character_id  bigint references characters(id),
  created_at    timestamptz not null default now()
);

create table item_instances (
  id            bigserial primary key,
  character_id  bigint not null references characters(id),
  template_id   text not null,
  quantity      int not null check (quantity > 0),
  provenance    text not null,
  created_at    timestamptz not null default now(),
  version       bigint not null default 0,
  unique (character_id, template_id)  -- Phase 2: stackables only
);

create table item_ledger (
  id            bigserial primary key,
  tx_id         text not null references transactions(tx_id),
  character_id  bigint not null references characters(id),
  template_id   text not null,
  delta         int not null,
  qty_after     int not null check (qty_after >= 0),
  reason        text not null,
  created_at    timestamptz not null default now()
);

create table currency_ledgers (
  id             bigserial primary key,
  tx_id          text not null references transactions(tx_id),
  character_id   bigint not null references characters(id),
  currency       text not null default 'gold',
  delta          bigint not null,
  balance_after  bigint not null check (balance_after >= 0),
  reason         text not null,
  created_at     timestamptz not null default now()
);

create table xp_ledger (
  id            bigserial primary key,
  tx_id         text not null references transactions(tx_id),
  character_id  bigint not null references characters(id),
  delta         bigint not null,
  xp_after      bigint not null,
  level_after   int not null,
  created_at    timestamptz not null default now()
);

create table gm_audit_log (
  id                  bigserial primary key,
  request_id          text not null,
  actor_account_id    bigint references accounts(id),
  actor_character_id  bigint references characters(id),
  permission          text,
  action              text not null,
  target              text,
  params              jsonb,
  result              text not null check (result in ('ok','denied','error')),
  reason              text,
  created_at          timestamptz not null default now()
);

create function forbid_mutation() returns trigger language plpgsql as $$
begin
  raise exception 'append-only table % cannot be %', tg_table_name, tg_op;
end $$;

create trigger item_ledger_append_only before update or delete on item_ledger for each row execute function forbid_mutation();
create trigger currency_ledgers_append_only before update or delete on currency_ledgers for each row execute function forbid_mutation();
create trigger xp_ledger_append_only before update or delete on xp_ledger for each row execute function forbid_mutation();
create trigger gm_audit_append_only before update or delete on gm_audit_log for each row execute function forbid_mutation();
