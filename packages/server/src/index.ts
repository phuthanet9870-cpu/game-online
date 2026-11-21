import { createServer } from "./app";
import { GAMES } from "./games";

const port = Number(process.env.PORT ?? 2567);
const server = createServer(GAMES);
await server.listen(port);
console.log(`game server listening on http://localhost:${port} (games: ${GAMES.map((g) => g.id).join(", ")})`);
