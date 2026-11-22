import { GameCore, PROTOCOL_VERSION, SIM_DT, createCharacter, emptyAccount, normalizeAccount, MAX_CHARACTERS, type AccountProgress, type CharacterData, type ClassId, type Guild, type LeaderRecord, type Listing } from '@astra/shared';

export interface CharSummary { id: string; name: string; cls: ClassId; level: number; hardcore: boolean; dead: boolean; mastery: number }
export interface Conn { send(msg: unknown): void; close(): void }
export interface Handlers { onMessage(m: any): void; onStatus(s: 'open' | 'reconnecting' | 'closed'): void }
export interface Backend {
  mode: 'online' | 'offline';
  hasSession(): boolean;
  register(u: string, p: string): Promise<void>;
  login(u: string, p: string): Promise<void>;
  logout(): Promise<void>;
  me(): Promise<{ username: string; account: AccountProgress; characters: CharSummary[] }>;
  createChar(name: string, cls: ClassId, hardcore: boolean, look?: { hair: number; outfit: number }): Promise<void>;
  deleteChar(id: string, confirmName: string): Promise<void>;
  connect(charId: string, h: Handlers): Conn;
}

/** Storage that survives private mode / blocked storage by falling back to memory. */
export const store = (() => {
  const mem = new Map<string, string>();
  let ok = true;
  try { const k = '__astra_probe'; localStorage.setItem(k, '1'); localStorage.removeItem(k); } catch { ok = false; }
  return {
    persistent: ok,
    get(k: string): string | null { if (ok) { try { return localStorage.getItem(k); } catch { /* fallthrough */ } } return mem.get(k) ?? null; },
    set(k: string, v: string) { if (ok) { try { localStorage.setItem(k, v); return; } catch { /* quota */ } } mem.set(k, v); },
    del(k: string) { if (ok) { try { localStorage.removeItem(k); } catch { /* ignore */ } } mem.delete(k); },
  };
})();

// ───────────────────────── ONLINE ─────────────────────────
export class OnlineBackend implements Backend {
  mode = 'online' as const;
  private token: string | null = store.get('astra.token');
  hasSession() { return !!this.token; }
  private async api(method: string, path: string, body?: unknown) {
    const r = await fetch(path, { method, headers: { 'Content-Type': 'application/json', ...(this.token ? { Authorization: `Bearer ${this.token}` } : {}) }, body: body ? JSON.stringify(body) : undefined });
    const j = await r.json().catch(() => ({}));
    if (r.status === 401 && path !== '/api/login') { this.token = null; store.del('astra.token'); }
    if (!r.ok) throw new Error(j.error ?? `HTTP ${r.status}`);
    return j;
  }
  async register(u: string, p: string) { const j = await this.api('POST', '/api/register', { username: u, password: p }); this.token = j.token; store.set('astra.token', j.token); }
  async login(u: string, p: string) { const j = await this.api('POST', '/api/login', { username: u, password: p }); this.token = j.token; store.set('astra.token', j.token); }
  async logout() { try { await this.api('POST', '/api/logout'); } finally { this.token = null; store.del('astra.token'); } }
  me() { return this.api('GET', '/api/me'); }
  async createChar(name: string, cls: ClassId, hardcore: boolean, look?: { hair: number; outfit: number }) { await this.api('POST', '/api/characters', { name, cls, hardcore, look }); }
  async deleteChar(id: string, confirmName: string) { await this.api('DELETE', `/api/characters/${id}`, { confirmName }); }
  connect(charId: string, h: Handlers): Conn {
    let ws: WebSocket | null = null;
    let closed = false;
    let attempts = 0;
    const open = () => {
      const proto = location.protocol === 'https:' ? 'wss' : 'ws';
      ws = new WebSocket(`${proto}://${location.host}/ws`);
      ws.onopen = () => { attempts = 0; ws!.send(JSON.stringify({ t: 'auth', v: PROTOCOL_VERSION, token: this.token, char: charId })); h.onStatus('open'); };
      ws.onmessage = (e) => { try { const m = JSON.parse(e.data); if (m.t === 'err' && m.fatal) closed = true; h.onMessage(m); } catch { /* ignore malformed */ } };
      ws.onclose = () => {
        if (closed) { h.onStatus('closed'); return; }
        if (attempts++ > 8) { h.onStatus('closed'); return; }
        h.onStatus('reconnecting');
        setTimeout(open, Math.min(8000, 500 * 2 ** attempts));
      };
    };
    open();
    return { send: (m) => { if (ws?.readyState === WebSocket.OPEN) ws.send(JSON.stringify(m)); }, close: () => { closed = true; ws?.close(); } };
  }
}

