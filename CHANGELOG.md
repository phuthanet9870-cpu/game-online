# Changelog

## [0.15.0] — 2026-11-23 — Ranked Arena and the 350-skill library
### Added
- **Ranked Arena (PvP)** at Arena Master Brann:
  - 1v1, 3v3 and 5v5. Best of 5 rounds (first to 3), 90-second rounds with a 5-second preparation phase.
  - Teams are balanced by snake draft on rating. Missing players are filled with class-based AI champions after a short wait.
  - Elo-style RP with a win-streak bonus and six tiers (Bronze → Astral), plus a PvP leaderboard.
  - Rewards in gold and dust. Leaving mid-match counts as a loss and is audited.
  - Player damage is normalised (×0.35) and healing reduced (×0.6). Arena deaths are never Hardcore deaths and drop nothing.
  - Live scoreboard HUD, blue/red name colours, a result screen, and auto-combat that targets the other team.
- **Skill library expanded to 40 active + 10 ultimate per class** (350 skills; 266 new), each with English and Thai names and descriptions. Players still equip 8 active + 4 ultimate from this pool.
  - New engine mechanics:
    - Lines and movement: beam (line, optionally channelled), blink, pull, swap.
    - Ground and timing: trap (armed until an enemy steps in), echo (replays the skill's damage), debuff (area stat marks such as damage taken, enemy damage, enemy speed).
    - Status and projectiles: detonate (consumes a status for burst damage), returning projectiles, splitting projectiles, execute damage.
    - Buff stats: reflect and stealth (enemies lose track of you).
  - New minions: Spirit Hound and Great Spirit Bear (Ranger).
  - Visuals:
    - 73 new glyphs, plus mechanic badges on icons (echo, trap, pull, detonate, return, split, debuff, blink, swap, cleanse, beam, execute).
    - Beam and trap rendering, cast visuals for each new mechanic.
    - A per-skill cast signature: a shape × particle × placement combination that is unique within each class.
  - Skill book: search, role filters (Damage / Area / Control / Defense / Support / Movement / Summon / Trap), "unlocked only", unlock counts.
### Verified
- 88 tests, including:
  - The PvP match flow (rounds, RP, Hardcore safety, AI fill, forfeits).
  - 40 + 10 skills per class, with no two skills sharing a mechanic fingerprint or a name.
  - Thai text for every skill.
  - A cast-and-simulate smoke test for all 350 skills, and targeted tests for each new mechanic.
- Chromium runs:
  - Arena 3v3 with AI fill and the live scoreboard.
  - Skill book at level 100.
  - Mage casting Flame Lance (beam), Magma Snare (trap), Static Swarm (pull), Combustion (detonate) and Falling Sun.
### Honest notes
- "Unique" is enforced by a mechanic fingerprint: effect types, their switches, element and status. Skills share building blocks, and balance numbers are a first pass.
- Online PvP has only been tested in-process and offline (AI fill). It has not yet had a live multi-client session.

## [0.14.0] — 2026-11-22 — World expansion, enhancement, guild discovery, GM tools
### Added
- **10 farm zones, levels 1–100** (Duskmeadow → Ashen Highlands → Starfall Wastes → Sunken Mire → Frostpeak Tundra → Sandsea Dunes → Fungal Hollows → Obsidian Abyss → Celestial Gardens → Eclipse Throne). Each zone is 220×150 tiles (about 4× the old open-world area), chained by gates, with its own terrain palette, obstacles, gathering nodes, fishing, level band rising west → east, 3 field bosses and an Overlord.
- **540 procedural monsters** (10 body archetypes × 5 regional variants × 10 zones + 40 bosses), each with its own name (English + Thai), colour, element, resistances, size and attacks. They are variants built from shared body archetypes, not 540 separately drawn designs.
- **45 new item bases**: 28 runes, 12 relics, 10 rings/necklaces and 6 armour pieces. Zones favour their own runes, and loot is slot-weighted so runes do not crowd out gear.
- **Enhancement +1..+15** (Forgemaster Kael), using the rules the player chose: +1–+6 always succeed; a failure at +7–+11 only costs materials; a failure at +12–+15 drops the item one level. Items never break. Results are saved immediately and audited.
- **Bonus option slots** unlock at +5 / +10 / +15. Runesmith Sefa rerolls them; any slot can be locked, each lock raises the cost, and at least one slot must stay unlocked.
- **One NPC per service**, with no combined vendors:
  - Previously combined NPCs are now separate: forging, enchanting, salvage, selling, potions, alchemy, cooking, companions, bag tailor, enhancement and bonus options.
  - New NPCs for the guild registrar, stylist, wish shrine, awakening, shop and the Waymaster (paid travel to the west gate of any zone you are strong enough for).
  - Town rebuilt at 100×72 tiles with two shop rows and a grand plaza.
- **Guild discovery**:
  - Six categories, a searchable guild browser and a guild profile (category, description, minimum level, open recruitment).
  - Join requests with an officer accept/decline queue. Requests to other guilds are cleared when you join one.
  - Rankings by guild level, total power or members.
- **Item discard** (single or multi-select, with confirmation). Items are destroyed rather than dropped on the ground, so the trade and bound-item rules cannot be bypassed. Discarded items are written to the audit log.
- **NPC windows** in the reference style:
  - Trainer: portrait, passive paths, points, partial/full reset with gold or token, info.
  - Carpenter: categories with counts, item rows with size and cost, preview, materials.
- Multi-select sell/store, GM console (`/gmadminonline01`, admin role only online) with a GM button, a monster browser per zone and teleport to every zone. Also friends, bag expansion, auto settings, collapsible HUD and pixel terrain.
### Changed
- Empty open-world zones no longer simulate at 30 Hz; they only advance respawn timers. This keeps the server cost of 10 large zones low (about 0.1–0.25 ms per tick for an occupied zone in tests).
- Field bosses respawn after 4 minutes and Overlords after 10 minutes.
### Fixed
- Out-of-range inventory indexes in batch actions are now ignored instead of clamped to the last slot, which could have hit an item the player had not picked.
### Verified
- 73 tests (new: guild discovery, discard, enhancement rules, bonus locks, 10-zone connectivity and level bands, 500+ bestiary with Thai names and valid summons, town NPC reachability).
- Chromium runs: Trainer/Carpenter/Guild windows, discard, enhancement to +9 with failures and a bonus slot, Waymaster, teleports into the new zones with spawned monsters. No page errors.
- Not yet: PvP 5v5 arena. Firefox and Safari untested.

## [0.13.0] — 2026-11-22 — Concept UI, new systems, auto play
### Added
- **Concept UI** (from the 10 concept images): gold-on-violet ornate theme with Cinzel display font; HUD laid out as in the concepts — portrait card (HP / resource / secondary bars, Combat Power, Renown badge, portrait frame), party box, feature menu with notification dots, location + round minimap, quest/activity tracker, tabbed chat, 20-slot hotbar (Active 1~8, Ultimate 9~12, Items/Utilities 13~20), round menu, EXP line with three currencies.
- **Glossy vector icon engine** for every item base, material, consumable, all 84 skills (glyph + element tile + motif so no two skills look alike), menus, currencies and rewards.
- Windows rebuilt per concept: Inventory (paper doll, filters, Equipped vs Selected comparison with stat deltas, cosmetic layers, materials, collections), Crafting & Life Skills, Passive Tree & build summary, Social & Community (auction rows with icons, guild, party & trade), roguelike reward cards, dungeon run card, raid-style boss bar with phases, Character Creation stage.
- **Appearance**: hair colour and outfit tint at creation (server-validated, visible to everyone).
- **New systems** (server-authoritative, persisted, in-game currency only — no real money): 28-day cumulative login calendar; Shop (gold / Astral Dust / season shards, daily limits); level & achievement Benefits; **Renown** (VIP-style badge earned by playing; perks are convenience only); **Awakening** (10 levels of damage/life); **Emblems** (8, unlocked by achievements, 3 equipped); Wardrobe (costumes, portrait frames); **Mounts** (+30–35% speed out of combat, any fight dismounts); **Astral Wish** (cosmetics/mounts/materials, published odds N 60% / R 28% / SR 10% / SSR 2%, SSR pity at 60).
- **Auto play**: AUTO button (auto-combat with target choice, approach, basic attacks and a skill rotation that saves ultimates for bosses/elites/packs), auto-potion threshold, auto-loot by minimum rarity, ▶ on a quest to travel there (A* in-zone, zone-to-zone via gates), accept/hand in automatically and hunt; any manual input pauses it. **AFK camp**: logging out in the open world pays a capped (10 min–12 h), lower-than-active reward on the next login.
### Fixed
- The client dropped appearance fields after the first snapshot (its tuple expansion was out of sync with the server's).
- Meta rewards could be written to a stale copy of the account state, letting the daily login be claimed twice (caught by a new test).
### Verified
- 60 tests (6 new: login, shop, wish pity, awakening, emblems/benefits, AFK camp); Chromium screenshots of HUD, inventory, crafting, passive tree, creation, shop, wish, mount; an auto-quest run that accepted a quest, travelled to Duskmeadow and progressed it 4/10 unaided. Not done: PvP 5v5 arena and a friends list (no backing systems yet); Firefox/Safari untested.

## [0.12.0] — 2026-11-22 — Pixel-art characters, enemy effects, skill polish
### Added
- **Pixel sprites** (`apps/client/src/sprites.ts`) on the same pixel grid as the effects: all 7 classes (front / side / back views, 4-frame walk, idle, wind-up → strike → follow-through, per-class headgear and weapons), NPCs, every enemy family (hooded Hollowborn with weapons, beasts, golems, imps, crystal seer, the Gloomheart tree, wisps, starlings) and bosses (Veyra's umbral wings, Nyx's eclipse halo, crowns), minions (skeletons, Bone Colossus, wraiths, hawks, turrets, sentinels); white hit-flash frames; dithered pixel shadows. Sprites are generated in code and cached per pose.
- **Enemy effects**: telegraphs stay red but are now pixel danger zones with an advancing front and element motes; when they resolve they become the promised blow (red crescent for melee/cleave, cracks + debris for slams, element bursts for eruptions). Enemy shots show their element inside a pulsing red rim. Boss phase changes (eclipse pillar + shockwave + freeze) and Break (shattering shards) have their own effects.
- Skill polish: chain lightning draws arcs between consecutive hits; dashes leave trails in their skill's colour (shadow smoke, lightning blink, holy charge); Drain Life pulls blood motes into the caster; Withering Hex leaves a rotating hex sigil; marked targets get a crosshair; assassin melee cuts in blood red; Epoch collapses with a time pillar and cracks; projectile explosions keep their skill id.
### Fixed
- Area effects were drawn as squashed ellipses although hit areas are true circles; area-bound effects are now drawn at their real size and shape.
- A ranger summon could crash the renderer (palette with too few steps); all palettes are resampled to 8 steps.
### Verified
- Typecheck + 54 tests; all 7 classes casting every slot in Chromium with no page errors; enemy telegraph/impact/projectile harness; sprite sheet of every class pose and enemy. Firefox/Safari still untested.

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
