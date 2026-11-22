package realtime

import (
	"context"
	"fmt"
	"sort"

	"github.com/phuthanet9870-cpu/game-online/server/internal/game"
	"github.com/phuthanet9870-cpu/game-online/server/internal/store"
)

const talkRange = 40.0 // px — every NPC service re-checks distance on the server

var npcNames = map[string]string{
	"merchant": "Merchant", "storage": "Storage Keeper", "blacksmith": "Blacksmith", "severer": "The Severer",
	"gatekeeper": "Dungeon Gatekeeper", "trial": "Power Trial Warden", "questboard": "Quest Board", "arena": "Arena Master",
}

func (h *Hub) onPhase4(s *session, m clientMsg) {
	p := h.world.Player(s.pid)
	if p == nil {
		return
	}
	switch m.T {
	case "talk":
		h.talk(s, p, m.NPC)
	case "shop":
		h.shop(s, p, m)
	case "storage":
		h.storageOp(s, p, m)
	}
}

func (h *Hub) near(p *game.Player, npc string) bool { return h.world.NearNPC(p, npc, talkRange) }

// talk opens an NPC menu. The client only renders; every action is re-validated on use.
func (h *Hub) talk(s *session, p *game.Player, npc string) {
	if !p.Alive() || !h.near(p, npc) {
		h.fail(s, "talk", "อยู่ไกล NPC เกินไป")
		return
	}
	msg := map[string]any{"t": "npc", "npc": npc, "name": npcNames[npc]}
	switch npc {
	case "merchant":
		msg["shop"] = h.c.Shops["merchant"]
	case "storage":
		msg["storage"] = sortedStacks(s.storage)
	}
	h.send(s.client, msg)
}

func sortedStacks(m map[string]int) []store.ItemStack {
	out := make([]store.ItemStack, 0, len(m))
	for id, q := range m {
		out = append(out, store.ItemStack{TemplateID: id, Quantity: q})
	}
	sort.Slice(out, func(i, j int) bool { return out[i].TemplateID < out[j].TemplateID })
	return out
}

func (h *Hub) shop(s *session, p *game.Player, m clientMsg) {
	if !h.near(p, "merchant") {
		h.fail(s, "shop", "ต้องอยู่ใกล้ Merchant")
		return
	}
	qty := m.Qty
	if qty <= 0 {
		qty = 1
	}
	x := store.Exchange{TxID: "shop:" + randomID(10), CharID: s.charID}
	switch m.Op {
	case "buy":
		var price int64 = -1
		for _, it := range h.c.Shops["merchant"] {
			if it.ItemID == m.ItemID {
				price = it.Price
			}
		}
		t := h.c.Items[m.ItemID]
		if price < 0 || t == nil || qty > 99 {
			h.fail(s, "shop", "ร้านไม่ได้ขายของชิ้นนี้")
			return
		}
		cost := price * int64(qty)
		if s.gold < cost {
			h.fail(s, "shop", fmt.Sprintf("Gold ไม่พอ (ต้องการ %d)", cost))
			return
		}
		if granted := h.canAdd(s, m.ItemID, qty); !granted {
			h.fail(s, "shop", "กระเป๋าเต็มหรือเกินจำนวนซ้อนสูงสุด")
			return
		}
		s.gold -= cost
		s.inv[m.ItemID] += qty
		x.GoldDelta, x.Add, x.Reason = -cost, []store.ItemStack{{TemplateID: m.ItemID, Quantity: qty}}, "npc-buy"
	case "sell", "sellAllTrade":
		var remove []store.ItemStack
		if m.Op == "sell" {
			t := h.c.Items[m.ItemID]
			if t == nil || t.SellPriceGold <= 0 || t.GmOnly || s.inv[m.ItemID] < qty || h.equippedTemplate(s, p) == m.ItemID {
				h.fail(s, "shop", "ขายชิ้นนี้ไม่ได้ (ไม่มีพอ / ไม่มีราคา / กำลังสวมใส่)")
				return
			}
			remove = []store.ItemStack{{TemplateID: m.ItemID, Quantity: qty}}
		} else {
			for id, q := range s.inv {
				if t := h.c.Items[id]; t != nil && t.Category == "TRD" && t.SellPriceGold > 0 {
					remove = append(remove, store.ItemStack{TemplateID: id, Quantity: q})
				}
			}
			if len(remove) == 0 {
				h.fail(s, "shop", "ไม่มี Trade Loot ในกระเป๋า")
				return
			}
			sort.Slice(remove, func(i, j int) bool { return remove[i].TemplateID < remove[j].TemplateID })
		}
		var total int64
		for _, r := range remove {
			total += int64(h.c.Items[r.TemplateID].SellPriceGold) * int64(r.Quantity)
			s.inv[r.TemplateID] -= r.Quantity
			if s.inv[r.TemplateID] <= 0 {
				delete(s.inv, r.TemplateID)
			}
		}
		s.gold += total
		x.GoldDelta, x.Remove, x.Reason = total, remove, "npc-sell"
	default:
		h.fail(s, "shop", "unknown op")
		return
	}
	h.persist.Enqueue(x.TxID, func(ctx context.Context) error { return h.st.ApplyExchange(ctx, x) })
	h.sendInventory(s)
	h.ok(s, "shop", map[string]any{"op": m.Op, "gold": x.GoldDelta})
}

