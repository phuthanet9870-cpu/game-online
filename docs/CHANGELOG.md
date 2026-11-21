# CHANGELOG

## 0.1.0 — 2026-11-21
### Added
- สถาปัตยกรรม TypeScript: shared/server/client, esbuild build (Node server, online client, single-file artifact)
- GameServer แบบ server-authoritative (20 Hz) ใช้ได้ทั้งบน WebSocket (Node) และ Web Worker (เบราว์เซอร์)
- Auth (PBKDF2), token resume, reconnect grace 15s, rate limits, protocol validation, การ kick เมื่อละเมิดซ้ำ
- การสร้างตัวละครครบทุกฟิลด์ตาม PART 2.1, ค่าสถานะ 20 ค่าพร้อมเพดาน, ตัวคูณ PvE/PvP
- Level/EXP/rested/level-diff, Weapon Mastery
- Movement ที่ใช้ร่วมกัน (prediction/reconciliation), interpolation, lag compensation
- ต่อสู้: คอมโบ, heavy, dodge+i-frame, block/mana guard, ดาบ 3 สกิล, คทา 3 สกิล, CC, โล่, counter
- มอนสเตอร์ 12 ชนิด (normal 10, elite 2), AI state machine, telegraph, dynamic spawn, farming soft cap
- Loot ฝั่งเซิร์ฟเวอร์, inventory, equipment, ร้านค้า NPC, จุดเก็บทรัพยากร, hazards
- แผนที่ Aether Capital, Greenfall Plains, Whispering Forest
- SQLite + migrations (1 initial, 2 bans), optimistic save, audit log, backup
- Renderer isometric pixel art แบบ procedural, HUD, inventory/character/shop/dialog/help panels
- ระบบ GM (`/gm<passphrase>`, GM Panel, คำสั่ง 30+ รายการ, audit)
- เอกสาร 24 ไฟล์ + GM_SYSTEM.md, ชุดเทสต์ 30 unit/integration + 2 e2e