// ───────────────────────── OFFLINE (labelled local mode) ─────────────────────────
interface LocalAccount { id: string; username: string; salt: string; hash: string; progress: AccountProgress }
async function pbkdf2(pw: string, saltHex: string): Promise<string> {
  if (!crypto?.subtle) return 'nocrypto:' + pw.length + saltHex; // very old browsers only; local mode, not a security boundary
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(pw), 'PBKDF2', false, ['deriveBits']);
  const bits = await crypto.subtle.deriveBits({ name: 'PBKDF2', salt: new TextEncoder().encode(saltHex), iterations: 100_000, hash: 'SHA-256' }, key, 256);
  return [...new Uint8Array(bits)].map((b) => b.toString(16).padStart(2, '0')).join('');
}
const rid = () => Math.random().toString(36).slice(2) + Date.now().toString(36);

export class OfflineBackend implements Backend {
  mode = 'offline' as const;
  private core: GameCore | null = null;
  private user: string | null = store.get('astra.offline.user');
  private accounts(): Record<string, LocalAccount> { try { return JSON.parse(store.get('astra.offline.accounts') ?? '{}'); } catch { return {}; } }
  private saveAccounts(a: Record<string, LocalAccount>) { store.set('astra.offline.accounts', JSON.stringify(a)); }
  private chars(): Record<string, CharacterData> { try { return JSON.parse(store.get('astra.offline.chars') ?? '{}'); } catch { return {}; } }
  private saveChars(c: Record<string, CharacterData>) { store.set('astra.offline.chars', JSON.stringify(c)); }
  private shared(): { guilds: Record<string, Guild>; listings: Record<string, Listing>; records: Record<string, LeaderRecord> } { try { return { guilds: {}, listings: {}, records: {}, ...JSON.parse(store.get('astra.offline.shared') ?? '{}') }; } catch { return { guilds: {}, listings: {}, records: {} }; } }
  private acct(): LocalAccount { const a = this.accounts()[this.user ?? '']; if (!a) throw new Error('Not logged in'); return a; }
  hasSession() { return !!this.user && !!this.accounts()[this.user]; }
  async register(u: string, p: string) {
    if (!/^[A-Za-z0-9_]{3,20}$/.test(u)) throw new Error('Username must be 3-20 letters, numbers or _');
    if (p.length < 8) throw new Error('Password must be at least 8 characters');
    const all = this.accounts();
    if (all[u.toLowerCase()]) throw new Error('Username is taken (on this device)');
    const salt = rid();
    all[u.toLowerCase()] = { id: 'local-' + rid(), username: u, salt, hash: await pbkdf2(p, salt), progress: emptyAccount() };
    this.saveAccounts(all);
    this.user = u.toLowerCase();
    store.set('astra.offline.user', this.user);
  }
  async login(u: string, p: string) {
    const a = this.accounts()[u.toLowerCase()];
    if (!a || (await pbkdf2(p, a.salt)) !== a.hash) throw new Error('Invalid username or password');
    this.user = u.toLowerCase();
    store.set('astra.offline.user', this.user);
  }
  async logout() { this.user = null; store.del('astra.offline.user'); }
  async me() {
    const a = this.acct();
    const chars = Object.values(this.chars()).filter((c) => c.accountId === a.id).sort((x, y) => x.createdAt - y.createdAt);
    return { username: a.username, account: normalizeAccount(a.progress), characters: chars.map((c) => ({ id: c.id, name: c.name, cls: c.cls, level: c.level, hardcore: c.hardcore, dead: c.dead, mastery: c.mastery.level })) };
  }
  async createChar(name: string, cls: ClassId, hardcore: boolean, look?: { hair: number; outfit: number }) {
    const a = this.acct();
    const all = this.chars();
    const mine = Object.values(all).filter((c) => c.accountId === a.id);
    if (mine.length >= MAX_CHARACTERS) throw new Error(`Character limit reached (${MAX_CHARACTERS})`);
    if (Object.values(all).some((c) => c.name.toLowerCase() === name.trim().toLowerCase())) throw new Error('That name is taken');
    const r = createCharacter(a.id, name, cls, hardcore, look);
    if (!r.ok) throw new Error(r.reason);
    all[r.value.id] = r.value;
    this.saveChars(all);
  }
  async deleteChar(id: string, confirmName: string) {
    const all = this.chars();
    const c = all[id];
    if (!c || c.accountId !== this.acct().id) throw new Error('Not found');
    if (c.name !== confirmName) throw new Error('Type the character name exactly to confirm deletion');
    delete all[id];
    this.saveChars(all);
  }
  private ensureCore(): GameCore {
    if (this.core) return this.core;
    const self = this;
    this.core = new GameCore({
      async saveCharacter(ch) { const all = self.chars(); if (all[ch.id]) { all[ch.id] = JSON.parse(JSON.stringify(ch)); self.saveChars(all); } },
      async saveAccount(accountId, prog) { const all = self.accounts(); const k = Object.keys(all).find((x) => all[x]!.id === accountId); if (k) { all[k]!.progress = JSON.parse(JSON.stringify(prog)); self.saveAccounts(all); } },
      audit() { /* local mode keeps no audit log */ },
      async transact(tx) {
        // localStorage writes are synchronous, so this block cannot interleave with other game code.
        if (tx.accounts?.length) { const all = self.accounts(); for (const a of tx.accounts) { const k = Object.keys(all).find((x) => all[x]!.id === a.id); if (k) all[k]!.progress = JSON.parse(JSON.stringify(a.progress)); } self.saveAccounts(all); }
        if (tx.characters?.length) { const all = self.chars(); for (const c of tx.characters) if (all[c.id]) all[c.id] = JSON.parse(JSON.stringify(c)); self.saveChars(all); }
        if (tx.listings?.length || tx.guilds?.length || tx.deleteGuilds?.length || tx.records?.length) {
          const sh = self.shared();
          for (const l of tx.listings ?? []) sh.listings[l.id] = JSON.parse(JSON.stringify(l));
          for (const g of tx.guilds ?? []) sh.guilds[g.id] = JSON.parse(JSON.stringify(g));
          for (const id of tx.deleteGuilds ?? []) delete sh.guilds[id];
          for (const r of tx.records ?? []) { const k = `${r.board}:${r.charId}`; if (!sh.records[k] || sh.records[k]!.value < r.value) sh.records[k] = r; }
          for (const [k, l] of Object.entries(sh.listings)) if (l.status === 'closed') delete sh.listings[k];
          store.set('astra.offline.shared', JSON.stringify(sh));
        }
      },
      async loadShared() { const sh = self.shared(); return { guilds: Object.values(sh.guilds), listings: Object.values(sh.listings), records: Object.values(sh.records) }; },
    }, { label: 'offline' });
    void this.core.init();
    const core = this.core;
    let last = performance.now(), acc = 0;
    setInterval(() => { const now = performance.now(); acc += Math.min(0.25, (now - last) / 1000); last = now; while (acc >= SIM_DT) { core.tick(SIM_DT); acc -= SIM_DT; } }, (SIM_DT * 1000) / 2);
    addEventListener('beforeunload', () => core.saveAll());
    addEventListener('pagehide', () => core.saveAll());
    return core;
  }
  connect(charId: string, h: Handlers): Conn {
    const core = this.ensureCore();
    const a = this.acct();
    const ch = this.chars()[charId];
    const sid = 'local-' + rid();
    let closed = false;
    // JSON round-trips emulate the network boundary: the client never shares objects with the simulation.
    const deliver = (m: unknown) => { if (closed) return; const copy = JSON.parse(JSON.stringify(m)); queueMicrotask(() => { if (!closed) h.onMessage(copy); }); };
    setTimeout(() => {
      if (!ch) { h.onMessage({ t: 'err', msg: 'Character not found', fatal: true }); return; }
      h.onStatus('open');
      core.connect(sid, a.id, JSON.parse(JSON.stringify(ch)), normalizeAccount(a.progress), deliver, { role: 'admin' }); // offline mode: the player owns this device, so GM tools are allowed
    }, 30);
    return { send: (m) => { if (!closed) core.handle(sid, JSON.parse(JSON.stringify(m))); }, close: () => { closed = true; core.disconnect(sid); } };
  }
}

export async function pickBackend(): Promise<Backend> {
  if (import.meta.env.VITE_OFFLINE) return new OfflineBackend();
  try {
    const r = await fetch('/api/health', { cache: 'no-store' });
    if (r.ok && (await r.json()).ok) return new OnlineBackend();
  } catch { /* no server */ }
  return new OfflineBackend();
}
