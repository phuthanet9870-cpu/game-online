import pg from 'pg';
import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { AccountProgress, CharacterData } from '@astra/shared';

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

export async function saveCharacter(ch: CharacterData): Promise<void> {
  await pool.query('UPDATE characters SET data = $1, level = $2, dead = $3, version = $4, updated_at = now() WHERE id = $5 AND account_id = $6 AND deleted_at IS NULL', [
    JSON.stringify(ch), ch.level, ch.dead, ch.version, ch.id, ch.accountId,
  ]);
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
