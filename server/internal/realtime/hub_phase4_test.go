package realtime

import (
	"testing"

	"github.com/phuthanet9870-cpu/game-online/server/internal/game"
	"github.com/phuthanet9870-cpu/game-online/server/internal/store"
)

func standAt(h *Hub, pl *game.Player, npc string) {
	n := h.c.NPC(npc)
	pl.Pos = game.Vec{X: n.X + 12, Y: n.Y}
}

func TestMerchantBuySellAndSellAllTradeLoot(t *testing.T) {
	h, _, p := newTestHub(t)
	defer p.Close()
	c, s, pl := joinWith(t, h, 1, "player", "sword", []store.ItemStack{{TemplateID: "WPN-SWD-001", Quantity: 1}, {TemplateID: "TRD-DEV-001", Quantity: 4}, {TemplateID: "TRD-DEV-002", Quantity: 2}})
	drain(c)
	h.onMessage(s, clientMsg{T: "shop", Op: "buy", ItemID: "CON-001", Qty: 1})
	if lastResult(c, "shop")["ok"] != false {
		t.Fatal("trading away from the merchant must fail")
	}
	standAt(h, pl, "merchant")
	h.onMessage(s, clientMsg{T: "shop", Op: "buy", ItemID: "CON-001", Qty: 1})
	if lastResult(c, "shop")["ok"] != false {
		t.Fatal("buying without gold must fail")
	}
	h.onMessage(s, clientMsg{T: "shop", Op: "sellAllTrade"})
	if s.gold != 4*3+2*8 || s.inv["TRD-DEV-001"] != 0 || s.inv["TRD-DEV-002"] != 0 {
		t.Fatalf("sell all: gold %d inv %v", s.gold, s.inv)
	}
	h.onMessage(s, clientMsg{T: "shop", Op: "sell", ItemID: "WPN-SWD-001", Qty: 1})
	if s.inv["WPN-SWD-001"] != 1 {
		t.Fatal("equipped weapon must not be sellable")
	}
	h.onMessage(s, clientMsg{T: "shop", Op: "buy", ItemID: "CON-001", Qty: 1})
	if s.inv["CON-001"] != 1 || s.gold != 28-20 {
		t.Fatalf("buy: gold %d inv %v", s.gold, s.inv)
	}
	h.onMessage(s, clientMsg{T: "shop", Op: "buy", ItemID: "PWR-001", Qty: 1})
	if lastResult(c, "shop")["ok"] != false {
		t.Fatal("items not in stock cannot be bought")
	}
}

func TestStorageDepositWithdraw(t *testing.T) {
	h, _, p := newTestHub(t)
	defer p.Close()
	c, s, pl := joinWith(t, h, 1, "player", "sword", []store.ItemStack{{TemplateID: "CON-001", Quantity: 3}})
	standAt(h, pl, "storage")
	drain(c)
	h.onMessage(s, clientMsg{T: "storage", Op: "deposit", ItemID: "CON-001", Qty: 2})
	h.onMessage(s, clientMsg{T: "storage", Op: "withdraw", ItemID: "CON-001", Qty: 5})
	if s.inv["CON-001"] != 1 || s.storage["CON-001"] != 2 || lastResult(c, "storage")["ok"] != false {
		t.Fatalf("inv %v storage %v", s.inv, s.storage)
	}
	h.onMessage(s, clientMsg{T: "storage", Op: "withdraw", ItemID: "CON-001", Qty: 2})
	if s.inv["CON-001"] != 3 || len(s.storage) != 0 {
		t.Fatalf("inv %v storage %v", s.inv, s.storage)
	}
}

func TestEquipmentStatsAndBlacksmith(t *testing.T) {
	h, _, p := newTestHub(t)
	defer p.Close()
	c, s, pl := joinWith(t, h, 1, "player", "sword", []store.ItemStack{{TemplateID: "WPN-SWD-001", Quantity: 1}, {TemplateID: "ARM-CHS-001", Quantity: 1},
		{TemplateID: "MAT-ORE-001", Quantity: 8}, {TemplateID: "MAT-ORE-002", Quantity: 20}})
	drain(c)
	if s.equip["weapon"] != "WPN-SWD-001" {
		t.Fatalf("starter weapon should be equipped: %v", s.equip)
	}
	def0, hp0 := pl.Defense, pl.MaxHp
	h.onMessage(s, clientMsg{T: "equipItem", ItemID: "ARM-CHS-001"})
	if pl.Defense != def0+4 || pl.MaxHp != hp0+20 {
		t.Fatalf("chest stats not applied: def %v->%v hp %v->%v", def0, pl.Defense, hp0, pl.MaxHp)
	}
	// equipped items cannot be sold
	standAt(h, pl, "merchant")
	h.onMessage(s, clientMsg{T: "shop", Op: "sell", ItemID: "ARM-CHS-001", Qty: 1})
	if s.inv["ARM-CHS-001"] != 1 {
		t.Fatal("equipped item was sold")
	}
	// Blacksmith: craft needs gold, then works atomically
	standAt(h, pl, "blacksmith")
	h.onMessage(s, clientMsg{T: "smith", Op: "craft", Recipe: "RCP-WPN-T2-SWD"})
	if lastResult(c, "smith")["ok"] != false {
		t.Fatal("craft without gold must fail")
	}
	s.gold = 1000
	s.level = 5
	h.onMessage(s, clientMsg{T: "smith", Op: "craft", Recipe: "RCP-WPN-T2-SWD"})
	if s.inv["WPN-T2-SWD"] != 1 || s.inv["MAT-ORE-001"] != 0 || s.gold != 950 || s.equip["weapon"] != "WPN-T2-SWD" {
		t.Fatalf("craft result inv=%v gold=%d", s.inv, s.gold)
	}
	// enhancement +1..+3 always succeeds; failure never destroys the item
	for i := 0; i < 10; i++ {
		h.onMessage(s, clientMsg{T: "smith", Op: "enhance", ItemID: "ARM-CHS-001"})
	}
	if s.enh["ARM-CHS-001"] < 3 || s.inv["ARM-CHS-001"] != 1 {
		t.Fatalf("enhance level %d inv %d", s.enh["ARM-CHS-001"], s.inv["ARM-CHS-001"])
	}
	if pl.Defense <= def0+4 {
		t.Fatal("enhancement should raise equipped stats")
	}
}

