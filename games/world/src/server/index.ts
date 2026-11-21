import type { GameServerModule, HostServices } from "@game/core";
import { WORLD_ROOM } from "../shared";
import { CHARACTER_MIGRATIONS } from "./characters";
import { characterRoutes } from "./routes";
import { WorldRoom } from "./WorldRoom";

export { WorldRoom };

export const worldServer: GameServerModule = {
  id: "world",
  migrations: CHARACTER_MIGRATIONS,
  createRooms(services: HostServices) {
    class BoundWorldRoom extends WorldRoom {
      protected readonly services = services;
    }
    return { [WORLD_ROOM]: BoundWorldRoom };
  },
  routes: characterRoutes,
};
