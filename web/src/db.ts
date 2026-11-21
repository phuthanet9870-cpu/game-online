// Browser stand-in for server/src/db.ts: the same `db` (a pg.Pool look-alike) and `migrate()`, backed by PGlite in this tab.
// PGlite runs in memory. The game's rows (every table of the schema, as JSON, plus the sequences) are saved to IndexedDB
// a few seconds after writes and when the tab is hidden or closed, and put back after the migrations on the next start,
// so accounts and characters survive a reload. Saving rows instead of PGlite's data directory keeps a save at a few ms
// (the data directory is ~40 MB and took seconds). Without IndexedDB (private window, blocked storage) progress lasts
// until the tab closes.
// Results are shaped like node-postgres: { rows, rowCount, fields }, int8/numeric come back as strings, and a query without
// parameters may hold several statements (migrations). PGlite has one session, so every query and every checked-out client
// goes through one queue, like the desktop build's pool with max 1.
import { PGlite, types } from "@electric-sql/pglite";
import { assetBlob } from "./assets.ts";

const SCHEMA = `"ro"`;
const MIGRATIONS = import.meta.glob("../../server/migrations/*.sql", { query: "?raw", import: "default", eager: true }) as Record<string, string>;

// ---------- the saved copy in IndexedDB ----------
const IDB_NAME = "game-online", STORE = "save", KEY = "datadir";
let idbConn: Promise<IDBDatabase> | undefined;
function idb(): Promise<IDBDatabase> {
  return (idbConn ??= new Promise((ok, fail) => {
    const r = indexedDB.open(IDB_NAME, 1);
    r.onupgradeneeded = () => r.result.createObjectStore(STORE);
    r.onsuccess = () => ok(r.result);
    r.onerror = () => fail(r.error);
  }));
}
async function idbGet(): Promise<string | undefined> {
  const d = await idb();
  return new Promise((ok, fail) => { const r = d.transaction(STORE).objectStore(STORE).get(KEY); r.onsuccess = () => ok(r.result); r.onerror = () => fail(r.error); });
}
async function idbPut(v: string) {
  const d = await idb();
  return new Promise<void>((ok, fail) => { const t = d.transaction(STORE, "readwrite", { durability: "relaxed" }); t.objectStore(STORE).put(v, KEY); t.oncomplete = () => ok(); t.onerror = () => fail(t.error); });
}

export let persistent = true;

let saved: string | undefined;

async function open(): Promise<PGlite> {
  try {
    if (new URLSearchParams(location.search).has("memdb")) throw new Error("memdb requested");
    saved = await idbGet();
  } catch (e) {
    console.warn("[db] IndexedDB unavailable, progress will not be saved:", e);
    persistent = false;
  }
  // the game build ships PGlite's file-system bundle inside the packs (scripts/pack.mjs); the selftest build lets PGlite fetch it
  const fsBundle = assetBlob("/__pglite.data");
  return PGlite.create({ parsers: { [types.INT8]: (v: string) => v, [types.NUMERIC]: (v: string) => v }, ...(fsBundle ? { fsBundle } : {}) });
}

const lite = await open();
await lite.exec(`CREATE SCHEMA IF NOT EXISTS ${SCHEMA}; SET search_path TO ${SCHEMA}`);

type Result = { rows: any[]; rowCount: number; fields: { name: string }[] };

async function run(text: string, params?: unknown[]): Promise<Result> {
  if (params && params.length) {
    const r = await lite.query(text, params as any[]);
    return { rows: r.rows as any[], rowCount: r.affectedRows ?? r.rows.length, fields: r.fields };
  }
  const all = await lite.exec(text);
  const r = all[all.length - 1] ?? { rows: [], fields: [], affectedRows: 0 };
  return { rows: r.rows as any[], rowCount: r.affectedRows ?? r.rows.length, fields: r.fields };
}

// one queue for the single PGlite session
let tail: Promise<unknown> = Promise.resolve();
function lock(): Promise<() => void> {
  let release!: () => void;
  const held = new Promise<void>((ok) => (release = ok));
  const ready = tail.then(() => release);
  tail = tail.then(() => held);
  return ready;
}

