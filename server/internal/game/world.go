// Package game is the authoritative real-time simulation. It is a port of the client's
// apps/web-game/src/core/simulation.ts extended for many players. Events use the same JSON
// shape as the client's SimEvent so the browser renders server results directly.
package game

import (
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
	// Only, when set, restricts delivery to that player (e.g. action rejections).
	Only string `json:"-"`
}

func fp(f float64) *float64 { return &f }
func vp(v Vec) *Vec         { return &v }

type ActionRequest struct {
	Type string `json:"type"`           // attack | dash | potion
	Slot string `json:"slot,omitempty"` // basic | skill1 | skill2 | skill3
}

type Input struct {
	Move    Vec
	Aim     *Vec
	Actions []ActionRequest
}

type Status struct {
	ID         string  `json:"id"`
	ExpiresAt  float64 `json:"expiresAt"`
	DefenseMul float64 `json:"defenseMultiplier"`
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
	StartedAt  float64
	Angle      float64
	HitsDone   int
	HitTargets []map[string]bool
	Countered  bool
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
}

func (m *Monster) Alive() bool { return m.AI != "DEAD" }

// KillReward is emitted when a monster dies; the server turns it into persisted, idempotent rewards.
type KillReward struct {
	MonsterID  string
	MonsterDef string
	DeathSeq   int
	PlayerIDs  []string // eligible contributors (>= min share)
}

type World struct {
	Time     float64
	Grid     *Grid
	C        *content.Content
	Rng      *Rng
	players  map[string]*Player
	order    []string
	Monsters []*Monster
	events   []Event
	rewards  []KillReward
	spawn    Vec
	// ConsumeItem is called for potion use; returns false if the player owns none (server inventory).
	ConsumeItem         func(p *Player, itemID string) bool
	defenseK, maxDamage float64
}

func NewWorld(c *content.Content, seed uint32) *World {
	m := c.Map
	w := &World{
		Grid:      NewGrid(m.Width, m.Height, m.TileSize, m.Collision),
		C:         c,
		Rng:       NewRng(seed),
		players:   map[string]*Player{},
		spawn:     Vec{m.PlayerSpawn[0], m.PlayerSpawn[1]},
		defenseK:  c.Player.DefenseK,
		maxDamage: c.Player.MaxDamage,
	}
	for _, s := range m.MonsterSpawns {
		def := c.Monsters[s.MonsterID]
		w.Monsters = append(w.Monsters, &Monster{
			ID: s.ID, Def: def, Spawn: Vec{s.X, s.Y}, Pos: Vec{s.X, s.Y}, Hp: def.MaxHp, AI: "IDLE", FacingX: 1,
			Contribution: map[string]float64{},
		})
	}
	return w
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
		weapon = w.C.Weapon("sword") // only the sword is implemented before Phase 3
	}
	maxHp, atk, def := w.StatsForLevel(in.Level)
	p := &Player{
		ID: in.ID, CharacterID: in.CharacterID, Name: in.Name, Weapon: weapon, Level: in.Level,
		MaxHp: maxHp, Attack: atk, Defense: def,
		Pos: w.spawn, Facing: "S", AimAngle: math.Pi / 2, Hp: maxHp,
		Stamina: w.C.Player.Stamina.Max, staminaSpentAt: math.Inf(-1),
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
}

func (w *World) Player(id string) *Player { return w.players[id] }

func (w *World) Players() []*Player {
	out := make([]*Player, 0, len(w.order))
	for _, id := range w.order {
		out = append(out, w.players[id])
	}
	return out
}

