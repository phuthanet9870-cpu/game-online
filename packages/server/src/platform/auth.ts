import { createHash, randomBytes, scrypt as scryptCb, timingSafeEqual } from "node:crypto";
import { promisify } from "node:util";
import type { Account, Database } from "@game/core";

const scrypt = promisify(scryptCb) as (password: string, salt: Buffer, keylen: number, options: object) => Promise<Buffer>;

const SCRYPT = { N: 16384, r: 8, p: 1, maxmem: 64 * 1024 * 1024 };
const KEY_LENGTH = 32;
const SESSION_DAYS = 30;
const USERNAME = /^[a-z0-9_]{3,20}$/;
const MAX_FAILURES = 8;
const FAILURE_WINDOW_MS = 10 * 60 * 1000;

export class AuthError extends Error {
  constructor(readonly status: number, message: string) {
    super(message);
  }
}

export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(16);
  const key = await scrypt(password, salt, KEY_LENGTH, SCRYPT);
  return `scrypt$${SCRYPT.N}$${salt.toString("base64")}$${key.toString("base64")}`;
}

export async function verifyPassword(password: string, stored: string): Promise<boolean> {
  const [algo, n, salt, hash] = stored.split("$");
  if (algo !== "scrypt" || !salt || !hash) return false;
  const expected = Buffer.from(hash, "base64");
  const key = await scrypt(password, Buffer.from(salt, "base64"), expected.length, { ...SCRYPT, N: Number(n) });
  return timingSafeEqual(key, expected);
}

const hashToken = (token: string) => createHash("sha256").update(token).digest("base64url");

export function normalizeUsername(username: unknown): string {
  return typeof username === "string" ? username.trim().toLowerCase() : "";
}

/** Accounts and session tokens. Tokens are random; only their hashes are stored. */
export class AuthService {
  /** Failed logins per username, for throttling guessing. In-memory: per process. */
  private failures = new Map<string, number[]>();

  constructor(private readonly db: Database) {}

  async register(usernameInput: unknown, password: unknown): Promise<{ token: string; account: Account }> {
    const username = normalizeUsername(usernameInput);
    if (!USERNAME.test(username)) throw new AuthError(400, "ชื่อผู้ใช้ต้องมี 3–20 ตัว ใช้ได้เฉพาะ a-z, 0-9 และ _");
    if (typeof password !== "string" || password.length < 8 || password.length > 128) {
      throw new AuthError(400, "รหัสผ่านต้องยาว 8–128 ตัวอักษร");
    }
    const hash = await hashPassword(password);
    const { rows } = await this.db.query<{ id: number }>(
      `INSERT INTO accounts (username, password_hash) VALUES ($1, $2)
       ON CONFLICT (username) DO NOTHING RETURNING id`,
      [username, hash],
    );
    if (rows.length === 0) throw new AuthError(409, "ชื่อผู้ใช้นี้มีคนใช้แล้ว");
    const account = { id: rows[0].id, username };
    return { token: await this.createSession(account.id), account };
  }

  async login(usernameInput: unknown, password: unknown): Promise<{ token: string; account: Account }> {
    const username = normalizeUsername(usernameInput);
    const now = Date.now();
    const recent = (this.failures.get(username) ?? []).filter((t) => now - t < FAILURE_WINDOW_MS);
    if (recent.length >= MAX_FAILURES) throw new AuthError(429, "ลองผิดหลายครั้งเกินไป รอ 10 นาทีแล้วลองใหม่");

    const { rows } = await this.db.query<{ id: number; password_hash: string }>(
      "SELECT id, password_hash FROM accounts WHERE username = $1",
      [username],
    );
    const ok = rows.length > 0 && typeof password === "string" && (await verifyPassword(password, rows[0].password_hash));
    if (!ok) {
      this.failures.set(username, [...recent, now]);
      throw new AuthError(401, "ชื่อผู้ใช้หรือรหัสผ่านไม่ถูกต้อง");
    }
    this.failures.delete(username);
    await this.db.query("UPDATE accounts SET last_login_at = now() WHERE id = $1", [rows[0].id]);
    return { token: await this.createSession(rows[0].id), account: { id: rows[0].id, username } };
  }

  async authenticate(token: string | undefined): Promise<Account | null> {
    if (!token) return null;
    const { rows } = await this.db.query<{ id: number; username: string }>(
      `SELECT a.id, a.username FROM sessions s JOIN accounts a ON a.id = s.account_id
       WHERE s.token_hash = $1 AND s.expires_at > now()`,
      [hashToken(token)],
    );
    return rows[0] ?? null;
  }

  async logout(token: string | undefined): Promise<void> {
    if (token) await this.db.query("DELETE FROM sessions WHERE token_hash = $1", [hashToken(token)]);
  }

  private async createSession(accountId: number): Promise<string> {
    const token = randomBytes(32).toString("base64url");
    await this.db.query(
      `INSERT INTO sessions (token_hash, account_id, expires_at) VALUES ($1, $2, now() + make_interval(days => $3))`,
      [hashToken(token), accountId, SESSION_DAYS],
    );
    await this.db.query("DELETE FROM sessions WHERE account_id = $1 AND expires_at < now()", [accountId]);
    return token;
  }
}
