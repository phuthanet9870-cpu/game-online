/**
 * GameServer: transport-agnostic, server-authoritative game host.
 * The same class runs inside Node (WebSocket transport) and inside a browser
 * Web Worker (postMessage transport) — see src/server/node and src/server/worker.
 */
import { ZONES, START_ZONE, getZone } from '../shared/config/zones.ts';
import { SERVER_CONFIG as SC } from '../shared/config/server.ts';
import { getItem, SHOPS, slotsForCategory, INVENTORY_CONFIG } from '../shared/config/items.ts';
import { WEAPONS, getWeapon } from '../shared/config/weapons.ts';
import { expToNext, masteryToNext } from '../shared/config/progression.ts';
import { isBlocked } from '../shared/mapgen.ts';
import { newMoveState, TICK_DT, TICK_RATE } from '../shared/movement.ts';
import { NAME_RE, PROTOCOL_VERSION, USER_RE, parseClientMessage, type CharacterSummary, type CharacterView, type ClientMessage, type ServerMessage } from '../shared/protocol.ts';
import { computeStats } from '../shared/stats.ts';
import { ANIM } from '../shared/protocol.ts';
import type { PlayerEntity } from './entities.ts';
import { Inventory, createItem } from './inventory.ts';
import { accrueRested } from './progression.ts';
import { recomputeStats } from './playerStats.ts';
import type { CharacterRecord, Storage } from './storage/types.ts';
import { TokenBucket, consoleLogger, cryptoRng, type Logger } from './util.ts';
import { hashPassword, randomToken, verifyPassword } from './auth.ts';
import { Zone, type ZoneHost } from './zone.ts';
import { validateConfig } from './validateConfig.ts';
import { defaultGmFlags, runGm } from './gm.ts';
import { grantExp } from './progression.ts';
import { USE_ERRORS, useItem } from './actions.ts';
import { canStartAuto, startAuto, stopAuto } from './autofarm.ts';
import { sanitizeAuto } from '../shared/config/auto.ts';

export interface Connection {
  id: string;
  send(msg: ServerMessage): void;
  close(reason: string): void;
}

interface Session {
  conn: Connection;
  state: 'connected' | 'hello' | 'authed' | 'ingame';
  accountId: string | null;
  username: string | null;
  player: PlayerEntity | null;
  msgBucket: TokenBucket;
  chatBucket: TokenBucket;
  authBucket: TokenBucket;
  violations: number;
  busy: Promise<void>;
  mutedUntil: number;
}

export interface GameServerOptions {
  storage: Storage;
  name?: string;
  mode?: string;
  logger?: Logger;
  rng?: () => number;
  /** Wall clock (ms) for rate limits, tokens and timestamps. */
  now?: () => number;
  /** PBKDF2 iterations override (tests use a low value). */
  hashIterations?: number;
  /**
   * Secret that unlocks GM for a session via the chat command `/gm<passphrase>`.
   * null/empty disables GM entirely. Online servers read it from the
   * GM_PASSPHRASE environment variable — never commit it.
   */
  gmPassphrase?: string | null;
}

export class GameServer implements ZoneHost {
  time = 0;
  readonly zones = new Map<string, Zone>();
  private sessions = new Map<string, Session>();
  private onlineChars = new Map<string, PlayerEntity>();
  private tokens = new Map<string, { accountId: string; username: string; expires: number }>();
  private idSeq = 1;
  private interval: ReturnType<typeof setInterval> | null = null;
  readonly logger: Logger;
  private readonly rngFn: () => number;
  readonly now: () => number;
  readonly storage: Storage;
  readonly name: string;
  readonly mode: string;
  private hashIterations: number | undefined;
  private lastAutosave = 0;
  private gmPassphrase: string | null;
  /** Server-wide event multipliers (GM adjustable). */
  rates = { exp: 1, drop: 1, gold: 1 };
  stats = { ticks: 0, lastTickMs: 0, maxTickMs: 0 };

  constructor(opts: GameServerOptions) {
    this.storage = opts.storage;
    this.logger = opts.logger ?? consoleLogger;
    this.rngFn = opts.rng ?? cryptoRng();
    this.now = opts.now ?? (() => Date.now());
    this.name = opts.name ?? 'Aether-1';
    this.mode = opts.mode ?? 'node';
    this.hashIterations = opts.hashIterations;
    this.gmPassphrase = opts.gmPassphrase ? String(opts.gmPassphrase) : null;
    const errs = validateConfig();
    if (errs.length) throw new Error('Invalid game config:\n' + errs.join('\n'));
  }

  async init() {
    await this.storage.init();
    for (const z of Object.values(ZONES)) this.zones.set(z.id, new Zone(z, this));
  }

  rng() { return this.rngFn(); }
  nextId() { return this.idSeq++; }

