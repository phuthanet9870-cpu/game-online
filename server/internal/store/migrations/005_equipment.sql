-- Phase 4: equipment slots + enhancement (+0..+10, never destroys the item).
alter table item_instances add column enhance int not null default 0 check (enhance between 0 and 10);

-- Equipped templates stay in the inventory row (so they cannot be sold/stored/traded while equipped).
create table equipment (
  character_id bigint not null references characters(id),
  slot         text not null check (slot in ('weapon','helmet','chest','armguard','legs','boots')),
  template_id  text not null,
  primary key (character_id, slot)
);

create table enhance_ledger (
  id           bigserial primary key,
  tx_id        text not null references transactions(tx_id),
  character_id bigint not null references characters(id),
  template_id  text not null,
  level_before int not null,
  level_after  int not null,
  success      boolean not null,
  created_at   timestamptz not null default now()
);
create trigger enhance_ledger_append_only before update or delete on enhance_ledger for each row execute function forbid_mutation();
