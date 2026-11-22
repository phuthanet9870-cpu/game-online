package realtime

import (
	"context"
	"encoding/json"
	"fmt"
	"math"
	"strings"

	"github.com/phuthanet9870-cpu/game-online/server/internal/content"
	"github.com/phuthanet9870-cpu/game-online/server/internal/game"
	"github.com/phuthanet9870-cpu/game-online/server/internal/rbac"
	"github.com/phuthanet9870-cpu/game-online/server/internal/store"
)

const (
	npcRange        = 40.0 // px; must stand next to The Severer
	autoPickupRange = 30.0
)

/* ------------------------------------------------------------------ load */

func (h *Hub) loadExtras(s *session, p *game.Player, x *store.CharacterExtras) {
	s.archive = map[string]int{}
	s.storage = map[string]int{}
	s.equip = map[string]string{}
	s.enh = map[string]int{}
	s.quests = map[string]*questState{}
	s.autoCfg = game.DefaultAutoSettings()
	defer func() {
		// characters created before equipment existed: the carried weapon type maps to its template
		if s.equip["weapon"] == "" {
			if id := h.c.Progression.StarterWeaponItems[p.Weapon.ID]; s.inv[id] > 0 {
				s.equip["weapon"] = id
				cid := s.charID
				h.persist.Enqueue("equip", func(ctx context.Context) error { return h.st.SetEquipment(ctx, cid, "weapon", id) })
			}
		}
		h.applyEquip(s, p)
	}()
	if x == nil {
		return
	}
	for slot, id := range x.Equipment {
		if s.inv[id] > 0 {
			s.equip[slot] = id
		}
	}
	for id, l := range x.Enhance {
		s.enh[id] = l
	}
	h.loadQuests(s, x.Quests)
	for _, it := range x.Storage {
		s.storage[it.TemplateID] = it.Quantity
	}
	for _, a := range x.Archive {
		s.archive[a.PowerID] = a.Points
	}
	if len(x.Hotbar) > 0 && validHotbarJSON(x.Hotbar) {
		s.hotbar = x.Hotbar
	}
	if len(x.AutoSettings) > 0 {
		var as game.AutoSettings
		if json.Unmarshal(x.AutoSettings, &as) == nil {
			s.autoCfg = as.Sanitize()
		}
	}
	if x.Binding != nil {
		if def := h.c.Power(x.Binding.PowerID); def != nil {
			var lo game.Loadout
			_ = json.Unmarshal(x.Binding.Loadout, &lo)
			h.world.BindPower(p, def, s.archive[def.ID], lo)
		}
	}
}

/* ------------------------------------------------------------ outbound */

type skillView struct {
	ID          string  `json:"id"`
	Name        string  `json:"name"`
	Category    string  `json:"category"`
	Implemented bool    `json:"implemented"`
	Unlocked    bool    `json:"unlocked"`
	EnergyCost  float64 `json:"energyCost,omitempty"`
	CooldownMs  float64 `json:"cooldownMs,omitempty"`
	Description string  `json:"description,omitempty"`
}

func (h *Hub) powerPayload(s *session, p *game.Player) map[string]any {
	out := map[string]any{"t": "power", "weapon": p.Weapon.ID, "archive": s.archive}
	if p.Power == nil {
		out["bound"] = nil
		return out
	}
	act, ult, pas, rank := h.world.Unlocked(p.Power)
	unl := map[string]bool{}
	for _, l := range [][]string{ids(act), ids(ult), ids(pas)} {
		for _, id := range l {
			unl[id] = true
		}
	}
	var skills []skillView
	def := p.Power.Def
	for _, l := range [][]contentAction{toCA(def.Active), toCA(def.Ultimate), toCA(def.Passive)} {
		for _, a := range l {
			skills = append(skills, skillView{ID: a.id, Name: a.name, Category: a.cat, Implemented: a.impl, Unlocked: unl[a.id], EnergyCost: a.energy, CooldownMs: a.cd, Description: a.desc})
		}
	}
	next := 0
	for _, r := range h.c.Powers.Proficiency.Ranks {
		if r.Rank == rank.Rank+1 {
			next = r.Points
		}
	}
	out["bound"] = map[string]any{
		"id": def.ID, "name": def.Name, "type": def.Type, "allowedWeapons": def.AllowedWeapons,
		"weaponOk": def.AllowsWeapon(p.Weapon.ID), "stance": p.Power.Stance, "points": p.Power.Points, "rank": rank.Rank, "nextRankPoints": next,
		"loadout": p.Power.Loadout, "skills": skills,
	}
	return out
}

