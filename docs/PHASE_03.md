# PHASE 03 — WEAPONS + THE POWER + AUTO + GM HUD

**Boundary:** Start: multiplayer authority passed → End: key game identity works in browser
**สถานะ:** Acceptance Gate ผ่านในสภาพแวดล้อมทดสอบ (localhost, Chromium) — **รอเจ้าของเกมอนุมัติก่อนเริ่ม Phase 4**

## Checklist (MASTER_PROMPT §24 Phase 03)
| งาน | ผล | หลักฐาน |
|---|---|---|
| 6 อาวุธ + 18 สกิลทำงาน | ✅ | `game-data/weapons/weapons.json`; `TestAllSixWeaponsAndEighteenSkillsFunction`; E2E สร้างตัวละครได้ทั้ง 6; sandbox เปลี่ยนครบ 6 |
| Hotbar 20 ช่อง 2×10, ลาก/สลับ/rebind/บันทึก | ✅ | `Hotbar3` (โหมดแก้ไข: คลิก 2 ช่องสลับ, คลิก 1 ช่องแล้วกดปุ่มใหม่), validate ทั้ง client+server, บันทึกบน server (`characters.hotbar`) — E2E rebind คงอยู่หลังรีโหลด |
| Skill/Power data-driven + Power Energy/Stance | ✅ | `game-data/powers/powers.json`, `statuses.json`; PE 100 regen 5/s; ช่อง 11 = Activate |
| Inferno + Abyss Shadow MVP 5/1/2; schema 15/5/5 | ✅ | ชื่อครบ 150 สกิล (6×25) ตามสเปก; ใช้งานได้จริง 16 (2 พลัง × 5 active + 1 ult + 2 passive); validator ตรวจ 15/5/5 |
| Power drop/craft, bind, weapon restriction, Activate, The Severer destructive unbind + transaction test | ✅ | ดรอป Fruit 1% (Wolf) / คราฟต์ 10 Fragment; Abyss = Dagger เท่านั้น; `TestBindAndDestructiveUnbindTransaction`, `TestBindRequiresFruitAndAllowedWeaponThenSeverDestroys`, E2E |
| Proficiency/Archive + Power Trial sandbox | ✅ | Rank 1–3 (0/60/200 pts `[TUNING]`), `power_archive` เก็บแต้ม (คืนให้เมื่อผูกผลเดิมใหม่); Power Trial = sandbox ออฟไลน์ Rank 3 ไม่สร้างไอเทม/ไม่บันทึก |
| Auto Farm/Attack/Skill/Potion/Loot, รัศมี, safety stop, ไม่ฟาร์มออฟไลน์, server validation | ✅ | `internal/game/auto.go` (server ตัดสินทั้งหมด), รัศมี 5–25 tiles, หยุดเมื่อ HP ต่ำ+ยาหมด/หมดเวลา/หลุด, รายงานผล; E2E + `TestAutoStopsOnDisconnectAndReports` |
| GM HUD `/gmstefanonline`, inspector, spawn monster/item ใน test world | ✅ | `GmHud`: ตรวจผู้เล่น, เสกไอเทม, เสกมอนสเตอร์ (ไม่มีดรอป, หาย 2 นาที), ตั้ง proficiency, quick bar; ทุกคำสั่งตรวจ capability + audit; ปฏิเสธนอก test world |
| Web regression: keyboard, reconnect, 20 ช่อง | ✅ | Playwright offline 4/4, online 9/9 |

## Acceptance Gate
| เงื่อนไข | ผล |
|---|---|
| 6 อาวุธ มีสกิลละ 3 พอดี | ✅ (data validator + Go test ทุกสกิลทำดาเมจ/ติดสถานะได้จริง) |
| 2 พลังใส่ subset 5/1/2 | ✅ Rank 2 ปลด passive ตัวที่ 2 → loadout 5/1/2; `TestLoadoutLimitsAndProficiencyUnlocks` |
| weapon restriction, activation, permanent unbind | ✅ E2E: ผูก Abyss ด้วยดาบถูกปฏิเสธ → เปลี่ยน Dagger → ผูก → Activate → ใช้สกิล → The Severer ทำลาย, ไม่คืนผล |
| Auto ฟาร์ม PvE ถูกกฎและหยุดตามสั่ง | ✅ ไม่ตีหุ่นฝึก/ผู้เล่น, หยุดเมื่อสั่ง/หลุด/HP ต่ำ |
| GM ที่ไม่มีสิทธิ์ถูกปฏิเสธเสมอ | ✅ ทั้ง `/gmstefanonline` และ op ผ่าน WebSocket (spawn item/monster) |

## Go ↔ TypeScript parity
`tests/parity/*.json` สร้างจาก Go engine (`UPDATE_PARITY=1 go test ./internal/game -run TestParity`) และ TS engine ต้องให้เหตุการณ์ตรงกันทุกตัว (ดาเมจ, คริ, สถานะ, AI) — 3 สถานการณ์ผ่าน

## ตัวเลข (`[TUNING]` ทั้งหมด)
อยู่ใน `game-data/` — weapons.json, powers.json (energy/proficiency/loadout), statuses.json, drops (Fruit 1%, Fragment 25–30%, สูตร 10→1)

## ผลทดสอบ (`docs/test-logs/phase03-*`)
- Go: ทุกแพ็กเกจผ่าน (49 test functions รวม integration PostgreSQL)
- Vitest 48/48 (รวม parity 3), Playwright offline 4/4, online 9/9
- Load 20 bots × 60 s: เชื่อมต่อ 20/20, protocol error 0, persistence 20/20, reconcile 0

## Known issues / ข้อจำกัดตามจริง
- เทสต์เฉพาะ Chromium บน localhost; Firefox/Edge/Safari ยังไม่ได้ทดสอบ
- The Severer อยู่ในแมพทดสอบชั่วคราว — ย้ายเข้า Aetheria Capital ใน Phase 4
- Fruit/Fragment ดรอปจากมอนสเตอร์ในแมพทดสอบเท่านั้น; ตัวเลขทั้งหมดยังไม่ผ่าน balance
- Auto ไม่ได้หาเส้นทางอ้อมกำแพง (เดินตรง + สไลด์ตามกำแพง) — พอสำหรับแมพทดสอบ ต้องมี pathfinding ใน Phase 4
- Hotbar ยังไม่มี preset หลายชุด; การลากแบบ drag-and-drop ใช้การคลิก 2 ช่องแทน
- ภาพ/เอฟเฟกต์ยังเป็น placeholder (projectile เป็นวงกลม, ไม่มีเสียง)
- GM HUD ยังไม่มี Max Stat Generator / Custom Item Creator / two-person approval (Phase 7)
- Power Trial ทำงานฝั่ง client (ไม่มีรางวัลใด ๆ จึงไม่กระทบความปลอดภัย) — เป็นสำเนาของกติกา server ที่ตรวจด้วย parity test
