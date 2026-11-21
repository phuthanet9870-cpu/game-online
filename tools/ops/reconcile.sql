-- Economy reconciliation: balances must equal the sum of their append-only ledgers.
-- psql "$DATABASE_URL" -f tools/ops/reconcile.sql   (all counts must be 0)
select
  (select count(*) from characters c
     where c.gold <> coalesce((select sum(delta) from currency_ledgers l where l.character_id = c.id), 0)) as gold_mismatch,
  (select count(*) from characters c
     where c.xp <> coalesce((select sum(delta) from xp_ledger l where l.character_id = c.id), 0)) as xp_mismatch,
  (select count(*) from item_instances i
     where i.quantity <> (select coalesce(sum(delta), 0) from item_ledger l
                          where l.character_id = i.character_id and l.template_id = i.template_id)) as item_mismatch,
  (select count(*) from (select character_id, template_id from item_ledger group by 1, 2
     having sum(delta) <> 0 and not exists (select 1 from item_instances i
       where i.character_id = item_ledger.character_id and i.template_id = item_ledger.template_id)) x) as orphan_ledger;
