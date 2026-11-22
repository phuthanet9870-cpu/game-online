package realtime

import (
	"context"
	"fmt"
	"math"
	"sort"

	"github.com/phuthanet9870-cpu/game-online/server/internal/content"
	"github.com/phuthanet9870-cpu/game-online/server/internal/game"
	"github.com/phuthanet9870-cpu/game-online/server/internal/store"
)

// Normal Dungeon (spec §14): entry ONLY by talking to the Dungeon Gatekeeper in the city.
// Gatekeeper menu → validate → ready check (party) → create a separate instance world (not one of
// the 32 core maps) → transfer members. Objectives: clear the halls, then the boss appears.
// Boss loot is personal (contribution); completion XP/Gold is paid once per member via the ledger.
// Members keep their seat: disconnect within grace stays inside; after that they can rejoin through
// the Gatekeeper while the instance is alive. Clear/fail/timeout → everyone is moved back to the city.

type dungeonInstance struct {
	key        string
	def        *content.DungeonDef
	members    map[int64]bool
	state      string // active | cleared | failed
	created    float64
	endedAt    float64
	emptySince float64
	boss       *game.Monster
	trash      int
	paid       map[int64]bool
}

type readyCheck struct {
	def      *content.DungeonDef
	partyID  int
	leader   int64
	accepted map[int64]bool
	at       float64
}

func (h *Hub) gatekeeperExit() game.Vec {
	city := h.c.Maps[h.c.StartMap]
	for _, n := range city.NPCs {
		if n.ID == "gatekeeper" {
			return game.Vec{X: n.X, Y: n.Y + 2*city.TileSize}
		}
	}
	return game.Vec{X: city.PlayerSpawn[0], Y: city.PlayerSpawn[1]}
}

func (h *Hub) instanceOf(s *session) *dungeonInstance { return h.dungeons[s.mapID] }

// memberInstance finds a live instance this character holds a seat in.
func (h *Hub) memberInstance(cid int64) *dungeonInstance {
	keys := make([]string, 0, len(h.dungeons))
	for k := range h.dungeons {
		keys = append(keys, k)
	}
	sort.Strings(keys)
	for _, k := range keys {
		if d := h.dungeons[k]; d.members[cid] && d.state == "active" {
			return d
		}
	}
	return nil
}

func (h *Hub) gatekeeperMenu(s *session) map[string]any {
	var list []map[string]any
	for i := range h.c.Dungeons {
		d := &h.c.Dungeons[i]
		ok, why := h.canEnter(s, d)
		list = append(list, map[string]any{"id": d.ID, "name": d.Name, "description": d.Description, "type": d.Type, "entryLevel": d.EntryLevel,
			"partyMin": d.PartyMin, "partyMax": d.PartyMax, "timeLimitMs": d.TimeLimitMs, "objectives": d.Objectives, "autoPolicy": d.AutoPolicy,
			"canEnter": ok, "reason": why})
	}
	out := map[string]any{"dungeons": list}
	if inst := h.memberInstance(s.charID); inst != nil {
		out["rejoin"] = map[string]any{"key": inst.key, "name": inst.def.Name}
	}
	return out
}

// canEnter validates the requester (and their party, if any) for a dungeon.
func (h *Hub) canEnter(s *session, d *content.DungeonDef) (bool, string) {
	if h.memberInstance(s.charID) != nil {
		return false, "คุณยังมีดันเจี้ยนที่ค้างอยู่ — กลับเข้าเดิมได้"
	}
	members := []*session{s}
	if pt := h.partyOfSession(s); pt != nil {
		if pt.leader != s.charID {
			return false, "หัวหน้าปาร์ตี้เป็นผู้เริ่มดันเจี้ยน"
		}
		members = members[:0]
		for _, cid := range pt.members {
			ms := h.sessionByChar(cid)
			if ms == nil || ms.client == nil {
				return false, "สมาชิกทุกคนต้องออนไลน์"
			}
			members = append(members, ms)
		}
	}
	if len(members) < d.PartyMin || len(members) > d.PartyMax {
		return false, fmt.Sprintf("ต้องมีสมาชิก %d–%d คน", d.PartyMin, d.PartyMax)
	}
	for _, ms := range members {
		if ms.level < d.EntryLevel {
			return false, fmt.Sprintf("%s เลเวลไม่ถึง %d", ms.name, d.EntryLevel)
		}
		if ms.mapID != h.c.StartMap {
			return false, ms.name + " ต้องอยู่ใน Aetheria Capital"
		}
		if h.memberInstance(ms.charID) != nil {
			return false, ms.name + " ยังมีดันเจี้ยนค้างอยู่"
		}
		if d.KeyItem != "" && ms.inv[d.KeyItem] < 1 {
			return false, ms.name + " ไม่มีกุญแจ " + d.KeyItem
		}
	}
	return true, ""
}

