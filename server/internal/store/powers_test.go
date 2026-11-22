package store

import (
	"context"
	"errors"
	"testing"
)

func TestBindAndDestructiveUnbindTransaction(t *testing.T) {
	s := testStore(t)
	c := setup(t, s)
	ctx := context.Background()
	if err := s.ApplyReward(ctx, Reward{TxID: "seed", CharID: c.ID, LevelAfter: 1, Items: []ItemStack{{"PWR-001", 1}, {"PWR-003", 1}}, Reason: "test"}); err != nil {
		t.Fatal(err)
	}
	if err := s.BindPower(ctx, "bind:1", c.ID, "inferno", "PWR-001", []byte(`{}`)); err != nil {
		t.Fatal(err)
	}
	// replaying the same tx is a no-op; a second power is refused and the fruit is kept
	if err := s.BindPower(ctx, "bind:1", c.ID, "inferno", "PWR-001", []byte(`{}`)); !errors.Is(err, ErrAlreadyApplied) {
		t.Fatalf("replay err = %v", err)
	}
	if err := s.BindPower(ctx, "bind:2", c.ID, "abyss_shadow", "PWR-003", []byte(`{}`)); !errors.Is(err, ErrConflict) {
		t.Fatalf("second bind err = %v", err)
	}
	qty := func(id string) int {
		items, _ := s.Items(ctx, c.ID)
		for _, it := range items {
			if it.TemplateID == id {
				return it.Quantity
			}
		}
		return 0
	}
	if qty("PWR-001") != 0 || qty("PWR-003") != 1 {
		t.Fatalf("fruits after bind: inferno=%d abyss=%d", qty("PWR-001"), qty("PWR-003"))
	}
	if err := s.SaveProficiency(ctx, c.ID, "inferno", 77); err != nil {
		t.Fatal(err)
	}
	if err := s.UnbindPower(ctx, "destroy:1", c.ID, "inferno"); err != nil {
		t.Fatal(err)
	}
	if err := s.UnbindPower(ctx, "destroy:2", c.ID, "inferno"); !errors.Is(err, ErrNotFound) {
		t.Fatalf("second unbind err = %v", err)
	}
	x, err := s.Extras(ctx, c.ID)
	if err != nil {
		t.Fatal(err)
	}
	if x.Binding != nil || len(x.Archive) != 1 || x.Archive[0].Points != 77 || x.Archive[0].TimesDestroyed != 1 {
		t.Fatalf("extras %+v binding %+v", x.Archive, x.Binding)
	}
	if qty("PWR-001") != 0 {
		t.Fatal("destroyed fruit must not be refunded")
	}
	var events int
	_ = s.DB.QueryRow(ctx, `select count(*) from power_events where character_id = $1`, c.ID).Scan(&events)
	if events != 2 {
		t.Fatalf("power_events = %d", events)
	}
	if _, err := s.DB.Exec(ctx, `delete from power_events`); err == nil {
		t.Fatal("power_events must be append-only")
	}
}

func TestCraftIsAtomic(t *testing.T) {
	s := testStore(t)
	c := setup(t, s)
	ctx := context.Background()
	_ = s.ApplyReward(ctx, Reward{TxID: "seed", CharID: c.ID, LevelAfter: 1, Items: []ItemStack{{"MAT-PWR-001", 9}}, Reason: "test"})
	in := []ItemStack{{"MAT-PWR-001", 10}}
	if err := s.Craft(ctx, "craft:1", c.ID, in, ItemStack{"PWR-001", 1}); !errors.Is(err, ErrInsufficient) {
		t.Fatalf("craft with 9/10 err = %v", err)
	}
	items, _ := s.Items(ctx, c.ID)
	for _, it := range items {
		if it.TemplateID == "PWR-001" || (it.TemplateID == "MAT-PWR-001" && it.Quantity != 9) {
			t.Fatalf("failed craft changed inventory: %+v", items)
		}
	}
	_ = s.ApplyReward(ctx, Reward{TxID: "seed2", CharID: c.ID, LevelAfter: 1, Items: []ItemStack{{"MAT-PWR-001", 1}}, Reason: "test"})
	if err := s.Craft(ctx, "craft:2", c.ID, in, ItemStack{"PWR-001", 1}); err != nil {
		t.Fatal(err)
	}
	if err := s.Craft(ctx, "craft:2", c.ID, in, ItemStack{"PWR-001", 1}); !errors.Is(err, ErrAlreadyApplied) {
		t.Fatal("craft replay must be a no-op")
	}
}

