package game

import (
	"testing"

	"github.com/phuthanet9870-cpu/game-online/server/internal/content"
)

func dmgEvents(w *World, target string) int {
	n := 0
	for _, e := range w.DrainEvents() {
		if e.Type == "damage" && e.TargetID == target {
			n++
		}
	}
	return n
}

// Every one of the 6 LOCKED weapons has exactly 3 working skills (each lands damage) + a basic.
func TestAllSixWeaponsAndEighteenSkillsFunction(t *testing.T) {
	for _, wid := range []string{"staff", "sword", "dagger", "bow", "grimoire", "gauntlet"} {
		for _, slot := range []string{"basic", "skill1", "skill2", "skill3"} {
			w := arena(t, at("d", "MON-DUMMY-001", 6, 6))
			p := w.AddPlayer(PlayerInit{ID: "p", Name: "P", WeaponID: wid, Level: 1})
			if len(p.Weapon.Skills) != 3 {
				t.Fatalf("%s has %d skills", wid, len(p.Weapon.Skills))
			}
			dummy := w.Monsters[0]
			p.Pos = Vec{dummy.Pos.X - 24, dummy.Pos.Y}
			def, _, _ := w.resolveAction(p, ActionRequest{Type: "attack", Slot: slot})
			if def == nil {
				t.Fatalf("%s %s unresolved", wid, slot)
			}
			w.Step(dt, map[string]Input{"p": {Aim: &dummy.Pos, Actions: []ActionRequest{{Type: "attack", Slot: slot}}}})
			if def.Counter != nil { // Counter Slash: verified against a real attacker in TestThreeSwordSkillsAndDashStamina/hub tests
				if p.CombatState != "counter" {
					t.Fatalf("counter stance not entered: %s", p.CombatState)
				}
				continue
			}
			run(w, 1500, nil)
			n, selfStatus := 0, 0
			for _, e := range w.DrainEvents() {
				if e.Type == "damage" && e.TargetID == "d" {
					n++
				}
				if e.Type == "status" && e.TargetID == "p" {
					selfStatus++
				}
			}
			selfBuff := len(def.Hits) == 0
			if !selfBuff && n == 0 {
				t.Fatalf("%s %s (%s) dealt no damage", wid, slot, def.Name)
			}
			if selfBuff && selfStatus == 0 {
				t.Fatalf("%s %s (%s) applied no self status", wid, slot, def.Name)
			}
		}
	}
}

func TestProjectileStopsAtWallsAndPierce(t *testing.T) {
	w := arena(t, at("a", "MON-DUMMY-001", 6, 6), at("b", "MON-DUMMY-001", 8, 6))
	p := w.AddPlayer(PlayerInit{ID: "p", Name: "P", WeaponID: "bow", Level: 1})
	p.Pos = Vec{3*16 + 8, 6*16 + 8}
	far := Vec{10*16 + 8, 6*16 + 8}
	// Piercing Arrow passes through both dummies
	w.Step(dt, map[string]Input{"p": {Aim: &far, Actions: []ActionRequest{{Type: "attack", Slot: "skill1"}}}})
	run(w, 1500, nil)
	ev := w.DrainEvents()
	hit := map[string]bool{}
	for _, e := range ev {
		if e.Type == "damage" {
			hit[e.TargetID] = true
		}
	}
	if !hit["a"] || !hit["b"] {
		t.Fatalf("piercing arrow hits %v", hit)
	}
	if len(w.Projectiles) != 0 {
		t.Fatal("projectile should expire")
	}
}

func bindPower(t *testing.T, w *World, p *Player, id string, points int) {
	def := w.C.Power(id)
	if def == nil {
		t.Fatal("no power " + id)
	}
	w.BindPower(p, def, points, Loadout{})
}

func TestPowerRequiresStanceEnergyAndAllowedWeapon(t *testing.T) {
	w := arena(t, at("d", "MON-DUMMY-001", 5, 6))
	p := w.AddPlayer(PlayerInit{ID: "p", Name: "P", WeaponID: "sword", Level: 1})
	bindPower(t, w, p, "abyss_shadow", 0)
	// Abyss Shadow is Dagger-only: stance must be refused with a sword
	w.Step(dt, map[string]Input{"p": {Actions: []ActionRequest{{Type: "stance"}}}})
	if p.Power.Stance {
		t.Fatal("abyss stance must not activate with a sword")
	}
	if err := w.EquipWeapon(p, "dagger"); err != nil {
		t.Fatal(err)
	}
	w.Step(dt, map[string]Input{"p": {Actions: []ActionRequest{{Type: "power", Slot: "p1"}}}})
	if len(p.cooldowns) != 0 && p.cooldowns["abyss_shadow_shadow_cut"] > 0 {
		t.Fatal("power skill must not fire without stance")
	}
	w.Step(dt, map[string]Input{"p": {Actions: []ActionRequest{{Type: "stance"}}}})
	if !p.Power.Stance {
		t.Fatal("stance should activate with dagger")
	}
	before := p.Energy
	m := w.Monsters[0]
	w.Step(dt, map[string]Input{"p": {Aim: &m.Pos, Actions: []ActionRequest{{Type: "power", Slot: "p1"}}}})
	if p.Energy >= before {
		t.Fatal("power skill must cost energy")
	}
	run(w, 500, nil)
	if dmgEvents(w, "d") == 0 {
		t.Fatal("shadow cut dealt no damage")
	}
	// switching to an incompatible weapon drops the stance immediately
	_ = w.EquipWeapon(p, "bow")
	if p.Power.Stance {
		t.Fatal("stance must drop on incompatible weapon")
	}
}