func (h *Hub) dungeonOp(s *session, m clientMsg) {
	p := h.world.Player(s.pid)
	if p == nil {
		return
	}
	switch m.Op {
	case "enter":
		d := h.c.Dungeon(m.ItemID)
		if d == nil {
			h.fail(s, "dungeon", "ไม่พบดันเจี้ยน")
			return
		}
		if !p.Alive() || !h.near(p, d.NPC) {
			h.fail(s, "dungeon", "ต้องคุยกับ Dungeon Gatekeeper ในเมืองเท่านั้น")
			return
		}
		if ok, why := h.canEnter(s, d); !ok {
			h.fail(s, "dungeon", why)
			return
		}
		pt := h.partyOfSession(s)
		if pt == nil || len(pt.members) == 1 {
			h.startInstance(d, []*session{s})
			return
		}
		rc := &readyCheck{def: d, partyID: pt.id, leader: s.charID, accepted: map[int64]bool{s.charID: true}, at: h.world.Time}
		h.ready[pt.id] = rc
		for _, cid := range pt.members {
			if ms := h.sessionByChar(cid); ms != nil {
				h.send(ms.client, map[string]any{"t": "ready", "dungeon": d.ID, "name": d.Name, "leader": s.name, "timeoutMs": d.ReadyCheckMs, "accepted": cid == s.charID})
			}
		}
		h.ok(s, "dungeon", map[string]any{"msg": "เริ่ม Ready Check — รอสมาชิกยืนยัน"})
	case "ready", "notready":
		pt := h.partyOfSession(s)
		if pt == nil || h.ready[pt.id] == nil {
			h.fail(s, "dungeon", "ไม่มี Ready Check")
			return
		}
		rc := h.ready[pt.id]
		if m.Op == "notready" {
			delete(h.ready, pt.id)
			h.partyNotice(pt, s.name+" ยกเลิก Ready Check", "warn")
			return
		}
		rc.accepted[s.charID] = true
		h.tryLaunch(pt, rc)
	case "rejoin":
		inst := h.memberInstance(s.charID)
		if inst == nil {
			h.fail(s, "dungeon", "ไม่มีดันเจี้ยนให้กลับเข้า")
			return
		}
		if !p.Alive() || !h.near(p, inst.def.NPC) {
			h.fail(s, "dungeon", "กลับเข้าได้ผ่าน Dungeon Gatekeeper เท่านั้น")
			return
		}
		h.transfer(s, inst.key, h.worlds[inst.key].SpawnPoint())
		h.sendDungeon(s)
	case "leave":
		if h.instanceOf(s) == nil {
			return
		}
		h.transfer(s, h.c.StartMap, h.gatekeeperExit())
		h.send(s.client, map[string]any{"t": "dungeon", "state": "left"})
	default:
		h.fail(s, "dungeon", "unknown op")
	}
}

func (h *Hub) partyNotice(pt *party, text, tone string) {
	for _, cid := range pt.members {
		if ms := h.sessionByChar(cid); ms != nil {
			h.sendSys(ms, text, tone)
			h.send(ms.client, map[string]any{"t": "ready", "cancel": true})
		}
	}
}

