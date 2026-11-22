// Package game is the authoritative real-time simulation. It mirrors the client's
// apps/web-game/src/core/simulation.ts (offline sandbox) and is fully data-driven by game-data/.
// Events use the same JSON shape as the client's SimEvent so the browser renders server results.
package game

import (
	"fmt"
	"math"
	"sort"

	"github.com/phuthanet9870-cpu/game-online/server/internal/content"
)

const (
	bufferMs        = 220
	knockbackMs     = 140
	staggerMs       = 450
	counterIFrameMs = 300
	recapWindowMs   = 10_000
	blinkIFrameMs   = 200
	pickupRange     = 28
	dropLifetimeMs  = 60_000
)

type Event struct {
	Type       string   `json:"type"`
	Time       float64  `json:"time"`
	SourceID   string   `json:"sourceId,omitempty"`
	TargetID   string   `json:"targetId,omitempty"`
	Amount     int      `json:"amount,omitempty"`
	IsCrit     bool     `json:"isCrit,omitempty"`
	Pos        *Vec     `json:"pos,omitempty"`
	ActionID   string   `json:"actionId,omitempty"`
	Reason     string   `json:"reason,omitempty"`
	EntityID   string   `json:"entityId,omitempty"`
	KillerID   string   `json:"killerId,omitempty"`
	Slot       string   `json:"slot,omitempty"`
	Angle      *float64 `json:"angle,omitempty"`
	Origin     *Vec     `json:"origin,omitempty"`
	Radius     float64  `json:"radius,omitempty"`
	ArcDeg     float64  `json:"arcDeg,omitempty"`
	From       any      `json:"from,omitempty"`
	To         string   `json:"to,omitempty"`
	Dir        *Vec     `json:"dir,omitempty"`
	Action     string   `json:"action,omitempty"`
	StatusID   string   `json:"statusId,omitempty"`
	DurationMs float64  `json:"durationMs,omitempty"`
	AttackerID string   `json:"attackerId,omitempty"`
	WindupMs   float64  `json:"windupMs,omitempty"`
	ProjID     string   `json:"projId,omitempty"`
	Speed      float64  `json:"speed,omitempty"`
	Range      float64  `json:"range,omitempty"`
	On         *bool    `json:"on,omitempty"`
	Rank       int      `json:"rank,omitempty"`
	Weapon     string   `json:"weapon,omitempty"`
	// Only, when set, restricts delivery to that player (e.g. rejections, personal loot).
	Only string `json:"-"`
}

func fp(f float64) *float64 { return &f }
func vp(v Vec) *Vec         { return &v }
func bp(b bool) *bool       { return &b }

type ActionRequest struct {
	Type string `json:"type"`           // attack | dash | potion | power | stance
	Slot string `json:"slot,omitempty"` // attack: basic|skill1..3 ; power: p1..p5|ult
}

type Input struct {
	Move    Vec
	Aim     *Vec
	Actions []ActionRequest
}

// Status is an active effect instance on a player or monster.
type Status struct {
	ID         string  `json:"id"`
	ExpiresAt  float64 `json:"expiresAt"`
	DefenseMul float64 `json:"defenseMultiplier"`
	def        content.StatusDef
	sourceID   string
	sourceAtk  float64
	dotMod     float64
	nextTick   float64
	shield     float64
}

type RecapEntry struct {
	Time         float64 `json:"time"`
	AttackerID   string  `json:"attackerId"`
	AttackerName string  `json:"attackerName"`
	ActionID     string  `json:"actionId"`
	Amount       int     `json:"amount"`
	IsCrit       bool    `json:"isCrit"`
	Mitigation   float64 `json:"mitigation"`
}

type runningAction struct {
	Def        *content.ActionDef
	Slot       string
	Power      bool
	StartedAt  float64
	Angle      float64
	AimPoint   Vec
	HitsDone   int
	HitTargets []map[string]bool
	Countered  bool
	moved      bool
	selfDone   int
	profGained int
}

type dashState struct {
	Dir             Vec
	StartedAt, Ends float64
	Speed           float64
}

type buffered struct {
	Req     ActionRequest
	Aim     *Vec
	Expires float64
}

// Loadout is the equipped subset of a bound Power (LOCKED 5 active / 1 ultimate / 2 passive).
type Loadout struct {
	Actives  []string `json:"actives"`
	Ultimate string   `json:"ultimate"`
	Passives []string `json:"passives"`
}

type PowerState struct {
	Def     *content.PowerDef
	Points  int
	Loadout Loadout
	Stance  bool
}

type Player struct {
	ID          string
	CharacterID int64
	Name        string
	Weapon      *content.WeaponDef
	Level       int
	MaxHp       float64
	Attack      float64
	Defense     float64

	Pos                 Vec
	Facing              string
	AimAngle            float64
	Hp                  float64
	Stamina             float64
	Energy              float64
	staminaSpentAt      float64
	cooldowns           map[string]float64 // id -> readyAt
	cooldownDur         map[string]float64
	CharState           string
	CombatState         string
	action              *runningAction
	dash                *dashState
	InvulnerableUntil   float64
	SpawnProtectedUntil float64
	LastCombatAt        float64
	RespawnAt           float64
	buffered            *buffered
	Moving              bool
	Statuses            []Status
	recent              []RecapEntry
	LastDeathRecap      []RecapEntry
	Connected           bool
	DisconnectedAt      float64
	currentMove         Vec
	Power               *PowerState
	// Equipment bonus (already includes enhancement) from the server inventory.
	BonusAtk, BonusDef, BonusHp float64
	// GodMode is a GM test flag; only settable through an authorised, audited GM command.
	GodMode bool
}

func (p *Player) Alive() bool { return p.CharState != "DEAD" && p.CharState != "RESPAWNING" }

func (p *Player) CooldownRemaining(id string, now float64) float64 {
	return math.Max(0, p.cooldowns[id]-now)
}
func (p *Player) CooldownDuration(id string) float64 { return p.cooldownDur[id] }

// ActionView describes the running action for snapshots.
func (p *Player) ActionView() (id string, startedAt, angle float64, ok bool) {
	if p.action == nil {
		return "", 0, 0, false
	}
	return p.action.Def.ID, p.action.StartedAt, p.action.Angle, true
}
func (p *Player) Dashing() bool { return p.dash != nil }
func (p *Player) InCombat(now, window float64) bool {
	return now-p.LastCombatAt < window
}

func hasStatus(st []Status, id string) bool {
	for _, s := range st {
		if s.ID == id {
			return true
		}
	}
	return false
}

func (p *Player) HasStatus(id string) bool { return hasStatus(p.Statuses, id) }

type Monster struct {
	ID              string
	Def             *content.MonsterDef
	Spawn           Vec
	Pos             Vec
	Hp              float64
	AI              string
	stateSince      float64
	stateUntil      float64
	patrolTarget    *Vec
	nextAttackAt    float64
	AttackStartedAt float64
	attackResolved  bool
	staggerUntil    float64
	FacingX         int
	knock           *struct{ vx, vy, until float64 }
	Statuses        []Status
	DiedAt          float64
	respawnAt       float64
	Target          string
	// Contribution is damage dealt per player since spawn (loot attribution, not last hit).
	Contribution map[string]float64
	DeathSeq     int
	// GM test spawns: no loot, removed after ExpiresAt.
	NoLoot    bool
	ExpiresAt float64
	removed   bool
}

func (m *Monster) Alive() bool { return m.AI != "DEAD" }

type Projectile struct {
	ID       string
	Owner    *Player
	Pos      Vec
	Dir      Vec
	Speed    float64
	Left     float64
	Radius   float64
	Hit      *content.HitDef
	ActionID string
	Power    bool
	hits     map[string]bool
	run      *runningAction
}

// LootDrop is a personal loot bag only its owner can see and pick up.
type LootDrop struct {
	ID        string     `json:"id"`
	Owner     string     `json:"-"`
	Pos       Vec        `json:"pos"`
	Gold      int64      `json:"gold"`
	Items     []LootItem `json:"items"`
	ExpiresAt float64    `json:"expiresAt"`
	MonsterID string     `json:"-"`
	TxID      string     `json:"-"`
}

// KillReward is emitted when a monster dies; the server turns it into persisted, idempotent rewards.
type KillReward struct {
	MonsterID  string
	MonsterDef string
	DeathSeq   int
	Pos        Vec
	PlayerIDs  []string // eligible contributors (>= min share)
}