func TestLoadoutLimitsAndProficiencyUnlocks(t *testing.T) {
	w := arena(t)
	p := w.AddPlayer(PlayerInit{ID: "p", Name: "P", WeaponID: "sword", Level: 1})
	bindPower(t, w, p, "inferno", 0)
	def := p.Power.Def
	if len(def.Active) != 15 || len(def.Ultimate) != 5 || len(def.Passive) != 5 {
		t.Fatal("inferno must be 15/5/5")
	}
	lo := p.Power.Loadout
	if len(lo.Actives) != 5 || lo.Ultimate == "" || len(lo.Passives) != 1 {
		t.Fatalf("rank 1 default loadout %+v (expect 5/1/1)", lo)
	}
	// rank 2 unlocks a second passive -> full 5/1/2
	p.Power.Points = w.C.Powers.Proficiency.Ranks[1].Points
	full := w.SanitizeLoadout(p.Power, Loadout{
		Actives:  []string{def.Active[0].ID, def.Active[1].ID, def.Active[2].ID, def.Active[3].ID, def.Active[4].ID, def.Active[5].ID},
		Ultimate: def.Ultimate[0].ID,
		Passives: []string{def.Passive[0].ID, def.Passive[1].ID, def.Passive[2].ID},
	})
	if len(full.Actives) != 5 || full.Ultimate == "" || len(full.Passives) != 2 {
		t.Fatalf("loadout must be capped at 5/1/2, got %+v", full)
	}
	// unimplemented / locked / duplicate skills are dropped
	bad := w.SanitizeLoadout(p.Power, Loadout{Actives: []string{def.Active[14].ID, def.Active[0].ID, def.Active[0].ID}, Ultimate: def.Ultimate[4].ID})
	if len(bad.Actives) != 1 || bad.Ultimate != "" {
		t.Fatalf("sanitize failed: %+v", bad)
	}
}

func TestProficiencyRankUp(t *testing.T) {
	w := arena(t, at("d", "MON-DUMMY-001", 5, 6))
	p := w.AddPlayer(PlayerInit{ID: "p", Name: "P", WeaponID: "sword", Level: 1})
	bindPower(t, w, p, "inferno", w.C.Powers.Proficiency.Ranks[1].Points-1)
	p.Power.Stance = true
	m := w.Monsters[0]
	w.Step(dt, map[string]Input{"p": {Aim: &m.Pos, Actions: []ActionRequest{{Type: "power", Slot: "p2"}}}})
	run(w, 400, nil)
	ranked := false
	for _, e := range w.DrainEvents() {
		if e.Type == "power-rank" && e.Rank == 2 && e.Only == "p" {
			ranked = true
		}
	}
	if !ranked {
		t.Fatalf("no rank-up event, points=%d", p.Power.Points)
	}
}

func TestPassiveIncreasesPowerDamage(t *testing.T) {
	hit := func(passives []string) int {
		w := arena(t, at("d", "MON-DUMMY-001", 5, 6))
		w.C.Player.CritChance = 0
		p := w.AddPlayer(PlayerInit{ID: "p", Name: "P", WeaponID: "sword", Level: 1})
		bindPower(t, w, p, "inferno", 200)
		p.Power.Loadout = w.SanitizeLoadout(p.Power, Loadout{Actives: []string{"inferno_burning_slash"}, Passives: passives})
		p.Power.Stance = true
		m := w.Monsters[0]
		w.Step(dt, map[string]Input{"p": {Aim: &m.Pos, Actions: []ActionRequest{{Type: "power", Slot: "p1"}}}})
		run(w, 300, nil)
		for _, e := range w.DrainEvents() {
			if e.Type == "damage" && e.ActionID == "inferno_burning_slash" {
				return e.Amount
			}
		}
		return 0
	}
	base, boosted := hit(nil), hit([]string{"inferno_pyromancer"})
	if base == 0 || boosted <= base {
		t.Fatalf("pyromancer: base %d boosted %d", base, boosted)
	}
}

