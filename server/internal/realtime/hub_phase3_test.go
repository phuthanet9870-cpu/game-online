package realtime

import (
	"encoding/json"
	"strings"
	"testing"

	"github.com/phuthanet9870-cpu/game-online/server/internal/game"
	"github.com/phuthanet9870-cpu/game-online/server/internal/store"
)

func joinWith(t *testing.T, h *Hub, charID int64, role, weapon string, items []store.ItemStack) (*Client, *session, *game.Player) {
	c := NewClient(func(string) {})
	err := h.join(JoinRequest{Account: &store.Account{ID: charID, Role: role}, Character: &store.Character{ID: charID, Name: "P" + string(rune('A'+charID)), Weapon: weapon, Level: 1},
		Items: items, Client: c})
	if err != nil {
		t.Fatal(err)
	}
	pid := PlayerID(charID)
	return c, h.sessions[pid], h.world.Player(pid)
}

func lastResult(c *Client, op string) map[string]any {
	var last map[string]any
	for _, m := range drain(c) {
		if m["t"] == "result" && m["op"] == op {
			last = m
		}
	}
	return last
}

func TestBindRequiresFruitAndAllowedWeaponThenSeverDestroys(t *testing.T) {
	h, fs, p := newTestHub(t)
	c, s, pl := joinWith(t, h, 1, "player", "sword", []store.ItemStack{{TemplateID: "PWR-003", Quantity: 1}, {TemplateID: "WPN-DGR-001", Quantity: 1}, {TemplateID: "WPN-SWD-001", Quantity: 1}})
	drain(c)
	// Abyss Shadow is Dagger-only
	h.onMessage(s, clientMsg{T: "bind", ItemID: "PWR-003"})
	if r := lastResult(c, "bind"); r == nil || r["ok"] != false || s.inv["PWR-003"] != 1 {
		t.Fatalf("bind with sword must fail and keep the fruit: %v inv=%v", r, s.inv)
	}
	h.onMessage(s, clientMsg{T: "equip", Weapon: "dagger"})
	h.onMessage(s, clientMsg{T: "bind", ItemID: "PWR-003"})
	if r := lastResult(c, "bind"); r == nil || r["ok"] != true || pl.Power == nil || s.inv["PWR-003"] != 0 {
		t.Fatalf("bind failed: %v", r)
	}
	// a second bind is refused (one power at a time)
	s.inv["PWR-001"] = 1
	h.onMessage(s, clientMsg{T: "bind", ItemID: "PWR-001"})
	if r := lastResult(c, "bind"); r["ok"] != false || s.inv["PWR-001"] != 1 {
		t.Fatal("second power must be refused without consuming the fruit")
	}
	// unbind only next to The Severer, with exact name confirmation
	h.onMessage(s, clientMsg{T: "unbind", Confirm: "Abyss Shadow"})
	if r := lastResult(c, "unbind"); r["ok"] != false || pl.Power == nil {
		t.Fatal("unbind away from the NPC must fail")
	}
	npc := h.c.NPC("severer")
	pl.Pos = game.Vec{X: npc.X + 10, Y: npc.Y}
	h.onMessage(s, clientMsg{T: "unbind", Confirm: "wrong"})
	if r := lastResult(c, "unbind"); r["ok"] != false {
		t.Fatal("unbind with wrong confirmation must fail")
	}
	h.onMessage(s, clientMsg{T: "unbind", Confirm: "abyss shadow"})
	if r := lastResult(c, "unbind"); r["ok"] != true || pl.Power != nil {
		t.Fatalf("unbind failed: %v", r)
	}
	p.Close()
	if strings.Join(fs.binds, ",") != "bind:abyss_shadow,destroy:abyss_shadow" || s.inv["PWR-003"] != 0 {
		t.Fatalf("persisted %v, fruit must not be refunded (inv %v)", fs.binds, s.inv)
	}
}

