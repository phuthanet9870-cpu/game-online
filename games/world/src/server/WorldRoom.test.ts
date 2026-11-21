import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { Client as SDKClient } from "@colyseus/sdk";
import { createTestHost, type TestHost } from "@game/server/testing";
import { CLOSE_CODE_SESSION_TAKEN } from "@game/core";
import { MAPS, WORLD_ROOM, WorldState } from "../shared";
import { worldServer } from "./index";

const PORT = 2571;

describe("WorldRoom", () => {
  let host: TestHost;
  let n = 0;

  beforeAll(async () => {
    host = await createTestHost([worldServer], PORT);
  });
  afterAll(() => host.shutdown());

  const api = async (token: string, method: string, path: string, body?: unknown) => {
    const res = await fetch(`${host.apiUrl}/games/world${path}`, {
      method,
      headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    return { status: res.status, body: res.status === 204 ? null : await res.json() };
  };

  /** A fresh account with one character, plus an SDK client logged in as it. */
  const newPlayer = async (name = `Hero${++n}`) => {
    const { token, account } = await host.register(`user${n}_${Date.now() % 100000}`);
    const created = await api(token, "POST", "/characters", { name, color: 1 });
    expect(created.status).toBe(201);
    const sdk = new SDKClient(`http://localhost:${PORT}`);
    sdk.auth.token = token;
    return { token, account, characterId: created.body.character.id as number, sdk };
  };

  const join = async (p: { sdk: SDKClient; characterId: number }) => {
    const room = await p.sdk.joinOrCreate(WORLD_ROOM, { characterId: p.characterId }, WorldState);
    await room.waitForInitialState();
    return room;
  };


  it("manages characters over HTTP, per account", async () => {
    const a = await newPlayer("เจ้าหญิงดาบ");
    const b = await newPlayer();
    expect((await api(a.token, "GET", "/characters")).body.characters).toEqual([
      { id: a.characterId, name: "เจ้าหญิงดาบ", color: 1, mapName: MAPS["starter-field"].name },
    ]);
    expect((await api(b.token, "POST", "/characters", { name: "เจ้าหญิงดาบ", color: 0 })).status).toBe(409);
    expect((await api(b.token, "POST", "/characters", { name: "x", color: 0 })).status).toBe(400);
    expect((await api(b.token, "POST", "/characters", { name: "Okay Name", color: 99 })).status).toBe(400);
    expect((await api(b.token, "DELETE", `/characters/${a.characterId}`)).status).toBe(404);
    for (const name of ["Second", "Third"]) expect((await api(b.token, "POST", "/characters", { name, color: 0 })).status).toBe(201);
    expect((await api(b.token, "POST", "/characters", { name: "Fourth", color: 0 })).status).toBe(409);
    expect((await api("bad-token", "GET", "/characters")).status).toBe(401);
  });

  it("rejects joins without a valid token or with someone else's character", async () => {
    const a = await newPlayer();
    const b = await newPlayer();
    const anonymous = new SDKClient(`http://localhost:${PORT}`);
    await expect(anonymous.joinOrCreate(WORLD_ROOM, { characterId: a.characterId })).rejects.toThrow();
    await expect(b.sdk.joinOrCreate(WORLD_ROOM, { characterId: a.characterId })).rejects.toThrow();
  });

  it("restores a character where it was saved on leave", async () => {
    const p = await newPlayer("Walker");
    const room = await join(p);
    const server = host.colyseus.getRoomById(room.roomId) as any;
    const player = server.state.players.get(room.sessionId);
    expect(player.name).toBe("Walker");
    const target = { x: Math.round(player.x) + 3, y: Math.round(player.y) };
    const handled = server.waitForMessage("move");
    room.send("move", target);
    await handled;
    for (let i = 0; i < 30 && !(player.x === target.x && player.y === target.y); i++) await server.waitForNextSimulationTick();
    expect({ x: player.x, y: player.y }).toEqual(target);
    expect(player.dir).toBe(6);

    await room.leave();
    await new Promise((r) => setTimeout(r, 50));
    const again = await join(p);
    const restored = (host.colyseus.getRoomById(again.roomId) as any).state.players.get(again.sessionId);
    expect({ x: restored.x, y: restored.y }).toEqual(target);
    await again.leave();
  });

  it("kicks the older session when the same account joins again, keeping its position", async () => {
    const p = await newPlayer();
    const first = await join(p);
    const server = host.colyseus.getRoomById(first.roomId) as any;
    const start = server.state.players.get(first.sessionId);
    const target = { x: Math.round(start.x), y: Math.round(start.y) - 2 };
    {
      const handled = server.waitForMessage("move");
      first.send("move", target);
      await handled;
      for (let i = 0; i < 30 && !(start.x === target.x && start.y === target.y); i++) await server.waitForNextSimulationTick();
    }
    const kicked = new Promise<number>((resolve) => first.onLeave((code) => resolve(code)));

    const otherTab = new SDKClient(`http://localhost:${PORT}`);
    otherTab.auth.token = p.token;
    const second = await join({ sdk: otherTab, characterId: p.characterId });
    expect(await kicked).toBe(CLOSE_CODE_SESSION_TAKEN);
    const players = [...server.state.players.values()].filter((pl: any) => pl.name === start.name);
    expect(players).toHaveLength(1);
    const now = server.state.players.get(second.sessionId);
    expect({ x: now.x, y: now.y }).toEqual(target);
    await second.leave();
  });

  it("keeps a dropped player in the world until they reconnect", async () => {
    const p = await newPlayer();
    const room = await join(p);
    const server = host.colyseus.getRoomById(room.roomId) as any;
    const token = room.reconnectionToken;
    room.reconnection.enabled = false; // drive the reconnect ourselves
    await room.leave(false);
    await new Promise((r) => setTimeout(r, 50));
    expect(server.state.players.has(room.sessionId)).toBe(true);

    const back = await p.sdk.reconnect(token, WorldState);
    expect(back.sessionId).toBe(room.sessionId);
    const handled = server.waitForMessage("chat");
    back.send("chat", { text: "กลับมาแล้ว" });
    await handled;
    await back.leave();
    await new Promise((r) => setTimeout(r, 50));
    expect(server.state.players.has(room.sessionId)).toBe(false);
  });

  it("ignores moves to blocked or malformed cells", async () => {
    const p = await newPlayer();
    const room = await join(p);
    const server = host.colyseus.getRoomById(room.roomId) as any;
    const player = server.state.players.get(room.sessionId);
    const start = { x: player.x, y: player.y };
    for (const bad of [{ x: 0, y: 0 }, { x: 1.5, y: 2 }, { x: 9999, y: 1 }, "nope"]) {
      const handled = server.waitForMessage("move");
      room.send("move", bad);
      await handled;
    }
    await server.waitForNextSimulationTick();
    expect({ x: player.x, y: player.y }).toEqual(start);
    await room.leave();
  });

  it("broadcasts trimmed chat lines and drops empty or spammed ones", async () => {
    const a = await newPlayer("Alice");
    const b = await newPlayer("Bob");
    const ra = await join(a);
    const rb = await join(b);
    const server = host.colyseus.getRoomById(ra.roomId) as any;

    const received = rb.waitForMessage("chat");
    ra.send("chat", { text: "  สวัสดี   ทุกคน  " });
    expect(await received).toEqual({ sessionId: ra.sessionId, name: "Alice", text: "สวัสดี ทุกคน" });

    const lines: unknown[] = [];
    rb.onMessage("chat", (line) => lines.push(line));
    for (const text of ["too fast", "   "]) {
      const handled = server.waitForMessage("chat");
      ra.send("chat", { text });
      await handled;
    }
    await new Promise((r) => setTimeout(r, 50));
    expect(lines).toEqual([]);
    await ra.leave();
    await rb.leave();
  });
});
