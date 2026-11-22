package store

import (
	"context"
	"errors"

	"github.com/jackc/pgx/v5"
)

// Equipment returns slot -> template id.
func (s *Store) Equipment(ctx context.Context, charID int64) (map[string]string, error) {
	rows, err := s.DB.Query(ctx, `select slot, template_id from equipment where character_id = $1`, charID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	out := map[string]string{}
	for rows.Next() {
		var slot, id string
		if err := rows.Scan(&slot, &id); err != nil {
			return nil, err
		}
		out[slot] = id
	}
	return out, rows.Err()
}

// EnhanceLevels returns template id -> enhancement level for items above +0.
func (s *Store) EnhanceLevels(ctx context.Context, charID int64) (map[string]int, error) {
	rows, err := s.DB.Query(ctx, `select template_id, enhance from item_instances where character_id = $1 and enhance > 0`, charID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	out := map[string]int{}
	for rows.Next() {
		var id string
		var lvl int
		if err := rows.Scan(&id, &lvl); err != nil {
			return nil, err
		}
		out[id] = lvl
	}
	return out, rows.Err()
}

// SetEquipment equips (templateID != "") or clears a slot. The item must be in the inventory.
func (s *Store) SetEquipment(ctx context.Context, charID int64, slot, templateID string) error {
	if templateID == "" {
		_, err := s.DB.Exec(ctx, `delete from equipment where character_id = $1 and slot = $2`, charID, slot)
		return err
	}
	_, err := s.DB.Exec(ctx, `insert into equipment(character_id, slot, template_id)
		select $1, $2, $3 where exists (select 1 from item_instances where character_id = $1 and template_id = $3)
		on conflict (character_id, slot) do update set template_id = excluded.template_id`, charID, slot, templateID)
	return err
}

// Enhance atomically pays the cost and (on success) raises the item's level. Failure keeps the item.
func (s *Store) Enhance(ctx context.Context, txID string, charID int64, templateID string, gold int64, stones []ItemStack, success bool) error {
	return pgx.BeginFunc(ctx, s.DB, func(tx pgx.Tx) error {
		if err := applyExchangeTx(ctx, tx, Exchange{TxID: txID, CharID: charID, GoldDelta: -gold, Remove: stones, Reason: "enhance"}); err != nil {
			return err
		}
		var before int
		err := tx.QueryRow(ctx, `select enhance from item_instances where character_id = $1 and template_id = $2 for update`, charID, templateID).Scan(&before)
		if errors.Is(err, pgx.ErrNoRows) {
			return ErrNotFound
		}
		if err != nil {
			return err
		}
		after := before
		if success && before < 10 {
			after = before + 1
			if _, err := tx.Exec(ctx, `update item_instances set enhance = $3, version = version + 1 where character_id = $1 and template_id = $2`, charID, templateID, after); err != nil {
				return err
			}
		}
		_, err = tx.Exec(ctx, `insert into enhance_ledger(tx_id, character_id, template_id, level_before, level_after, success) values ($1,$2,$3,$4,$5,$6)`,
			txID, charID, templateID, before, after, success)
		return err
	})
}
