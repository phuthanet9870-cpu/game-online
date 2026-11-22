# Feature Matrix

Statuses: `Not Started` · `In Progress` · `Implemented` (code exists, manually exercised) · `Tested` (covered by automated tests or the e2e bot) · `Released` (deployed to a public HTTPS URL — nothing is Released yet).

Last updated: 2026-11-22 (v0.2.0 — Phase 4 MMO systems added on top of the Phase 1 vertical slice).

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
| Admin panel / live-ops tools | Not Started | Backlog B-6. |
| Observability | In Progress | Structured JSON logs + minute metrics; no Prometheus/Sentry yet. |

## Classes, skills, builds
| Feature | Status | Notes |
|---|---|---|
| Six standalone classes, no evolutions | Tested | Each kills enemies in automated combat test. |
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
| Crafting professions, gathering beyond herbs, housing, pets | Not Started | Herb gathering only. Backlog B-5. |

## World & content
| Feature | Status | Notes |
|---|---|---|
| Shared Town (Lumenhold) with NPC services + training dummies | Tested | |
| Open world zone (Duskmeadow) with respawning packs, level bands 2-9 | Implemented | |
| Seeded procedural Rift: rooms, branches, elite/treasure/shrine/rest/event rooms | Tested | 300 seeds validated navigable. |
| Roguelike blessings + bargain curses (run-only) with end-of-run summary | Implemented | |
| Dungeon modifiers (7) | Implemented | |
| Difficulty tiers Story → Abyssal with unlock rules | Implemented | |
| Enemy families: Hollowborn (4 + mini-boss), Duskmeadow wildlife (3) | Implemented | |
| Boss: Veyra — 3 phases, telegraphs, adds, nova, Break gauge | Tested | |
| Quests: Chapter 1 (5 quests) + Chapter 2 hook | Implemented | |
| Endless Tower, Nightmare Dungeon, Labyrinth, Raids, Eclipse Dimension, Arena | Not Started | Backlog B-4. |
| World boss public event (Gloomheart in Duskmeadow, every ~5 min, scales with players) | Tested | Spawn tested; kill reward path shares the normal boss code. |
| Seasons & weekly events | Not Started | Backlog B-6. |

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
| Thai / English UI | Implemented | UI chrome localized; content text (skills/items/quests) English only. |
| Audio | Not Started | Backlog B-7. |

## Backlog (prioritised)
- **B-1 Deployment**: HTTPS host, domain, TLS proxy, managed Postgres backups. Blocked on the owner choosing a host.
- **B-2 Guild vault**: per-rank withdrawal limits, audit view.
- **B-3 Economy telemetry**: gold sources/sinks dashboard, price history.
- **B-4 Endgame**: Endless Tower (reuse Rift generator with floor scaling), raids (4-8), world boss, arena.
- **B-5 Life skills**: mining/fishing/cooking/alchemy recipes, housing, pets.
- **B-6 Live ops**: season framework, weekly events, admin panel with RBAC + MFA, content publishing/rollback.
- **B-7 Audio & art pass**: sound effects/music, sprite art replacing procedural drawing.
- **B-8 Netcode**: input sequence numbers for exact reconciliation; delta-compressed snapshots.
- **B-9 Content localization**: Thai translations of skill/item/quest text.
- **B-10 More tests**: party + reconnect integration tests, cross-browser runs, larger load tests.
