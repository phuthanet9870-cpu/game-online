# PHASE 04 — FIRST PLAYABLE MVP (CLOSED PLAYER TEST)

**Boundary:** Start: core systems + GM test tools passed (Phase 3 ✅) → End: complete first playable MMORPG loop
**สถานะ:** 🚧 กำลังพัฒนา (เจ้าของเกมอนุมัติ 2026-11-22: ทำ Phase 4 แล้วหยุดรอที่ Gate)
**โหมดทำงาน:** มี scheduled task ปลุกทุกชั่วโมง → อ่านไฟล์นี้ แล้วทำรายการถัดไปที่ยังไม่ติ๊ก

## Acceptance Gate (สเปก §24 Phase 04)
Create → choose weapon → farm/loot → bind/Activate Power → party → talk Gatekeeper → enter separate dungeon → defeat boss/claim loot → craft/merchant → 1v1 → logout/rejoin with preserved state

## Vertical slices (ทำตามลำดับ — ติ๊กเมื่อมีโค้ด + เทสต์ผ่าน + push แล้ว)
- [x] **S1 Multi-map:** server แยก World ต่อแมพ (hub จัดการหลาย instance), ทางเชื่อมแมพ (portal ขอบแมพ) + ย้ายแมพแบบ server-validated, client สลับแมพ; แมพ Aetheria Capital (เมือง, PvP off, ไม่มีมอนสเตอร์) + FARM-01 Greenfield Plains, FARM-02 Whispering Forest, FARM-03 Wolf Fang Valley; ตัวละครใหม่เกิดที่ Aetheria; บันทึก map_id
- [x] **S2 NPC talk protocol + บริการเมือง:** (Quest Board → S4, Gatekeeper → S6, Arena Master → S7) `talk` (ตรวจระยะบน server) → เมนู; Merchant (ซื้อ/ขาย + Sell All Trade Loot, ราคา deterministic), Storage (ฝาก/ถอน), Blacksmith (คราฟต์ + ตีบวก +0..+10 ไม่ทำลายของ), The Severer (ย้ายเข้าเมือง), Power Trial NPC, Quest Board, Dungeon Gatekeeper
- [x] **S3 Content:** มอนสเตอร์ประจำ 3 แมพ, Trade Loot 12 ชนิด × 3 แมพ (TRD-F01..F03), อุปกรณ์พื้นฐาน (อาวุธ tier 2 × 6, ชุด 5 ชิ้น) + equipment slots + stat budget, Map Boss 1 ตัวใน FARM-03 (respawn window)
- [x] **S4 Quests:** main + side, server นับ kill/collect/talk, ส่งเควสต์ที่ NPC, รางวัลผ่าน ledger
- [ ] **S5 Party + Party Finder:** เชิญ/รับ/ออก/เตะ, หัวหน้า, party chat, แชร์ EXP/สิทธิ์ loot ตาม contribution, Party Finder (ประกาศหาทีม)
- [ ] **S6 Normal Dungeon:** เข้าได้เฉพาะคุยกับ Dungeon Gatekeeper ในเมือง → validate → ready check → สร้าง instance แยก (ไม่นับใน 32) → objective + boss → personal loot → ออกกลับเมือง; reconnect เข้า instance เดิม; ไม่มีทางเข้าอื่น
- [ ] **S7 Arena 1v1:** แมพ/instance แยก, ท้าดวล/คิว, manual only (ปิด Auto), stat normalization + PvP modifier, ไม่มีของหล่น, บันทึกผล (`pvp_matches`)
- [ ] **S8 Player trade:** ขอเทรด → ใส่ของ/Gold → ล็อกทั้งสองฝ่าย → ยืนยัน → swap แบบ atomic + ledger; ห้ามเทรด GM-only/bound items
- [ ] **S9 GM support + Gate:** GM teleport/move-to-safety/ดูแมพ, E2E เดินครบ Gate path, security/performance baseline, docs + logs, อาร์ติแฟกต์

## บันทึกความคืบหน้า
- 2026-11-22: สร้างแผน, ตั้ง scheduled task รายชั่วโมง
- 2026-11-22: S1 เสร็จ (4 แมพ + portal + เกิดในเมือง), S2 ส่วนใหญ่เสร็จ, data S3 พร้อม; online E2E 11/11 ผ่าน (รวม phase4.spec 2 ตัว)
- S3 เสร็จ: equipment 6 ช่อง + stats, ตีบวก +0..+10 ไม่ทำลายของ, Blacksmith คราฟต์, trade loot ตามแมพ; online E2E 12/12
- S4 เสร็จ: quest_progress (migration 006), CompleteQuest atomic (ledger), accept/abandon/turnin ที่ Quest Board เท่านั้น, นับ kill/talk + collect จาก inventory จริง, UI Quest Board + tracker; E2E Quest Board ผ่าน
- ถัดไป: S5 Party + Party Finder
