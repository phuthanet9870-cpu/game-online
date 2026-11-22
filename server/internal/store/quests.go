package store

import (
	"context"
	"encoding/json"

	"github.com/jackc/pgx/v5"
)

type QuestRow struct {
	QuestID     string `json:"questId"`
	Status      string `json:"status"`
	Counters    []int  `json:"counters"`
	RepeatCount int    `json:"repeatCount"`
}

func (s *Store) Quests(ctx context.Context, charID int64) ([]QuestRow, error) {
	rows, err := s.DB.Query(ctx, `select quest_id, status, counters, repeat_count from quest_progress where character_id = $1`, charID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var out []QuestRow
	for rows.Next() {
		var q QuestRow
		var raw []byte
		if err := rows.Scan(&q.QuestID, &q.Status, &raw, &q.RepeatCount); err != nil {
			return nil, err
		}
		_ = json.Unmarshal(raw, &q.Counters)
		out = append(out, q)
	}
	return out, rows.Err()
}

// SaveQuest upserts an active quest's counters (or deletes it when abandoned with status "").
func (s *Store) SaveQuest(ctx context.Context, charID int64, questID, status string, counters []int) error {
	if status == "" {
		_, err := s.DB.Exec(ctx, `delete from quest_progress where character_id = $1 and quest_id = $2 and status = 'active'`, charID, questID)
		return err
	}
	b, _ := json.Marshal(counters)
	_, err := s.DB.Exec(ctx, `insert into quest_progress(character_id, quest_id, status, counters) values ($1,$2,$3,$4)
		on conflict (character_id, quest_id) do update set status = excluded.status, counters = excluded.counters, updated_at = now()`,
		charID, questID, status, b)
	return err
}

// CompleteQuest atomically consumes collect items, grants Gold/items/XP and marks the quest done.
func (s *Store) CompleteQuest(ctx context.Context, txID string, charID int64, questID string, xp int64, levelAfter int, x Exchange) error {
	return pgx.BeginFunc(ctx, s.DB, func(tx pgx.Tx) error {
		x.TxID, x.CharID, x.Reason = txID, charID, "quest:"+questID
		if err := applyExchangeTx(ctx, tx, x); err != nil {
			return err
		}
		if xp > 0 {
			var total int64
			var level int
			if err := tx.QueryRow(ctx, `update characters set xp = xp + $2, level = greatest(level, $3), version = version + 1 where id = $1 returning xp, level`,
				charID, xp, levelAfter).Scan(&total, &level); err != nil {
				return err
			}
			if _, err := tx.Exec(ctx, `insert into xp_ledger(tx_id, character_id, delta, xp_after, level_after) values ($1,$2,$3,$4,$5)`, txID, charID, xp, total, level); err != nil {
				return err
			}
		}
		_, err := tx.Exec(ctx, `insert into quest_progress(character_id, quest_id, status, counters, repeat_count) values ($1,$2,'completed','[]',1)
			on conflict (character_id, quest_id) do update set status = 'completed', counters = '[]', repeat_count = quest_progress.repeat_count + 1, updated_at = now()`,
			charID, questID)
		return err
	})
}
