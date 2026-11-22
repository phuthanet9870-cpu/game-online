// Package realtime runs the authoritative world loop and the WebSocket protocol.
// All world mutations happen on the single loop goroutine; connections talk to it via channels.
package realtime

import (
	"context"
	"crypto/rand"
	"encoding/hex"
	"encoding/json"
	"fmt"
	"log/slog"
	"math"
	"sort"
	"strings"
	"sync"
	"sync/atomic"
	"time"
	"unicode"

	"github.com/phuthanet9870-cpu/game-online/server/internal/content"
	"github.com/phuthanet9870-cpu/game-online/server/internal/game"
	"github.com/phuthanet9870-cpu/game-online/server/internal/ratelimit"
	"github.com/phuthanet9870-cpu/game-online/server/internal/rbac"
	"github.com/phuthanet9870-cpu/game-online/server/internal/store"
)

type Config struct {
	TickHz        int // simulation rate
	SnapshotEvery int // ticks per snapshot
	GraceMs       float64
	SaveEvery     time.Duration
	TestWorld     bool // enables test-only GM tools (god mode, heal). Never true in production.
}

func DefaultConfig() Config {
	return Config{TickHz: 30, SnapshotEvery: 2, GraceMs: 15000, SaveEvery: 10 * time.Second, TestWorld: true}
}

// Store is the subset of persistence the hub needs (interface for tests).
type Store interface {
	ApplyReward(ctx context.Context, r store.Reward) error
	ConsumeItem(ctx context.Context, txID string, charID int64, templateID string, qty int, reason string) error
	SaveState(ctx context.Context, charID int64, mapID string, x, y float64, hp int) error
	Audit(ctx context.Context, e store.AuditEntry) error
	BindPower(ctx context.Context, txID string, charID int64, powerID, fruitItemID string, loadout []byte) error
	UnbindPower(ctx context.Context, txID string, charID int64, powerID string) error
	SaveLoadout(ctx context.Context, charID int64, powerID string, loadout []byte) error
	SaveProficiency(ctx context.Context, charID int64, powerID string, points int) error
	SaveHotbar(ctx context.Context, charID int64, hotbar []byte) error
	SaveAutoSettings(ctx context.Context, charID int64, settings []byte) error
	SetWeapon(ctx context.Context, charID int64, weapon string) error
	Craft(ctx context.Context, txID string, charID int64, inputs []store.ItemStack, output store.ItemStack) error
	ApplyExchange(ctx context.Context, x store.Exchange) error
	SetEquipment(ctx context.Context, charID int64, slot, templateID string) error
	Enhance(ctx context.Context, txID string, charID int64, templateID string, gold int64, stones []store.ItemStack, success bool) error
	MoveStorage(ctx context.Context, txID string, charID int64, templateID string, qty int) error
}

type Client struct {
	send   chan []byte
	closed atomic.Bool
	// Close terminates the connection with a reason (set by the transport).
	Close func(reason string)
}

func NewClient(close func(string)) *Client {
	return &Client{send: make(chan []byte, 128), Close: close}
}

// Outbox is read by the transport writer goroutine.
func (c *Client) Outbox() <-chan []byte { return c.send }

func (c *Client) push(b []byte) bool {
	if c.closed.Load() {
		return false
	}
	select {
	case c.send <- b:
		return true
	default:
		return false
	}
}

type session struct {
	pid        string
	charID     int64
	accountID  int64
	role       string
	name       string
	weapon     string
	client     *Client
	lastSeq    uint64
	move       game.Vec
	aim        *game.Vec
	actions    []game.ActionRequest
	inv        map[string]int
	gold, xp   int64
	level      int
	gmHud      bool
	chatBucket *ratelimit.Bucket
	inBucket   *ratelimit.Bucket
	violations int
	dropped    int
	archive    map[string]int // power id -> proficiency points (Power Archive)
	profDirty  bool
	hotbar     json.RawMessage
	auto       game.AutoState
	autoCfg    game.AutoSettings
	manualMove bool
	mapID      string
	storage    map[string]int
	equip      map[string]string // slot -> template
	enh        map[string]int    // template -> +level
}

type JoinRequest struct {
	Account   *store.Account
	Character *store.Character
	Items     []store.ItemStack
	Extras    *store.CharacterExtras
	Client    *Client
	Reply     chan error
}

type inbound struct {
	pid    string
	client *Client
	msg    clientMsg
}

type leave struct {
	pid    string
	client *Client
}

type Hub struct {
	cfg        Config
	c          *content.Content
	world      *game.World
	st         Store
	persist    *Persister
	log        *slog.Logger
	instanceID string
	lootRng    *game.Rng
	inbox      chan any
	sessions   map[string]*session
	pending    map[string][]game.Event // per map
	worlds     map[string]*game.World  // one authoritative instance per map
	tick       uint64
	lastSave   time.Time
	Online     atomic.Int32
	present    sync.Map // pid -> struct{} (sessions incl. grace), readable from HTTP goroutines
	Stats      struct {
		Snapshots, InputsAccepted, InputsReplayed, InputsRateLimited, Kicks atomic.Int64
	}
}