func (h *Hub) tryLaunch(pt *party, rc *readyCheck) {
	for _, cid := range pt.members {
		if !rc.accepted[cid] {
			return
		}
	}
	delete(h.ready, pt.id)
	leader := h.sessionByChar(rc.leader)
	if leader == nil {
		return
	}
	if ok, why := h.canEnter(leader, rc.def); !ok { // re-validate at launch
		h.partyNotice(pt, "เข้าดันเจี้ยนไม่ได้: "+why, "bad")
		return
	}
	var ss []*session
	for _, cid := range pt.members {
		ss = append(ss, h.sessionByChar(cid))
	}
	h.startInstance(rc.def, ss)
}

func (h *Hub) startInstance(d *content.DungeonDef, members []*session) {
	h.dungeonSeq++
	key := fmt.Sprintf("%s#%d", d.Map, h.dungeonSeq)
	w := game.NewWorldForMap(h.c, h.c.Maps[d.Map], uint32(h.dungeonSeq)*104729+7)
	w.ConsumeItem = h.consumeItem
	w.NoRespawn = true
	w.Time = h.worlds[h.c.StartMap].Time // share the hub clock
	h.worlds[key] = w
	inst := &dungeonInstance{key: key, def: d, members: map[int64]bool{}, state: "active", created: w.Time, trash: len(w.Monsters), paid: map[int64]bool{}}
	h.dungeons[key] = inst
	for _, ms := range members {
		inst.members[ms.charID] = true
		if d.KeyItem != "" {
			h.consumeItem(h.worlds[ms.mapID].Player(ms.pid), d.KeyItem)
		}
	}
	for _, ms := range members {
		h.transfer(ms, key, w.SpawnPoint())
		h.sendSys(ms, fmt.Sprintf("เข้าสู่ %s (instance แยก · จำกัดเวลา %d นาที)", d.Name, int(d.TimeLimitMs/60000)), "good")
		h.sendDungeon(ms)
	}
	h.log.Info("dungeon instance created", "key", key, "members", len(members))
}

func (h *Hub) dungeonView(inst *dungeonInstance) map[string]any {
	w := h.worlds[inst.key]
	dead := 0
	for _, m := range w.Monsters {
		if m != inst.boss && !m.Alive() {
			dead++
		}
	}
	objs := []map[string]any{
		{"label": inst.def.Objectives[0].Label, "progress": dead, "count": inst.trash, "done": dead >= inst.trash},
		{"label": inst.def.Objectives[1].Label, "progress": b2i(inst.state == "cleared"), "count": 1, "done": inst.state == "cleared"},
	}
	v := map[string]any{"t": "dungeon", "id": inst.def.ID, "name": inst.def.Name, "state": inst.state, "objectives": objs,
		"timeLeftMs": math.Max(0, inst.def.TimeLimitMs-(w.Time-inst.created)), "bossUp": inst.boss != nil && inst.boss.Alive()}
	if inst.state != "active" {
		v["exitInMs"] = math.Max(0, inst.def.ExitAfterClearMs-(w.Time-inst.endedAt))
	}
	return v
}

func b2i(b bool) int {
	if b {
		return 1
	}
	return 0
}

func (h *Hub) sendDungeon(s *session) {
	if inst := h.instanceOf(s); inst != nil && s.client != nil {
		h.send(s.client, h.dungeonView(inst))
	}
}

func (h *Hub) expireReadyChecks() {
	now := h.worlds[h.c.StartMap].Time
	for id, rc := range h.ready {
		if pt := h.parties[id]; pt == nil {
			delete(h.ready, id)
		} else if now-rc.at >= rc.def.ReadyCheckMs {
			delete(h.ready, id)
			h.partyNotice(pt, "Ready Check หมดเวลา", "warn")
		}
	}
}

