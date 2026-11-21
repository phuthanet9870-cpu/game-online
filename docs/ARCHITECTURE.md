# ARCHITECTURE (สถานะ ณ Phase 2)

```
Browser (HTML5)                                   Go server (modular monolith, 1 binary)
┌──────────────────────────────┐   HTTPS JSON   ┌───────────────────────────────────────────┐
│ React UI: auth, characters,  │ ─────────────▶ │ httpapi: /api/auth/*, /api/me, /api/session│
│ HUD, chat, bag, GM panel     │                │          /api/characters, static client    │
│                              │   WSS JSON     │                                           │
│ Phaser scene (renderer)      │ ◀────────────▶ │ realtime.Hub  (single loop goroutine)      │
│  └ WorldSource               │  input/seq →   │  ├ game.World  30 Hz authoritative sim     │
│     ├ GameSimulation (P1     │  ← snap 15 Hz  │  ├ rewards → personal loot (contribution)  │
│     │   offline sandbox)     │                │  ├ chat / GM commands (rbac + audit)       │
│     └ NetWorld (online:      │                │  └ Persister (ordered, idempotent, retry)  │
│        predict + interpolate)│                │ store (pgx) ──▶ PostgreSQL 16              │
└──────────────────────────────┘                └───────────────────────────────────────────┘
            game-data/*.json  ← shared content (client bundle + server load & validate)
```

## WebSocket protocol (`/ws?char=<id>`, cookie session, same-origin)
| ทิศทาง | `t` | ฟิลด์ |
|---|---|---|
| C→S | `input` | `seq` (เพิ่มขึ้นเสมอ), `mv:[x,y]` (≤1), `aim:[x,y]\|null`, `act:[{type:"attack",slot}\|{type:"dash"}\|{type:"potion"}]` (≤4) |
| C→S | `chat` | `text` (≤120 ตัวอักษร; ขึ้นต้น `/` = คำสั่ง) |
| C→S | `ping` | `c` (client time) |
| S→C | `welcome` | `you{id,charId,name,level,weapon}`, `instance`, `tickMs`, `testWorld` |
| S→C | `snap` | `st` server time, `ack`, `you{...cds,stamina,recap}`, `players[]`, `monsters[]`, `ev[]` (SimEvent) |
| S→C | `inv` | `gold`, `xp`, `level`, `xpLevelStart`, `xpLevelNext`, `items[]`, `slots` |
| S→C | `reward` / `chat` / `sys` / `gm` / `kicked` / `pong` | — |

## Character lifecycle
`CREATED → IN_WORLD ⇄ IN_COMBAT → DEAD → RESPAWNING → IN_WORLD`; ตัดการเชื่อมต่อ → `connected=false` อยู่ในโลกต่อ **15 วินาที** (grace, กัน combat-logout และให้ refresh กลับมาได้) → บันทึกตำแหน่ง/HP แล้วนำออก

## Database (migration `001_init.sql`)
`accounts`, `sessions`, `login_history`, `characters`, `transactions` (idempotency), `item_instances`, `item_ledger`, `currency_ledgers`, `xp_ledger`, `gm_audit_log` — ledger/audit ห้าม UPDATE/DELETE (trigger)
ตรวจความสอดคล้อง: `psql "$DATABASE_URL" -f tools/ops/reconcile.sql` (ทุกค่าต้องเป็น 0)