  start() {
    if (this.interval) return;
    let next = performance.now();
    this.interval = setInterval(() => {
      // fixed-step catch-up with an upper bound so a stall can't spiral
      const now = performance.now();
      let n = 0;
      while (now >= next && n < 4) { this.tick(); next += 1000 / TICK_RATE; n++; }
      if (now - next > 1000) next = now;
    }, 1000 / TICK_RATE / 2);
  }

  async stop() {
    if (this.interval) clearInterval(this.interval);
    this.interval = null;
    await this.saveAll('shutdown');
  }

  tick() {
    const t0 = performance.now();
    this.time += TICK_DT;
    for (const z of this.zones.values()) z.update();
    // after-tick: flush dirty views, expire lingering players, autosave
    for (const p of this.onlineChars.values()) {
      if (p.invDirty) { p.invDirty = false; this.sendInv(p); }
      if (p.charDirty) { p.charDirty = false; this.sendChar(p); }
      if (p.session === null && p.disconnectedAt !== null && this.time - p.disconnectedAt >= SC.disconnectGraceSec) {
        this.removeFromWorld(p, 'disconnect_timeout');
      }
    }
    if (this.time - this.lastAutosave >= SC.autosaveSec) {
      this.lastAutosave = this.time;
      for (const p of this.onlineChars.values()) if (p.dirty) this.requestSave(p, 'autosave');
    }
    const dt = performance.now() - t0;
    this.stats.ticks++;
    this.stats.lastTickMs = dt;
    this.stats.maxTickMs = Math.max(this.stats.maxTickMs, dt);
  }

  // ----------------------------------------------------------- connections
  connect(conn: Connection) {
    const now = this.now;
    this.sessions.set(conn.id, {
      conn, state: 'connected', accountId: null, username: null, player: null,
      msgBucket: new TokenBucket(SC.rate.msgPerSec, SC.rate.msgBurst, now),
      chatBucket: new TokenBucket(SC.rate.chatPerSec, SC.rate.chatBurst, now),
      authBucket: new TokenBucket(SC.rate.authPerMin / 60, SC.rate.authPerMin, now),
      violations: 0, busy: Promise.resolve(), mutedUntil: 0,
    });
    conn.send({ t: 'welcome', v: PROTOCOL_VERSION, tickRate: TICK_RATE, serverName: this.name, mode: this.mode });
  }

  disconnect(connId: string) {
    const s = this.sessions.get(connId);
    if (!s) return;
    this.sessions.delete(connId);
    const p = s.player;
    if (p && p.session?.connId === connId) {
      stopAuto(p, 'การเชื่อมต่อหลุด'); // no offline botting
      p.session = null;
      p.disconnectedAt = this.time;
      p.inputQueue.length = 0;
      this.requestSave(p, 'disconnect');
    }
  }

  private violation(s: Session, why: string) {
    s.violations++;
    if (s.violations === 1 || s.violations % 10 === 0) this.logger.warn(`protocol violation (${why})`, { conn: s.conn.id, user: s.username, n: s.violations });
    if (s.violations >= SC.maxViolations) {
      this.audit(s.player, 'kick_violations', { why, n: s.violations, user: s.username });
      s.conn.send({ t: 'error', code: 'kicked', msg: 'Too many invalid requests' });
      s.conn.close('violations');
      this.disconnect(s.conn.id);
    }
  }

  private err(s: Session, code: string, msg: string) { s.conn.send({ t: 'error', code, msg }); }

  message(connId: string, raw: unknown) {
    const s = this.sessions.get(connId);
    if (!s) return;
    if (!s.msgBucket.take()) { this.violation(s, 'rate_limit'); return; }
    const msg = parseClientMessage(raw);
    if (!msg) { this.violation(s, 'malformed'); this.err(s, 'bad_message', 'Malformed message'); return; }

    if (msg.t === 'ping') { s.conn.send({ t: 'pong', c: msg.c, s: this.now() }); return; }
    if (msg.t === 'hello') {
      if (msg.v !== PROTOCOL_VERSION) { this.err(s, 'version', `Protocol mismatch: server ${PROTOCOL_VERSION}, client ${msg.v}`); return; }
      if (s.state === 'connected') s.state = 'hello';
      return;
    }
    if (s.state === 'connected') { this.violation(s, 'no_hello'); return; }

    // Account/character operations are async and serialised per session.
    if (msg.t === 'register' || msg.t === 'login' || msg.t === 'resume' || msg.t === 'char_list' || msg.t === 'char_create' || msg.t === 'char_select' || msg.t === 'logout') {
      s.busy = s.busy.then(() => this.handleAccount(s, msg)).catch((e) => {
        this.logger.error('account handler failed', String(e));
        this.err(s, 'server_error', 'Server error');
      });
      return;
    }
    if (s.state !== 'ingame' || !s.player) { this.violation(s, 'not_in_game'); return; }
    this.handleGame(s, s.player, msg);
  }

