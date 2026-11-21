# THE POWER: ECLIPSE

2D pixel-art action MMORPG — **Phase 1: Core Combat Prototype** (offline web build).
Master specification: [`prompt.md`](prompt.md) · Locked rules: [`docs/GAME_RULES.md`](docs/GAME_RULES.md) · Status: [`docs/DEVELOPMENT_STATUS.md`](docs/DEVELOPMENT_STATUS.md)

## How to Run
Requires Node.js 20+ (tested on 22).

```bash
npm install          # installs esbuild (dev only)
npm run build        # → dist/the-power-eclipse.html (single file, ~90 KB)
```
Open `dist/the-power-eclipse.html` directly in a browser (works from `file://`, no server needed).

## Tests
```bash
npm run validate     # game-data integrity (61 checks)
npm test             # unit + AI + 10-minute soak (node:test)
npm run smoke        # headless Chromium plays the built file (needs Playwright installed)
npm run check        # all of the above
```

## Controls
| Key | Action |
|---|---|
| WASD / Arrows | Move (8 directions) |
| 1 · J · Left click | Basic Attack (click aims at cursor, hold to repeat) |
| 2 · K | Triple Slash |
| 3 · L | Guard Break |
| 4 · I | Counter Slash |
| Space · Shift+2 | Dodge |
| F1 · P · M · C | Debug overlay · Pause · Sound · Combat log |

## Layout
```
client/        web client — src/core (pure simulation, server-portable), src/render, src/ui, index.html
game-data/     data-driven definitions (weapons, skills, powers, monsters, maps, config)
tools/         build + data validator
tests/         unit (node:test) + browser smoke (Playwright)
docs/          rules, roadmap, status, decisions, phase reports
```
