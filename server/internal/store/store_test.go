package store

import (
	"context"
	"errors"
	"os"
	"sync"
	"testing"
)

// Integration tests: require TEST_DATABASE_URL pointing at a disposable database.
func testStore(t *testing.T) *Store {
	url := os.Getenv("TEST_DATABASE_URL")
	if url == "" {
		t.Skip("TEST_DATABASE_URL not set")
	}
	ctx := context.Background()
	s, err := Open(ctx, url)
	if err != nil {
		t.Fatal(err)
	}
	if _, err := s.DB.Exec(ctx, `drop schema public cascade; create schema public;`); err != nil {
		t.Fatal(err)
	}
	if _, err := s.Migrate(ctx); err != nil {
		t.Fatal(err)
	}
	t.Cleanup(s.Close)
	return s
}

func setup(t *testing.T, s *Store) *Character {
	ctx := context.Background()
	id, err := s.CreateAccount(ctx, "tester", "hash")
	if err != nil {
		t.Fatal(err)
	}
	c, err := s.CreateCharacter(ctx, id, "Tester", "sword", 3, []ItemStack{{"CON-001", 3}})
	if err != nil {
		t.Fatal(err)
	}
	return c
}

func TestMigrationsIdempotent(t *testing.T) {
	s := testStore(t)
	applied, err := s.Migrate(context.Background())
	if err != nil || len(applied) != 0 {
		t.Fatalf("second migrate applied %v err %v", applied, err)
	}
}

func TestRewardIsIdempotent(t *testing.T) {
	s := testStore(t)
	c := setup(t, s)
	ctx := context.Background()
	r := Reward{TxID: "kill:test:1", CharID: c.ID, XPDelta: 12, LevelAfter: 1, GoldDelta: 5, Items: []ItemStack{{"TRD-DEV-001", 2}}, Reason: "test"}
	if err := s.ApplyReward(ctx, r); err != nil {
		t.Fatal(err)
	}
	if err := s.ApplyReward(ctx, r); !errors.Is(err, ErrAlreadyApplied) {
		t.Fatalf("second apply err = %v", err)
	}
	got, _ := s.CharacterForAccount(ctx, c.AccountID, c.ID)
	items, _ := s.Items(ctx, c.ID)
	if got.Gold != 5 || got.XP != 12 {
		t.Fatalf("gold=%d xp=%d", got.Gold, got.XP)
	}
	qty := map[string]int{}
	for _, it := range items {
		qty[it.TemplateID] = it.Quantity
	}
	if qty["TRD-DEV-001"] != 2 || qty["CON-001"] != 3 {
		t.Fatalf("items %v", qty)
	}
}

func TestConcurrentDuplicateRewardsApplyOnce(t *testing.T) {
	s := testStore(t)
	c := setup(t, s)
	ctx := context.Background()
	r := Reward{TxID: "kill:race:1", CharID: c.ID, XPDelta: 10, LevelAfter: 1, GoldDelta: 7, Reason: "race"}
	var wg sync.WaitGroup
	var mu sync.Mutex
	ok := 0
	for i := 0; i < 10; i++ {
		wg.Add(1)
		go func() {
			defer wg.Done()
			if err := s.ApplyReward(ctx, r); err == nil {
				mu.Lock()
				ok++
				mu.Unlock()
			}
		}()
	}
	wg.Wait()
	got, _ := s.CharacterForAccount(ctx, c.AccountID, c.ID)
	if ok != 1 || got.Gold != 7 {
		t.Fatalf("applied %d times, gold=%d", ok, got.Gold)
	}
}

func TestConsumeCannotGoNegative(t *testing.T) {
	s := testStore(t)
	c := setup(t, s)
	ctx := context.Background()
	for i := 0; i < 3; i++ {
		if err := s.ConsumeItem(ctx, "use:"+string(rune('a'+i)), c.ID, "CON-001", 1, "test"); err != nil {
			t.Fatal(err)
		}
	}
	if err := s.ConsumeItem(ctx, "use:z", c.ID, "CON-001", 1, "test"); !errors.Is(err, ErrInsufficient) {
		t.Fatalf("err = %v", err)
	}
	items, _ := s.Items(ctx, c.ID)
	if len(items) != 0 {
		t.Fatalf("stack should be removed, got %v", items)
	}
}

func TestLedgerIsAppendOnly(t *testing.T) {
	s := testStore(t)
	c := setup(t, s)
	ctx := context.Background()
	if _, err := s.DB.Exec(ctx, `update item_ledger set delta = 100 where character_id = $1`, c.ID); err == nil {
		t.Fatal("ledger update must fail")
	}
	if _, err := s.DB.Exec(ctx, `delete from item_ledger where character_id = $1`, c.ID); err == nil {
		t.Fatal("ledger delete must fail")
	}
}

func TestCharacterLimitAndNames(t *testing.T) {
	s := testStore(t)
	ctx := context.Background()
	id, _ := s.CreateAccount(ctx, "limit", "hash")
	for i, n := range []string{"Aaa", "Bbb", "Ccc"} {
		if _, err := s.CreateCharacter(ctx, id, n, "sword", 3, nil); err != nil {
			t.Fatalf("%d: %v", i, err)
		}
	}
	if _, err := s.CreateCharacter(ctx, id, "Ddd", "sword", 3, nil); !errors.Is(err, ErrConflict) {
		t.Fatalf("4th character err = %v", err)
	}
	id2, _ := s.CreateAccount(ctx, "other", "hash")
	if _, err := s.CreateCharacter(ctx, id2, "aaa", "sword", 3, nil); !errors.Is(err, ErrConflict) {
		t.Fatal("names must be unique case-insensitively")
	}
	if _, err := s.CreateAccount(ctx, "LIMIT", "x"); !errors.Is(err, ErrConflict) {
		t.Fatal("usernames must be unique case-insensitively")
	}
}