  // ----------------------------------------------------------- accounts
  private async handleAccount(s: Session, msg: ClientMessage) {
    switch (msg.t) {
      case 'register':
      case 'login': {
        if (s.state !== 'hello') return this.err(s, 'bad_state', 'Already logged in');
        if (!s.authBucket.take()) return this.err(s, 'rate_limited', 'Too many attempts, wait a minute');
        const user = msg.user.toLowerCase();
        if (!USER_RE.test(user)) return this.err(s, 'bad_username', 'Username: 3-20 chars a-z 0-9 _');
        if (msg.t === 'register') {
          const { hash, salt } = await hashPassword(msg.pass, undefined, this.hashIterations);
          const acc = await this.storage.createAccount(user, hash, salt);
          if (acc === 'taken') return this.err(s, 'username_taken', 'Username already taken');
          await this.storage.audit({ at: this.now(), accountId: acc.id, characterId: null, kind: 'register', data: {} });
          this.authed(s, acc.id, user);
        } else {
          const acc = await this.storage.getAccount(user);
          const ok = acc ? await verifyPassword(msg.pass, acc.passHash, acc.salt) : false;
          if (!acc || !ok) return this.err(s, 'bad_credentials', 'Wrong username or password');
          if (acc.bannedUntil > this.now()) return this.err(s, 'banned', `บัญชีถูกแบนถึง ${new Date(acc.bannedUntil).toLocaleString()}`);
          this.authed(s, acc.id, user);
        }
        return;
      }
      case 'resume': {
        if (s.state !== 'hello') return this.err(s, 'bad_state', 'Already logged in');
        const tok = this.tokens.get(msg.token);
        if (!tok || tok.expires < this.now()) return this.err(s, 'bad_token', 'Session expired, please log in');
        const acc = await this.storage.getAccount(tok.username);
        if (!acc || acc.bannedUntil > this.now()) return this.err(s, 'banned', 'บัญชีถูกแบน');
        this.authed(s, tok.accountId, tok.username, msg.token);
        return;
      }
      case 'char_list': {
        if (s.state !== 'authed') return this.err(s, 'bad_state', 'Not at character select');
        return this.sendCharList(s);
      }
      case 'char_create': {
        if (s.state !== 'authed' || !s.accountId) return this.err(s, 'bad_state', 'Not at character select');
        if (!NAME_RE.test(msg.name)) return this.err(s, 'bad_name', 'Name: 3-16 letters/digits/_ (Thai allowed)');
        const weapon = getWeapon(msg.weapon);
        if (!weapon) return this.err(s, 'weapon_unavailable', 'This weapon is not available yet');
        const existing = await this.storage.listCharacters(s.accountId);
        if (existing.length >= SC.maxCharactersPerAccount) return this.err(s, 'too_many_chars', 'Character limit reached');
        const rec = this.newCharacter(s.accountId, msg.name, msg.app, weapon.type);
        const res = await this.storage.createCharacter(rec);
        if (res === 'name_taken') return this.err(s, 'name_taken', 'Name already taken');
        await this.storage.audit({ at: this.now(), accountId: s.accountId, characterId: rec.id, kind: 'char_create', data: { name: rec.name, weapon: weapon.type } });
        return this.sendCharList(s);
      }
      case 'char_select': {
        if (s.state !== 'authed' || !s.accountId) return this.err(s, 'bad_state', 'Not at character select');
        return this.enterWorld(s, msg.id);
      }
      case 'logout': {
        if (s.state !== 'ingame' || !s.player) return;
        const p = s.player;
        this.removeFromWorld(p, 'logout');
        await p.saving;
        s.player = null;
        s.state = 'authed';
        s.conn.send({ t: 'logged_out' });
        return this.sendCharList(s);
      }
    }
  }

  private authed(s: Session, accountId: string, username: string, token?: string) {
    s.state = 'authed';
    s.accountId = accountId;
    s.username = username;
    const tok = token ?? randomToken();
    this.tokens.set(tok, { accountId, username, expires: this.now() + SC.sessionTokenTtlSec * 1000 });
    s.conn.send({ t: 'auth_ok', user: username, token: tok });
  }

  private async sendCharList(s: Session) {
    const chars = await this.storage.listCharacters(s.accountId!);
    const list: CharacterSummary[] = chars.map((c) => {
      const w = c.items.find((i) => i.equip === 'weapon');
      return { id: c.id, name: c.name, level: c.level, app: c.app, zoneId: c.zoneId, weapon: w ? getItem(w.defId)?.weaponType ?? null : null };
    });
    s.conn.send({ t: 'char_list', chars: list, max: SC.maxCharactersPerAccount });
  }

