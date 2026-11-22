# Feature Matrix

Statuses: `Not Started` · `In Progress` · `Implemented` (code exists, manually exercised) · `Tested` (covered by automated tests or the e2e bot) · `Released` (deployed to a public HTTPS URL — nothing is Released yet).

Last updated: 2026-11-22 (v0.9.0 — Phases 0-1, 4, 5, 6, 7, content expansion, polish).

## Platform & architecture
| Feature | Status | Notes |
|---|---|---|
| Browser client (no install), Canvas 2D renderer | Tested | Playwright: Chromium desktop + mobile viewport. Firefox/Safari not yet tested. |
| Server-authoritative simulation (30 Hz) | Tested | `packages/shared/src/world.ts`; client sends intents only. |
| WebSocket realtime protocol v1 + REST auth API | Tested | e2e bot (`apps/server/test/bot.ts`). |
| PostgreSQL persistence + migrations | Tested | Characters, accounts, sessions, audit log. |
| Offline mode (same core in-browser, labelled) | Tested | Used for the claude.ai artifact build. Not server-authoritative. |
| Rate limiting, idempotent mutations, audit log | Tested | Unit tests for flood + replayed request id. |
| Reconnect into dungeon instance (90 s grace) | Tested | Unit test + live reconnect in `social-e2e.ts`. |
| Docker image / compose | Implemented | Written but **not built in this environment** (no Docker daemon). |
| CI workflow | Implemented | Not yet run on GitHub. |
| HTTPS deployment | Not Started | Needs a host + domain; see docs/OPERATIONS.md. |
| Live content tuning editor (skills, enemies, weapons, loot) with validation, preview, versions, rollback | Tested | Unit + live e2e. |
| Staff console `/admin.html` (roles via CLI only, TOTP MFA per session, overview, analytics, player lookup with logged inspection, mute/kick/ban with reasons, announcements, audit viewer) | Tested | Live e2e `admin-e2e.ts`. Not in the offline artifact. |
| Live config: feature flags, XP/gold/loot multipliers, weekly-event override, maintenance mode, MOTD — validate → preview diff → publish → history → rollback | Tested | Live e2e incl. maintenance lockout + rollback. |
| Observability | In Progress | Structured JSON logs + minute metrics; no Prometheus/Sentry yet. |

## Classes, skills, builds
| Feature | Status | Notes |
|---|---|---|
| Six standalone launch classes, no evolutions | Tested | Each kills enemies in automated combat test. |
| 7th standalone class: Chronomancer (Flux + Sand, Time Echo mechanic, 8+4 skills, own passive tree + keystone, Thai) | Tested | Phase 7 expansion. |
| Class resource + mechanic (Rage, Weave, Combo, Focus/Mark, Conviction/Block, Souls) | Implemented | |
| 8 Active + 4 Ultimate per class in library (72 skills) | Tested | Content test asserts counts. |
| Loadout exactly 8 + 4, server-validated | Tested | |
| Basic attack chains + build modifiers (extra hits, chain, pierce, conversion, echo) | Implemented | |
| Passive tree: 6 class trees + Astral Core, 10 Keystones, 135 nodes | Tested | Connectivity, points, class restriction tested. |
| Respec (free < lv 15), single-node refund, presets, build codes | Implemented | |
| Action combat + Tab Target mode | Implemented | Both send the same server commands. |
| Dodge roll with i-frames, potions | Implemented | |
| Status effects (burn, freeze, chill, shock, poison, bleed, curse, slow, stun, weaken, vulnerable, marked) | Implemented | CC diminishing returns; bosses convert CC into Break gauge. |