type World struct {
	Map         *content.MapData
	NoRespawn   bool // instance maps: killed monsters stay dead
	Time        float64
	Grid        *Grid
	C           *content.Content
	Rng         *Rng
	players     map[string]*Player
	order       []string
	Monsters    []*Monster
	Projectiles []*Projectile
	Drops       map[string]*LootDrop
	events      []Event
	rewards     []KillReward
	spawn       Vec
	seq         int
	// ConsumeItem is called for potion use; returns false if the player owns none (server inventory).
	ConsumeItem func(p *Player, itemID string) bool
	// OnProficiency is called when a player's power proficiency points change.
	OnProficiency       func(p *Player)
	defenseK, maxDamage float64
}

func NewWorld(c *content.Content, seed uint32) *World { return NewWorldForMap(c, c.Map, seed) }

// NewWorldForMap creates an authoritative instance of one map (core map, dungeon or arena instance).
func NewWorldForMap(c *content.Content, m *content.MapData, seed uint32) *World {
	w := &World{
		Map:       m,
		Grid:      NewGrid(m.Width, m.Height, m.TileSize, m.Collision),
		C:         c,
		Rng:       NewRng(seed),
		players:   map[string]*Player{},
		Drops:     map[string]*LootDrop{},
		spawn:     Vec{m.PlayerSpawn[0], m.PlayerSpawn[1]},
		defenseK:  c.Player.DefenseK,
		maxDamage: c.Player.MaxDamage,
	}
	for _, s := range m.MonsterSpawns {
		w.addMonster(s.ID, c.Monsters[s.MonsterID], Vec{s.X, s.Y})
	}
	return w
}

func (w *World) addMonster(id string, def *content.MonsterDef, at Vec) *Monster {
	m := &Monster{ID: id, Def: def, Spawn: at, Pos: at, Hp: def.MaxHp, AI: "IDLE", FacingX: 1, Contribution: map[string]float64{}}
	w.Monsters = append(w.Monsters, m)
	return m
}

func (w *World) nextID(prefix string) string {
	w.seq++
	return fmt.Sprintf("%s%d", prefix, w.seq)
}

// SpawnTestMonster adds a GM test monster (no loot, auto-removed after ttl ms). Test worlds only.
func (w *World) SpawnTestMonster(def *content.MonsterDef, at Vec, ttlMs float64) *Monster {
	if w.Grid.BoxCollides(at.X, at.Y, def.Radius) {
		at = w.spawn
	}
	m := w.addMonster(w.nextID("gm"), def, at)
	m.NoLoot = true
	m.ExpiresAt = w.Time + ttlMs
	w.emit(Event{Type: "spawn", Time: w.Time, EntityID: m.ID, Pos: vp(at), Action: def.ID})
	return m
}

// SpawnBoss adds a real (lootable) monster at a position, e.g. a dungeon boss after its objective.
func (w *World) SpawnBoss(def *content.MonsterDef, at Vec) *Monster {
	m := w.addMonster(w.nextID("boss"), def, at)
	w.emit(Event{Type: "spawn", Time: w.Time, EntityID: m.ID, Pos: vp(at), Action: def.ID})
	return m
}

func (w *World) SpawnPoint() Vec { return w.spawn }

/* ---------------------------------------------------------------- players */

type PlayerInit struct {
	ID          string
	CharacterID int64
	Name        string
	WeaponID    string
	Level       int
	Pos         *Vec
	Hp          float64
}

// StatsForLevel derives [TUNING] stats from base + per-level gains.
func (w *World) StatsForLevel(level int) (maxHp, atk, def float64) {
	b, pl := w.C.Player, w.C.Progression.PerLevel
	l := float64(level - 1)
	return b.MaxHp + pl.MaxHp*l, b.Attack + pl.Attack*l, b.Defense + pl.Defense*l
}

func (w *World) AddPlayer(in PlayerInit) *Player {
	weapon := w.C.Weapon(in.WeaponID)
	if weapon == nil || !weapon.Implemented {
		weapon = w.C.Weapon("sword")
	}
	maxHp, atk, def := w.StatsForLevel(in.Level)
	p := &Player{
		ID: in.ID, CharacterID: in.CharacterID, Name: in.Name, Weapon: weapon, Level: in.Level,
		MaxHp: maxHp, Attack: atk, Defense: def,
		Pos: w.spawn, Facing: "S", AimAngle: math.Pi / 2, Hp: maxHp,
		Stamina: w.C.Player.Stamina.Max, Energy: w.C.Powers.Energy.Max, staminaSpentAt: math.Inf(-1),
		cooldowns: map[string]float64{}, cooldownDur: map[string]float64{},
		CharState: "IN_WORLD", CombatState: "idle", LastCombatAt: math.Inf(-1), Connected: true,
	}
	if in.Pos != nil && !w.Grid.BoxCollides(in.Pos.X, in.Pos.Y, w.C.Player.Radius) {
		p.Pos = *in.Pos
	}
	if in.Hp > 0 {
		p.Hp = math.Min(in.Hp, maxHp)
	}
	p.InvulnerableUntil = w.Time + w.C.Player.SpawnProtectionMs
	p.SpawnProtectedUntil = p.InvulnerableUntil
	w.players[p.ID] = p
	w.order = append(w.order, p.ID)
	sort.Strings(w.order)
	return p
}

func (w *World) RemovePlayer(id string) {
	delete(w.players, id)
	for i, x := range w.order {
		if x == id {
			w.order = append(w.order[:i], w.order[i+1:]...)
			break
		}
	}
	for _, m := range w.Monsters {
		delete(m.Contribution, id)
		if m.Target == id {
			m.Target = ""
			if m.AI == "CHASE" || m.AI == "ATTACK" || m.AI == "ALERT" {
				w.setAi(m, "RESET")
			}
		}
	}
	for did, d := range w.Drops {
		if d.Owner == id {
			delete(w.Drops, did)
		}
	}
	kept := w.Projectiles[:0]
	for _, pr := range w.Projectiles {
		if pr.Owner.ID != id {
			kept = append(kept, pr)
		}
	}
	w.Projectiles = kept
}

func (w *World) Player(id string) *Player { return w.players[id] }

func (w *World) Players() []*Player {
	out := make([]*Player, 0, len(w.order))
	for _, id := range w.order {
		out = append(out, w.players[id])
	}
	return out
}

// SetLevel applies a level change (from XP rewards) and refreshes derived stats (full heal).
func (w *World) SetLevel(p *Player, level int) {
	p.Level = level
	w.Recalc(p)
	p.Hp = p.MaxHp
}

// SetEquipBonus updates equipment stats; HP keeps its ratio.
func (w *World) SetEquipBonus(p *Player, atk, def, hp float64) {
	p.BonusAtk, p.BonusDef, p.BonusHp = atk, def, hp
	w.Recalc(p)
}

// Recalc derives combat stats = level base + equipment ([TUNING] stat budget lives in item data).
func (w *World) Recalc(p *Player) {
	ratio := 1.0
	if p.MaxHp > 0 {
		ratio = p.Hp / p.MaxHp
	}
	maxHp, atk, def := w.StatsForLevel(p.Level)
	p.MaxHp, p.Attack, p.Defense = maxHp+p.BonusHp, atk+p.BonusAtk, def+p.BonusDef
	p.Hp = math.Min(p.MaxHp, math.Max(1, p.MaxHp*ratio))
}

// EquipWeapon switches weapon type. Cooldowns are kept (spec §6); an incompatible Power stance is
// switched off immediately. Caller validates ownership and the out-of-combat rule.
func (w *World) EquipWeapon(p *Player, weaponID string) error {
	wd := w.C.Weapon(weaponID)
	if wd == nil || !wd.Implemented {
		return fmt.Errorf("unknown weapon %s", weaponID)
	}
	p.Weapon = wd
	p.action, p.buffered = nil, nil
	if p.Power != nil && p.Power.Stance && !p.Power.Def.AllowsWeapon(weaponID) {
		p.Power.Stance = false
		w.emit(Event{Type: "stance", Time: w.Time, EntityID: p.ID, On: bp(false), Reason: "weapon"})
	}
	w.emit(Event{Type: "weapon", Time: w.Time, EntityID: p.ID, Weapon: weaponID})
	return nil
}

// BindPower attaches a Power (after the caller consumed the fruit item).
func (w *World) BindPower(p *Player, def *content.PowerDef, points int, lo Loadout) {
	p.Power = &PowerState{Def: def, Points: points}
	p.Power.Loadout = w.SanitizeLoadout(p.Power, lo)
	if len(p.Power.Loadout.Actives) == 0 && p.Power.Loadout.Ultimate == "" {
		p.Power.Loadout = w.DefaultLoadout(p.Power)
	}
}

