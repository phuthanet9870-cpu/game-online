package game

import (
	"path/filepath"
	"runtime"
	"testing"

	"github.com/phuthanet9870-cpu/game-online/server/internal/content"
)

const dt = 1000.0 / 30

func loadContent(t *testing.T) *content.Content {
	t.Helper()
	_, file, _, _ := runtime.Caller(0)
	c, err := content.Load(filepath.Join(filepath.Dir(file), "../../../game-data"))
	if err != nil {
		t.Fatal(err)
	}
	return c
}

// arena replaces the map with an open 12x12 room (border walls) and the given monster spawns.
func arena(t *testing.T, spawns ...content.MonsterSpawn) *World {
	c := loadContent(t)
	m := *c.Map
	m.Width, m.Height = 12, 12
	m.Collision = make([]uint8, 144)
	for y := 0; y < 12; y++ {
		for x := 0; x < 12; x++ {
			if x == 0 || y == 0 || x == 11 || y == 11 {
				m.Collision[y*12+x] = 1
			}
		}
	}
	m.PlayerSpawn = [2]float64{3*16 + 8, 6*16 + 8}
	m.MonsterSpawns = spawns
	c.Map = &m
	return NewWorld(c, 1)
}

func at(id, mon string, tx, ty int) content.MonsterSpawn {
	return content.MonsterSpawn{ID: id, MonsterID: mon, X: float64(tx*16 + 8), Y: float64(ty*16 + 8)}
}

func run(w *World, ms float64, in map[string]Input) {
	for i := 0; i < int(ms/dt); i++ {
		w.Step(dt, in)
	}
}

func TestRngMatchesClientMulberry32(t *testing.T) {
	// Values produced by the client's createRng(1).next() — keeps server/client RNG identical.
	r := NewRng(1)
	got := []float64{r.Next(), r.Next(), r.Next()}
	want := []float64{0.6270739405881613, 0.002735721180215478, 0.5274470399599522}
	for i := range want {
		if got[i] != want[i] {
			t.Fatalf("rng[%d] = %v want %v", i, got[i], want[i])
		}
	}
}

func TestMoveSpeedIsServerSideAndClamped(t *testing.T) {
	w := arena(t)
	p := w.AddPlayer(PlayerInit{ID: "p1", Name: "A", WeaponID: "sword", Level: 1})
	start := p.Pos
	// a cheating client sends a huge vector: it must be clamped to unit length
	run(w, 500, map[string]Input{"p1": {Move: Vec{50, 0}}})
	moved := p.Pos.X - start.X
	max := w.C.Player.MoveSpeed*0.5 + 4
	if moved > max || moved < w.C.Player.MoveSpeed*0.5-4 {
		t.Fatalf("moved %v, expected about %v", moved, w.C.Player.MoveSpeed*0.5)
	}
	if ClampUnit(Vec{X: nan(), Y: 0}) != (Vec{}) {
		t.Fatal("NaN input must be zeroed")
	}
}

func nan() float64 { var z float64; return z / z }

func TestWallsBlock(t *testing.T) {
	w := arena(t)
	p := w.AddPlayer(PlayerInit{ID: "p1", Name: "A", WeaponID: "sword", Level: 1})
	run(w, 4000, map[string]Input{"p1": {Move: Vec{-1, 0}}})
	if p.Pos.X < 16+w.C.Player.Radius-0.01 {
		t.Fatalf("walked through wall: %v", p.Pos)
	}
}

func TestKillGrantsRewardToContributorsOnly(t *testing.T) {
	w := arena(t, at("s1", "MON-SLIME-001", 5, 6))
	a := w.AddPlayer(PlayerInit{ID: "a", Name: "A", WeaponID: "sword", Level: 1})
	b := w.AddPlayer(PlayerInit{ID: "b", Name: "B", WeaponID: "sword", Level: 1})
	b.Pos = Vec{9*16 + 8, 9*16 + 8} // far away, never hits
	a.GodMode = true
	m := w.Monsters[0]
	for i := 0; i < 3000 && m.Alive(); i++ {
		w.Step(dt, map[string]Input{"a": {Aim: &m.Pos, Actions: []ActionRequest{{Type: "attack", Slot: "basic"}}}})
	}
	if m.Alive() {
		t.Fatal("slime did not die")
	}
	r := w.DrainRewards()
	if len(r) != 1 || len(r[0].PlayerIDs) != 1 || r[0].PlayerIDs[0] != "a" {
		t.Fatalf("rewards = %+v", r)
	}
	run(w, m.Def.RespawnMs+200, nil)
	if !m.Alive() || m.Hp != m.Def.MaxHp {
		t.Fatal("slime did not respawn")
	}
}

