import { Callbacks } from "@colyseus/sdk";
import type { GameClientModule } from "@game/core";
import { MAPS, WORLD_ROOM, WorldState, type ChatBroadcast, type JoinOptions, type MoveMessage, type Player } from "../shared";
import { Avatar } from "./avatar";
import { Hud } from "./hud";
import { toWorld, WorldView } from "./view";
import "./world.css";

export const worldClient: GameClientModule = {
  id: "world",
  title: "โลกแฟนตาซี (แนว RO)",
  description: "แผนที่ 2.5D หลายผู้เล่น · เดินด้วยการคลิก · แชท",

  async start({ container, sdk, playerName }) {
    const options: JoinOptions = { name: playerName };
    const room = await sdk.joinOrCreate(WORLD_ROOM, options, WorldState);
    if (!room.state?.mapId) await new Promise<void>((resolve) => room.onStateChange.once(() => resolve()));

    const map = MAPS[room.state.mapId];
    if (!map) {
      await room.leave();
      throw new Error(`ไม่รู้จักแผนที่ ${room.state.mapId}`);
    }
    const hud = new Hud(map.name, (text) => room.send("chat", { text }));
    let view: WorldView;
    try {
      view = new WorldView(
        container,
        map,
        (x, y) => room.send("move", { x, y } satisfies MoveMessage),
        () => hud.typing,
        (dt, now) => {
          // Schema instances update in place; read the latest server values every frame.
          for (const [sessionId, player] of room.state.players) {
            const avatar = view.avatars.get(sessionId);
            if (!avatar) continue;
            toWorld(player.x, player.y, avatar.target);
            avatar.setFacing(player.dir);
            avatar.update(dt, player.moving, now);
          }
        },
      );
    } catch (err) {
      // Most likely no WebGL: do not leave a ghost player in the room.
      hud.dispose();
      await room.leave();
      throw err;
    }
    container.append(hud.root);
    view.setLocalPlayer(room.sessionId);

    const $ = Callbacks.get<WorldState>(room);
    $.onAdd("players", (player: Player, sessionId: string) => {
      const avatar = new Avatar(player.name, player.color, sessionId === room.sessionId);
      toWorld(player.x, player.y, avatar.target);
      avatar.setFacing(player.dir);
      view.addAvatar(sessionId, avatar);
      hud.setOnline(room.state.players.size);
      if (sessionId !== room.sessionId) hud.addLine("", `${player.name} เข้ามาในแผนที่`, "system");
    });
    $.onRemove("players", (player: Player, sessionId: string) => {
      view.removeAvatar(sessionId);
      hud.setOnline(room.state.players.size);
      hud.addLine("", `${player.name} ออกจากแผนที่`, "system");
    });

    room.onMessage("chat", (line: ChatBroadcast) => {
      hud.addLine(line.name, line.text);
      view.avatars.get(line.sessionId)?.say(line.text, performance.now());
    });
    room.onLeave(() => hud.addLine("", "หลุดการเชื่อมต่อจากเซิร์ฟเวอร์ รีเฟรชหน้าเพื่อเข้าใหม่", "system"));

    return () => {
      room.leave();
      view.dispose();
      hud.dispose();
    };
  },
};
