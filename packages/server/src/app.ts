import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import express from "express";
import { defineRoom, defineServer, type RegisteredHandler } from "@colyseus/core";
import { WebSocketTransport } from "@colyseus/ws-transport";
import type { GameServerModule } from "@game/core";

const CLIENT_DIST = fileURLToPath(new URL("../../client/dist", import.meta.url));

/** Build the Colyseus server for a set of games. Room names must not collide across games. */
export function createServer(games: GameServerModule[]) {
  const rooms: Record<string, RegisteredHandler> = {};
  for (const game of games) {
    for (const [name, roomClass] of Object.entries(game.rooms)) {
      if (rooms[name]) throw new Error(`room name "${name}" from game "${game.id}" is already registered`);
      rooms[name] = defineRoom(roomClass);
    }
  }

  return defineServer({
    transport: new WebSocketTransport(),
    rooms,
    express: (app) => {
      app.get("/health", (_req, res) => {
        res.json({ ok: true, games: games.map((g) => g.id) });
      });
      // In production the built client is served from the same origin as the game server.
      if (existsSync(CLIENT_DIST)) app.use(express.static(CLIENT_DIST));
    },
  });
}
