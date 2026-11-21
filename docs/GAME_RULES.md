# GAME RULES — THE POWER: ECLIPSE

> แหล่งความจริงอันดับ 2 รองจากคำยืนยันล่าสุดของเจ้าของโปรเจกต์ (ดู `prompt.md` §0)
> คัดลอกจาก Master Prompt v5.1 §2 **ห้ามแก้กฎ LOCKED โดยไม่มีคำยืนยันจากเจ้าของ** — หากพบ conflict ให้บันทึกใน `DECISIONS.md` และเสนอ migration

| # | สถานะ | กฎ | บังคับใช้ที่ไหนแล้ว |
|---|---|---|---|
| 1 | LOCKED | ไม่มีระบบ Class; บิลด์มาจากอาวุธ/พลัง/อุปกรณ์ | ไม่มี class ใน data/code |
| 2 | LOCKED | อาวุธ 6 ชนิด: Staff, Sword, Dagger, Bow, Grimoire, Gauntlet; เริ่มเลือกฟรี 1 | `game-data/weapons/weapons.json` + validator |
| 3 | LOCKED | อาวุธละ 3 สกิล Active (รวม 18) | `weapon_skills.json` + validator |
| 4 | LOCKED | The Power เป็นไอเทม (ดรอป/คราฟ); ผูกได้ครั้งละ 1 ผล | Phase 3 |
| 5 | LOCKED | Power ละ 15 Active + 5 Ultimate + 5 Passive = 25 | `powers.json` (ชื่อเท่านั้น) + validator |
| 6 | LOCKED | Loadout 5 Active + 1 Ultimate + 2 Passive; ต้อง Activate ก่อนใช้ | `powers.json loadoutLimits` + validator; runtime Phase 3 |
| 7 | LOCKED | บางผลจำกัดชนิดอาวุธ; validate ทุกครั้งที่เปลี่ยนอาวุธ/กดใช้ | compatibility ใน data + validator; runtime Phase 3 |
| 8 | LOCKED | ห้ามมี Power Awakening / Evolution | `awakening:false, evolution:false` + validator |
| 9 | LOCKED | Unbind ผ่าน NPC The Severer; ผลเก่าถูกทำลาย ไม่คืน | Phase 3 |
| 10 | LOCKED | เพิ่ม Power ใหม่ได้ต่อเนื่องแบบ data-driven | schema `powers.json` |
| 11 | LOCKED | Hotbar 20 ช่อง เห็นครบ จัดเรียงได้ | 20 ช่อง 2×10 แสดงครบแล้ว (`client/src/ui/hotbar.js`); การลากจัดเรียง Phase 3 |
| 12 | LOCKED | โลกหลัก 32 แมพ = 30 ฟาร์ม + 2 เมือง เท่านั้น | `core_maps.json` + validator |
| 13 | LOCKED | World Boss ทุกตัวมีแมพเฉพาะ ไม่นับใน 32 | Phase 5 |
| 14 | LOCKED | ทางเข้า World Boss = วงเวทแดงสุ่มใน 30 แมพฟาร์ม; ไม่เกิดในเมือง | `worldBossPortalEligible` เฉพาะ FARM + validator |
| 15 | LOCKED | วัตถุดิบ/พิธีเรียกบอสเฉพาะตัว | Phase 5 |
| 16 | LOCKED | Dungeon แมพแยก เข้าได้ทาง Dungeon Gatekeeper NPC ในเมืองหลักเท่านั้น | Phase 4 |
| 17 | LOCKED | Auto Farm/Attack/Skill/Loot/Potion; ห้าม Auto เล่น PvP/Guild War | Phase 3 |
| 18 | LOCKED | PvP, Guild War, Territory; เป้าหมาย 30v30 | Phase 6 |
| 19 | LOCKED | GM HUD เปิดด้วย `/gmstefanonline` แต่ต้องตรวจสิทธิ์จาก server เสมอ; ข้อความนี้ไม่ใช่รหัสผ่าน | Phase 2 (RBAC) / Phase 3 (HUD) — **ยังไม่มีโค้ดที่รับคำสั่งนี้** |
| 20 | LOCKED | Owner/Admin เสกไอเทม/มอนสเตอร์/ชุด/Max Stats ผ่าน HUD ตามสิทธิ์ | Phase 3+ |
| 21 | LOCKED/TARGET | Item Catalog 1,350 template ID ไม่ซ้ำ | Phase 2 seed / Phase 7 ครบ |
| 22 | LOCKED | Trade Loot ≥ 360 ชนิด (12 ต่อแมพฟาร์ม) | Phase 2+ |
| 23 | DESIGN | GM items ห้ามเข้า economy / Ranked | Phase 3 |
| 24 | DESIGN | เงิน ของ ดาเมจ อันดับ ให้ server เป็น authority | Phase 1: logic ทั้งหมดอยู่ใน `client/src/core/` (ไม่มี DOM) เพื่อย้ายไป server ใน Phase 2 |
