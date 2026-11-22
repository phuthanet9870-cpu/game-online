// Staff-only live-ops & moderation API. Every route: valid session + staff role + MFA-verified session.
// Every state change is written to the audit log. Admin secrets never reach player clients.
import type { IncomingMessage } from 'node:http';
import { DEFAULT_LIVE, contentCatalog, validateContentPatch, validateLiveConfig, weeklyEvent, type ContentPatch, type GameCore, type LiveConfig } from '@astra/shared';
import { pool, audit } from './db.js';
import { tokenHash } from './auth.js';
import { newSecret, verifyTotp } from './totp.js';

type Handler = (req: IncomingMessage, body: any, ip: string, token: string | null) => Promise<[number, unknown]>;
type Route = (method: string, path: RegExp, h: (m: RegExpMatchArray) => Handler) => void;

interface Staff { id: string; username: string; role: 'admin' | 'moderator'; mfa: boolean; totpEnabled: boolean; secret: string | null }
async function staffFor(token: string | null): Promise<Staff | null> {
  if (!token) return null;
  const r = await pool.query(`SELECT a.id, a.username, a.role, a.totp_enabled, a.totp_secret, s.mfa_ok FROM auth_sessions s JOIN accounts a ON a.id = s.account_id
    WHERE s.token_hash = $1 AND s.expires_at > now() AND a.role IN ('admin', 'moderator') AND NOT a.banned`, [tokenHash(token)]);
  const a = r.rows[0];
  return a ? { id: a.id, username: a.username, role: a.role, mfa: a.mfa_ok, totpEnabled: a.totp_enabled, secret: a.totp_secret } : null;
}

/** Make exactly one version active. Two statements in one transaction so the one-active unique index never sees two rows. */
async function activate(table: 'live_config' | 'content_patch', version: number) {
  const c = await pool.connect();
  try {
    await c.query('BEGIN');
    await c.query(`UPDATE ${table} SET active = FALSE WHERE active`);
    await c.query(`UPDATE ${table} SET active = TRUE WHERE version = $1`, [version]);
    await c.query('COMMIT');
  } catch (e) { await c.query('ROLLBACK'); throw e; } finally { c.release(); }
}

export async function loadActiveConfig(): Promise<LiveConfig> {
  const r = await pool.query('SELECT data FROM live_config WHERE active');
  const v = r.rows[0] ? validateLiveConfig(r.rows[0].data) : null;
  return v?.ok ? v.value : structuredClone(DEFAULT_LIVE);
}

export async function loadActiveContent(): Promise<ContentPatch | null> {
  const r = await pool.query('SELECT data FROM content_patch WHERE active');
  const v = r.rows[0] ? validateContentPatch(r.rows[0].data) : null;
  return v?.ok ? v.value : null;
}