func TestMapTradeLootDropsOnFarmMaps(t *testing.T) {
	h, _, p := newTestHub(t)
	defer p.Close()
	c := NewClient(func(string) {})
	_ = h.join(JoinRequest{Account: &store.Account{ID: 9, Role: "player"}, Character: &store.Character{ID: 9, Name: "Farmer", Weapon: "sword", Level: 1, MapID: "FARM-01"}, Client: c})
	s := h.sessions["c9"]
	w := h.World("FARM-01")
	pl := w.Player("c9")
	pl.GodMode = true
	trd := 0
	for k := 0; k < 6; k++ {
		var target *game.Monster
		for _, m := range w.Monsters {
			if m.Alive() {
				target = m
				break
			}
		}
		pl.Pos = game.Vec{X: target.Pos.X - 20, Y: target.Pos.Y}
		for i := 0; i < 4000 && target.Alive(); i++ {
			s.aim = &target.Pos
			s.actions = []game.ActionRequest{{Type: "attack", Slot: "basic"}}
			h.step(1000.0 / 30)
		}
		for _, d := range w.DropsOf("c9") {
			for _, it := range d.Items {
				if h.c.Items[it.ItemID].SourceMap == "FARM-01" {
					trd++
				}
			}
		}
	}
	if trd == 0 {
		t.Fatal("no FARM-01 trade loot dropped in 6 kills")
	}
}

func TestQuestAcceptKillTurnIn(t *testing.T) {
	h, _, p := newTestHub(t)
	defer p.Close()
	c, s, pl := joinWith(t, h, 1, "player", "sword", nil)
	drain(c)
	h.onMessage(s, clientMsg{T: "quest", Op: "accept", ItemID: "Q-MAIN-001"})
	if s.quests["Q-MAIN-001"] != nil {
		t.Fatal("accepting away from the Quest Board must fail")
	}
	standAt(h, pl, "questboard")
	h.onMessage(s, clientMsg{T: "quest", Op: "accept", ItemID: "Q-MAIN-002"})
	if s.quests["Q-MAIN-002"] != nil {
		t.Fatal("prerequisite not done: must be locked")
	}
	h.onMessage(s, clientMsg{T: "quest", Op: "accept", ItemID: "Q-MAIN-001"})
	h.onMessage(s, clientMsg{T: "quest", Op: "turnin", ItemID: "Q-MAIN-001"})
	if s.quests["Q-MAIN-001"].Status != "active" {
		t.Fatal("cannot turn in before objectives are done")
	}
	for i := 0; i < 5; i++ {
		h.questEvent(s, "kill", "MON-SLIME-001")
	}
	h.questEvent(s, "kill", "MON-WOLF-001") // not a target
	gold, xp := s.gold, s.xp
	h.onMessage(s, clientMsg{T: "quest", Op: "turnin", ItemID: "Q-MAIN-001"})
	if s.quests["Q-MAIN-001"].Status != "completed" || s.gold != gold+50 || s.xp != xp+120 || s.inv["CON-001"] != 3 {
		t.Fatalf("turn-in: %+v gold %d xp %d inv %v", s.quests["Q-MAIN-001"], s.gold, s.xp, s.inv)
	}
	h.onMessage(s, clientMsg{T: "quest", Op: "accept", ItemID: "Q-MAIN-001"})
	if s.quests["Q-MAIN-001"].Status != "completed" {
		t.Fatal("non-repeatable quest cannot be taken again")
	}
	// collect quest consumes items at turn-in; talk objective counts NPC talks
	s.inv["TRD-F01-001"] = 5
	h.onMessage(s, clientMsg{T: "quest", Op: "accept", ItemID: "Q-SIDE-001"})
	h.onMessage(s, clientMsg{T: "quest", Op: "turnin", ItemID: "Q-SIDE-001"})
	if s.inv["TRD-F01-001"] != 0 || s.quests["Q-SIDE-001"].Status != "completed" {
		t.Fatal("collect quest should consume items")
	}
	h.onMessage(s, clientMsg{T: "quest", Op: "accept", ItemID: "Q-SIDE-001"})
	if s.quests["Q-SIDE-001"].Status != "active" {
		t.Fatal("repeatable quest can be accepted again")
	}
}
