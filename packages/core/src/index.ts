/**
 * Contracts between the shared host and individual games.
 *
 * The host (packages/server + packages/client) knows nothing about any game.
 * A game exports one GameServerModule and one GameClientModule, and is listed
 * in the two registries (packages/server/src/games.ts, packages/client/src/games.ts).
 */
import type { Room } from "@colyseus/core";
import type { Client } from "@colyseus/sdk";

/** Server half of a game: the Colyseus room classes it hosts, keyed by room name. */
export interface GameServerModule {
  id: string;
  /** Room names must be globally unique; prefix them with the game id when a game has several. */
  rooms: Record<string, new (...args: any[]) => Room<any>>;
}

export interface GameStartContext {
  /** Element the game renders into. It fills the page. */
  container: HTMLElement;
  /** Connected Colyseus SDK client pointing at the host server. */
  sdk: Client;
  playerName: string;
}

/** Client half of a game. `start` joins a room and returns a function that tears everything down. */
export interface GameClientModule {
  id: string;
  title: string;
  description: string;
  start(ctx: GameStartContext): Promise<() => void>;
}