// UnbindPower removes the Power entirely (the fruit is destroyed by the caller's transaction).
func (w *World) UnbindPower(p *Player) {
	if p.Power != nil && p.Power.Stance {
		w.emit(Event{Type: "stance", Time: w.Time, EntityID: p.ID, On: bp(false), Reason: "unbind"})
	}
	p.Power = nil
	p.action = nil
}

// Unlocked returns which skills of each category the current proficiency rank allows.
func (w *World) Unlocked(ps *PowerState) (act, ult, pas []content.ActionDef, rank content.RankDef) {
	rank = w.C.Powers.RankFor(ps.Points)
	cut := func(l []content.ActionDef, n int) []content.ActionDef {
		if n > len(l) {
			n = len(l)
		}
		return l[:n]
	}
	return cut(ps.Def.Active, rank.Active), cut(ps.Def.Ultimate, rank.Ultimate), cut(ps.Def.Passive, rank.Passive), rank
}

func inList(l []content.ActionDef, id string) bool {
	for _, x := range l {
		if x.ID == id && x.Implemented() {
			return true
		}
	}
	return false
}

// SanitizeLoadout enforces the LOCKED 5/1/2 limits and drops locked/unimplemented/duplicate skills.
func (w *World) SanitizeLoadout(ps *PowerState, lo Loadout) Loadout {
	act, ult, pas, _ := w.Unlocked(ps)
	lim := w.C.Powers.Loadout
	out := Loadout{Actives: []string{}, Passives: []string{}}
	seen := map[string]bool{}
	for _, id := range lo.Actives {
		if len(out.Actives) < lim.Active && !seen[id] && inList(act, id) {
			out.Actives = append(out.Actives, id)
			seen[id] = true
		}
	}
	if inList(ult, lo.Ultimate) {
		out.Ultimate = lo.Ultimate
	}
	for _, id := range lo.Passives {
		if len(out.Passives) < lim.Passive && !seen[id] && inList(pas, id) {
			out.Passives = append(out.Passives, id)
			seen[id] = true
		}
	}
	return out
}

func (w *World) DefaultLoadout(ps *PowerState) Loadout {
	act, ult, pas, _ := w.Unlocked(ps)
	lo := Loadout{}
	for _, a := range act {
		lo.Actives = append(lo.Actives, a.ID)
	}
	for _, a := range ult {
		lo.Ultimate = a.ID
		break
	}
	for _, a := range pas {
		lo.Passives = append(lo.Passives, a.ID)
	}
	return w.SanitizeLoadout(ps, lo)
}

func (w *World) DrainEvents() []Event {
	e := w.events
	w.events = nil
	return e
}

func (w *World) DrainRewards() []KillReward {
	r := w.rewards
	w.rewards = nil
	return r
}

func (w *World) emit(e Event) { w.events = append(w.events, e) }

// Emit lets the server layer add events (e.g. loot drops) to the outgoing stream.
func (w *World) Emit(e Event) { w.emit(e) }

/* -------------------------------------------------------------- passives */

type passiveMods struct {
	powerDmg, stealthBonus, backAttack float64
	dotMult, durAdd                    map[string]float64
}

func (w *World) passives(p *Player) passiveMods {
	m := passiveMods{powerDmg: 1, stealthBonus: 1, backAttack: 1, dotMult: map[string]float64{}, durAdd: map[string]float64{}}
	if p.Power == nil || !p.Power.Def.AllowsWeapon(p.Weapon.ID) {
		return m
	}
	for _, id := range p.Power.Loadout.Passives {
		s := p.Power.Def.Skill(id)
		if s == nil || s.Effects == nil {
			continue
		}
		e := s.Effects
		if e.PowerDamageMult > 0 {
			m.powerDmg *= e.PowerDamageMult
		}
		if e.StealthBonusMult > 0 {
			m.stealthBonus *= e.StealthBonusMult
		}
		if e.BackAttackMult > 0 {
			m.backAttack *= e.BackAttackMult
		}
		for k, v := range e.DotMult {
			if m.dotMult[k] == 0 {
				m.dotMult[k] = 1
			}
			m.dotMult[k] *= v
		}
		for k, v := range e.StatusDurationAddMs {
			m.durAdd[k] += v
		}
	}
	return m
}

func (w *World) applyStatus(list *[]Status, app content.StatusDef, src *Player, maxHp float64) Status {
	def := w.C.Status(app)
	dur := def.DurationMs
	dotMod := 0.0
	if def.Dot != nil {
		dotMod = def.Dot.Modifier
	}
	atk := 0.0
	srcID := ""
	if src != nil {
		mods := w.passives(src)
		dur += mods.durAdd[def.ID]
		if v := mods.dotMult[def.ID]; v > 0 {
			dotMod *= v
		}
		atk, srcID = src.Attack, src.ID
	}
	dm := def.DefenseMultiplier
	if dm == 0 {
		dm = 1
	}
	s := Status{ID: def.ID, ExpiresAt: w.Time + dur, DefenseMul: dm, def: def, sourceID: srcID, sourceAtk: atk, dotMod: dotMod}
	if def.Dot != nil {
		s.nextTick = w.Time + def.Dot.TickMs
	}
	if def.ShieldPctMaxHp > 0 {
		s.shield = def.ShieldPctMaxHp * maxHp
	}
	kept := (*list)[:0]
	for _, x := range *list {
		if x.ID != def.ID {
			kept = append(kept, x)
		}
	}
	*list = append(kept, s)
	return s
}

func statusMul(st []Status, f func(content.StatusDef) float64) float64 {
	v := 1.0
	for _, s := range st {
		if x := f(s.def); x > 0 {
			v *= x
		}
	}
	return v
}

func defenseMul(st []Status) float64 {
	v := 1.0
	for _, s := range st {
		v *= s.DefenseMul
	}
	return v
}

func (m *Monster) stunned() bool {
	for _, s := range m.Statuses {
		if s.def.Stun {
			return true
		}
	}
	return false
}

func (m *Monster) rooted() bool {
	for _, s := range m.Statuses {
		if s.def.Root || s.def.Stun {
			return true
		}
	}
	return false
}

/* -------------------------------------------------------------------- step */

// Step advances the world by dt ms with one input per player id.
func (w *World) Step(dt float64, inputs map[string]Input) {
	w.Time += dt
	for _, id := range w.order {
		p := w.players[id]
		in := inputs[id]
		if !p.Connected {
			in = Input{}
		}
		w.updatePlayer(p, dt, in)
	}
	w.updateProjectiles(dt)
	for _, m := range w.Monsters {
		w.updateMonster(m, dt)
	}
	w.separate()
	// cleanup GM test monsters and expired drops
	kept := w.Monsters[:0]
	for _, m := range w.Monsters {
		if m.ExpiresAt > 0 && w.Time >= m.ExpiresAt {
			w.emit(Event{Type: "despawn", Time: w.Time, EntityID: m.ID})
			continue
		}
		kept = append(kept, m)
	}
	w.Monsters = kept
	for id, d := range w.Drops {
		if w.Time >= d.ExpiresAt {
			delete(w.Drops, id)
		}
	}
}

func (w *World) setCharState(p *Player, to string) {
	if p.CharState == to {
		return
	}
	from := p.CharState
	p.CharState = to
	w.emit(Event{Type: "char-state", Time: w.Time, From: from, To: to, EntityID: p.ID})
}

func (w *World) enterCombat(p *Player) {
	p.LastCombatAt = w.Time
	if p.CharState == "IN_WORLD" {
		w.setCharState(p, "IN_COMBAT")
	}
}

func (w *World) updatePlayerStatuses(p *Player, dt float64) (stRegen, enRegen float64) {
	kept := p.Statuses[:0]
	for _, s := range p.Statuses {
		if s.ExpiresAt <= w.Time || (s.def.ShieldPctMaxHp > 0 && s.shield <= 0) {
			continue
		}
		stRegen += s.def.StaminaRegenPerSec
		enRegen += s.def.EnergyRegenPerSec
		kept = append(kept, s)
	}
	p.Statuses = kept
	return
}