func randomID(n int) string {
	b := make([]byte, n)
	_, _ = rand.Read(b)
	return hex.EncodeToString(b)
}

func NewHub(cfg Config, c *content.Content, st Store, persist *Persister, log *slog.Logger) *Hub {
	seed := uint32(time.Now().UnixNano())
	h := &Hub{
		cfg: cfg, c: c, st: st, persist: persist, log: log,
		instanceID: randomID(6),
		lootRng:    game.NewRng(seed ^ 0x9e3779b9),
		inbox:      make(chan any, 4096),
		sessions:   map[string]*session{},
		pending:    map[string][]game.Event{},
		worlds:     map[string]*game.World{},
	}
	i := uint32(0)
	for id, m := range c.Maps {
		i++
		w := game.NewWorldForMap(c, m, seed+i*7919)
		w.ConsumeItem = h.consumeItem
		h.worlds[id] = w
	}
	h.world = h.worlds[c.StartMap]
	return h
}

// use switches the hub's current world to the session's map (single loop goroutine — no races).
func (h *Hub) use(s *session) *game.World {
	if w := h.worlds[s.mapID]; w != nil {
		h.world = w
	}
	return h.world
}

// World returns the instance for a map id (tests / GM tools).
func (h *Hub) World(mapID string) *game.World { return h.worlds[mapID] }

func (h *Hub) sortedMaps() []string {
	ids := make([]string, 0, len(h.worlds))
	for id := range h.worlds {
		ids = append(ids, id)
	}
	sort.Strings(ids)
	return ids
}

func (h *Hub) InstanceID() string { return h.instanceID }

// HasSession reports whether a character is in the world (online or within reconnect grace).
func (h *Hub) HasSession(pid string) bool { _, ok := h.present.Load(pid); return ok }

// Join hands a new authenticated connection to the loop. Blocks until accepted.
func (h *Hub) Join(ctx context.Context, r JoinRequest) error {
	r.Reply = make(chan error, 1)
	select {
	case h.inbox <- r:
	case <-ctx.Done():
		return ctx.Err()
	}
	select {
	case err := <-r.Reply:
		return err
	case <-ctx.Done():
		return ctx.Err()
	}
}

// Receive forwards one raw client frame to the loop.
func (h *Hub) Receive(pid string, c *Client, raw []byte) {
	var m clientMsg
	if err := json.Unmarshal(raw, &m); err != nil {
		m = clientMsg{T: "invalid"}
	}
	select {
	case h.inbox <- inbound{pid, c, m}:
	default: // loop overloaded: drop input frames rather than block the reader
	}
}

func (h *Hub) Leave(pid string, c *Client) {
	select {
	case h.inbox <- leave{pid, c}:
	case <-time.After(2 * time.Second): // loop stopped (shutdown)
	}
}

func PlayerID(charID int64) string { return fmt.Sprintf("c%d", charID) }

// Run drives the fixed-step world until ctx is cancelled.
func (h *Hub) Run(ctx context.Context) {
	dt := 1000.0 / float64(h.cfg.TickHz)
	t := time.NewTicker(time.Duration(float64(time.Second) / float64(h.cfg.TickHz)))
	defer t.Stop()
	h.lastSave = time.Now()
	for {
		select {
		case m := <-h.inbox:
			h.handle(m)
		case <-t.C:
			h.step(dt)
		case <-ctx.Done():
			h.shutdown()
			return
		}
	}
}

func (h *Hub) handle(m any) {
	switch v := m.(type) {
	case JoinRequest:
		v.Reply <- h.join(v)
	case leave:
		if s := h.sessions[v.pid]; s != nil && s.client == v.client {
			h.use(s)
			s.client = nil
			if p := h.world.Player(v.pid); p != nil {
				p.Connected = false
				p.DisconnectedAt = h.world.Time
			}
			h.Online.Add(-1)
			h.log.Info("player disconnected (grace)", "pid", v.pid)
		}
	case inbound:
		if s := h.sessions[v.pid]; s != nil && s.client == v.client {
			h.use(s)
			h.onMessage(s, v.msg)
		}
	}
}

