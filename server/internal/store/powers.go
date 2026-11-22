package store

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"

	"github.com/jackc/pgx/v5"
)

type PowerBinding struct {
	PowerID string
	Loadout json.RawMessage
}

type ArchiveEntry struct {
	PowerID        string `json:"powerId"`
	Points         int    `json:"points"`
	TimesBound     int    `json:"timesBound"`
	TimesDestroyed int    `json:"timesDestroyed"`
}

type CharacterExtras struct {
	Binding      *PowerBinding
	Archive      []ArchiveEntry
	Hotbar       json.RawMessage
	AutoSettings json.RawMessage
	Storage      []ItemStack
	Equipment    map[string]string
	Enhance      map[string]int
	Quests       []QuestRow
}

func (s *Store) Extras(ctx context.Context, charID int64) (*CharacterExtras, error) {
	x := &CharacterExtras{}
	if err := s.DB.QueryRow(ctx, `select hotbar, auto_settings from characters where id = $1`, charID).Scan(&x.Hotbar, &x.AutoSettings); err != nil {
		return nil, err
	}
	var b PowerBinding
	err := s.DB.QueryRow(ctx, `select power_id, loadout from power_bindings where character_id = $1`, charID).Scan(&b.PowerID, &b.Loadout)
	if err == nil {
		x.Binding = &b
	} else if !errors.Is(err, pgx.ErrNoRows) {
		return nil, err
	}
	if x.Storage, err = s.Storage(ctx, charID); err != nil {
		return nil, err
	}
	if x.Equipment, err = s.Equipment(ctx, charID); err != nil {
		return nil, err
	}
	if x.Enhance, err = s.EnhanceLevels(ctx, charID); err != nil {
		return nil, err
	}
	if x.Quests, err = s.Quests(ctx, charID); err != nil {
		return nil, err
	}
	rows, err := s.DB.Query(ctx, `select power_id, points, times_bound, times_destroyed from power_archive where character_id = $1 order by power_id`, charID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	for rows.Next() {
		var a ArchiveEntry
		if err := rows.Scan(&a.PowerID, &a.Points, &a.TimesBound, &a.TimesDestroyed); err != nil {
			return nil, err
		}
		x.Archive = append(x.Archive, a)
	}
	return x, rows.Err()
}

func consumeTx(ctx context.Context, tx pgx.Tx, txID string, charID int64, templateID string, qty int, reason string) error {
	var have int
	err := tx.QueryRow(ctx, `select quantity from item_instances where character_id = $1 and template_id = $2 for update`, charID, templateID).Scan(&have)
	if errors.Is(err, pgx.ErrNoRows) || (err == nil && have < qty) {
		return ErrInsufficient
	}
	if err != nil {
		return err
	}
	after := have - qty
	if after == 0 {
		_, err = tx.Exec(ctx, `delete from item_instances where character_id = $1 and template_id = $2`, charID, templateID)
	} else {
		_, err = tx.Exec(ctx, `update item_instances set quantity = $3, version = version + 1 where character_id = $1 and template_id = $2`, charID, templateID, after)
	}
	if err != nil {
		return err
	}
	_, err = tx.Exec(ctx, `insert into item_ledger(tx_id, character_id, template_id, delta, qty_after, reason) values ($1,$2,$3,$4,$5,$6)`,
		txID, charID, templateID, -qty, after, reason)
	return err
}

// BindPower atomically consumes the fruit item and binds the Power (spec §7.5 steps 1–2).
// Fails with ErrConflict if a Power is already bound, ErrInsufficient if the fruit is missing.
func (s *Store) BindPower(ctx context.Context, txID string, charID int64, powerID, fruitItemID string, loadout []byte) error {
	return pgx.BeginFunc(ctx, s.DB, func(tx pgx.Tx) error {
		if err := claim(ctx, tx, txID, "power-bind", charID); err != nil {
			return err
		}
		if err := consumeTx(ctx, tx, txID, charID, fruitItemID, 1, "power-bind"); err != nil {
			return err
		}
		if _, err := tx.Exec(ctx, `insert into power_bindings(character_id, power_id, loadout, tx_id) values ($1,$2,$3,$4)`, charID, powerID, loadout, txID); err != nil {
			if isUnique(err) {
				return fmt.Errorf("%w: a power is already bound", ErrConflict)
			}
			return err
		}
		if _, err := tx.Exec(ctx, `insert into power_archive(character_id, power_id, times_bound) values ($1,$2,1)
			on conflict (character_id, power_id) do update set times_bound = power_archive.times_bound + 1`, charID, powerID); err != nil {
			return err
		}
		_, err := tx.Exec(ctx, `insert into power_events(tx_id, character_id, power_id, event, item_template_id) values ($1,$2,$3,'bind',$4)`, txID, charID, powerID, fruitItemID)
		return err
	})
}

// UnbindPower permanently destroys the bound Power (The Severer ritual, spec §7.5 steps 4–6).
// Nothing is refunded; the archive keeps proficiency history.
func (s *Store) UnbindPower(ctx context.Context, txID string, charID int64, powerID string) error {
	return pgx.BeginFunc(ctx, s.DB, func(tx pgx.Tx) error {
		if err := claim(ctx, tx, txID, "power-destroy", charID); err != nil {
			return err
		}
		ct, err := tx.Exec(ctx, `delete from power_bindings where character_id = $1 and power_id = $2`, charID, powerID)
		if err != nil {
			return err
		}
		if ct.RowsAffected() == 0 {
			return ErrNotFound
		}
		if _, err := tx.Exec(ctx, `update power_archive set times_destroyed = times_destroyed + 1 where character_id = $1 and power_id = $2`, charID, powerID); err != nil {
			return err
		}
		_, err = tx.Exec(ctx, `insert into power_events(tx_id, character_id, power_id, event) values ($1,$2,$3,'destroy')`, txID, charID, powerID)
		return err
	})
}

func (s *Store) SaveLoadout(ctx context.Context, charID int64, powerID string, loadout []byte) error {
	_, err := s.DB.Exec(ctx, `update power_bindings set loadout = $3 where character_id = $1 and power_id = $2`, charID, powerID, loadout)
	return err
}

func (s *Store) SaveProficiency(ctx context.Context, charID int64, powerID string, points int) error {
	_, err := s.DB.Exec(ctx, `insert into power_archive(character_id, power_id, points) values ($1,$2,$3)
		on conflict (character_id, power_id) do update set points = greatest(power_archive.points, excluded.points)`, charID, powerID, points)
	return err
}

func (s *Store) SaveHotbar(ctx context.Context, charID int64, hotbar []byte) error {
	_, err := s.DB.Exec(ctx, `update characters set hotbar = $2 where id = $1`, charID, hotbar)
	return err
}

func (s *Store) SaveAutoSettings(ctx context.Context, charID int64, settings []byte) error {
	_, err := s.DB.Exec(ctx, `update characters set auto_settings = $2 where id = $1`, charID, settings)
	return err
}

func (s *Store) SetWeapon(ctx context.Context, charID int64, weapon string) error {
	_, err := s.DB.Exec(ctx, `update characters set weapon = $2, version = version + 1 where id = $1`, charID, weapon)
	return err
}

// Craft atomically consumes all inputs and creates the output (idempotent on txID).
func (s *Store) Craft(ctx context.Context, txID string, charID int64, inputs []ItemStack, output ItemStack) error {
	return pgx.BeginFunc(ctx, s.DB, func(tx pgx.Tx) error {
		if err := claim(ctx, tx, txID, "craft", charID); err != nil {
			return err
		}
		for _, in := range inputs {
			if err := consumeTx(ctx, tx, txID, charID, in.TemplateID, in.Quantity, "craft"); err != nil {
				return err
			}
		}
		return addItem(ctx, tx, txID, charID, output.TemplateID, output.Quantity, "craft")
	})
}
