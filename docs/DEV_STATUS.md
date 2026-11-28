# Development status

The single place that says what exists, what works, and what is still to do. Update it with every batch of work.
Statuses: **WORKING** (checked by a test or a bot run), **PARTIAL** (some of it exists), **BROKEN**, **MISSING**, **UNTESTED**
(exists, not exercised here), **OPTIONAL** (not approved). "Evidence" names the test or bot that checked it.

Last update: master-prompt batch 1 (Phase 1 foundation + first Phase 2 systems).

## Counts (from the code, `node /tmp/cnt.ts`-style queries on `shared/`)

| What | Count | Note |
|---|---|---|
| Jobs | 59 | Novice 1, first 6, **second 13** (Bard and Dancer are two jobs), High 7, transcendent 13, expanded 6, third 13 = 59. The "58" count came from treating second jobs as 12. |
| Skills | 538 rows | every skill of every tree is usable (`shared/rules/classx.test.ts`); cut skills are refunded once (`refundUnready`) |
| Items | 491 | +3 variant materials this batch; 18 retired pet items kept for old saves but never dropped or sold |
| Cards | 90 | |
| Maps | 15 | 3 Tower floors |
| Monster species | 43 | + 5 variants each (Elite, Golden, Cursed, Ancient, Shiny) |
| NPCs | 24 | |

## Systems

| System | Status | Evidence / note |
|---|---|---|
| Accounts: register, login, logout, sessions, rate limits | WORKING | `server/src/api.test.ts`, smoke bot; login 8 tries / 5 min per user+IP, register per IP per hour |
| Duplicate login (old session saved, then kicked) | WORKING | `MapRoom.enter` save-then-auth; covered by bots relogging (`affix.ts`) |
| Autosave (30 s) + save on leave + graceful shutdown | UNTESTED | code present (`MapRoom` autosave, Colyseus shutdown runs `onLeave`); not crash-tested here |
| Characters: create / delete / slots / looks | WORKING | create bot paths in smoke; name rules in tests |
| Stats, Base/Job EXP, levels, death penalty (1 % of next level) | WORKING | `rules.test.ts`, grind bot |
| Jobs (59) and job change NPCs | WORKING | jobchange bot (first jobs); classx bot (GM job change + full trees); NPC paths for expanded / third jobs UNTESTED in a dialog run |
| Skills: tree, points, cast, cooldown, delay, SP/ammo cost | WORKING | `skill.test.ts`, `classx.test.ts`, classx bot (all 23 sampled jobs learn their full tree) |
| Generic skill engine (`shared/classx/`) | WORKING (simplified) | numbers are ours, not balanced against each other yet |
| Combat formulas (Renewal ATK/MATK/DEF/HIT/FLEE/crit/ASPD/element/race/size) | WORKING | `battle.test.ts`, `cardfix.test.ts`, `ranged.test.ts` |
| Status effects (Stone ... Bleeding) + buffs | WORKING | `status_change.test.ts`, status bot needs a Postgres dev schema (UNTESTED here) |
| Weight 50 % / 90 % rules | WORKING | `weight.test.ts`, `statusweight.test.ts` |
| Guns, throwing stars, kunai | WORKING | `client/scripts/weapons.ts`: revolver shots spend bullets, Piercing Shot and Kunai Toss hit (6 runs in a row) |
| Items, equipment, shops, cards, refine +20 | WORKING / UNTESTED | items bot WORKING; cards bot needs a forced drop rate; refine bot needs a Postgres dev schema |
| **Monster variants** (Elite, Golden, Cursed, Ancient, Shiny) | WORKING | `variants.test.ts`; `client/scripts/variants.ts`: synced variant + HP, Elite pays 3x EXP, Golden purse, Ancient fragment |
| **Random equipment affixes** | WORKING | `affix.test.ts`; `client/scripts/affix.ts`: roll by grade, worn (status), reforge refused without materials (nothing taken), lock kept, saved across relog |
| **Reforge** at Forgemaster Brann (dialog + `Msg.reforge`) | WORKING (message path) / UNTESTED (dialog path) | the dialog calls the same `MapRoom.doReforge` |
| Loot beam by grade / affixes | UNTESTED | client only, not seen on screen yet |
| Monster AI, bosses, MVP, tombs | WORKING | `mobai.test.ts`, `mvp.test.ts`, boss bot; minibosses/devo/bossfeel bots need a Postgres dev schema |
| Tower | PARTIAL | 3 floors of a 100-floor goal; floor data model exists (`shared/tower.ts`) |
| Auto-hunt | WORKING (basic) | auto bot removed earlier; `autoplay.ts` in client; settings UI is minimal |
| Party (12), friends (40), whisper, chat | WORKING | friends bot; party bot needs a Postgres dev schema |
| GM system | WORKING | gm bot; passphrase only from the server's env. The **Artifact** build embeds its own passphrase in the page (single-player, separate from production) |
| Localization en / th | PARTIAL | UI keys complete (i18n-check bot); NPC dialogue and data names are English |
| Artifact (single-player, PGlite) | WORKING | built and published; multiplayer features need the real server |
| Docker / Render deploy | UNTESTED | no Docker daemon here |
| Load / stress tests | MISSING | `client/scripts/load.ts` exists, not run at scale |

## Not started (from the master prompt), in the order planned

1. Phase 2 rest: combat feedback/VFX pass, equipment set bonus, salvage, stat/skill reset, build presets, training dummy + DPS meter, auto-hunt settings, adventure book, beginner flow.
2. Phase 3 PvP: duel, arena, PvP ruleset, ranked, matchmaking.
3. Phase 4 guilds and guild war.
4. Phase 5 quests, world events, raids, roguelike dungeon, runes, Tower data framework to 100 floors.
5. Phase 6 trade, auction house, storage, mail.
6. Phase 7 collections, achievements, titles, cosmetics, seasons, analytics.

Out of scope by the owner's rule: life skills, farming, fishing, mining, cooking, alchemy, housing. Pets: OPTIONAL (not approved).

## Known issues

- Many bots (`refine`, `status`, `party`, `minibosses`, `devo`, `bossfeel`, `clickskill`) plant data straight into a Postgres dev schema
  (`ro_dev`) and refuse to run against PGlite. They were not run in this environment.
- Skill numbers of the generic engine are first drafts: no class-vs-class balance pass yet.
- Variant / affix numbers are first drafts (`VARIANTS`, `AFFIXES`, `AFFIX_CONF`); no caps on summed affixes yet.