  newCharacter(accountId: string, name: string, app: CharacterRecord['app'], weapon: keyof typeof WEAPONS): CharacterRecord {
    const w = WEAPONS[weapon]!;
    const z = ZONES[START_ZONE];
    const stats = computeStats(1, []);
    const items = [createItem(w.starterItem, 1, { bound: true }), createItem('arm_cloth_tunic', 1, { bound: true })];
    items[0].equip = 'weapon';
    items[1].equip = 'armor';
    const inv = new Inventory(items);
    inv.addInstance(createItem('pot_hp_small', 5));
    inv.addInstance(createItem('pot_energy_small', 3));
    const now = this.now();
    return {
      id: crypto.randomUUID(), accountId, name, app, level: 1, exp: 0, restedExp: 0, gold: 100,
      zoneId: z.id, x: z.spawnPoint.x, y: z.spawnPoint.y, hp: stats.hp, energy: stats.energy,
      mastery: { [weapon]: { level: 0, xp: 0 } }, items: inv.items, createdAt: now, lastSeen: now, version: 1,
    };
  }

  private async enterWorld(s: Session, charId: string): Promise<void> {
    // already online? (reconnect within grace or session takeover)
    const online = this.onlineChars.get(charId);
    if (online) {
      if (online.rec.accountId !== s.accountId) return this.err(s, 'not_yours', 'Character not found');
      if (online.session) {
        const old = [...this.sessions.values()].find((x) => x.conn.id === online.session!.connId);
        if (old) {
          old.player = null;
          old.state = 'authed';
          this.err(old, 'logged_in_elsewhere', 'This character logged in from another connection');
          old.conn.close('takeover');
        }
      }
      this.attach(s, online);
      const z = this.zones.get(online.rec.zoneId)!;
      z.removePlayer(online);
      z.addPlayer(online, online.ms.x, online.ms.y);
      this.sendInv(online);
      this.sendChar(online);
      return;
    }
    const rec = await this.storage.loadCharacter(charId);
    if (!rec || rec.accountId !== s.accountId) return this.err(s, 'not_yours', 'Character not found');
    if (this.onlineChars.has(charId)) return this.enterWorld(s, charId); // raced with another select
    accrueRested(rec, this.now());
    const p = this.makePlayer(rec);
    this.onlineChars.set(rec.id, p);
    this.attach(s, p);
    let zone = this.zones.get(rec.zoneId);
    let x = rec.x, y = rec.y;
    if (!zone || isBlocked(zone.map, x, y) || p.hp <= 0) {
      zone = this.zones.get(START_ZONE)!;
      x = zone.def.spawnPoint.x; y = zone.def.spawnPoint.y;
      if (p.hp <= 0) p.hp = Math.round(p.stats.hp * SC.respawnHpFraction);
    }
    zone.addPlayer(p, x, y);
    this.sendInv(p);
    this.sendChar(p);
    p.session?.send({ t: 'chat', ch: 'system', from: 'System', text: `ยินดีต้อนรับสู่ ${zone.def.name}, ${rec.name}!` });
    this.audit(p, 'enter_world', { zone: zone.def.id });
  }

  private attach(s: Session, p: PlayerEntity) {
    s.state = 'ingame';
    s.player = p;
    p.session = { connId: s.conn.id, send: (m) => s.conn.send(m as ServerMessage) };
    p.disconnectedAt = null;
    p.lastSeq = -1;
    p.inputQueue.length = 0;
  }

  makePlayer(rec: CharacterRecord): PlayerEntity {
    const inv = new Inventory(rec.items);
    const stats = computeStats(rec.level, inv.equipped());
    const p: PlayerEntity = {
      kind: 1, id: this.nextId(), rec, inv, session: null, disconnectedAt: null,
      ms: newMoveState(rec.x, rec.y, stats.stamina), facingX: 1, facingY: 0, radius: 0.3, stats, weapon: null,
      hp: Math.min(rec.hp, stats.hp), energy: Math.min(rec.energy, stats.energy), shield: 0, shieldUntil: 0,
      cooldowns: new Map(), actionLockUntil: 0, iframesUntil: 0, counterUntil: 0, drAmount: 0, drUntil: 0, superArmorUntil: 0, blocking: false, combo: 0, lastNormalAt: -99,
      dead: false, lastCombatAt: -99, potCdUntil: 0, inputQueue: [], lastSeq: -1, inputBudget: SC.inputBudgetMax, ticksWithoutInput: 0,
      known: new Set(), anim: ANIM.IDLE, animUntil: 0, killTimes: [], dirty: false, invDirty: false, charDirty: false,
      lastSaveAt: 0, saving: Promise.resolve(), hazardTickAt: 0,
      gm: false, gmFlags: defaultGmFlags(), mutedUntil: 0, auto: null, autoKillTimes: [],
    };
    recomputeStats(p);
    return p;
  }

