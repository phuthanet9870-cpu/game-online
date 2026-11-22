import pg from 'pg';
import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { AccountProgress, CharacterData, Guild, Listing, PersistTx } from '@astra/shared';

export const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL ?? 'postgres://astra:astra_dev@localhost:5432/astra', max: 10 });

export async function migrate(): Promise<string[]> {
  const here = dirname(fileURLToPath(import.meta.url));
  const dir = [join(here, 'migrations'), join(here, '../migrations')].find((d) => existsSync(d));
  if (!dir) throw new Error('migrations directory not found');
  const client = await pool.connect();
  const applied: string[] = [];
  try {
    await client.query('CREATE TABLE IF NOT EXISTS schema_migrations (version TEXT PRIMARY KEY, applied_at TIMESTAMPTZ NOT NULL DEFAULT now())');
    const done = new Set((await client.query('SELECT version FROM schema_migrations')).rows.map((r) => r.version as string));
    for (const f of readdirSync(dir).filter((x) => x.endsWith('.sql')).sort()) {
      if (done.has(f)) continue;
      await client.query('BEGIN');
      try {
        await client.query(readFileSync(join(dir, f), 'utf8'));
        await client.query('INSERT INTO schema_migrations (version) VALUES ($1)', [f]);
        await client.query('COMMIT');
        applied.push(f);
      } catch (e) {
        await client.query('ROLLBACK');
        throw e;
      }
    }
  } finally {
    client.release();
  }
  return applied;
}

/** Serialize writes per key so two saves of the same character can never commit out of order. */
const chains = new Map<string, Promise<unknown>>();
function serialized<T>(keys: string[], fn: () => Promise<T>): Promise<T> {
  const prev = Promise.all(keys.map((k) => chains.get(k) ?? Promise.resolve()).map((p) => p.catch(() => {})));
  const next = prev.then(fn);
  for (const k of keys) {
    const tail = next.catch(() => {});
    chains.set(k, tail);
    void tail.then(() => { if (chains.get(k) === tail) chains.delete(k); });
  }
  return next;
}

const SAVE_CHAR = 'UPDATE characters SET data = $1, level = $2, dead = $3, version = $4, updated_at = now() WHERE id = $5 AND account_id = $6 AND deleted_at IS NULL';
const charArgs = (ch: CharacterData) => [JSON.stringify(ch), ch.level, ch.dead, ch.version, ch.id, ch.accountId];

export function saveCharacter(ch: CharacterData): Promise<void> {
  const snapshot = charArgs(ch); // capture state now, write in order
  return serialized(['c:' + ch.id], async () => { await pool.query(SAVE_CHAR, snapshot); });
}

/** One SQL transaction for multi-object changes (trades, auction, guilds). All or nothing. */
export function transact(tx: PersistTx): Promise<void> {
  const chars = (tx.characters ?? []).map(charArgs);
  const listings = (tx.listings ?? []).map((l) => [l.id, l.sellerChar, l.sellerAccount, l.item.uid, l.price, l.hardcore, l.status, JSON.stringify(l), new Date(l.createdAt), new Date(l.expiresAt)]);
  const guilds = (tx.guilds ?? []).map((g) => [g.id, g.name, g.tag, g.hardcore, JSON.stringify(g)]);
  const keys = [...(tx.characters ?? []).map((c) => 'c:' + c.id), ...(tx.listings ?? []).map((l) => 'l:' + l.id), ...(tx.guilds ?? []).map((g) => 'g:' + g.id), ...(tx.deleteGuilds ?? []).map((g) => 'g:' + g)];
  return serialized(keys, async () => {
    const c = await pool.connect();
    try {
      await c.query('BEGIN');
      for (const a of chars) await c.query(SAVE_CHAR, a);
      for (const a of listings) await c.query(`INSERT INTO auction_listings (id, seller_char, seller_account, item_uid, price, hardcore, status, data, created_at, expires_at)
        VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) ON CONFLICT (id) DO UPDATE SET status = EXCLUDED.status, data = EXCLUDED.data, updated_at = now()`, a);
      for (const a of guilds) await c.query(`INSERT INTO guilds (id, name, tag, hardcore, data) VALUES ($1,$2,$3,$4,$5)
        ON CONFLICT (id) DO UPDATE SET data = EXCLUDED.data, updated_at = now()`, a);
      for (const id of tx.deleteGuilds ?? []) await c.query('DELETE FROM guilds WHERE id = $1', [id]);
      await c.query('COMMIT');
    } catch (e) {
      await c.query('ROLLBACK');
      console.error(JSON.stringify({ level: 'error', msg: 'transaction failed', err: String(e) }));
      throw e;
    } finally {
      c.release();
    }
  });
}

export async function loadShared(): Promise<{ guilds: Guild[]; listings: Listing[] }> {
  const [g, l] = await Promise.all([pool.query('SELECT data FROM guilds'), pool.query("SELECT data FROM auction_listings WHERE status <> 'closed'")]);
  return { guilds: g.rows.map((r) => r.data as Guild), listings: l.rows.map((r) => r.data as Listing) };
}

export async function saveAccount(accountId: string, prog: AccountProgress): Promise<void> {
  await pool.query('UPDATE accounts SET progress = $1 WHERE id = $2', [JSON.stringify(prog), accountId]);
}

const auditQueue: Array<[string | null, string | null, string, string]> = [];
export function audit(e: { accountId: string; charId: string; action: string; data: unknown }) {
  auditQueue.push([e.accountId || null, e.charId || null, e.action, JSON.stringify(e.data ?? null)]);
}
/** Flush audit log in batches to keep the game loop free of per-event DB round trips. */
export async function flushAudit() {
  if (!auditQueue.length) return;
  const batch = auditQueue.splice(0, 500);
  const values: unknown[] = [];
  const rows = batch.map((r, i) => { values.push(...r); return `($${i * 4 + 1}, $${i * 4 + 2}, $${i * 4 + 3}, $${i * 4 + 4}::jsonb)`; });
  try {
    await pool.query(`INSERT INTO audit_log (account_id, char_id, action, data) VALUES ${rows.join(',')}`, values);
  } catch (e) {
    console.error(JSON.stringify({ level: 'error', msg: 'audit flush failed', err: String(e) }));
  }
}