func (h *Hub) sendPower(s *session) {
	if p := h.world.Player(s.pid); p != nil {
		h.send(s.client, h.powerPayload(s, p))
	}
}

func (h *Hub) sendAuto(s *session, report *game.AutoReport) {
	msg := map[string]any{"t": "auto", "enabled": s.auto.Enabled, "settings": s.autoCfg}
	if s.auto.Enabled {
		msg["anchor"] = s.auto.Anchor
		msg["live"] = s.auto.Report
	}
	if report != nil {
		msg["report"] = report
	}
	h.send(s.client, msg)
}

/* -------------------------------------------------------------- commands */

func (h *Hub) fail(s *session, op, why string) {
	h.send(s.client, map[string]any{"t": "result", "op": op, "ok": false, "error": why})
}

func (h *Hub) ok(s *session, op string, extra map[string]any) {
	msg := map[string]any{"t": "result", "op": op, "ok": true}
	for k, v := range extra {
		msg[k] = v
	}
	h.send(s.client, msg)
}

func (h *Hub) inCombat(p *game.Player) bool {
	return p.InCombat(h.world.Time, h.c.Player.OutOfCombatMs)
}

func (h *Hub) onPhase3(s *session, m clientMsg) {
	p := h.world.Player(s.pid)
	if p == nil {
		return
	}
	switch m.T {
	case "equip":
		h.equip(s, p, m.Weapon)
	case "bind":
		h.bind(s, p, m.ItemID)
	case "unbind":
		h.unbind(s, p, m.Confirm)
	case "loadout":
		if p.Power == nil || m.Loadout == nil {
			h.fail(s, "loadout", "ไม่มี The Power ที่ผูกอยู่")
			return
		}
		p.Power.Loadout = h.world.SanitizeLoadout(p.Power, *m.Loadout)
		lo, _ := json.Marshal(p.Power.Loadout)
		cid, pid := s.charID, p.Power.Def.ID
		h.persist.Enqueue("loadout", func(ctx context.Context) error { return h.st.SaveLoadout(ctx, cid, pid, lo) })
		h.sendPower(s)
		h.ok(s, "loadout", nil)
	case "craft":
		h.craft(s, m.Recipe)
	case "hotbar":
		b, err := json.Marshal(m.Slots)
		if err != nil || !validHotbarJSON(b) {
			h.fail(s, "hotbar", "รูปแบบ hotbar ไม่ถูกต้อง (ต้อง 20 ช่อง, action/ปุ่มห้ามซ้ำ)")
			return
		}
		s.hotbar = b
		cid := s.charID
		h.persist.Enqueue("hotbar", func(ctx context.Context) error { return h.st.SaveHotbar(ctx, cid, b) })
		h.ok(s, "hotbar", nil)
	case "auto":
		h.autoCommand(s, p, m)
	case "pickup":
		d, why := h.world.TakeDrop(p, m.DropID, 0)
		if d == nil {
			h.fail(s, "pickup", why)
			return
		}
		h.creditDrop(s, d)
	case "gm":
		h.gmOp(s, p, m)
	}
}

func (h *Hub) ownsWeapon(s *session, weapon string) bool {
	for id, q := range s.inv {
		if it := h.c.Items[id]; q > 0 && it != nil && it.WeaponType == weapon {
			return true
		}
	}
	return false
}

func (h *Hub) equip(s *session, p *game.Player, weapon string) {
	best := ""
	for id, q := range s.inv {
		if t := h.c.Items[id]; q > 0 && t != nil && t.WeaponType == weapon && (best == "" || t.LevelReq > h.c.Items[best].LevelReq) {
			best = id
		}
	}
	if best == "" {
		h.fail(s, "equip", "ไม่มีอาวุธชนิดนี้ในกระเป๋า")
		return
	}
	h.equipItem(s, p, best, "equip")
}

