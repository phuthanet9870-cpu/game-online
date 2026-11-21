import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { boot, type ColyseusTestServer } from "@colyseus/testing";
import { defineRoom, defineServer } from "@colyseus/core";
import { WebSocketTransport } from "@colyseus/ws-transport";
import { MAPS, WORLD_ROOM, WorldState } from "../shared";
import { WorldRoom } from "./WorldRoom";

describe("WorldRoom", () => {
  let colyseus: ColyseusTestServer;

  beforeAll(async () => {
    colyseus = await boot(defineServer({
      transport: new WebSocketTransport(),
      rooms: { [WORLD_ROOM]: defineRoom(WorldRoom) },
    }));
  });
  afterAll(async () => colyseus.shutdown());
  beforeEach(async () => colyseus.cleanup());

  const join = async (room: WorldRoom, name: string) => {
    const client = await colyseus.connectTo(room, { name });
    await client.waitForInitialState();
    return client;
  };

  it("adds joining players at a walkable cell near the spawn and removes them on leave", async () => {
    const room = await colyseus.createRoom<WorldRoom>(WORLD_ROOM, {});
    const a = await join(room, "Alice");
    await join(room, "  ");

    const map = MAPS[room.state.mapId];
    expect(room.state.players.size).toBe(2);
    const alice = room.state.players.get(a.sessionId)!;
    expect(alice.name).toBe("Alice");
    expect(map.isWalkable(alice.x, alice.y)).toBe(true);
    expect([...room.state.players.values()].map((p) => p.name)).toContain("Novice");

    await a.leave();
    await room.waitForNextPatch();
    expect(room.state.players.has(a.sessionId)).toBe(false);
  });

  it("walks a player to the clicked cell over server ticks", async () => {
    const room = await colyseus.createRoom<WorldRoom>(WORLD_ROOM, {});
    const client = await join(room, "Walker");
    const player = room.state.players.get(client.sessionId)!;
    const target = { x: Math.round(player.x) + 3, y: Math.round(player.y) };
    expect(MAPS[room.state.mapId].isWalkable(target.x, target.y)).toBe(true);

    const handled = room.waitForMessage("move");
    client.send("move", target);
    await handled;
    for (let i = 0; i < 20 && !(player.x === target.x && player.y === target.y); i++) {
      await room.waitForNextSimulationTick();
    }
    expect({ x: player.x, y: player.y }).toEqual(target);
    expect(player.moving).toBe(false);
    expect(player.dir).toBe(6); // east
  });

  it("ignores moves to blocked or invalid cells", async () => {
    const room = await colyseus.createRoom<WorldRoom>(WORLD_ROOM, {});
    const client = await join(room, "Stuck");
    const player = room.state.players.get(client.sessionId)!;
    const start = { x: player.x, y: player.y };

    for (const bad of [{ x: 0, y: 0 }, { x: 1.5, y: 2 }, { x: 9999, y: 1 }, "nope"]) {
      const handled = room.waitForMessage("move");
      client.send("move", bad);
      await handled;
    }
    await room.waitForNextSimulationTick();
    expect({ x: player.x, y: player.y }).toEqual(start);
  });

  it("broadcasts trimmed chat lines and drops empty or spammed ones", async () => {
    const room = await colyseus.createRoom<WorldRoom>(WORLD_ROOM, {});
    const a = await join(room, "Alice");
    const b = await join(room, "Bob");

    const received = b.waitForMessage("chat");
    a.send("chat", { text: "  สวัสดี   ทุกคน  " });
    expect(await received).toEqual({ sessionId: a.sessionId, name: "Alice", text: "สวัสดี ทุกคน" });

    const lines: unknown[] = [];
    b.onMessage("chat", (line) => lines.push(line));
    for (const text of ["too fast", "   "]) {
      const handled = room.waitForMessage("chat");
      a.send("chat", { text });
      await handled;
    }
    await new Promise((r) => setTimeout(r, 50));
    expect(lines).toEqual([]);
  });

  it("uses the shared state schema", async () => {
    const room = await colyseus.createRoom<WorldRoom>(WORLD_ROOM, {});
    expect(room.state).toBeInstanceOf(WorldState);
  });
});
