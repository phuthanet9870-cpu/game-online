# Content Authoring Guide

All content is data with stable string IDs in `packages/shared/src/data/`. Never rename an ID that has shipped: saves reference IDs.

- **Skill** (`skills.ts`): add an entry with `cls`, `kind` (`active`/`ultimate`), cost, cooldown, cast, targeting, `unlockLevel`, `icon`, and an `effects` list built from primitives: `melee`, `projectile`, `area`, `dash`, `buff`, `heal`, `barrier`, `summon`, `gain`, `taunt`. Tooltips are generated from the same data.
- **New class**: add the id to `CLASS_IDS` (`types.ts`), a `ClassDef` in `classes.ts`, its skills, a tree in `passives.ts`, and a starter weapon in `loot.ts`. The passive layout positions six classes on a ring; a seventh requires updating the ring angle math only.
- **Passive node**: add to a branch in `CLASS_TREES` or `CENTRAL_RING`; mods use stat keys documented in `stats.ts` (`statLabel`). Keystones set `flags` that combat code reads — new flags need code in `world.ts`/`stats.ts`.
- **Item base / affix / legendary power**: `items.ts`. Affixes declare allowed slots and per-level scaling.
- **Enemy / boss**: `enemies.ts`. Attacks use kinds `melee`, `projectile`, `slam`, `nova`, `summon`, `eruption`, `charge`, `cleave`; `phase` gates attacks to boss phases.
- **Dungeon modifier / blessing**: `dungeon.ts`. **Quest**: `quests.ts` (objective kinds: `kill_family`, `kill_enemy`, `boss`, `gather`, `elite`, `clear_tier`).
- After changes: `npm run typecheck && npm test`. The content test enforces 8+ actives / 4+ ultimates per class, unique skill IDs, and symmetric passive links; the dungeon test validates 300 seeds.
