package game

import (
	"math"
	"sort"
)

// AutoSettings are player-configurable (validated and clamped by Sanitize).
type AutoSettings struct {
	RadiusTiles    float64  `json:"radiusTiles"`    // [TUNING] 5..25
	UseSkills      bool     `json:"useSkills"`      // AUTO_SKILL
	SkillOrder     []string `json:"skillOrder"`     // slots: skill1..3, p1..p5, ult
	AutoPotion     bool     `json:"autoPotion"`     // AUTO_POTION
	PotionPct      float64  `json:"potionPct"`      // 0.1..0.8
	AutoLoot       bool     `json:"autoLoot"`       // AUTO_LOOT
	LootCategories []string `json:"lootCategories"` // e.g. TRD, CON, MAT, PWR, WPN (empty = all)
	Targets        []string `json:"targets"`        // monster def ids (empty = any normal monster)
	Blacklist      []string `json:"blacklist"`
	StopNoPotion   bool     `json:"stopNoPotion"` // safety stop when HP low and no potions
	MaxMinutes     float64  `json:"maxMinutes"`   // 0 = unlimited
}

var allowedAutoSlots = map[string]bool{"skill1": true, "skill2": true, "skill3": true, "p1": true, "p2": true, "p3": true, "p4": true, "p5": true, "ult": true}

func clampF(v, lo, hi float64) float64 { return math.Max(lo, math.Min(hi, v)) }

func DefaultAutoSettings() AutoSettings {
	return AutoSettings{RadiusTiles: 10, UseSkills: true, SkillOrder: []string{"skill1", "skill2", "skill3", "p1", "p2", "p3", "p4", "p5"},
		AutoPotion: true, PotionPct: 0.4, AutoLoot: true, StopNoPotion: true}
}

func (s AutoSettings) Sanitize() AutoSettings {
	s.RadiusTiles = clampF(s.RadiusTiles, 5, 25)
	s.PotionPct = clampF(s.PotionPct, 0.1, 0.8)
	s.MaxMinutes = clampF(s.MaxMinutes, 0, 600)
	var order []string
	seen := map[string]bool{}
	for _, x := range s.SkillOrder {
		if allowedAutoSlots[x] && !seen[x] && len(order) < 9 {
			order = append(order, x)
			seen[x] = true
		}
	}
	s.SkillOrder = order
	if len(s.Targets) > 20 {
		s.Targets = s.Targets[:20]
	}
	if len(s.Blacklist) > 20 {
		s.Blacklist = s.Blacklist[:20]
	}
	if len(s.LootCategories) > 12 {
		s.LootCategories = s.LootCategories[:12]
	}
	return s
}

// AutoReport is produced from server-side counters when Auto stops (spec §9.2).
type AutoReport struct {
	Reason      string         `json:"reason"`
	DurationMs  float64        `json:"durationMs"`
	Kills       int            `json:"kills"`
	XP          int64          `json:"xp"`
	Gold        int64          `json:"gold"`
	Items       map[string]int `json:"items"`
	PotionsUsed int            `json:"potionsUsed"`
}

// AutoState is the server-side Auto Farm controller for one player. It only ever produces the
// same intents a human could send (move/aim/attack), so every rule in World still applies.
type AutoState struct {
	Settings  AutoSettings
	Enabled   bool
	Anchor    Vec
	StartedAt float64
	Report    AutoReport
	target    string
}

func (a *AutoState) Start(p *Player, now float64, s AutoSettings) {
	a.Settings = s.Sanitize()
	a.Enabled = true
	a.Anchor = p.Pos
	a.StartedAt = now
	a.target = ""
	a.Report = AutoReport{Items: map[string]int{}}
}

func (a *AutoState) Stop(now float64, reason string) AutoReport {
	a.Enabled = false
	a.Report.Reason = reason
	a.Report.DurationMs = now - a.StartedAt
	return a.Report
}

func contains(l []string, s string) bool {
	for _, x := range l {
		if x == s {
			return true
		}
	}
	return false
}

// pickTarget: nearest legal PvE monster inside the anchor radius. Never players (no Auto PvP),
// never passive dummies, never Map/World bosses (no auto hunting of bosses — spec §9.3).
func (a *AutoState) pickTarget(w *World, p *Player) *Monster {
	radius := a.Settings.RadiusTiles * w.Grid.TileSize
	if cur := w.monsterByID(a.target); cur != nil && cur.Alive() && cur.AI != "RESET" && Dist(cur.Pos, a.Anchor) <= radius {
		return cur
	}
	var cands []*Monster
	for _, m := range w.Monsters {
		if !m.Alive() || m.Def.Passive || m.AI == "RESET" || m.Def.Tier == "Map Boss" || m.Def.Tier == "World Boss" {
			continue
		}
		if Dist(m.Pos, a.Anchor) > radius || contains(a.Settings.Blacklist, m.Def.ID) {
			continue
		}
		if len(a.Settings.Targets) > 0 && !contains(a.Settings.Targets, m.Def.ID) {
			continue
		}
		cands = append(cands, m)
	}
	sort.Slice(cands, func(i, j int) bool { return Dist(cands[i].Pos, p.Pos) < Dist(cands[j].Pos, p.Pos) })
	if len(cands) == 0 {
		a.target = ""
		return nil
	}
	a.target = cands[0].ID
	return cands[0]
}