func (h *Hub) join(r JoinRequest) error {
	ch := r.Character
	pid := PlayerID(ch.ID)
	s := h.sessions[pid]
	if s != nil {
		// Reconnect / refresh / second login: in-memory state is authoritative and kept.
		h.use(s)
		if s.client != nil {
			h.send(s.client, map[string]any{"t": "kicked", "reason": "เข้าสู่ระบบจากที่อื่น"})
			s.client.closed.Store(true)
			s.client.Close("logged in elsewhere")
			h.Online.Add(-1)
		}
		s.client = r.Client
		s.lastSeq = 0
		s.move, s.aim, s.actions = game.Vec{}, nil, nil
		if p := h.world.Player(pid); p != nil {
			p.Connected = true
		}
	} else {
		s = &session{
			pid: pid, charID: ch.ID, accountID: r.Account.ID, role: r.Account.Role, name: ch.Name, weapon: ch.Weapon,
			client: r.Client, inv: map[string]int{}, gold: ch.Gold, xp: ch.XP, level: ch.Level,
			chatBucket: ratelimit.NewBucket(5, 0.5), inBucket: ratelimit.NewBucket(60, 40),
			mapID: h.c.StartMap,
		}
		if m := h.c.Maps[ch.MapID]; m != nil && (m.Core || m.Kind == "dev") {
			s.mapID = ch.MapID // instance maps (dungeon/arena) are never resumed: back to the city
		}
		h.use(s)
		for _, it := range r.Items {
			s.inv[it.TemplateID] += it.Quantity
		}
		init := game.PlayerInit{ID: pid, CharacterID: ch.ID, Name: ch.Name, WeaponID: ch.Weapon, Level: ch.Level}
		if ch.PosX != nil && ch.PosY != nil && s.mapID == ch.MapID {
			init.Pos = &game.Vec{X: float64(*ch.PosX), Y: float64(*ch.PosY)}
		}
		if ch.Hp != nil && *ch.Hp > 0 {
			init.Hp = float64(*ch.Hp)
		}
		p := h.world.AddPlayer(init)
		h.sessions[pid] = s
		h.present.Store(pid, struct{}{})
		h.loadExtras(s, p, r.Extras)
	}
	s.role = r.Account.Role // role changes apply on next connect
	h.Online.Add(1)
	p := h.world.Player(pid)
	h.send(s.client, map[string]any{
		"t": "welcome", "instance": h.instanceID, "serverTime": h.world.Time, "tickMs": 1000 / h.cfg.TickHz,
		"you": map[string]any{"id": pid, "charId": ch.ID, "name": s.name, "level": s.level, "weapon": p.Weapon.ID},
		"map": s.mapID, "testWorld": h.cfg.TestWorld,
	})
	h.sendInventory(s)
	h.sendPower(s)
	h.send(s.client, map[string]any{"t": "hotbar", "slots": s.hotbar})
	h.sendAuto(s, nil)
	h.broadcastSys(fmt.Sprintf("%s เข้าสู่โลก", s.name), "normal", pid)
	h.log.Info("player joined", "pid", pid, "name", s.name, "online", h.Online.Load())
	return nil
}

/* ---------------------------------------------------------------- messages */

type clientMsg struct {
	T    string               `json:"t"`
	Seq  uint64               `json:"seq"`
	Mv   []float64            `json:"mv"`
	Aim  []float64            `json:"aim"`
	Act  []game.ActionRequest `json:"act"`
	Text string               `json:"text"`
	C    float64              `json:"c"`
	// Phase 3 commands
	Weapon   string             `json:"weapon"`
	ItemID   string             `json:"itemId"`
	Confirm  string             `json:"confirm"`
	Recipe   string             `json:"recipe"`
	DropID   string             `json:"id"`
	Enabled  *bool              `json:"enabled"`
	Settings *game.AutoSettings `json:"settings"`
	Loadout  *game.Loadout      `json:"loadout"`
	Slots    []hotbarSlot       `json:"slots"`
	Op       string             `json:"op"`
	Target   string             `json:"target"`
	Qty      int                `json:"qty"`
	Count    int                `json:"count"`
	Points   int                `json:"points"`
	NPC      string             `json:"npc"`
}

var validSlots = map[string]bool{"basic": true, "skill1": true, "skill2": true, "skill3": true}
var validPowerSlots = map[string]bool{"p1": true, "p2": true, "p3": true, "p4": true, "p5": true, "ult": true}

func finite(f float64) bool { return !math.IsNaN(f) && !math.IsInf(f, 0) }

func (h *Hub) violation(s *session, why string) {
	s.violations++
	if s.violations > 200 && s.client != nil {
		h.log.Warn("kicking client for protocol abuse", "pid", s.pid, "why", why)
		h.Stats.Kicks.Add(1)
		h.kick(s, "ส่งข้อมูลผิดปกติหรือเร็วเกินกำหนด")
	}
}

