import type { GameClientModule } from "@game/core";
import { worldClient } from "@game/world/client";

/** Every game shown in the lobby. Add a game by listing its client module here. */
export const GAMES: GameClientModule[] = [worldClient];
