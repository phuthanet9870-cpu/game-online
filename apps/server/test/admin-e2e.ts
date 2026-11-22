// Live staff-console test: role grant, MFA, config publish/rollback, maintenance lockout, mute, permissions.
import pg from 'pg';
import WebSocket from 'ws';
import { DEFAULT_LIVE, PROTOCOL_VERSION } from '@astra/shared';
import { totp } from '../src/totp.js';
const base = process.argv[2] ?? 'http://localhost:8080';
const db = new pg.Pool({ connectionString: process.env.DATABASE_URL ?? 'postgres://astra:astra_dev@localhost:5432/astra' });
const fail = (m: string) => { console.error('FAIL:', m); process.exit(1); };
async function call(method: string, path: string, token?: string, body?: unknown) {
  const r = await fetch(base + path, { method, headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) }, body: body ? JSON.stringify(body) : undefined });
  return { status: r.status, body: await r.json().catch(() => ({})) as any };
}
const stamp = Date.now().toString(36);
const staff = (await call('POST', '/api/register', undefined, { username: 'staff' + stamp, password: 'staffpassword1' })).body.token;
const player = (await call('POST', '/api/register', undefined, { username: 'pl' + stamp, password: 'playerpassword1' })).body.token;
await call('POST', '/api/characters', player, { name: 'P' + stamp.slice(-8), cls: 'mage', hardcore: false });
const pme = (await call('GET', '/api/me', player)).body;

if ((await call('GET', '/api/admin/overview', player)).status !== 403) fail('player reached admin API');
await db.query("UPDATE accounts SET role = 'admin' WHERE username = $1", ['staff' + stamp]);
let r = await call('GET', '/api/admin/overview', staff);
if (r.status !== 401 || r.body.mfa !== 'setup') fail('admin without MFA was not challenged');
const setup = await call('POST', '/api/admin/mfa/setup', staff);
if ((await call('POST', '/api/admin/mfa/verify', staff, { code: '000000' })).status !== 401) fail('wrong code accepted');
if ((await call('POST', '/api/admin/mfa/verify', staff, { code: totp(setup.body.secret) })).status !== 200) fail('valid code rejected');
r = await call('GET', '/api/admin/overview', staff);
if (r.status !== 200) fail('overview after MFA ' + r.status);
console.log('MFA ok · overview: sessions', r.body.stats.sessions, '· accounts', r.body.accounts);

const cfg = { ...DEFAULT_LIVE, maintenance: true, xpMul: 1.5 };
if ((await call('POST', '/api/admin/config', staff, { config: { ...cfg, xpMul: 99 }, note: 'bad' })).status !== 400) fail('invalid config accepted');
const prev = await call('POST', '/api/admin/config/preview', staff, { config: cfg });
console.log('preview diff:', JSON.stringify(prev.body.diff));
const pub = await call('POST', '/api/admin/config', staff, { config: cfg, note: 'maintenance test' });
if (!pub.body.version) fail('publish failed');
// a player cannot log in during maintenance
const blocked = await new Promise<string>((res) => { const ws = new WebSocket(base.replace('http', 'ws') + '/ws'); ws.on('open', () => ws.send(JSON.stringify({ t: 'auth', v: PROTOCOL_VERSION, token: player, char: pme.characters[0].id }))); ws.on('message', (d) => { const m = JSON.parse(String(d)); if (m.t === 'err') res(m.msg); if (m.t === 'welcome') res('WELCOME'); }); });
if (!/maintenance/.test(blocked)) fail('maintenance did not block login: ' + blocked);
console.log('maintenance blocks players:', blocked);
const hist = (await call('GET', '/api/admin/config', staff)).body.history;
const older = hist.find((h: any) => h.version !== pub.body.version);
if (older) { await call('POST', '/api/admin/config/rollback', staff, { version: older.version }); console.log('rolled back to', older.version); }
else { await call('POST', '/api/admin/config', staff, { config: DEFAULT_LIVE, note: 'restore defaults' }); console.log('restored defaults'); }
const after = await new Promise<string>((res) => { const ws = new WebSocket(base.replace('http', 'ws') + '/ws'); ws.on('open', () => ws.send(JSON.stringify({ t: 'auth', v: PROTOCOL_VERSION, token: player, char: pme.characters[0].id }))); ws.on('message', (d) => { const m = JSON.parse(String(d)); if (m.t === 'welcome') { res('WELCOME'); ws.close(); } if (m.t === 'err' && m.fatal) res(m.msg); }); });
if (after !== 'WELCOME') fail('login still blocked after rollback: ' + after);
console.log('login works after rollback');
const accId = (await db.query('SELECT id FROM accounts WHERE username = $1', ['pl' + stamp])).rows[0].id;
if ((await call('POST', '/api/admin/moderate', staff, { accountId: accId, action: 'mute', minutes: 5 })).status !== 400) fail('moderation without reason accepted');
if ((await call('POST', '/api/admin/moderate', staff, { accountId: accId, action: 'mute', minutes: 5, reason: 'spam test' })).status !== 200) fail('mute failed');
const mu = (await db.query('SELECT muted_until FROM accounts WHERE id = $1', [accId])).rows[0].muted_until;
if (!mu) fail('mute not persisted');
const an = await call('GET', '/api/admin/analytics', staff);
if (an.status !== 200) fail('analytics ' + an.status);
await new Promise((r) => setTimeout(r, 2300));
const logged = (await db.query("SELECT count(*)::int n FROM audit_log WHERE action LIKE 'admin_%' AND account_id = (SELECT id FROM accounts WHERE username = $1)", ['staff' + stamp])).rows[0].n;
console.log('mute persisted until', new Date(mu).toISOString(), '· analytics classes', an.body.classes.length, '· admin audit rows', logged);
if (logged < 4) fail('admin actions not audited');
await db.end();
console.log('PHASE 6 ADMIN E2E PASSED');
process.exit(0);
