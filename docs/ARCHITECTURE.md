# Architecture & Decision Record

## Overview

```
apps/client  (Vite + TypeScript, Canvas 2D, DOM UI)
     │  HTTPS: /api/register /api/login /api/me /api/characters /api/ladder
     │  WSS:   /ws   (JSON messages, protocol v1)
apps/server  (Node 22, node:http + ws, modular monolith)
     │  GameCore (rooms, sessions, parties, quests)  ◄── packages/shared
     │  PostgreSQL (accounts, auth_sessions, characters, audit_log)
packages/shared  (pure TypeScript: content data, rules, World simulation, GameCore)
```

The **same `GameCore` and `World` code** runs on the server (authoritative) and inside the offline build. The client never mutates game state: it sends intents (`input`, `cast`, `equip`, …) and renders snapshots.

## Decisions

| # | Decision | Reason | Revisit when |
|---|---|---|---|
| ADR-1 | Monorepo with npm workspaces; content + simulation in `packages/shared` | One rules implementation for server, tests, and offline mode; no drift. | — |
| ADR-2 | **Canvas 2D renderer instead of Phaser 3** (deviation from the master prompt's default) | All art is procedural for now; Canvas 2D keeps the bundle at ~85 KB gzip and lets the offline build ship as one HTML file. | Sprite atlases / lighting arrive (B-7). Phaser or PixiJS can replace `render.ts` without touching game logic. |
| ADR-3 | **Plain DOM UI instead of React** (deviation) | The UI is panel-based and small; avoiding a framework keeps the single-file build simple. | UI grows past ~30 screens or needs shared component state. |
| ADR-4 | **node:http + `ws` instead of NestJS + Colyseus** (deviation) | The authoritative room logic already lives in `GameCore`; Colyseus would duplicate its room/state model. Fewer moving parts to operate. | Horizontal scaling needs room brokering across processes. |
| ADR-5 | **`pg` + SQL migrations instead of Prisma** (deviation) | No native engine download; explicit SQL for transactions and constraints. | Team prefers an ORM. |
| ADR-6 | Character state stored as validated JSONB + indexed columns | Schema evolves quickly during early phases; `normalizeCharacter` migrates old saves. Hot fields (level, name, hardcore, dead) are real columns. | Trading/auction needs item rows (B-3): items move to their own table with row-level locking. |
| ADR-7 | Redis not used yet | Single process holds sessions in memory; no cross-process pub/sub needed. | Second game process or shard. |
| ADR-8 | Simulation 30 Hz, snapshots 15 Hz, interest radius 1400 px | Readable telegraphs under ~150 ms latency; snapshot size ~3-8 KB. | Larger zones (delta compression, B-8). |
| ADR-9 | Client prediction for own movement only; server position wins | Movement feels instant; combat outcomes stay server-side. | Competitive PvP (needs input sequence numbers). |

## Trust boundaries
- Server computes damage, crits, drops, gold, XP, cooldowns, resources, positions (client sends a move direction, never a position).
- Every command is validated: skill ownership/kind/level, cooldown, resource, range clamp, line of sight for targeted skills, NPC proximity for vendors, inventory indices.
- State-changing commands carry a request id; replays within the last 200 are ignored (idempotency).
- Per-session token bucket (45 msg/s, burst 90); sustained flooding closes the socket.
- Private data (inventory, account) is only sent to its owner; snapshots expose public fields only.
- Passwords: scrypt (N=16384). Session tokens: 32 random bytes, stored as SHA-256 hashes, 14-day expiry.
- Audit log: register, login, loot, salvage, sell, enchant, quest rewards, dungeon entry, hardcore deaths, reports, server errors.

## Hardcore policy
Death is permanent and is saved immediately. A player who disconnects is removed from the world at once (no lingering body), so a disconnect cannot cause a Hardcore death. Confirmed server faults (crash during combat) are handled by restoring from the audit log + database backup (manual, staff-only; tooling in B-6). Hardcore characters never convert to Normal.

## Message protocol (v1)
Client → server: `auth`, `input{mx,my,ax,ay,atk}`, `cast{k,s,ax,ay,tid}`, `dodge`, `potion`, `target`, `pickup`, `interact`, `choose`, `enter_dungeon{diff}`, `leave`, `equip`, `unequip`, `move_inv`, `salvage`, `sell`, `enchant`, `buy_potion`, `loadout`, `passive_alloc`, `passive_refund`, `respec`, `preset_save`, `preset_load`, `import_build`, `quest_accept`, `quest_claim`, `stash_put`, `stash_take`, `chat`, `block`, `report`, `party_*`, `ping`.

Server → client: `welcome` (map + private character), `snap` (15 Hz), `ev` (visual/game events), `char`, `party`, `open`, `choice`, `run`, `run_end`, `toast`, `err`, `chat`, `achievement`, `hc_dead`, `it_used`, `pong`.

Snapshot entity tuple: `[id, kind, x, y, facing, hp, maxHp, barrier, def, name, level, statuses, flags, windup, dead, size%, affixes, break, phase, invuln]`.