func TestExchangeAndStorage(t *testing.T) {
	s := testStore(t)
	c := setup(t, s)
	ctx := context.Background()
	// buying with no gold fails atomically
	if err := s.ApplyExchange(ctx, Exchange{TxID: "buy:1", CharID: c.ID, GoldDelta: -20, Add: []ItemStack{{"CON-001", 1}}, Reason: "buy"}); !errors.Is(err, ErrInsufficient) {
		t.Fatalf("buy without gold err = %v", err)
	}
	_ = s.ApplyReward(ctx, Reward{TxID: "g", CharID: c.ID, LevelAfter: 1, GoldDelta: 100, Items: []ItemStack{{"TRD-DEV-001", 5}}, Reason: "seed"})
	if err := s.ApplyExchange(ctx, Exchange{TxID: "sell:1", CharID: c.ID, GoldDelta: 15, Remove: []ItemStack{{"TRD-DEV-001", 5}}, Reason: "sell"}); err != nil {
		t.Fatal(err)
	}
	if err := s.ApplyExchange(ctx, Exchange{TxID: "sell:1", CharID: c.ID, GoldDelta: 15, Remove: []ItemStack{{"TRD-DEV-001", 5}}, Reason: "sell"}); !errors.Is(err, ErrAlreadyApplied) {
		t.Fatal("sell replay must be a no-op")
	}
	got, _ := s.CharacterForAccount(ctx, c.AccountID, c.ID)
	if got.Gold != 115 {
		t.Fatalf("gold = %d", got.Gold)
	}
	if err := s.MoveStorage(ctx, "st:1", c.ID, "CON-001", 2); err != nil {
		t.Fatal(err)
	}
	if err := s.MoveStorage(ctx, "st:2", c.ID, "CON-001", -3); !errors.Is(err, ErrInsufficient) {
		t.Fatalf("over-withdraw err = %v", err)
	}
	if err := s.MoveStorage(ctx, "st:3", c.ID, "CON-001", -2); err != nil {
		t.Fatal(err)
	}
	st, _ := s.Storage(ctx, c.ID)
	items, _ := s.Items(ctx, c.ID)
	if len(st) != 0 || len(items) != 1 || items[0].Quantity != 3 {
		t.Fatalf("storage %v items %v", st, items)
	}
}

func TestEquipmentAndEnhanceLedger(t *testing.T) {
	s := testStore(t)
	c := setup(t, s)
	ctx := context.Background()
	_ = s.ApplyReward(ctx, Reward{TxID: "seed", CharID: c.ID, LevelAfter: 1, GoldDelta: 100, Items: []ItemStack{{"ARM-CHS-001", 1}, {"MAT-ORE-002", 3}}, Reason: "seed"})
	if err := s.SetEquipment(ctx, c.ID, "chest", "ARM-HLM-001"); err != nil {
		t.Fatal(err)
	}
	eq, _ := s.Equipment(ctx, c.ID)
	if len(eq) != 0 {
		t.Fatal("cannot equip an item that is not owned")
	}
	_ = s.SetEquipment(ctx, c.ID, "chest", "ARM-CHS-001")
	if err := s.Enhance(ctx, "e1", c.ID, "ARM-CHS-001", 20, []ItemStack{{"MAT-ORE-002", 1}}, true); err != nil {
		t.Fatal(err)
	}
	if err := s.Enhance(ctx, "e2", c.ID, "ARM-CHS-001", 40, []ItemStack{{"MAT-ORE-002", 1}}, false); err != nil {
		t.Fatal(err)
	}
	lv, _ := s.EnhanceLevels(ctx, c.ID)
	got, _ := s.CharacterForAccount(ctx, c.AccountID, c.ID)
	if lv["ARM-CHS-001"] != 1 || got.Gold != 40 {
		t.Fatalf("enhance level %v gold %d (failed attempt still pays, item kept)", lv, got.Gold)
	}
	if err := s.Enhance(ctx, "e3", c.ID, "ARM-CHS-001", 500, nil, true); !errors.Is(err, ErrInsufficient) {
		t.Fatalf("enhance without gold err = %v", err)
	}
}
