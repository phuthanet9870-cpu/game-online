import {
  CONTENT,
  getMap,
  getWeapon,
  type MapData,
  itemName,
  type ActionDef,
  type MonsterDef,
  type WeaponType,
} from '../core/content';
import { vectorToDir8, type Dir8 } from '../core/direction';
import type { Vec2 } from '../core/math';
import { CollisionGrid, moveWithCollision } from '../core/movement';
import type {
  ActionSlot,
  AiState,
  CharacterState,
  CombatState,
  DeathRecapEntry,
  PlayerInput,
  SimEvent,
  Telemetry,
} from '../core/simulation';
import type {
  AutoReport,
  AutoSettings,
  AutoView,
  MonsterView,
  OnlineState,
  OtherPlayerView,
  PlayerView,
  PowerView,
  WorldSource,
} from '../core/worldSource';
import { hotbarStore, pushLog, requestUi, showToast } from '../game/bridge';
import { defaultLayout, validateLayout, type HotbarLayoutEntry } from '../core/hotbar';

/* ----------------------------------------------------------- wire types */

interface WireAction {
  id: string;
  startedAt: number;
  angle: number;
}
interface WirePlayer {
  id: string;
  name: string;
  x: number;
  y: number;
  facing: Dir8;
  hp: number;
  maxHp: number;
  level: number;
  charState: CharacterState;
  combatState: CombatState;
  moving: boolean;
  dashing: boolean;
  action: WireAction | null;
  invUntil: number;
  connected: boolean;
  weapon?: string;
  stance?: boolean;
  stealth?: boolean;
}
interface WireSelf extends WirePlayer {
  stamina: number;
  maxStamina: number;
  energy: number;
  maxEnergy: number;
  statuses: Array<{ id: string; expiresAt: number }> | null;
  drops: Array<{ id: string; x: number; y: number }> | null;
  powerPts: number;
  cds: Record<string, [number, number]>;
  respawnAt: number;
  recap?: DeathRecapEntry[];
}
interface WireMonster {
  id: string;
  def: string;
  x: number;
  y: number;
  hp: number;
  ai: AiState;
  fx: 1 | -1;
  st: Array<{ id: string; expiresAt: number; defenseMultiplier: number }> | null;
  as: number;
  da: number;
}
interface Snapshot {
  t: 'snap';
  st: number;
  ack: number;
  you: WireSelf;
  players: WirePlayer[];
  monsters: WireMonster[];
  ev: SimEvent[] | null;
}

const INTERP_DELAY_MS = 100;
const SNAP_DISTANCE = 48;
const RECONNECT_MAX = 8;

const ACTION_DEFS = new Map<string, ActionDef>();
for (const w of CONTENT.weapons) {
  if (w.basicAttack) ACTION_DEFS.set(w.basicAttack.id, w.basicAttack);
  for (const s of w.skills) if ('cooldownMs' in s) ACTION_DEFS.set(s.id, s as ActionDef);
}
const toAction = (a: WireAction | null) => {
  const def = a ? ACTION_DEFS.get(a.id) : undefined;
  return a && def ? { def, startedAt: a.startedAt, angle: a.angle } : null;
};

/* ------------------------------------------------------------- entities */

class NetPlayer implements PlayerView {
  id = 'player';
  serverId = '';
  name = '';
  pos: Vec2;
  facing: Dir8 = 'S';
  moving = false;
  dash: object | null = null;
  action: PlayerView['action'] = null;
  charState: CharacterState = 'CREATED';
  combatState: CombatState = 'idle';
  invulnerableUntil = 0;
  hp = 1;
  maxHp = 1;
  stamina = { current: 0, max: 100 };
  respawnAt = 0;
  lastDeathRecap: DeathRecapEntry[] = [];
  energy = 100;
  statuses: Array<{ id: string; expiresAt: number }> = [];
  base: PlayerView['base'];
  private cds = new Map<string, { readyAt: number; duration: number }>();
  cooldowns = {
    remaining: (id: string, now: number) => Math.max(0, (this.cds.get(id)?.readyAt ?? 0) - now),
    fraction: (id: string, now: number) => {
      const c = this.cds.get(id);
      return !c || c.duration <= 0 ? 0 : Math.max(0, c.readyAt - now) / c.duration;
    },
  };
  constructor(spawn: Vec2) {
    this.pos = { ...spawn };
    this.base = { ...CONTENT.player, level: 1 };
  }
  get alive(): boolean {
    return this.charState !== 'DEAD' && this.charState !== 'RESPAWNING';
  }
  setCooldowns(cds: Record<string, [number, number]>, serverNow: number): void {
    this.cds.clear();
    for (const [id, [rem, dur]] of Object.entries(cds))
      this.cds.set(id, { readyAt: serverNow + rem, duration: dur });
  }
}

