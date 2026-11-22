package store

import (
	"context"
	"errors"
	"fmt"

	"github.com/jackc/pgx/v5"
)

// Exchange is one atomic, ledger-backed change to a single character's Gold and items
// (NPC buy/sell, Sell All Trade Loot, crafting fees, enhancement). Idempotent on TxID.
type Exchange struct {
	TxID      string
	CharID    int64
	GoldDelta int64 // may be negative; balance can never go below zero
	Add       []ItemStack
	Remove    []ItemStack
	Reason    string
}

func (s *Store) ApplyExchange(ctx context.Context, x Exchange) error {
	return pgx.BeginFunc(ctx, s.DB, func(tx pgx.Tx) error {
		return applyExchangeTx(ctx, tx, x)
	})
}

func applyExchangeTx(ctx context.Context, tx pgx.Tx, x Exchange) error {
	if err := claim(ctx, tx, x.TxID, "exchange", x.CharID); err != nil {
		return err
	}
	for _, r := range x.Remove {
		if err := consumeTx(ctx, tx, x.TxID, x.CharID, r.TemplateID, r.Quantity, x.Reason); err != nil {
			return err
		}
	}
	if x.GoldDelta != 0 {
		var gold int64
		err := tx.QueryRow(ctx, `update characters set gold = gold + $2, version = version + 1 where id = $1 and gold + $2 >= 0 returning gold`,
			x.CharID, x.GoldDelta).Scan(&gold)
		if errors.Is(err, pgx.ErrNoRows) {
			return fmt.Errorf("%w: not enough gold", ErrInsufficient)
		}
		if err != nil {
			return err
		}
		if _, err := tx.Exec(ctx, `insert into currency_ledgers(tx_id, character_id, delta, balance_after, reason) values ($1,$2,$3,$4,$5)`,
			x.TxID, x.CharID, x.GoldDelta, gold, x.Reason); err != nil {
			return err
		}
	}
	for _, a := range x.Add {
		if err := addItem(ctx, tx, x.TxID, x.CharID, a.TemplateID, a.Quantity, x.Reason); err != nil {
			return err
		}
	}
	return nil
}

// MoveStorage moves qty between inventory and storage (deposit when qty > 0, withdraw when < 0).
func (s *Store) MoveStorage(ctx context.Context, txID string, charID int64, templateID string, qty int) error {
	return pgx.BeginFunc(ctx, s.DB, func(tx pgx.Tx) error {
		if err := claim(ctx, tx, txID, "storage", charID); err != nil {
			return err
		}
		var after int
		if qty > 0 {
			if err := consumeTx(ctx, tx, txID, charID, templateID, qty, "storage-deposit"); err != nil {
				return err
			}
			if err := tx.QueryRow(ctx, `insert into storage_items(character_id, template_id, quantity) values ($1,$2,$3)
				on conflict (character_id, template_id) do update set quantity = storage_items.quantity + excluded.quantity returning quantity`,
				charID, templateID, qty).Scan(&after); err != nil {
				return err
			}
		} else {
			n := -qty
			var have int
			err := tx.QueryRow(ctx, `select quantity from storage_items where character_id = $1 and template_id = $2 for update`, charID, templateID).Scan(&have)
			if errors.Is(err, pgx.ErrNoRows) || (err == nil && have < n) {
				return ErrInsufficient
			}
			if err != nil {
				return err
			}
			after = have - n
			if after == 0 {
				_, err = tx.Exec(ctx, `delete from storage_items where character_id = $1 and template_id = $2`, charID, templateID)
			} else {
				_, err = tx.Exec(ctx, `update storage_items set quantity = $3 where character_id = $1 and template_id = $2`, charID, templateID, after)
			}
			if err != nil {
				return err
			}
			if err := addItem(ctx, tx, txID, charID, templateID, n, "storage-withdraw"); err != nil {
				return err
			}
		}
		_, err := tx.Exec(ctx, `insert into storage_ledger(tx_id, character_id, template_id, delta, qty_after) values ($1,$2,$3,$4,$5)`,
			txID, charID, templateID, qty, after)
		return err
	})
}

func (s *Store) Storage(ctx context.Context, charID int64) ([]ItemStack, error) {
	rows, err := s.DB.Query(ctx, `select template_id, quantity from storage_items where character_id = $1 order by template_id`, charID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var out []ItemStack
	for rows.Next() {
		var it ItemStack
		if err := rows.Scan(&it.TemplateID, &it.Quantity); err != nil {
			return nil, err
		}
		out = append(out, it)
	}
	return out, rows.Err()
}