// stepDungeons advances objectives, timers and lifecycle of all instances (once per tick).
func (h *Hub) stepDungeons() {
	keys := make([]string, 0, len(h.dungeons))
	for k := range h.dungeons {
		keys = append(keys, k)
	}
	sort.Strings(keys)
	for _, key := range keys {
		inst := h.dungeons[key]
		w := h.worlds[key]
		h.world = w
		inside := h.sessionsIn(key)
		if inst.state == "active" {
			if inst.boss == nil {
				alive := 0
				for _, m := range w.Monsters {
					if m.Alive() {
						alive++
					}
				}
				if alive == 0 {
					bs := w.Map.BossSpawn
					inst.boss = w.SpawnBoss(h.c.Monsters[inst.def.Boss], game.Vec{X: bs[0], Y: bs[1]})
					for _, s := range inside {
						h.sendSys(s, h.c.Monsters[inst.def.Boss].Name+" ตื่นขึ้นแล้ว!", "crit")
					}
				}
			} else if !inst.boss.Alive() {
				inst.state, inst.endedAt = "cleared", w.Time
				h.payCompletion(inst, inside)
			}
			if inst.state == "active" && w.Time-inst.created >= inst.def.TimeLimitMs {
				inst.state, inst.endedAt = "failed", w.Time
				for _, s := range inside {
					h.sendSys(s, "หมดเวลา — ดันเจี้ยนล้มเหลว", "bad")
				}
			}
		}
		if inst.state != "active" && w.Time-inst.endedAt >= inst.def.ExitAfterClearMs {
			for _, s := range inside {
				h.transfer(s, h.c.StartMap, h.gatekeeperExit())
				h.send(s.client, map[string]any{"t": "dungeon", "state": "left"})
			}
			inside = nil
		}
		if len(inside) == 0 {
			if inst.emptySince == 0 {
				inst.emptySince = w.Time
			}
			if inst.state != "active" || w.Time-inst.emptySince >= inst.def.EmptyCloseMs {
				h.closeInstance(key)
				continue
			}
		} else {
			inst.emptySince = 0
		}
		// Normal Dungeon: combat is manual; Auto Loot (if enabled in Auto Settings) still collects own drops.
		for _, s := range inside {
			if s.autoCfg.AutoLoot && s.client != nil {
				if p := w.Player(s.pid); p != nil && p.Alive() {
					ok := h.lootOK(s)
					for _, d := range w.DropsOf(p.ID) {
						if game.Dist(d.Pos, p.Pos) <= autoPickupRange && ok(d) {
							if got, _ := w.TakeDrop(p, d.ID, autoPickupRange); got != nil {
								h.creditDrop(s, got)
							}
						}
					}
				}
			}
			if h.tick%15 == 0 {
				h.sendDungeon(s)
			}
		}
	}
}

func (h *Hub) sessionsIn(key string) []*session {
	var out []*session
	for _, s := range h.sessions {
		if s.mapID == key {
			out = append(out, s)
		}
	}
	sort.Slice(out, func(i, j int) bool { return out[i].charID < out[j].charID })
	return out
}

// payCompletion credits completion XP/Gold once per member present at the clear (idempotent tx id).
func (h *Hub) payCompletion(inst *dungeonInstance, inside []*session) {
	c := inst.def.Completion
	for _, s := range inside {
		if !inst.members[s.charID] || inst.paid[s.charID] {
			continue
		}
		inst.paid[s.charID] = true
		s.xp += c.XP
		s.gold += c.Gold
		if nl := LevelForXP(h.c.Progression, s.xp); nl > s.level {
			s.level = nl
			if p := h.world.Player(s.pid); p != nil {
				h.world.SetLevel(p, nl)
			}
		}
		rw := store.Reward{TxID: fmt.Sprintf("dungeon:%s:%s:%d", h.instanceID, inst.key, s.charID), CharID: s.charID, XPDelta: c.XP, GoldDelta: c.Gold,
			LevelAfter: s.level, Reason: "dungeon-clear:" + inst.def.ID}
		h.persist.Enqueue(rw.TxID, func(ctx context.Context) error { return h.st.ApplyReward(ctx, rw) })
		h.questEvent(s, "clear", inst.def.ID)
		h.sendSys(s, fmt.Sprintf("พิชิต %s! รางวัลเคลียร์ EXP +%d · Gold +%d — เก็บของบอสแล้วออกทางประตูตะวันตกหรือรอส่งกลับเมือง", inst.def.Name, c.XP, c.Gold), "crit")
		h.sendInventory(s)
	}
}

func (h *Hub) closeInstance(key string) {
	delete(h.dungeons, key)
	delete(h.worlds, key)
	delete(h.pending, key)
	h.log.Info("dungeon instance closed", "key", key)
}
