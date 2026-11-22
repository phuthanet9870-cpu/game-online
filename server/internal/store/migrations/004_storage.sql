-- Phase 4: personal storage (vault) at the Storage Keeper.
create table storage_items (
  character_id bigint not null references characters(id),
  template_id  text not null,
  quantity     int not null check (quantity > 0),
  primary key (character_id, template_id)
);

create table storage_ledger (
  id            bigserial primary key,
  tx_id         text not null references transactions(tx_id),
  character_id  bigint not null references characters(id),
  template_id   text not null,
  delta         int not null,
  qty_after     int not null check (qty_after >= 0),
  created_at    timestamptz not null default now()
);
create trigger storage_ledger_append_only before update or delete on storage_ledger for each row execute function forbid_mutation();