// ---------- saving ----------
// the server writes often while playing (autosave every 30 s, loot, quests): batch them into one snapshot per 3 s
const SAVE_DELAY_MS = 3_000;
let dirty = false, saveTimer = 0, saving: Promise<void> | null = null;
const writes = (text: string) => !/^\s*(SELECT|SHOW)\b/i.test(text);
function touched(text: string) {
  if (!persistent || !writes(text)) return;
  dirty = true;
  if (!saveTimer) saveTimer = window.setTimeout(() => { saveTimer = 0; void save(); }, SAVE_DELAY_MS);
}
/** Saves the game's rows to IndexedDB. The snapshot takes the queue (between queries, a few ms); the write does not. */
export function save(): Promise<void> {
  if (!persistent || !dirty) return saving ?? Promise.resolve();
  return (saving ??= (async () => {
    try {
      const release = await lock();
      let json: string;
      try { dirty = false; json = await snapshot(); } finally { release(); }
      await idbPut(json);
      console.debug(`[db] saved ${(json.length / 1024).toFixed(0)} KB`);
    } catch (e) {
      dirty = true;
      console.warn("[db] save failed:", e);
    } finally {
      saving = null;
      if (dirty && !saveTimer) saveTimer = window.setTimeout(() => { saveTimer = 0; void save(); }, SAVE_DELAY_MS);
    }
  })());
}
addEventListener("visibilitychange", () => { if (document.visibilityState === "hidden") void save(); });
addEventListener("pagehide", () => void save());

export const db = {
  async query(text: string, params?: unknown[]): Promise<Result> {
    const release = await lock();
    try { return await run(text, params); } finally { release(); touched(text); }
  },
  async connect() {
    const release = await lock();
    let done = false, wrote = false;
    return {
      query: (text: string, params?: unknown[]) => { if (writes(text)) wrote = true; return run(text, params); },
      release: () => { if (!done) { done = true; release(); if (wrote) touched("UPDATE"); } },
    };
  },
  async end() { await lite.close(); },
};

type Snapshot = { tables: Record<string, Record<string, unknown>[]>; sequences: [string, string | null][] };

/** Every row of the game's tables as JSON (call holding the queue). */
async function snapshot(): Promise<string> {
  const tables = (await run(`SELECT table_name FROM information_schema.tables WHERE table_schema = 'ro' AND table_type = 'BASE TABLE' AND table_name <> 'schema_migrations'`)).rows.map((r) => r.table_name as string);
  const out: Snapshot = { tables: {}, sequences: [] };
  for (const t of tables) out.tables[t] = (await run(`SELECT coalesce(json_agg(snap_row), '[]'::json) AS j FROM "${t}" snap_row`)).rows[0].j;
  out.sequences = (await run(`SELECT sequencename, last_value::text FROM pg_sequences WHERE schemaname = 'ro'`)).rows.map((r) => [r.sequencename, r.last_value]);
  return JSON.stringify(out);
}

/** Puts a snapshot back into freshly migrated tables. Columns a newer migration added get their defaults. */
async function restore(json: string) {
  const snap: Snapshot = JSON.parse(json);
  const c = await db.connect();
  try {
    await c.query("BEGIN");
    await c.query("SET LOCAL session_replication_role = replica"); // no FK checks / triggers while tables fill in any order
    for (const [t, rows] of Object.entries(snap.tables)) {
      if (!rows.length) continue;
      const have = new Set((await c.query(`SELECT column_name FROM information_schema.columns WHERE table_schema = 'ro' AND table_name = $1`, [t])).rows.map((r) => r.column_name));
      if (!have.size) continue; // table dropped since
      const cols = Object.keys(rows[0] ?? {}).filter((k) => have.has(k)).map((k) => `"${k.replace(/"/g, "")}"`).join(", ");
      if (!cols) { console.warn("[db] restore: no columns for", t, Object.keys(rows[0] ?? {}), [...have]); continue; }
      await c.query(`INSERT INTO "${t}" (${cols}) SELECT ${cols} FROM json_populate_recordset(null::"${t}", $1::json)`, [JSON.stringify(rows)]);
    }
    for (const [seq, v] of snap.sequences) if (v !== null) await c.query(`SELECT setval($1, $2::bigint)`, [`"ro"."${seq}"`, v]);
    await c.query("COMMIT");
  } catch (e) {
    await c.query("ROLLBACK");
    throw e;
  } finally {
    c.release();
  }
}

export async function migrate() {
  await db.query(`CREATE TABLE IF NOT EXISTS schema_migrations (name text PRIMARY KEY, applied_at timestamptz NOT NULL DEFAULT now())`);
  const done = new Set((await db.query("SELECT name FROM schema_migrations")).rows.map((r) => r.name));
  for (const path of Object.keys(MIGRATIONS).sort()) {
    const f = path.replace(/^.*\//, "");
    if (done.has(f)) continue;
    const c = await db.connect();
    try {
      await c.query("BEGIN");
      await c.query(MIGRATIONS[path]);
      await c.query("INSERT INTO schema_migrations (name) VALUES ($1)", [f]);
      await c.query("COMMIT");
    } catch (e) {
      await c.query("ROLLBACK");
      throw e;
    } finally {
      c.release();
    }
  }
  if (saved) {
    try { await restore(saved); }
    catch (e) { console.error("[db] the saved game could not be loaded, starting fresh:", e); }
    saved = undefined;
  }
  dirty = false;
}