func (h *Hub) onMessage(s *session, m clientMsg) {
	now := time.Now()
	switch m.T {
	case "input":
		if !s.inBucket.Allow(now) {
			h.Stats.InputsRateLimited.Add(1)
			h.violation(s, "input rate")
			return
		}
		if m.Seq <= s.lastSeq { // replay / duplicate: idempotent ignore
			h.Stats.InputsReplayed.Add(1)
			return
		}
		s.lastSeq = m.Seq
		if len(m.Mv) == 2 && finite(m.Mv[0]) && finite(m.Mv[1]) {
			s.move = game.ClampUnit(game.Vec{X: m.Mv[0], Y: m.Mv[1]})
			s.manualMove = !s.move.IsZero()
		}
		if len(m.Aim) == 2 && finite(m.Aim[0]) && finite(m.Aim[1]) {
			s.aim = &game.Vec{X: m.Aim[0], Y: m.Aim[1]}
		}
		if len(m.Act) > 4 {
			h.violation(s, "too many actions")
			m.Act = m.Act[:4]
		}
		for _, a := range m.Act {
			ok := (a.Type == "attack" && validSlots[a.Slot]) || a.Type == "dash" || a.Type == "potion" || a.Type == "stance" ||
				(a.Type == "power" && validPowerSlots[a.Slot])
			if !ok {
				h.violation(s, "bad action")
				continue
			}
			if len(s.actions) < 8 {
				s.actions = append(s.actions, game.ActionRequest{Type: a.Type, Slot: a.Slot})
			}
		}
		h.Stats.InputsAccepted.Add(1)
	case "chat":
		if !s.chatBucket.Allow(now) {
			h.sendSys(s, "ส่งข้อความเร็วเกินไป กรุณารอสักครู่", "warn")
			return
		}
		text := sanitizeChat(m.Text)
		if text == "" {
			return
		}
		if strings.HasPrefix(text, "/") {
			h.command(s, text)
			return
		}
		h.broadcast(map[string]any{"t": "chat", "from": s.name, "text": text, "ch": "world"}, "")
	case "ping":
		h.send(s.client, map[string]any{"t": "pong", "c": m.C, "s": h.world.Time})
	case "equip", "bind", "unbind", "loadout", "craft", "hotbar", "auto", "pickup", "gm":
		h.onPhase3(s, m)
	case "talk", "shop", "storage", "equipItem", "unequip", "smith":
		h.onPhase4(s, m)
	default:
		h.violation(s, "unknown message")
	}
}

func sanitizeChat(t string) string {
	t = strings.TrimSpace(strings.Map(func(r rune) rune {
		if unicode.IsControl(r) {
			return -1
		}
		return r
	}, t))
	if r := []rune(t); len(r) > 120 {
		t = string(r[:120])
	}
	return t
}

/* --------------------------------------------------------------- GM / cmds */

func (h *Hub) audit(s *session, perm rbac.Capability, action, target, result, reason string, params map[string]any) {
	var pj []byte
	if params != nil {
		pj, _ = json.Marshal(params)
	}
	e := store.AuditEntry{RequestID: randomID(8), ActorAcct: s.accountID, ActorChar: s.charID, Permission: string(perm), Action: action, Target: target, ParamsJSON: pj, Result: result, Reason: reason}
	h.persist.Enqueue("audit:"+action, func(ctx context.Context) error { return h.st.Audit(ctx, e) })
}

func (h *Hub) require(s *session, cap rbac.Capability, action, target string) bool {
	if rbac.Has(s.role, cap) {
		return true
	}
	h.sendSys(s, "Permission Denied", "bad")
	h.audit(s, cap, action, target, "denied", "missing capability", nil)
	h.log.Warn("unauthorized GM command attempt", "pid", s.pid, "role", s.role, "action", action)
	return false
}

func (h *Hub) command(s *session, text string) {
	f := strings.Fields(text)
	cmd := f[0]
	switch {
	case cmd == "/gmstefanonline":
		if !h.require(s, rbac.GMHudOpen, "gm.hud.toggle", "") {
			return
		}
		s.gmHud = !s.gmHud
		caps := rbac.Caps(s.role)
		h.send(s.client, map[string]any{"t": "gm", "open": s.gmHud, "role": s.role, "caps": caps, "testWorld": h.cfg.TestWorld, "online": len(h.sessions)})
		h.audit(s, rbac.GMHudOpen, "gm.hud.toggle", "", "ok", "", map[string]any{"open": s.gmHud})
	case cmd == "/gm" && len(f) >= 2:
		h.gmCommand(s, f[1:])
	case cmd == "/help":
		h.sendSys(s, "คำสั่ง: /help · /gmstefanonline (เฉพาะทีมงานที่ server ยืนยันสิทธิ์)", "normal")
	default:
		h.sendSys(s, "ไม่รู้จักคำสั่ง "+cmd, "warn")
	}
}

