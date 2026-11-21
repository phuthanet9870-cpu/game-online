# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

npm workspaces monorepo, Node 22. Run everything from the repository root.

- `npm install`: install all workspaces.
- `npm run dev`: game server on :2567 (tsx watch) plus the Vite client on :5173. Open http://localhost:5173.
- `npm run build`: build the client into `packages/client/dist`.
- `npm start`: production mode. One process on `PORT` (default 2567) serves both the built client and the game server. Run `npm run build` first.
- `npm run typecheck`: `tsc --noEmit` over every workspace. There is no linter.
- `npm test`: all Vitest tests.
- One file: `npx vitest run games/world/src/shared/pathfinding.test.ts`. One test: add `-t "routes around walls"`.

## Architecture

The repository is a host for many games. The host knows nothing about any particular game.

- `packages/core`: only the contracts. `GameServerModule` lists a game's Colyseus room classes. `GameClientModule` has a `start()` that joins a room, renders into a container, and returns a teardown function.
- `packages/server`: the Colyseus 0.18 + Express host. `src/games.ts` is the server registry. `createServer` in `src/app.ts` registers every game's rooms and fails if two room names collide. It also serves `packages/client/dist` when that folder exists.
- `packages/client`: Vite lobby page (player name plus a list of games). `src/games.ts` is the client registry. In dev it connects to `:2567`; in production it connects to its own origin. `VITE_SERVER_URL` overrides both.
- `games/<id>`: one workspace per game, exporting `./shared`, `./server` and `./client`. To add a game, create the workspace and add it to both registries. Nothing else in the host should change.

### `games/world`: the first game, a 2.5D RO-style MMO

- `src/shared` is imported by both server and client. It holds the synchronised state (`state.ts`), message shapes (`protocol.ts`), tuning constants, the map loader, and A* pathfinding.
- The server is authoritative. Clients only send `move {x, y}` (the target cell) and `chat {text}`. `WorldRoom` validates input, pathfinds (8 directions, no corner cutting, path length capped), walks each player in `setTimestep`, and broadcasts `chat`. Server-only walking state (`Walker`) is kept outside the schema.
- Content is data. Maps are JSON files in `data/maps` (rows of tile characters; tile types live in `TILES` in `shared/map.ts`), registered in `shared/maps.ts`. Future monsters, items and so on should follow the same pattern: data files plus a loader, not hard-coded content.
- The client is Three.js, not Phaser: the map is 3D and characters are camera-facing sprites. `view.ts` owns the renderer and input and has no network code. `index.ts` connects room state to the view. Each frame it reads schema values directly; Colyseus callbacks are used only for add and remove.
- Coordinate conventions: state positions are in cell units, with a cell's centre at an integer. Cell `(x, y)` covers world X `x..x+1` and world Z `y..y+1`. `toWorld` adds 0.5. Facing `dir` is 0–7, clockwise from south (RO sprite order).
- To place an offset above or below a sprite (name label, chat bubble), use `sprite.center`, not `position.y`. The tilted camera foreshortens world Y but does not foreshorten the sprites.

### Colyseus 0.18 specifics (newer than most examples online)

- Define schemas with `schema({...}, "Name")` and `t.*`, not decorators. Rooms set `this.state = new X()` and declare handlers in a `messages = {...}` field. Use `setTimestep`; `setSimulationInterval` is deprecated.
- Client: `Callbacks.get<WorldState>(room)` needs the explicit type parameter, or values come back as `unknown`.
- Tests boot a real server with `@colyseus/testing`. Call `room.waitForMessage(type)` before `client.send(...)`. Waiting after sending races and times out.

## Roadmap and decisions

The full plan is the "Lumen Realm Roadmap" artifact: https://claude.ai/artifact/LSmRrVfwwvRj9hWuAFoiQr. The game's working name is Lumen Realm; the currency is Lumen. The user chose an RO-like 2.5D look, TypeScript + Colyseus, and simple shapes until real art exists. Each MVP must be playable online when it is done.

0. Shared map, click-to-move, chat. **Done.**
1. Accounts and persistent characters (auth, PostgreSQL, one session per account, reconnection).
2. Monsters and basic combat (spawn zones, AI state machine, drops with loot priority).
3. Levels, stats, and the first jobs (Initiate, then Vanguard, Arcanist, Pathfinder, Mender, Tinker, Shade).
4. Items, equipment, NPC shops, and account storage.
5. Skills, elements, sizes, and status effects.
6. Soul Shards (the card equivalent), tempering (refine), and item sets.
7. Parties, chat channels, trading, player shops, and mail.
8. Multiple maps with warps, NPC dialogue, quests, and map channels.
9. MVP bosses, party instances, achievements, and rankings.
10. Guilds, castle siege, second jobs, GM tools, and multi-process scaling.

Rules that apply to every MVP:

- Online first. The server decides everything; clients send intents only. Validate every message. Send only what is near the player (area of interest). Move items and currency inside one DB transaction with an audit log. Each MVP needs room tests, a two-browser check, a bot load test, and a check that data survives a server restart.
- rAthena (https://github.com/rathena/rathena) is the reference for game mechanics only. It is GPL-3.0, so do not copy its source code or its `db/` files into this repository. Re-implement the behaviour in TypeScript with our own numbers.
- Never use Ragnarok Online names, art or data for monsters, items, jobs, skills or places. Use original names; the starter list is in the artifact.
- Game content (monsters, items, skills, quests, NPCs) lives in JSON files under `games/world/data`, not in code.

Still undecided (ask the user first): login method details and art direction.

## Conventions

- The user writes in Thai. Reply in Thai. In-game UI text is Thai.
- Develop on branch `claude/gifted-galileo-1lo17b` and push there. Do not open a pull request unless the user asks.
