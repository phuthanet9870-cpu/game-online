package realtime

import (
	"context"
	"fmt"

	"github.com/phuthanet9870-cpu/game-online/server/internal/content"
	"github.com/phuthanet9870-cpu/game-online/server/internal/store"
)

type questState struct {
	Status   string // active | completed
	Counts   []int
	Repeats  int
	accepted bool
}

func (h *Hub) loadQuests(s *session, rows []store.QuestRow) {
	s.quests = map[string]*questState{}
	for _, r := range rows {
		q := h.c.Quest(r.QuestID)
		if q == nil {
			continue
		}
		c := make([]int, len(q.Objectives))
		copy(c, r.Counters)
		s.quests[r.QuestID] = &questState{Status: r.Status, Counts: c, Repeats: r.RepeatCount}
	}
}

type questView struct {
	ID          string                   `json:"id"`
	Kind        string                   `json:"kind"`
	Name        string                   `json:"name"`
	Description string                   `json:"description"`
	State       string                   `json:"state"` // locked | available | active | ready | completed
	LevelReq    int                      `json:"levelReq"`
	Objectives  []content.QuestObjective `json:"objectives"`
	Counts      []int                    `json:"counts"`
	Rewards     any                      `json:"rewards"`
	Repeatable  bool                     `json:"repeatable"`
}

// progressOf returns current counts (collect objectives read the live inventory).
func (h *Hub) progressOf(s *session, q *content.QuestDef, st *questState) ([]int, bool) {
	counts := make([]int, len(q.Objectives))
	done := true
	for i, o := range q.Objectives {
		if o.Type == "collect" {
			counts[i] = min(s.inv[o.ItemID], o.Count)
		} else if st != nil && i < len(st.Counts) {
			counts[i] = min(st.Counts[i], o.Count)
		}
		if counts[i] < o.Count {
			done = false
		}
	}
	return counts, done
}

func (h *Hub) questState(s *session, q *content.QuestDef) string {
	st := s.quests[q.ID]
	if st != nil && st.Status == "active" {
		if _, done := h.progressOf(s, q, st); done {
			return "ready"
		}
		return "active"
	}
	if st != nil && st.Status == "completed" && !q.Repeatable {
		return "completed"
	}
	if s.level < q.LevelReq {
		return "locked"
	}
	for _, r := range q.Requires {
		if p := s.quests[r]; p == nil || p.Status != "completed" {
			return "locked"
		}
	}
	return "available"
}

func (h *Hub) sendQuests(s *session) {
	var out []questView
	for i := range h.c.Quests {
		q := &h.c.Quests[i]
		counts, _ := h.progressOf(s, q, s.quests[q.ID])
		out = append(out, questView{ID: q.ID, Kind: q.Kind, Name: q.Name, Description: q.Description, State: h.questState(s, q), LevelReq: q.LevelReq,
			Objectives: q.Objectives, Counts: counts, Rewards: q.Rewards, Repeatable: q.Repeatable})
	}
	h.send(s.client, map[string]any{"t": "quests", "quests": out})
}

func (h *Hub) saveQuest(s *session, id string) {
	st := s.quests[id]
	status, counts := "", []int{}
	if st != nil && st.Status == "active" {
		status, counts = "active", append([]int{}, st.Counts...)
	}
	cid := s.charID
	h.persist.Enqueue("quest", func(ctx context.Context) error { return h.st.SaveQuest(ctx, cid, id, status, counts) })
}

// questEvent advances kill/talk objectives of active quests.
func (h *Hub) questEvent(s *session, kind, target string) {
	changed := false
	for id, st := range s.quests {
		if st.Status != "active" {
			continue
		}
		q := h.c.Quest(id)
		for i, o := range q.Objectives {
			if o.Type != kind || st.Counts[i] >= o.Count {
				continue
			}
			if (kind == "kill" && contains(o.Targets, target)) || (kind == "talk" && o.NPC == target) {
				st.Counts[i]++
				changed = true
				h.saveQuest(s, id)
			}
		}
	}
	if changed {
		h.sendQuests(s)
	}
}