func (h *Hub) gmCommand(s *session, args []string) {
	switch args[0] {
	case "who":
		if !h.require(s, rbac.PlayersView, "gm.players.who", "") {
			return
		}
		var names []string
		for _, x := range h.sessions {
			st := "online"
			if x.client == nil {
				st = "grace"
			}
			names = append(names, fmt.Sprintf("%s(Lv.%d,%s)", x.name, x.level, st))
		}
		sort.Strings(names)
		h.sendSys(s, fmt.Sprintf("ผู้เล่น %d: %s", len(names), strings.Join(names, ", ")), "normal")
		h.audit(s, rbac.PlayersView, "gm.players.who", "", "ok", "", nil)
	case "kick":
		if len(args) < 2 {
			h.sendSys(s, "ใช้: /gm kick <ชื่อตัวละคร>", "warn")
			return
		}
		if !h.require(s, rbac.PlayersKick, "gm.players.kick", args[1]) {
			return
		}
		for _, x := range h.sessions {
			if strings.EqualFold(x.name, args[1]) && x.client != nil {
				h.kick(x, "ถูกเตะออกโดยทีมงาน")
				h.sendSys(s, "เตะ "+x.name+" แล้ว", "good")
				h.audit(s, rbac.PlayersKick, "gm.players.kick", x.name, "ok", "", nil)
				return
			}
		}
		h.sendSys(s, "ไม่พบผู้เล่นออนไลน์ชื่อ "+args[1], "warn")
		h.audit(s, rbac.PlayersKick, "gm.players.kick", args[1], "error", "not online", nil)
	case "god", "heal":
		cap := rbac.GodModeTest
		if args[0] == "heal" {
			cap = rbac.HealTest
		}
		if !h.require(s, cap, "gm."+args[0], s.name) {
			return
		}
		if !h.cfg.TestWorld {
			h.sendSys(s, "คำสั่งทดสอบใช้ได้เฉพาะ Test World", "bad")
			h.audit(s, cap, "gm."+args[0], s.name, "denied", "not a test world", nil)
			return
		}
		p := h.world.Player(s.pid)
		if args[0] == "heal" {
			p.Hp, p.Stamina = p.MaxHp, h.c.Player.Stamina.Max
			h.sendSys(s, "ฟื้นฟู HP/Stamina (Test World)", "good")
		} else {
			p.GodMode = len(args) < 2 || args[1] != "off"
			h.sendSys(s, fmt.Sprintf("God mode: %v (Test World)", p.GodMode), "good")
		}
		h.audit(s, cap, "gm."+args[0], s.name, "ok", "", map[string]any{"args": args})
	default:
		h.sendSys(s, "ไม่รู้จักคำสั่ง GM: "+args[0], "warn")
	}
}

/* -------------------------------------------------------------------- tick */

func (h *Hub) step(dt float64) {
	for _, id := range h.sortedMaps() {
		w := h.worlds[id]
		h.world = w
		inputs := map[string]game.Input{}
		for pid, s := range h.sessions {
			if s.mapID != id {
				continue
			}
			in := game.Input{Move: s.move, Aim: s.aim, Actions: s.actions}
			if s.auto.Enabled {
				in = h.autoInput(s, in)
			}
			inputs[pid] = in
			s.actions, s.aim = nil, nil
		}
		w.Step(dt, inputs)
		h.pending[id] = append(h.pending[id], w.DrainEvents()...)
		h.processRewards()
	}
	h.checkPortals()
	h.tick++
	if h.tick%uint64(h.cfg.SnapshotEvery) == 0 {
		h.broadcastSnapshots()
	}
	// grace expiry
	for pid, s := range h.sessions {
		if s.client != nil {
			continue
		}
		h.use(s)
		p := h.world.Player(pid)
		if p == nil || h.world.Time-p.DisconnectedAt >= h.cfg.GraceMs {
			if s.auto.Enabled {
				s.auto.Stop(h.world.Time, "disconnected")
			}
			h.saveState(s)
			h.world.RemovePlayer(pid)
			delete(h.sessions, pid)
			h.present.Delete(pid)
			h.broadcastSys(fmt.Sprintf("%s ออกจากโลก", s.name), "normal", "")
		}
	}
	if time.Since(h.lastSave) >= h.cfg.SaveEvery {
		h.lastSave = time.Now()
		for _, s := range h.sessions {
			h.use(s)
			h.saveState(s)
		}
	}
}

// checkPortals moves connected, living players who stand in a portal to the target map.
func (h *Hub) checkPortals() {
	for _, s := range h.sessions {
		if s.client == nil {
			continue
		}
		w := h.use(s)
		p := w.Player(s.pid)
		if p == nil || !p.Alive() {
			continue
		}
		pt := w.PortalAt(p)
		if pt == nil || h.worlds[pt.TargetMap] == nil {
			continue
		}
		h.transfer(s, pt.TargetMap, game.Vec{X: pt.TargetX, Y: pt.TargetY})
	}
}

// transfer moves a session's player object (all live state kept) to another map instance.
func (h *Hub) transfer(s *session, mapID string, pos game.Vec) {
	from := h.use(s)
	if s.auto.Enabled {
		r := s.auto.Stop(from.Time, "map-change")
		h.sendAuto(s, &r)
	}
	p := from.TransferOut(s.pid)
	if p == nil {
		return
	}
	s.mapID = mapID
	to := h.use(s)
	to.TransferIn(p, pos)
	s.move = game.Vec{}
	m := h.c.Maps[mapID]
	h.send(s.client, map[string]any{"t": "map", "map": mapID, "name": m.DisplayName, "kind": m.Kind, "pos": p.Pos})
	h.saveState(s)
}

