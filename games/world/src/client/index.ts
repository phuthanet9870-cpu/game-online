import type { GameClientModule } from "@game/core";
import { WORLD_ROOM, WorldState, type WorldJoinOptions } from "../shared";
import { selectCharacter } from "./select";
import { runWorldSession } from "./session";
import "./world.css";

export const worldClient: GameClientModule = {
  id: "world",
  title: "Lumen Realm",
  description: "โลกแฟนตาซี 2.5D หลายผู้เล่น · เลือกตัวละคร · เดินด้วยการคลิก · แชท",

  async start({ container, sdk, api, exit }) {
    let active = true;
    let stopSession: (() => void) | null = null;

    // Character select → play → back to select, until the player leaves.
    void (async () => {
      let notice: string | undefined;
      while (active) {
        const characterId = await selectCharacter(container, api, notice);
        if (!active) return;
        if (characterId === null) return exit();
        try {
          const options: WorldJoinOptions = { characterId };
          const room = await sdk.joinOrCreate(WORLD_ROOM, options, WorldState);
          if (!room.state?.mapId) await new Promise<void>((resolve) => room.onStateChange.once(() => resolve()));
          if (!active) return void room.leave();
          const session = runWorldSession(container, room);
          stopSession = session.stop;
          notice = (await session.done).notice;
          stopSession = null;
        } catch (err) {
          notice = `เข้าเกมไม่ได้: ${(err as Error).message}`;
        }
      }
    })();

    return () => {
      active = false;
      stopSession?.();
      container.replaceChildren();
    };
  },
};
