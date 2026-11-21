// Package store is the PostgreSQL persistence layer. All economic writes are transactional,
// ledger-backed and idempotent on tx_id.
package store

import (
	"context"
	"embed"
	"errors"
	"fmt"
	"sort"
	"strconv"
	"strings"
	"time"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgconn"
	"github.com/jackc/pgx/v5/pgxpool"
)

//go:embed migrations/*.sql
var migrationFS embed.FS

var (
	ErrNotFound       = errors.New("not found")
	ErrConflict       = errors.New("conflict")
	ErrAlreadyApplied = errors.New("transaction already applied")
	ErrInsufficient   = errors.New("insufficient quantity")
)

type Store struct{ DB *pgxpool.Pool }

func Open(ctx context.Context, url string) (*Store, error) {
	cfg, err := pgxpool.ParseConfig(url)
	if err != nil {
		return nil, err
	}
	cfg.MaxConns = 20
	pool, err := pgxpool.NewWithConfig(ctx, cfg)
	if err != nil {
		return nil, err
	}
	pctx, cancel := context.WithTimeout(ctx, 5*time.Second)
	defer cancel()
	if err := pool.Ping(pctx); err != nil {
		pool.Close()
		return nil, fmt.Errorf("database ping: %w", err)
	}
	return &Store{DB: pool}, nil
}

func (s *Store) Close() { s.DB.Close() }

// Migrate applies embedded migrations in order, each inside its own transaction.
func (s *Store) Migrate(ctx context.Context) ([]string, error) {
	if _, err := s.DB.Exec(ctx, `create table if not exists schema_migrations (version int primary key, name text not null, applied_at timestamptz not null default now())`); err != nil {
		return nil, err
	}
	entries, err := migrationFS.ReadDir("migrations")
	if err != nil {
		return nil, err
	}
	sort.Slice(entries, func(i, j int) bool { return entries[i].Name() < entries[j].Name() })
	var applied []string
	for _, e := range entries {
		name := e.Name()
		v, err := strconv.Atoi(strings.SplitN(name, "_", 2)[0])
		if err != nil {
			return applied, fmt.Errorf("bad migration name %s", name)
		}
		var exists bool
		if err := s.DB.QueryRow(ctx, `select exists(select 1 from schema_migrations where version=$1)`, v).Scan(&exists); err != nil {
			return applied, err
		}
		if exists {
			continue
		}
		sql, _ := migrationFS.ReadFile("migrations/" + name)
		err = pgx.BeginFunc(ctx, s.DB, func(tx pgx.Tx) error {
			if _, err := tx.Exec(ctx, string(sql)); err != nil {
				return err
			}
			_, err := tx.Exec(ctx, `insert into schema_migrations(version, name) values ($1, $2)`, v, name)
			return err
		})
		if err != nil {
			return applied, fmt.Errorf("migration %s: %w", name, err)
		}
		applied = append(applied, name)
	}
	return applied, nil
}

/* ---------------------------------------------------------------- accounts */

type Account struct {
	ID           int64
	Username     string
	PasswordHash string
	Role         string
	Disabled     bool
	FailedLogins int
	LockedUntil  *time.Time
}

func isUnique(err error) bool {
	var pe *pgconn.PgError
	return errors.As(err, &pe) && pe.Code == "23505"
}

func (s *Store) CreateAccount(ctx context.Context, username, hash string) (int64, error) {
	var id int64
	err := s.DB.QueryRow(ctx, `insert into accounts(username, username_lower, password_hash) values ($1, lower($1), $2) returning id`, username, hash).Scan(&id)
	if isUnique(err) {
		return 0, ErrConflict
	}
	return id, err
}

func (s *Store) AccountByUsername(ctx context.Context, username string) (*Account, error) {
	a := &Account{}
	err := s.DB.QueryRow(ctx, `select id, username, password_hash, role, disabled, failed_logins, locked_until from accounts where username_lower = lower($1)`, username).
		Scan(&a.ID, &a.Username, &a.PasswordHash, &a.Role, &a.Disabled, &a.FailedLogins, &a.LockedUntil)
	if errors.Is(err, pgx.ErrNoRows) {
		return nil, ErrNotFound
	}
	return a, err
}