func TestEquipRequiresOwnedWeapon(t *testing.T) {
	h, _, p := newTestHub(t)
	defer p.Close()
	c, s, pl := joinWith(t, h, 1, "player", "sword", []store.ItemStack{{TemplateID: "WPN-SWD-001", Quantity: 1}})
	drain(c)
	h.onMessage(s, clientMsg{T: "equip", Weapon: "bow"})
	if lastResult(c, "equip")["ok"] != false || pl.Weapon.ID != "sword" {
		t.Fatal("equipping an unowned weapon must fail")
	}
}

func TestHotbarValidation(t *testing.T) {
	good := make([]hotbarSlot, 0, 20)
	keys := []string{"Digit1", "Digit2", "Digit3", "Digit4", "Digit5", "Digit6", "Digit7", "Digit8", "Digit9", "Digit0", "KeyQ", "KeyE", "KeyR", "KeyT", "KeyF", "KeyG", "KeyZ", "KeyX", "KeyC", "KeyV"}
	for i, a := range hotbarActions {
		good = append(good, hotbarSlot{Action: a, Key: keys[i]})
	}
	b, _ := json.Marshal(good)
	if !validHotbarJSON(b) {
		t.Fatal("default layout must be valid")
	}
	bad := append([]hotbarSlot{}, good...)
	bad[0].Key = "KeyW" // movement key reserved
	if b, _ := json.Marshal(bad); validHotbarJSON(b) {
		t.Fatal("WASD must be rejected")
	}
	bad = append([]hotbarSlot{}, good...)
	bad[1].Key = bad[0].Key
	if b, _ := json.Marshal(bad); validHotbarJSON(b) {
		t.Fatal("duplicate keys must be rejected")
	}
	if b, _ := json.Marshal(good[:19]); validHotbarJSON(b) {
		t.Fatal("must have exactly 20 slots")
	}
}

func TestGMSpawnDeniedForPlayersAllowedForGMInTestWorld(t *testing.T) {
	h, fs, p := newTestHub(t)
	c, s, _ := joinWith(t, h, 1, "player", "sword", nil)
	gc, gs, _ := joinWith(t, h, 2, "gm", "sword", nil)
	drain(c)
	drain(gc)
	n := len(h.world.Monsters)
	h.onMessage(s, clientMsg{T: "gm", Op: "spawnMonster", ItemID: "MON-SLIME-001", Count: 2})
	if len(h.world.Monsters) != n {
		t.Fatal("player must not spawn monsters")
	}
	h.onMessage(gs, clientMsg{T: "gm", Op: "spawnMonster", ItemID: "MON-SLIME-001", Count: 2})
	if len(h.world.Monsters) != n+2 {
		t.Fatal("gm spawn in test world should work")
	}
	h.cfg.TestWorld = false
	h.onMessage(gs, clientMsg{T: "gm", Op: "spawnMonster", ItemID: "MON-SLIME-001", Count: 1})
	if len(h.world.Monsters) != n+2 {
		t.Fatal("spawning must be refused outside the test world")
	}
	p.Close()
	results := map[string]int{}
	for _, a := range fs.audits {
		results[a.Result]++
	}
	if results["denied"] < 2 || results["ok"] < 1 {
		t.Fatalf("audits %v", results)
	}
}

func TestAutoStopsOnDisconnectAndReports(t *testing.T) {
	h, _, p := newTestHub(t)
	defer p.Close()
	c, s, _ := joinWith(t, h, 1, "player", "sword", nil)
	on := true
	h.onMessage(s, clientMsg{T: "auto", Enabled: &on})
	if !s.auto.Enabled {
		t.Fatal("auto should start")
	}
	for i := 0; i < 60; i++ {
		h.step(1000.0 / 30)
	}
	h.handle(leave{"c1", c})
	for i := 0; i < int(h.cfg.GraceMs/33)+40; i++ {
		h.step(1000.0 / 30)
	}
	if s.auto.Enabled || s.auto.Report.Reason != "disconnected" {
		t.Fatalf("auto must stop when the player disconnects: %+v", s.auto.Report)
	}
}