  private removeFromWorld(p: PlayerEntity, reason: string) {
    const z = this.zones.get(p.rec.zoneId);
    z?.removePlayer(p);
    this.onlineChars.delete(p.rec.id);
    this.requestSave(p, reason);
  }

  transfer(p: PlayerEntity, zoneId: string, x: number, y: number) {
    const from = this.zones.get(p.rec.zoneId);
    const to = this.zones.get(zoneId);
    if (!to) { this.logger.error('transfer to unknown zone', zoneId); return; }
    stopAuto(p, 'เปลี่ยนแผนที่');
    from?.removePlayer(p);
    to.addPlayer(p, x, y);
    this.requestSave(p, 'zone_change');
  }

  // ----------------------------------------------------------- persistence
  requestSave(p: PlayerEntity, reason: string) {
    p.saving = p.saving.then(async () => {
      const errs = p.inv.validate();
      if (errs.length) {
        this.logger.error('inventory integrity check failed; save skipped', { char: p.rec.id, errs });
        this.audit(p, 'integrity_error', { errs });
        return;
      }
      const rec = p.rec;
      rec.x = p.ms.x; rec.y = p.ms.y;
      rec.hp = Math.max(0, Math.round(p.hp));
      rec.energy = Math.round(p.energy);
      rec.lastSeen = this.now();
      const copy: CharacterRecord = JSON.parse(JSON.stringify(rec));
      copy.version = rec.version + 1;
      const res = await this.storage.saveCharacter(copy);
      if (res === 'ok') { rec.version = copy.version; p.dirty = false; p.lastSaveAt = this.time; }
      else this.logger.error('stale save rejected', { char: rec.id, reason });
    }).catch((e) => this.logger.error('save failed', String(e)));
  }

  async saveAll(reason: string) {
    for (const p of this.onlineChars.values()) this.requestSave(p, reason);
    await Promise.all([...this.onlineChars.values()].map((p) => p.saving));
  }

  audit(p: PlayerEntity | null, kind: string, data: Record<string, unknown>) {
    this.storage.audit({ at: this.now(), accountId: p?.rec.accountId ?? null, characterId: p?.rec.id ?? null, kind, data })
      .catch((e) => this.logger.error('audit failed', String(e)));
  }

  // ----------------------------------------------------------- views
  charView(p: PlayerEntity): CharacterView {
    const mastery: CharacterView['mastery'] = {};
    for (const [k, v] of Object.entries(p.rec.mastery)) if (v) mastery[k] = { level: v.level, xp: v.xp, next: masteryToNext(v.level) };
    return {
      id: p.rec.id, name: p.rec.name, level: p.rec.level, exp: p.rec.exp, expNext: expToNext(p.rec.level), rested: p.rec.restedExp,
      gold: p.rec.gold, weapon: p.weapon?.type ?? null, app: p.rec.app, stats: p.stats, mastery,
    };
  }
  sendChar(p: PlayerEntity) { p.session?.send({ t: 'char', c: this.charView(p) }); }
  sendInv(p: PlayerEntity) { p.session?.send({ t: 'inv', items: p.inv.items, gold: p.rec.gold, slots: INVENTORY_CONFIG.slots }); }