func (w *World) monsterByID(id string) *Monster {
	if id == "" {
		return nil
	}
	for _, m := range w.Monsters {
		if m.ID == id {
			return m
		}
	}
	return nil
}

func (w *World) actionRange(p *Player, slot string) float64 {
	def, _, _ := w.resolveAction(p, ActionRequest{Type: map[bool]string{true: "power", false: "attack"}[slot == "ult" || (len(slot) == 2 && slot[0] == 'p')], Slot: slot})
	if def == nil || len(def.Hits) == 0 {
		return 0
	}
	h := def.Hits[0]
	switch h.Shape {
	case "projectile":
		return h.Range * 0.8
	case "circle":
		if h.AtAim {
			return h.Range
		}
		return h.Radius
	}
	return h.Radius
}

func (w *World) canUse(p *Player, slot string) bool {
	req := ActionRequest{Type: "attack", Slot: slot}
	if slot == "ult" || (len(slot) == 2 && slot[0] == 'p') {
		req.Type = "power"
	}
	def, _, why := w.resolveAction(p, req)
	if def == nil || why != "" || len(def.Hits) == 0 {
		return false
	}
	return w.cooldownReady(p, def.ID) && p.Stamina >= def.StaminaCost && p.Energy >= def.EnergyCost
}

// Decide returns the intent for this tick, plus a non-empty stop reason when Auto must stop.
// hasPotion reports inventory state from the server; wantLoot filters drops by category.
func (a *AutoState) Decide(w *World, p *Player, hasPotion bool, lootOK func(*LootDrop) bool) (Input, string) {
	in := Input{}
	if !p.Alive() {
		return in, "" // respawn keeps auto on; it resumes from the anchor after respawn
	}
	if a.Settings.MaxMinutes > 0 && w.Time-a.StartedAt >= a.Settings.MaxMinutes*60000 {
		return in, "time-limit"
	}
	hpPct := p.Hp / p.MaxHp
	if a.Settings.AutoPotion && hpPct < a.Settings.PotionPct && hasPotion && w.cooldownReady(p, "potion") {
		in.Actions = append(in.Actions, ActionRequest{Type: "potion"})
	}
	if a.Settings.StopNoPotion && hpPct < 0.15 && !hasPotion {
		return in, "safety-low-hp"
	}
	// auto loot: walk to own drops inside the radius when not fighting
	radius := a.Settings.RadiusTiles * w.Grid.TileSize
	m := a.pickTarget(w, p)
	if a.Settings.AutoLoot && (m == nil || m.AI == "IDLE" || m.AI == "PATROL") {
		for _, d := range w.DropsOf(p.ID) {
			if Dist(d.Pos, a.Anchor) <= radius && lootOK(d) {
				if Dist(d.Pos, p.Pos) > pickupRange-6 {
					in.Move = d.Pos.Sub(p.Pos).Normalize()
				}
				return in, ""
			}
		}
	}
	if m == nil {
		if Dist(p.Pos, a.Anchor) > 12 { // return to anchor; never leaves the map by itself
			in.Move = a.Anchor.Sub(p.Pos).Normalize()
		}
		return in, ""
	}
	d := Dist(p.Pos, m.Pos)
	aim := m.Pos
	in.Aim = &aim
	if a.Settings.UseSkills {
		for _, slot := range a.Settings.SkillOrder {
			if w.canUse(p, slot) && d <= w.actionRange(p, slot)+m.Def.Radius {
				t := "attack"
				if slot == "ult" || slot[0] == 'p' {
					t = "power"
				}
				in.Actions = append(in.Actions, ActionRequest{Type: t, Slot: slot})
				return in, ""
			}
		}
	}
	if d <= w.basicRange(p)+m.Def.Radius-1 {
		in.Actions = append(in.Actions, ActionRequest{Type: "attack", Slot: "basic"})
	} else {
		in.Move = m.Pos.Sub(p.Pos).Normalize()
	}
	return in, ""
}

func (w *World) basicRange(p *Player) float64 {
	if p.Weapon.BasicAttack == nil || len(p.Weapon.BasicAttack.Hits) == 0 {
		return 20
	}
	h := p.Weapon.BasicAttack.Hits[0]
	if h.Shape == "projectile" {
		return h.Range * 0.8
	}
	return h.Radius
}
