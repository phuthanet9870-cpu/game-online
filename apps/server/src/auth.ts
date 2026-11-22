import { randomBytes, scrypt as _scrypt, timingSafeEqual, createHash } from 'node:crypto';
import { promisify } from 'node:util';
import { pool } from './db.js';

const scrypt = promisify(_scrypt) as (pw: string, salt: Buffer, len: number, opts: object) => Promise<Buffer>;
const SCRYPT = { N: 16384, r: 8, p: 1, maxmem: 64 * 1024 * 1024 };
export const SESSION_DAYS = 14;

export async function hashPassword(pw: string): Promise<string> {
  const salt = randomBytes(16);
  const key = await scrypt(pw, salt, 64, SCRYPT);
  return `scrypt$${SCRYPT.N}$${salt.toString('base64')}$${key.toString('base64')}`;
}

export async function verifyPassword(pw: string, stored: string): Promise<boolean> {
  const [alg, n, saltB64, keyB64] = stored.split('$');
  if (alg !== 'scrypt' || !saltB64 || !keyB64) return false;
  const key = await scrypt(pw, Buffer.from(saltB64, 'base64'), 64, { ...SCRYPT, N: Number(n) });
  const expected = Buffer.from(keyB64, 'base64');
  return expected.length === key.length && timingSafeEqual(expected, key);
}

export const tokenHash = (t: string) => createHash('sha256').update(t).digest('hex');

export async function createSession(accountId: string, ip: string): Promise<string> {
  const token = randomBytes(32).toString('base64url');
  await pool.query("INSERT INTO auth_sessions (token_hash, account_id, expires_at, ip) VALUES ($1, $2, now() + ($3 || ' days')::interval, $4)", [tokenHash(token), accountId, String(SESSION_DAYS), ip]);
  return token;
}

export async function accountForToken(token: string | undefined | null): Promise<{ id: string; username: string; role: string; banned: boolean; progress: unknown } | null> {
  if (!token || token.length > 100) return null;
  const r = await pool.query(
    'SELECT a.id, a.username, a.role, a.banned, a.progress FROM auth_sessions s JOIN accounts a ON a.id = s.account_id WHERE s.token_hash = $1 AND s.expires_at > now()',
    [tokenHash(token)],
  );
  return r.rows[0] ?? null;
}

export async function revokeSession(token: string) {
  await pool.query('DELETE FROM auth_sessions WHERE token_hash = $1', [tokenHash(token)]);
}

export const USERNAME_RE = /^[A-Za-z0-9_]{3,20}$/;
export function validatePassword(pw: string): string | null {
  if (typeof pw !== 'string' || pw.length < 8) return 'Password must be at least 8 characters';
  if (pw.length > 128) return 'Password too long';
  return null;
}

/** Simple fixed-window rate limiter keyed by ip+bucket. */
const windows = new Map<string, { n: number; reset: number }>();
export function rateLimited(key: string, limit: number, windowMs: number): boolean {
  const now = Date.now();
  const w = windows.get(key);
  if (!w || w.reset < now) { windows.set(key, { n: 1, reset: now + windowMs }); return false; }
  w.n++;
  return w.n > limit;
}
setInterval(() => { const now = Date.now(); for (const [k, v] of windows) if (v.reset < now) windows.delete(k); }, 60_000).unref();