## Progression, items, economy
| Feature | Status | Notes |
|---|---|---|
| Level 1-100 XP curve, anti low-level farming | Tested | |
| Class Mastery (titles, +1 passive point / 5 levels) | Implemented | |
| Account progression (codex, achievements, titles, shared vault) | Implemented | |
| Equipment: 10 slots, 6 rarities, affix tiers, legendary powers | Implemented | |
| Salvage, sell, enchant (affix reroll), potion vendor | Implemented | NPC proximity enforced server-side. |
| Normal death (5% gold loss, respawn) | Tested | e2e bot died and respawned. |
| Hardcore permadeath + separate items/stash | Tested | |
| Direct player trade (lock → confirm, atomic swap) | Tested | Unit tests + live Postgres test; both characters saved in one SQL transaction. |
| Auction house (escrow, 5g deposit, 10% fee, 48h expiry, claim proceeds offline) | Tested | Live test proves a double-buy yields exactly one copy; DB unique index on escrowed item uid. |
| Per-character ordered writes | Implemented | Saves of the same character are serialized so they cannot commit out of order. |
| Professions: Mining, Herbalism, Alchemy, Smithing, Cooking (levels 1-10, gated nodes and recipes) | Tested | |
| Crafting: potions, 3 elixirs, 2 meals (one active buff, persists across zones), forge rare/epic gear by slot | Tested | |
| Materials pouch (no inventory clutter) with drops from beasts and Cinderkin | Implemented | |
| Fishing (server-timed bite window, Fishing profession, 3 catches, 3 new meals) | Tested | |
| Companions/pets (3, cosmetic + wider pickup reach, no combat power) | Tested | |
| Guild vault (30 slots, per-rank daily withdrawal limits, logged, atomic saves) | Tested | |
| Hearth housing: 13 furniture pieces (4 functional: vault chest, alchemy table, anvil, dummy; 3 achievement/catch trophies), server-validated placement, visitor permissions (private/party/guild/public), purchases saved atomically with the account | Tested | |
| Treasure hunting: maps drop in the open world; search circle; warm/cold digging; exact spot never sent to clients | Tested | |
| Third region: Starfall Wastes (levels 20-30), Shardborn family (4), Starglass (Mining 6) and legendary forging, Chapter 4 (4 quests) | Tested | |

## World & content
| Feature | Status | Notes |
|---|---|---|
| Shared Town (Lumenhold) with NPC services + training dummies | Tested | |
| Open world zone (Duskmeadow) with respawning packs, level bands 2-9 | Implemented | |
| Second region: Ashen Highlands (levels 10-20), Cinderkin family (4 enemies), ore veins, lava fields | Tested | Connectivity and spawn bands tested. |
| Seeded procedural Rift: rooms, branches, elite/treasure/shrine/rest/event rooms | Tested | 300 seeds validated navigable. |
| Roguelike blessings + bargain curses (run-only) with end-of-run summary | Implemented | |
| Dungeon modifiers (7) | Implemented | |
| Difficulty tiers Story → Abyssal with unlock rules | Implemented | |
| Enemy families: Hollowborn (4 + mini-boss), Duskmeadow wildlife (3) | Implemented | |
| Boss: Veyra — 3 phases, telegraphs, adds, nova, Break gauge | Tested | |
| Quests: Chapter 1 (5), Chapter 2 (6), Chapter 3 (3) — kill, gather, craft, tower, arena, labyrinth, nightmare, raid objectives | Implemented | |
| Endless Tower (short floors, ×1.12 per floor, Veyra every 5th floor, best floor ranked) | Tested | Unit test of floor progression + scaling. |
| Challenge Arena (escalating waves, champion waves, no respawn, revive allies, ranked) | Tested | Unit test + live bot run (4 waves, persisted leaderboard). |
| Ancient Labyrinth (maze generator, caches, Oruk boss) | Tested | 60 seeds validated navigable. |
| Nightmare Rift (3 hostile modifiers, ≥Hard, 10-min bonus cache, needs cleared Hard Rift) | Implemented | |
| Raid: Eclipse Throne, 4-8 players, Nyx Aurelion (Total Eclipse safe-circle mechanic, adds, 3 phases, enrage 8 min, wipe rules) | Tested | Mechanic + wipe unit-tested. Never played by 4+ real people — tuning unverified. |
| Leaderboards (tower, arena, level; Normal/Hardcore separate) | Tested | |
| Eclipse Dimension (mixed enemy families, Eclipse Pressure every 45s: enemy damage +8%/stack, loot +10%/stack, double shards) | Tested | |
| PvP | Not Started | Optional in the master prompt; not planned yet. |
| World boss public event (Gloomheart in Duskmeadow, every ~5 min, scales with players) | Tested | Spawn tested; kill reward path shares the normal boss code. |
| Season framework (Season 1 "The Ember Tithe"): Ember Shards, Season XP, 20-tier cosmetic/convenience reward track, archive, documented permanent vs reset | Tested | |
| Weekly events (4 rotating) + 3 rotating weekly objectives | Tested | |
| Cosmetic auras | Implemented | |