// SetLevel applies a level change (from XP rewards) and refreshes derived stats.
func (w *World) SetLevel(p *Player, level int) {
	p.Level = level
	maxHp, atk, def := w.StatsForLevel(level)
	p.MaxHp, p.Attack, p.Defense = maxHp, atk, def
	p.Hp = maxHp
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
	for _, m := range w.Monsters {
		w.updateMonster(m, dt)
	}
	w.separate()
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

func (w *World) updatePlayer(p *Player, dt float64, in Input) {
	now := w.Time
	base := w.C.Player
	if p.CharState == "DEAD" {
		if now >= p.RespawnAt {
			w.respawnPlayer(p)
		}
		return
	}
	// stamina regen
	if now-p.staminaSpentAt >= base.Stamina.RegenDelayMs {
		p.Stamina = math.Min(base.Stamina.Max, p.Stamina+base.Stamina.RegenPerSec*dt/1000)
	}
	kept := p.Statuses[:0]
	for _, s := range p.Statuses {
		if s.ExpiresAt > now {
			kept = append(kept, s)
		}
	}
	p.Statuses = kept
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
		step := d.Speed * dt / 1000
		p.Pos, _, _ = w.Grid.MoveWithCollision(p.Pos, d.Dir.Scale(step), base.Radius)
		if now >= d.Ends {
			p.dash = nil
			p.CombatState = "idle"
		}
		return
	}
	if p.action != nil {
		w.advanceAction(p, p.action)
		if a := p.action; a != nil {
			elapsed := now - a.StartedAt
			lockEnd := a.Def.WindupMs + a.Def.ActiveMs
			if elapsed >= lockEnd && !p.currentMove.IsZero() {
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
	label := req.Type
	if req.Type == "attack" {
		label = req.Slot
	}
	if !p.Alive() {
		return
	}
	if req.Type == "potion" {
		w.usePotion(p)
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
	case "attack":
		w.tryStartAction(p, req.Slot, aim)
	}
}

func (w *World) actionDef(p *Player, slot string) *content.ActionDef {
	switch slot {
	case "basic":
		return p.Weapon.BasicAttack
	case "skill1", "skill2", "skill3":
		i := int(slot[5] - '1')
		if i >= 0 && i < len(p.Weapon.Skills) && p.Weapon.Skills[i].Implemented() {
			return &p.Weapon.Skills[i]
		}
	}
	return nil
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

func (w *World) tryStartAction(p *Player, slot string, aim *Vec) {
	def := w.actionDef(p, slot)
	if def == nil {
		return
	}
	if !w.cooldownReady(p, def.ID) {
		w.reject(p, slot, "cooldown")
		return
	}
	if !w.spendStamina(p, def.StaminaCost) {
		w.reject(p, slot, "stamina")
		return
	}
	w.trigger(p, def.ID, def.CooldownMs)
	if aim != nil {
		v := aim.Sub(p.Pos)
		if !v.IsZero() {
			p.Facing = VectorToDir8(v, p.Facing)
			p.AimAngle = math.Atan2(v.Y, v.X)
		}
	} else {
		p.AimAngle = DirToAngle(p.Facing)
	}
	a := &runningAction{Def: def, Slot: slot, StartedAt: w.Time, Angle: p.AimAngle}
	for range def.Hits {
		a.HitTargets = append(a.HitTargets, map[string]bool{})
	}
	p.action = a
	w.emit(Event{Type: "action", Time: w.Time, ActionID: def.ID, Slot: slot, Angle: fp(p.AimAngle), EntityID: p.ID})
	w.advanceAction(p, a)
}

func (w *World) advanceAction(p *Player, a *runningAction) {
	elapsed := w.Time - a.StartedAt
	for a.HitsDone < len(a.Def.Hits) {
		h := &a.Def.Hits[a.HitsDone]
		if elapsed < h.AtMs {
			break
		}
		w.performPlayerHit(p, a, h, a.HitTargets[a.HitsDone])
		a.HitsDone++
	}
	d := a.Def
	switch {
	case elapsed < d.WindupMs:
		p.CombatState = "windup"
	case elapsed < d.WindupMs+d.ActiveMs:
		if d.Counter != nil {
			p.CombatState = "counter"
		} else {
			p.CombatState = "active"
		}
	case elapsed < d.WindupMs+d.ActiveMs+d.RecoveryMs:
		p.CombatState = "recovery"
	default:
		if p.action == a {
			p.action = nil
		}
		p.CombatState = "idle"
	}
}

func (w *World) performPlayerHit(p *Player, a *runningAction, h *content.HitDef, already map[string]bool) {
	w.emit(Event{Type: "swing", Time: w.Time, ActionID: a.Def.ID, Origin: vp(p.Pos), Angle: fp(a.Angle), Radius: h.Radius, ArcDeg: h.ArcDeg, EntityID: p.ID})
	for _, m := range w.Monsters {
		if !m.Alive() || already[m.ID] {
			continue
		}
		if !ArcHitsCircle(p.Pos, a.Angle, h.Radius, h.ArcDeg, m.Pos, m.Def.Radius) || !w.Grid.LineOfSight(p.Pos, m.Pos) {
			continue
		}
		already[m.ID] = true
		w.damageMonster(p, m, a.Def.ID, h.Modifier, h.Knockback, h.ApplyStatus, h.Interrupt)
	}
}

func defenseMul(st []Status) float64 {
	v := 1.0
	for _, s := range st {
		v *= s.DefenseMul
	}
	return v
}

func (w *World) damageMonster(p *Player, m *Monster, actionID string, mod, knock float64, st *content.StatusDef, interrupt bool) {
	w.enterCombat(p)
	if m.AI == "RESET" {
		w.emit(Event{Type: "evade", Time: w.Time, TargetID: m.ID, Pos: vp(m.Pos), Reason: "reset"})
		return
	}
	coef := p.Weapon.WeaponCoefficient
	if coef == 0 {
		coef = 1
	}
	r := ComputeDamage(DamageInput{
		Base: p.Attack, WeaponCoef: coef, StatScaling: 1, SkillMod: mod,
		TargetDefense: m.Def.Defense, DefenseMul: defenseMul(m.Statuses),
		CritChance: w.C.Player.CritChance, CritMul: w.C.Player.CritMultiplier,
	}, w.Rng, w.defenseK, w.maxDamage)
	dealt := math.Min(float64(r.Amount), m.Hp)
	m.Hp = math.Max(0, m.Hp-float64(r.Amount))
	m.Contribution[p.ID] += dealt
	w.emit(Event{Type: "damage", Time: w.Time, SourceID: p.ID, TargetID: m.ID, Amount: r.Amount, IsCrit: r.IsCrit, Pos: vp(m.Pos), ActionID: actionID})
	if st != nil {
		kept := m.Statuses[:0]
		for _, s := range m.Statuses {
			if s.ID != st.ID {
				kept = append(kept, s)
			}
		}
		dm := st.DefenseMultiplier
		if dm == 0 {
			dm = 1
		}
		m.Statuses = append(kept, Status{ID: st.ID, ExpiresAt: w.Time + st.DurationMs, DefenseMul: dm})
		w.emit(Event{Type: "status", Time: w.Time, TargetID: m.ID, StatusID: st.ID, DurationMs: st.DurationMs})
	}
	if knock > 0 {
		dir := m.Pos.Sub(p.Pos).Normalize()
		sp := knock / knockbackMs * 1000
		m.knock = &struct{ vx, vy, until float64 }{dir.X * sp, dir.Y * sp, w.Time + knockbackMs}
	}
	if m.Hp <= 0 {
		w.killMonster(m, p)
		return
	}
	if m.Target == "" || w.players[m.Target] == nil || !w.players[m.Target].Alive() {
		m.Target = p.ID
	}
	if interrupt && m.AI == "ATTACK" && !m.attackResolved {
		m.staggerUntil = w.Time + staggerMs
		m.nextAttackAt = w.Time + staggerMs
		w.setAi(m, "CHASE")
		w.emit(Event{Type: "interrupt", Time: w.Time, EntityID: m.ID})
	}
	if m.AI == "IDLE" || m.AI == "PATROL" || m.AI == "ALERT" {
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
	// personal-loot eligibility by contribution share
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
		w.rewards = append(w.rewards, KillReward{MonsterID: m.ID, MonsterDef: m.Def.ID, DeathSeq: m.DeathSeq, PlayerIDs: eligible})
	}
	m.Contribution = map[string]float64{}
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
	p.Hp = math.Max(0, p.Hp-float64(r.Amount))
	w.enterCombat(p)
	e := RecapEntry{Time: w.Time, AttackerID: m.ID, AttackerName: m.Def.Name, ActionID: m.Def.ID + ":attack", Amount: r.Amount, IsCrit: r.IsCrit, Mitigation: r.Mitigation}
	p.recent = append(p.recent, e)
	for len(p.recent) > 0 && p.recent[0].Time < w.Time-recapWindowMs {
		p.recent = p.recent[1:]
	}
	w.emit(Event{Type: "damage", Time: w.Time, SourceID: m.ID, TargetID: p.ID, Amount: r.Amount, IsCrit: r.IsCrit, Pos: vp(p.Pos), ActionID: e.ActionID})
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
	for _, m := range w.Monsters {
		if !m.Alive() || !ArcHitsCircle(p.Pos, ang, c.Radius, c.ArcDeg, m.Pos, m.Def.Radius) {
			continue
		}
		w.damageMonster(p, m, a.Def.ID, c.Modifier, c.Knockback, nil, true)
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
	return p != nil && p.Alive() && w.Time >= p.SpawnProtectedUntil
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

func (w *World) updateMonster(m *Monster, dt float64) {
	now := w.Time
	kept := m.Statuses[:0]
	for _, s := range m.Statuses {
		if s.ExpiresAt > now {
			kept = append(kept, s)
		}
	}
	m.Statuses = kept

	if m.AI == "DEAD" {
		if now >= m.respawnAt {
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

	target := w.players[m.Target]
	reachFor := func(p *Player) float64 { return m.Def.AttackRange + m.Def.Radius + w.C.Player.Radius }

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
		if target == nil || !target.Alive() || Dist(m.Pos, m.Spawn) > m.Def.LeashRadius || Dist(m.Pos, target.Pos) > m.Def.LeashRadius*1.2 {
			w.setAi(m, "RESET")
			break
		}
		if now < m.staggerUntil {
			break
		}
		d := Dist(m.Pos, target.Pos)
		reach := reachFor(target)
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
			// resolve against every player inside reach (players can dodge out or i-frame)
			for _, id := range w.order {
				p := w.players[id]
				if p.Alive() && Dist(m.Pos, p.Pos) <= reachFor(p)+3 && w.Grid.LineOfSight(m.Pos, p.Pos) && id == m.Target {
					w.damagePlayer(m, p)
				}
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
		if m.Alive() {
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
