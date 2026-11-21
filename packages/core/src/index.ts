/**
 * Contracts between the shared host and individual games.
 *
 * The host (packages/server + packages/client) owns accounts, the database
 * and the lobby; it knows nothing about any game. A game exports one
 * GameServerModule and one GameClientModule, and is listed in the two
 * registries (packages/server/src/games.ts, packages/client/src/games.ts).
 */
import type { Room } from "@colyseus/core";
import type { Client } from "@colyseus/sdk";
import type { RequestHandler, Router } from "express";

// ---------------------------------------------------------------- server

/** Minimal SQL interface. Backed by PostgreSQL, or PGlite when no DATABASE_URL is set. */
export interface Database {
  query<T = Record<string, unknown>>(sql: string, params?: unknown[]): Promise<{ rows: T[] }>;
  /** Run `fn` in one transaction; it commits when `fn` resolves and rolls back when it throws. */
  transaction<R>(fn: (tx: Database) => Promise<R>): Promise<R>;
}

export interface Migration {
  /** Unique and stable forever; prefix with the game id, e.g. "world/001_characters". */
  id: string;
  sql: string;
}

export interface Account {
  id: number;
  username: string;
}

/**
 * One live game session per account, across every game and room. Claiming
 * runs the previous holder's `evict` first and waits for it (so it can save),
 * then returns a function that releases the claim.
 */
export interface SessionRegistry {
  claim(accountId: number, evict: () => Promise<void>): Promise<() => void>;
}

export interface HostServices {
  db: Database;
  /** Resolve a session token to its account, or null when missing, unknown or expired. */
  authenticate(token: string | undefined): Promise<Account | null>;
  sessions: SessionRegistry;
}

export type RoomClass = new (...args: any[]) => Room<any>;

/** Express request after `requireAccount` ran. */
export interface AuthedLocals {
  account: Account;
}

export interface GameServerModule {
  id: string;
  /** Tables this game needs. Applied in order, once, at server start. */
  migrations?: Migration[];
  /** Room classes keyed by room name. Room names must be globally unique. */
  createRooms(services: HostServices): Record<string, RoomClass>;
  /** HTTP endpoints, mounted at /api/games/<id>. `requireAccount` puts the account in `res.locals.account`. */
  routes?(router: Router, services: HostServices & { requireAccount: RequestHandler }): void;
}

/** Close code a room uses when it removes a player because the account logged in elsewhere. */
export const CLOSE_CODE_SESSION_TAKEN = 4001;

// ---------------------------------------------------------------- client

export interface PlayerSession {
  token: string;
  account: Account;
}

/** JSON calls to the host's HTTP API with the player's token attached. Throws ApiError on non-2xx. */
export interface ApiClient {
  get<T>(path: string): Promise<T>;
  post<T>(path: string, body?: unknown): Promise<T>;
  delete<T>(path: string): Promise<T>;
}

export class ApiError extends Error {
  constructor(readonly status: number, message: string) {
    super(message);
  }
}

export interface GameStartContext {
  /** Element the game renders into. It fills the page. */
  container: HTMLElement;
  /** Colyseus SDK client for the host server, with the session token already set. */
  sdk: Client;
  /** API client scoped to this game's routes (/api/games/<id>). */
  api: ApiClient;
  session: PlayerSession;
  /** Call to leave the game and return to the lobby. */
  exit(): void;
}

/** Client half of a game. `start` returns a function that tears everything down. */
export interface GameClientModule {
  id: string;
  title: string;
  description: string;
  start(ctx: GameStartContext): Promise<() => void>;
}
