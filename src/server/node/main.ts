/**
 * Node entry point: serves the built client over HTTP and runs the game
 * server over WebSocket on the same port.
 *   PORT=8080 DB_PATH=data/game.db node dist/server.mjs
 */
import { createServer } from 'node:http';
import { readFile, mkdir } from 'node:fs/promises';
import { extname, join, normalize, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { WebSocketServer } from 'ws';
import { GameServer } from '../GameServer.ts';
import { SqliteStorage } from '../storage/sqlite.ts';
import { consoleLogger } from '../util.ts';

const PORT = Number(process.env.PORT ?? 8080);
const DB_PATH = process.env.DB_PATH ?? 'data/game.db';
const here = dirname(fileURLToPath(import.meta.url));
const PUBLIC_DIR = join(here, 'public');
const MAX_MSG_BYTES = 4096;

const MIME: Record<string, string> = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.png': 'image/png' };

async function main() {
  if (DB_PATH !== ':memory:') await mkdir(dirname(DB_PATH), { recursive: true });
  const storage = new SqliteStorage(DB_PATH);
  const game = new GameServer({ storage, name: process.env.SERVER_NAME ?? 'Aether-1', mode: 'online', logger: consoleLogger, gmPassphrase: process.env.GM_PASSPHRASE || null });
  consoleLogger.info(process.env.GM_PASSPHRASE ? 'GM enabled (GM_PASSPHRASE set)' : 'GM disabled (set GM_PASSPHRASE to enable)');
  await game.init();
  game.start();

  const http = createServer(async (req, res) => {
    const url = new URL(req.url ?? '/', 'http://x');
    if (url.pathname === '/health') {
      res.writeHead(200, { 'content-type': 'application/json' });
      res.end(JSON.stringify({ ok: true, online: game.onlineCount(), tick: game.stats }));
      return;
    }
    const rel = normalize(url.pathname === '/' ? '/index.html' : url.pathname).replace(/^(\.\.[/\\])+/, '');
    const file = join(PUBLIC_DIR, rel);
    if (!file.startsWith(PUBLIC_DIR)) { res.writeHead(403); res.end(); return; }
    try {
      const body = await readFile(file);
      res.writeHead(200, { 'content-type': MIME[extname(file)] ?? 'application/octet-stream', 'cache-control': 'no-cache' });
      res.end(body);
    } catch {
      res.writeHead(404); res.end('not found');
    }
  });

  const wss = new WebSocketServer({ server: http, path: '/ws', maxPayload: MAX_MSG_BYTES });
  let connSeq = 0;
  wss.on('connection', (ws, req) => {
    const id = `ws-${++connSeq}`;
    let alive = true;
    game.connect({
      id,
      send: (m) => { if (ws.readyState === ws.OPEN) ws.send(JSON.stringify(m)); },
      close: () => ws.close(4000, 'closed by server'),
    });
    consoleLogger.info(`connect ${id} ${req.socket.remoteAddress}`);
    ws.on('message', (data, isBinary) => {
      if (isBinary) { ws.close(4001, 'binary not supported'); return; }
      game.message(id, data.toString());
    });
    ws.on('pong', () => { alive = true; });
    const hb = setInterval(() => {
      if (!alive) { ws.terminate(); return; }
      alive = false;
      ws.ping();
    }, 15000);
    ws.on('close', () => { clearInterval(hb); game.disconnect(id); consoleLogger.info(`disconnect ${id}`); });
    ws.on('error', () => { /* close follows */ });
  });

  http.listen(PORT, () => consoleLogger.info(`THE POWER: ETERNAL WAR server on http://localhost:${PORT} (db: ${DB_PATH})`));

  const shutdown = async () => {
    consoleLogger.info('shutting down, saving players...');
    wss.close();
    await game.stop();
    await storage.close();
    process.exit(0);
  };
  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);
}

main().catch((e) => { console.error(e); process.exit(1); });
