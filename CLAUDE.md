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

The user chose: an RO-like 2.5D look, TypeScript + Colyseus, simple shapes until real art exists, and incremental phases where each one is playable.

0. Shared map, click-to-move, chat. **Done.**
1. Monsters that spawn, can be attacked, and drop items.
2. Levels, stats, and the first job.
3. Inventory, equipment, and cards.
4. Parties, shared EXP, and saving characters to a database.
5. Multiple maps with warps, NPCs, and quests.
6. MVP bosses, guilds, trading, and PvP.

Still undecided (ask the user first): the database (PostgreSQL was suggested), accounts and login, and art direction. Do not use Ragnarok Online's assets or names: it is only the genre reference.

## Conventions

- The user writes in Thai. Reply in Thai. In-game UI text is Thai.
- Develop on branch `claude/gifted-galileo-1lo17b` and push there. Do not open a pull request unless the user asks.
