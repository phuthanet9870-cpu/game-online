import { Callbacks, type Room } from "@colyseus/sdk";
import { CLOSE_CODE_SESSION_TAKEN } from "@game/core";
import { MAPS, type ChatBroadcast, type MoveMessage, type Player, type WorldState } from "../shared";
import { Avatar } from "./avatar";
import { Hud } from "./hud";
import { toWorld, WorldView } from "./view";

export interface SessionEnd {
  /** Message to show on the character-select screen, if the session ended unexpectedly. */
  notice?: string;
}

/**
 * Run one joined world room until the player switches character or the
 * connection ends. Resolves when it is over; everything is torn down by then.
 */
export function runWorldSession(container: HTMLElement, room: Room<any, WorldState>): { done: Promise<SessionEnd>; stop: () => void } {
  const map = MAPS[room.state.mapId];
  if (!map) {
    void room.leave();
    return { done: Promise.resolve({ notice: `ไม่รู้จักแผนที่ ${room.state.mapId}` }), stop: () => {} };
  }

  let finish!: (end: SessionEnd) => void;
  const done = new Promise<SessionEnd>((r) => (finish = r));
  let stopped = false;

  const hud = new Hud(map.name, (text) => room.send("chat", { text }), () => stop());
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
    hud.dispose();
    void room.leave();
    return { done: Promise.resolve({ notice: `เปิดกราฟิก 3D ไม่ได้: ${(err as Error).message}` }), stop: () => {} };
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
  room.onDrop(() => hud.addLine("", "การเชื่อมต่อหลุด กำลังเชื่อมต่อใหม่…", "system"));
  room.onReconnect(() => hud.addLine("", "เชื่อมต่อกลับมาแล้ว", "system"));
  room.onLeave((code) => {
    if (stopped) return;
    const notice = code === CLOSE_CODE_SESSION_TAKEN
      ? "บัญชีนี้ถูกเข้าใช้จากที่อื่น จึงออกจากเกมที่นี่"
      : "หลุดการเชื่อมต่อจากเซิร์ฟเวอร์";
    teardown();
    finish({ notice });
  });

  function teardown() {
    if (stopped) return;
    stopped = true;
    view.dispose();
    hud.dispose();
  }
  function stop() {
    if (stopped) return;
    teardown();
    void room.leave();
    finish({});
  }

  return { done, stop };
}