class NetMonster implements MonsterView {
  pos: Vec2;
  spawn: Vec2;
  hp: number;
  ai: AiState = 'IDLE';
  statuses: Array<{ id: string; defenseMultiplier: number }> = [];
  facingX: 1 | -1 = 1;
  diedAt = 0;
  attackStartedAt = 0;
  constructor(
    readonly id: string,
    readonly def: MonsterDef,
    at: Vec2,
  ) {
    this.pos = { ...at };
    this.spawn = { ...at };
    this.hp = def.maxHp;
  }
  get alive(): boolean {
    return this.ai !== 'DEAD';
  }
}

interface Buffered {
  st: number;
  pos: Map<string, Vec2>;
}

const blankTelemetry = (): Telemetry => ({
  distanceMoved: 0,
  collisionBlocks: 0,
  monstersKilled: 0,
  monsterRespawns: 0,
  actionsUsed: {},
  dashes: 0,
  dashStaminaSpent: 0,
  rejected: { cooldown: 0, stamina: 0, busy: 0, dead: 0, full: 0, 'no-item': 0 },
  playerDeaths: 0,
  playerRespawns: 0,
  counters: 0,
  damageDealt: 0,
  damageTaken: 0,
});

/**
 * Online world mirror. The server is authoritative for everything; the client only predicts its own
 * walking (corrected against lag-compensated history) and interpolates everything else.
 */
export class NetWorld implements WorldSource {
  readonly mode = 'online' as const;
  grid: CollisionGrid;
  mapData: MapData;
  mapVersion = 0;
  readonly player: NetPlayer;
  readonly monsters: NetMonster[] = [];
  others: OtherPlayerView[] = [];
  readonly telemetry = blankTelemetry();
  targetId: string | null = null;
  debugGodMode = false;
  readonly online: OnlineState = {
    status: 'connecting',
    kicked: null,
    gold: 0,
    xp: 0,
    xpStart: 0,
    xpNext: 1,
    level: 1,
    items: [],
    slots: 40,
    ping: 0,
    seq: 0,
    ack: 0,
    playersOnline: 0,
    instance: '',
    testWorld: false,
    gm: null,
  };

  private ws: WebSocket | null = null;
  private events: SimEvent[] = [];
  private buffer: Buffered[] = [];
  private othersById = new Map<string, OtherPlayerView>();
  private offset = 0;
  private haveOffset = false;
  private history: Array<{ t: number; x: number; y: number }> = [];
  private lastMove: Vec2 = { x: 0, y: 0 };
  private lastSendAt = 0;
  private lastPingAt = 0;
  private reconnects = 0;
  private disposed = false;
  private hadSnapshot = false;

  constructor(
    readonly characterId: number,
    private readonly onChange: () => void = () => {},
  ) {
    this.mapData = getMap(CONTENT.startMap);
    this.grid = new CollisionGrid(
      this.mapData.width,
      this.mapData.height,
      this.mapData.tileSize,
      this.mapData.collision,
    );
    this.player = new NetPlayer(this.mapData.playerSpawn);
    this.connect();
  }