func (s *Store) RecordLogin(ctx context.Context, accountID *int64, username string, ok bool, ip, ua string) error {
	_, err := s.DB.Exec(ctx, `insert into login_history(account_id, username, success, ip, user_agent) values ($1,$2,$3,$4,$5)`, accountID, username, ok, ip, ua)
	if err != nil || accountID == nil {
		return err
	}
	if ok {
		_, err = s.DB.Exec(ctx, `update accounts set failed_logins = 0, locked_until = null where id = $1`, *accountID)
	} else {
		// [TUNING] lock for 15 minutes after 10 consecutive failures
		_, err = s.DB.Exec(ctx, `update accounts set failed_logins = failed_logins + 1,
			locked_until = case when failed_logins + 1 >= 10 then now() + interval '15 minutes' else locked_until end where id = $1`, *accountID)
	}
	return err
}

func (s *Store) SetRole(ctx context.Context, username, role string) error {
	ct, err := s.DB.Exec(ctx, `update accounts set role = $2 where username_lower = lower($1)`, username, role)
	if err == nil && ct.RowsAffected() == 0 {
		return ErrNotFound
	}
	return err
}

/* ---------------------------------------------------------------- sessions */

func (s *Store) CreateSession(ctx context.Context, accountID int64, tokenHash []byte, ttl time.Duration, ip, ua string) error {
	_, err := s.DB.Exec(ctx, `insert into sessions(token_hash, account_id, expires_at, ip, user_agent) values ($1,$2,$3,$4,$5)`,
		tokenHash, accountID, time.Now().Add(ttl), ip, ua)
	return err
}

// SessionAccount returns the account for a live (unexpired, unrevoked) session.
func (s *Store) SessionAccount(ctx context.Context, tokenHash []byte) (*Account, error) {
	a := &Account{}
	err := s.DB.QueryRow(ctx, `select a.id, a.username, a.role, a.disabled from sessions s join accounts a on a.id = s.account_id
		where s.token_hash = $1 and s.revoked_at is null and s.expires_at > now()`, tokenHash).Scan(&a.ID, &a.Username, &a.Role, &a.Disabled)
	if errors.Is(err, pgx.ErrNoRows) {
		return nil, ErrNotFound
	}
	if err == nil && a.Disabled {
		return nil, ErrNotFound
	}
	return a, err
}

func (s *Store) RevokeSession(ctx context.Context, tokenHash []byte) error {
	_, err := s.DB.Exec(ctx, `update sessions set revoked_at = now() where token_hash = $1 and revoked_at is null`, tokenHash)
	return err
}

/* -------------------------------------------------------------- characters */

type Character struct {
	ID        int64    `json:"id"`
	AccountID int64    `json:"-"`
	Name      string   `json:"name"`
	Weapon    string   `json:"weapon"`
	Level     int      `json:"level"`
	XP        int64    `json:"xp"`
	Gold      int64    `json:"gold"`
	Hp        *int     `json:"-"`
	MapID     string   `json:"mapId"`
	PosX      *float32 `json:"-"`
	PosY      *float32 `json:"-"`
}

const charCols = `id, account_id, name, weapon, level, xp, gold, hp, map_id, pos_x, pos_y`

func scanChar(row pgx.Row) (*Character, error) {
	c := &Character{}
	err := row.Scan(&c.ID, &c.AccountID, &c.Name, &c.Weapon, &c.Level, &c.XP, &c.Gold, &c.Hp, &c.MapID, &c.PosX, &c.PosY)
	if errors.Is(err, pgx.ErrNoRows) {
		return nil, ErrNotFound
	}
	return c, err
}

