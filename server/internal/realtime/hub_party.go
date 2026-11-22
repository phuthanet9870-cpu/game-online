package realtime

import (
	"fmt"
	"math"
	"sort"
	"strings"
	"time"
)

// Party rules (Phase 4 MVP):
//   - max 4 members, one leader; invites expire after 60s; party lives in memory and survives
//     reconnects within the grace window (a member whose session expires leaves the party).
//   - EXP share: party members on the same map within partyShareRange of a kill who did not
//     contribute get 50% of the monster XP; contributors get +10% per other nearby member (max +30%).
//     Loot rights stay personal and contribution-based (only contributors get a loot bag).
//   - Party Finder: the leader posts a note; anyone not in a party may join an open listing while
//     it has room. Dungeon entry still requires talking to the Gatekeeper (no auto-warp).
const (
	partyMax        = 4
	partyInviteTTL  = 60_000.0
	partyShareRange = 480.0
)

type party struct {
	id      int
	leader  int64
	members []int64
	note    string // Party Finder listing; "" = not listed
	listed  bool
}

type partyInvite struct {
	partyID int // 0 = create on accept
	from    int64
	at      float64
}

func (h *Hub) sessionByChar(cid int64) *session { return h.sessions[PlayerID(cid)] }

func (h *Hub) sessionByName(name string) *session {
	for _, s := range h.sessions {
		if strings.EqualFold(s.name, name) {
			return s
		}
	}
	return nil
}

func (h *Hub) partyOfSession(s *session) *party {
	if id, ok := h.partyOf[s.charID]; ok {
		return h.parties[id]
	}
	return nil
}

func (h *Hub) partyView(pt *party) map[string]any {
	var mem []map[string]any
	for _, cid := range pt.members {
		ms := h.sessionByChar(cid)
		if ms == nil {
			continue
		}
		v := map[string]any{"charId": cid, "name": ms.name, "level": ms.level, "map": "", "online": ms.client != nil, "leader": cid == pt.leader}
		if w := h.worlds[ms.mapID]; w != nil {
			v["map"] = w.Map.MapID
			if p := w.Player(ms.pid); p != nil {
				v["hp"], v["maxHp"] = math.Round(p.Hp), p.MaxHp
			}
		}
		mem = append(mem, v)
	}
	return map[string]any{"id": pt.id, "leader": pt.leader, "members": mem, "note": pt.note, "listed": pt.listed}
}

func (h *Hub) sendParty(s *session) {
	if s == nil || s.client == nil {
		return
	}
	var pv any
	if pt := h.partyOfSession(s); pt != nil {
		pv = h.partyView(pt)
	}
	var inv any
	if in, ok := h.invites[s.charID]; ok && h.world.Time-in.at < partyInviteTTL {
		if fs := h.sessionByChar(in.from); fs != nil {
			inv = map[string]any{"from": fs.name}
		}
	}
	h.send(s.client, map[string]any{"t": "party", "party": pv, "invite": inv})
}

func (h *Hub) syncParty(pt *party) {
	for _, cid := range pt.members {
		h.sendParty(h.sessionByChar(cid))
	}
}

func (h *Hub) partyChat(pt *party, from *session, text string) {
	for _, cid := range pt.members {
		if ms := h.sessionByChar(cid); ms != nil && ms.client != nil {
			h.send(ms.client, map[string]any{"t": "chat", "from": from.name, "text": text, "ch": "party"})
		}
	}
}

func (h *Hub) newParty(leader int64) *party {
	h.partySeq++
	pt := &party{id: h.partySeq, leader: leader, members: []int64{leader}}
	h.parties[pt.id] = pt
	h.partyOf[leader] = pt.id
	return pt
}

func (h *Hub) addMember(pt *party, cid int64) {
	pt.members = append(pt.members, cid)
	h.partyOf[cid] = pt.id
	if len(pt.members) >= partyMax {
		pt.listed = false
	}
}