func (h *Hub) bind(s *session, p *game.Player, itemID string) {
	it := h.c.Items[itemID]
	switch {
	case it == nil || it.PowerID == "" || s.inv[itemID] <= 0:
		h.fail(s, "bind", "ไม่มีผลพลังนี้ในกระเป๋า")
		return
	case p.Power != nil:
		h.fail(s, "bind", "ผูกพลังได้ครั้งละ 1 ผล — ต้องถอดพลังเดิมกับ The Severer ก่อน")
		return
	}
	def := h.c.Power(it.PowerID)
	if def == nil {
		h.fail(s, "bind", "unknown power")
		return
	}
	if !def.AllowsWeapon(p.Weapon.ID) {
		h.fail(s, "bind", fmt.Sprintf("%s ใช้ได้กับ %s เท่านั้น", def.Name, strings.Join(def.AllowedWeapons, ", ")))
		return
	}
	s.inv[itemID]--
	if s.inv[itemID] <= 0 {
		delete(s.inv, itemID)
	}
	h.world.BindPower(p, def, s.archive[def.ID], game.Loadout{})
	if _, ok := s.archive[def.ID]; !ok {
		s.archive[def.ID] = 0
	}
	lo, _ := json.Marshal(p.Power.Loadout)
	txID, cid := "bind:"+randomID(10), s.charID
	h.persist.Enqueue(txID, func(ctx context.Context) error { return h.st.BindPower(ctx, txID, cid, def.ID, itemID, lo) })
	h.sendInventory(s)
	h.sendPower(s)
	h.ok(s, "bind", map[string]any{"power": def.Name})
	h.sendSys(s, fmt.Sprintf("ผูกพลัง %s สำเร็จ — กดช่อง 11 (Q) เพื่อ Activate", def.Name), "good")
}

func (h *Hub) unbind(s *session, p *game.Player, confirm string) {
	switch {
	case p.Power == nil:
		h.fail(s, "unbind", "ไม่มีพลังที่ผูกอยู่")
	case !h.world.NearNPC(p, "severer", npcRange):
		h.fail(s, "unbind", "ต้องคุยกับ NPC The Severer เท่านั้น")
	case h.inCombat(p):
		h.fail(s, "unbind", "ทำพิธีไม่ได้ระหว่างต่อสู้")
	case !strings.EqualFold(strings.TrimSpace(confirm), p.Power.Def.Name):
		h.fail(s, "unbind", "พิมพ์ชื่อพลังให้ตรงเพื่อยืนยันการทำลายถาวร")
	default:
		def := p.Power.Def
		s.archive[def.ID] = max(s.archive[def.ID], p.Power.Points)
		h.saveProficiency(s)
		h.world.UnbindPower(p)
		txID, cid := "destroy:"+randomID(10), s.charID
		h.persist.Enqueue(txID, func(ctx context.Context) error { return h.st.UnbindPower(ctx, txID, cid, def.ID) })
		h.sendPower(s)
		h.ok(s, "unbind", map[string]any{"power": def.Name})
		h.sendSys(s, fmt.Sprintf("พิธีตัดพลังเสร็จสิ้น — ผล %s ถูกทำลายถาวร (ไม่คืนไอเทม)", def.Name), "warn")
	}
}

func (h *Hub) craft(s *session, recipeID string) {
	r := h.c.Recipes[recipeID]
	if r == nil {
		h.fail(s, "craft", "ไม่พบสูตร")
		return
	}
	for _, in := range r.Inputs {
		if s.inv[in.ItemID] < in.Quantity {
			h.fail(s, "craft", fmt.Sprintf("วัตถุดิบไม่พอ: %s %d/%d", h.c.Items[in.ItemID].Name, s.inv[in.ItemID], in.Quantity))
			return
		}
	}
	out := h.c.Items[r.Output.ItemID]
	if _, exists := s.inv[out.ID]; !exists && len(s.inv) >= h.c.Progression.InventorySlots {
		h.fail(s, "craft", "กระเป๋าเต็ม")
		return
	}
	if s.inv[out.ID]+r.Output.Quantity > out.MaxStack {
		h.fail(s, "craft", "เกินจำนวนซ้อนสูงสุด")
		return
	}
	var inputs []store.ItemStack
	for _, in := range r.Inputs {
		s.inv[in.ItemID] -= in.Quantity
		if s.inv[in.ItemID] <= 0 {
			delete(s.inv, in.ItemID)
		}
		inputs = append(inputs, store.ItemStack{TemplateID: in.ItemID, Quantity: in.Quantity})
	}
	s.inv[out.ID] += r.Output.Quantity
	output := store.ItemStack{TemplateID: out.ID, Quantity: r.Output.Quantity}
	txID, cid := "craft:"+randomID(10), s.charID
	h.persist.Enqueue(txID, func(ctx context.Context) error { return h.st.Craft(ctx, txID, cid, inputs, output) })
	h.sendInventory(s)
	h.ok(s, "craft", map[string]any{"item": out.Name})
}

