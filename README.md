# THE POWER: ECLIPSE

HTML5 web MMORPG (Phaser + TypeScript + React). Master specification: [`MASTER_PROMPT.md`](MASTER_PROMPT.md).
**No Godot / no other engine export** (locked rule).

**สถานะ:** Phase 3 — Weapons + The Power + Auto + GM HUD (Go + PostgreSQL). ดู [`docs/DEVELOPMENT_STATUS.md`](docs/DEVELOPMENT_STATUS.md)

## Quick start
```bash
npm install
# 1) server (ต้องมี PostgreSQL 16 และ database ว่าง)
cd server && DATABASE_URL=postgres://USER:PASS@127.0.0.1:5432/tpe GAME_DATA=../game-data \
  ALLOWED_ORIGINS=127.0.0.1:5173,localhost:5173 go run ./cmd/gameserver serve
# 2) client (อีก terminal)
npm run dev          # http://127.0.0.1:5173  — ถ้าไม่มี server จะเข้าโหมด sandbox ออฟไลน์ของ Phase 1
```
Server env: `DATABASE_URL` (จำเป็น), `ADDR` (127.0.0.1:8080), `GAME_DATA`, `WEB_DIR` (เสิร์ฟ client build), `TEST_WORLD` (true = เปิดคำสั่งทดสอบ GM),
`SECURE_COOKIES` (true หลัง HTTPS), `TRUST_PROXY`, `ALLOWED_ORIGINS`, `AUTH_PER_MINUTE`, `AUTO_MIGRATE`.
คำสั่งอื่น: `go run ./cmd/gameserver migrate` · `go run ./cmd/gameserver grant-role -username X -role owner` · `go run ./cmd/loadbot -bots 20`
| คำสั่ง | ทำอะไร |
|---|---|
| `npm run check` | validate data + typecheck + lint + unit tests + production build |
| `npm test` | Vitest unit tests |
| `npm run test:e2e` | Playwright offline sandbox tests (รัน `npm run build` ก่อน) |
| `E2E_DATABASE_URL=... npm run test:e2e:online` | Playwright + Go server + PostgreSQL (database ทิ้งได้) |
| `cd server && TEST_DATABASE_URL=... go test -p 1 ./...` | Go unit + integration tests (+ parity fixtures; regenerate with `UPDATE_PARITY=1`) |
| `npm run build:single` | สร้างไฟล์ HTML เดียว (`apps/web-game/dist-single/`) สำหรับแชร์ทดสอบ |
| `npm run validate:data` | ตรวจ content JSON ใน `game-data/` |

## Controls
WASD/ลูกศร เดิน · `1`/คลิกซ้าย Basic Attack · `2` Triple Slash · `3` Guard Break · `4` Counter Slash · `Space`/`E` Dodge · `5`–`0` สกิลพลัง · `Q` Activate The Power · `T` HP Potion (ออนไลน์) · `H` คุย NPC / เก็บของ · `Enter` แชท · `F3` Debug · ปุ่มทั้งหมดแก้ได้ที่ 🔒 แก้ไข ใต้ hotbar

## Layout
```
apps/web-game/
  src/core/      pure TS simulation (movement, damage, AI, skills) — no Phaser/React
  src/game/      Phaser scene, procedural placeholder textures, input, Phaser↔React bridge
  src/net/       HTTPS API client + NetWorld (online mirror: prediction, interpolation, reconnect)
  src/ui/        React HUD (status, 20-slot hotbar, minimap, chat/log, gate, settings)
  tests/unit/    Vitest   tests/e2e/  Playwright
game-data/       weapons, monsters, maps (Tiled JSON) — data-driven content
server/          Go authoritative server: cmd/{gameserver,loadbot}, internal/{auth,content,game,httpapi,ratelimit,rbac,realtime,store}
tools/           content validation, map generator, ops/reconcile.sql
docs/            GAME_RULES, ROADMAP, DECISIONS, DEVELOPMENT_STATUS, PHASE_01, test-logs
```