// canAdd checks slot/stack limits without changing anything.
func (h *Hub) canAdd(s *session, itemID string, qty int) bool {
	t := h.c.Items[itemID]
	have, exists := s.inv[itemID]
	if t == nil || (!exists && len(s.inv) >= h.c.Progression.InventorySlots) {
		return false
	}
	return have+qty <= t.MaxStack
}

// equippedTemplate is the starter weapon template of the equipped weapon type (cannot be sold while equipped).
func (h *Hub) equippedTemplate(s *session, p *game.Player) string {
	id := h.c.Progression.StarterWeaponItems[p.Weapon.ID]
	if s.inv[id] == 1 {
		return id
	}
	return ""
}

func (h *Hub) storageOp(s *session, p *game.Player, m clientMsg) {
	if !h.near(p, "storage") {
		h.fail(s, "storage", "ต้องอยู่ใกล้ Storage Keeper")
		return
	}
	qty := m.Qty
	t := h.c.Items[m.ItemID]
	if t == nil || qty <= 0 {
		h.fail(s, "storage", "รายการไม่ถูกต้อง")
		return
	}
	switch m.Op {
	case "deposit":
		if s.inv[m.ItemID] < qty || h.equippedTemplate(s, p) == m.ItemID {
			h.fail(s, "storage", "ไม่มีพอ หรือกำลังสวมใส่")
			return
		}
		if _, ok := s.storage[m.ItemID]; !ok && len(s.storage) >= 60 { // [TUNING] storage slots
			h.fail(s, "storage", "โกดังเต็ม (60 ช่อง)")
			return
		}
		s.inv[m.ItemID] -= qty
		if s.inv[m.ItemID] == 0 {
			delete(s.inv, m.ItemID)
		}
		s.storage[m.ItemID] += qty
	case "withdraw":
		if s.storage[m.ItemID] < qty || !h.canAdd(s, m.ItemID, qty) {
			h.fail(s, "storage", "ไม่มีพอในโกดัง หรือกระเป๋าเต็ม")
			return
		}
		s.storage[m.ItemID] -= qty
		if s.storage[m.ItemID] == 0 {
			delete(s.storage, m.ItemID)
		}
		s.inv[m.ItemID] += qty
		qty = -qty
	default:
		h.fail(s, "storage", "unknown op")
		return
	}
	txID, cid, item, q := "storage:"+randomID(10), s.charID, m.ItemID, qty
	h.persist.Enqueue(txID, func(ctx context.Context) error { return h.st.MoveStorage(ctx, txID, cid, item, q) })
	h.sendInventory(s)
	h.send(s.client, map[string]any{"t": "npc", "npc": "storage", "name": npcNames["storage"], "storage": sortedStacks(s.storage)})
	h.ok(s, "storage", nil)
}
