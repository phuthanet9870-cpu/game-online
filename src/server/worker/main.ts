/**
 * In-browser server host. Runs the real GameServer (same code as Node) in a
 * Web Worker, or on the main thread as a fallback. Persistence goes to a
 * MemoryStorage whose snapshots the page saves to localStorage.
 */
import { GameServer } from '../GameServer.ts';
import { MemoryStorage, type MemorySnapshot } from '../storage/memory.ts';
import { consoleLogger } from '../util.ts';

export type LocalHostMessageIn = { t: 'boot'; snapshot: MemorySnapshot | null } | { t: 'msg'; data: unknown } | { t: 'close' }

export interface LocalServerHandle {
  /** Deliver a client message to the server. */
  send(data: unknown): void;
  close(): void;
}

/**
 * Create a local server. `deliver` receives server->client messages,
 * `persist` receives storage snapshots to save.
 */
export async function createLocalServer(snapshot: MemorySnapshot | null, deliver: (m: unknown) => void, persist: (s: MemorySnapshot) => void): Promise<LocalServerHandle> {
  let pending: ReturnType<typeof setTimeout> | null = null;
  let latest: MemorySnapshot | null = null;
  const storage = new MemoryStorage(snapshot, (s) => {
    latest = s;
    if (!pending) pending = setTimeout(() => { pending = null; if (latest) persist(latest); }, 500);
  });
  const game = new GameServer({ storage, name: 'Local (in-browser)', mode: 'local', logger: consoleLogger, hashIterations: 30_000, gmPassphrase: 'stefanonline' });
  await game.init();
  game.start();
  const connId = 'local-1';
  game.connect({ id: connId, send: (m) => deliver(m), close: () => {} });
  return {
    send: (data) => game.message(connId, data),
    close: () => { game.disconnect(connId); void game.stop(); },
  };
}

// Worker bootstrap (only when running inside a dedicated worker)
declare const self: { postMessage(m: unknown): void; onmessage: ((ev: { data: LocalHostMessageIn }) => void) | null } | undefined;
const isWorker = typeof self !== 'undefined' && typeof (globalThis as { WorkerGlobalScope?: unknown }).WorkerGlobalScope !== 'undefined';
if (isWorker && self) {
  const ctx = self;
  let handle: LocalServerHandle | null = null;
  ctx.onmessage = async (ev) => {
    const m = ev.data;
    if (m.t === 'boot') {
      handle = await createLocalServer(m.snapshot, (msg) => ctx.postMessage({ t: 'msg', data: msg }), (snap) => ctx.postMessage({ t: 'persist', snapshot: snap }));
      ctx.postMessage({ t: 'ready' });
    } else if (m.t === 'msg') handle?.send(m.data);
    else if (m.t === 'close') handle?.close();
  };
}
