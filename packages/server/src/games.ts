import type { GameServerModule } from "@game/core";
import { worldServer } from "@game/world/server";

/** Every game this host serves. Add a game by listing its server module here. */
export const GAMES: GameServerModule[] = [worldServer];