func (w *World) updatePlayer(p *Player, dt float64, in Input) {
	now := w.Time
	base := w.C.Player
	if p.CharState == "DEAD" {
		if now >= p.RespawnAt {
			w.respawnPlayer(p)
		}
		return
	}
	stRegen, enRegen := w.updatePlayerStatuses(p, dt)
	if now-p.staminaSpentAt >= base.Stamina.RegenDelayMs {
		stRegen += base.Stamina.RegenPerSec
	}
	p.Stamina = math.Min(base.Stamina.Max, p.Stamina+stRegen*dt/1000)
	p.Energy = math.Min(w.C.Powers.Energy.Max, p.Energy+(w.C.Powers.Energy.RegenPerSec+enRegen)*dt/1000)
	if p.CharState == "IN_COMBAT" && now-p.LastCombatAt >= base.OutOfCombatMs {
		w.setCharState(p, "IN_WORLD")
	}
	if p.CharState == "IN_WORLD" && p.Hp < p.MaxHp {
		p.Hp = math.Min(p.MaxHp, p.Hp+p.MaxHp*base.OutOfCombatRegenPctPerSec*dt/1000)
	}

	p.currentMove = ClampUnit(in.Move)
	for _, req := range in.Actions {
		w.handleRequest(p, req, in.Aim, true)
	}

	if p.dash != nil {
		d := p.dash
		p.Pos, _, _ = w.Grid.MoveWithCollision(p.Pos, d.Dir.Scale(d.Speed*dt/1000), base.Radius)
		if now >= d.Ends {
			p.dash = nil
			if p.action == nil {
				p.CombatState = "idle"
			}
		}
		if p.action != nil {
			w.advanceAction(p, p.action)
		}
		return
	}
	if p.action != nil {
		w.advanceAction(p, p.action)
		if a := p.action; a != nil {
			el := now - a.StartedAt
			if el >= a.Def.WindupMs+a.Def.ActiveMs && !p.currentMove.IsZero() {
				p.action = nil
			} else {
				return
			}
		}
	}
	if p.buffered != nil {
		b := p.buffered
		p.buffered = nil
		if now <= b.Expires {
			w.handleRequest(p, b.Req, b.Aim, false)
			if p.action != nil || p.dash != nil {
				return
			}
		}
	}
	mv := p.currentMove
	if !mv.IsZero() {
		n := mv.Normalize()
		speed := base.MoveSpeed * math.Min(1, mv.Len())
		p.Pos, _, _ = w.Grid.MoveWithCollision(p.Pos, n.Scale(speed*dt/1000), base.Radius)
		p.Facing = VectorToDir8(n, p.Facing)
		p.AimAngle = DirToAngle(p.Facing)
		p.CombatState = "moving"
		p.Moving = true
	} else {
		p.CombatState = "idle"
		p.Moving = false
	}
}

func (w *World) isBusy(p *Player) bool {
	if p.dash != nil {
		return true
	}
	if p.action == nil {
		return false
	}
	return w.Time-p.action.StartedAt < p.action.Def.WindupMs+p.action.Def.ActiveMs
}

func (w *World) reject(p *Player, action, reason string) {
	w.emit(Event{Type: "rejected", Time: w.Time, Action: action, Reason: reason, Only: p.ID})
}

func (w *World) handleRequest(p *Player, req ActionRequest, aim *Vec, allowBuffer bool) {
	if !p.Alive() {
		return
	}
	label := req.Type
	if req.Slot != "" {
		label = req.Slot
	}
	switch req.Type {
	case "potion":
		w.usePotion(p)
		return
	case "stance":
		w.toggleStance(p)
		return
	}
	if w.isBusy(p) {
		if allowBuffer {
			p.buffered = &buffered{Req: req, Aim: aim, Expires: w.Time + bufferMs}
		} else {
			w.reject(p, label, "busy")
		}
		return
	}
	switch req.Type {
	case "dash":
		w.tryDash(p)
	case "attack", "power":
		w.tryStartAction(p, req, aim)
	}
}

func (w *World) toggleStance(p *Player) {
	if p.Power == nil {
		w.reject(p, "powerToggle", "no-power")
		return
	}
	if !p.Power.Def.AllowsWeapon(p.Weapon.ID) {
		w.reject(p, "powerToggle", "weapon")
		return
	}
	p.Power.Stance = !p.Power.Stance
	w.emit(Event{Type: "stance", Time: w.Time, EntityID: p.ID, On: bp(p.Power.Stance)})
}

// resolveAction maps a request to an action definition and whether it is a Power skill.
func (w *World) resolveAction(p *Player, req ActionRequest) (*content.ActionDef, bool, string) {
	if req.Type == "attack" {
		switch req.Slot {
		case "basic":
			return p.Weapon.BasicAttack, false, ""
		case "skill1", "skill2", "skill3":
			i := int(req.Slot[5] - '1')
			if i >= 0 && i < len(p.Weapon.Skills) && p.Weapon.Skills[i].Implemented() {
				return &p.Weapon.Skills[i], false, ""
			}
		}
		return nil, false, "invalid"
	}
	if p.Power == nil {
		return nil, true, "no-power"
	}
	if !p.Power.Def.AllowsWeapon(p.Weapon.ID) {
		return nil, true, "weapon"
	}
	if !p.Power.Stance {
		return nil, true, "stance"
	}
	var id string
	if req.Slot == "ult" {
		id = p.Power.Loadout.Ultimate
	} else if len(req.Slot) == 2 && req.Slot[0] == 'p' {
		i := int(req.Slot[1] - '1')
		if i >= 0 && i < len(p.Power.Loadout.Actives) {
			id = p.Power.Loadout.Actives[i]
		}
	}
	if id == "" {
		return nil, true, "empty"
	}
	s := p.Power.Def.Skill(id)
	if s == nil || !s.Implemented() || s.Category == "power-passive" {
		return nil, true, "empty"
	}
	return s, true, ""
}

func (w *World) cooldownReady(p *Player, id string) bool { return w.Time >= p.cooldowns[id] }
func (w *World) trigger(p *Player, id string, ms float64) {
	p.cooldowns[id] = w.Time + ms
	p.cooldownDur[id] = ms
}

func (w *World) spendStamina(p *Player, amt float64) bool {
	if p.Stamina+1e-9 < amt {
		return false
	}
	p.Stamina -= amt
	if amt > 0 {
		p.staminaSpentAt = w.Time
	}
	return true
}

const potionItemID = "CON-001"

func (w *World) usePotion(p *Player) {
	it := w.C.Items[potionItemID]
	if it == nil || it.Use == nil {
		return
	}
	if !w.cooldownReady(p, "potion") {
		w.reject(p, "hpPotion", "cooldown")
		return
	}
	if p.Hp >= p.MaxHp {
		w.reject(p, "hpPotion", "full")
		return
	}
	if w.ConsumeItem == nil || !w.ConsumeItem(p, potionItemID) {
		w.reject(p, "hpPotion", "no-item")
		return
	}
	w.trigger(p, "potion", it.Use.CooldownMs)
	heal := p.MaxHp * it.Use.HealPctMaxHp
	p.Hp = math.Min(p.MaxHp, p.Hp+heal)
	w.emit(Event{Type: "heal", Time: w.Time, TargetID: p.ID, Amount: int(math.Round(heal)), Pos: vp(p.Pos), ActionID: potionItemID})
}

func (w *World) tryDash(p *Player) {
	cfg := w.C.Player.Dash
	if !w.cooldownReady(p, "dash") {
		w.reject(p, "dash", "cooldown")
		return
	}
	if !w.spendStamina(p, cfg.StaminaCost) {
		w.reject(p, "dash", "stamina")
		return
	}
	w.trigger(p, "dash", cfg.CooldownMs)
	mv := p.currentMove
	var dir Vec
	if !mv.IsZero() {
		p.Facing = VectorToDir8(mv, p.Facing)
		dir = mv.Normalize()
	} else {
		a := DirToAngle(p.Facing)
		dir = Vec{math.Cos(a), math.Sin(a)}
	}
	p.action = nil
	p.dash = &dashState{Dir: dir, StartedAt: w.Time, Ends: w.Time + cfg.DurationMs, Speed: cfg.Distance / cfg.DurationMs * 1000}
	if cfg.Invulnerable {
		p.InvulnerableUntil = math.Max(p.InvulnerableUntil, w.Time+cfg.DurationMs)
	}
	p.CombatState = "dashing"
	w.emit(Event{Type: "dash", Time: w.Time, From: p.Pos, Dir: vp(dir), EntityID: p.ID})
}

