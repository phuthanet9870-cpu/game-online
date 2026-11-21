import { GameServer } from '../src/server/GameServer.ts';
import { MemoryStorage } from '../src/server/storage/memory.ts';
import { silentLogger } from '../src/server/util.ts';
import { mulberry32 } from '../src/shared/rng.ts';
import type { ServerMessage } from '../src/shared/protocol.ts';
import type { Storage } from '../src/server/storage/types.ts';

export async function makeServer(storage: Storage = new MemoryStorage(), seed = 42) {
  let clock = 1_700_000_000_000;
  const server = new GameServer({ storage, logger: silentLogger, rng: mulberry32(seed), now: () => clock, hashIterations: 1000, mode: 'test' });
  await server.init();
  return { server, storage, advanceClock: (ms: number) => { clock += ms; } };
}

let connSeq = 0;
export class FakeClient {
  readonly id = `fake-${++connSeq}`;
  inbox: ServerMessage[] = [];
  closed = false;
  seq = 0;
  constructor(readonly server: GameServer) {
    server.connect({ id: this.id, send: (m) => this.inbox.push(JSON.parse(JSON.stringify(m))), close: () => { this.closed = true; } });
  }
  send(m: unknown) { this.server.message(this.id, JSON.stringify(m)); }
  sendRaw(m: unknown) { this.server.message(this.id, m); }
  last<T extends ServerMessage['t']>(t: T): Extract<ServerMessage, { t: T }> | undefined {
    for (let i = this.inbox.length - 1; i >= 0; i--) if (this.inbox[i].t === t) return this.inbox[i] as Extract<ServerMessage, { t: T }>;
    return undefined;
  }
  all<T extends ServerMessage['t']>(t: T): Extract<ServerMessage, { t: T }>[] {
    return this.inbox.filter((m) => m.t === t) as Extract<ServerMessage, { t: T }>[];
  }
  async waitFor<T extends ServerMessage['t']>(t: T, pred: (m: Extract<ServerMessage, { t: T }>) => boolean = () => true, timeoutMs = 3000) {
    const start = Date.now();
    let seen = 0;
    while (Date.now() - start < timeoutMs) {
      for (let i = seen; i < this.inbox.length; i++) {
        const m = this.inbox[i];
        if (m.t === t && pred(m as Extract<ServerMessage, { t: T }>)) { this.inbox.splice(0, i + 1); return m as Extract<ServerMessage, { t: T }>; }
      }
      seen = 0;
      await new Promise((r) => setTimeout(r, 2));
    }
    throw new Error(`timeout waiting for ${t}; inbox: ${this.inbox.map((m) => m.t + (m.t === 'error' ? ':' + (m as { code: string }).code : '')).join(',')}`);
  }
  input(mx: number, my: number, b = 0, ax = 1, ay = 0, vt = 0) {
    this.send({ t: 'in', s: ++this.seq, mx, my, ax, ay, b, vt });
  }
  /** register + create character + enter world */
  async join(user: string, charName = user.charAt(0).toUpperCase() + user.slice(1) + 'X', weapon = 'sword') {
    this.send({ t: 'hello', v: 1 });
    this.send({ t: 'register', user, pass: 'secret123' });
    await this.waitFor('auth_ok');
    this.send({ t: 'char_create', name: charName, weapon, app: { gender: 'female', skin: 1, hairStyle: 2, hairColor: 3, face: 0, outfit: 1 } });
    const list = await this.waitFor('char_list', (m) => m.chars.length > 0);
    this.send({ t: 'char_select', id: list.chars[0].id });
    return this.waitFor('enter_zone');
  }
}

export function ticks(server: GameServer, n: number) { for (let i = 0; i < n; i++) server.tick(); }
