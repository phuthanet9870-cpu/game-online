// End-to-end bot: plays the real online protocol against a running server.
// Usage: tsx apps/server/test/bot.ts [baseUrl] [class] [--bots N]  (N>1 = simple load test)
import WebSocket from 'ws';
import { PROTOCOL_VERSION, clearPath, findPath, lineOfSight, type GameMap } from '@astra/shared';

const base = process.argv[2] ?? 'http://localhost:8080';
const cls = process.argv[3] ?? 'warrior';
const mode = process.argv.includes('--mode') ? process.argv[process.argv.indexOf('--mode') + 1]! : 'rift';
const nBots = Number(process.argv[process.argv.indexOf('--bots') + 1] || 1) || 1;
const log = (...a: unknown[]) => console.log(new Date().toISOString().slice(11, 19), ...a);

async function api(path: string, method = 'GET', body?: unknown, token?: string) {
  const r = await fetch(base + path, { method, headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) }, body: body ? JSON.stringify(body) : undefined });
  const j: any = await r.json();
  if (!r.ok) throw new Error(`${path}: ${j.error}`);
  return j;
}

async function runBot(i: number, full: boolean) {
  const user = `bot${Date.now().toString(36)}${i}`;
  const { token } = await api('/api/register', 'POST', { username: user, password: 'botpassword1' });
  await api('/api/characters', 'POST', { name: 'B' + user.slice(-12), cls, hardcore: false }, token);
  const me = await api('/api/me', 'GET', undefined, token);
  const charId = me.characters[0].id;
  const ws = new WebSocket(base.replace('http', 'ws') + '/ws');
  let map = null as GameMap | null, pid = 0, roomKind = '', ents: any[] = [], self: any = null, char: any = null, drops: any[] = [];
  const results = { kills: 0, bossKilled: false, runEnd: null as any, errors: new Map<string, number>(), snaps: 0, level: 1, items: 0 };
  ws.on('message', (d) => {
    const m = JSON.parse(String(d));
    if (m.t === 'welcome') { map = m.map; pid = m.pid; roomKind = m.room.kind; char = m.char; log(`[${i}] welcome ${m.room.kind} ${m.room.id} lvl ${m.room.level} mods=${m.room.modifiers}`); }
    if (m.t === 'snap') { ents = m.ents; self = m.self; drops = m.drops; results.snaps++; }
    if (m.t === 'char') { char = m.char; results.kills = m.char.stats.kills; results.level = m.char.level; results.items = m.char.inventory.filter(Boolean).length; }
    if (m.t === 'ev') for (const e of m.list) { if (e.t === 'it_add' && map) map.interactables.push(e.it); if (e.t === 'kill' ) results.kills++; if (e.t === 'boss_killed') results.bossKilled = true; }
    if (m.t === 'err') results.errors.set(m.msg, (results.errors.get(m.msg) ?? 0) + 1);
    if (m.t === 'run_end') results.runEnd = m;
    if (m.t === 'activity' && full) log(`[${i}] arena wave ${m.wave}`);
    if (m.t === 'toast' && full) log(`[${i}] toast: ${m.msg}`);
  });
  await new Promise((r) => ws.on('open', r));
  const send = (m: any) => ws.readyState === ws.OPEN && ws.send(JSON.stringify(m));
  send({ t: 'auth', v: PROTOCOL_VERSION, token, char: charId });
  const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
  const mePos = () => { const e = ents.find((x) => x[0] === pid); return e ? { x: e[2], y: e[3], hp: e[5], mhp: e[6], dead: e[14] } : null; };
  while (!map || !mePos()) await sleep(50);
  let rid = 0;
  const walkTo = async (tx: number, ty: number, timeout = 30000, fight = false) => {
    const t0 = Date.now();
    let path: Array<[number, number]> | null = null, pathT = 0;
    while (Date.now() - t0 < timeout) {
      const p = mePos();
      if (!p || !map) { await sleep(50); continue; }
      if (Math.hypot(p.x - tx, p.y - ty) < 50) { send({ t: 'input', mx: 0, my: 0, ax: tx, ay: ty, atk: false }); return true; }
      if (fight) { const foe = nearestFoe(p, 260); if (foe) { await engage(foe[0]); continue; } }
      if (!path || Date.now() - pathT > 1500) { path = findPath(map, p.x, p.y, tx, ty, 20000); pathT = Date.now(); }
      const wp = path?.find((w) => Math.hypot(w[0] - p.x, w[1] - p.y) > 20) ?? [tx, ty];
      const dx = wp[0] - p.x, dy = wp[1] - p.y, l = Math.hypot(dx, dy) || 1;
      send({ t: 'input', mx: dx / l, my: dy / l, ax: wp[0], ay: wp[1], atk: false });
      await sleep(50);
    }
    return false;
  };
  const nearestFoe = (p: { x: number; y: number }, r: number) => ents.filter((e) => e[1] === 1 && e[8] !== 'dummy' && !e[14] && lineOfSight(map!, p.x, p.y, e[2], e[3])).map((e) => ({ e, d: Math.hypot(e[2] - p.x, e[3] - p.y) })).filter((o) => o.d < r).sort((a, b) => a.d - b.d)[0]?.e;
  let lastDbg = 0;
  const engage = async (id: number) => {
    const t0 = Date.now();
    while (Date.now() - t0 < 25000) {
      const p = mePos(); const f = ents.find((e) => e[0] === id);
      if (!p || !f || f[14]) break;
      if (p.dead) { await sleep(200); continue; }
      const d = Math.hypot(f[2] - p.x, f[3] - p.y);
      const want = cls === 'mage' || cls === 'ranger' || cls === 'necromancer' ? 220 : 50;
      let dx = f[2] - p.x, dy = f[3] - p.y;
      const los = clearPath(map!, p.x, p.y, f[2], f[3], 14);
      if (!los) { const path = findPath(map!, p.x, p.y, f[2], f[3], 20000); const wp = path?.find((w) => Math.hypot(w[0] - p.x, w[1] - p.y) > 20); if (wp) { dx = wp[0] - p.x; dy = wp[1] - p.y; } }
      const l = Math.hypot(dx, dy) || 1;
      const mv = d > want || !los ? [dx / l, dy / l] : [0, 0];
      send({ t: 'input', mx: mv[0], my: mv[1], ax: f[2], ay: f[3], atk: true });
      if (self) { for (let s = 0; s < 8; s++) if (char?.loadout.active[s] && (self.cdA?.[s] ?? 1) === 0 && Math.random() < 0.3) send({ t: 'cast', k: 'a', s, ax: f[2], ay: f[3], tid: id, rid: `${rid++}` }); for (let s = 0; s < 4; s++) if (char?.loadout.ultimate[s] && (self.cdU?.[s] ?? 1) === 0 && Math.random() < 0.2) send({ t: 'cast', k: 'u', s, ax: f[2], ay: f[3], tid: id }); }
      if (p.hp < p.mhp * 0.4) send({ t: 'potion' });
      if (full && Date.now() - lastDbg > 3000) { lastDbg = Date.now(); log(`   engage ${f[8]} hp ${f[5]}/${f[6]} d=${d | 0} los=${los} me ${p.x},${p.y} hp ${p.hp}`); }
      for (const dr of drops) if (dr[3] !== 'gold' && Math.hypot(dr[1] - p.x, dr[2] - p.y) < 100) send({ t: 'pickup', id: dr[0] });
      await sleep(60);
    }
    send({ t: 'input', mx: 0, my: 0, ax: 0, ay: 0, atk: false });
  };
  const portal = (map as unknown as GameMap).interactables.find((x) => x.type === 'portal_dungeon')!;
  log(`[${i}] walking to Rift Gate`);
  if (!(await walkTo(portal.x, portal.y + 40))) throw new Error('could not reach portal');
  send({ t: 'enter_dungeon', diff: 'story', mode, rid: 'e1' });
  const t0 = Date.now();
  while (roomKind !== 'dungeon' && Date.now() - t0 < 5000) await sleep(50);
  if (roomKind !== 'dungeon') throw new Error('did not enter dungeon ' + [...results.errors.keys()]);
  if (mode !== 'rift') { // arena etc.: fight until the run ends
    const until = Date.now() + 120000;
    while (Date.now() < until && !results.runEnd) { const p = mePos(); const f = p && nearestFoe(p, 900); if (f) await engage(f[0]); else await sleep(200); }
    ws.close();
    return results;
  }
  if (!full) { // load-test bots just fight around for a while
    const until = Date.now() + 45000;
    while (Date.now() < until) { const p = mePos(); const f = p && nearestFoe(p, 900); if (f) await engage(f[0]); else await sleep(200); }
    ws.close();
    return results;
  }
  // full run: visit rooms in order, fight, then boss
  const m = map as GameMap;
  const order = [...m.rooms].sort((a, b) => (a.type === 'boss' ? 1 : 0) - (b.type === 'boss' ? 1 : 0));
  for (const r of order) {
    log(`[${i}] → room ${r.id} (${r.type}) kills=${results.kills} lvl=${results.level}`);
    await walkTo(r.cx * 32 + 16, r.cy * 32 + 16, 90000, true);
    let p = mePos();
    for (let k = 0; k < 30 && p; k++) { const f = nearestFoe(p, 520); if (!f) break; await engage(f[0]); p = mePos(); }
    if (r.type === 'shrine' || r.type === 'treasure' || r.type === 'rest') { send({ t: 'interact' }); await sleep(300); }
  }
  // pick up drops, then exit
  const exit = (map as GameMap).interactables.find((x) => x.type === 'exit');
  log(`[${i}] boss killed=${results.bossKilled} exit=${!!exit}`);
  if (exit) { await walkTo(exit.x, exit.y, 20000); send({ t: 'interact' }); }
  await sleep(1500);
  ws.close();
  return results;
}

const t0 = Date.now();
const all = await Promise.allSettled(Array.from({ length: nBots }, (_, i) => runBot(i, nBots === 1)));
for (const [i, r] of all.entries()) {
  if (r.status === 'rejected') { console.log(`bot ${i} FAILED:`, r.reason); continue; }
  const v = r.value;
  console.log(`bot ${i}: kills=${v.kills} boss=${v.bossKilled} level=${v.level} items=${v.items} snaps=${v.snaps} runEnd=${v.runEnd ? JSON.stringify(v.runEnd.retained) + ' cleared=' + v.runEnd.cleared : 'none'} errors=${JSON.stringify([...v.errors])}`);
}
console.log(`done in ${((Date.now() - t0) / 1000).toFixed(1)}s`);
process.exit(all.some((r) => r.status === 'rejected') ? 1 : 0);
