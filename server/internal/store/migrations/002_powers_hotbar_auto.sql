-- Phase 3: The Power binding/archive, hotbar layouts, auto settings.
alter table characters add column hotbar jsonb, add column auto_settings jsonb;

-- At most one bound Power per character (LOCKED §2.3): the primary key enforces it.
create table power_bindings (
  character_id  bigint primary key references characters(id),
  power_id      text not null,
  loadout       jsonb not null default '{}'::jsonb,
  bound_at      timestamptz not null default now(),
  tx_id         text not null references transactions(tx_id)
);

-- Power Archive: discovery history + proficiency (restored if the same Power is reacquired).
create table power_archive (
  character_id      bigint not null references characters(id),
  power_id          text not null,
  points            int not null default 0 check (points >= 0),
  times_bound       int not null default 0,
  times_destroyed   int not null default 0,
  first_acquired_at timestamptz not null default now(),
  primary key (character_id, power_id)
);

create table power_events (
  id               bigserial primary key,
  tx_id            text not null references transactions(tx_id),
  character_id     bigint not null references characters(id),
  power_id         text not null,
  event            text not null check (event in ('bind', 'destroy')),
  item_template_id text,
  created_at       timestamptz not null default now()
);
create trigger power_events_append_only before update or delete on power_events for each row execute function forbid_mutation();