  // ----------------------------------------------------------- in-game messages
  private handleGame(s: Session, p: PlayerEntity, msg: ClientMessage) {
    const z = this.zones.get(p.rec.zoneId);
    if (!z) return;
    switch (msg.t) {
      case 'in': {
        if (msg.s <= p.lastSeq) return; // replay / duplicate
        if (p.inputQueue.length >= SC.inputQueueMax) { this.violation(s, 'input_flood'); return; }
        p.inputQueue.push(msg);
        return;
      }
      case 'pickup': {
        const e = z.pickup(p, msg.id);
        if (e) this.err(s, e, pickupMsg(e));
        return;
      }
      case 'gather': {
        const n = z.nodes.get(msg.id);
        if (!n || p.dead) return this.err(s, 'no_node', 'Nothing to gather');
        if ((n.x - p.ms.x) ** 2 + (n.y - p.ms.y) ** 2 > SC.gatherRange ** 2) return this.err(s, 'too_far', 'เข้าใกล้กว่านี้');
        if (n.readyAt > 0) return this.err(s, 'depleted', 'ทรัพยากรนี้ยังไม่ฟื้นตัว');
        const qty = n.def.min + Math.floor(this.rng() * (n.def.max - n.def.min + 1));
        const item = createItem(n.def.itemId, qty);
        if (!p.inv.addInstance(item)) return this.err(s, 'inventory_full', 'กระเป๋าเต็ม');
        n.readyAt = this.time + n.def.respawnSec;
        z.emit({ e: 'node', id: n.id, ready: false }, n.x, n.y);
        z.invalidateMeta(n.id);
        p.invDirty = true; p.dirty = true;
        s.conn.send({ t: 'notice', kind: 'loot', text: `+${qty} ${getItem(n.def.itemId)?.nameTh}` });
        return;
      }
      case 'talk': {
        const npc = z.npcs.get(msg.id);
        if (!npc) return this.err(s, 'no_npc', 'NPC not found');
        if ((npc.x - p.ms.x) ** 2 + (npc.y - p.ms.y) ** 2 > SC.npcRange ** 2) return this.err(s, 'too_far', 'เข้าใกล้ NPC กว่านี้');
        if (npc.def.role === 'shop' && npc.def.shopId && SHOPS[npc.def.shopId]) {
          const shop = SHOPS[npc.def.shopId];
          s.conn.send({ t: 'shop', npc: npc.id, shopId: shop.id, items: shop.items });
        } else s.conn.send({ t: 'dialog', npc: npc.id, name: npc.def.nameTh, lines: npc.def.dialogue });
        return;
      }
      case 'equip': {
        if (p.dead) return this.err(s, 'dead', 'You are dead');
        const it = p.inv.get(msg.uid);
        const def = it ? getItem(it.defId) : undefined;
        if (def?.category === 'weapon' && !z.def.safe) return this.err(s, 'safe_zone_only', 'เปลี่ยนอาวุธได้เฉพาะในเมือง/Safe Zone');
        if (def?.category === 'weapon' && def.weaponType && !getWeapon(def.weaponType)) return this.err(s, 'weapon_unavailable', 'อาวุธประเภทนี้ยังไม่เปิดใช้');
        const r = p.inv.equip(msg.uid, p.rec.level);
        if (!r.ok) return this.err(s, r.code, equipMsg(r.code));
        this.afterEquipChange(z, p);
        return;
      }
      case 'unequip': {
        if (p.dead) return this.err(s, 'dead', 'You are dead');
        if (msg.slot === 'weapon' && !z.def.safe) return this.err(s, 'safe_zone_only', 'เปลี่ยนอาวุธได้เฉพาะในเมือง/Safe Zone');
        const r = p.inv.unequip(msg.slot);
        if (!r.ok) return this.err(s, r.code, equipMsg(r.code));
        this.afterEquipChange(z, p);
        return;
      }
      case 'use': {
        const e = useItem(z, p, msg.uid);
        if (e) this.err(s, e, USE_ERRORS[e] ?? e);
        return;
      }
      case 'auto_start': {
        const cfg = sanitizeAuto(msg.cfg);
        if (!cfg) return this.err(s, 'bad_auto', 'ตั้งค่าออโต้ไม่ถูกต้อง');
        const ok = canStartAuto(z, p);
        if (!ok.ok) return this.err(s, ok.code, ok.msg);
        startAuto(z, p, cfg);
        this.audit(p, 'auto_start', { zone: z.def.id, cfg });
        s.conn.send({ t: 'auto', on: true, kills: 0, reason: '' });
        return;
      }
      case 'auto_stop': {
        stopAuto(p, 'หยุดโดยผู้เล่น');
        return;
      }
      case 'discard': {
        const it = p.inv.get(msg.uid);
        if (!it || it.slot === null) return this.err(s, 'not_in_bag', 'Item not in bag');
        const removed = p.inv.removeUid(msg.uid, msg.qty);
        if (!removed) return this.err(s, 'bad_qty', 'Bad quantity');
        this.audit(p, 'discard', { def: removed.defId, qty: removed.qty, uid: msg.uid });
        p.invDirty = true; p.dirty = true;
        return;
      }
      case 'shop_buy': {
        const npc = z.npcs.get(msg.npc);
        const shop = npc?.def.shopId ? SHOPS[npc.def.shopId] : undefined;
        if (!npc || !shop) return this.err(s, 'no_shop', 'Shop not found');
        if ((npc.x - p.ms.x) ** 2 + (npc.y - p.ms.y) ** 2 > SC.npcRange ** 2) return this.err(s, 'too_far', 'เข้าใกล้ร้านค้ากว่านี้');
        const entry = shop.items.find((i) => i.itemId === msg.item);
        const def = entry ? getItem(entry.itemId) : undefined;
        if (!entry || !def) return this.err(s, 'not_sold', 'ร้านนี้ไม่ขายสินค้านี้');
        if (msg.qty > def.stackMax) return this.err(s, 'bad_qty', 'Bad quantity');
        const cost = entry.price * msg.qty;
        if (p.rec.gold < cost) return this.err(s, 'no_gold', 'Gold ไม่พอ');
        const item = createItem(def.id, msg.qty, { bound: def.bind === 'on_pickup' });
        if (!p.inv.addInstance(item)) return this.err(s, 'inventory_full', 'กระเป๋าเต็ม');
        p.rec.gold -= cost; // both steps succeed or neither: addInstance is all-or-nothing and runs first
        this.audit(p, 'shop_buy', { shop: shop.id, item: def.id, qty: msg.qty, cost, goldAfter: p.rec.gold });
        p.invDirty = true; p.dirty = true;
        this.requestSave(p, 'shop_buy');
        s.conn.send({ t: 'notice', kind: 'info', text: `ซื้อ ${def.nameTh} ×${msg.qty} (-${cost} gold)` });
        return;
      }
      case 'shop_sell': {
        const npc = z.npcs.get(msg.npc);
        if (!npc || !npc.def.shopId) return this.err(s, 'no_shop', 'Shop not found');
        if ((npc.x - p.ms.x) ** 2 + (npc.y - p.ms.y) ** 2 > SC.npcRange ** 2) return this.err(s, 'too_far', 'เข้าใกล้ร้านค้ากว่านี้');
        const it = p.inv.get(msg.uid);
        const def = it ? getItem(it.defId) : undefined;
        if (!it || !def || it.slot === null) return this.err(s, 'not_in_bag', 'Item not in bag');
        if (msg.qty > it.qty) return this.err(s, 'bad_qty', 'Bad quantity');
        const gain = def.sellPrice * msg.qty;
        if (p.rec.gold + gain > INVENTORY_CONFIG.maxGold) return this.err(s, 'gold_cap', 'Gold cap reached');
        if (!p.inv.removeUid(msg.uid, msg.qty)) return this.err(s, 'bad_qty', 'Bad quantity');
        p.rec.gold += gain;
        this.audit(p, 'shop_sell', { item: def.id, qty: msg.qty, gain, goldAfter: p.rec.gold, uid: msg.uid });
        p.invDirty = true; p.dirty = true;
        this.requestSave(p, 'shop_sell');
        return;
      }
      case 'respawn': {
        if (!p.dead) return;
        p.dead = false;
        p.hp = Math.round(p.stats.hp * SC.respawnHpFraction);
        p.energy = p.stats.energy;
        p.ms.rootT = 0; p.ms.slowT = 0;
        p.anim = ANIM.IDLE;
        const town = ZONES[START_ZONE];
        this.transfer(p, town.id, town.spawnPoint.x, town.spawnPoint.y);
        p.charDirty = true;
        return;
      }
      case 'chat': {
        if (msg.text.startsWith('/')) { this.chatCommand(s, p, msg.text); return; }
        if (this.time < p.mutedUntil) return this.err(s, 'muted', `คุณถูกมิวต์อีก ${Math.ceil((p.mutedUntil - this.time) / 60)} นาที`);
        if (!s.chatBucket.take() || this.time < s.mutedUntil) {
          s.violations++;
          if (s.violations > 10) s.mutedUntil = this.time + 60;
          return this.err(s, 'chat_rate', 'ส่งข้อความเร็วเกินไป');
        }
        // strip control chars; client renders as text (never HTML)
        const text = msg.text.replace(/[\u0000-\u001f\u007f]/g, '').trim().slice(0, 200);
        if (!text) return;
        for (const other of z.players.values()) other.session?.send({ t: 'chat', ch: 'zone', from: p.rec.name, text });
        return;
      }
      default:
        this.violation(s, 'unexpected_' + msg.t);
    }
  }

