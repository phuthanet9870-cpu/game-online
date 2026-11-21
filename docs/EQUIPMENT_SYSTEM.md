# EQUIPMENT_SYSTEM

สถานะ: slots/rarity/binding/stats/equip **Tested** · random options, sockets, durability ยังไม่ทำ

## ช่องสวมใส่
weapon, armor, helmet, gloves, boots, accessory1, accessory2

## Rarity
Common ×1.00 · Uncommon ×1.12 · Rare ×1.25 · Epic ×1.42 · Legendary ×1.62 · Mythic ×1.85 (ตัวคูณสเตตัสพื้นฐาน) จำนวนช่องออปชั่น 1–6 ระบุไว้ใน `RARITY_INFO` แล้วแต่ยังไม่ได้ใช้

## Item instance (server-only)
`uid, defId, qty, rarity, ilvl, enhance, bound, slot|equip` และ stats = base × rarityMult × (1 + 3% × (ilvl − levelReq))
- uid สร้างด้วย `crypto.randomUUID()` บนเซิร์ฟเวอร์เท่านั้น client อ้างถึงได้แต่สร้างไม่ได้
- Binding: `on_pickup` (ของเริ่มต้นและของจากร้านบางชิ้น), `on_equip` (ของดรอป) ไอเทมที่ bound แล้วขายให้ NPC หรือทิ้งได้ แต่จะซื้อขายกับผู้เล่นไม่ได้ (ตลาด M6)
- Durability: ตัดสินใจ**ไม่ใช้**ในรอบนี้ เพื่อไม่ให้เพิ่มภาระโดยไม่มีระบบซ่อมรองรับ จะพิจารณาอีกครั้งใน M4

## รายการไอเทม (สร้างจาก config)
| ID | ชื่อ | หมวด | Rarity | Lv | Stats | Stack | Bind | ขาย |
|---|---|---|---|---|---|---|---|---|
| wpn_rusty_sword | ดาบขึ้นสนิม | weapon | common | 1 | patk 6 | 1 | on_pickup | 5 |
| wpn_apprentice_staff | คทาเด็กฝึก | weapon | common | 1 | matk 6 | 1 | on_pickup | 5 |
| wpn_iron_sword | ดาบเหล็ก | weapon | common | 5 | patk 14 | 1 | on_equip | 40 |
| wpn_oak_staff | คทาไม้โอ๊ค | weapon | common | 5 | matk 14 | 1 | on_equip | 40 |
| wpn_wolfbane_blade | ดาบล่าหมาป่า | weapon | uncommon | 9 | patk 24, critRate 0.03 | 1 | on_equip | 120 |
| wpn_sylvan_staff | คทาพงไพร | weapon | uncommon | 9 | matk 24, cdr 0.03 | 1 | on_equip | 120 |
| arm_cloth_tunic | เสื้อผ้าฝ้าย | armor | common | 1 | pdef 4, mdef 4, hp 20 | 1 | on_pickup | 4 |
| arm_leather_vest | เสื้อหนัง | armor | common | 4 | pdef 10, mdef 6, hp 45 | 1 | on_equip | 30 |
| helm_leather_cap | หมวกหนัง | helmet | common | 3 | pdef 4, hp 20 | 1 | on_equip | 18 |
| glv_leather_gloves | ถุงมือหนัง | gloves | common | 3 | pdef 2, atkSpd 0.03 | 1 | on_equip | 18 |
| bts_leather_boots | รองเท้าหนัง | boots | common | 3 | pdef 2, moveSpeed 0.15 | 1 | on_equip | 18 |
| acc_copper_ring | แหวนทองแดง | accessory | common | 5 | critRate 0.02, hp 15 | 1 | on_equip | 35 |
| acc_wolf_fang_necklace | สร้อยเขี้ยวหมาป่า | accessory | uncommon | 8 | patk 4, matk 4, accuracy 0.01 | 1 | on_equip | 60 |
| pot_hp_small | ยาฟื้นพลังขนาดเล็ก | consumable | common | 1 | {"kind":"heal","flat":80,"hpFraction":0.2,"cooldown":8} | 50 | none | 5 |
| pot_energy_small | ยาฟื้นพลังงานขนาดเล็ก | consumable | common | 1 | {"kind":"energy","flat":50,"cooldown":8} | 50 | none | 5 |
| mat_soul_essence | แก่นวิญญาณ | material | common | 1 | - | 999 | none | 3 |
| mat_iron_ore | แร่เหล็ก | material | common | 1 | - | 999 | none | 4 |
| mat_slime_gel | เจลสไลม์ | material | common | 1 | - | 999 | none | 1 |
| mat_boar_hide | หนังหมูป่า | material | common | 1 | - | 999 | none | 2 |
| mat_wolf_pelt | หนังหมาป่า | material | common | 1 | - | 999 | none | 3 |
| mat_spore_cap | หมวกเห็ดสปอร์ | material | common | 1 | - | 999 | none | 2 |
| mat_wisp_dust | ผงภูตแสง | material | common | 1 | - | 999 | none | 3 |
| mat_nature_herb | สมุนไพรเขียวขจี | material | common | 1 | - | 999 | none | 2 |
| mat_power_fragment | เศษพลัง | material | rare | 1 | - | 999 | none | 25 |
| rune_vitality_basic | รูนแห่งชีวิต (พื้นฐาน) | rune | uncommon | 1 | - | 99 | none | 30 |
