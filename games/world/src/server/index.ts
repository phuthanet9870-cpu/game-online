import type { GameServerModule } from "@game/core";
import { WORLD_ROOM } from "../shared";
import { WorldRoom } from "./WorldRoom";

export { WorldRoom };

export const worldServer: GameServerModule = {
  id: "world",
  rooms: { [WORLD_ROOM]: WorldRoom },
};
