# THE POWER: ECLIPSE

HTML5 web MMORPG (Phaser + TypeScript + React). Master specification: [`MASTER_PROMPT.md`](MASTER_PROMPT.md).
**No Godot / no other engine export** (locked rule).

**สถานะ:** Phase 1 — HTML5 Combat Prototype (single-player, offline, placeholder art). ดู [`docs/DEVELOPMENT_STATUS.md`](docs/DEVELOPMENT_STATUS.md)

## Quick start
```bash
npm install
npm run dev          # http://127.0.0.1:5173
```
| คำสั่ง | ทำอะไร |
|---|---|
| `npm run check` | validate data + typecheck + lint + unit tests + production build |
| `npm test` | Vitest unit tests |
| `npm run test:e2e` | Playwright browser tests (รัน `npm run build` ก่อน) |
| `npm run build:single` | สร้างไฟล์ HTML เดียว (`apps/web-game/dist-single/`) สำหรับแชร์ทดสอบ |
| `npm run validate:data` | ตรวจ content JSON ใน `game-data/` |

## Controls (Phase 1)
WASD/ลูกศร เดิน · `1`/คลิกซ้าย Basic Attack · `2` Triple Slash · `3` Guard Break · `4` Counter Slash · `Space`/`E` Dodge · `Enter` แชท · `F3` Debug

## Layout
```
apps/web-game/
  src/core/      pure TS simulation (movement, damage, AI, skills) — no Phaser/React
  src/game/      Phaser scene, procedural placeholder textures, input, Phaser↔React bridge
  src/ui/        React HUD (status, 20-slot hotbar, minimap, chat/log, gate, settings)
  tests/unit/    Vitest   tests/e2e/  Playwright
game-data/       weapons, monsters, maps (Tiled JSON) — data-driven content
tools/           content validation, map generator
docs/            GAME_RULES, ROADMAP, DECISIONS, DEVELOPMENT_STATUS, PHASE_01, test-logs
```
