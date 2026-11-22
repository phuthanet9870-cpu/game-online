# Changelog

## [0.11.0] — 2026-11-22 — Pixel-art skill effects
### Added
- New client VFX engine (`apps/client/src/vfx.ts`), our own effects in a hand-made pixel-art VFX style (studied from the MIT pixelfx project's conventions; no code or art copied): effects rasterise into a low-res pixel buffer (1 art pixel = 2 world units) upscaled nearest-neighbour; an opaque COLOR buffer whose fades use a 4×4 ordered dither (only smoke/vapour is translucent) plus an additive LIGHT buffer; dark→bright palette ramps per element; particles step at 120 Hz.
- Effects follow each skill's ability: crescent slashes (white rim cooling down a steel ramp, dithered tail, tip glint, sparks); fireballs with flame tongues cooling to smoke; faceted ice shards and ice-spike eruptions that melt and drip; jagged lightning bolts from the sky and crackling orbs; holy light pillars; void orbs and writhing shadow tendrils; bubbling poison puddles; arrow rain; spinning blade crescents for cyclones; chronomancer clock dials (hands run backwards for rewinds); summon portals, hexagonal barriers, buff auras, taunt shout rings, dash speed lines; anticipation sigils that gather energy before delayed strikes (the meteor visibly falls onto its mark).
- Hits: element-specific debris (sparks with gravity and floor bounce, embers, flakes, drips, wisps), hit flash, crit flare; heavy hits freeze the frame for 0.07-0.12 s with a small shake. Status effects show burn embers, poison bubbles, bleed drips, frost flakes, shock arcs, curse wisps.
- World effects now carry the casting skill id (`type@skillId`) so the client can pick a skill's signature look; enemy telegraphs keep their readable red style.
### Verified
- Typecheck + 54 tests pass; Chromium screenshots of all 7 classes casting every slot; ~59-60 fps in headless Chromium while casting ultimates. Firefox/Safari still untested.

## [0.10.0] — 2026-11-22 — Onboarding
### Added
- 10-step guided tutorial tracked by the server (each step completes only when the real action is observed), gold rewards totalling 300, skippable, Thai/English; existing characters skip it automatically.
- "Next goal" card: current tutorial step, then the active quest's progress or the next quest to accept.
- First-run guidance: the Rift Gate pre-selects Story until your first clear.
### Changed
- Bosses inside instances no longer heal back to full when they lose their target (open-world leashing unchanged). Simulated starter-gear Veyra on Normal: 10/14 → 10/10 wins, 5.0 → 2.7 deaths.
- No gold lost on death below level 5.

## [0.9.0] — 2026-11-22 — Phase 7 complete
### Added
- **Starfall Wastes** (levels 20-30) beyond the Ashen Highlands: crystal desert, **Shardborn** family (Shard Stalker, Prism Seer, Glass Colossus, Starling Swarm), Starglass clusters (Mining 6+), Starbloom herbs, legendary Starglass forging (Smithing 8) and Starbloom Tonic.
- **Chapter 4** (4 quests): the Wastes, Glass Giants, a treasure hunt and furnishing your Hearth. Quest rewards can now include materials.
- **Treasure hunting**: Treasure Maps drop rarely in the open world; reading one marks a search circle; digging gives warm/cold feedback and the cache holds gold, dust and rare+ gear. The exact spot is kept server-side and redacted from client payloads.
- **Hearth housing**: Carpenter Odo and Hearthstone Lane in Lumenhold; personal instanced plot; 13 furniture pieces incl. functional vault chest, alchemy table, anvil and training dummy, and trophies gated by achievements; placement validated server-side (bounds, overlap, doorway, reachability); visitor permissions private/party/guild/public; /visit name.
- Transactions can now include account records, so furniture purchases (gold + account) commit atomically.
- 5 new tests (52 total).

## [0.8.0] — 2026-11-22 — Phase 7: Expansion (partial)
### Added
- 7th standalone class **Chronomancer**: Flux resource + Sand finisher resource; Time Echo (every third skill replays its damage 1s later at 50%); 8 Active + 4 Ultimate skills; passive tree with the Closed Loop keystone; Hourglass/Chrono Staff weapons; Thai text.
- **Eclipse Dimension** activity (level 15): every enemy family at once; Eclipse Pressure stacks every 45 seconds (+8% enemy damage, +10% loot per stack); double Ember Shards; two achievements.
- **Guild vault**: 30 slots at the Astral Vault, daily withdrawal limits by rank (member 3, officer 20), every move logged, guild + character saved in one transaction.
- **Companions**: Lumi Fox, Moon Owl, Ember Sprite (adopt at the Quartermaster) — cosmetic followers that widen gold auto-pickup and item reach; no combat power.
- **Fishing**: shore spots in Duskmeadow and lava pools in the Highlands (Fishing 3+), server-timed bite window, Fishing profession, Golden Carp rare catch, three new meals.
- Balance harness gained starter-gear scenarios; Veyra re-tuned to 3800 life / 15 power so a first clear with starter gear is possible (Story is the gentle option).
- 6 new tests (47 total).
### Not done in this phase
- Housing and a third region (backlog B-11).

## [0.7.0] — 2026-11-22 — Live content editor
### Added
- Staff "Content" tab: tune skills (cost, cooldown, cast time, damage multiplier), enemies (life, power, armor, XP, speed), weapon power and loot (drop chance, elite rolls, rarity weights) without a redeploy. Validation with ranges, preview diff, versioned publish with required note, rollback to any version or to the shipped baseline.
- Patches apply on top of a frozen baseline (no compounding) on the server and are pushed to every client so tooltips match. Migration 005.
### Fixed
- Rolling back live config could fail on the one-active-version index, leaving the old config active. Activation now runs as two statements in one transaction (found by the live admin test).

## [0.6.0] — 2026-11-22 — Polish & balance
### Changed
- Boss balance tuned with a new simulation harness (`npm run balance`, bot players with level-appropriate gear and mechanic awareness). Enemy life/power now scale with a gentle exponential term per level; Veyra 3200→4800 life, Oruk 2600→3400, Nyx 5200→10500 (power 20→17). Simulated results: Veyra solo 9/10 wins ~58s; party of 3 on Hard 10/10 ~65s; Oruk solo 9/10 ~97s; Nyx 4-player Normal and 6-player Hard roughly 2-3 minutes with 70-80% win rates. These are bot numbers, not human playtests.
- Netcode: delta-compressed snapshots (static entity data, projectiles and areas sent only when new or changed) and interest radius 1100px — measured field bandwidth 71.6 → 30.1 KB/s per player, Rift 25.2 → 14.1 KB/s. Input sequence numbers + server acknowledgements: the client now replays only unacknowledged movement on top of the authoritative position.
### Added
- Procedural Web Audio sound effects (hits by element, crits, casts, dodge, potion, loot by rarity, gold, level up, boss phase, warnings) and per-zone ambience; volume settings.
- Thai for item names, legendary powers, rarities, slots, stat labels, common panel text and frequent server messages.

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