func (h *Hub) saveProficiency(s *session) {
	p := h.world.Player(s.pid)
	if p == nil || p.Power == nil {
		return
	}
	s.archive[p.Power.Def.ID] = max(s.archive[p.Power.Def.ID], p.Power.Points)
	cid, pid, pts := s.charID, p.Power.Def.ID, p.Power.Points
	h.persist.Enqueue("proficiency", func(ctx context.Context) error { return h.st.SaveProficiency(ctx, cid, pid, pts) })
}

/* ----------------------------------------------------------------- loot */

func (h *Hub) lootOK(s *session) func(*game.LootDrop) bool {
	cats := s.autoCfg.LootCategories
	return func(d *game.LootDrop) bool {
		if len(cats) == 0 || d.Gold > 0 {
			return true
		}
		for _, it := range d.Items {
			if t := h.c.Items[it.ItemID]; t != nil && contains(cats, t.Category) {
				return true
			}
		}
		return false
	}
}

func contains(l []string, x string) bool {
	for _, v := range l {
		if v == x {
			return true
		}
	}
	return false
}

// creditDrop moves a picked-up bag into the inventory and persists it idempotently (drop tx id).
func (h *Hub) creditDrop(s *session, d *game.LootDrop) {
	granted := h.addItems(s, d.Items)
	s.gold += d.Gold
	rw := store.Reward{TxID: d.TxID, CharID: s.charID, LevelAfter: s.level, GoldDelta: d.Gold, Reason: "loot:" + d.MonsterID}
	for _, it := range granted {
		rw.Items = append(rw.Items, store.ItemStack{TemplateID: it.ItemID, Quantity: it.Quantity})
	}
	h.persist.Enqueue(rw.TxID, func(ctx context.Context) error { return h.st.ApplyReward(ctx, rw) })
	if s.auto.Enabled {
		s.auto.Report.Gold += d.Gold
		for _, it := range granted {
			s.auto.Report.Items[it.ItemID] += it.Quantity
		}
	}
	h.send(s.client, map[string]any{"t": "loot", "gold": d.Gold, "items": granted})
	h.sendInventory(s)
}

/* ----------------------------------------------------------------- auto */

func (h *Hub) autoCommand(s *session, p *game.Player, m clientMsg) {
	if m.Settings != nil {
		s.autoCfg = m.Settings.Sanitize()
		b, _ := json.Marshal(s.autoCfg)
		cid := s.charID
		h.persist.Enqueue("auto-settings", func(ctx context.Context) error { return h.st.SaveAutoSettings(ctx, cid, b) })
	}
	if m.Enabled != nil {
		switch {
		case *m.Enabled && !s.auto.Enabled:
			if !p.Alive() {
				h.fail(s, "auto", "เปิด Auto ไม่ได้ขณะเสียชีวิต")
				return
			}
			if h.world.Map.Instanced() {
				h.fail(s, "auto", "ในดันเจี้ยน/อารีน่าต้องต่อสู้เอง (Normal Dungeon ใช้ได้เฉพาะ Auto Loot)")
				return
			}
			// Auto is PvE-only: the dev map is PvP-off; PvP/Ranked/Guild War maps (Phase 6) refuse it.
			s.auto.Start(p, h.world.Time, s.autoCfg)
			h.sendSys(s, "เปิด Auto Farm (PvE เท่านั้น · หยุดเมื่อหลุดการเชื่อมต่อ)", "good")
		case !*m.Enabled && s.auto.Enabled:
			r := s.auto.Stop(h.world.Time, "player")
			h.sendAuto(s, &r)
			return
		}
	}
	h.sendAuto(s, nil)
}

// autoInput produces this tick's intent for an Auto-enabled player. Manual movement overrides.
func (h *Hub) autoInput(s *session, manual game.Input) game.Input {
	p := h.world.Player(s.pid)
	if p == nil || s.client == nil {
		return manual
	}
	if s.manualMove {
		return manual
	}
	in, stop := s.auto.Decide(h.world, p, s.inv["CON-001"] > 0, h.lootOK(s))
	if stop != "" {
		r := s.auto.Stop(h.world.Time, stop)
		h.sendAuto(s, &r)
		return manual
	}
	if s.auto.Settings.AutoLoot {
		ok := h.lootOK(s)
		for _, d := range h.world.DropsOf(p.ID) {
			if game.Dist(d.Pos, p.Pos) <= autoPickupRange && ok(d) {
				if got, _ := h.world.TakeDrop(p, d.ID, autoPickupRange); got != nil {
					h.creditDrop(s, got)
				}
			}
		}
	}
	in.Actions = append(in.Actions, manual.Actions...)
	if h.tick%30 == 0 {
		h.sendAuto(s, nil)
	}
	return in
}