  /** Switches the local mirror to another map (server decided: welcome / portal). */
  private loadMap(id: string, pos?: Vec2): void {
    if (this.mapData.mapId === id && this.mapVersion > 0) return;
    const m = getMap(id);
    this.mapData = m;
    this.grid = new CollisionGrid(m.width, m.height, m.tileSize, m.collision);
    this.monsters.length = 0;
    this.othersById.clear();
    this.others = [];
    this.buffer = [];
    this.history = [];
    this.drops = [];
    this.targetId = null;
    this.hadSnapshot = false;
    this.player.pos = pos ? { ...pos } : { ...m.playerSpawn };
    this.mapVersion++;
  }

  get time(): number {
    return performance.now() + this.offset;
  }

  /* --------------------------------------------------------- connection */

  private connect(): void {
    const proto = location.protocol === 'https:' ? 'wss' : 'ws';
    const ws = new WebSocket(`${proto}://${location.host}/ws?char=${this.characterId}`);
    this.ws = ws;
    this.online.status = this.reconnects > 0 ? 'reconnecting' : 'connecting';
    ws.onmessage = (e) => this.onMessage(String(e.data));
    ws.onclose = () => {
      if (this.ws !== ws || this.disposed) return;
      this.ws = null;
      if (this.online.kicked) {
        this.online.status = 'closed';
      } else if (this.reconnects < RECONNECT_MAX) {
        this.online.status = 'reconnecting';
        const delay = Math.min(10_000, 500 * 2 ** this.reconnects++);
        pushLog(
          'system',
          `การเชื่อมต่อหลุด — กำลังเชื่อมต่อใหม่ใน ${(delay / 1000).toFixed(1)} วินาที`,
          'warn',
        );
        setTimeout(() => !this.disposed && this.connect(), delay);
      } else {
        this.online.status = 'closed';
        this.online.kicked = 'เชื่อมต่อเซิร์ฟเวอร์ไม่ได้';
      }
      this.onChange();
    };
  }

  dispose(): void {
    this.disposed = true;
    this.ws?.close(1000, 'leave');
    this.ws = null;
  }

  private send(msg: object): void {
    if (this.ws?.readyState === WebSocket.OPEN) this.ws.send(JSON.stringify(msg));
  }

  private mapId(id: string | undefined): string {
    return id && id === this.player.serverId ? 'player' : (id ?? '');
  }

