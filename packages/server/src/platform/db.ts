import pg from "pg";
import type { PGlite } from "@electric-sql/pglite";
import type { Database } from "@game/core";

export interface ClosableDatabase extends Database {
  close(): Promise<void>;
}

/**
 * PostgreSQL when `url` is set; otherwise PGlite (Postgres compiled to WASM)
 * stored in `dataDir`, or in memory when `dataDir` is omitted. Both speak the
 * same SQL, so dev and tests need no database server.
 */
export async function createDatabase(opts: { url?: string; dataDir?: string } = {}): Promise<ClosableDatabase> {
  if (opts.url) return postgres(opts.url);
  const { PGlite } = await import("@electric-sql/pglite");
  return pglite(new PGlite(opts.dataDir));
}

function postgres(url: string): ClosableDatabase {
  const pool = new pg.Pool({ connectionString: url, max: 10 });
  const wrap = (run: (sql: string, params?: unknown[]) => Promise<pg.QueryResult>): Database => ({
    async query<T>(sql: string, params?: unknown[]) {
      const result = await run(sql, params);
      return { rows: result.rows as T[] };
    },
    async transaction() {
      throw new Error("nested transactions are not supported");
    },
  });
  return {
    ...wrap((sql, params) => pool.query(sql, params as any[])),
    async transaction(fn) {
      const client = await pool.connect();
      try {
        await client.query("BEGIN");
        const result = await fn(wrap((sql, params) => client.query(sql, params as any[])));
        await client.query("COMMIT");
        return result;
      } catch (err) {
        await client.query("ROLLBACK").catch(() => {});
        throw err;
      } finally {
        client.release();
      }
    },
    close: () => pool.end(),
  };
}

function pglite(db: PGlite): ClosableDatabase {
  // PGlite runs one query at a time; transactions must not interleave with other queries.
  return {
    async query<T>(sql: string, params?: unknown[]) {
      const result = await db.query<T>(sql, params as any[]);
      return { rows: result.rows };
    },
    async transaction(fn) {
      return db.transaction((tx) =>
        fn({
          async query<T>(sql: string, params?: unknown[]) {
            const result = await tx.query<T>(sql, params as any[]);
            return { rows: result.rows };
          },
          async transaction() {
            throw new Error("nested transactions are not supported");
          },
        }),
      );
    },
    close: () => db.close(),
  };
}