  // ----------------------------------------------------------- GM
  private chatCommand(s: Session, p: PlayerEntity, text: string) {
    const sys = (lines: string[]) => { for (const l of lines) s.conn.send({ t: 'chat', ch: 'system', from: 'GM', text: l }); };
    const body = text.slice(1).trim();
    if (!body.toLowerCase().startsWith('gm')) return sys(['คำสั่งที่มี: /gm ... (เฉพาะ GM)']);
    const rest = body.slice(2);
    if (!p.gm) {
      // unlock attempt: "/gm<passphrase>" (no space). Rate-limited and audited.
      if (!this.gmPassphrase) return sys(['ระบบ GM ปิดอยู่บนเซิร์ฟเวอร์นี้ (ไม่ได้ตั้ง GM_PASSPHRASE)']);
      if (!s.authBucket.take()) return sys(['ลองบ่อยเกินไป รอสักครู่']);
      if (!constantTimeEq(rest, this.gmPassphrase)) {
        this.audit(p, 'gm_unlock_failed', {});
        this.violation(s, 'gm_unlock_failed');
        return sys(['คำสั่งไม่ถูกต้อง']);
      }
      this.setGm(p, true);
      this.audit(p, 'gm_unlock', {});
      return sys(['✅ เปิดสิทธิ์ GM แล้ว (เฉพาะเซสชันนี้) — พิมพ์ /gm help หรือกดปุ่ม GM']);
    }
    const line = rest.trim();
    this.audit(p, 'gm_command', { line });
    runGm(this, p, line || 'help').then(sys).catch((e) => { this.logger.error('gm command failed', String(e)); sys(['คำสั่งผิดพลาด: ' + String(e)]); });
  }