func (h *Hub) saveState(s *session) {
	p := h.world.Player(s.pid)
	if p == nil {
		return
	}
	x, y, hp, id := p.Pos.X, p.Pos.Y, int(math.Ceil(p.Hp)), s.charID
	if !p.Alive() {
		sp := h.world.SpawnPoint()
		x, y, hp = sp.X, sp.Y, int(p.MaxHp)
	}
	mapID := s.mapID
	if m := h.c.Maps[mapID]; m == nil || !(m.Core || m.Kind == "dev") {
		mapID, x, y = h.c.StartMap, h.c.Maps[h.c.StartMap].PlayerSpawn[0], h.c.Maps[h.c.StartMap].PlayerSpawn[1]
	}
	h.persist.Enqueue(fmt.Sprintf("save:%d", id), func(ctx context.Context) error { return h.st.SaveState(ctx, id, mapID, x, y, hp) })
	h.saveProficiency(s)
}

// LevelForXP returns the level reached with total accumulated XP ([TUNING] curve).
func LevelForXP(p content.Progression, total int64) int {
	level := 1
	need := int64(0)
	for level < p.MaxLevel {
		need += p.XPToNext(level)
		if total < need {
			break
		}
		level++
	}
	return level
}

// LevelBounds returns total XP at the start of `level` and at the next level.
func LevelBounds(p content.Progression, level int) (start, next int64) {
	for l := 1; l < level; l++ {
		start += p.XPToNext(l)
	}
	return start, start + p.XPToNext(level)
}

func (h *Hub) processRewards() {
	for _, r := range h.world.DrainRewards() {
		table := h.c.Drops[r.MonsterDef]
		if table == nil {
			continue
		}
		for _, pid := range r.PlayerIDs {
			s := h.sessions[pid]
			p := h.world.Player(pid)
			if s == nil || p == nil {
				continue
			}
			loot := game.RollLoot(table, h.lootRng)
			// map trade loot (12 sellable items per farm map) rolled per eligible player
			if ml := h.c.MapLoot[h.world.Map.MapID]; ml != nil {
				for r := 0; r < max(1, ml.Rolls); r++ {
					for _, d := range ml.Items {
						if h.lootRng.Next() < d.Chance {
							loot.Items = append(loot.Items, game.LootItem{ItemID: d.ItemID, Quantity: int(h.lootRng.IntRange(int64(d.Min), int64(d.Max)))})
							break
						}
					}
				}
			}
			// XP is credited immediately; Gold and items go into a personal loot bag (pickup / Auto Loot)
			s.xp += loot.XP
			newLevel := LevelForXP(h.c.Progression, s.xp)
			levelUp := newLevel > s.level
			if levelUp {
				s.level = newLevel
				h.world.SetLevel(p, newLevel)
			}
			base := fmt.Sprintf("%s:%s:%d:%d", h.instanceID, r.MonsterID, r.DeathSeq, s.charID)
			rw := store.Reward{TxID: "kill:" + base, CharID: s.charID, XPDelta: loot.XP, LevelAfter: s.level, Reason: "kill:" + r.MonsterDef}
			h.persist.Enqueue(rw.TxID, func(ctx context.Context) error { return h.st.ApplyReward(ctx, rw) })
			if s.auto.Enabled {
				s.auto.Report.Kills++
				s.auto.Report.XP += loot.XP
			}
			if loot.Gold > 0 || len(loot.Items) > 0 {
				jit := game.Vec{X: r.Pos.X + h.lootRng.Range(-6, 6), Y: r.Pos.Y + h.lootRng.Range(-6, 6)}
				h.world.AddDrop(p, jit, loot.Gold, loot.Items, "loot:"+base, r.MonsterDef)
			}
			if s.client != nil {
				h.send(s.client, map[string]any{"t": "reward", "monster": r.MonsterDef, "xp": loot.XP, "levelUp": levelUp, "level": s.level})
				h.sendInventory(s)
			}
		}
	}
}

// addItems applies inventory slot/stack limits; overflow is reported, never silently duplicated.
func (h *Hub) addItems(s *session, items []game.LootItem) []game.LootItem {
	var out []game.LootItem
	for _, it := range items {
		t := h.c.Items[it.ItemID]
		if t == nil {
			continue
		}
		have, exists := s.inv[it.ItemID]
		if !exists && len(s.inv) >= h.c.Progression.InventorySlots {
			h.sendSys(s, "กระเป๋าเต็ม: "+t.Name+" สูญหาย", "warn")
			continue
		}
		q := it.Quantity
		if have+q > t.MaxStack {
			q = t.MaxStack - have
		}
		if q <= 0 {
			h.sendSys(s, t.Name+" เต็ม stack แล้ว", "warn")
			continue
		}
		s.inv[it.ItemID] = have + q
		out = append(out, game.LootItem{ItemID: it.ItemID, Quantity: q})
	}
	return out
}

func (h *Hub) consumeItem(p *game.Player, itemID string) bool {
	s := h.sessions[p.ID]
	if s == nil || s.inv[itemID] <= 0 {
		return false
	}
	s.inv[itemID]--
	if s.inv[itemID] == 0 {
		delete(s.inv, itemID)
	}
	if s.auto.Enabled {
		s.auto.Report.PotionsUsed++
	}
	txID := "use:" + randomID(10)
	id := s.charID
	h.persist.Enqueue(txID, func(ctx context.Context) error { return h.st.ConsumeItem(ctx, txID, id, itemID, 1, "use") })
	h.sendInventory(s)
	return true
}

