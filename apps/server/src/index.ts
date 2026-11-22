import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { extname, join, normalize, resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { randomUUID } from 'node:crypto';
import { WebSocketServer, type WebSocket } from 'ws';
import {
  CLASS_IDS, CONTENT_SCHEMA_VERSION, GameCore, MAX_CHARACTERS, PROTOCOL_VERSION, SIM_DT, createCharacter, normalizeAccount, normalizeCharacter, type CharacterData, type ClassId,
} from '@astra/shared';
import { accountForToken, createSession, hashPassword, rateLimited, revokeSession, USERNAME_RE, validatePassword, verifyPassword } from './auth.js';
import { registerAdmin, loadActiveConfig, loadActiveContent } from './admin.js';
import { audit, flushAudit, loadShared, migrate, pool, saveAccount, saveCharacter, transact } from './db.js';

const PORT = Number(process.env.PORT ?? 8080);
const here = dirname(fileURLToPath(import.meta.url));
const STATIC_DIR = resolve(process.env.STATIC_DIR ?? [join(here, '../../client/dist'), join(here, '../client/dist')].find((d) => existsSync(d)) ?? join(here, 'public'));
const MAX_BODY = 16 * 1024;
const log = (level: string, msg: string, extra: Record<string, unknown> = {}) => console.log(JSON.stringify({ t: new Date().toISOString(), level, msg, ...extra }));

const core = new GameCore({ saveCharacter, saveAccount, audit, transact, loadShared }, { label: 'online' });

// ───────────────────────── HTTP ─────────────────────────
type Handler = (req: IncomingMessage, body: any, ip: string, token: string | null) => Promise<[number, unknown]>;
const routes: Array<{ method: string; path: RegExp; h: (m: RegExpMatchArray) => Handler }> = [];
const route = (method: string, path: RegExp, h: (m: RegExpMatchArray) => Handler) => routes.push({ method, path, h });

route('GET', /^\/api\/health$/, () => async () => [200, { ok: true, protocol: PROTOCOL_VERSION, content: CONTENT_SCHEMA_VERSION, ...core.stats() }]);

route('POST', /^\/api\/register$/, () => async (_req, body, ip) => {
  if (rateLimited('reg:' + ip, 10, 60 * 60_000)) return [429, { error: 'Too many registrations from this address. Try later.' }];
  const username = String(body?.username ?? '').trim();
  const password = String(body?.password ?? '');
  if (!USERNAME_RE.test(username)) return [400, { error: 'Username must be 3-20 letters, numbers or _' }];
  const pe = validatePassword(password);
  if (pe) return [400, { error: pe }];
  const hash = await hashPassword(password);
  try {
    const r = await pool.query('INSERT INTO accounts (username, pass_hash, progress) VALUES ($1, $2, $3) RETURNING id', [username, hash, JSON.stringify(normalizeAccount(null))]);
    const token = await createSession(r.rows[0].id, ip);
    audit({ accountId: r.rows[0].id, charId: '', action: 'register', data: { ip } });
    return [201, { token, username }];
  } catch (e: any) {
    if (e.code === '23505') return [409, { error: 'Username is taken' }];
    throw e;
  }
});

route('POST', /^\/api\/login$/, () => async (_req, body, ip) => {
  if (rateLimited('login:' + ip, 20, 10 * 60_000)) return [429, { error: 'Too many login attempts. Wait a few minutes.' }];
  const username = String(body?.username ?? '').trim();
  const r = await pool.query('SELECT id, pass_hash, banned FROM accounts WHERE lower(username) = lower($1)', [username]);
  const acc = r.rows[0];
  // Always run a hash comparison to avoid user-enumeration timing differences.
  const ok = acc ? await verifyPassword(String(body?.password ?? ''), acc.pass_hash) : (await verifyPassword('x', 'scrypt$16384$AAAAAAAAAAAAAAAAAAAAAA==$AAAA'), false);
  if (!ok) return [401, { error: 'Invalid username or password' }];
  if (acc.banned) return [403, { error: 'This account is suspended. Contact support to appeal.' }];
  await pool.query('UPDATE accounts SET last_login_at = now() WHERE id = $1', [acc.id]);
  const token = await createSession(acc.id, ip);
  audit({ accountId: acc.id, charId: '', action: 'login', data: { ip } });
  return [200, { token, username }];
});

route('POST', /^\/api\/logout$/, () => async (_req, _b, _ip, token) => { if (token) await revokeSession(token); return [200, { ok: true }]; });

route('GET', /^\/api\/me$/, () => async (_req, _b, _ip, token) => {
  const acc = await accountForToken(token);
  if (!acc) return [401, { error: 'Not logged in' }];
  const chars = await pool.query('SELECT data FROM characters WHERE account_id = $1 AND deleted_at IS NULL ORDER BY created_at', [acc.id]);
  return [200, { username: acc.username, role: acc.role, account: normalizeAccount(acc.progress as any), characters: chars.rows.map((r) => summarize(r.data)) }];
});

route('POST', /^\/api\/characters$/, () => async (_req, body, _ip, token) => {
  const acc = await accountForToken(token);
  if (!acc) return [401, { error: 'Not logged in' }];
  const count = await pool.query('SELECT count(*)::int AS n FROM characters WHERE account_id = $1 AND deleted_at IS NULL', [acc.id]);
  if (count.rows[0].n >= MAX_CHARACTERS) return [400, { error: `Character limit reached (${MAX_CHARACTERS})` }];
  const cls = String(body?.cls) as ClassId;
  if (!CLASS_IDS.includes(cls)) return [400, { error: 'Unknown class' }];
  const r = createCharacter(acc.id, String(body?.name ?? ''), cls, body?.hardcore === true);
  if (!r.ok) return [400, { error: r.reason }];
  const ch = r.value;
  try {
    await pool.query('INSERT INTO characters (id, account_id, name, cls, hardcore, level, data) VALUES ($1, $2, $3, $4, $5, $6, $7)', [ch.id, acc.id, ch.name, ch.cls, ch.hardcore, ch.level, JSON.stringify(ch)]);
  } catch (e: any) {
    if (e.code === '23505') return [409, { error: 'That name is taken' }];
    throw e;
  }
  audit({ accountId: acc.id, charId: ch.id, action: 'char_create', data: { cls, hardcore: ch.hardcore } });
  return [201, { character: summarize(ch) }];
});

route('DELETE', /^\/api\/characters\/([A-Za-z0-9]+)$/, (m) => async (_req, body, _ip, token) => {
  const acc = await accountForToken(token);
  if (!acc) return [401, { error: 'Not logged in' }];
  const r = await pool.query('SELECT name FROM characters WHERE id = $1 AND account_id = $2 AND deleted_at IS NULL', [m[1], acc.id]);
  if (!r.rows[0]) return [404, { error: 'Not found' }];
  if (String(body?.confirmName ?? '') !== r.rows[0].name) return [400, { error: 'Type the character name exactly to confirm deletion' }];
  for (const s of core.sessions.values()) if (s.char.id === m[1]) core.disconnect(s.id, 'Character deleted');
  await pool.query('UPDATE characters SET deleted_at = now() WHERE id = $1', [m[1]]);
  audit({ accountId: acc.id, charId: m[1]!, action: 'char_delete', data: null });
  return [200, { ok: true }];
});

route('GET', /^\/api\/ladder$/, () => async () => {
  const q = (hc: boolean) => pool.query("SELECT name, cls, level, dead, (data->'stats'->>'highestTier')::int AS tier FROM characters WHERE hardcore = $1 AND deleted_at IS NULL ORDER BY level DESC, updated_at ASC LIMIT 20", [hc]);
  const [n, h] = await Promise.all([q(false), q(true)]);
  return [200, { normal: n.rows, hardcore: h.rows }];
});

if (process.env.ASTRA_DEBUG === '1') {
  route('GET', /^\/api\/debug\/rooms$/, () => async () => [200, [...core.rooms.values()].filter((r) => r.kind === 'dungeon').map((r) => ({ id: r.id, ents: [...r.world.ents.values()].map((e) => ({ id: e.id, k: e.kind, def: e.e?.def.id ?? e.p?.char.cls, x: Math.round(e.x), y: Math.round(e.y), hp: Math.round(e.hp), lock: e.lock, dash: !!e.dash, st: e.statuses.map((s) => s.id + ':' + s.t.toFixed(1)), awake: e.e?.awake, pending: !!e.e?.pending, input: e.p?.input })) }))]);
}

registerAdmin(route, core);

function summarize(ch: CharacterData) {
  return { id: ch.id, name: ch.name, cls: ch.cls, level: ch.level, hardcore: ch.hardcore, dead: ch.dead, mastery: ch.mastery?.level ?? 1 };
}

const MIME: Record<string, string> = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml', '.png': 'image/png', '.json': 'application/json', '.webmanifest': 'application/manifest+json', '.ico': 'image/x-icon', '.woff2': 'font/woff2' };
const SECURITY_HEADERS = {
  'X-Content-Type-Options': 'nosniff',
  'Referrer-Policy': 'no-referrer',
  'X-Frame-Options': 'DENY',
  'Content-Security-Policy': "default-src 'self'; connect-src 'self' ws: wss:; img-src 'self' data:; style-src 'self' 'unsafe-inline'; script-src 'self'; frame-ancestors 'none'",
};

async function serveStatic(req: IncomingMessage, res: ServerResponse) {
  const urlPath = decodeURIComponent((req.url ?? '/').split('?')[0]!);
  let file = normalize(join(STATIC_DIR, urlPath));
  if (!file.startsWith(STATIC_DIR)) { res.writeHead(403).end(); return; }
  try { if ((await stat(file)).isDirectory()) file = join(file, 'index.html'); } catch { file = join(STATIC_DIR, 'index.html'); }
  try {
    const data = await readFile(file);
    const ext = extname(file);
    res.writeHead(200, { 'Content-Type': MIME[ext] ?? 'application/octet-stream', 'Cache-Control': ext === '.html' ? 'no-cache' : 'public, max-age=31536000, immutable', ...SECURITY_HEADERS });
    res.end(data);
  } catch {
    res.writeHead(404, { 'Content-Type': 'text/plain' }).end('Client build not found. Run `npm run build`.');
  }
}

const server = createServer(async (req, res) => {
  const ip = (req.headers['x-forwarded-for'] as string | undefined)?.split(',')[0]?.trim() || req.socket.remoteAddress || '?';
  const url = (req.url ?? '/').split('?')[0]!;
  if (!url.startsWith('/api/')) return serveStatic(req, res);
  const r = routes.find((x) => x.method === req.method && x.path.test(url));
  const send = (code: number, body: unknown) => { res.writeHead(code, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store', ...SECURITY_HEADERS }); res.end(JSON.stringify(body)); };
  if (!r) return send(404, { error: 'Not found' });
  if (rateLimited('api:' + ip, 300, 60_000)) return send(429, { error: 'Too many requests' });
  let raw = '';
  let size = 0;
  req.on('data', (c: Buffer) => { size += c.length; if (size > MAX_BODY) req.destroy(); else raw += c; });
  req.on('end', async () => {
    let body: unknown = null;
    try { body = raw ? JSON.parse(raw) : null; } catch { return send(400, { error: 'Invalid JSON' }); }
    const auth = req.headers.authorization;
    const token = auth?.startsWith('Bearer ') ? auth.slice(7) : null;
    try {
      const [code, out] = await r.h(url.match(r.path)!)(req, body, ip, token);
      send(code, out);
    } catch (e) {
      log('error', 'api error', { url, err: String((e as Error).stack ?? e) });
      send(500, { error: 'Internal error' });
    }
  });
});

// ───────────────────────── WebSocket ─────────────────────────
const wss = new WebSocketServer({ server, path: '/ws', maxPayload: 8 * 1024 });
wss.on('connection', (ws: WebSocket, req) => {
  const sid = randomUUID();
  let authed = false;
  const ip = req.socket.remoteAddress;
  const send = (m: any) => { if (ws.readyState !== ws.OPEN) return; ws.send(JSON.stringify(m)); if (m?.fatal) setTimeout(() => ws.close(4000, 'session ended'), 50); };
  const authTimer = setTimeout(() => { if (!authed) ws.close(4001, 'auth timeout'); }, 10_000);
  ws.on('message', async (data) => {
    let msg: any;
    try { msg = JSON.parse(String(data)); } catch { return; }
    if (!authed) {
      if (msg?.t !== 'auth') return;
      if (msg.v !== PROTOCOL_VERSION) { send({ t: 'err', msg: 'Client out of date — please refresh the page.', fatal: true }); ws.close(); return; }
      const acc = await accountForToken(String(msg.token ?? ''));
      if (!acc || acc.banned) { send({ t: 'err', msg: 'Session expired — log in again.', fatal: true }); ws.close(); return; }
      if (core.live.maintenance && acc.role === 'player') { send({ t: 'err', msg: 'Lumenhold is under maintenance. Please try again shortly.', fatal: true }); ws.close(); return; }
      const r = await pool.query('SELECT data FROM characters WHERE id = $1 AND account_id = $2 AND deleted_at IS NULL', [String(msg.char ?? ''), acc.id]);
      if (!r.rows[0]) { send({ t: 'err', msg: 'Character not found', fatal: true }); ws.close(); return; }
      authed = true;
      clearTimeout(authTimer);
      const ch = normalizeCharacter(r.rows[0].data as CharacterData);
      core.connect(sid, acc.id, ch, normalizeAccount(acc.progress as any), send);
      const mu = await pool.query('SELECT muted_until FROM accounts WHERE id = $1 AND muted_until > now()', [acc.id]);
      if (mu.rows[0]) core.muteAccount(acc.id, new Date(mu.rows[0].muted_until).getTime());
      log('info', 'session start', { sid, account: acc.id, char: ch.id, ip });
      return;
    }
    core.handle(sid, msg);
  });
  ws.on('close', () => { clearTimeout(authTimer); if (authed) { core.disconnect(sid); log('info', 'session end', { sid }); } });
  ws.on('error', () => ws.close());
});

// ───────────────────────── Game loop ─────────────────────────
let last = performance.now();
let acc = 0;
let slowTicks = 0;
setInterval(() => {
  const now = performance.now();
  acc += Math.min(0.25, (now - last) / 1000);
  last = now;
  while (acc >= SIM_DT) {
    const t0 = performance.now();
    core.tick(SIM_DT);
    if (performance.now() - t0 > SIM_DT * 1000) slowTicks++;
    acc -= SIM_DT;
  }
}, 1000 * SIM_DT / 2);
setInterval(() => { void flushAudit(); }, 2000);
setInterval(() => { const st = core.stats(); log('info', 'metrics', { sessions: st.sessions, rooms: st.rooms.length, slowTicks, rss: process.memoryUsage().rss }); slowTicks = 0; }, 60_000);

async function shutdown(sig: string) {
  log('info', 'shutdown', { sig });
  core.saveAll();
  await new Promise((r) => setTimeout(r, 500));
  await flushAudit();
  await pool.end();
  process.exit(0);
}
process.on('SIGINT', () => void shutdown('SIGINT'));
process.on('SIGTERM', () => void shutdown('SIGTERM'));

const applied = await migrate();
if (applied.length) log('info', 'migrations applied', { applied });
await core.init();
core.setLive(await loadActiveConfig());
core.setContent(await loadActiveContent());
log('info', 'shared state loaded', { guilds: core.guilds.size, listings: core.listings.size });
server.listen(PORT, () => log('info', 'listening', { port: PORT, static: STATIC_DIR }));