export function registerAdmin(route: Route, core: GameCore) {
  /** Wraps a handler: requires staff role, MFA, and optionally admin. */
  const staff = (needAdmin: boolean, fn: (st: Staff, body: any, m: RegExpMatchArray, ip: string) => Promise<[number, unknown]>) => (m: RegExpMatchArray): Handler => async (_req, body, ip, token) => {
    const st = await staffFor(token);
    if (!st) return [403, { error: 'Staff only' }];
    if (!st.mfa) return [401, { error: 'MFA required', mfa: st.totpEnabled ? 'verify' : 'setup' }];
    if (needAdmin && st.role !== 'admin') return [403, { error: 'Admin role required' }];
    return fn(st, body, m, ip);
  };
  const log = (st: Staff, action: string, data: unknown) => audit({ accountId: st.id, charId: '', action: 'admin_' + action, data: { by: st.username, ...(data as object) } });

  // ── MFA: setup (first time) and verify (each session)
  route('GET', /^\/api\/admin\/me$/, () => async (_r, _b, _ip, token) => {
    const st = await staffFor(token);
    if (!st) return [403, { error: 'Staff only' }];
    return [200, { username: st.username, role: st.role, mfa: st.mfa, totpEnabled: st.totpEnabled }];
  });
  route('POST', /^\/api\/admin\/mfa\/setup$/, () => async (_r, _b, _ip, token) => {
    const st = await staffFor(token);
    if (!st) return [403, { error: 'Staff only' }];
    if (st.totpEnabled) return [409, { error: 'MFA already enabled' }];
    const secret = newSecret();
    await pool.query('UPDATE accounts SET totp_secret = $1 WHERE id = $2', [secret, st.id]);
    return [200, { secret, uri: `otpauth://totp/Astra:${encodeURIComponent(st.username)}?secret=${secret}&issuer=Astra` }];
  });
  route('POST', /^\/api\/admin\/mfa\/verify$/, () => async (_r, body, ip, token) => {
    const st = await staffFor(token);
    if (!st || !st.secret) return [403, { error: 'Start MFA setup first' }];
    if (!verifyTotp(st.secret, String(body?.code ?? ''))) { audit({ accountId: st.id, charId: '', action: 'admin_mfa_fail', data: { ip } }); return [401, { error: 'Invalid code' }]; }
    await pool.query('UPDATE accounts SET totp_enabled = TRUE WHERE id = $1', [st.id]);
    await pool.query('UPDATE auth_sessions SET mfa_ok = TRUE WHERE token_hash = $1', [tokenHash(token!)]);
    audit({ accountId: st.id, charId: '', action: 'admin_mfa_ok', data: { ip } });
    return [200, { ok: true }];
  });

  // ── Overview & analytics
  route('GET', /^\/api\/admin\/overview$/, staff(false, async () => {
    const [acc, ch, err] = await Promise.all([
      pool.query('SELECT count(*)::int n FROM accounts'),
      pool.query("SELECT count(*)::int n, count(*) FILTER (WHERE hardcore)::int hc, count(*) FILTER (WHERE dead)::int dead FROM characters WHERE deleted_at IS NULL"),
      pool.query("SELECT at, data FROM audit_log WHERE action IN ('error','persist_error') ORDER BY at DESC LIMIT 10"),
    ]);
    return [200, { stats: core.stats(), accounts: acc.rows[0].n, characters: ch.rows[0], live: core.live, weekly: weeklyEvent(Date.now(), core.live.weeklyOverride), guilds: core.guilds.size, listings: [...core.listings.values()].filter((l) => l.status === 'active').length, errors: err.rows }];
  }));
  route('GET', /^\/api\/admin\/analytics$/, staff(false, async () => {
    const [classes, levels, runs, econ, deaths] = await Promise.all([
      pool.query("SELECT cls, count(*)::int n, round(avg(level),1)::float avg_level FROM characters WHERE deleted_at IS NULL GROUP BY cls ORDER BY n DESC"),
      pool.query("SELECT width_bucket(level, 1, 101, 10) b, count(*)::int n FROM characters WHERE deleted_at IS NULL GROUP BY b ORDER BY b"),
      pool.query("SELECT data->>'mode' mode, count(*) FILTER (WHERE (data->>'won')::boolean)::int won, count(*) FILTER (WHERE NOT (data->>'won')::boolean)::int lost, round(avg((data->>'secs')::int))::int avg_secs FROM audit_log WHERE action='run_end' AND at > now() - interval '7 days' GROUP BY 1 ORDER BY 2 DESC"),
      pool.query("SELECT coalesce(sum((data->>'gold')::bigint),0)::bigint gold, coalesce(sum((data->>'dust')::bigint),0)::bigint dust FROM characters WHERE deleted_at IS NULL"),
      pool.query("SELECT count(*)::int n FROM audit_log WHERE action='hardcore_death' AND at > now() - interval '7 days'"),
    ]);
    return [200, { classes: classes.rows, levelBuckets: levels.rows, runs7d: runs.rows, economy: econ.rows[0], hardcoreDeaths7d: deaths.rows[0].n }];
  }));

  // ── Players & moderation
  route('GET', /^\/api\/admin\/players$/, staff(false, async (_st, _b, _m) => [200, { error: 'Use POST with { q }' }]));
  route('POST', /^\/api\/admin\/players$/, staff(false, async (_st, body) => {
    const q = String(body?.q ?? '').slice(0, 32);
    const r = await pool.query(`SELECT a.id account_id, a.username, a.role, a.banned, a.muted_until, c.id char_id, c.name, c.cls, c.level, c.hardcore, c.dead
      FROM accounts a LEFT JOIN characters c ON c.account_id = a.id AND c.deleted_at IS NULL
      WHERE lower(a.username) LIKE lower($1) OR lower(c.name) LIKE lower($1) ORDER BY a.username LIMIT 50`, [`%${q}%`]);
    return [200, { rows: r.rows }];
  }));
  route('GET', /^\/api\/admin\/character\/([A-Za-z0-9]+)$/, staff(false, async (st, _b, m) => {
    const c = await pool.query('SELECT data, created_at, updated_at FROM characters WHERE id = $1', [m[1]]);
    if (!c.rows[0]) return [404, { error: 'Not found' }];
    const a = await pool.query("SELECT at, action, data FROM audit_log WHERE char_id = $1 ORDER BY at DESC LIMIT 50", [m[1]]);
    log(st, 'view_character', { char: m[1] }); // privacy: every inspection is logged
    return [200, { character: c.rows[0].data, created: c.rows[0].created_at, updated: c.rows[0].updated_at, audit: a.rows }];
  }));
  route('POST', /^\/api\/admin\/moderate$/, staff(false, async (st, body) => {
    const accountId = String(body?.accountId ?? '');
    const action = String(body?.action ?? '');
    const reason = String(body?.reason ?? '').slice(0, 300);
    if (!reason) return [400, { error: 'A reason is required' }];
    const target = await pool.query('SELECT role FROM accounts WHERE id = $1', [accountId]);
    if (!target.rows[0]) return [404, { error: 'Account not found' }];
    if (target.rows[0].role !== 'player' && st.role !== 'admin') return [403, { error: 'Only admins can moderate staff' }];
    if ((action === 'ban' || action === 'unban') && st.role !== 'admin') return [403, { error: 'Bans require the admin role' }];
    switch (action) {
      case 'mute': { const minutes = Math.max(1, Math.min(60 * 24 * 30, Number(body?.minutes) || 60)); const until = Date.now() + minutes * 60_000; await pool.query('UPDATE accounts SET muted_until = $1 WHERE id = $2', [new Date(until), accountId]); core.muteAccount(accountId, until); break; }
      case 'unmute': await pool.query('UPDATE accounts SET muted_until = NULL WHERE id = $1', [accountId]); core.muteAccount(accountId, 0); break;
      case 'kick': core.kickAccount(accountId, `Disconnected by a moderator: ${reason}`); break;
      case 'ban': await pool.query('UPDATE accounts SET banned = TRUE, ban_reason = $1 WHERE id = $2', [reason, accountId]); await pool.query('DELETE FROM auth_sessions WHERE account_id = $1', [accountId]); core.kickAccount(accountId, 'This account has been suspended. You may appeal through support.'); break;
      case 'unban': await pool.query('UPDATE accounts SET banned = FALSE, ban_reason = NULL WHERE id = $1', [accountId]); break;
      default: return [400, { error: 'Unknown action' }];
    }
    log(st, 'moderate', { target: accountId, action, reason, minutes: body?.minutes });
    return [200, { ok: true }];
  }));
  route('POST', /^\/api\/admin\/announce$/, staff(false, async (st, body) => {
    const text = String(body?.text ?? '').replace(/[\u0000-\u001f]/g, '').trim().slice(0, 300);
    if (!text) return [400, { error: 'Empty announcement' }];
    core.announce(text);
    log(st, 'announce', { text });
    return [200, { ok: true, delivered: core.sessions.size }];
  }));

  // ── Live config: validate → preview diff → publish new version; rollback re-activates an old one
  route('GET', /^\/api\/admin\/config$/, staff(false, async () => {
    const r = await pool.query('SELECT l.version, l.data, l.note, l.created_at, l.active, a.username FROM live_config l LEFT JOIN accounts a ON a.id = l.created_by ORDER BY version DESC LIMIT 30');
    return [200, { active: core.live, history: r.rows }];
  }));
  route('POST', /^\/api\/admin\/config\/preview$/, staff(true, async (_st, body) => {
    const v = validateLiveConfig(body?.config);
    if (!v.ok) return [400, { error: v.reason }];
    const diff: Array<[string, unknown, unknown]> = [];
    const walk = (a: any, b: any, p: string) => { for (const k of new Set([...Object.keys(a ?? {}), ...Object.keys(b ?? {})])) { const x = a?.[k], y = b?.[k]; if (x && typeof x === 'object' && !Array.isArray(x)) walk(x, y, p + k + '.'); else if (JSON.stringify(x) !== JSON.stringify(y)) diff.push([p + k, x, y]); } };
    walk(core.live, v.value, '');
    return [200, { ok: true, diff }];
  }));
  route('POST', /^\/api\/admin\/config$/, staff(true, async (st, body) => {
    const v = validateLiveConfig(body?.config);
    if (!v.ok) return [400, { error: v.reason }];
    const c = await pool.connect();
    let version = 0;
    try {
      await c.query('BEGIN');
      await c.query('UPDATE live_config SET active = FALSE WHERE active');
      version = (await c.query('INSERT INTO live_config (data, note, created_by, active) VALUES ($1, $2, $3, TRUE) RETURNING version', [JSON.stringify(v.value), String(body?.note ?? '').slice(0, 200), st.id])).rows[0].version;
      await c.query('COMMIT');
    } catch (e) { await c.query('ROLLBACK'); throw e; } finally { c.release(); }
    core.setLive(v.value);
    log(st, 'config_publish', { version, note: body?.note });
    return [200, { ok: true, version }];
  }));
  route('POST', /^\/api\/admin\/config\/rollback$/, staff(true, async (st, body) => {
    const version = Number(body?.version);
    const r = await pool.query('SELECT data FROM live_config WHERE version = $1', [version]);
    if (!r.rows[0]) return [404, { error: 'Version not found' }];
    const v = validateLiveConfig(r.rows[0].data);
    if (!v.ok) return [400, { error: `Stored version is invalid: ${v.reason}` }];
    await activate('live_config', version);
    core.setLive(v.value);
    log(st, 'config_rollback', { version });
    return [200, { ok: true }];
  }));
  // ── Content tuning: catalog with baselines, preview diff, versioned publish, rollback (admin only)
  route('GET', /^\/api\/admin\/content$/, staff(false, async () => {
    const r = await pool.query('SELECT c.version, c.note, c.created_at, c.active, a.username FROM content_patch c LEFT JOIN accounts a ON a.id = c.created_by ORDER BY version DESC LIMIT 30');
    return [200, { active: core.contentPatch ?? {}, catalog: contentCatalog(), history: r.rows }];
  }));
  route('POST', /^\/api\/admin\/content\/preview$/, staff(true, async (_st, body) => {
    const v = validateContentPatch(body?.patch);
    if (!v.ok) return [400, { error: v.reason }];
    const flat = (p: ContentPatch | null) => { const out: Record<string, unknown> = {}; for (const [cat, recs] of Object.entries(p ?? {})) for (const [id, fields] of Object.entries(recs as object)) { if (fields && typeof fields === 'object') for (const [k, val] of Object.entries(fields)) out[`${cat}.${id}.${k}`] = val; else out[`${cat}.${id}`] = fields; } return out; };
    const a = flat(core.contentPatch), b = flat(v.value);
    const diff = [...new Set([...Object.keys(a), ...Object.keys(b)])].filter((k) => JSON.stringify(a[k]) !== JSON.stringify(b[k])).map((k) => [k, a[k] ?? '(default)', b[k] ?? '(default)']);
    return [200, { ok: true, diff }];
  }));
  route('POST', /^\/api\/admin\/content$/, staff(true, async (st, body) => {
    const v = validateContentPatch(body?.patch);
    if (!v.ok) return [400, { error: v.reason }];
    if (!String(body?.note ?? '').trim()) return [400, { error: 'A change note is required' }];
    const c = await pool.connect();
    let version = 0;
    try {
      await c.query('BEGIN');
      await c.query('UPDATE content_patch SET active = FALSE WHERE active');
      version = (await c.query('INSERT INTO content_patch (data, note, created_by, active) VALUES ($1, $2, $3, TRUE) RETURNING version', [JSON.stringify(v.value), String(body.note).slice(0, 200), st.id])).rows[0].version;
      await c.query('COMMIT');
    } catch (e) { await c.query('ROLLBACK'); throw e; } finally { c.release(); }
    core.setContent(v.value);
    log(st, 'content_publish', { version, note: body.note });
    return [200, { ok: true, version }];
  }));
  route('POST', /^\/api\/admin\/content\/rollback$/, staff(true, async (st, body) => {
    const version = Number(body?.version);
    if (version === 0) { await pool.query('UPDATE content_patch SET active = FALSE'); core.setContent(null); log(st, 'content_rollback', { version: 'baseline' }); return [200, { ok: true }]; }
    const r = await pool.query('SELECT data FROM content_patch WHERE version = $1', [version]);
    if (!r.rows[0]) return [404, { error: 'Version not found' }];
    const v = validateContentPatch(r.rows[0].data);
    if (!v.ok) return [400, { error: `Stored version is invalid: ${v.reason}` }];
    await activate('content_patch', version);
    core.setContent(v.value);
    log(st, 'content_rollback', { version });
    return [200, { ok: true }];
  }));
  route('GET', /^\/api\/admin\/audit$/, staff(false, async (_st, _b, _m) => {
    const r = await pool.query("SELECT a.at, a.action, a.char_id, a.data, acc.username FROM audit_log a LEFT JOIN accounts acc ON acc.id = a.account_id ORDER BY a.at DESC LIMIT 200");
    return [200, { rows: r.rows }];
  }));
}
