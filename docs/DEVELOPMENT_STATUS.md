# DEVELOPMENT_STATUS (สถานะจริง)

_อัปเดต: 2026-11-21_

- **Current Phase:** 02 — Online Authoritative Foundation → **Acceptance Gate ผ่าน (localhost)**, รออนุมัติขึ้น Phase 03
- **Server:** Go (ADR-005) + PostgreSQL 16 — auth/session, characters (สูงสุด 3), WSS 30 Hz authoritative world, personal loot, XP/Level/Gold/Inventory พร้อม ledger idempotent, reconnect grace 15 s, chat + rate limits, GM RBAC + audit
- **Client:** หน้า Login/สมัคร/เลือก-สร้าง-ลบตัวละคร, โหมดออนไลน์ (prediction + interpolation + auto-reconnect), HUD EXP/Gold/กระเป๋า/ผู้เล่นออนไลน์/GM panel; Phase 1 sandbox ออฟไลน์ยังใช้ได้
- **Tests:** Go ทั้งหมดผ่าน (รวม integration PostgreSQL), Vitest 45/45, Playwright offline 3/3 + online 4/4, load 20 bots × 60 s ผ่าน, reconcile ledger = 0
- **ยังไม่มี:** อาวุธอีก 5 ชนิด, The Power, Auto, hotbar remap, GM HUD เต็ม (Phase 3); เมือง/NPC/dungeon/party/PvP (Phase 4+); deploy จริง/TLS/MFA (Phase 8)
- **Test artifact:** https://claude.ai/artifact/6wZeHUbzaG3BzGdJCAyvEn — เปิดได้เฉพาะ sandbox ออฟไลน์ (อาร์ติแฟกต์เชื่อม server ไม่ได้)
