package realtime

import (
	"strings"
	"testing"

	"github.com/phuthanet9870-cpu/game-online/server/internal/game"
)

func killAllTrash(w *game.World) {
	for _, m := range w.Monsters {
		m.Hp, m.AI = 0, "DEAD"
	}
}

func hitUntilDead(h *Hub, s *session, pl *game.Player, m *game.Monster) {
	pl.GodMode = true
	for i := 0; i < 4000 && m.Alive(); i++ {
		pl.Pos = game.Vec{X: m.Pos.X - 18, Y: m.Pos.Y}
		s.aim = &m.Pos
		s.actions = append(s.actions[:0], struct {
			Type string `json:"type"`
			Slot string `json:"slot,omitempty"`
		}{"attack", "basic"})
		h.step(1000.0 / 30)
	}
}

func TestDungeonSoloEntryOnlyViaGatekeeperBossLootAndExit(t *testing.T) {
	h, fs, p := newTestHub(t)
	c, s, pl := joinWith(t, h, 1, "player", "sword", nil)
	drain(c)
	for _, w := range h.worlds {
		if w.Map.Instanced() {
			t.Fatal("instance templates must not run as shared worlds")
		}
	}
	standAt(h, pl, "gatekeeper")
	h.onMessage(s, clientMsg{T: "dungeon", Op: "enter", ItemID: "DUN-N01"})
	if s.mapID != "CITY-AETHERIA" {
		t.Fatal("level requirement must block entry")
	}
	s.level = 3
	pl.Pos = game.Vec{X: 100, Y: 100}
	h.onMessage(s, clientMsg{T: "dungeon", Op: "enter", ItemID: "DUN-N01"})
	if s.mapID != "CITY-AETHERIA" {
		t.Fatal("entry must require standing at the Gatekeeper")
	}
	standAt(h, pl, "gatekeeper")
	h.onMessage(s, clientMsg{T: "dungeon", Op: "enter", ItemID: "DUN-N01"})
	if !strings.HasPrefix(s.mapID, "DUN-N01#") {
		t.Fatalf("not in an instance: %s", s.mapID)
	}
	key := s.mapID
	w := h.World(key)
	inst := h.dungeons[key]
	if w == nil || !w.NoRespawn || inst == nil || h.World("CITY-AETHERIA").Player("c1") != nil {
		t.Fatal("instance world not set up")
	}
	// Auto combat is refused inside the dungeon
	on := true
	h.onMessage(s, clientMsg{T: "auto", Enabled: &on})
	if s.auto.Enabled {
		t.Fatal("Auto Farm must be refused in a Normal Dungeon")
	}
	killAllTrash(w)
	h.step(1000.0 / 30)
	if inst.boss == nil || !inst.boss.Alive() {
		t.Fatal("boss should spawn after the halls are cleared")
	}
	pl = w.Player("c1")
	inst.boss.Hp = 30
	gold, xp := s.gold, s.xp
	hitUntilDead(h, s, pl, inst.boss)
	h.step(1000.0 / 30)
	if inst.state != "cleared" {
		t.Fatalf("state %s", inst.state)
	}
	if s.gold < gold+100+90 || s.xp < xp+250+450 { // completion + boss bag (Auto Loot)
		t.Fatalf("completion reward: gold %d→%d xp %d→%d", gold, s.gold, xp, s.xp)
	}
	if s.inv["MAT-ORE-002"] < 1 || s.inv["MAT-PWR-002"] < 2 {
		t.Fatalf("boss personal loot (auto-looted in the dungeon) expected, inv %v", s.inv)
	}
	inst.endedAt -= inst.def.ExitAfterClearMs
	h.step(1000.0 / 30)
	if s.mapID != "CITY-AETHERIA" || h.World(key) != nil || h.dungeons[key] != nil {
		t.Fatalf("after clear players return to the city and the instance closes (map %s)", s.mapID)
	}
	p.Close()
	paid := 0
	for id := range fs.rewards {
		if strings.HasPrefix(id, "dungeon:") {
			paid++
		}
	}
	if paid != 1 {
		t.Fatalf("completion ledger entries = %d", paid)
	}
}

func TestDungeonPartyReadyCheckAndRejoin(t *testing.T) {
	h, _, p := newTestHub(t)
	defer p.Close()
	ca, a, pa := joinWith(t, h, 1, "player", "sword", nil)
	cb, b, pb := joinWith(t, h, 2, "player", "sword", nil)
	a.level, b.level = 3, 3
	h.onMessage(a, clientMsg{T: "party", Op: "invite", Target: b.name})
	h.onMessage(b, clientMsg{T: "party", Op: "accept"})
	standAt(h, pa, "gatekeeper")
	standAt(h, pb, "gatekeeper")
	drain(ca)
	drain(cb)
	h.onMessage(b, clientMsg{T: "dungeon", Op: "enter", ItemID: "DUN-N01"})
	if len(h.ready) != 0 {
		t.Fatal("only the leader starts the dungeon")
	}
	h.onMessage(a, clientMsg{T: "dungeon", Op: "enter", ItemID: "DUN-N01"})
	if lastOf(cb, "ready") == nil || a.mapID != "CITY-AETHERIA" {
		t.Fatal("party entry needs a ready check first")
	}
	h.onMessage(b, clientMsg{T: "dungeon", Op: "ready"})
	if !strings.HasPrefix(a.mapID, "DUN-N01#") || a.mapID != b.mapID {
		t.Fatalf("both members should be in the same instance: %s %s", a.mapID, b.mapID)
	}
	key := a.mapID
	// member leaves to the city, the instance stays alive (A inside) and B can rejoin only at the Gatekeeper
	h.onMessage(b, clientMsg{T: "dungeon", Op: "leave"})
	if b.mapID != "CITY-AETHERIA" || h.World(key) == nil {
		t.Fatal("leave")
	}
	pb = h.World("CITY-AETHERIA").Player("c2")
	pb.Pos = game.Vec{X: 100, Y: 100}
	h.onMessage(b, clientMsg{T: "dungeon", Op: "rejoin"})
	if b.mapID != "CITY-AETHERIA" {
		t.Fatal("rejoin must go through the Gatekeeper")
	}
	standAt(h, pb, "gatekeeper")
	h.onMessage(b, clientMsg{T: "dungeon", Op: "enter", ItemID: "DUN-N01"})
	if b.mapID != "CITY-AETHERIA" {
		t.Fatal("a member with a live seat cannot open a second instance")
	}
	h.onMessage(b, clientMsg{T: "dungeon", Op: "rejoin"})
	if b.mapID != key {
		t.Fatal("rejoin into the same instance")
	}
	// disconnect inside keeps the seat (grace) and the instance alive
	h.handle(leave{a.pid, ca})
	h.handle(leave{b.pid, cb})
	inst := h.dungeons[key]
	d := *inst.def
	d.EmptyCloseMs = 0
	inst.def = &d
	h.step(1000.0 / 30)
	if h.World(key) == nil {
		t.Fatal("instance must survive while members are in the reconnect grace window")
	}
}
