# ASTRA: ECLIPSE CHRONICLES

A browser-playable online action roguelike RPG: six standalone classes, an 8 Active + 4 Ultimate skill loadout, a 135-node passive tree with Keystones, seeded procedural Rifts with a three-phase boss, Normal and Hardcore modes, and a server-authoritative Node + PostgreSQL backend.

**Status: v0.4.0 — vertical slice, MMO systems, endgame, second region, professions/crafting, Thai content.** See [docs/FEATURES.md](docs/FEATURES.md) for exactly what is implemented, tested, and still missing. Nothing is publicly deployed yet.

## Play it locally
Requirements: Node 22+, PostgreSQL 16.
```bash
npm install
npm run build
DATABASE_URL=postgres://astra:astra_dev@localhost:5432/astra node apps/server/dist/server.js
# open http://localhost:8080
```
Offline single-file build (same game rules, runs entirely in the browser, no other players):
```bash
npm run build:offline   # → apps/client/dist-offline/astra-offline.html
```

## Controls (remappable in Settings)
| Action | Key |
|---|---|
| Move | WASD / arrows · touch joystick |
| Basic attack | hold left mouse · ⚔ on touch |
| Active skills 1-8 | 1-8 |
| Ultimates 1-4 | R F T G |
| Dodge / Potion / Interact | Space / Q / E |
| Cycle target (Tab Target) | Tab · or click an enemy |
| Pick up item | Z · or click the drop |
| Inventory / Skills / Passives / Character / Quests / Codex / Party / Guild / Leaderboards / Map | I / K / P / C / J / O / L / H / N / M |
| Chat | Enter (`/p`, `/g`, `/w name`, `/trade name`, `/invite name`, `/block`, `/report`) |

## Repository layout
```
packages/shared   game content (data), rules, World simulation, GameCore — used by server, tests and offline mode
apps/server       HTTP API + WebSocket game server + PostgreSQL persistence + migrations + e2e bot
apps/client       Vite + TypeScript browser client (Canvas 2D renderer, DOM UI, EN/TH)
docs/             GDD, architecture & decisions, feature matrix/backlog, operations guide
```

## Docs
- [Game Design Document](docs/GDD.md)
- [Architecture & decision record](docs/ARCHITECTURE.md) — includes the documented deviations from the recommended stack
- [Feature matrix & backlog](docs/FEATURES.md)
- [Operations, deployment, backups, security checklist, known issues](docs/OPERATIONS.md)
- [Content authoring](docs/CONTENT.md)
- [Changelog](CHANGELOG.md)