func TestThreeSwordSkillsAndDashStamina(t *testing.T) {
	w := arena(t, at("w1", "MON-WOLF-001", 5, 6))
	p := w.AddPlayer(PlayerInit{ID: "p", Name: "P", WeaponID: "sword", Level: 1})
	m := w.Monsters[0]
	w.Step(dt, map[string]Input{"p": {Aim: &m.Pos, Actions: []ActionRequest{{Type: "attack", Slot: "skill1"}}}})
	run(w, 700, nil)
	hits := 0
	for _, e := range w.DrainEvents() {
		if e.Type == "damage" && e.TargetID == "w1" {
			hits++
		}
	}
	if hits != 3 {
		t.Fatalf("triple slash hits = %d", hits)
	}
	before := p.Stamina
	w.Step(dt, map[string]Input{"p": {Move: Vec{0, 1}, Actions: []ActionRequest{{Type: "dash"}}}})
	if before-p.Stamina < w.C.Player.Dash.StaminaCost-1 {
		t.Fatalf("dash did not spend stamina: %v -> %v", before, p.Stamina)
	}
	run(w, 700, nil)
	w.DrainEvents()
	p.Stamina = 5
	p.staminaSpentAt = w.Time
	w.Step(dt, map[string]Input{"p": {Actions: []ActionRequest{{Type: "dash"}}}})
	rejected := false
	for _, e := range w.DrainEvents() {
		if e.Type == "rejected" && e.Only == "p" {
			rejected = true
		}
	}
	if !rejected {
		t.Fatal("dash with low stamina must be rejected")
	}
}

func TestPlayerDeathAndRespawn(t *testing.T) {
	w := arena(t, at("w1", "MON-WOLF-001", 4, 6))
	p := w.AddPlayer(PlayerInit{ID: "p", Name: "P", WeaponID: "sword", Level: 1})
	run(w, 2100, nil) // spawn protection
	p.Hp = 1
	run(w, 3000, nil)
	if p.CharState != "DEAD" && w.Time < p.RespawnAt {
		t.Fatalf("state %s", p.CharState)
	}
	run(w, 4000, nil)
	if !p.Alive() || p.Hp < p.MaxHp*0.9 {
		t.Fatalf("not respawned: %s hp=%v", p.CharState, p.Hp)
	}
}

func TestPotionUsesInventoryHook(t *testing.T) {
	w := arena(t)
	p := w.AddPlayer(PlayerInit{ID: "p", Name: "P", WeaponID: "sword", Level: 1})
	owned := 1
	w.ConsumeItem = func(_ *Player, _ string) bool {
		if owned <= 0 {
			return false
		}
		owned--
		return true
	}
	p.Hp = 10
	w.Step(dt, map[string]Input{"p": {Actions: []ActionRequest{{Type: "potion"}}}})
	if p.Hp <= 10 || owned != 0 {
		t.Fatalf("potion not used: hp=%v owned=%d", p.Hp, owned)
	}
	p.Hp = 10
	run(w, 11000, nil)
	p.Hp = 10
	w.Step(dt, map[string]Input{"p": {Actions: []ActionRequest{{Type: "potion"}}}})
	if p.Hp > 11 {
		t.Fatal("potion used without owning one")
	}
}

func TestWeaponFallsBackToSwordBeforePhase3(t *testing.T) {
	w := arena(t)
	p := w.AddPlayer(PlayerInit{ID: "p", Name: "P", WeaponID: "bow", Level: 1})
	if p.Weapon.ID != "sword" {
		t.Fatalf("weapon %s", p.Weapon.ID)
	}
}

func TestRollLootDeterministic(t *testing.T) {
	c := loadContent(t)
	a := RollLoot(c.Drops["MON-SLIME-001"], NewRng(9))
	b := RollLoot(c.Drops["MON-SLIME-001"], NewRng(9))
	if a.Gold != b.Gold || len(a.Items) != len(b.Items) || a.Gold < 2 || a.Gold > 5 {
		t.Fatalf("%+v %+v", a, b)
	}
}