/* ---------------------------------------------------------------- outbound */

func (h *Hub) send(c *Client, v any) {
	if c == nil {
		return
	}
	b, err := json.Marshal(v)
	if err != nil {
		h.log.Error("marshal", "err", err)
		return
	}
	c.push(b)
}

func (h *Hub) sendSys(s *session, text, tone string) {
	h.send(s.client, map[string]any{"t": "sys", "text": text, "tone": tone})
}

func (h *Hub) broadcast(v any, except string) {
	b, _ := json.Marshal(v)
	for pid, s := range h.sessions {
		if pid != except && s.client != nil {
			s.client.push(b)
		}
	}
}

func (h *Hub) broadcastSys(text, tone, except string) {
	h.broadcast(map[string]any{"t": "sys", "text": text, "tone": tone}, except)
}

func (h *Hub) kick(s *session, reason string) {
	if s.client == nil {
		return
	}
	prev := h.world
	defer func() { h.world = prev }()
	h.use(s)
	h.send(s.client, map[string]any{"t": "kicked", "reason": reason})
	c := s.client
	c.closed.Store(true)
	s.client = nil
	if p := h.world.Player(s.pid); p != nil {
		p.Connected = false
		p.DisconnectedAt = h.world.Time
	}
	h.Online.Add(-1)
	go func() { time.Sleep(100 * time.Millisecond); c.Close(reason) }()
}

func (h *Hub) sendInventory(s *session) {
	start, next := LevelBounds(h.c.Progression, s.level)
	items := make([]store.ItemStack, 0, len(s.inv))
	for id, q := range s.inv {
		items = append(items, store.ItemStack{TemplateID: id, Quantity: q})
	}
	sort.Slice(items, func(i, j int) bool { return items[i].TemplateID < items[j].TemplateID })
	h.send(s.client, map[string]any{"t": "inv", "gold": s.gold, "xp": s.xp, "level": s.level, "xpLevelStart": start, "xpLevelNext": next,
		"items": items, "slots": h.c.Progression.InventorySlots, "equipment": s.equip, "enhance": s.enh})
}

type actionView struct {
	ID        string  `json:"id"`
	StartedAt float64 `json:"startedAt"`
	Angle     float64 `json:"angle"`
}

type playerView struct {
	ID          string      `json:"id"`
	Name        string      `json:"name"`
	X           float64     `json:"x"`
	Y           float64     `json:"y"`
	Facing      string      `json:"facing"`
	Hp          int         `json:"hp"`
	MaxHp       int         `json:"maxHp"`
	Level       int         `json:"level"`
	CharState   string      `json:"charState"`
	CombatState string      `json:"combatState"`
	Moving      bool        `json:"moving"`
	Dashing     bool        `json:"dashing"`
	Action      *actionView `json:"action"`
	InvUntil    float64     `json:"invUntil"`
	Connected   bool        `json:"connected"`
	Weapon      string      `json:"weapon"`
	Stance      bool        `json:"stance"`
	Stealth     bool        `json:"stealth"`
}

type monsterView struct {
	ID              string        `json:"id"`
	Def             string        `json:"def"`
	X               float64       `json:"x"`
	Y               float64       `json:"y"`
	Hp              int           `json:"hp"`
	AI              string        `json:"ai"`
	FacingX         int           `json:"fx"`
	Statuses        []game.Status `json:"st"`
	AttackStartedAt float64       `json:"as"`
	DiedAt          float64       `json:"da"`
}

type selfView struct {
	playerView
	Stamina    float64               `json:"stamina"`
	MaxStamina float64               `json:"maxStamina"`
	Cooldowns  map[string][2]float64 `json:"cds"`
	RespawnAt  float64               `json:"respawnAt"`
	Recap      []game.RecapEntry     `json:"recap,omitempty"`
	SpawnProt  float64               `json:"spawnProt"`
	Energy     float64               `json:"energy"`
	MaxEnergy  float64               `json:"maxEnergy"`
	Statuses   []statusView          `json:"statuses"`
	Drops      []dropView            `json:"drops"`
	PowerPts   int                   `json:"powerPts"`
}

type statusView struct {
	ID        string  `json:"id"`
	ExpiresAt float64 `json:"expiresAt"`
}

type dropView struct {
	ID string  `json:"id"`
	X  float64 `json:"x"`
	Y  float64 `json:"y"`
}

func r1(f float64) float64 { return math.Round(f*10) / 10 }