// removeMember handles leave/kick/session expiry: leader passes to the next member; a party of one disbands.
func (h *Hub) removeMember(pt *party, cid int64) {
	for i, m := range pt.members {
		if m == cid {
			pt.members = append(pt.members[:i], pt.members[i+1:]...)
			break
		}
	}
	delete(h.partyOf, cid)
	if len(pt.members) <= 1 {
		for _, m := range pt.members {
			delete(h.partyOf, m)
			if ms := h.sessionByChar(m); ms != nil {
				h.sendSys(ms, "ปาร์ตี้ถูกยุบ", "warn")
				h.sendParty(ms)
			}
		}
		delete(h.parties, pt.id)
		return
	}
	if pt.leader == cid {
		pt.leader = pt.members[0]
	}
	h.syncParty(pt)
}

func (h *Hub) partyOp(s *session, m clientMsg) {
	pt := h.partyOfSession(s)
	switch m.Op {
	case "invite":
		t := h.sessionByName(m.Target)
		switch {
		case t == nil || t.client == nil:
			h.fail(s, "party", "ไม่พบผู้เล่นที่ออนไลน์ชื่อนี้")
			return
		case t == s:
			h.fail(s, "party", "เชิญตัวเองไม่ได้")
			return
		case pt != nil && pt.leader != s.charID:
			h.fail(s, "party", "เฉพาะหัวหน้าปาร์ตี้ที่เชิญได้")
			return
		case pt != nil && len(pt.members) >= partyMax:
			h.fail(s, "party", fmt.Sprintf("ปาร์ตี้เต็ม (%d คน)", partyMax))
			return
		case h.partyOfSession(t) != nil:
			h.fail(s, "party", t.name+" อยู่ในปาร์ตี้อื่นแล้ว")
			return
		}
		id := 0
		if pt != nil {
			id = pt.id
		}
		h.invites[t.charID] = partyInvite{partyID: id, from: s.charID, at: h.world.Time}
		h.sendSys(t, s.name+" ชวนคุณเข้าปาร์ตี้", "good")
		h.sendParty(t)
		h.ok(s, "party", map[string]any{"msg": "ส่งคำเชิญถึง " + t.name})
	case "accept", "decline":
		in, ok := h.invites[s.charID]
		delete(h.invites, s.charID)
		if !ok || h.world.Time-in.at >= partyInviteTTL {
			h.fail(s, "party", "คำเชิญหมดอายุแล้ว")
			h.sendParty(s)
			return
		}
		from := h.sessionByChar(in.from)
		if m.Op == "decline" {
			if from != nil {
				h.sendSys(from, s.name+" ปฏิเสธคำเชิญ", "warn")
			}
			h.sendParty(s)
			return
		}
		if pt != nil {
			h.fail(s, "party", "ออกจากปาร์ตี้เดิมก่อน")
			return
		}
		target := h.parties[in.partyID]
		if target == nil {
			// inviter had no party: create one (if they still have none)
			if from == nil || h.partyOfSession(from) != nil {
				h.fail(s, "party", "คำเชิญใช้ไม่ได้แล้ว")
				h.sendParty(s)
				return
			}
			target = h.newParty(from.charID)
		}
		if len(target.members) >= partyMax {
			h.fail(s, "party", "ปาร์ตี้เต็มแล้ว")
			h.sendParty(s)
			return
		}
		h.addMember(target, s.charID)
		h.partyChat(target, s, "เข้าร่วมปาร์ตี้")
		h.syncParty(target)
	case "leave":
		if pt == nil {
			return
		}
		h.partyChat(pt, s, "ออกจากปาร์ตี้")
		h.removeMember(pt, s.charID)
		h.sendParty(s)
	case "kick", "promote":
		if pt == nil || pt.leader != s.charID {
			h.fail(s, "party", "เฉพาะหัวหน้าปาร์ตี้")
			return
		}
		t := h.sessionByName(m.Target)
		if t == nil || t == s || h.partyOf[t.charID] != pt.id {
			h.fail(s, "party", "ไม่พบสมาชิกชื่อนี้ในปาร์ตี้")
			return
		}
		if m.Op == "kick" {
			h.sendSys(t, "คุณถูกเชิญออกจากปาร์ตี้", "warn")
			h.removeMember(pt, t.charID)
			h.sendParty(t)
		} else {
			pt.leader = t.charID
			h.syncParty(pt)
		}
	case "chat":
		if pt == nil {
			h.fail(s, "party", "ยังไม่มีปาร์ตี้")
			return
		}
		if !s.chatBucket.Allow(time.Now()) {
			h.sendSys(s, "ส่งข้อความเร็วเกินไป กรุณารอสักครู่", "warn")
			return
		}
		if text := sanitizeChat(m.Text); text != "" {
			h.partyChat(pt, s, text)
		}
	case "list": // Party Finder: post (leader; creates a party when solo) or unlist
		if pt == nil {
			pt = h.newParty(s.charID)
		}
		if pt.leader != s.charID {
			h.fail(s, "party", "เฉพาะหัวหน้าปาร์ตี้ที่ประกาศหาทีมได้")
			return
		}
		note := sanitizeChat(m.Text)
		if r := []rune(note); len(r) > 60 {
			note = string(r[:60])
		}
		if note == "" {
			note = "หาเพื่อนลงดันเจี้ยน"
		}
		pt.note, pt.listed = note, len(pt.members) < partyMax
		h.syncParty(pt)
		h.sendFinder(s)
	case "unlist":
		if pt != nil && pt.leader == s.charID {
			pt.listed = false
			h.syncParty(pt)
		}
		h.sendFinder(s)
	case "finder":
		h.sendFinder(s)
	case "join": // join an open Party Finder listing
		if pt != nil {
			h.fail(s, "party", "ออกจากปาร์ตี้เดิมก่อน")
			return
		}
		target := h.parties[m.Count]
		if target == nil || !target.listed || len(target.members) >= partyMax {
			h.fail(s, "party", "ประกาศนี้ปิดรับแล้ว")
			h.sendFinder(s)
			return
		}
		h.addMember(target, s.charID)
		h.partyChat(target, s, "เข้าร่วมผ่าน Party Finder")
		h.syncParty(target)
		h.sendFinder(s)
	default:
		h.fail(s, "party", "unknown op")
	}
}

