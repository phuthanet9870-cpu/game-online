# DEVELOPMENT_STATUS (สถานะจริง)

_อัปเดต: 2026-11-22_

- **Current Phase:** 03 — Weapons + The Power + Auto + GM HUD → **Acceptance Gate ผ่าน (localhost)**, รออนุมัติขึ้น Phase 04
- **มีแล้ว:** 6 อาวุธ × 3 สกิล, The Power (6 ผล × 25 ชื่อสกิล; Inferno/Abyss Shadow ใช้ได้จริง 5/1/2), Power Energy/Stance/Proficiency/Archive, ผูกด้วย Fruit + ถอดที่ The Severer, คราฟต์ Fruit จาก Fragment, Auto Farm/Skill/Potion/Loot บน server, ถุง loot ส่วนตัว, hotbar 20 ช่องแก้ไข/บันทึกได้, GM HUD (inspect/spawn/proficiency) ใน test world, Power Trial ออฟไลน์
- **Server:** Go + PostgreSQL (migration 001–002), WSS 30 Hz authoritative
- **Tests:** Go ผ่านทั้งหมด, Vitest 48/48 (รวม Go↔TS parity), Playwright offline 4/4 + online 9/9, load 20 bots ผ่าน, reconcile 0
- **ยังไม่มี:** เมือง Aetheria/NPC ร้านค้า/เควสต์/party/dungeon/1v1/trade (Phase 4), World Boss (Phase 5), Guild/PvP (Phase 6), แคตตาล็อกเต็ม (Phase 7), deploy/TLS/MFA (Phase 8)
- **Test artifact:** https://claude.ai/artifact/6wZeHUbzaG3BzGdJCAyvEn — sandbox ออฟไลน์ + Power Trial (อาร์ติแฟกต์เชื่อม server ไม่ได้)
