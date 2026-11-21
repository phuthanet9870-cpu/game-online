// Boots the real game server (server/src) inside this page: PGlite database, in-memory Redis, Colyseus matchmaker with one
// room type per map (as server/src/index.ts does), and the account API on the Express shim. No HTTP or WebSocket server:
// net.ts routes the client's fetch / WebSocket calls here.
import { matchMaker } from "@colyseus/core";
import { MAP_NAMES, roomOf } from "../../shared/maps.ts";
import { migrate } from "../../server/src/db.ts";
import { redis } from "../../server/src/redis.ts";
import { MapRoom } from "../../server/src/rooms/MapRoom.ts";
import { registerApi } from "../../server/src/api.ts";
import express from "./shims/express.ts";

// Login sessions live in the in-memory Redis stand-in; mirror them to localStorage so a reload goes straight back to
// character select, as it does against the real server (client/src/api.ts keeps the token across reloads).
const SESSIONS = "go.sessions";
function keepSessions() {
  const r = redis as any;
  const load = (): Record<string, [string, number]> => { try { return JSON.parse(localStorage.getItem(SESSIONS) ?? "{}"); } catch { return {}; } };
  const write = (m: Record<string, [string, number]>) => { try { localStorage.setItem(SESSIONS, JSON.stringify(m)); } catch { /* storage blocked */ } };
  const now = Date.now(), all = load();
  for (const [k, [v, until]] of Object.entries(all)) {
    if (until > now) void r.set(k, v, "EX", Math.ceil((until - now) / 1000)); else delete all[k];
  }
  write(all);
  const set = r.set.bind(r), expire = r.expire.bind(r), del = r.del.bind(r);
  r.set = async (k: string, v: string, mode?: string, sec?: number) => {
    const out = await set(k, v, mode, sec);
    if (k.startsWith("session:") && sec) { const m = load(); m[k] = [String(v), Date.now() + sec * 1000]; write(m); }
    return out;
  };
  r.expire = async (k: string, sec: number) => {
    const out = await expire(k, sec);
    if (k.startsWith("session:") && out) { const m = load(); if (m[k]) { m[k][1] = Date.now() + sec * 1000; write(m); } }
    return out;
  };
  r.del = async (...keys: string[]) => {
    const out = await del(...keys);
    const m = load(); let changed = false;
    for (const k of keys) if (m[k]) { delete m[k]; changed = true; }
    if (changed) write(m);
    return out;
  };
}

export async function bootServer() {
  await redis.connect();
  keepSessions();
  await migrate();
  await matchMaker.setup();
  for (const m of MAP_NAMES) matchMaker.defineRoomType(roomOf(m), MapRoom as any, { map: m });
  await matchMaker.accept();
  const app = express();
  registerApi(app as any);
  return app;
}