  private onMessage(raw: string): void {
    let m: { t: string; [k: string]: unknown };
    try {
      m = JSON.parse(raw);
    } catch {
      return;
    }
    switch (m.t) {
      case 'welcome': {
        const you = m.you as { id: string; name: string; level: number };
        this.player.serverId = you.id;
        this.player.name = you.name;
        this.online.instance = String(m.instance);
        this.online.testWorld = Boolean(m.testWorld);
        this.online.status = 'online';
        this.online.kicked = null;
        this.online.seq = 0;
        this.reconnects = 0;
        this.hadSnapshot = false;
        this.loadMap(String(m.map));
        pushLog('system', `เชื่อมต่อเซิร์ฟเวอร์แล้ว (instance ${this.online.instance})`, 'good');
        break;
      }
      case 'map':
        this.loadMap(String(m.map), m.pos as Vec2);
        pushLog('system', `เข้าสู่ ${m.name}`, 'good');
        break;
      case 'snap':
        this.onSnapshot(m as unknown as Snapshot);
        return;
      case 'inv': {
        const o = this.online;
        o.gold = Number(m.gold);
        o.xp = Number(m.xp);
        o.level = Number(m.level);
        o.xpStart = Number(m.xpLevelStart);
        o.xpNext = Number(m.xpLevelNext);
        o.items = (m.items as OnlineState['items']) ?? [];
        o.slots = Number(m.slots);
        this.player.base.level = o.level;
        break;
      }
      case 'reward': {
        pushLog('system', `ได้รับ EXP +${m.xp} · ของดรอปอยู่ที่พื้น (เก็บด้วย H หรือ Auto Loot)`, 'good');
        if (m.levelUp) pushLog('system', `เลเวลอัป! ตอนนี้ Lv.${m.level}`, 'crit');
        break;
      }
      case 'loot': {
        const items = ((m.items as Array<{ itemId: string; quantity: number }>) ?? []).map(
          (i) => `${itemName(i.itemId)} x${i.quantity}`,
        );
        pushLog('system', `เก็บของ: Gold +${m.gold}${items.length ? ` · ${items.join(', ')}` : ''}`, 'good');
        break;
      }
      case 'power':
        this.weaponId = String(m.weapon);
        this.power = (m.bound as PowerView | null) ?? null;
        break;
      case 'hotbar':
        if (Array.isArray(m.slots) && validateLayout(m.slots as HotbarLayoutEntry[]))
          hotbarStore.set(m.slots as HotbarLayoutEntry[]);
        else hotbarStore.set(defaultLayout());
        break;
      case 'auto':
        this.autoView = {
          enabled: Boolean(m.enabled),
          settings: m.settings as AutoSettings,
          live: (m.live as AutoReport) ?? null,
          report: (m.report as AutoReport) ?? this.autoView?.report ?? null,
        };
        if (m.report)
          pushLog(
            'system',
            `Auto Farm หยุด (${(m.report as AutoReport).reason}) — ดูรายงานในแผง Auto`,
            'warn',
          );
        break;
      case 'result':
        if (!m.ok) showToast(String(m.error ?? 'ทำรายการไม่สำเร็จ'));
        else if (m.op !== 'hotbar' && m.op !== 'loadout')
          pushLog('system', `สำเร็จ: ${m.op}${m.msg ? ` — ${m.msg}` : ''}`, 'good');
        break;
      case 'npc':
        if (m.npc === 'severer') requestUi('severer');
        else requestUi('npc', String(m.npc), m);
        break;
      case 'gm-result':
        this.gmResult = m;
        break;
      case 'chat':
        pushLog('world', `${m.from}: ${m.text}`);
        break;
      case 'sys':
        pushLog('system', String(m.text), (m.tone as 'normal') ?? 'normal');
        break;
      case 'gm':
        this.online.gm = m.open
          ? { open: true, role: String(m.role), caps: (m.caps as string[]) ?? [] }
          : null;
        pushLog(
          'system',
          m.open ? `GM Control Center เปิดแล้ว (role: ${m.role})` : 'ปิด GM Control Center',
          'good',
        );
        break;
      case 'kicked':
        this.online.kicked = String(m.reason);
        this.online.status = 'closed';
        pushLog('system', `ถูกตัดการเชื่อมต่อ: ${m.reason}`, 'bad');
        break;
      case 'pong':
        this.online.ping = Math.round(performance.now() - Number(m.c));
        break;
    }
    this.onChange();
  }

