import { ColyseusTestServer } from "@colyseus/testing";
import type { GameServerModule } from "@game/core";
import { createHost, type Host } from "./app";

export interface TestHost extends Host {
  colyseus: ColyseusTestServer;
  /** Base URL of the test server's HTTP API, e.g. http://localhost:2568/api */
  apiUrl: string;
  register(username: string, password?: string): Promise<{ token: string; account: { id: number; username: string } }>;
  shutdown(): Promise<void>;
}

/** Boot a full host on an in-memory database (or DATABASE_URL_TEST when set) for integration tests. */
export async function createTestHost(games: GameServerModule[], port = 2568): Promise<TestHost> {
  const databaseUrl = process.env.DATABASE_URL_TEST || undefined;
  if (databaseUrl) {
    // Start each test host from an empty schema on the shared test database.
    const { createDatabase } = await import("./platform/db");
    const db = await createDatabase({ url: databaseUrl });
    await db.query("DROP SCHEMA public CASCADE");
    await db.query("CREATE SCHEMA public");
    await db.close();
  }
  const host = await createHost({ games, databaseUrl });
  // boot() ignores its port argument for Server instances, so listen directly.
  await host.server.listen(port);
  const colyseus = new ColyseusTestServer(host.server);
  const apiUrl = `http://localhost:${port}/api`;
  return {
    ...host,
    colyseus,
    apiUrl,
    async register(username, password = "password123") {
      const res = await fetch(`${apiUrl}/auth/register`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ username, password }),
      });
      if (!res.ok) throw new Error(`register failed: ${res.status} ${await res.text()}`);
      return res.json();
    },
    async shutdown() {
      await colyseus.shutdown();
      await host.db.close();
    },
  };
}