/* ------------------------------------------------------------------- GM */

func (h *Hub) gmOp(s *session, p *game.Player, m clientMsg) {
	needTest := func(cap rbac.Capability, action string) bool {
		if !h.require(s, cap, action, m.Target) {
			return false
		}
		if !h.cfg.TestWorld {
			h.fail(s, "gm", "คำสั่งนี้ใช้ได้เฉพาะ Test World")
			h.audit(s, cap, action, m.Target, "denied", "not a test world", nil)
			return false
		}
		return true
	}
	switch m.Op {
	case "inspect":
		if !h.require(s, rbac.PlayersView, "gm.players.inspect", m.Target) {
			return
		}
		var list []map[string]any
		for _, x := range h.sessions {
			if m.Target != "" && !strings.EqualFold(x.name, m.Target) {
				continue
			}
			xp := h.world.Player(x.pid)
			if xp == nil {
				continue
			}
			pw := ""
			if xp.Power != nil {
				pw = fmt.Sprintf("%s (%d pts, stance %v)", xp.Power.Def.Name, xp.Power.Points, xp.Power.Stance)
			}
			list = append(list, map[string]any{"name": x.name, "level": x.level, "role": x.role, "weapon": xp.Weapon.ID, "hp": int(xp.Hp), "maxHp": int(xp.MaxHp),
				"pos": xp.Pos, "gold": x.gold, "xp": x.xp, "items": x.inv, "power": pw, "online": x.client != nil, "auto": x.auto.Enabled, "violations": x.violations})
		}
		h.send(s.client, map[string]any{"t": "gm-result", "op": "inspect", "players": list})
		h.audit(s, rbac.PlayersView, "gm.players.inspect", m.Target, "ok", "", nil)
	case "spawnItem":
		if !needTest(rbac.ItemsGrantTest, "gm.items.spawn") {
			return
		}
		it := h.c.Items[m.ItemID]
		qty := m.Qty
		if it == nil || qty < 1 || qty > 999 {
			h.fail(s, "gm", "itemId/qty ไม่ถูกต้อง")
			return
		}
		target := s
		if m.Target != "" {
			target = nil
			for _, x := range h.sessions {
				if strings.EqualFold(x.name, m.Target) {
					target = x
				}
			}
			if target == nil {
				h.fail(s, "gm", "ไม่พบผู้เล่น "+m.Target)
				return
			}
		}
		granted := h.addItems(target, []game.LootItem{{ItemID: it.ID, Quantity: qty}})
		txID := "gm:" + randomID(10)
		rw := store.Reward{TxID: txID, CharID: target.charID, LevelAfter: target.level, Reason: "gm-test-grant"}
		for _, g := range granted {
			rw.Items = append(rw.Items, store.ItemStack{TemplateID: g.ItemID, Quantity: g.Quantity})
		}
		h.persist.Enqueue(txID, func(ctx context.Context) error { return h.st.ApplyReward(ctx, rw) })
		h.sendInventory(target)
		h.ok(s, "gm", map[string]any{"msg": fmt.Sprintf("มอบ %s x%d ให้ %s (test world, audit %s)", it.Name, qty, target.name, txID)})
		h.audit(s, rbac.ItemsGrantTest, "gm.items.spawn", target.name, "ok", "test-world grant", map[string]any{"itemId": it.ID, "qty": qty, "txId": txID})
	case "spawnMonster":
		if !needTest(rbac.MonstersSpawnTest, "gm.monsters.spawn") {
			return
		}
		def := h.c.Monsters[m.ItemID]
		n := m.Count
		if def == nil || n < 1 || n > 10 {
			h.fail(s, "gm", "monsterId/count ไม่ถูกต้อง (1–10)")
			return
		}
		for i := 0; i < n; i++ {
			a := float64(i) / float64(n) * math.Pi * 2
			h.world.SpawnTestMonster(def, game.Vec{X: p.Pos.X + math.Cos(a)*40, Y: p.Pos.Y + math.Sin(a)*40}, 120_000)
		}
		h.ok(s, "gm", map[string]any{"msg": fmt.Sprintf("เสก %s x%d (ไม่มีของดรอป, หายใน 2 นาที)", def.Name, n)})
		h.audit(s, rbac.MonstersSpawnTest, "gm.monsters.spawn", def.ID, "ok", "test-world spawn", map[string]any{"count": n})
	case "setPoints":
		if !needTest(rbac.ProficiencySetTest, "gm.power.points") {
			return
		}
		if p.Power == nil || m.Points < 0 || m.Points > 100000 {
			h.fail(s, "gm", "ต้องผูกพลังก่อน / ค่าไม่ถูกต้อง")
			return
		}
		p.Power.Points = m.Points
		h.saveProficiency(s)
		h.sendPower(s)
		h.ok(s, "gm", map[string]any{"msg": fmt.Sprintf("ตั้ง proficiency = %d", m.Points)})
		h.audit(s, rbac.ProficiencySetTest, "gm.power.points", s.name, "ok", "", map[string]any{"points": m.Points})
	default:
		h.fail(s, "gm", "ไม่รู้จักคำสั่ง "+m.Op)
	}
}

