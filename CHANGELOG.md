# Changelog

## [0.5.0] — 2026-11-22 — Phase 6: Live service
### Added
- Season framework with Season 1 "The Ember Tithe": Ember Shards and Season XP from Rifts, tower, arena, raid and the world boss; 20-tier reward track (dust, gold, respec tokens, titles, cosmetic auras — no combat power); season archive; documented permanent vs reset progress.
- Weekly events (Ember Tide, Golden Rifts, Elite Surge, Scholar's Week) and three rotating weekly objectives; Season panel (Y); cosmetic auras rendered on characters.
- Staff console at /admin.html: TOTP MFA, overview, analytics (class usage, runs, economy, level distribution), player lookup with audited inspection, mute/kick/ban with mandatory reasons, announcements, audit log viewer.
- Live config with validation, preview diff, versioned publish, history and rollback: feature flags (world boss, auction, trade, tower, raid, guilds), XP/gold/loot multipliers, weekly-event override, maintenance mode, message of the day.
- Migration 004; CLI role grant; tests: seasons/weekly/claims/flags, TOTP RFC vector (38 total); live `admin-e2e.ts`.

## [0.4.0] — 2026-11-22 — Content: second region, professions, story, Thai content
### Added
- Ashen Highlands open world (levels 10-20) east of Duskmeadow: lava fields, charred spires, Cinderkin family (Ember Imp, Flamecaller, Magma Golem, Cinder Drakeling).
- Professions: Mining, Herbalism, Alchemy, Smithing, Cooking (levels 1-10). Iron, Starsteel (Mining 4+), Emberbloom nodes; material drops (Beast Meat, Cinder Core) go to a materials pouch.
- Crafting at Brenna (forge rare/epic gear for a chosen slot) and the new NPC Sister Maelis (potions, 3 elixirs, 2 meals). One consumable buff at a time, persists across zones.
- Story Chapter 2 (6 quests) and Chapter 3 (3 quests) ending at the raid; new objective types (gather ore, craft, tower floor, arena wave, clear activity).
- Thai translations for classes, all 72 skills, quests, enemies, activities, blessings, dungeon modifiers, achievements, professions and recipes.
- Tests: Thai coverage, Highlands connectivity, crafting and profession gates (34 total).

## [0.3.0] — 2026-11-22 — Phase 5: Endgame
### Added
- Rift Gate activity picker with server-side unlock rules: Rift, Challenge Arena (lv 1), Endless Tower (lv 5), Ancient Labyrinth (lv 8), Nightmare Rift (lv 10 + cleared Hard), Raid (lv 12).
- Endless Tower floors (+12% enemy strength per floor, Veyra every 5th floor, item level rises with floor).
- Challenge Arena waves with champion waves every 5th wave; no respawns; downed allies can be revived (Interact, 20s cooldown).
- Ancient Labyrinth maze generator with caches and new enemies (Labyrinth Sentry, Oruk the Warden).
- Nightmare Rift with three hostile modifiers and a 10-minute bonus cache.
- Raid "Eclipse Throne" (party up to 8): Nyx Aurelion with Total Eclipse (stand in the circle of light), meteor eruptions, add waves, phase-3 nova and an 8-minute enrage; full wipe ends the attempt.
- Leaderboards for tower floor, arena wave and level (Normal/Hardcore), panel on N; migration 003.
- 5 new achievements; 6 new tests (30 total); `--mode` option for the live bot.

## [0.2.0] — 2026-11-22 — Phase 4: MMORPG systems
### Added
- Direct player trading: request/accept, offers of up to 8 items + gold, both lock then both confirm, any change unlocks both sides; atomic swap saved in one transaction; bound and Hardcore/Normal cross-trades refused.
- Auction house at Auctioneer Vell: search/filter/sort/paging, item escrow, 5g deposit, 10% sale fee, 48h expiry, proceeds and expired items claimed later (works while the seller is offline), separate Hardcore market.
- Guilds: found for 500g, invite, officer/member ranks, kick rules, message of the day, leadership transfer guarded by typing the guild name, guild XP and levels from Rift clears and world boss kills, activity log, guild chat (/g), guild tag shown on characters.
- Party finder with join requests; party leadership transfer.
- World boss public event: Gloomheart, the Eclipsed Grove, spawns in Duskmeadow every ~5 minutes while players are present, life scales with players, shown on the minimap and HUD.
- Chat spam protection (repeat-message auto-mute, audited).
- Migration 002 (guilds, auction_listings with a unique index on escrowed item uid); single-transaction `transact()`; shared state reload on startup.
- Tests: 9 new unit tests (24 total); live Postgres test `apps/server/test/social-e2e.ts`.

### Fixed
- A player's first chat message within 0.7s of server start was rejected.
- Two quick saves of the same character could commit out of order through the connection pool; writes are now serialized per character.
- A failed fire-and-forget database write would have crashed the server (unhandled rejection); failures are now logged.
- Escape in the trade window now cancels the trade on the server instead of only hiding the window.

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