func (w *World) tryStartAction(p *Player, req ActionRequest, aim *Vec) {
	def, isPower, why := w.resolveAction(p, req)
	if def == nil {
		if why != "" && why != "invalid" {
			w.reject(p, req.Slot, why)
		}
		return
	}
	if !w.cooldownReady(p, def.ID) {
		w.reject(p, req.Slot, "cooldown")
		return
	}
	if def.EnergyCost > 0 && p.Energy+1e-9 < def.EnergyCost {
		w.reject(p, req.Slot, "energy")
		return
	}
	if !w.spendStamina(p, def.StaminaCost) {
		w.reject(p, req.Slot, "stamina")
		return
	}
	p.Energy -= def.EnergyCost
	w.trigger(p, def.ID, def.CooldownMs)
	aimPt := Vec{p.Pos.X + math.Cos(p.AimAngle)*60, p.Pos.Y + math.Sin(p.AimAngle)*60}
	if aim != nil {
		v := aim.Sub(p.Pos)
		if !v.IsZero() {
			p.Facing = VectorToDir8(v, p.Facing)
			p.AimAngle = math.Atan2(v.Y, v.X)
			aimPt = *aim
		}
	} else {
		p.AimAngle = DirToAngle(p.Facing)
		aimPt = Vec{p.Pos.X + math.Cos(p.AimAngle)*60, p.Pos.Y + math.Sin(p.AimAngle)*60}
	}
	a := &runningAction{Def: def, Slot: req.Slot, Power: isPower, StartedAt: w.Time, Angle: p.AimAngle, AimPoint: aimPt}
	for range def.Hits {
		a.HitTargets = append(a.HitTargets, map[string]bool{})
	}
	p.action = a
	w.emit(Event{Type: "action", Time: w.Time, ActionID: def.ID, Slot: req.Slot, Angle: fp(p.AimAngle), EntityID: p.ID})
	if def.Telegraph {
		for _, h := range def.Hits {
			if h.Shape == "circle" {
				c := w.circleCenter(p, a, &h)
				w.emit(Event{Type: "telegraph", Time: w.Time, Pos: vp(c), Radius: h.Radius, WindupMs: h.AtMs, EntityID: p.ID})
			}
		}
	}
	if isPower {
		w.addProficiency(p, w.C.Powers.Proficiency.PointsPerCast, a)
	}
	w.advanceAction(p, a)
}

func (w *World) addProficiency(p *Player, pts int, a *runningAction) {
	if p.Power == nil || pts <= 0 {
		return
	}
	if a != nil {
		room := w.C.Powers.Proficiency.MaxPointsPerCast - a.profGained
		if room <= 0 {
			return
		}
		if pts > room {
			pts = room
		}
		a.profGained += pts
	}
	before := w.C.Powers.RankFor(p.Power.Points).Rank
	p.Power.Points += pts
	after := w.C.Powers.RankFor(p.Power.Points).Rank
	if after > before {
		w.emit(Event{Type: "power-rank", Time: w.Time, EntityID: p.ID, Rank: after, Only: p.ID})
	}
	if w.OnProficiency != nil {
		w.OnProficiency(p)
	}
}

func (w *World) circleCenter(p *Player, a *runningAction, h *content.HitDef) Vec {
	if !h.AtAim {
		return p.Pos
	}
	v := a.AimPoint.Sub(p.Pos)
	d := math.Min(v.Len(), h.Range)
	dir := Vec{math.Cos(a.Angle), math.Sin(a.Angle)}
	return Vec{p.Pos.X + dir.X*d, p.Pos.Y + dir.Y*d}
}

func (w *World) advanceAction(p *Player, a *runningAction) {
	el := w.Time - a.StartedAt
	d := a.Def
	if d.Move != nil && !a.moved && el >= d.Move.AtMs {
		a.moved = true
		w.performMove(p, a, d.Move)
	}
	for a.selfDone < len(d.SelfStatus) && el >= d.SelfStatus[a.selfDone].AtMs {
		s := w.applyStatus(&p.Statuses, d.SelfStatus[a.selfDone], p, p.MaxHp)
		if s.def.Stealth {
			w.dropAggro(p)
		}
		w.emit(Event{Type: "status", Time: w.Time, TargetID: p.ID, StatusID: s.ID, DurationMs: s.ExpiresAt - w.Time})
		a.selfDone++
	}
	for a.HitsDone < len(d.Hits) {
		h := &d.Hits[a.HitsDone]
		if el < h.AtMs {
			break
		}
		w.performPlayerHit(p, a, h, a.HitTargets[a.HitsDone])
		a.HitsDone++
	}
	switch {
	case el < d.WindupMs:
		p.CombatState = "windup"
	case el < d.WindupMs+d.ActiveMs:
		if d.Counter != nil {
			p.CombatState = "counter"
		} else {
			p.CombatState = "active"
		}
	case el < d.WindupMs+d.ActiveMs+d.RecoveryMs:
		p.CombatState = "recovery"
	default:
		if p.action == a {
			p.action = nil
		}
		if p.dash == nil {
			p.CombatState = "idle"
		}
	}
}

func (w *World) performMove(p *Player, a *runningAction, mv *content.MoveDef) {
	dir := Vec{math.Cos(a.Angle), math.Sin(a.Angle)}
	if mv.Type == "back" {
		dir = dir.Scale(-1)
	}
	if mv.IFrames {
		dur := mv.DurationMs
		if mv.Type == "blink" {
			dur = blinkIFrameMs
		}
		p.InvulnerableUntil = math.Max(p.InvulnerableUntil, w.Time+dur)
	}
	if mv.Type == "blink" {
		dist := math.Min(mv.Distance, a.AimPoint.Sub(p.Pos).Len())
		from := p.Pos
		to := p.Pos
		for s := 4.0; s <= dist; s += 4 {
			c := Vec{from.X + dir.X*s, from.Y + dir.Y*s}
			if w.Grid.BoxCollides(c.X, c.Y, w.C.Player.Radius) {
				break
			}
			to = c
		}
		p.Pos = to
		w.emit(Event{Type: "blink", Time: w.Time, EntityID: p.ID, From: from, Pos: vp(to)})
		return
	}
	dist := mv.Distance
	if mv.ToAim {
		dist = math.Min(dist, a.AimPoint.Sub(p.Pos).Len()+10)
	}
	p.dash = &dashState{Dir: dir, StartedAt: w.Time, Ends: w.Time + mv.DurationMs, Speed: dist / math.Max(1, mv.DurationMs) * 1000}
	w.emit(Event{Type: "dash", Time: w.Time, From: p.Pos, Dir: vp(dir), EntityID: p.ID})
}

func (w *World) performPlayerHit(p *Player, a *runningAction, h *content.HitDef, already map[string]bool) {
	switch h.Shape {
	case "projectile":
		dir := Vec{math.Cos(a.Angle), math.Sin(a.Angle)}
		pr := &Projectile{ID: w.nextID("pj"), Owner: p, Pos: p.Pos, Dir: dir, Speed: h.Speed, Left: h.Range, Radius: math.Max(2, h.Radius),
			Hit: h, ActionID: a.Def.ID, Power: a.Power, hits: map[string]bool{}, run: a}
		w.Projectiles = append(w.Projectiles, pr)
		w.emit(Event{Type: "projectile", Time: w.Time, ProjID: pr.ID, Origin: vp(p.Pos), Angle: fp(a.Angle), Speed: h.Speed, Range: h.Range, ActionID: a.Def.ID, EntityID: p.ID})
	case "circle":
		c := w.circleCenter(p, a, h)
		w.emit(Event{Type: "swing", Time: w.Time, ActionID: a.Def.ID, Origin: vp(c), Angle: fp(a.Angle), Radius: h.Radius, ArcDeg: 360, EntityID: p.ID})
		for _, m := range w.Monsters {
			if !m.Alive() || already[m.ID] || Dist(c, m.Pos) > h.Radius+m.Def.Radius || !w.Grid.LineOfSight(p.Pos, m.Pos) && Dist(p.Pos, m.Pos) > h.Radius+m.Def.Radius {
				continue
			}
			already[m.ID] = true
			w.damageMonster(p, m, a, h, c)
		}
	default: // arc
		w.emit(Event{Type: "swing", Time: w.Time, ActionID: a.Def.ID, Origin: vp(p.Pos), Angle: fp(a.Angle), Radius: h.Radius, ArcDeg: h.ArcDeg, EntityID: p.ID})
		for _, m := range w.Monsters {
			if !m.Alive() || already[m.ID] {
				continue
			}
			if !ArcHitsCircle(p.Pos, a.Angle, h.Radius, h.ArcDeg, m.Pos, m.Def.Radius) || !w.Grid.LineOfSight(p.Pos, m.Pos) {
				continue
			}
			already[m.ID] = true
			w.damageMonster(p, m, a, h, p.Pos)
		}
	}
}

