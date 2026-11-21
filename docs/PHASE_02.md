# PHASE 02 — ONLINE AUTHORITATIVE FOUNDATION

**Boundary:** Start: combat browser prototype accepted → End: multiplayer test with persistence and server validation
**สถานะ:** Acceptance Gate ผ่านในสภาพแวดล้อมทดสอบ (localhost) — **รอเจ้าของเกมอนุมัติก่อนเริ่ม Phase 3**

## Checklist (MASTER_PROMPT §24 Phase 02)
| งาน | ผล | หลักฐาน |
|---|---|---|
| เลือก Java หรือ Go + ADR + modular server | ✅ Go | ADR-005, `server/` |
| HTTPS auth, account/character, sessions, character selection | ✅ (TLS ที่ proxy) | `httpapi`, หน้า Login/ตัวละคร, ADR-010 |
| PostgreSQL migrations + safe connectivity | ✅ | `internal/store/migrations/001_init.sql`, pgx pool, `TestMigrationsIdempotent` |
| WSS protocol: join/leave/movement intent/snapshots/corrections | ✅ | ADR-008, `docs/ARCHITECTURE.md` |
| Server combat, monster spawning, loot, anti-speed | ✅ | `internal/game` (port จาก client), `TestMoveSpeedIsServerSideAndClamped` |
| Inventory/Gold/XP/level persistence + ledger + idempotent tx | ✅ | ADR-009, store tests, reconcile.sql = 0 |
| Reconnect & refresh recovery; chat + rate limits | ✅ | grace 15 s, auto-reconnect, E2E reconnect/refresh, chat 5 ข้อความ/10 s |
| GM RBAC, audit, command parser ที่ปฏิเสธผู้ไม่มีสิทธิ์ | ✅ | ADR-011, hub tests, E2E GM |
| Unit/integration tests + load 10–20 clients | ✅ | 20 bots × 60 s |

## Acceptance Gate
| เงื่อนไข | ผล |
|---|---|
| 10–20 test clients เข้าโลกเดียวกัน เดิน/สู้/เก็บของได้สอดคล้อง | ✅ loadbot 20/20 เชื่อมต่อ, เห็นผู้เล่นครบ 20, snapshot 15/s ต่อคน, protocol error 0 (`phase02-load.log`) |
| logout/reconnect เก็บ item/currency/character ครบ | ✅ E2E refresh + logout/login, loadbot persistence 20/20, reconcile 0 |
| ไม่มี duplicate-item exploit แบบง่าย | ✅ tx_id idempotent (ยิงซ้ำพร้อมกัน 10 ครั้ง → 1), seq replay ถูกทิ้ง, ล็อกอินซ้ำ → entity เดียว, consume ติดลบไม่ได้, ledger แก้ไม่ได้ |

## ผลทดสอบ (logs ใน `docs/test-logs/`)
- `phase02-go-tests.log` — Go unit + integration (PostgreSQL จริง): ผ่านทั้งหมด
- `phase02-e2e-online.log` — Playwright + Go server + PostgreSQL: 4/4
- `phase02-e2e-offline-regression.log` — Phase 1 sandbox: 3/3
- `phase02-check.log` — data validation, typecheck, ESLint, Vitest 45/45, build
- `phase02-load.log` — 20 bots × 60 s

## บั๊กที่เจอและแก้ระหว่าง Phase นี้
- `ConsumeItem` ใช้ไอเทมชิ้นสุดท้ายแล้วชน `CHECK (quantity > 0)` → เปลี่ยนเป็น lock แถว + ลบเมื่อเหลือ 0 (พบจาก integration test)

## วิธีรัน (dev)
```bash
# PostgreSQL 16 ที่มี database ว่าง เช่น postgres://tpe:***@127.0.0.1:5432/tpe
cd server && DATABASE_URL=... GAME_DATA=../game-data ALLOWED_ORIGINS=127.0.0.1:5173,localhost:5173 go run ./cmd/gameserver serve
cd apps/web-game && npm run dev          # http://127.0.0.1:5173 (proxy /api,/ws → :8080)
# หรือให้ server เสิร์ฟ client เอง: npm run build แล้วตั้ง WEB_DIR=../apps/web-game/dist → http://127.0.0.1:8080
go run ./cmd/gameserver grant-role -username <user> -role owner   # ให้สิทธิ์ GM (audit)
```
Tests: `cd server && TEST_DATABASE_URL=... go test -p 1 ./...` · `E2E_DATABASE_URL=... npm run test:e2e:online` · `go run ./cmd/loadbot -bots 20 -duration 60s` (ตั้ง `AUTH_PER_MINUTE` สูงสำหรับ bot)

## Known issues / ข้อจำกัดตามจริง
- ทดสอบทั้งหมดบน **localhost** — ยังไม่มีการจำลอง latency/packet loss; ping ที่วัดได้เป็นค่า localhost ไม่ใช่เครือข่ายจริง
- **อาร์ติแฟกต์บน claude.ai เชื่อม server ไม่ได้** (CSP ของอาร์ติแฟกต์บล็อก fetch/WebSocket ไปโฮสต์อื่น) → อาร์ติแฟกต์เปิดได้เฉพาะ Phase 1 sandbox; การทดสอบออนไลน์ต้องรันเครื่องตัวเองหรือ deploy (Phase 8)
- Client prediction ทำเฉพาะการเดิน; dash/knockback ของตัวเองตาม server (มีหน่วงเล็กน้อยตาม ping)
- Snapshot ส่งทุก entity ในแมพ (ไม่มี AOI) — พอสำหรับ 20 คน/แมพเดียว ต้องทำ interest management ก่อนขยาย
- ไม่มี MFA, password recovery, email — ยังไม่อยู่ในขอบเขต Phase 2 (สเปก §4.1/§19.6 → Phase 7–8)
- Persister เป็นคิวเดียวในหน่วยความจำ: ถ้า process ตายแบบ kill -9 งานที่ค้างในคิว (ไม่กี่ ms) อาจหาย — ไม่ทำให้เกิด dupe แต่ reward ล่าสุดอาจไม่ถูกบันทึก
- ยังไม่ได้ทดสอบ Firefox/Edge/Safari (มีเฉพาะ Chromium)
- ไอเทมมี 3 template (Slime Gel, Wolf Fang, Minor HP Potion) — แค็ตตาล็อก 1,350 ชิ้นอยู่ใน Phase 7