  private onSnapshot(s: Snapshot): void {
    const now = performance.now();
    const sample = s.st - now;
    if (!this.haveOffset) {
      this.offset = sample;
      this.haveOffset = true;
    } else this.offset += (sample - this.offset) * 0.1;
    this.online.ack = s.ack;
    this.online.playersOnline = s.players.length;

    const p = this.player;
    const y = s.you;
    p.hp = y.hp;
    p.maxHp = y.maxHp;
    p.charState = y.charState;
    p.combatState = y.combatState;
    p.stamina = { current: y.stamina, max: y.maxStamina };
    p.setCooldowns(y.cds ?? {}, s.st);
    p.action = toAction(y.action);
    p.dash = y.dashing ? {} : null;
    p.invulnerableUntil = y.invUntil;
    p.respawnAt = y.respawnAt;
    if (y.recap) p.lastDeathRecap = y.recap;
    if (!this.predicting()) p.facing = y.facing;
    this.reconcile({ x: y.x, y: y.y }, now);

    // other players
    const seen = new Set<string>();
    for (const w of s.players) {
      if (w.id === p.serverId) continue;
      seen.add(w.id);
      const o = this.othersById.get(w.id) ?? ({ id: w.id, pos: { x: w.x, y: w.y } } as OtherPlayerView);
      Object.assign(o, {
        name: w.name,
        level: w.level,
        facing: w.facing,
        moving: w.moving,
        dashing: w.dashing,
        hp: w.hp,
        maxHp: w.maxHp,
        charState: w.charState,
        action: toAction(w.action),
        invulnerableUntil: w.invUntil,
        connected: w.connected,
      });
      this.othersById.set(w.id, o);
    }
    for (const id of [...this.othersById.keys()]) if (!seen.has(id)) this.othersById.delete(id);
    this.others = [...this.othersById.values()];

    p.energy = y.energy ?? 0;
    p.statuses = y.statuses ?? [];
    this.drops = y.drops ?? [];
    if (this.power) this.power.points = y.powerPts ?? this.power.points;
    if (y.weapon) this.weaponId = y.weapon;
    if (this.power) this.power.stance = !!y.stance;

    // monsters (GM test spawns appear/disappear dynamically)
    const byId = new Map(this.monsters.map((m) => [m.id, m]));
    const present = new Set(s.monsters.map((w) => w.id));
    for (let i = this.monsters.length - 1; i >= 0; i--)
      if (!present.has((this.monsters[i] as NetMonster).id)) this.monsters.splice(i, 1);
    for (const w of s.monsters) {
      let m = byId.get(w.id);
      if (!m) {
        const def = CONTENT.monsters.find((d) => d.id === w.def);
        if (!def) continue;
        m = new NetMonster(w.id, def, { x: w.x, y: w.y });
        this.monsters.push(m);
      }
      m.hp = w.hp;
      m.ai = w.ai;
      m.facingX = w.fx;
      m.statuses = (w.st ?? []).map((x) => ({ id: x.id, defenseMultiplier: x.defenseMultiplier }));
      m.attackStartedAt = w.as;
      m.diedAt = w.da;
      if (!this.hadSnapshot || w.ai === 'DEAD') m.pos = { x: w.x, y: w.y };
    }

    // interpolation buffer
    const pos = new Map<string, Vec2>();
    for (const w of s.players) if (w.id !== p.serverId) pos.set(w.id, { x: w.x, y: w.y });
    for (const w of s.monsters) pos.set(w.id, { x: w.x, y: w.y });
    this.buffer.push({ st: s.st, pos });
    if (this.buffer.length > 30) this.buffer.shift();
    this.hadSnapshot = true;

    for (const e of s.ev ?? []) this.ingestEvent(e);
  }

  private ingestEvent(raw: SimEvent): void {
    const e = { ...raw } as SimEvent & Record<string, unknown>;
    for (const k of ['sourceId', 'targetId', 'entityId', 'killerId', 'attackerId'] as const)
      if (typeof e[k] === 'string') (e as Record<string, unknown>)[k] = this.mapId(e[k] as string);
    // only our own swings/actions/dashes drive local VFX; others are shown by snapshots
    if (
      (e.type === 'swing' || e.type === 'action' || e.type === 'dash') &&
      (e as Record<string, unknown>).entityId !== 'player'
    ) {
      if (e.type !== 'swing') return;
    }
    const t = this.telemetry;
    if (e.type === 'damage' && e.sourceId === 'player') {
      t.damageDealt += e.amount;
      this.targetId = e.targetId;
    }
    if (e.type === 'damage' && e.targetId === 'player') {
      t.damageTaken += e.amount;
      this.targetId ??= e.sourceId;
    }
    if (e.type === 'death' && e.killerId === 'player') t.monstersKilled++;
    if (e.type === 'death' && e.entityId === 'player') t.playerDeaths++;
    if (e.type === 'respawn' && e.entityId === 'player') {
      t.playerRespawns++;
      this.player.pos = { ...e.pos };
      this.history = [];
    }
    if (e.type === 'action' && e.entityId === 'player')
      t.actionsUsed[e.actionId] = (t.actionsUsed[e.actionId] ?? 0) + 1;
    if (e.type === 'counter' && e.entityId === 'player') t.counters++;
    this.events.push(e);
  }

