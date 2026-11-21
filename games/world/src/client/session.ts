import { Callbacks, type Room } from "@colyseus/sdk";
import { CLOSE_CODE_SESSION_TAKEN } from "@game/core";
import {
  MAPS, type ChatBroadcast, type GroundItem, type HitEvent, type InventoryMessage, type Monster, type MoveMessage,
  type NoticeMessage, type Player, type WorldState,
} from "../shared";
import { ITEMS, MONSTERS } from "../shared/content";
import { Avatar } from "./avatar";
import { DamageTexts, ItemMarker, MonsterAvatar } from "./entities";
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

  const hud = new Hud(map.name, (text) => room.send("chat", { text }), () => stop(), () => room.send("revive", {}));
  const monsters = new Map<string, { avatar: MonsterAvatar; state: Monster }>();
  const items = new Map<string, { marker: ItemMarker; state: GroundItem }>();
  const damage = new DamageTexts();
  let view: WorldView;
  try {
    view = new WorldView(
      container,
      map,
      (cell, pick) => {
        if (pick?.kind === "monster") room.send("attack", { id: pick.id });
        else if (pick?.kind === "item") room.send("pickup", { id: pick.id });
        else if (cell) room.send("move", { x: cell.x, y: cell.y } satisfies MoveMessage);
      },
      () => hud.typing,
      (dt, now) => {
        // Schema instances update in place; read the latest server values every frame.
        for (const [sessionId, player] of room.state.players) {
          const avatar = view.avatars.get(sessionId);
          if (!avatar) continue;
          toWorld(player.x, player.y, avatar.target);
          avatar.setFacing(player.dir);
          avatar.update(dt, player.moving, now);
          if (sessionId === room.sessionId) hud.setHp(player.hp, player.maxHp);
        }
        for (const { avatar, state } of monsters.values()) {
          toWorld(state.x, state.y, avatar.target);
          avatar.setHp(state.hp, state.maxHp);
          avatar.update(dt, state.moving, now);
        }
        for (const { marker } of items.values()) marker.update(dt);
        damage.update(dt, now);
      },
    );
  } catch (err) {
    hud.dispose();
    void room.leave();
    return { done: Promise.resolve({ notice: `เปิดกราฟิก 3D ไม่ได้: ${(err as Error).message}` }), stop: () => {} };
  }
  container.append(hud.root);
  view.setLocalPlayer(room.sessionId);
  view.addEntity("damage", damage.root);

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

  $.onAdd("monsters", (state: Monster, id: string) => {
    const def = MONSTERS[state.def];
    if (!def) return;
    const avatar = new MonsterAvatar(id, def);
    toWorld(state.x, state.y, avatar.target);
    avatar.root.position.copy(avatar.target);
    monsters.set(id, { avatar, state });
    view.addEntity(`m:${id}`, avatar.root);
  });
  $.onRemove("monsters", (_state: Monster, id: string) => {
    const entry = monsters.get(id);
    if (!entry) return;
    view.removeEntity(`m:${id}`);
    entry.avatar.dispose();
    monsters.delete(id);
  });
  $.onAdd("items", (state: GroundItem, id: string) => {
    const marker = new ItemMarker(id, ITEMS[state.item]);
    toWorld(state.x, state.y, marker.root.position);
    items.set(id, { marker, state });
    view.addEntity(`i:${id}`, marker.root);
  });
  $.onRemove("items", (_state: GroundItem, id: string) => {
    const entry = items.get(id);
    if (!entry) return;
    view.removeEntity(`i:${id}`);
    entry.marker.dispose();
    items.delete(id);
  });

  if (import.meta.env.DEV) {
    // Debug handle for end-to-end tests; stripped from production builds.
    (window as unknown as Record<string, unknown>).__world = {
      room,
      screenOfMonster(id: string) {
        const m = monsters.get(id);
        return m ? view.project(m.avatar.root.position.clone().add({ x: 0, y: 0.4, z: 0 } as never)) : null;
      },
      screenOfItem(id: string) {
        const i = items.get(id);
        return i ? view.project(i.marker.root.position.clone().add({ x: 0, y: 0.22, z: 0 } as never)) : null;
      },
    };
  }

  room.onMessage("hits", (hits: HitEvent[]) => {
    const now = performance.now();
    for (const h of hits) {
      const at = monsters.get(h.to)?.avatar.root.position ?? view.avatars.get(h.to)?.root.position;
      if (!at) continue;
      const color = h.miss ? "#8fc8ff" : h.to === room.sessionId ? "#ff6b6b" : h.from === room.sessionId ? "#ffffff" : "#ffd27a";
      damage.spawn(at, h.miss ? "MISS" : String(h.damage), color, now);
    }
  });
  room.onMessage("inventory", (msg: InventoryMessage) => {
    hud.setInventory(msg.items.map((i) => ({ name: ITEMS[i.item]?.name ?? i.item, amount: i.amount, color: ITEMS[i.item]?.color ?? "#fff" })));
  });
  room.onMessage("notice", (msg: NoticeMessage) => hud.addLine("", msg.text, "system"));

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
    for (const { avatar } of monsters.values()) avatar.dispose();
    for (const { marker } of items.values()) marker.dispose();
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