func (h *Hub) sendFinder(s *session) {
	var out []map[string]any
	ids := make([]int, 0, len(h.parties))
	for id := range h.parties {
		ids = append(ids, id)
	}
	sort.Ints(ids)
	for _, id := range ids {
		pt := h.parties[id]
		if !pt.listed {
			continue
		}
		ls := h.sessionByChar(pt.leader)
		if ls == nil {
			continue
		}
		out = append(out, map[string]any{"id": pt.id, "leader": ls.name, "level": ls.level, "size": len(pt.members), "max": partyMax, "note": pt.note})
	}
	h.send(s.client, map[string]any{"t": "finder", "listings": out})
}

// partyShare returns extra recipients of a kill: party members of contributors who are nearby on
// the same map but did not contribute, plus the contributor XP bonus multiplier per pid.
func (h *Hub) partyShare(contributors []string, at [2]float64) (extra []string, bonus map[string]float64) {
	bonus = map[string]float64{}
	isContrib := map[string]bool{}
	for _, pid := range contributors {
		isContrib[pid] = true
	}
	seen := map[string]bool{}
	for _, pid := range contributors {
		s := h.sessions[pid]
		if s == nil {
			continue
		}
		pt := h.partyOfSession(s)
		if pt == nil {
			continue
		}
		near := 0
		for _, cid := range pt.members {
			ms := h.sessionByChar(cid)
			if ms == nil || ms.pid == pid || ms.mapID != s.mapID {
				continue
			}
			p := h.world.Player(ms.pid)
			if p == nil || p.Hp <= 0 || math.Hypot(p.Pos.X-at[0], p.Pos.Y-at[1]) > partyShareRange {
				continue
			}
			near++
			if !isContrib[ms.pid] && !seen[ms.pid] {
				seen[ms.pid] = true
				extra = append(extra, ms.pid)
			}
		}
		bonus[pid] = 1 + 0.1*float64(min(near, 3))
	}
	sort.Strings(extra)
	return extra, bonus
}

func (h *Hub) partyDropSession(s *session) {
	delete(h.invites, s.charID)
	if pt := h.partyOfSession(s); pt != nil {
		h.removeMember(pt, s.charID)
	}
}
