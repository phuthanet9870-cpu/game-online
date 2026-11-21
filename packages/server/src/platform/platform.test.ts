import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { AuthService, hashPassword, verifyPassword } from "./auth";
import { createDatabase, type ClosableDatabase } from "./db";
import { PLATFORM_MIGRATIONS, runMigrations } from "./migrations";
import { LocalSessionRegistry } from "./sessions";

describe("platform", () => {
  let db: ClosableDatabase;
  let auth: AuthService;

  beforeEach(async () => {
    db = await createDatabase({ url: process.env.DATABASE_URL_TEST || undefined });
    if (process.env.DATABASE_URL_TEST) {
      await db.query("DROP SCHEMA public CASCADE");
      await db.query("CREATE SCHEMA public");
    }
    await runMigrations(db, PLATFORM_MIGRATIONS);
    auth = new AuthService(db);
  });
  afterEach(() => db.close());

  it("applies each migration once", async () => {
    expect(await runMigrations(db, PLATFORM_MIGRATIONS)).toEqual([]);
    const extra = { id: "test/001", sql: "CREATE TABLE t1 (id int);\nCREATE TABLE t2 (id int);" };
    expect(await runMigrations(db, [...PLATFORM_MIGRATIONS, extra])).toEqual(["test/001"]);
  });

  it("rolls back a failed migration completely", async () => {
    const bad = { id: "test/bad", sql: "CREATE TABLE half (id int);\nSELECT * FROM missing_table;" };
    await expect(runMigrations(db, [bad])).rejects.toThrow();
    const { rows } = await db.query("SELECT to_regclass('half') AS t");
    expect(rows[0]).toEqual({ t: null });
  });

  it("hashes passwords with a salt and verifies them", async () => {
    const a = await hashPassword("hunter2hunter2");
    expect(a).not.toEqual(await hashPassword("hunter2hunter2"));
    expect(await verifyPassword("hunter2hunter2", a)).toBe(true);
    expect(await verifyPassword("wrong-password", a)).toBe(false);
  });

  it("registers, logs in, authenticates and logs out", async () => {
    const reg = await auth.register("  Alice_01 ", "password123");
    expect(reg.account.username).toBe("alice_01");
    expect(await auth.authenticate(reg.token)).toEqual(reg.account);

    const login = await auth.login("ALICE_01", "password123");
    expect(login.token).not.toBe(reg.token);
    await auth.logout(login.token);
    expect(await auth.authenticate(login.token)).toBeNull();
    expect(await auth.authenticate(reg.token)).toEqual(reg.account);
    expect(await auth.authenticate("not-a-token")).toBeNull();
    expect(await auth.authenticate(undefined)).toBeNull();
  });

  it("rejects bad usernames, short passwords and duplicates", async () => {
    await expect(auth.register("ab", "password123")).rejects.toMatchObject({ status: 400 });
    await expect(auth.register("bad name", "password123")).rejects.toMatchObject({ status: 400 });
    await expect(auth.register("bob", "short")).rejects.toMatchObject({ status: 400 });
    await auth.register("bob", "password123");
    await expect(auth.register("BOB", "password123")).rejects.toMatchObject({ status: 409 });
  });

  it("throttles repeated wrong passwords", async () => {
    await auth.register("carol", "password123");
    for (let i = 0; i < 8; i++) await expect(auth.login("carol", "nope-nope")).rejects.toMatchObject({ status: 401 });
    await expect(auth.login("carol", "password123")).rejects.toMatchObject({ status: 429 });
  });
});

describe("LocalSessionRegistry", () => {
  it("evicts the previous holder before granting a new claim", async () => {
    const registry = new LocalSessionRegistry();
    const events: string[] = [];
    await registry.claim(1, async () => void events.push("evict first"));
    await registry.claim(1, async () => void events.push("evict second"));
    events.push("second claimed");
    await registry.claim(2, async () => {});
    expect(events).toEqual(["evict first", "second claimed"]);
  });

  it("does not evict after the holder released", async () => {
    const registry = new LocalSessionRegistry();
    let evicted = false;
    const release = await registry.claim(1, async () => void (evicted = true));
    release();
    await registry.claim(1, async () => {});
    expect(evicted).toBe(false);
  });

  it("serialises simultaneous claims so exactly one holder remains", async () => {
    const registry = new LocalSessionRegistry();
    const evicted: number[] = [];
    await Promise.all([1, 2, 3].map((n) => registry.claim(7, async () => void evicted.push(n))));
    expect(evicted.sort()).toHaveLength(2);
  });
});
