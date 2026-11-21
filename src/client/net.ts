/**
 * Client transports. Both deliver the same protocol:
 *  - WsTransport: real online play against the Node server.
 *  - LocalTransport: the real GameServer running in a Web Worker (or on the
 *    main thread if workers are unavailable), with optional simulated latency.
 */
import type { ClientMessage, ServerMessage } from '../shared/protocol.ts';
import type { MemorySnapshot } from '../server/storage/memory.ts';

export interface Transport {
  readonly kind: 'online' | 'local-worker' | 'local-thread';
  send(m: ClientMessage): void;
  onMessage: (m: ServerMessage) => void;
  onClose: (reason: string) => void;
  close(): void;
  latencyMs: number;
}

export class WsTransport implements Transport {
  readonly kind = 'online' as const;
  onMessage: (m: ServerMessage) => void = () => {};
  onClose: (reason: string) => void = () => {};
  latencyMs = 0;
  private ws: WebSocket;
  private queue: string[] = [];

  constructor(url: string) {
    this.ws = new WebSocket(url);
    this.ws.onopen = () => { for (const q of this.queue) this.ws.send(q); this.queue = []; };
    this.ws.onmessage = (ev) => {
      try { this.onMessage(JSON.parse(String(ev.data))); } catch (e) { console.error('bad server message', e); }
    };
    this.ws.onclose = (ev) => this.onClose(ev.reason || `closed (${ev.code})`);
    this.ws.onerror = () => {};
  }
  send(m: ClientMessage) {
    const s = JSON.stringify(m);
    if (this.ws.readyState === WebSocket.OPEN) this.ws.send(s);
    else if (this.ws.readyState === WebSocket.CONNECTING) this.queue.push(s);
  }
  close() { this.ws.close(); }
}

const STORE_KEY = 'tpew.localServer.v1';

function loadSnapshot(): MemorySnapshot | null {
  try { const s = localStorage.getItem(STORE_KEY); return s ? JSON.parse(s) : null; } catch { return null; }
}
function saveSnapshot(s: MemorySnapshot) {
  try { localStorage.setItem(STORE_KEY, JSON.stringify(s)); } catch { /* storage unavailable: progress lives only for this tab */ }
}
export function clearLocalSave() { try { localStorage.removeItem(STORE_KEY); } catch { /* ignore */ } }

declare const __WORKER_SRC__: string | undefined;

export class LocalTransport implements Transport {
  kind: 'local-worker' | 'local-thread' = 'local-worker';
  onMessage: (m: ServerMessage) => void = () => {};
  onClose: (reason: string) => void = () => {};
  /** One-way simulated latency, applied in both directions. */
  latencyMs = 0;
  private worker: Worker | null = null;
  private thread: { send(d: unknown): void; close(): void } | null = null;
  private outbox: unknown[] = [];
  private ready = false;

  async start(): Promise<void> {
    const snapshot = loadSnapshot();
    const workerSrc = typeof __WORKER_SRC__ === 'string' ? __WORKER_SRC__ : null;
    if (workerSrc && typeof Worker !== 'undefined') {
      try {
        const url = URL.createObjectURL(new Blob([workerSrc], { type: 'text/javascript' }));
        const w = new Worker(url);
        await new Promise<void>((resolve, reject) => {
          const t = setTimeout(() => reject(new Error('worker boot timeout')), 8000);
          w.onerror = (e) => { clearTimeout(t); reject(new Error(e.message || 'worker error')); };
          w.onmessage = (ev) => {
            const m = ev.data as { t: string; data?: ServerMessage; snapshot?: MemorySnapshot };
            if (m.t === 'ready') { clearTimeout(t); resolve(); }
            else if (m.t === 'msg' && m.data) this.deliver(m.data);
            else if (m.t === 'persist' && m.snapshot) saveSnapshot(m.snapshot);
          };
          w.postMessage({ t: 'boot', snapshot });
        });
        this.worker = w;
        this.kind = 'local-worker';
        this.flush();
        return;
      } catch (e) {
        console.warn('Web Worker unavailable, running server on main thread:', e);
      }
    }
    const { createLocalServer } = await import('../server/worker/main.ts');
    this.thread = await createLocalServer(snapshot, (m) => this.deliver(m as ServerMessage), saveSnapshot);
    this.kind = 'local-thread';
    this.flush();
  }

  private flush() {
    this.ready = true;
    for (const m of this.outbox) this.post(m);
    this.outbox = [];
  }

  private post(data: unknown) {
    // structured clone round trip keeps client & server state strictly separate
    const copy = JSON.parse(JSON.stringify(data));
    const go = () => (this.worker ? this.worker.postMessage({ t: 'msg', data: copy }) : this.thread?.send(copy));
    if (this.latencyMs > 0) setTimeout(go, this.latencyMs); else go();
  }

  private deliver(m: ServerMessage) {
    const copy = JSON.parse(JSON.stringify(m)) as ServerMessage;
    if (this.latencyMs > 0) setTimeout(() => this.onMessage(copy), this.latencyMs); else this.onMessage(copy);
  }

  send(m: ClientMessage) {
    if (!this.ready) this.outbox.push(m);
    else this.post(m);
  }
  close() {
    this.worker?.postMessage({ t: 'close' });
    this.worker?.terminate();
    this.thread?.close();
  }
}