## Social
| Feature | Status | Notes |
|---|---|---|
| Parties (invite/accept/leave/kick, leader transfer + hand-off, shared Rift, HP scaling) | Tested | Unit test for shared Rift entry. |
| Party finder (post/browse/request to join) | Implemented | Browser-checked. |
| Chat: local, party, guild, whisper; block; report → audit log; repeat-spam auto-mute | Tested | |
| Guilds: found (500g), invite, ranks, kick rules, MOTD, guarded leader transfer, guild XP/levels, activity log, guild chat | Tested | Guild vault deliberately not built yet (needs per-rank limits + audit UI). |
| Leaderboard endpoint (Normal/Hardcore) | Implemented | `GET /api/ladder`; no UI yet. |

## UX
| Feature | Status | Notes |
|---|---|---|
| Login/register, character create/select/delete | Tested | |
| HUD, skill bar, target frame, boss bar, minimap, big map | Implemented | |
| Panels: inventory, skills, passives, character, quests, codex, party, settings, NPCs | Implemented | |
| Remappable keys, graphics quality, UI scale, damage-number toggle | Implemented | |
| Touch controls (joystick + buttons) | Implemented | Only checked in an emulated phone viewport. |
| Thai / English UI | Tested | UI chrome + classes, 72 skills, quests, enemies, activities, blessings, modifiers, achievements, crafting in Thai (coverage test). Item names and stat labels still English. |
| Audio (synthesized SFX + ambience, volume settings) | Implemented | No recorded music/voice. |
| Pixel-art skill VFX (per-skill effects, light buffer, dither fades, hit-stop) | Implemented | Checked by screenshots in Chromium for all 7 classes. |
| Concept UI (HUD + windows) and glossy icon engine | Implemented | Matches the concept layouts; painted art in the concepts is not reproducible in code. |
| Login calendar, Shop, Benefits, Renown, Awakening, Emblems, Wardrobe, Mounts, Astral Wish | Tested | Unit tests + Chromium; in-game currency only. |
| Auto play (combat, potion, loot, quest travel) + AFK camp | Implemented | Auto-quest verified end-to-end in Chromium; AFK rates not yet tuned with real players. |
| PvP arena (5v5), friends list | Not started | Shown in concept 09/10; needs design. |
| Pixel-art sprites (classes, NPCs, enemies, bosses, minions) + enemy/boss effects | Implemented | Generated in code; checked via sprite sheet and in-game screenshots (Chromium only). |

## Backlog (prioritised)
- **B-1 Deployment**: HTTPS host, domain, TLS proxy, managed Postgres backups. Blocked on the owner choosing a host.
- **B-3 Economy telemetry**: gold sources/sinks dashboard, price history.
- **B-4 Endgame**: Endless Tower (reuse Rift generator with floor scaling), raids (4-8), world boss, arena.
- **B-5 Life skills**: mining/fishing/cooking/alchemy recipes, housing, pets.
- **B-6 Live ops**: editing whole new content records (not only tuning) from the console; patch-notes page.
- **B-7 Audio & art pass**: recorded music; hand-drawn tiles/environment art (characters and effects are now pixel art).
- **B-8 Netcode**: binary encoding (MessagePack) and per-entity update rates for very crowded zones.
- **B-9 Localization**: Thai for item names, affix/stat labels and NPC dialogue.
- **B-10 More tests**: party + reconnect integration tests, cross-browser runs, larger load tests.