func (w *World) updateProjectiles(dt float64) {
	kept := w.Projectiles[:0]
	for _, pr := range w.Projectiles {
		step := pr.Speed * dt / 1000
		alive := true
		for moved := 0.0; moved < step && alive; {
			s := math.Min(4, step-moved)
			moved += s
			pr.Pos = pr.Pos.Add(pr.Dir.Scale(s))
			pr.Left -= s
			if pr.Left <= 0 || w.Grid.SolidTile(int(math.Floor(pr.Pos.X/w.Grid.TileSize)), int(math.Floor(pr.Pos.Y/w.Grid.TileSize))) {
				alive = false
				break
			}
			for _, m := range w.Monsters {
				if !m.Alive() || pr.hits[m.ID] || Dist(pr.Pos, m.Pos) > pr.Radius+m.Def.Radius {
					continue
				}
				pr.hits[m.ID] = true
				if pr.Owner.Alive() {
					w.damageMonster(pr.Owner, m, pr.run, pr.Hit, pr.Pos)
				}
				if !pr.Hit.Pierce {
					alive = false
					break
				}
			}
		}
		if alive {
			kept = append(kept, pr)
		} else {
			w.emit(Event{Type: "projectile-end", Time: w.Time, ProjID: pr.ID, Pos: vp(pr.Pos)})
		}
	}
	w.Projectiles = kept
}

func (w *World) dropAggro(p *Player) {
	for _, m := range w.Monsters {
		if m.Target == p.ID && m.Alive() && m.AI != "RESET" {
			m.Target = ""
			w.setAi(m, "IDLE")
			m.stateUntil = w.Time + 800
		}
	}
}

func (w *World) breakStealth(p *Player) {
	kept := p.Statuses[:0]
	for _, s := range p.Statuses {
		if !s.def.Stealth {
			kept = append(kept, s)
		}
	}
	p.Statuses = kept
}

func (w *World) damageMonster(p *Player, m *Monster, a *runningAction, h *content.HitDef, origin Vec) {
	w.enterCombat(p)
	if m.AI == "RESET" {
		w.emit(Event{Type: "evade", Time: w.Time, TargetID: m.ID, Pos: vp(m.Pos), Reason: "reset"})
		return
	}
	mods := w.passives(p)
	mod := h.Modifier
	if a != nil && a.Power {
		mod *= mods.powerDmg
	}
	behind := float64(m.FacingX)*(origin.X-m.Pos.X) < 0
	if behind {
		if h.BonusBehind > 0 {
			mod *= h.BonusBehind
		}
		mod *= mods.backAttack
	}
	if p.HasStatus("stealth") {
		mod *= 1.25 * mods.stealthBonus // opener bonus [TUNING]; Silent Killer adds more
		w.breakStealth(p)
	}
	mod *= statusMul(m.Statuses, func(d content.StatusDef) float64 { return d.DamageTakenMultiplier })
	coef := p.Weapon.WeaponCoefficient
	if coef == 0 {
		coef = 1
	}
	r := ComputeDamage(DamageInput{
		Base: p.Attack, WeaponCoef: coef, StatScaling: 1, SkillMod: mod,
		TargetDefense: m.Def.Defense, DefenseMul: defenseMul(m.Statuses),
		CritChance: w.C.Player.CritChance, CritMul: w.C.Player.CritMultiplier,
	}, w.Rng, w.defenseK, w.maxDamage)
	actionID := ""
	if a != nil {
		actionID = a.Def.ID
		if a.Power {
			w.addProficiency(p, w.C.Powers.Proficiency.PointsPerHit, a)
		}
	}
	w.applyMonsterDamage(p, m, float64(r.Amount), r.IsCrit, actionID)
	if !m.Alive() {
		return
	}
	if h.ApplyStatus != nil {
		s := w.applyStatus(&m.Statuses, *h.ApplyStatus, p, m.Def.MaxHp)
		w.emit(Event{Type: "status", Time: w.Time, TargetID: m.ID, StatusID: s.ID, DurationMs: s.ExpiresAt - w.Time})
		if s.def.Stun && m.AI == "ATTACK" && !m.attackResolved {
			w.setAi(m, "CHASE")
			w.emit(Event{Type: "interrupt", Time: w.Time, EntityID: m.ID})
		}
	}
	if h.Knockback > 0 {
		dir := m.Pos.Sub(origin).Normalize()
		sp := h.Knockback / knockbackMs * 1000
		m.knock = &struct{ vx, vy, until float64 }{dir.X * sp, dir.Y * sp, w.Time + knockbackMs}
	}
	if h.Interrupt && m.AI == "ATTACK" && !m.attackResolved {
		m.staggerUntil = w.Time + staggerMs
		m.nextAttackAt = w.Time + staggerMs
		w.setAi(m, "CHASE")
		w.emit(Event{Type: "interrupt", Time: w.Time, EntityID: m.ID})
	}
}

// applyMonsterDamage handles HP, contribution, aggro and death for any damage source.
func (w *World) applyMonsterDamage(p *Player, m *Monster, amount float64, crit bool, actionID string) {
	dealt := math.Min(amount, m.Hp)
	m.Hp = math.Max(0, m.Hp-amount)
	m.Contribution[p.ID] += dealt
	w.emit(Event{Type: "damage", Time: w.Time, SourceID: p.ID, TargetID: m.ID, Amount: int(amount), IsCrit: crit, Pos: vp(m.Pos), ActionID: actionID})
	if m.Hp <= 0 {
		w.killMonster(m, p)
		return
	}
	if !m.Def.Passive && (m.Target == "" || w.players[m.Target] == nil || !w.players[m.Target].Alive()) {
		m.Target = p.ID
	}
	if !m.Def.Passive && (m.AI == "IDLE" || m.AI == "PATROL" || m.AI == "ALERT") {
		w.setAi(m, "CHASE")
	}
}

func (w *World) killMonster(m *Monster, killer *Player) {
	m.DiedAt = w.Time
	m.respawnAt = w.Time + m.Def.RespawnMs
	m.knock = nil
	m.Statuses = nil
	m.Target = ""
	w.setAi(m, "DEAD")
	m.DeathSeq++
	w.emit(Event{Type: "death", Time: w.Time, EntityID: m.ID, KillerID: killer.ID, Pos: vp(m.Pos)})
	if m.NoLoot || m.Def.NoLoot {
		m.Contribution = map[string]float64{}
		if m.ExpiresAt > 0 {
			m.ExpiresAt = w.Time + m.Def.CorpseMs
		}
		return
	}
	total := 0.0
	for _, v := range m.Contribution {
		total += v
	}
	var eligible []string
	for pid, v := range m.Contribution {
		if total > 0 && v/total >= w.C.MinContributionShare && w.players[pid] != nil {
			eligible = append(eligible, pid)
		}
	}
	sort.Strings(eligible)
	if len(eligible) > 0 {
		w.rewards = append(w.rewards, KillReward{MonsterID: m.ID, MonsterDef: m.Def.ID, DeathSeq: m.DeathSeq, Pos: m.Pos, PlayerIDs: eligible})
	}
	m.Contribution = map[string]float64{}
}

// AddDrop places a personal loot bag (called by the server after rolling loot).
func (w *World) AddDrop(owner *Player, at Vec, gold int64, items []LootItem, txID, monsterID string) *LootDrop {
	d := &LootDrop{ID: w.nextID("loot"), Owner: owner.ID, Pos: at, Gold: gold, Items: items, ExpiresAt: w.Time + dropLifetimeMs, TxID: txID, MonsterID: monsterID}
	w.Drops[d.ID] = d
	w.emit(Event{Type: "loot-drop", Time: w.Time, ProjID: d.ID, Pos: vp(at), Only: owner.ID})
	return d
}

// TakeDrop validates ownership/range and removes the drop; the caller persists its contents.
func (w *World) TakeDrop(p *Player, id string, maxRange float64) (*LootDrop, string) {
	d := w.Drops[id]
	if d == nil {
		return nil, "gone"
	}
	if d.Owner != p.ID {
		return nil, "not-owner"
	}
	if maxRange <= 0 {
		maxRange = pickupRange
	}
	if Dist(d.Pos, p.Pos) > maxRange {
		return nil, "too-far"
	}
	delete(w.Drops, id)
	w.emit(Event{Type: "loot-pickup", Time: w.Time, ProjID: id, Pos: vp(d.Pos), Only: p.ID})
	return d, ""
}

