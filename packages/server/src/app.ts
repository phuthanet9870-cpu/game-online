import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import express, { type RequestHandler } from "express";
import { defineRoom, defineServer, type RegisteredHandler, type Server } from "@colyseus/core";
import { WebSocketTransport } from "@colyseus/ws-transport";
import type { GameServerModule, HostServices } from "@game/core";
import { AuthError, AuthService } from "./platform/auth";
import { createDatabase, type ClosableDatabase } from "./platform/db";
import { PLATFORM_MIGRATIONS, runMigrations } from "./platform/migrations";
import { LocalSessionRegistry } from "./platform/sessions";

const CLIENT_DIST = fileURLToPath(new URL("../../client/dist", import.meta.url));

export interface HostOptions {
  games: GameServerModule[];
  /** PostgreSQL connection string. Without it, PGlite is used. */
  databaseUrl?: string;
  /** PGlite data directory. Omit for an in-memory database (tests). */
  dataDir?: string;
}

export interface Host {
  server: Server;
  services: HostServices;
  db: ClosableDatabase;
}

function bearer(header: string | undefined): string | undefined {
  return header?.startsWith("Bearer ") ? header.slice(7) : undefined;
}

/** Wrap an async handler so thrown errors become JSON responses. */
const handle = (fn: (req: express.Request, res: express.Response) => Promise<unknown>): RequestHandler =>
  (req, res) => {
    fn(req, res).catch((err) => {
      if (err instanceof AuthError || (typeof err?.status === "number" && err.expose)) {
        res.status(err.status).json({ error: err.message });
      } else {
        console.error(err);
        res.status(500).json({ error: "เซิร์ฟเวอร์ผิดพลาด" });
      }
    });
  };

/**
 * Build the host: database (migrated), accounts, and one Colyseus server
 * carrying every game's rooms and HTTP routes.
 */
export async function createHost(opts: HostOptions): Promise<Host> {
  const db = await createDatabase({ url: opts.databaseUrl, dataDir: opts.dataDir });
  await runMigrations(db, [...PLATFORM_MIGRATIONS, ...opts.games.flatMap((g) => g.migrations ?? [])]);

  const auth = new AuthService(db);
  const services: HostServices = {
    db,
    authenticate: (token) => auth.authenticate(token),
    sessions: new LocalSessionRegistry(),
  };

  const requireAccount: RequestHandler = (req, res, next) => {
    auth.authenticate(bearer(req.headers.authorization)).then((account) => {
      if (!account) return void res.status(401).json({ error: "กรุณาเข้าสู่ระบบใหม่" });
      res.locals.account = account;
      next();
    }, next);
  };

  const rooms: Record<string, RegisteredHandler> = {};
  for (const game of opts.games) {
    for (const [name, roomClass] of Object.entries(game.createRooms(services))) {
      if (rooms[name]) throw new Error(`room name "${name}" from game "${game.id}" is already registered`);
      rooms[name] = defineRoom(roomClass);
    }
  }

  const server = defineServer({
    transport: new WebSocketTransport(),
    // index.ts handles signals so it can close the database after rooms have saved.
    gracefullyShutdown: false,
    rooms,
    express: (app) => {
      const api = express.Router();
      api.use(express.json({ limit: "16kb" }));
      api.get("/health", (_req, res) => void res.json({ ok: true, games: opts.games.map((g) => g.id) }));
      api.post("/auth/register", handle(async (req, res) => {
        res.status(201).json(await auth.register(req.body?.username, req.body?.password));
      }));
      api.post("/auth/login", handle(async (req, res) => {
        res.json(await auth.login(req.body?.username, req.body?.password));
      }));
      api.post("/auth/logout", handle(async (req, res) => {
        await auth.logout(bearer(req.headers.authorization));
        res.status(204).end();
      }));
      api.get("/auth/me", requireAccount, (_req, res) => void res.json({ account: res.locals.account }));
      for (const game of opts.games) {
        if (!game.routes) continue;
        const router = express.Router();
        game.routes(router, { ...services, requireAccount });
        api.use(`/games/${game.id}`, router);
      }
      app.use("/api", api);
      // In production the built client is served from the same origin as the game server.
      if (existsSync(CLIENT_DIST)) app.use(express.static(CLIENT_DIST));
    },
  });

  return { server, services, db };
}
