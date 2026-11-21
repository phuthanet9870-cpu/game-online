# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

npm workspaces monorepo, Node 22. Run everything from the repository root.

- `npm install`: install all workspaces.
- `npm run dev`: game server on :2567 (tsx watch) plus the Vite client on :5173. Open http://localhost:5173.
- Database: set `DATABASE_URL` (PostgreSQL) for real deployments. Without it the server uses PGlite (Postgres in WASM) stored in `.data/pglite` (override with `PGLITE_DIR`), so dev needs no database server. Migrations run automatically at startup.
- `npm run build`: build the client into `packages/client/dist`.
- `npm start`: production mode. One process on `PORT` (default 2567) serves both the built client and the game server. Run `npm run build` first.
- `npm run build:artifact`: build the world game as one self-contained HTML page (`games/world/dist-artifact/lumen-realm.html`) for the claude.ai artifact "Lumen Realm" (https://claude.ai/artifact/G4z2SoQ5MWcg6ywfJDk2VD). Republish that file to the same artifact with `capabilities: {room: {topics: {chat: "interact"}}}`.
- `npm run typecheck`: `tsc --noEmit` over every workspace. There is no linter.
- `npm test`: all Vitest tests.
- One file: `npx vitest run games/world/src/shared/pathfinding.test.ts`. One test: add `-t "routes around walls"`.
- Tests use in-memory PGlite. To run the DB-backed tests against real PostgreSQL: `DATABASE_URL_TEST=postgres://game:game@localhost:5432/game_test npx vitest run --no-file-parallelism`. Each test host drops and recreates the `public` schema, so use a throwaway database.

## Architecture

The repository is a host for many games. The host knows nothing about any particular game.

- `packages/core`: only the contracts. A `GameServerModule` has `migrations`, `createRooms(services)` and optional HTTP `routes` (mounted at `/api/games/<id>`). `HostServices` gives games the `db`, `authenticate(token)` and the `sessions` registry. A `GameClientModule.start()` gets a logged-in SDK client, an `api` client for its routes, and `exit()`.
- `packages/server`: the Colyseus 0.18 + Express host. `createHost` in `src/app.ts` opens the database, runs platform and game migrations, and registers every game's rooms (it fails if two room names collide) and routes. `src/platform/` holds the database wrapper (`pg` or PGlite behind one `Database` interface), migrations, accounts (`AuthService`: scrypt passwords, random session tokens stored as SHA-256 hashes, login throttling) and `LocalSessionRegistry`. `src/games.ts` is the server registry. The host serves `packages/client/dist` when that folder exists.
- One live session per account: a room calls `services.sessions.claim(accountId, evict)` on join. A later claim awaits the earlier holder's `evict` (save, then disconnect with `CLOSE_CODE_SESSION_TAKEN`) before continuing. This is in-process today; MVP 10 moves it to Redis behind the same interface.
- `packages/client`: Vite lobby page (login/register, then the list of games). It stores the session token in localStorage. `src/games.ts` is the client registry. In dev it connects to `:2567`; in production it connects to its own origin. `VITE_SERVER_URL` overrides both.
- Integration tests boot a full host with `createTestHost(games, port)` from `@game/server/testing`. Give each test file its own port. `@colyseus/testing`'s `boot()` ignores the port for `Server` instances, so the helper calls `listen` itself.
- `games/<id>`: one workspace per game, exporting `./shared`, `./server` and `./client`. To add a game, create the workspace and add it to both registries. Nothing else in the host should change.

### `games/world`: the first game, a 2.5D RO-style MMO

- `src/shared` is imported by both server and client. It holds the synchronised state (`state.ts`), message shapes (`protocol.ts`), tuning constants, the map loader, and A* pathfinding.
- The server is authoritative. Clients only send `move {x, y}` (the target cell) and `chat {text}`. `WorldRoom` validates input, pathfinds (8 directions, no corner cutting, path length capped), walks each player in `setTimestep`, and broadcasts `chat`. Server-only per-player state (`Seat`: walker, character id, session claim) is kept outside the schema.
- Room lifecycle: `onAuth` checks the token and that the character belongs to the account. `onJoin` claims the account session, then reloads the character so it starts where an evicted session just saved. `onDrop` keeps the player in the world for `RECONNECT_SECONDS`. `onLeave` and eviction both go through `closeSeat`, which saves once. The room also autosaves every `AUTOSAVE_MS`. `WorldRoom` is abstract; `createRooms` binds host services into a subclass.
- Characters live in `world_characters` (`server/characters.ts`, which also holds its migration), with a 3-per-account limit and case-insensitive unique names. The client flow is character select (`client/select.ts`) → `runWorldSession` (`client/session.ts`) → back to select.
- Content is data. Maps are JSON files in `data/maps` (rows of tile characters; tile types live in `TILES` in `shared/map.ts`), registered in `shared/maps.ts`. Future monsters, items and so on should follow the same pattern: data files plus a loader, not hard-coded content.
- The client is Three.js, not Phaser: the map is 3D and characters are camera-facing sprites. `view.ts` owns the renderer and input and has no network code. `index.ts` connects room state to the view. Each frame it reads schema values directly; Colyseus callbacks are used only for add and remove.
- Coordinate conventions: state positions are in cell units, with a cell's centre at an integer. Cell `(x, y)` covers world X `x..x+1` and world Z `y..y+1`. `toWorld` adds 0.5. Facing `dir` is 0–7, clockwise from south (RO sprite order).
- To place an offset above or below a sprite (name label, chat bubble), use `sprite.center`, not `position.y`. The tilted camera foreshortens world Y but does not foreshorten the sprites.

### Artifact build (`games/world/src/artifact`)

A playable single-page version for claude.ai. It has no game server: each page walks its own character with the same `findPath`/`advance` code. Multiplayer uses the artifact `room` capability: presence carries `{n, c, x, y, d, m}` (name, colour, position, facing, moving), and chat goes out as a `chat` event. Every peer's presence is clamped and validated as untrusted input. The character is saved in localStorage. With no room (outside claude.ai), the page plays solo. Because clients are authoritative here, this build is a demo; the real game is the Colyseus server. `tools/build-artifact.mjs` runs Vite in IIFE lib mode (`vite.artifact.config.ts`) and inlines the JS and CSS into `page.html`.

### Colyseus 0.18 specifics (newer than most examples online)

- Define schemas with `schema({...}, "Name")` and `t.*`, not decorators. Rooms set `this.state = new X()` and declare handlers in a `messages = {...}` field. Use `setTimestep`; `setSimulationInterval` is deprecated.
- Client: `Callbacks.get<WorldState>(room)` needs the explicit type parameter, or values come back as `unknown`.
- Tests boot a real server with `@colyseus/testing`. Call `room.waitForMessage(type)` before `client.send(...)`. Waiting after sending races and times out.

## Roadmap and decisions

The full plan is the "Lumen Realm Roadmap" artifact: https://claude.ai/artifact/LSmRrVfwwvRj9hWuAFoiQr. The game's working name is Lumen Realm; the currency is Lumen. The user chose an RO-like 2.5D look, TypeScript + Colyseus, and simple shapes until real art exists. Each MVP must be playable online when it is done.

0. Shared map, click-to-move, chat. **Done.**
1. Accounts and persistent characters (auth, PostgreSQL, one session per account, reconnection). **Done.**
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

Login uses a username and password (no email or Google sign-in yet). Still undecided (ask the user first): art direction.

## Conventions

- The user writes in Thai. Reply in Thai. In-game UI text is Thai.
- Develop on branch `claude/gifted-galileo-1lo17b` and push there. Do not open a pull request unless the user asks.