func TestBurnTicksAndStealthDropsAggro(t *testing.T) {
	w := arena(t, at("w", "MON-WOLF-001", 5, 6))
	p := w.AddPlayer(PlayerInit{ID: "p", Name: "P", WeaponID: "dagger", Level: 1})
	run(w, 2200, nil)
	m := w.Monsters[0]
	w.applyStatus(&m.Statuses, content.StatusDef{ID: "burn", DurationMs: 2000}, p, m.Def.MaxHp)
	run(w, 1100, nil)
	dots := 0
	for _, e := range w.DrainEvents() {
		if e.Type == "damage" && e.ActionID == "dot:burn" {
			dots++
		}
	}
	if dots < 2 {
		t.Fatalf("burn ticks = %d", dots)
	}
	if m.Target != "p" {
		t.Fatalf("wolf should target the player, target=%q ai=%s", m.Target, m.AI)
	}
	bindPower(t, w, p, "abyss_shadow", 0)
	p.Power.Stance = true
	w.Step(dt, map[string]Input{"p": {Actions: []ActionRequest{{Type: "power", Slot: "p3"}}}}) // Smoke Veil
	run(w, 300, nil)
	if !p.HasStatus("stealth") || m.Target == "p" {
		t.Fatalf("stealth=%v target=%q", p.HasStatus("stealth"), m.Target)
	}
}

func TestMeteorTelegraphThenDelayedImpact(t *testing.T) {
	w := arena(t, at("d", "MON-DUMMY-001", 7, 6))
	p := w.AddPlayer(PlayerInit{ID: "p", Name: "P", WeaponID: "staff", Level: 1})
	bindPower(t, w, p, "inferno", 0)
	p.Power.Stance = true
	m := w.Monsters[0]
	w.Step(dt, map[string]Input{"p": {Aim: &m.Pos, Actions: []ActionRequest{{Type: "power", Slot: "ult"}}}})
	ev := w.DrainEvents()
	tele := false
	for _, e := range ev {
		if e.Type == "telegraph" {
			tele = true
		}
		if e.Type == "damage" {
			t.Fatal("meteor must not hit before the delay")
		}
	}
	run(w, 1200, nil)
	if !tele || dmgEvents(w, "d") == 0 {
		t.Fatal("meteor telegraph/impact missing")
	}
}

func TestAutoFarmKillsLegalTargetsAndRespectsStop(t *testing.T) {
	w := arena(t, at("s", "MON-SLIME-001", 7, 6), at("d", "MON-DUMMY-001", 4, 8))
	p := w.AddPlayer(PlayerInit{ID: "p", Name: "P", WeaponID: "sword", Level: 1})
	p.GodMode = true
	a := &AutoState{}
	a.Start(p, w.Time, DefaultAutoSettings())
	slime := w.Monsters[0]
	for i := 0; i < 2000 && slime.Alive(); i++ {
		in, stop := a.Decide(w, p, false, func(*LootDrop) bool { return true })
		if stop != "" {
			t.Fatalf("unexpected stop %s", stop)
		}
		w.Step(dt, map[string]Input{"p": in})
	}
	if slime.Alive() {
		t.Fatal("auto farm did not kill the slime")
	}
	for _, e := range w.DrainEvents() {
		if e.Type == "damage" && e.TargetID == "d" {
			t.Fatal("auto must never attack the passive training dummy")
		}
	}
	// safety stop: low HP and no potion
	p.GodMode = false
	p.Hp = p.MaxHp * 0.1
	if _, stop := a.Decide(w, p, false, func(*LootDrop) bool { return true }); stop != "safety-low-hp" {
		t.Fatalf("stop = %q", stop)
	}
	r := a.Stop(w.Time, "safety-low-hp")
	if r.Reason != "safety-low-hp" || r.DurationMs <= 0 {
		t.Fatalf("report %+v", r)
	}
	if s := (AutoSettings{RadiusTiles: 100, PotionPct: 5, SkillOrder: []string{"skill1", "hack", "skill1"}}).Sanitize(); s.RadiusTiles != 25 || s.PotionPct != 0.8 || len(s.SkillOrder) != 1 {
		t.Fatalf("sanitize %+v", s)
	}
}

func TestDropsArePersonal(t *testing.T) {
	w := arena(t)
	a := w.AddPlayer(PlayerInit{ID: "a", Name: "A", WeaponID: "sword", Level: 1})
	b := w.AddPlayer(PlayerInit{ID: "b", Name: "B", WeaponID: "sword", Level: 1})
	d := w.AddDrop(a, a.Pos, 5, nil, "tx", "m")
	if _, why := w.TakeDrop(b, d.ID, 0); why != "not-owner" {
		t.Fatalf("other player took drop: %s", why)
	}
	if got, why := w.TakeDrop(a, d.ID, 0); got == nil || why != "" {
		t.Fatalf("owner pickup failed: %s", why)
	}
	if got, _ := w.TakeDrop(a, d.ID, 0); got != nil {
		t.Fatal("drop picked up twice")
	}
}
