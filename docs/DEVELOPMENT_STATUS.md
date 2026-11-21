# DEVELOPMENT STATUS

- **Current phase:** 1 — Core Combat Prototype · build `0.1.0-phase1`
- **State:** Phase 1 scope implemented and tested; **waiting for owner acceptance (gate)**. Phase 2 has not started.
- **Last update:** 2026-11-21

## [IMPLEMENTED] (code + automated tests in this repo)
| System | Files | Tests |
|---|---|---|
| 8-direction movement, speed cap, tile collision + slide | `client/src/core/simulation.js`, `tilemap.js`, `math.js` | `movement.test.mjs` |
| Dash / Stamina / i-frames / cooldown | `simulation.js`, `resources.js` | `movement.test.mjs`, `ai_life.test.mjs` |
| Health component, damage pipeline with trace | `resources.js`, `damage.js`, `stats.js` | `combat.test.mjs` |
| Hitbox (arc) / Hurtbox (circle), LOS | `hitbox.js`, `tilemap.js` | `combat.test.mjs` |
| Sword basic + Triple Slash / Guard Break / Counter Slash | `game-data/skills/weapon_skills.json`, `simulation.js` | `combat.test.mjs` |
| Status effects (Stun w/ DR, Guard Broken, Spawn Protection) | `statusEffects.js`, `status_effects.json` | `combat.test.mjs` |
| Character state machine + death recap + respawn | `stateMachine.js`, `simulation.js` | `ai_life.test.mjs` |
| Monster AI (8 states, telegraph, leash/reset, respawn) | `monsterAI.js`, `monsters.json` | `ai_life.test.mjs`, soak |
| Content data + validator (6 weapons/18 skills, 6 powers/150 skill names, 32 core maps) | `game-data/**`, `tools/validators/validate-data.mjs` | 61 checks, `soak_data.test.mjs` |
| Web client: renderer, placeholder sprites, VFX, HUD, 20-slot hotbar, debug overlay, audio, touch (experimental) | `client/src/render/*`, `client/src/ui/*`, `client/index.html` | `tests/smoke/browser-smoke.mjs` (16 checks) |

## Not implemented (by design, later phases)
Server/auth/persistence (P2) · other 5 weapons, Powers runtime, Auto, GM HUD, hotbar drag/drop & keybind UI (P3) · cities/farm maps/dungeons/PvP (P4+) · item catalog (P2 seed → P7)

## Known issues
- Touch controls are a test aid only; the mobile UI is not designed (spec §8).
- Pixel font for damage numbers comes from Google Fonts; offline it falls back to a system monospace.
- Monster pathing is direct steering with side-step retries — it can get stuck on concave obstacles (rare on this map). Real navigation arrives with real maps (P4).
- Balance values are untested by players (`[TUNING]`).
