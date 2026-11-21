# DEVELOPMENT_STATUS (สถานะจริง)

_อัปเดต: 2026-11-21_

- **Current Phase:** 01 — HTML5 Combat Prototype → **Acceptance Gate ผ่าน**, รออนุมัติขึ้น Phase 02
- **Implemented (พิสูจน์ด้วยการรัน/ทดสอบ):** 8-dir movement + collision, sword basic + 3 skills, dodge/stamina, slime/wolf AI, death/respawn + death recap, character state machine, damage pipeline, 20-slot hotbar UI (ใช้งานได้ 5 ช่อง), debug overlay, typed Phaser↔React bridge, content validation
- **Not implemented:** ทุกอย่างที่ต้องใช้ server (บัญชี, persistence, multiplayer, items, GM จริง), The Power, อาวุธอีก 5 ชนิด, เมือง/NPC, แมพจริงทั้ง 32
- **Tests:** unit 45/45 ผ่าน, E2E 3/3 ผ่าน (Chromium), lint/typecheck ผ่าน, data validation ผ่าน
- **Blocked on owner decision:** เลือก server language Java หรือ Go (ADR-005) ก่อนเริ่ม Phase 02
- **Test artifact:** https://claude.ai/artifact/6wZeHUbzaG3BzGdJCAyvEn (private จนกว่าเจ้าของจะแชร์)