  /* ---------------------------------------------------------- prediction */

  private predicting(): boolean {
    const p = this.player;
    return (
      p.alive &&
      !p.dash &&
      p.combatState !== 'windup' &&
      p.combatState !== 'active' &&
      p.combatState !== 'counter'
    );
  }

  /** Compare the server position with where we predicted we were ~one-way-latency ago. */
  private reconcile(server: Vec2, now: number): void {
    const p = this.player;
    if (!this.hadSnapshot || !this.predicting()) {
      // server-driven movement (dash, knockback-free action locks, death/respawn): follow smoothly
      const dx = server.x - p.pos.x;
      const dy = server.y - p.pos.y;
      if (Math.hypot(dx, dy) > SNAP_DISTANCE || !this.hadSnapshot) p.pos = { ...server };
      else p.pos = { x: p.pos.x + dx * 0.5, y: p.pos.y + dy * 0.5 };
      this.history = [];
      return;
    }
    const lag = this.online.ping / 2 + 1000 / 30;
    const target = now - lag;
    let past = this.history[0];
    for (const h of this.history) {
      if (h.t > target) break;
      past = h;
    }
    const ref = past ?? { x: p.pos.x, y: p.pos.y };
    const ex = server.x - ref.x;
    const ey = server.y - ref.y;
    const err = Math.hypot(ex, ey);
    if (err > SNAP_DISTANCE) {
      p.pos = { ...server };
      this.history = [];
    } else if (err > 0.5) {
      const k = 0.2;
      p.pos = moveWithCollision(p.pos, { x: ex * k, y: ey * k }, CONTENT.player.radius, this.grid).pos;
      for (const h of this.history) {
        h.x += ex * k;
        h.y += ey * k;
      }
    }
    this.history = this.history.filter((h) => h.t >= now - 1000);
  }

  /* ---------------------------------------------------------------- step */

  step(dtMs: number, input: PlayerInput): void {
    const now = performance.now();
    const p = this.player;
    const acts = input.actions.map((a) => ('slot' in a ? { type: a.type, slot: a.slot } : { type: a.type }));
    const moveChanged = input.move.x !== this.lastMove.x || input.move.y !== this.lastMove.y;
    if (acts.length > 0 || moveChanged || input.aim || now - this.lastSendAt > 250) {
      if (acts.length > 0 || moveChanged || now - this.lastSendAt > 33) {
        this.online.seq++;
        this.send({
          t: 'input',
          seq: this.online.seq,
          mv: [input.move.x, input.move.y],
          aim: input.aim ? [input.aim.x, input.aim.y] : null,
          act: acts,
        });
        this.lastMove = { ...input.move };
        this.lastSendAt = now;
        for (const a of input.actions)
          if (a.type === 'dash') {
            this.telemetry.dashes++;
            this.telemetry.dashStaminaSpent += CONTENT.player.dash.staminaCost;
          }
      }
    }
    if (now - this.lastPingAt > 2000) {
      this.lastPingAt = now;
      this.send({ t: 'ping', c: now });
    }
    // local prediction of walking only
    if (this.hadSnapshot && this.predicting() && (input.move.x !== 0 || input.move.y !== 0)) {
      const len = Math.hypot(input.move.x, input.move.y);
      const step = (CONTENT.player.moveSpeed * dtMs) / 1000;
      const r = moveWithCollision(
        p.pos,
        { x: (input.move.x / len) * step, y: (input.move.y / len) * step },
        CONTENT.player.radius,
        this.grid,
      );
      if (r.blockedX || r.blockedY) this.telemetry.collisionBlocks++;
      this.telemetry.distanceMoved += Math.hypot(r.pos.x - p.pos.x, r.pos.y - p.pos.y);
      p.pos = r.pos;
      p.facing = vectorToDir8(input.move, p.facing);
      p.moving = true;
    } else p.moving = false;
    this.history.push({ t: now, x: p.pos.x, y: p.pos.y });
    this.interpolate();
  }

