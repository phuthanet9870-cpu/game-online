# Changelog

## [0.1.0] — 2026-11-22
### Added
- Monorepo (npm workspaces): `packages/shared`, `apps/server`, `apps/client`.
- Server-authoritative simulation (30 Hz) shared by the server and the offline build.
- Six classes with unique resources/mechanics, 72 skills (8 Active + 4 Ultimate each), basic attack chains, dodge roll, potions.
- Passive tree: six class trees + Astral Core, 135 nodes, 10 Keystones; respec, refunds, presets, build codes.
- Items: 10 slots, 6 rarities, affix tiers, 8 legendary powers; salvage, sell, enchant; account vault split Normal/Hardcore.
- Lumenhold town with vendors, quest giver, training dummies; Duskmeadow open world; seeded procedural Rifts with shrines, bargains, treasure, rest and elite rooms; 7 dungeon modifiers; 6 difficulty tiers.
- Enemies: Hollowborn family, Duskmeadow wildlife, Vanguard Captain mini-boss, Veyra three-phase boss with Break gauge.
- Progression: levels to 100, class Mastery, account codex/achievements/titles; Normal and Hardcore death rules.
- Parties (up to 4) sharing Rift instances, chat channels, block and report.
- PostgreSQL schema + migrations, scrypt auth, hashed session tokens, rate limiting, idempotent mutations, audit log.
- Browser client: Canvas 2D renderer, HUD, all panels, Action and Tab Target modes, remappable keys, touch controls, EN/TH UI.
- Tests: Vitest suite (15 tests), Playwright browser checks, WebSocket end-to-end bot and load mode.
- Docker/compose, CI workflow, docs (GDD, architecture/ADR, feature matrix, operations, content guide).

### Fixed during testing
- Server kept rate-limited sockets open after dropping the session; fatal errors now close the socket.
- Enemies could stick on wall corners when they had line of sight but no walkable path; AI now checks body-width clearance and paths around.
- The Rift Exit spawned after Veyra's death was not sent to clients.
- Skills were rejected as "Busy" during basic-attack recovery; skills now cancel that recovery.
- Closed panels rendered as empty boxes (CSS overrode `[hidden]`).