func (h *Hub) questOp(s *session, m clientMsg) {
	p := h.world.Player(s.pid)
	q := h.c.Quest(m.ItemID)
	if p == nil || q == nil {
		h.fail(s, "quest", "ไม่พบเควสต์")
		return
	}
	switch m.Op {
	case "accept":
		if !h.near(p, q.Giver) {
			h.fail(s, "quest", "ต้องรับเควสต์ที่ Quest Board")
			return
		}
		if h.questState(s, q) != "available" {
			h.fail(s, "quest", "รับเควสต์นี้ไม่ได้ (เลเวล/เควสต์ก่อนหน้า/รับไปแล้ว)")
			return
		}
		rep := 0
		if st := s.quests[q.ID]; st != nil {
			rep = st.Repeats
		}
		s.quests[q.ID] = &questState{Status: "active", Counts: make([]int, len(q.Objectives)), Repeats: rep}
		h.saveQuest(s, q.ID)
		h.ok(s, "quest", map[string]any{"msg": "รับเควสต์ " + q.Name})
	case "abandon":
		if st := s.quests[q.ID]; st != nil && st.Status == "active" {
			if st.Repeats > 0 {
				st.Status = "completed"
			} else {
				delete(s.quests, q.ID)
			}
			h.saveQuest(s, q.ID)
		}
	case "turnin":
		if !h.near(p, q.TurnIn) {
			h.fail(s, "quest", "ต้องส่งเควสต์ที่ Quest Board")
			return
		}
		if h.questState(s, q) != "ready" {
			h.fail(s, "quest", "ยังทำเป้าหมายไม่ครบ")
			return
		}
		x := store.Exchange{GoldDelta: q.Rewards.Gold}
		for _, o := range q.Objectives {
			if o.Type == "collect" {
				x.Remove = append(x.Remove, store.ItemStack{TemplateID: o.ItemID, Quantity: o.Count})
			}
		}
		for _, it := range q.Rewards.Items {
			if !h.canAdd(s, it.ItemID, it.Quantity) {
				h.fail(s, "quest", "กระเป๋าเต็ม — เคลียร์ช่องก่อนส่งเควสต์")
				return
			}
			x.Add = append(x.Add, store.ItemStack{TemplateID: it.ItemID, Quantity: it.Quantity})
		}
		for _, r := range x.Remove {
			s.inv[r.TemplateID] -= r.Quantity
			if s.inv[r.TemplateID] <= 0 {
				delete(s.inv, r.TemplateID)
			}
		}
		for _, a := range x.Add {
			s.inv[a.TemplateID] += a.Quantity
		}
		s.gold += q.Rewards.Gold
		s.xp += q.Rewards.XP
		if nl := LevelForXP(h.c.Progression, s.xp); nl > s.level {
			s.level = nl
			h.world.SetLevel(p, nl)
			h.sendSys(s, fmt.Sprintf("เลเวลอัป! ตอนนี้ Lv.%d", nl), "crit")
		}
		st := s.quests[q.ID]
		st.Status, st.Counts = "completed", make([]int, len(q.Objectives))
		st.Repeats++
		txID, cid, xp, lvl := "quest:"+randomID(10), s.charID, q.Rewards.XP, s.level
		h.persist.Enqueue(txID, func(ctx context.Context) error { return h.st.CompleteQuest(ctx, txID, cid, q.ID, xp, lvl, x) })
		h.sendInventory(s)
		h.ok(s, "quest", map[string]any{"msg": fmt.Sprintf("ส่งเควสต์ %s: EXP +%d · Gold +%d", q.Name, q.Rewards.XP, q.Rewards.Gold)})
	default:
		h.fail(s, "quest", "unknown op")
		return
	}
	h.sendQuests(s)
}
