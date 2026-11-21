import { createHost } from "./app";
import { GAMES } from "./games";

const port = Number(process.env.PORT ?? 2567);
const databaseUrl = process.env.DATABASE_URL || undefined;
const { server, db } = await createHost({
  games: GAMES,
  databaseUrl,
  // Without DATABASE_URL, keep dev data in a local PGlite folder (git-ignored).
  dataDir: databaseUrl ? undefined : (process.env.PGLITE_DIR ?? new URL("../../../.data/pglite", import.meta.url).pathname),
});
await server.listen(port);
console.log(`game server listening on http://localhost:${port} (games: ${GAMES.map((g) => g.id).join(", ")}; db: ${databaseUrl ? "postgres" : "pglite"})`);

let stopping = false;
for (const signal of ["SIGINT", "SIGTERM"] as const) {
  process.on(signal, async () => {
    if (stopping) return;
    stopping = true;
    // Gracefully disconnects rooms first, so each one saves its players.
    await server.gracefullyShutdown(false).catch((err) => console.error(err));
    await db.close();
    process.exit(0);
  });
}
