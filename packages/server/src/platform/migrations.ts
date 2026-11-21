import type { Database, Migration } from "@game/core";

/** Tables the host itself owns. Games add their own through GameServerModule.migrations. */
export const PLATFORM_MIGRATIONS: Migration[] = [
  {
    id: "platform/001_accounts",
    sql: `
      CREATE TABLE accounts (
        id            SERIAL PRIMARY KEY,
        username      TEXT NOT NULL UNIQUE,
        password_hash TEXT NOT NULL,
        created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
        last_login_at TIMESTAMPTZ
      );
      CREATE TABLE sessions (
        token_hash TEXT PRIMARY KEY,
        account_id INTEGER NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
        created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
        expires_at TIMESTAMPTZ NOT NULL
      );
      CREATE INDEX sessions_account_idx ON sessions(account_id);
    `,
  },
];

/** Apply each migration that has not run yet, each in its own transaction. Returns the ids applied. */
export async function runMigrations(db: Database, migrations: Migration[]): Promise<string[]> {
  const seen = new Set<string>();
  for (const m of migrations) {
    if (seen.has(m.id)) throw new Error(`duplicate migration id ${m.id}`);
    seen.add(m.id);
  }
  await db.query(`CREATE TABLE IF NOT EXISTS schema_migrations (
    id TEXT PRIMARY KEY, applied_at TIMESTAMPTZ NOT NULL DEFAULT now())`);
  const { rows } = await db.query<{ id: string }>("SELECT id FROM schema_migrations");
  const done = new Set(rows.map((r) => r.id));
  const applied: string[] = [];
  for (const m of migrations) {
    if (done.has(m.id)) continue;
    await db.transaction(async (tx) => {
      for (const statement of splitStatements(m.sql)) await tx.query(statement);
      await tx.query("INSERT INTO schema_migrations (id) VALUES ($1)", [m.id]);
    });
    applied.push(m.id);
  }
  return applied;
}

/** Split on semicolons at line ends. Migrations must not put semicolons inside strings or functions. */
function splitStatements(sql: string): string[] {
  return sql.split(/;\s*$/m).map((s) => s.trim()).filter(Boolean);
}