// DropsOf returns the player's own visible drops.
func (w *World) DropsOf(pid string) []*LootDrop {
	var out []*LootDrop
	for _, d := range w.Drops {
		if d.Owner == pid {
			out = append(out, d)
		}
	}
	sort.Slice(out, func(i, j int) bool { return out[i].ID < out[j].ID })
	return out
}

func (w *World) damagePlayer(m *Monster, p *Player) {
	if !p.Alive() {
		return
	}
	if a := p.action; a != nil && a.Def.Counter != nil && !a.Countered {
		el := w.Time - a.StartedAt
		if el >= a.Def.WindupMs && el < a.Def.WindupMs+a.Def.Counter.StanceMs {
			w.performCounter(p, a, m)
			return
		}
	}
	if w.Time < p.InvulnerableUntil || p.GodMode {
		reason := "protected"
		if p.dash != nil {
			reason = "dash"
		}
		w.emit(Event{Type: "evade", Time: w.Time, TargetID: p.ID, Pos: vp(p.Pos), Reason: reason})
		return
	}
	r := ComputeDamage(DamageInput{
		Base: m.Def.Attack, WeaponCoef: 1, StatScaling: 1, SkillMod: 1,
		TargetDefense: p.Defense, DefenseMul: defenseMul(p.Statuses),
		CritChance: m.Def.CritChance, CritMul: 1.5,
	}, w.Rng, w.defenseK, w.maxDamage)
	amount := float64(r.Amount)
	for i := range p.Statuses { // shields absorb first
		s := &p.Statuses[i]
		if s.shield > 0 && amount > 0 {
			ab := math.Min(s.shield, amount)
			s.shield -= ab
			amount -= ab
		}
	}
	p.Hp = math.Max(0, p.Hp-amount)
	w.enterCombat(p)
	e := RecapEntry{Time: w.Time, AttackerID: m.ID, AttackerName: m.Def.Name, ActionID: m.Def.ID + ":attack", Amount: int(amount), IsCrit: r.IsCrit, Mitigation: r.Mitigation}
	p.recent = append(p.recent, e)
	for len(p.recent) > 0 && p.recent[0].Time < w.Time-recapWindowMs {
		p.recent = p.recent[1:]
	}
	if amount <= 0 {
		w.emit(Event{Type: "evade", Time: w.Time, TargetID: p.ID, Pos: vp(p.Pos), Reason: "shield"})
		return
	}
	w.emit(Event{Type: "damage", Time: w.Time, SourceID: m.ID, TargetID: p.ID, Amount: int(amount), IsCrit: r.IsCrit, Pos: vp(p.Pos), ActionID: e.ActionID})
	if p.Hp <= 0 {
		w.killPlayer(p, m)
	}
}

func (w *World) performCounter(p *Player, a *runningAction, attacker *Monster) {
	c := a.Def.Counter
	a.Countered = true
	ang := math.Atan2(attacker.Pos.Y-p.Pos.Y, attacker.Pos.X-p.Pos.X)
	p.AimAngle = ang
	p.Facing = VectorToDir8(Vec{math.Cos(ang), math.Sin(ang)}, p.Facing)
	w.emit(Event{Type: "counter", Time: w.Time, AttackerID: attacker.ID, Pos: vp(p.Pos), EntityID: p.ID})
	w.emit(Event{Type: "swing", Time: w.Time, ActionID: a.Def.ID, Origin: vp(p.Pos), Angle: fp(ang), Radius: c.Radius, ArcDeg: c.ArcDeg, EntityID: p.ID})
	h := &content.HitDef{Modifier: c.Modifier, Knockback: c.Knockback, Interrupt: true}
	for _, m := range w.Monsters {
		if !m.Alive() || !ArcHitsCircle(p.Pos, ang, c.Radius, c.ArcDeg, m.Pos, m.Def.Radius) {
			continue
		}
		w.damageMonster(p, m, a, h, p.Pos)
	}
	a.StartedAt = w.Time - (a.Def.WindupMs + a.Def.ActiveMs)
	p.InvulnerableUntil = math.Max(p.InvulnerableUntil, w.Time+counterIFrameMs)
}

func (w *World) killPlayer(p *Player, killer *Monster) {
	p.action, p.dash, p.buffered = nil, nil, nil
	p.CombatState = "dead"
	p.RespawnAt = w.Time + w.C.Player.RespawnDelayMs
	p.LastDeathRecap = append([]RecapEntry(nil), p.recent...)
	p.recent = nil
	p.Statuses = nil
	w.setCharState(p, "DEAD")
	w.emit(Event{Type: "death", Time: w.Time, EntityID: p.ID, KillerID: killer.ID, Pos: vp(p.Pos)})
	for _, m := range w.Monsters {
		if m.Target == p.ID && (m.AI == "CHASE" || m.AI == "ATTACK" || m.AI == "ALERT") {
			w.setAi(m, "RESET")
		}
	}
}

func (w *World) respawnPlayer(p *Player) {
	w.setCharState(p, "RESPAWNING")
	p.Pos = w.spawn
	p.Hp = p.MaxHp
	p.Stamina = w.C.Player.Stamina.Max
	p.Statuses = nil
	p.Facing = "S"
	p.CombatState = "idle"
	p.InvulnerableUntil = w.Time + w.C.Player.SpawnProtectionMs
	p.SpawnProtectedUntil = p.InvulnerableUntil
	w.emit(Event{Type: "respawn", Time: w.Time, EntityID: p.ID, Pos: vp(p.Pos)})
	w.setCharState(p, "IN_WORLD")
}

/* ---------------------------------------------------------------- monsters */

func (w *World) setAi(m *Monster, to string) {
	if m.AI == to {
		return
	}
	from := m.AI
	m.AI = to
	m.stateSince = w.Time
	w.emit(Event{Type: "ai-state", Time: w.Time, EntityID: m.ID, From: from, To: to})
}

func (w *World) eligibleTarget(p *Player) bool {
	return p != nil && p.Alive() && w.Time >= p.SpawnProtectedUntil && !p.HasStatus("stealth")
}

// nearestAggro returns the nearest eligible player inside aggro radius with line of sight.
func (w *World) nearestAggro(m *Monster) *Player {
	var best *Player
	bd := math.Inf(1)
	for _, id := range w.order {
		p := w.players[id]
		if !w.eligibleTarget(p) {
			continue
		}
		d := Dist(m.Pos, p.Pos)
		if d <= m.Def.AggroRadius && d < bd && w.Grid.LineOfSight(m.Pos, p.Pos) {
			best, bd = p, d
		}
	}
	return best
}

func (w *World) moveMonster(m *Monster, to Vec, speed, dt float64) bool {
	if m.rooted() {
		return false
	}
	speed *= statusMul(m.Statuses, func(d content.StatusDef) float64 { return d.SpeedMultiplier })
	v := to.Sub(m.Pos)
	d := v.Len()
	if d < 0.5 {
		return true
	}
	step := math.Min(d, speed*dt/1000)
	np, bx, by := w.Grid.MoveWithCollision(m.Pos, Vec{v.X / d * step, v.Y / d * step}, m.Def.Radius-1)
	if math.Abs(v.X) > 0.1 {
		if v.X > 0 {
			m.FacingX = 1
		} else {
			m.FacingX = -1
		}
	}
	m.Pos = np
	return bx && by
}

func (w *World) tickMonsterStatuses(m *Monster) {
	kept := m.Statuses[:0]
	for _, s := range m.Statuses {
		if s.def.Dot != nil {
			for s.nextTick <= w.Time && s.nextTick <= s.ExpiresAt && m.Alive() {
				s.nextTick += s.def.Dot.TickMs
				src := w.players[s.sourceID]
				amt := math.Max(1, math.Round(s.sourceAtk*s.dotMod*(1-math.Min(0.5, m.Def.Defense/(m.Def.Defense+w.defenseK)))))
				if src != nil {
					w.applyMonsterDamage(src, m, amt, false, "dot:"+s.ID)
				} else {
					m.Hp = math.Max(1, m.Hp-amt)
				}
			}
		}
		if s.ExpiresAt > w.Time && m.Alive() {
			kept = append(kept, s)
		}
	}
	if m.Alive() {
		m.Statuses = kept
	}
}