func (s *Store) ListCharacters(ctx context.Context, accountID int64) ([]*Character, error) {
	rows, err := s.DB.Query(ctx, `select `+charCols+` from characters where account_id = $1 and deleted_at is null order by id`, accountID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var out []*Character
	for rows.Next() {
		c, err := scanChar(rows)
		if err != nil {
			return nil, err
		}
		out = append(out, c)
	}
	return out, rows.Err()
}

func (s *Store) CharacterForAccount(ctx context.Context, accountID, charID int64) (*Character, error) {
	return scanChar(s.DB.QueryRow(ctx, `select `+charCols+` from characters where id = $1 and account_id = $2 and deleted_at is null`, charID, accountID))
}

type ItemStack struct {
	TemplateID string `json:"templateId"`
	Quantity   int    `json:"quantity"`
}

// CreateCharacter creates a character (max per account enforced under lock) and grants starter items
// through the ledger in the same transaction.
func (s *Store) CreateCharacter(ctx context.Context, accountID int64, name, weapon string, max int, starter []ItemStack) (*Character, error) {
	var out *Character
	err := pgx.BeginFunc(ctx, s.DB, func(tx pgx.Tx) error {
		if _, err := tx.Exec(ctx, `select id from accounts where id = $1 for update`, accountID); err != nil {
			return err
		}
		var n int
		if err := tx.QueryRow(ctx, `select count(*) from characters where account_id = $1 and deleted_at is null`, accountID).Scan(&n); err != nil {
			return err
		}
		if n >= max {
			return fmt.Errorf("%w: character limit %d reached", ErrConflict, max)
		}
		c, err := scanChar(tx.QueryRow(ctx, `insert into characters(account_id, name, name_lower, weapon) values ($1,$2,lower($2),$3) returning `+charCols, accountID, name, weapon))
		if err != nil {
			if isUnique(err) {
				return fmt.Errorf("%w: name taken", ErrConflict)
			}
			return err
		}
		txID := fmt.Sprintf("starter:%d", c.ID)
		if _, err := tx.Exec(ctx, `insert into transactions(tx_id, kind, character_id) values ($1,'starter',$2)`, txID, c.ID); err != nil {
			return err
		}
		for _, it := range starter {
			if err := addItem(ctx, tx, txID, c.ID, it.TemplateID, it.Quantity, "starter"); err != nil {
				return err
			}
		}
		out = c
		return nil
	})
	return out, err
}

// SoftDeleteCharacter marks a character deleted (recoverable by support within policy window).
func (s *Store) SoftDeleteCharacter(ctx context.Context, accountID, charID int64, confirmName string) error {
	ct, err := s.DB.Exec(ctx, `update characters set deleted_at = now(), version = version + 1
		where id = $1 and account_id = $2 and deleted_at is null and name_lower = lower($3)`, charID, accountID, confirmName)
	if err == nil && ct.RowsAffected() == 0 {
		return ErrNotFound
	}
	return err
}

func (s *Store) Items(ctx context.Context, charID int64) ([]ItemStack, error) {
	rows, err := s.DB.Query(ctx, `select template_id, quantity from item_instances where character_id = $1 order by id`, charID)
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

func (s *Store) SaveState(ctx context.Context, charID int64, x, y float64, hp int) error {
	_, err := s.DB.Exec(ctx, `update characters set pos_x = $2, pos_y = $3, hp = $4, version = version + 1 where id = $1`, charID, x, y, hp)
	return err
}

/* ---------------------------------------------------------------- economy */

func addItem(ctx context.Context, tx pgx.Tx, txID string, charID int64, templateID string, qty int, reason string) error {
	var after int
	err := tx.QueryRow(ctx, `insert into item_instances(character_id, template_id, quantity, provenance) values ($1,$2,$3,$4)
		on conflict (character_id, template_id) do update set quantity = item_instances.quantity + excluded.quantity, version = item_instances.version + 1
		returning quantity`, charID, templateID, qty, txID).Scan(&after)
	if err != nil {
		return err
	}
	_, err = tx.Exec(ctx, `insert into item_ledger(tx_id, character_id, template_id, delta, qty_after, reason) values ($1,$2,$3,$4,$5,$6)`,
		txID, charID, templateID, qty, after, reason)
	return err
}

// claim inserts the idempotency row; returns ErrAlreadyApplied if this tx_id was committed before.
func claim(ctx context.Context, tx pgx.Tx, txID, kind string, charID int64) error {
	ct, err := tx.Exec(ctx, `insert into transactions(tx_id, kind, character_id) values ($1,$2,$3) on conflict do nothing`, txID, kind, charID)
	if err != nil {
		return err
	}
	if ct.RowsAffected() == 0 {
		return ErrAlreadyApplied
	}
	return nil
}

type Reward struct {
	TxID       string
	CharID     int64
	XPDelta    int64
	LevelAfter int
	GoldDelta  int64
	Items      []ItemStack
	Reason     string
}

// ApplyReward atomically credits XP, Gold and items. Re-applying the same TxID is a no-op.
func (s *Store) ApplyReward(ctx context.Context, r Reward) error {
	return pgx.BeginFunc(ctx, s.DB, func(tx pgx.Tx) error {
		if err := claim(ctx, tx, r.TxID, "reward", r.CharID); err != nil {
			return err
		}
		var gold, xp int64
		var level int
		if err := tx.QueryRow(ctx, `update characters set gold = gold + $2, xp = xp + $3, level = greatest(level, $4), version = version + 1
			where id = $1 returning gold, xp, level`, r.CharID, r.GoldDelta, r.XPDelta, r.LevelAfter).Scan(&gold, &xp, &level); err != nil {
			return err
		}
		if r.GoldDelta != 0 {
			if _, err := tx.Exec(ctx, `insert into currency_ledgers(tx_id, character_id, delta, balance_after, reason) values ($1,$2,$3,$4,$5)`,
				r.TxID, r.CharID, r.GoldDelta, gold, r.Reason); err != nil {
				return err
			}
		}
		if r.XPDelta != 0 {
			if _, err := tx.Exec(ctx, `insert into xp_ledger(tx_id, character_id, delta, xp_after, level_after) values ($1,$2,$3,$4,$5)`,
				r.TxID, r.CharID, r.XPDelta, xp, level); err != nil {
				return err
			}
		}
		for _, it := range r.Items {
			if err := addItem(ctx, tx, r.TxID, r.CharID, it.TemplateID, it.Quantity, r.Reason); err != nil {
				return err
			}
		}
		return nil
	})
}

// ConsumeItem atomically removes qty of a stack; fails with ErrInsufficient (and changes nothing).
func (s *Store) ConsumeItem(ctx context.Context, txID string, charID int64, templateID string, qty int, reason string) error {
	return pgx.BeginFunc(ctx, s.DB, func(tx pgx.Tx) error {
		if err := claim(ctx, tx, txID, "consume", charID); err != nil {
			return err
		}
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
	})
}

/* ------------------------------------------------------------------- audit */

type AuditEntry struct {
	RequestID  string
	ActorAcct  int64
	ActorChar  int64
	Permission string
	Action     string
	Target     string
	ParamsJSON []byte
	Result     string // ok | denied | error
	Reason     string
}

func (s *Store) Audit(ctx context.Context, e AuditEntry) error {
	var acct, char any
	if e.ActorAcct != 0 {
		acct = e.ActorAcct
	}
	if e.ActorChar != 0 {
		char = e.ActorChar
	}
	var params any
	if len(e.ParamsJSON) > 0 {
		params = e.ParamsJSON
	}
	_, err := s.DB.Exec(ctx, `insert into gm_audit_log(request_id, actor_account_id, actor_character_id, permission, action, target, params, result, reason)
		values ($1,$2,$3,$4,$5,$6,$7,$8,$9)`, e.RequestID, acct, char, e.Permission, e.Action, e.Target, params, e.Result, e.Reason)
	return err
}
