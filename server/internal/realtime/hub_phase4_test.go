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