func (w *World) updateMonster(m *Monster, dt float64) {
	now := w.Time
	if m.AI != "DEAD" {
		w.tickMonsterStatuses(m)
	}
	if m.AI == "DEAD" {
		if m.ExpiresAt == 0 && !w.NoRespawn && now >= m.respawnAt {
			m.Pos = m.Spawn
			m.Hp = m.Def.MaxHp
			m.attackResolved = false
			m.stateUntil = now + 800
			m.Contribution = map[string]float64{}
			w.setAi(m, "IDLE")
			w.emit(Event{Type: "respawn", Time: now, EntityID: m.ID, Pos: vp(m.Pos)})
		}
		return
	}
	if m.knock != nil && now < m.knock.until {
		m.Pos, _, _ = w.Grid.MoveWithCollision(m.Pos, Vec{m.knock.vx * dt / 1000, m.knock.vy * dt / 1000}, m.Def.Radius-1)
	} else {
		m.knock = nil
	}
	if m.Def.Passive {
		if now-m.stateSince > 3000 && m.Hp < m.Def.MaxHp && len(m.Contribution) == 0 {
			m.Hp = m.Def.MaxHp
		}
		return
	}
	if m.stunned() {
		if m.AI == "ATTACK" && !m.attackResolved {
			w.setAi(m, "CHASE")
		}
		return
	}

	target := w.players[m.Target]
	reach := m.Def.AttackRange + m.Def.Radius + w.C.Player.Radius

	switch m.AI {
	case "IDLE", "PATROL":
		if p := w.nearestAggro(m); p != nil {
			m.Target = p.ID
			w.setAi(m, "ALERT")
			break
		}
		if m.AI == "IDLE" {
			if now >= m.stateUntil {
				ang := w.Rng.Next() * math.Pi * 2
				r := w.Rng.Range(m.Def.PatrolRadius*0.3, m.Def.PatrolRadius)
				t := Vec{m.Spawn.X + math.Cos(ang)*r, m.Spawn.Y + math.Sin(ang)*r}
				ts := w.Grid.TileSize
				if !w.Grid.SolidTile(int(math.Floor(t.X/ts)), int(math.Floor(t.Y/ts))) {
					m.patrolTarget = &t
					m.stateUntil = now + 4000
					w.setAi(m, "PATROL")
				} else {
					m.stateUntil = now + 500
				}
			}
		} else {
			t := m.Spawn
			if m.patrolTarget != nil {
				t = *m.patrolTarget
			}
			stuck := w.moveMonster(m, t, m.Def.MoveSpeed, dt)
			if Dist(m.Pos, t) < 2 || stuck || now >= m.stateUntil {
				m.stateUntil = now + w.Rng.Range(1000, 2500)
				w.setAi(m, "IDLE")
			}
		}
	case "ALERT":
		if !w.eligibleTarget(target) {
			m.Target = ""
			w.setAi(m, "IDLE")
			break
		}
		if target.Pos.X > m.Pos.X {
			m.FacingX = 1
		} else {
			m.FacingX = -1
		}
		if now-m.stateSince >= m.Def.AlertMs {
			w.setAi(m, "CHASE")
		}
	case "CHASE":
		if target == nil || !target.Alive() || target.HasStatus("stealth") || Dist(m.Pos, m.Spawn) > m.Def.LeashRadius || Dist(m.Pos, target.Pos) > m.Def.LeashRadius*1.2 {
			w.setAi(m, "RESET")
			break
		}
		if now < m.staggerUntil {
			break
		}
		d := Dist(m.Pos, target.Pos)
		if d <= reach && now >= m.nextAttackAt {
			m.AttackStartedAt = now
			m.attackResolved = false
			if target.Pos.X > m.Pos.X {
				m.FacingX = 1
			} else {
				m.FacingX = -1
			}
			w.setAi(m, "ATTACK")
			w.emit(Event{Type: "monster-windup", Time: now, EntityID: m.ID, WindupMs: m.Def.AttackWindupMs, Pos: vp(m.Pos), Radius: reach})
			break
		}
		if d > reach*0.8 {
			w.moveMonster(m, target.Pos, m.Def.ChaseSpeed, dt)
		}
	case "ATTACK":
		el := now - m.AttackStartedAt
		if !m.attackResolved && el >= m.Def.AttackWindupMs {
			m.attackResolved = true
			if target != nil && target.Alive() && Dist(m.Pos, target.Pos) <= reach+3 && w.Grid.LineOfSight(m.Pos, target.Pos) {
				w.damagePlayer(m, target)
			}
		}
		if m.AI != "ATTACK" {
			break
		}
		if el >= m.Def.AttackWindupMs+m.Def.AttackRecoveryMs {
			m.nextAttackAt = m.AttackStartedAt + m.Def.AttackCooldownMs
			w.setAi(m, "CHASE")
		}
	case "RESET":
		arrived := w.moveMonster(m, m.Spawn, m.Def.ChaseSpeed*1.3, dt) || Dist(m.Pos, m.Spawn) < 3
		if arrived || now-m.stateSince > 5000 {
			if !arrived {
				m.Pos = m.Spawn
			}
			m.Hp = m.Def.MaxHp
			m.Statuses = nil
			m.Target = ""
			m.Contribution = map[string]float64{}
			m.stateUntil = now + 1000
			w.setAi(m, "IDLE")
		}
	}
}

func (w *World) separate() {
	var alive []*Monster
	for _, m := range w.Monsters {
		if m.Alive() && !m.Def.Passive {
			alive = append(alive, m)
		}
	}
	for i, a := range alive {
		for j := i + 1; j < len(alive); j++ {
			b := alive[j]
			w.pushApart(a, b.Pos, a.Def.Radius+b.Def.Radius, 0.5)
			w.pushApart(b, a.Pos, a.Def.Radius+b.Def.Radius, 0.5)
		}
		for _, id := range w.order {
			p := w.players[id]
			if p.Alive() {
				w.pushApart(a, p.Pos, a.Def.Radius+w.C.Player.Radius-2, 1)
			}
		}
	}
}

func (w *World) pushApart(m *Monster, other Vec, minDist, share float64) {
	v := m.Pos.Sub(other)
	d := v.Len()
	if d >= minDist {
		return
	}
	n := Vec{1, 0}
	if d >= 1e-6 {
		n = Vec{v.X / d, v.Y / d}
	}
	push := (minDist - d) * share
	m.Pos, _, _ = w.Grid.MoveWithCollision(m.Pos, n.Scale(push), m.Def.Radius-1)
}

// NearNPC reports whether the player stands within interaction range of an NPC on this map.
func (w *World) NearNPC(p *Player, npcID string, rangePx float64) bool {
	for _, n := range w.Map.NPCs {
		if n.ID == npcID && Dist(p.Pos, Vec{n.X, n.Y}) <= rangePx {
			return true
		}
	}
	return false
}

// PortalAt returns the portal the player currently stands in, if any.
func (w *World) PortalAt(p *Player) *content.Portal {
	for i := range w.Map.Portals {
		if w.Map.Portals[i].Contains(p.Pos.X, p.Pos.Y) {
			return &w.Map.Portals[i]
		}
	}
	return nil
}

// TransferOut removes a player for a map change and returns the live object (state is kept).
func (w *World) TransferOut(id string) *Player {
	p := w.players[id]
	if p == nil {
		return nil
	}
	w.RemovePlayer(id)
	p.action, p.dash, p.buffered = nil, nil, nil
	p.Moving = false
	return p
}

// TransferIn places an existing player object into this map at pos (with brief spawn protection).
func (w *World) TransferIn(p *Player, pos Vec) {
	if w.Grid.BoxCollides(pos.X, pos.Y, w.C.Player.Radius) {
		pos = w.spawn
	}
	p.Pos = pos
	p.InvulnerableUntil = w.Time + 1000
	p.SpawnProtectedUntil = p.InvulnerableUntil
	p.LastCombatAt = math.Inf(-1)
	if p.CharState == "IN_COMBAT" {
		p.CharState = "IN_WORLD"
	}
	w.players[p.ID] = p
	w.order = append(w.order, p.ID)
	sort.Strings(w.order)
}

/* ---------------------------------------------------------------- loot roll */

type LootItem struct {
	ItemID   string `json:"itemId"`
	Quantity int    `json:"quantity"`
}

type Loot struct {
	XP    int64      `json:"xp"`
	Gold  int64      `json:"gold"`
	Items []LootItem `json:"items"`
}

// RollLoot rolls one personal loot bag from a drop table using the server RNG.
func RollLoot(t *content.DropTable, rng *Rng) Loot {
	l := Loot{XP: t.XP, Gold: rng.IntRange(t.Gold[0], t.Gold[1])}
	for _, d := range t.Items {
		if rng.Next() < d.Chance {
			l.Items = append(l.Items, LootItem{ItemID: d.ItemID, Quantity: int(rng.IntRange(int64(d.Min), int64(d.Max)))})
		}
	}
	return l
}