  setGm(p: PlayerEntity, on: boolean) {
    p.gm = on;
    if (!on) p.gmFlags = defaultGmFlags();
    recomputeStats(p);
    this.sendChar(p);
    this.sendGmState(p);
    const z = this.zoneOf(p);
    if (z) for (const o of z.players.values()) o.known.delete(p.id);
  }

  sendGmState(p: PlayerEntity) {
    p.session?.send({ t: 'gm', on: p.gm, ...p.gmFlags, rates: this.rates });
  }

  findPlayer(name: string) {
    const n = name.toLowerCase();
    return [...this.onlineChars.values()].find((p) => p.rec.name.toLowerCase() === n);
  }
  allPlayers() { return this.onlineChars.values(); }

  broadcast(text: string) {
    for (const s of this.sessions.values()) if (s.state === 'ingame') s.conn.send({ t: 'chat', ch: 'system', from: 'Server', text });
  }

  kickChar(p: PlayerEntity, reason: string) {
    const s = [...this.sessions.values()].find((x) => x.player === p);
    this.removeFromWorld(p, 'kick');
    if (s) {
      this.err(s, 'kicked', reason);
      s.conn.close('kicked');
      this.sessions.delete(s.conn.id);
    }
  }

  muteChar(p: PlayerEntity, seconds: number) {
    p.mutedUntil = this.time + seconds;
    p.session?.send({ t: 'notice', kind: 'warn', text: `คุณถูกมิวต์ ${Math.round(seconds / 60)} นาที` });
  }

  async banAccount(accountId: string, until: number) {
    await this.storage.setBan(accountId, until);
    for (const [tok, v] of this.tokens) if (v.accountId === accountId) this.tokens.delete(tok);
  }

  async unbanUsername(username: string) {
    const acc = await this.storage.getAccount(username);
    return acc ? this.storage.setBan(acc.id, 0) : false;
  }

  grantExpTo(p: PlayerEntity, amount: number) {
    const before = p.rec.level;
    grantExp(p.rec, amount);
    if (p.rec.level !== before) {
      recomputeStats(p);
      p.hp = p.stats.hp; p.energy = p.stats.energy;
      this.zoneOf(p)?.invalidateMeta(p.id);
    }
    p.charDirty = true; p.dirty = true;
  }

  private afterEquipChange(z: Zone, p: PlayerEntity) {
    const prevWeapon = p.weapon?.type;
    recomputeStats(p);
    if (p.weapon?.type !== prevWeapon) { p.combo = 0; z.invalidateMeta(p.id); }
    p.invDirty = true; p.charDirty = true; p.dirty = true;
    this.requestSave(p, 'equip');
  }

  // ----------------------------------------------------------- introspection (tests/monitoring)
  playerByName(name: string) { return [...this.onlineChars.values()].find((p) => p.rec.name === name); }
  onlineCount() { return this.onlineChars.size; }
  zoneOf(p: PlayerEntity) { return this.zones.get(p.rec.zoneId); }
  zoneById(id: string) { return getZone(id) ? this.zones.get(id) : undefined; }
  slotsFor(cat: Parameters<typeof slotsForCategory>[0]) { return slotsForCategory(cat); }
}

function constantTimeEq(a: string, b: string): boolean {
  let diff = a.length ^ b.length;
  for (let i = 0; i < Math.max(a.length, b.length); i++) diff |= (a.charCodeAt(i) || 0) ^ (b.charCodeAt(i) || 0);
  return diff === 0;
}

function pickupMsg(code: string): string {
  return ({ no_drop: 'ไอเทมหายไปแล้ว', too_far: 'อยู่ไกลเกินไป', not_owner: 'ไอเทมนี้เป็นของผู้เล่นอื่น (รอ 30 วินาที)', inventory_full: 'กระเป๋าเต็ม', dead: 'คุณตายอยู่' } as Record<string, string>)[code] ?? code;
}
function equipMsg(code: string): string {
  return ({ not_in_bag: 'ไม่พบไอเทม', not_equipment: 'สวมใส่ไม่ได้', level_too_low: 'เลเวลไม่ถึง', empty_slot: 'ช่องว่างอยู่แล้ว', inventory_full: 'กระเป๋าเต็ม', bad_slot: 'ช่องไม่ถูกต้อง' } as Record<string, string>)[code] ?? code;
}
