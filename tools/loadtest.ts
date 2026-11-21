/**
 * Load test: N bot players join the world, then walk and fight for a while.
 * Usage: npx tsx tools/loadtest.ts [bots=50] [seconds=30] [server=http://localhost:2567]
 * Prints the server's tick timing (from /api/games/world/stats) at the end.
 */
import { Client } from "@colyseus/sdk";
import { WORLD_ROOM, WorldState } from "../games/world/src/shared";

const bots = Number(process.argv[2] ?? 50);
const seconds = Number(process.argv[3] ?? 30);
const server = process.argv[4] ?? "http://localhost:2567";
const api = `${server}/api`;
const run = Date.now().toString(36);

async function post(path: string, body: unknown, token?: string) {
  const res = await fetch(`${api}${path}`, {
    method: "POST",
    headers: { "content-type": "application/json", ...(token ? { authorization: `Bearer ${token}` } : {}) },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`${path}: ${res.status} ${await res.text()}`);
  return res.json();
}

async function bot(i: number) {
  const { token } = await post("/auth/register", { username: `bot_${run}_${i}`, password: "password123" });
  const { character } = await post("/games/world/characters", { name: `Bot${run.slice(-4)}${i}`, color: i % 8 }, token);
  const sdk = new Client(server);
  sdk.auth.token = token;
  const room = await sdk.joinOrCreate(WORLD_ROOM, { characterId: character.id }, WorldState);
  let hits = 0;
  room.onMessage("hits", (h: unknown[]) => (hits += h.length));
  for (const t of ["inventory", "notice", "chat"]) room.onMessage(t, () => {});
  const timer = setInterval(() => {
    const me = room.state.players.get(room.sessionId);
    if (!me) return;
    if (me.hp === 0) return room.send("revive", {});
    const r = Math.random();
    if (r < 0.5) {
      let best: string | null = null;
      let bestD = Infinity;
      for (const [id, m] of room.state.monsters.entries()) {
        const d = Math.max(Math.abs(m.x - me.x), Math.abs(m.y - me.y));
        if (d < bestD) { bestD = d; best = id; }
      }
      if (best) room.send("attack", { id: best });
    } else if (r < 0.8) {
      room.send("move", { x: Math.round(me.x) + Math.floor(Math.random() * 9) - 4, y: Math.round(me.y) + Math.floor(Math.random() * 9) - 4 });
    } else if (r < 0.85) {
      room.send("chat", { text: `bot ${i} says hi` });
    }
  }, 1000 + Math.random() * 500);
  return { room, timer, hits: () => hits };
}

const started = Date.now();
await fetch(`${api}/games/world/stats?reset=1`);
const players = [];
for (let i = 0; i < bots; i++) players.push(await bot(i));
console.log(`${bots} bots joined in ${((Date.now() - started) / 1000).toFixed(1)} s; running ${seconds} s…`);
await fetch(`${api}/games/world/stats?reset=1`);
await new Promise((r) => setTimeout(r, seconds * 1000));
const stats = await (await fetch(`${api}/games/world/stats`)).json();
const hits = players.reduce((n, p) => n + p.hits(), 0);
for (const p of players) {
  clearInterval(p.timer);
  await p.room.leave();
}
console.log(`server ticks: ${stats.ticks}, avg ${stats.avgTickMs} ms, max ${stats.maxTickMs} ms (budget 50 ms, goal avg < 10 ms)`);
console.log(`hit events received by bots: ${hits}`);
process.exit(0);