/* --------------------------------------------------------------- hotbar */

type hotbarSlot struct {
	Action string `json:"action"`
	Key    string `json:"key"`
}

var hotbarActions = []string{"basic", "skill1", "skill2", "skill3", "power1", "power2", "power3", "power4", "power5", "powerUlt",
	"powerToggle", "dodge", "guard", "hpPotion", "buffItem", "consumable", "utility", "targetMark", "ping", "emote"}

// Reserved keys cannot be bound: movement, chat, debug, browser shortcuts, interact and aliases.
var reservedKeys = map[string]bool{"KeyW": true, "KeyA": true, "KeyS": true, "KeyD": true, "KeyH": true, "KeyJ": true, "Space": true, "Enter": true,
	"Escape": true, "Tab": true, "F3": true, "F5": true, "F11": true, "F12": true, "ArrowUp": true, "ArrowDown": true, "ArrowLeft": true, "ArrowRight": true,
	"ShiftLeft": true, "ShiftRight": true, "ControlLeft": true, "ControlRight": true, "AltLeft": true, "AltRight": true, "MetaLeft": true, "MetaRight": true}

func validKey(k string) bool {
	if reservedKeys[k] || len(k) > 16 {
		return false
	}
	switch {
	case strings.HasPrefix(k, "Key") && len(k) == 4 && k[3] >= 'A' && k[3] <= 'Z':
		return true
	case strings.HasPrefix(k, "Digit") && len(k) == 6 && k[5] >= '0' && k[5] <= '9':
		return true
	case strings.HasPrefix(k, "Numpad") && len(k) == 7 && k[6] >= '0' && k[6] <= '9':
		return true
	case k == "" || k == "Minus" || k == "Equal" || k == "BracketLeft" || k == "BracketRight" || k == "Semicolon" || k == "Quote" ||
		k == "Comma" || k == "Period" || k == "Slash" || k == "Backslash" || k == "Backquote":
		return true
	case strings.HasPrefix(k, "F") && len(k) <= 3:
		return true
	}
	return false
}

// validHotbarJSON enforces the LOCKED 20-slot layout: every action exactly once, unique keys.
func validHotbarJSON(b []byte) bool {
	var slots []hotbarSlot
	if json.Unmarshal(b, &slots) != nil || len(slots) != 20 {
		return false
	}
	seenA, seenK := map[string]bool{}, map[string]bool{}
	for _, sl := range slots {
		if seenA[sl.Action] || !contains(hotbarActions, sl.Action) || !validKey(sl.Key) {
			return false
		}
		seenA[sl.Action] = true
		if sl.Key != "" {
			if seenK[sl.Key] {
				return false
			}
			seenK[sl.Key] = true
		}
	}
	return true
}

/* ---------------------------------------------------------------- helpers */

type contentAction struct {
	id, name, cat, desc string
	impl                bool
	energy, cd          float64
}

func ids(l []content.ActionDef) []string {
	out := make([]string, 0, len(l))
	for _, x := range l {
		out = append(out, x.ID)
	}
	return out
}

func toCA(l []content.ActionDef) []contentAction {
	out := make([]contentAction, 0, len(l))
	for _, a := range l {
		out = append(out, contentAction{id: a.ID, name: a.Name, cat: a.Category, desc: a.Description, impl: a.Implemented(), energy: a.EnergyCost, cd: a.CooldownMs})
	}
	return out
}