func viewOf(p *game.Player) playerView {
	v := playerView{ID: p.ID, Name: p.Name, X: r1(p.Pos.X), Y: r1(p.Pos.Y), Facing: p.Facing, Hp: int(math.Ceil(p.Hp)), MaxHp: int(p.MaxHp),
		Level: p.Level, CharState: p.CharState, CombatState: p.CombatState, Moving: p.Moving, Dashing: p.Dashing(), InvUntil: p.InvulnerableUntil, Connected: p.Connected,
		Weapon: p.Weapon.ID, Stance: p.Power != nil && p.Power.Stance, Stealth: p.HasStatus("stealth")}
	if id, st, ang, ok := p.ActionView(); ok {
		v.Action = &actionView{ID: id, StartedAt: st, Angle: ang}
	}
	return v
}

func (h *Hub) broadcastSnapshots() {
	for _, id := range h.sortedMaps() {
		h.world = h.worlds[id]
		h.broadcastMapSnapshot(id)
	}
}

func (h *Hub) broadcastMapSnapshot(mapID string) {
	players := h.world.Players()
	pv := make([]playerView, 0, len(players))
	for _, p := range players {
		pv = append(pv, viewOf(p))
	}
	mv := make([]monsterView, 0, len(h.world.Monsters))
	for _, m := range h.world.Monsters {
		mv = append(mv, monsterView{ID: m.ID, Def: m.Def.ID, X: r1(m.Pos.X), Y: r1(m.Pos.Y), Hp: int(math.Ceil(m.Hp)), AI: m.AI, FacingX: m.FacingX,
			Statuses: m.Statuses, AttackStartedAt: m.AttackStartedAt, DiedAt: m.DiedAt})
	}
	sharedPlayers, _ := json.Marshal(pv)
	sharedMonsters, _ := json.Marshal(mv)
	var public []game.Event
	private := map[string][]game.Event{}
	for _, e := range h.pending[mapID] {
		if e.Only != "" {
			private[e.Only] = append(private[e.Only], e)
		} else {
			public = append(public, e)
		}
	}
	h.pending[mapID] = nil
	cdIDs := []string{"dash", "potion"}
	for pid, s := range h.sessions {
		if s.client == nil || s.mapID != mapID {
			continue
		}
		p := h.world.Player(pid)
		if p == nil {
			continue
		}
		self := selfView{playerView: viewOf(p), Stamina: math.Floor(p.Stamina), MaxStamina: h.c.Player.Stamina.Max, RespawnAt: p.RespawnAt,
			Cooldowns: map[string][2]float64{}, SpawnProt: p.SpawnProtectedUntil, Energy: math.Floor(p.Energy), MaxEnergy: h.c.Powers.Energy.Max,
			Statuses: []statusView{}, Drops: []dropView{}}
		for _, st := range p.Statuses {
			self.Statuses = append(self.Statuses, statusView{ID: st.ID, ExpiresAt: st.ExpiresAt})
		}
		for _, d := range h.world.DropsOf(pid) {
			self.Drops = append(self.Drops, dropView{ID: d.ID, X: r1(d.Pos.X), Y: r1(d.Pos.Y)})
		}
		if p.Power != nil {
			self.PowerPts = p.Power.Points
		}
		ids := append([]string{}, cdIDs...)
		if p.Weapon.BasicAttack != nil {
			ids = append(ids, p.Weapon.BasicAttack.ID)
		}
		for _, sk := range p.Weapon.Skills {
			ids = append(ids, sk.ID)
		}
		if p.Power != nil {
			ids = append(ids, p.Power.Loadout.Actives...)
			ids = append(ids, p.Power.Loadout.Ultimate)
		}
		for _, id := range ids {
			if rem := p.CooldownRemaining(id, h.world.Time); rem > 0 {
				self.Cooldowns[id] = [2]float64{math.Round(rem), p.CooldownDuration(id)}
			}
		}
		if p.CharState == "DEAD" {
			self.Recap = p.LastDeathRecap
		}
		ev := public
		if pe := private[pid]; len(pe) > 0 {
			ev = append(append([]game.Event{}, public...), pe...)
		}
		youJSON, _ := json.Marshal(self)
		evJSON, _ := json.Marshal(ev)
		msg := fmt.Appendf(nil, `{"t":"snap","st":%g,"ack":%d,"you":%s,"players":%s,"monsters":%s,"ev":%s}`,
			h.world.Time, s.lastSeq, youJSON, sharedPlayers, sharedMonsters, evJSON)
		if !s.client.push(msg) {
			s.dropped++
			if s.dropped > 60 {
				h.log.Warn("client too slow, disconnecting", "pid", pid)
				h.kick(s, "การเชื่อมต่อช้าเกินไป")
			}
		} else {
			s.dropped = 0
			h.Stats.Snapshots.Add(1)
		}
	}
}

func (h *Hub) shutdown() {
	for _, s := range h.sessions {
		h.use(s)
		h.saveState(s)
		if s.client != nil {
			h.send(s.client, map[string]any{"t": "kicked", "reason": "เซิร์ฟเวอร์ปิดปรับปรุง"})
			c := s.client
			c.closed.Store(true)
			c.Close("server shutdown")
		}
	}
	h.log.Info("hub stopped", "sessions", len(h.sessions))
}
