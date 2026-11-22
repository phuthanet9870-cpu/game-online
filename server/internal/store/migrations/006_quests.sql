-- Phase 4: quest progress (server counts objectives; rewards go through the ledgers).
create table quest_progress (
  character_id bigint not null references characters(id),
  quest_id     text not null,
  status       text not null check (status in ('active', 'completed')),
  counters     jsonb not null default '[]'::jsonb,
  repeat_count int not null default 0,
  updated_at   timestamptz not null default now(),
  primary key (character_id, quest_id)
);