  private interpolate(): void {
    const b = this.buffer;
    if (b.length === 0) return;
    const rt = this.time - INTERP_DELAY_MS;
    let a = b[0] as Buffered;
    let c = b[b.length - 1] as Buffered;
    for (let i = 0; i < b.length - 1; i++) {
      const x = b[i] as Buffered;
      const y = b[i + 1] as Buffered;
      if (x.st <= rt && y.st >= rt) {
        a = x;
        c = y;
        break;
      }
    }
    const k = c.st === a.st ? 1 : Math.min(1, Math.max(0, (rt - a.st) / (c.st - a.st)));
    const lerp = (id: string): Vec2 | undefined => {
      const pa = a.pos.get(id);
      const pc = c.pos.get(id);
      if (!pa || !pc) return pc ?? pa;
      return { x: pa.x + (pc.x - pa.x) * k, y: pa.y + (pc.y - pa.y) * k };
    };
    for (const m of this.monsters) {
      if (m.ai === 'DEAD') continue;
      const v = lerp(m.id);
      if (v) m.pos = v;
    }
    for (const o of this.others) {
      const v = lerp(o.id);
      if (v) o.pos = v;
    }
  }

  /* ------------------------------------------------------------ api/misc */

  drainEvents(): SimEvent[] {
    const e = this.events;
    this.events = [];
    return e;
  }

  getActionDef(slot: ActionSlot): ActionDef {
    if (slot === 'basic') return this.weapon.basicAttack as ActionDef;
    const idx = { skill1: 0, skill2: 1, skill3: 2 }[slot];
    return this.weapon.skills[idx] as ActionDef;
  }

  getMonster(id: string | null): MonsterView | undefined {
    return id ? this.monsters.find((m) => m.id === id) : undefined;
  }

  sendChat(text: string): void {
    this.send({ t: 'chat', text });
  }

  /* ------------------------------------------------- Phase 3 commands */
  power: PowerView | null = null;
  weaponId = 'sword';
  drops: Array<{ id: string; x: number; y: number }> = [];
  autoView: AutoView | null = null;
  gmResult: Record<string, unknown> | null = null;

  get auto(): AutoView | null {
    return this.autoView;
  }
  get weapon() {
    return getWeapon(this.weaponId as WeaponType);
  }
  powerView(): PowerView | null {
    return this.power;
  }
  equip(weapon: string): void {
    this.send({ t: 'equip', weapon });
  }
  bind(itemId: string): void {
    this.send({ t: 'bind', itemId });
  }
  unbind(confirm: string): void {
    this.send({ t: 'unbind', confirm });
  }
  setLoadout(loadout: { actives: string[]; ultimate: string; passives: string[] }): void {
    this.send({ t: 'loadout', loadout });
  }
  craft(recipe: string): void {
    this.send({ t: 'craft', recipe });
  }
  saveHotbar(slots: Array<{ action: string; key: string }>): void {
    this.send({ t: 'hotbar', slots });
  }
  setAuto(enabled: boolean | null, settings?: AutoSettings): void {
    this.send({ t: 'auto', ...(enabled === null ? {} : { enabled }), ...(settings ? { settings } : {}) });
  }
  pickup(id: string): void {
    this.send({ t: 'pickup', id });
  }
  gm(op: string, args: Record<string, unknown>): void {
    this.send({ t: 'gm', op, ...args });
  }
  talk(npc: string): void {
    this.send({ t: 'talk', npc });
  }
  shop(op: 'buy' | 'sell' | 'sellAllTrade', itemId?: string, qty?: number): void {
    this.send({ t: 'shop', npc: 'merchant', op, itemId, qty });
  }
  storage(op: 'deposit' | 'withdraw', itemId: string, qty: number): void {
    this.send({ t: 'storage', npc: 'storage', op, itemId, qty });
  }

  usePotion(): void {
    this.online.seq++;
    this.send({
      t: 'input',
      seq: this.online.seq,
      mv: [this.lastMove.x, this.lastMove.y],
      aim: null,
      act: [{ type: 'potion' }],
    });
  }
}
