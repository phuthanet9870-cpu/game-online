package realtime

import (
	"context"
	"fmt"
	"sort"

	"github.com/phuthanet9870-cpu/game-online/server/internal/content"
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
	case "equipItem":
		h.equipItem(s, p, m.ItemID, "equipItem")
	case "unequip":
		h.unequip(s, p, m.Target)
	case "smith":
		h.smith(s, p, m)
	}
}

func (h *Hub) near(p *game.Player, npc string) bool { return h.world.NearNPC(p, npc, talkRange) }

// talk opens an NPC menu. The client only renders; every action is re-validated on use.
func (h *Hub) talk(s *session, p *game.Player, npc string) {
	if !p.Alive() || !h.near(p, npc) {
		h.fail(s, "talk", "อยู่ไกล NPC เกินไป")
		return
	}
	h.questEvent(s, "talk", npc)
	msg := map[string]any{"t": "npc", "npc": npc, "name": npcNames[npc]}
	if npc == "questboard" {
		h.sendQuests(s)
	}
	switch npc {
	case "merchant":
		msg["shop"] = h.c.Shops["merchant"]
	case "storage":
		msg["storage"] = sortedStacks(s.storage)
	case "blacksmith":
		var recipes []any
		for _, r := range h.c.Recipes {
			if r.NPC == "blacksmith" {
				recipes = append(recipes, r)
			}
		}
		sort.Slice(recipes, func(i, j int) bool { return recipes[i].(*content.Recipe).ID < recipes[j].(*content.Recipe).ID })
		msg["recipes"] = recipes
		msg["enhance"] = h.c.Enhance
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
			if t == nil || t.SellPriceGold <= 0 || t.GmOnly || s.inv[m.ItemID] < qty || h.isEquipped(s, m.ItemID) {
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
		if s.inv[m.ItemID] < qty || h.isEquipped(s, m.ItemID) || s.enh[m.ItemID] > 0 {
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

/* ------------------------------------------------- equipment & Blacksmith */

func (h *Hub) isEquipped(s *session, templateID string) bool {
	for _, id := range s.equip {
		if id == templateID {
			return true
		}
	}
	return false
}

// applyEquip recomputes equipment stats (+8%/level enhancement [TUNING]) and the weapon type.
func (h *Hub) applyEquip(s *session, p *game.Player) {
	var atk, def, hp float64
	for _, id := range s.equip {
		t := h.c.Items[id]
		if t == nil || t.Stats == nil {
			continue
		}
		mul := 1 + h.c.Enhance.StatPctPerLevel*float64(s.enh[id])
		atk += t.Stats.Attack * mul
		def += t.Stats.Defense * mul
		hp += t.Stats.MaxHp * mul
	}
	if p != nil {
		h.world.SetEquipBonus(p, atk, def, hp)
	}
}

func (h *Hub) equipItem(s *session, p *game.Player, itemID, op string) {
	t := h.c.Items[itemID]
	switch {
	case t == nil || t.Slot == "" || s.inv[itemID] <= 0:
		h.fail(s, op, "ไม่มีอุปกรณ์ชิ้นนี้ในกระเป๋า")
		return
	case s.level < t.LevelReq:
		h.fail(s, op, fmt.Sprintf("ต้องการเลเวล %d", t.LevelReq))
		return
	case h.inCombat(p) || s.auto.Enabled:
		h.fail(s, op, "เปลี่ยนอุปกรณ์ได้เฉพาะนอกการต่อสู้และเมื่อปิด Auto")
		return
	}
	if t.Slot == "weapon" {
		if err := h.world.EquipWeapon(p, t.WeaponType); err != nil {
			h.fail(s, op, err.Error())
			return
		}
		s.weapon = t.WeaponType
		cid, wt := s.charID, t.WeaponType
		h.persist.Enqueue("weapon", func(ctx context.Context) error { return h.st.SetWeapon(ctx, cid, wt) })
	}
	s.equip[t.Slot] = itemID
	cid, slot := s.charID, t.Slot
	h.persist.Enqueue("equip", func(ctx context.Context) error { return h.st.SetEquipment(ctx, cid, slot, itemID) })
	h.applyEquip(s, p)
	h.sendInventory(s)
	h.sendPower(s)
	h.ok(s, op, map[string]any{"item": t.Name, "weapon": p.Weapon.ID})
}

func (h *Hub) unequip(s *session, p *game.Player, slot string) {
	if slot == "weapon" || s.equip[slot] == "" {
		h.fail(s, "unequip", "ถอดช่องนี้ไม่ได้ (อาวุธต้องเปลี่ยนเป็นชิ้นอื่น)")
		return
	}
	delete(s.equip, slot)
	cid := s.charID
	h.persist.Enqueue("unequip", func(ctx context.Context) error { return h.st.SetEquipment(ctx, cid, slot, "") })
	h.applyEquip(s, p)
	h.sendInventory(s)
	h.ok(s, "unequip", nil)
}

func (h *Hub) smith(s *session, p *game.Player, m clientMsg) {
	if !h.near(p, "blacksmith") {
		h.fail(s, "smith", "ต้องอยู่ใกล้ Blacksmith")
		return
	}
	switch m.Op {
	case "craft":
		r := h.c.Recipes[m.Recipe]
		if r == nil || r.NPC != "blacksmith" {
			h.fail(s, "smith", "ไม่พบสูตร")
			return
		}
		if s.gold < r.GoldCost {
			h.fail(s, "smith", fmt.Sprintf("Gold ไม่พอ (ต้องการ %d)", r.GoldCost))
			return
		}
		x := store.Exchange{TxID: "smith:" + randomID(10), CharID: s.charID, GoldDelta: -r.GoldCost, Reason: "craft:" + r.ID}
		outT := h.c.Items[r.Output.ItemID]
		reequip := ""
		for _, in := range r.Inputs {
			// an equipped input may be consumed only when the output replaces it in the same slot (upgrade)
			if h.isEquipped(s, in.ItemID) && s.inv[in.ItemID] <= in.Quantity {
				if inT := h.c.Items[in.ItemID]; inT != nil && outT.Slot != "" && inT.Slot == outT.Slot && s.level >= outT.LevelReq {
					reequip = outT.Slot
				} else {
					h.fail(s, "smith", "วัตถุดิบชิ้นนี้กำลังสวมใส่อยู่")
					return
				}
			}
			if s.inv[in.ItemID] < in.Quantity {
				h.fail(s, "smith", fmt.Sprintf("วัตถุดิบไม่พอ/กำลังสวมใส่: %s %d/%d", h.c.Items[in.ItemID].Name, s.inv[in.ItemID], in.Quantity))
				return
			}
			x.Remove = append(x.Remove, store.ItemStack{TemplateID: in.ItemID, Quantity: in.Quantity})
		}
		out := r.Output
		if !h.canAdd(s, out.ItemID, out.Quantity) && !(len(r.Inputs) > 0 && s.inv[r.Inputs[len(r.Inputs)-1].ItemID] == r.Inputs[len(r.Inputs)-1].Quantity) {
			h.fail(s, "smith", "กระเป๋าเต็ม")
			return
		}
		for _, rm := range x.Remove {
			s.inv[rm.TemplateID] -= rm.Quantity
			if s.inv[rm.TemplateID] <= 0 {
				delete(s.inv, rm.TemplateID)
				delete(s.enh, rm.TemplateID)
			}
		}
		s.gold -= r.GoldCost
		s.inv[out.ItemID] += out.Quantity
		x.Add = []store.ItemStack{{TemplateID: out.ItemID, Quantity: out.Quantity}}
		h.persist.Enqueue(x.TxID, func(ctx context.Context) error { return h.st.ApplyExchange(ctx, x) })
		if reequip != "" {
			s.equip[reequip] = out.ItemID
			cid, slot, id := s.charID, reequip, out.ItemID
			h.persist.Enqueue("equip", func(ctx context.Context) error { return h.st.SetEquipment(ctx, cid, slot, id) })
			h.applyEquip(s, p)
		}
		h.sendInventory(s)
		h.ok(s, "smith", map[string]any{"msg": "คราฟต์ " + h.c.Items[out.ItemID].Name + " สำเร็จ"})
	case "enhance":
		t := h.c.Items[m.ItemID]
		lvl := s.enh[m.ItemID]
		if t == nil || t.Slot == "" || s.inv[m.ItemID] <= 0 {
			h.fail(s, "smith", "ตีบวกได้เฉพาะอุปกรณ์ในกระเป๋า")
			return
		}
		if lvl >= h.c.Enhance.MaxLevel {
			h.fail(s, "smith", "ถึง +10 แล้ว")
			return
		}
		cost := h.c.Enhance.Levels[lvl]
		if s.gold < cost.Gold || s.inv["MAT-ORE-002"] < cost.Stones {
			h.fail(s, "smith", fmt.Sprintf("ต้องใช้ %d Gold + Enhancement Stone %d", cost.Gold, cost.Stones))
			return
		}
		success := h.lootRng.Next() < cost.Chance
		s.gold -= cost.Gold
		s.inv["MAT-ORE-002"] -= cost.Stones
		if s.inv["MAT-ORE-002"] <= 0 {
			delete(s.inv, "MAT-ORE-002")
		}
		if success {
			s.enh[m.ItemID] = lvl + 1
		}
		txID, cid, id := "enh:"+randomID(10), s.charID, m.ItemID
		stones := []store.ItemStack{{TemplateID: "MAT-ORE-002", Quantity: cost.Stones}}
		h.persist.Enqueue(txID, func(ctx context.Context) error { return h.st.Enhance(ctx, txID, cid, id, cost.Gold, stones, success) })
		h.applyEquip(s, p)
		h.sendInventory(s)
		msg := fmt.Sprintf("ตีบวก %s +%d สำเร็จ!", t.Name, lvl+1)
		if !success {
			msg = fmt.Sprintf("ตีบวก %s ล้มเหลว (ของไม่หาย คงที่ +%d)", t.Name, lvl)
		}
		h.ok(s, "smith", map[string]any{"msg": msg, "success": success})
	default:
		h.fail(s, "smith", "unknown op")
	}
}
