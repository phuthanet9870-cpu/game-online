import { arcHitsCircle } from './hitbox';
import { computeDamage, DEFAULT_DAMAGE_CONFIG, type DamageConfig } from './damage';
import { dirToAngle, vectorToDir8, type Dir8 } from './direction';
import { CollisionGrid, moveWithCollision } from './movement';
import { dist, normalize, sub, type Vec2 } from './math';
import { CooldownTracker, Resource } from './resources';
import { createRng, type Rng } from './rng';
import { buildPowerView } from './powerView';
import type { AutoView, PowerView } from './worldSource';
import {
  CONTENT,
  getPower,
  isActionDef,
  rankFor,
  skillImplemented,
  statusDef,
  type ActionDef,
  type HitDef,
  type MapData,
  type MonsterDef,
  type MoveDef,
  type PlayerBaseDef,
  type PowerDef,
  type StatusDef,
  type WeaponDef,
  type WeaponType,
} from './content';

/* ------------------------------------------------------------------ types */

export type CharacterState = 'CREATED' | 'IN_WORLD' | 'IN_COMBAT' | 'DEAD' | 'RESPAWNING';
export type CombatState =
  | 'idle'
  | 'moving'
  | 'windup'
  | 'active'
  | 'recovery'
  | 'dashing'
  | 'counter'
  | 'dead';
export type AiState = 'IDLE' | 'PATROL' | 'ALERT' | 'CHASE' | 'ATTACK' | 'RESET' | 'DEAD';
export type ActionSlot = 'basic' | 'skill1' | 'skill2' | 'skill3';
export type PowerSlot = 'p1' | 'p2' | 'p3' | 'p4' | 'p5' | 'ult';
export type RejectReason =
  | 'cooldown'
  | 'stamina'
  | 'busy'
  | 'dead'
  | 'full'
  | 'no-item'
  | 'energy'
  | 'stance'
  | 'no-power'
  | 'weapon'
  | 'empty';

export type ActionRequest =
  | { type: 'attack'; slot: ActionSlot }
  | { type: 'power'; slot: PowerSlot }
  | { type: 'dash' }
  | { type: 'stance' }
  | { type: 'potion' };

export interface PlayerInput {
  move: Vec2;
  aim?: Vec2 | null;
  actions: ActionRequest[];
}

export const EMPTY_INPUT: PlayerInput = { move: { x: 0, y: 0 }, actions: [] };

export type SimEvent =
  | {
      type: 'damage';
      time: number;
      sourceId: string;
      targetId: string;
      amount: number;
      isCrit: boolean;
      pos: Vec2;
      actionId: string;
    }
  | {
      type: 'evade';
      time: number;
      targetId: string;
      pos: Vec2;
      reason: 'dash' | 'reset' | 'protected' | 'shield';
    }
  | { type: 'heal'; time: number; targetId: string; amount: number; pos: Vec2; actionId: string }
  | { type: 'death'; time: number; entityId: string; killerId: string; pos: Vec2 }
  | { type: 'respawn'; time: number; entityId: string; pos: Vec2 }
  | { type: 'action'; time: number; actionId: string; slot: string; angle: number; entityId?: string }
  | {
      type: 'swing';
      time: number;
      actionId: string;
      origin: Vec2;
      angle: number;
      radius: number;
      arcDeg: number;
      entityId?: string;
    }
  | { type: 'dash'; time: number; from: Vec2; dir: Vec2; entityId?: string }
  | { type: 'blink'; time: number; from: Vec2; pos: Vec2; entityId?: string }
  | {
      type: 'projectile';
      time: number;
      projId: string;
      origin: Vec2;
      angle: number;
      speed: number;
      range: number;
      actionId: string;
      entityId?: string;
    }
  | { type: 'projectile-end'; time: number; projId: string; pos: Vec2 }
  | { type: 'telegraph'; time: number; pos: Vec2; radius: number; windupMs: number; entityId?: string }
  | { type: 'rejected'; time: number; action: string; reason: RejectReason }
  | { type: 'status'; time: number; targetId: string; statusId: string; durationMs: number }
  | { type: 'stance'; time: number; entityId: string; on: boolean; reason?: string }
  | { type: 'power-rank'; time: number; entityId: string; rank: number }
  | { type: 'weapon'; time: number; entityId: string; weapon: string }
  | { type: 'counter'; time: number; attackerId: string; pos: Vec2; entityId?: string }
  | { type: 'interrupt'; time: number; entityId: string }
  | { type: 'ai-state'; time: number; entityId: string; from: AiState; to: AiState }
  | { type: 'monster-windup'; time: number; entityId: string; windupMs: number; pos: Vec2; radius: number }
  | { type: 'char-state'; time: number; from: CharacterState; to: CharacterState; entityId?: string }
  | { type: 'loot-drop'; time: number; projId: string; pos: Vec2 }
  | { type: 'loot-pickup'; time: number; projId: string; pos: Vec2 }
  | { type: 'spawn'; time: number; entityId: string; pos: Vec2; action: string }
  | { type: 'despawn'; time: number; entityId: string };

export interface DeathRecapEntry {
  time: number;
  attackerId: string;
  attackerName: string;
  actionId: string;
  amount: number;
  isCrit: boolean;
  mitigation: number;
}

export interface ActiveStatus {
  id: string;
  expiresAt: number;
  defenseMultiplier: number;
  def: StatusDef;
  sourceAtk: number;
  dotMod: number;
  nextTick: number;
  shield: number;
}

interface RunningAction {
  def: ActionDef;
  slot: string;
  power: boolean;
  startedAt: number;
  angle: number;
  aimPoint: Vec2;
  hitsDone: number;
  hitTargets: Array<Set<string>>;
  countered: boolean;
  moved: boolean;
  selfDone: number;
  profGained: number;
}

interface Projectile {
  id: string;
  pos: Vec2;
  dir: Vec2;
  speed: number;
  left: number;
  radius: number;
  hit: HitDef;
  run: RunningAction;
  hits: Set<string>;
}

export interface Loadout {
  actives: string[];
  ultimate: string;
  passives: string[];
}

export interface PowerState {
  def: PowerDef;
  points: number;
  loadout: Loadout;
  stance: boolean;
}

export interface Telemetry {
  distanceMoved: number;
  collisionBlocks: number;
  monstersKilled: number;
  monsterRespawns: number;
  actionsUsed: Record<string, number>;
  dashes: number;
  dashStaminaSpent: number;
  rejected: Record<string, number>;
  playerDeaths: number;
  playerRespawns: number;
  counters: number;
  damageDealt: number;
  damageTaken: number;
}

/* ---------------------------------------------------------------- entities */

export class PlayerEntity {
  readonly id = 'player';
  readonly name: string;
  pos: Vec2;
  facing: Dir8 = 'S';
  aimAngle = Math.PI / 2;
  hp: number;
  readonly maxHp: number;
  readonly stamina: Resource;
  energy: number;
  readonly cooldowns = new CooldownTracker();
  charState: CharacterState = 'CREATED';
  combatState: CombatState = 'idle';
  action: RunningAction | null = null;
  dash: { dir: Vec2; startedAt: number; endsAt: number; speed: number } | null = null;
  invulnerableUntil = 0;
  spawnProtectedUntil = 0;
  lastCombatAt = -Infinity;
  respawnAt = 0;
  buffered: { req: ActionRequest; aim: Vec2 | null; expiresAt: number } | null = null;
  lastDeathRecap: DeathRecapEntry[] = [];
  readonly recentDamage: DeathRecapEntry[] = [];
  statuses: ActiveStatus[] = [];
  moving = false;
  weapon: WeaponDef;
  power: PowerState | null = null;

  constructor(
    readonly base: PlayerBaseDef,
    spawn: Vec2,
    weapon: WeaponDef,
    name = 'Eclipse',
  ) {
    this.name = name;
    this.pos = { ...spawn };
    this.hp = base.maxHp;
    this.maxHp = base.maxHp;
    this.weapon = weapon;
    this.energy = CONTENT.powers.energy.max;
    this.stamina = new Resource(base.stamina.max, base.stamina.regenPerSec, base.stamina.regenDelayMs);
  }

  get alive(): boolean {
    return this.charState !== 'DEAD' && this.charState !== 'RESPAWNING';
  }

  hasStatus(id: string): boolean {
    return this.statuses.some((s) => s.id === id);
  }
}

export class MonsterEntity {
  pos: Vec2;
  hp: number;
  ai: AiState = 'IDLE';
  stateSince = 0;
  stateUntil = 0;
  patrolTarget: Vec2 | null = null;
  nextAttackAt = 0;
  attackStartedAt = 0;
  attackResolved = false;
  staggerUntil = 0;
  facingX: 1 | -1 = 1;
  knock: { vx: number; vy: number; until: number } | null = null;
  statuses: ActiveStatus[] = [];
  diedAt = 0;
  respawnAt = 0;
  lastHitAt = -Infinity;

  constructor(
    readonly id: string,
    readonly def: MonsterDef,
    readonly spawn: Vec2,
  ) {
    this.pos = { ...spawn };
    this.hp = def.maxHp;
  }

  get alive(): boolean {
    return this.ai !== 'DEAD';
  }

  stunned(): boolean {
    return this.statuses.some((s) => s.def.stun);
  }

  rooted(): boolean {
    return this.statuses.some((s) => s.def.root || s.def.stun);
  }
}

/* -------------------------------------------------------------- simulation */

export interface SimulationOptions {
  map: MapData;
  weapon: WeaponDef;
  monsters: MonsterDef[];
  player: PlayerBaseDef;
  seed?: number;
  playerName?: string;
}

const SLOT_TO_SKILL_INDEX: Record<Exclude<ActionSlot, 'basic'>, number> = { skill1: 0, skill2: 1, skill3: 2 };
const BUFFER_MS = 220;
const KNOCKBACK_MS = 140;
const STAGGER_MS = 450;
const COUNTER_IFRAME_MS = 300;
const RECAP_WINDOW_MS = 10_000;
const BLINK_IFRAME_MS = 200;

const mulOf = (list: ActiveStatus[], f: (d: StatusDef) => number | undefined): number =>
  list.reduce((acc, s) => {
    const v = f(s.def);
    return v && v > 0 ? acc * v : acc;
  }, 1);

/**
 * Deterministic single-player simulation used by the offline sandbox / Power Trial.
 * Mirrors server/internal/game/world.go rule-for-rule (same RNG and call order); a parity test
 * compares both. Online play never trusts this copy — the Go server is authoritative.
 */
export class GameSimulation {
  readonly mode = 'offline' as const;
  readonly others: never[] = [];
  time = 0;
  readonly grid: CollisionGrid;
  readonly mapData: MapData;
  readonly mapVersion = 0;
  readonly player: PlayerEntity;
  readonly monsters: MonsterEntity[];
  readonly rng: Rng;
  readonly damageConfig: DamageConfig;
  readonly telemetry: Telemetry = {
    distanceMoved: 0,
    collisionBlocks: 0,
    monstersKilled: 0,
    monsterRespawns: 0,
    actionsUsed: {},
    dashes: 0,
    dashStaminaSpent: 0,
    rejected: {},
    playerDeaths: 0,
    playerRespawns: 0,
    counters: 0,
    damageDealt: 0,
    damageTaken: 0,
  };
  targetId: string | null = null;
  debugGodMode = false;
  projectiles: Projectile[] = [];
  private events: SimEvent[] = [];
  private readonly spawnPoint: Vec2;
  private currentMove: Vec2 = { x: 0, y: 0 };
  private seq = 0;

  constructor(opts: SimulationOptions) {
    const { map } = opts;
    this.mapData = map;
    this.grid = new CollisionGrid(map.width, map.height, map.tileSize, map.collision);
    if (!opts.weapon.implemented || !opts.weapon.basicAttack)
      throw new Error(`weapon ${opts.weapon.id} is not implemented`);
    this.rng = createRng(opts.seed ?? 20261121);
    this.damageConfig = {
      ...DEFAULT_DAMAGE_CONFIG,
      defenseK: opts.player.defenseK,
      maxDamage: opts.player.maxDamage,
    };
    this.spawnPoint = { ...map.playerSpawn };
    this.player = new PlayerEntity(opts.player, map.playerSpawn, opts.weapon, opts.playerName);
    this.monsters = map.monsterSpawns.map((s) => {
      const def = opts.monsters.find((m) => m.id === s.monsterId);
      if (!def) throw new Error(`unknown monster ${s.monsterId}`);
      return new MonsterEntity(s.id, def, { x: s.x, y: s.y });
    });
    this.setCharState('IN_WORLD');
  }

  get weapon(): WeaponDef {
    return this.player.weapon;
  }

  /* --------------------------------- Phase 3 sandbox commands (offline) */
  readonly drops: Array<{ id: string; x: number; y: number }> = [];
  readonly auto: AutoView | null = null;

  powerView(): PowerView | null {
    return this.player.power ? buildPowerView(this.player.power, this.player.weapon.id) : null;
  }

  equip(weapon: string): void {
    this.equipWeapon(weapon as WeaponType);
  }

  /** Power Trial: bind any implemented Power at max proficiency — nothing is created or saved. */
  bind(powerId: string): void {
    const def = getPower(powerId);
    if (!def) return;
    this.bindPower(
      def,
      CONTENT.powers.proficiency.ranks[CONTENT.powers.proficiency.ranks.length - 1]?.points ?? 0,
    );
  }

  unbind(): void {
    this.unbindPower();
  }

  setLoadout(lo: Loadout): void {
    const ps = this.player.power;
    if (ps) ps.loadout = this.sanitizeLoadout(ps, lo);
  }

  saveHotbar(slots: Array<{ action: string; key: string }>): void {
    try {
      localStorage.setItem('tpe.hotbar', JSON.stringify(slots)); // UI preference only (spec §20.1)
    } catch {
      /* storage unavailable: layout lives for this session only */
    }
  }

  drainEvents(): SimEvent[] {
    const e = this.events;
    this.events = [];
    return e;
  }

  getActionDef(slot: ActionSlot): ActionDef {
    const w = this.player.weapon;
    if (slot === 'basic') return w.basicAttack as ActionDef;
    const s = w.skills[SLOT_TO_SKILL_INDEX[slot]];
    if (!s || !isActionDef(s)) throw new Error(`slot ${slot} has no implemented skill`);
    return s;
  }

  getMonster(id: string | null): MonsterEntity | undefined {
    return id ? this.monsters.find((m) => m.id === id) : undefined;
  }

  equipWeapon(id: WeaponType): void {
    const w = CONTENT.weapons.find((x) => x.id === id);
    if (!w || !w.implemented) return;
    const p = this.player;
    p.weapon = w;
    p.action = null;
    p.buffered = null;
    if (p.power?.stance && !p.power.def.allowedWeapons.includes(id)) {
      p.power.stance = false;
      this.emit({ type: 'stance', time: this.time, entityId: p.id, on: false, reason: 'weapon' });
    }
    this.emit({ type: 'weapon', time: this.time, entityId: p.id, weapon: id });
  }

  /** Power Trial / tests: bind without any item (nothing is persisted offline). */
  bindPower(def: PowerDef, points = 0, loadout?: Loadout): void {
    const ps: PowerState = {
      def,
      points,
      loadout: { actives: [], ultimate: '', passives: [] },
      stance: false,
    };
    ps.loadout = loadout ? this.sanitizeLoadout(ps, loadout) : this.defaultLoadout(ps);
    this.player.power = ps;
  }

  unbindPower(): void {
    this.player.power = null;
  }

  unlocked(ps: PowerState): { active: ActionDef[]; ultimate: ActionDef[]; passive: ActionDef[] } {
    const r = rankFor(ps.points);
    return {
      active: ps.def.active.slice(0, r.active),
      ultimate: ps.def.ultimate.slice(0, r.ultimate),
      passive: ps.def.passive.slice(0, r.passive),
    };
  }

  sanitizeLoadout(ps: PowerState, lo: Loadout): Loadout {
    const u = this.unlocked(ps);
    const lim = CONTENT.powers.loadout;
    const ok = (l: ActionDef[], id: string) => l.some((x) => x.id === id && skillImplemented(x));
    const out: Loadout = { actives: [], ultimate: '', passives: [] };
    const seen = new Set<string>();
    for (const id of lo.actives)
      if (out.actives.length < lim.active && !seen.has(id) && ok(u.active, id)) {
        out.actives.push(id);
        seen.add(id);
      }
    if (ok(u.ultimate, lo.ultimate)) out.ultimate = lo.ultimate;
    for (const id of lo.passives)
      if (out.passives.length < lim.passive && !seen.has(id) && ok(u.passive, id)) {
        out.passives.push(id);
        seen.add(id);
      }
    return out;
  }

  defaultLoadout(ps: PowerState): Loadout {
    const u = this.unlocked(ps);
    return this.sanitizeLoadout(ps, {
      actives: u.active.map((a) => a.id),
      ultimate: u.ultimate[0]?.id ?? '',
      passives: u.passive.map((a) => a.id),
    });
  }

  step(dtMs: number, input: PlayerInput = EMPTY_INPUT): void {
    this.time += dtMs;
    this.updatePlayer(dtMs, input);
    this.updateProjectiles(dtMs);
    for (const m of this.monsters) this.updateMonster(m, dtMs);
    this.separate();
  }

  /* ---------------------------------------------------------- internals */

  private emit(e: SimEvent): void {
    this.events.push(e);
  }

  private nextId(prefix: string): string {
    return `${prefix}${++this.seq}`;
  }

  private setCharState(to: CharacterState): void {
    const from = this.player.charState;
    if (from === to) return;
    this.player.charState = to;
    this.emit({ type: 'char-state', time: this.time, from, to });
  }

  private enterCombat(): void {
    this.player.lastCombatAt = this.time;
    if (this.player.charState === 'IN_WORLD') this.setCharState('IN_COMBAT');
  }

  private passives() {
    const p = this.player;
    const m = {
      powerDmg: 1,
      stealthBonus: 1,
      backAttack: 1,
      dotMult: {} as Record<string, number>,
      durAdd: {} as Record<string, number>,
    };
    if (!p.power || !p.power.def.allowedWeapons.includes(p.weapon.id)) return m;
    for (const id of p.power.loadout.passives) {
      const e = p.power.def.passive.find((x) => x.id === id)?.effects;
      if (!e) continue;
      if (e.powerDamageMult) m.powerDmg *= e.powerDamageMult;
      if (e.stealthBonusMult) m.stealthBonus *= e.stealthBonusMult;
      if (e.backAttackMult) m.backAttack *= e.backAttackMult;
      for (const [k, v] of Object.entries(e.dotMult ?? {})) m.dotMult[k] = (m.dotMult[k] ?? 1) * v;
      for (const [k, v] of Object.entries(e.statusDurationAddMs ?? {})) m.durAdd[k] = (m.durAdd[k] ?? 0) + v;
    }
    return m;
  }

  private applyStatus(
    list: ActiveStatus[],
    app: StatusDef,
    fromPlayer: boolean,
    maxHp: number,
  ): ActiveStatus {
    const def = statusDef(app);
    let dur = def.durationMs ?? 0;
    let dotMod = def.dot?.modifier ?? 0;
    let atk = 0;
    if (fromPlayer) {
      const mods = this.passives();
      dur += mods.durAdd[def.id] ?? 0;
      const dm = mods.dotMult[def.id];
      if (dm) dotMod *= dm;
      atk = this.player.base.attack;
    }
    const s: ActiveStatus = {
      id: def.id,
      expiresAt: this.time + dur,
      defenseMultiplier: def.defenseMultiplier || 1,
      def,
      sourceAtk: atk,
      dotMod,
      nextTick: def.dot ? this.time + def.dot.tickMs : 0,
      shield: def.shieldPctMaxHp ? def.shieldPctMaxHp * maxHp : 0,
    };
    const i = list.findIndex((x) => x.id === def.id);
    if (i >= 0) list.splice(i, 1);
    list.push(s);
    return s;
  }

  private updatePlayer(dt: number, input: PlayerInput): void {
    const p = this.player;
    const now = this.time;
    if (p.charState === 'DEAD') {
      if (now >= p.respawnAt) this.respawnPlayer();
      return;
    }
    let stRegen = 0;
    let enRegen = 0;
    p.statuses = p.statuses.filter((s) => s.expiresAt > now && !(s.def.shieldPctMaxHp && s.shield <= 0));
    for (const s of p.statuses) {
      stRegen += s.def.staminaRegenPerSec ?? 0;
      enRegen += s.def.energyRegenPerSec ?? 0;
    }
    p.stamina.update(dt, now);
    if (stRegen > 0) p.stamina.current = Math.min(p.stamina.max, p.stamina.current + (stRegen * dt) / 1000);
    p.energy = Math.min(
      CONTENT.powers.energy.max,
      p.energy + ((CONTENT.powers.energy.regenPerSec + enRegen) * dt) / 1000,
    );

    if (p.charState === 'IN_COMBAT' && now - p.lastCombatAt >= p.base.outOfCombatMs)
      this.setCharState('IN_WORLD');
    if (p.charState === 'IN_WORLD' && p.hp < p.maxHp)
      p.hp = Math.min(p.maxHp, p.hp + (p.maxHp * p.base.outOfCombatRegenPctPerSec * dt) / 1000);

    this.currentMove = input.move;
    for (const req of input.actions) this.handleRequest(req, input.aim ?? null, true);

    if (p.dash) {
      const d = p.dash;
      const stepLen = (d.speed * dt) / 1000;
      const before = p.pos;
      p.pos = moveWithCollision(
        p.pos,
        { x: d.dir.x * stepLen, y: d.dir.y * stepLen },
        p.base.radius,
        this.grid,
      ).pos;
      this.telemetry.distanceMoved += dist(before, p.pos);
      if (now >= d.endsAt) {
        p.dash = null;
        if (!p.action) p.combatState = 'idle';
      }
      if (p.action) this.advanceAction(p.action);
      return;
    }
    if (p.action) {
      this.advanceAction(p.action);
      const a = p.action;
      if (a) {
        const elapsed = now - a.startedAt;
        if (elapsed >= a.def.windupMs + a.def.activeMs && (input.move.x !== 0 || input.move.y !== 0))
          p.action = null;
        else return;
      }
    }
    if (p.buffered) {
      const b = p.buffered;
      p.buffered = null;
      if (now <= b.expiresAt) {
        this.handleRequest(b.req, b.aim, false);
        if (p.action || p.dash) return;
      }
    }
    const mv = input.move;
    if (mv.x !== 0 || mv.y !== 0) {
      const n = normalize(mv);
      const stepLen = (p.base.moveSpeed * Math.min(1, Math.hypot(mv.x, mv.y)) * dt) / 1000;
      const before = p.pos;
      const r = moveWithCollision(p.pos, { x: n.x * stepLen, y: n.y * stepLen }, p.base.radius, this.grid);
      if (r.blockedX || r.blockedY) this.telemetry.collisionBlocks++;
      p.pos = r.pos;
      this.telemetry.distanceMoved += dist(before, r.pos);
      p.facing = vectorToDir8(n, p.facing);
      p.aimAngle = dirToAngle(p.facing);
      p.combatState = 'moving';
      p.moving = true;
    } else {
      p.combatState = 'idle';
      p.moving = false;
    }
  }

  private isBusy(): boolean {
    const p = this.player;
    if (p.dash) return true;
    if (!p.action) return false;
    return this.time - p.action.startedAt < p.action.def.windupMs + p.action.def.activeMs;
  }

  private reject(action: string, reason: RejectReason): void {
    this.telemetry.rejected[reason] = (this.telemetry.rejected[reason] ?? 0) + 1;
    this.emit({ type: 'rejected', time: this.time, action, reason });
  }

  private handleRequest(req: ActionRequest, aim: Vec2 | null, allowBuffer: boolean): void {
    const p = this.player;
    const label = 'slot' in req ? req.slot : req.type;
    if (!p.alive) {
      this.reject(label, 'dead');
      return;
    }
    if (req.type === 'potion') return this.reject('hpPotion', 'no-item'); // offline: no server inventory
    if (req.type === 'stance') return this.toggleStance();
    if (this.isBusy()) {
      if (allowBuffer) p.buffered = { req, aim, expiresAt: this.time + BUFFER_MS };
      else this.reject(label, 'busy');
      return;
    }
    if (req.type === 'dash') this.tryDash();
    else this.tryStartAction(req, aim);
  }

  private toggleStance(): void {
    const p = this.player;
    if (!p.power) return this.reject('powerToggle', 'no-power');
    if (!p.power.def.allowedWeapons.includes(p.weapon.id)) return this.reject('powerToggle', 'weapon');
    p.power.stance = !p.power.stance;
    this.emit({ type: 'stance', time: this.time, entityId: p.id, on: p.power.stance });
  }

  private resolve(req: ActionRequest): { def: ActionDef | null; power: boolean; why?: RejectReason } {
    const p = this.player;
    if (req.type === 'attack') {
      if (req.slot === 'basic') return { def: p.weapon.basicAttack ?? null, power: false };
      const s = p.weapon.skills[SLOT_TO_SKILL_INDEX[req.slot]];
      return { def: s && isActionDef(s) ? s : null, power: false };
    }
    if (req.type !== 'power') return { def: null, power: false };
    if (!p.power) return { def: null, power: true, why: 'no-power' };
    if (!p.power.def.allowedWeapons.includes(p.weapon.id)) return { def: null, power: true, why: 'weapon' };
    if (!p.power.stance) return { def: null, power: true, why: 'stance' };
    const lo = p.power.loadout;
    const id = req.slot === 'ult' ? lo.ultimate : lo.actives[Number(req.slot.slice(1)) - 1];
    const def = id ? [...p.power.def.active, ...p.power.def.ultimate].find((x) => x.id === id) : undefined;
    if (!def || !skillImplemented(def)) return { def: null, power: true, why: 'empty' };
    return { def, power: true };
  }

  private tryDash(): void {
    const p = this.player;
    const cfg = p.base.dash;
    if (!p.cooldowns.isReady('dash', this.time)) return this.reject('dash', 'cooldown');
    if (!p.stamina.trySpend(cfg.staminaCost, this.time)) return this.reject('dash', 'stamina');
    p.cooldowns.trigger('dash', this.time, cfg.cooldownMs);
    const mv = this.currentMove;
    let dir: Vec2;
    if (mv.x !== 0 || mv.y !== 0) {
      p.facing = vectorToDir8(mv, p.facing);
      dir = normalize(mv);
    } else {
      const a = dirToAngle(p.facing);
      dir = { x: Math.cos(a), y: Math.sin(a) };
    }
    p.action = null;
    p.dash = {
      dir,
      startedAt: this.time,
      endsAt: this.time + cfg.durationMs,
      speed: (cfg.distance / cfg.durationMs) * 1000,
    };
    if (cfg.invulnerable) p.invulnerableUntil = Math.max(p.invulnerableUntil, this.time + cfg.durationMs);
    p.combatState = 'dashing';
    this.telemetry.dashes++;
    this.telemetry.dashStaminaSpent += cfg.staminaCost;
    this.emit({ type: 'dash', time: this.time, from: { ...p.pos }, dir, entityId: p.id });
  }

  private tryStartAction(req: ActionRequest, aim: Vec2 | null): void {
    const p = this.player;
    const slot = 'slot' in req ? req.slot : req.type;
    const { def, power, why } = this.resolve(req);
    if (!def) {
      if (why) this.reject(slot, why);
      return;
    }
    if (!p.cooldowns.isReady(def.id, this.time)) return this.reject(slot, 'cooldown');
    const energyCost = def.energyCost ?? 0;
    if (energyCost > 0 && p.energy + 1e-9 < energyCost) return this.reject(slot, 'energy');
    if (!p.stamina.trySpend(def.staminaCost, this.time)) return this.reject(slot, 'stamina');
    p.energy -= energyCost;
    p.cooldowns.trigger(def.id, this.time, def.cooldownMs);
    let aimPoint: Vec2;
    if (aim && (aim.x !== p.pos.x || aim.y !== p.pos.y)) {
      const v = sub(aim, p.pos);
      p.facing = vectorToDir8(v, p.facing);
      p.aimAngle = Math.atan2(v.y, v.x);
      aimPoint = { ...aim };
    } else {
      p.aimAngle = dirToAngle(p.facing);
      aimPoint = { x: p.pos.x + Math.cos(p.aimAngle) * 60, y: p.pos.y + Math.sin(p.aimAngle) * 60 };
    }
    const a: RunningAction = {
      def,
      slot,
      power,
      startedAt: this.time,
      angle: p.aimAngle,
      aimPoint,
      hitsDone: 0,
      hitTargets: (def.hits ?? []).map(() => new Set<string>()),
      countered: false,
      moved: false,
      selfDone: 0,
      profGained: 0,
    };
    p.action = a;
    this.telemetry.actionsUsed[def.id] = (this.telemetry.actionsUsed[def.id] ?? 0) + 1;
    this.emit({ type: 'action', time: this.time, actionId: def.id, slot, angle: p.aimAngle, entityId: p.id });
    if (def.telegraph)
      for (const h of def.hits ?? [])
        if (h.shape === 'circle')
          this.emit({
            type: 'telegraph',
            time: this.time,
            pos: this.circleCenter(a, h),
            radius: h.radius,
            windupMs: h.atMs,
            entityId: p.id,
          });
    if (power) this.addProficiency(CONTENT.powers.proficiency.pointsPerCast, a);
    this.advanceAction(a);
  }

  private addProficiency(pts: number, a: RunningAction): void {
    const ps = this.player.power;
    if (!ps || pts <= 0) return;
    const room = CONTENT.powers.proficiency.maxPointsPerCast - a.profGained;
    if (room <= 0) return;
    pts = Math.min(pts, room);
    a.profGained += pts;
    const before = rankFor(ps.points).rank;
    ps.points += pts;
    const after = rankFor(ps.points).rank;
    if (after > before) this.emit({ type: 'power-rank', time: this.time, entityId: 'player', rank: after });
  }

  private circleCenter(a: RunningAction, h: HitDef): Vec2 {
    const p = this.player;
    if (!h.atAim) return { ...p.pos };
    const d = Math.min(Math.hypot(a.aimPoint.x - p.pos.x, a.aimPoint.y - p.pos.y), h.range ?? 0);
    return { x: p.pos.x + Math.cos(a.angle) * d, y: p.pos.y + Math.sin(a.angle) * d };
  }

  private advanceAction(a: RunningAction): void {
    const p = this.player;
    const el = this.time - a.startedAt;
    const d = a.def;
    if (d.move && !a.moved && el >= d.move.atMs) {
      a.moved = true;
      this.performMove(a, d.move);
    }
    const self = d.selfStatus ?? [];
    while (a.selfDone < self.length && el >= (self[a.selfDone]?.atMs ?? 0)) {
      const s = this.applyStatus(p.statuses, self[a.selfDone] as StatusDef, true, p.maxHp);
      if (s.def.stealth) this.dropAggro();
      this.emit({
        type: 'status',
        time: this.time,
        targetId: p.id,
        statusId: s.id,
        durationMs: s.expiresAt - this.time,
      });
      a.selfDone++;
    }
    const hits = d.hits ?? [];
    while (a.hitsDone < hits.length) {
      const h = hits[a.hitsDone] as HitDef;
      if (el < h.atMs) break;
      this.performHit(a, h, a.hitTargets[a.hitsDone] as Set<string>);
      a.hitsDone++;
    }
    if (el < d.windupMs) p.combatState = 'windup';
    else if (el < d.windupMs + d.activeMs) p.combatState = d.counter ? 'counter' : 'active';
    else if (el < d.windupMs + d.activeMs + d.recoveryMs) p.combatState = 'recovery';
    else {
      if (p.action === a) p.action = null;
      if (!p.dash) p.combatState = 'idle';
    }
  }

  private performMove(a: RunningAction, mv: MoveDef): void {
    const p = this.player;
    let dir = { x: Math.cos(a.angle), y: Math.sin(a.angle) };
    if (mv.type === 'back') dir = { x: -dir.x, y: -dir.y };
    if (mv.iframes)
      p.invulnerableUntil = Math.max(
        p.invulnerableUntil,
        this.time + (mv.type === 'blink' ? BLINK_IFRAME_MS : mv.durationMs),
      );
    if (mv.type === 'blink') {
      const maxD = Math.min(mv.distance, Math.hypot(a.aimPoint.x - p.pos.x, a.aimPoint.y - p.pos.y));
      const from = { ...p.pos };
      let to = { ...p.pos };
      for (let s = 4; s <= maxD; s += 4) {
        const c = { x: from.x + dir.x * s, y: from.y + dir.y * s };
        if (this.grid.boxCollides(c.x, c.y, p.base.radius)) break;
        to = c;
      }
      p.pos = to;
      this.emit({ type: 'blink', time: this.time, from, pos: { ...to }, entityId: p.id });
      return;
    }
    let d = mv.distance;
    if (mv.toAim) d = Math.min(d, Math.hypot(a.aimPoint.x - p.pos.x, a.aimPoint.y - p.pos.y) + 10);
    p.dash = {
      dir,
      startedAt: this.time,
      endsAt: this.time + mv.durationMs,
      speed: (d / Math.max(1, mv.durationMs)) * 1000,
    };
    this.emit({ type: 'dash', time: this.time, from: { ...p.pos }, dir, entityId: p.id });
  }

  private performHit(a: RunningAction, h: HitDef, already: Set<string>): void {
    const p = this.player;
    if (h.shape === 'projectile') {
      const pr: Projectile = {
        id: this.nextId('pj'),
        pos: { ...p.pos },
        dir: { x: Math.cos(a.angle), y: Math.sin(a.angle) },
        speed: h.speed ?? 200,
        left: h.range ?? 120,
        radius: Math.max(2, h.radius),
        hit: h,
        run: a,
        hits: new Set(),
      };
      this.projectiles.push(pr);
      this.emit({
        type: 'projectile',
        time: this.time,
        projId: pr.id,
        origin: { ...p.pos },
        angle: a.angle,
        speed: pr.speed,
        range: pr.left,
        actionId: a.def.id,
        entityId: p.id,
      });
      return;
    }
    if (h.shape === 'circle') {
      const c = this.circleCenter(a, h);
      this.emit({
        type: 'swing',
        time: this.time,
        actionId: a.def.id,
        origin: c,
        angle: a.angle,
        radius: h.radius,
        arcDeg: 360,
        entityId: p.id,
      });
      for (const m of this.monsters) {
        if (!m.alive || already.has(m.id) || dist(c, m.pos) > h.radius + m.def.radius) continue;
        if (!this.grid.hasLineOfSight(p.pos, m.pos) && dist(p.pos, m.pos) > h.radius + m.def.radius) continue;
        already.add(m.id);
        this.damageMonster(m, a, h, c);
      }
      return;
    }
    const arc = h.arcDeg ?? 90;
    this.emit({
      type: 'swing',
      time: this.time,
      actionId: a.def.id,
      origin: { ...p.pos },
      angle: a.angle,
      radius: h.radius,
      arcDeg: arc,
      entityId: p.id,
    });
    for (const m of this.monsters) {
      if (!m.alive || already.has(m.id)) continue;
      if (!arcHitsCircle(p.pos, a.angle, h.radius, arc, m.pos, m.def.radius)) continue;
      if (!this.grid.hasLineOfSight(p.pos, m.pos)) continue;
      already.add(m.id);
      this.damageMonster(m, a, h, p.pos);
    }
  }

  private updateProjectiles(dt: number): void {
    const kept: Projectile[] = [];
    const ts = this.grid.tileSize;
    for (const pr of this.projectiles) {
      const step = (pr.speed * dt) / 1000;
      let alive = true;
      for (let moved = 0; moved < step && alive; ) {
        const s = Math.min(4, step - moved);
        moved += s;
        pr.pos = { x: pr.pos.x + pr.dir.x * s, y: pr.pos.y + pr.dir.y * s };
        pr.left -= s;
        if (pr.left <= 0 || this.grid.isSolidTile(Math.floor(pr.pos.x / ts), Math.floor(pr.pos.y / ts))) {
          alive = false;
          break;
        }
        for (const m of this.monsters) {
          if (!m.alive || pr.hits.has(m.id) || dist(pr.pos, m.pos) > pr.radius + m.def.radius) continue;
          pr.hits.add(m.id);
          if (this.player.alive) this.damageMonster(m, pr.run, pr.hit, pr.pos);
          if (!pr.hit.pierce) {
            alive = false;
            break;
          }
        }
      }
      if (alive) kept.push(pr);
      else this.emit({ type: 'projectile-end', time: this.time, projId: pr.id, pos: { ...pr.pos } });
    }
    this.projectiles = kept;
  }

  private dropAggro(): void {
    for (const m of this.monsters)
      if (m.ai === 'ALERT' || m.ai === 'CHASE' || m.ai === 'ATTACK') {
        this.setAi(m, 'IDLE');
        m.stateUntil = this.time + 800;
      }
  }

  private damageMonster(m: MonsterEntity, a: RunningAction | null, h: HitDef, origin: Vec2): void {
    const p = this.player;
    this.targetId = m.id;
    this.enterCombat();
    if (m.ai === 'RESET') {
      this.emit({ type: 'evade', time: this.time, targetId: m.id, pos: { ...m.pos }, reason: 'reset' });
      return;
    }
    const mods = this.passives();
    let mod = h.modifier;
    if (a?.power) mod *= mods.powerDmg;
    if (m.facingX * (origin.x - m.pos.x) < 0) {
      if (h.bonusBehind) mod *= h.bonusBehind;
      mod *= mods.backAttack;
    }
    if (p.hasStatus('stealth')) {
      mod *= 1.25 * mods.stealthBonus;
      p.statuses = p.statuses.filter((s) => !s.def.stealth);
    }
    mod *= mulOf(m.statuses, (d) => d.damageTakenMultiplier);
    const r = computeDamage(
      {
        baseDamage: p.base.attack,
        weaponCoefficient: p.weapon.weaponCoefficient ?? 1,
        statScaling: 1,
        skillModifier: mod,
        targetDefense: m.def.defense,
        defenseMultiplier: m.statuses.reduce((acc, s) => acc * s.defenseMultiplier, 1),
        critChance: p.base.critChance,
        critMultiplier: p.base.critMultiplier,
        context: 'pve',
        absorb: 0,
      },
      this.rng,
      this.damageConfig,
    );
    if (a?.power) this.addProficiency(CONTENT.powers.proficiency.pointsPerHit, a);
    this.applyMonsterDamage(m, r.amount, r.isCrit, a?.def.id ?? '');
    if (!m.alive) return;
    if (h.applyStatus) {
      const s = this.applyStatus(m.statuses, h.applyStatus, true, m.def.maxHp);
      this.emit({
        type: 'status',
        time: this.time,
        targetId: m.id,
        statusId: s.id,
        durationMs: s.expiresAt - this.time,
      });
      if (s.def.stun && m.ai === 'ATTACK' && !m.attackResolved) {
        this.setAi(m, 'CHASE');
        this.emit({ type: 'interrupt', time: this.time, entityId: m.id });
      }
    }
    if (h.knockback > 0) {
      const dir = normalize(sub(m.pos, origin));
      const speed = (h.knockback / KNOCKBACK_MS) * 1000;
      m.knock = { vx: dir.x * speed, vy: dir.y * speed, until: this.time + KNOCKBACK_MS };
    }
    if (h.interrupt && m.ai === 'ATTACK' && !m.attackResolved) {
      m.staggerUntil = this.time + STAGGER_MS;
      m.nextAttackAt = this.time + STAGGER_MS;
      this.setAi(m, 'CHASE');
      this.emit({ type: 'interrupt', time: this.time, entityId: m.id });
    }
  }

  private applyMonsterDamage(m: MonsterEntity, amount: number, isCrit: boolean, actionId: string): void {
    m.hp = Math.max(0, m.hp - amount);
    m.lastHitAt = this.time;
    this.telemetry.damageDealt += amount;
    this.emit({
      type: 'damage',
      time: this.time,
      sourceId: 'player',
      targetId: m.id,
      amount,
      isCrit,
      pos: { ...m.pos },
      actionId,
    });
    if (m.hp <= 0) {
      this.killMonster(m);
      return;
    }
    if (!m.def.passive && (m.ai === 'IDLE' || m.ai === 'PATROL' || m.ai === 'ALERT')) this.setAi(m, 'CHASE');
  }

  private killMonster(m: MonsterEntity): void {
    m.diedAt = this.time;
    m.respawnAt = this.time + m.def.respawnMs;
    m.knock = null;
    m.statuses = [];
    this.setAi(m, 'DEAD');
    this.telemetry.monstersKilled++;
    this.emit({ type: 'death', time: this.time, entityId: m.id, killerId: 'player', pos: { ...m.pos } });
  }

  private damagePlayer(m: MonsterEntity): void {
    const p = this.player;
    if (!p.alive) return;
    const a = p.action;
    if (a?.def.counter && !a.countered) {
      const el = this.time - a.startedAt;
      if (el >= a.def.windupMs && el < a.def.windupMs + a.def.counter.stanceMs) {
        this.performCounter(a, m);
        return;
      }
    }
    if (this.time < p.invulnerableUntil || this.debugGodMode) {
      this.emit({
        type: 'evade',
        time: this.time,
        targetId: p.id,
        pos: { ...p.pos },
        reason: p.dash ? 'dash' : 'protected',
      });
      return;
    }
    const r = computeDamage(
      {
        baseDamage: m.def.attack,
        weaponCoefficient: 1,
        statScaling: 1,
        skillModifier: 1,
        targetDefense: p.base.defense,
        defenseMultiplier: p.statuses.reduce((acc, s) => acc * s.defenseMultiplier, 1),
        critChance: m.def.critChance,
        critMultiplier: 1.5,
        context: 'pve',
        absorb: 0,
      },
      this.rng,
      this.damageConfig,
    );
    let amount = r.amount;
    for (const s of p.statuses)
      if (s.shield > 0 && amount > 0) {
        const ab = Math.min(s.shield, amount);
        s.shield -= ab;
        amount -= ab;
      }
    p.hp = Math.max(0, p.hp - amount);
    this.telemetry.damageTaken += amount;
    this.targetId ??= m.id;
    this.enterCombat();
    const entry: DeathRecapEntry = {
      time: this.time,
      attackerId: m.id,
      attackerName: m.def.name,
      actionId: `${m.def.id}:attack`,
      amount,
      isCrit: r.isCrit,
      mitigation: r.breakdown.mitigation,
    };
    p.recentDamage.push(entry);
    while (
      p.recentDamage.length > 0 &&
      (p.recentDamage[0] as DeathRecapEntry).time < this.time - RECAP_WINDOW_MS
    )
      p.recentDamage.shift();
    if (amount <= 0) {
      this.emit({ type: 'evade', time: this.time, targetId: p.id, pos: { ...p.pos }, reason: 'shield' });
      return;
    }
    this.emit({
      type: 'damage',
      time: this.time,
      sourceId: m.id,
      targetId: p.id,
      amount,
      isCrit: r.isCrit,
      pos: { ...p.pos },
      actionId: entry.actionId,
    });
    if (p.hp <= 0) this.killPlayer(m);
  }

  private performCounter(a: RunningAction, attacker: MonsterEntity): void {
    const p = this.player;
    const c = a.def.counter;
    if (!c) return;
    a.countered = true;
    this.telemetry.counters++;
    const angle = Math.atan2(attacker.pos.y - p.pos.y, attacker.pos.x - p.pos.x);
    p.aimAngle = angle;
    p.facing = vectorToDir8({ x: Math.cos(angle), y: Math.sin(angle) }, p.facing);
    this.emit({
      type: 'counter',
      time: this.time,
      attackerId: attacker.id,
      pos: { ...p.pos },
      entityId: p.id,
    });
    this.emit({
      type: 'swing',
      time: this.time,
      actionId: a.def.id,
      origin: { ...p.pos },
      angle,
      radius: c.radius,
      arcDeg: c.arcDeg,
      entityId: p.id,
    });
    const h: HitDef = {
      atMs: 0,
      shape: 'arc',
      radius: c.radius,
      arcDeg: c.arcDeg,
      modifier: c.modifier,
      knockback: c.knockback,
      interrupt: true,
    };
    for (const m of this.monsters) {
      if (!m.alive || !arcHitsCircle(p.pos, angle, c.radius, c.arcDeg, m.pos, m.def.radius)) continue;
      this.damageMonster(m, a, h, p.pos);
    }
    a.startedAt = this.time - (a.def.windupMs + a.def.activeMs);
    p.invulnerableUntil = Math.max(p.invulnerableUntil, this.time + COUNTER_IFRAME_MS);
  }

  private killPlayer(killer: MonsterEntity): void {
    const p = this.player;
    p.action = null;
    p.dash = null;
    p.buffered = null;
    p.combatState = 'dead';
    p.respawnAt = this.time + p.base.respawnDelayMs;
    p.lastDeathRecap = [...p.recentDamage];
    p.recentDamage.length = 0;
    p.statuses = [];
    this.setCharState('DEAD');
    this.telemetry.playerDeaths++;
    this.emit({ type: 'death', time: this.time, entityId: p.id, killerId: killer.id, pos: { ...p.pos } });
    for (const m of this.monsters)
      if (m.ai === 'CHASE' || m.ai === 'ATTACK' || m.ai === 'ALERT') this.setAi(m, 'RESET');
  }

  private respawnPlayer(): void {
    const p = this.player;
    this.setCharState('RESPAWNING');
    p.pos = { ...this.spawnPoint };
    p.hp = p.maxHp;
    p.stamina.refill();
    p.statuses = [];
    p.facing = 'S';
    p.combatState = 'idle';
    p.invulnerableUntil = this.time + p.base.spawnProtectionMs;
    p.spawnProtectedUntil = p.invulnerableUntil;
    this.telemetry.playerRespawns++;
    this.emit({ type: 'respawn', time: this.time, entityId: p.id, pos: { ...p.pos } });
    this.setCharState('IN_WORLD');
  }

  /* ------------------------------------------------------------- monster */

  private setAi(m: MonsterEntity, to: AiState): void {
    if (m.ai === to) return;
    const from = m.ai;
    m.ai = to;
    m.stateSince = this.time;
    this.emit({ type: 'ai-state', time: this.time, entityId: m.id, from, to });
  }

  private canAggro(m: MonsterEntity): boolean {
    const p = this.player;
    if (!p.alive || this.time < p.spawnProtectedUntil || p.hasStatus('stealth')) return false;
    const d = dist(m.pos, p.pos);
    return d <= m.def.aggroRadius && this.grid.hasLineOfSight(m.pos, p.pos);
  }

  private moveMonster(m: MonsterEntity, toward: Vec2, speed: number, dt: number): boolean {
    if (m.rooted()) return false;
    speed *= mulOf(m.statuses, (d) => d.speedMultiplier);
    const v = sub(toward, m.pos);
    const d = Math.hypot(v.x, v.y);
    if (d < 0.5) return true;
    const stepLen = Math.min(d, (speed * dt) / 1000);
    const r = moveWithCollision(
      m.pos,
      { x: (v.x / d) * stepLen, y: (v.y / d) * stepLen },
      m.def.radius - 1,
      this.grid,
    );
    if (Math.abs(v.x) > 0.1) m.facingX = v.x > 0 ? 1 : -1;
    m.pos = r.pos;
    return r.blockedX && r.blockedY;
  }

  private tickMonsterStatuses(m: MonsterEntity): void {
    const kept: ActiveStatus[] = [];
    for (const s of m.statuses) {
      if (s.def.dot)
        while (s.nextTick <= this.time && s.nextTick <= s.expiresAt && m.alive) {
          s.nextTick += s.def.dot.tickMs;
          const mit = Math.min(0.5, m.def.defense / (m.def.defense + this.damageConfig.defenseK));
          const amt = Math.max(1, Math.round(s.sourceAtk * s.dotMod * (1 - mit)));
          this.applyMonsterDamage(m, amt, false, `dot:${s.id}`);
        }
      if (s.expiresAt > this.time && m.alive) kept.push(s);
    }
    if (m.alive) m.statuses = kept;
  }

  private updateMonster(m: MonsterEntity, dt: number): void {
    const now = this.time;
    const p = this.player;
    if (m.ai !== 'DEAD') this.tickMonsterStatuses(m);
    if (m.ai === 'DEAD') {
      if (now >= m.respawnAt) {
        m.pos = { ...m.spawn };
        m.hp = m.def.maxHp;
        m.attackResolved = false;
        m.stateUntil = now + 800;
        this.setAi(m, 'IDLE');
        this.telemetry.monsterRespawns++;
        this.emit({ type: 'respawn', time: now, entityId: m.id, pos: { ...m.pos } });
      }
      return;
    }
    if (m.knock && now < m.knock.until)
      m.pos = moveWithCollision(
        m.pos,
        { x: (m.knock.vx * dt) / 1000, y: (m.knock.vy * dt) / 1000 },
        m.def.radius - 1,
        this.grid,
      ).pos;
    else m.knock = null;
    if (m.def.passive) {
      if (now - m.lastHitAt > 3000 && m.hp < m.def.maxHp) m.hp = m.def.maxHp;
      return;
    }
    if (m.stunned()) {
      if (m.ai === 'ATTACK' && !m.attackResolved) this.setAi(m, 'CHASE');
      return;
    }
    const dPlayer = dist(m.pos, p.pos);
    const reach = m.def.attackRange + m.def.radius + p.base.radius;

    switch (m.ai) {
      case 'IDLE':
      case 'PATROL': {
        if (this.canAggro(m)) {
          this.setAi(m, 'ALERT');
          break;
        }
        if (m.ai === 'IDLE') {
          if (now >= m.stateUntil) {
            const ang = this.rng.next() * Math.PI * 2;
            const r = this.rng.range(m.def.patrolRadius * 0.3, m.def.patrolRadius);
            const target = { x: m.spawn.x + Math.cos(ang) * r, y: m.spawn.y + Math.sin(ang) * r };
            const ts = this.grid.tileSize;
            if (!this.grid.isSolidTile(Math.floor(target.x / ts), Math.floor(target.y / ts))) {
              m.patrolTarget = target;
              m.stateUntil = now + 4000;
              this.setAi(m, 'PATROL');
            } else m.stateUntil = now + 500;
          }
        } else {
          const target = m.patrolTarget ?? m.spawn;
          const stuck = this.moveMonster(m, target, m.def.moveSpeed, dt);
          if (dist(m.pos, target) < 2 || stuck || now >= m.stateUntil) {
            m.stateUntil = now + this.rng.range(1000, 2500);
            this.setAi(m, 'IDLE');
          }
        }
        break;
      }
      case 'ALERT': {
        if (!p.alive || p.hasStatus('stealth')) {
          this.setAi(m, 'IDLE');
          break;
        }
        m.facingX = p.pos.x > m.pos.x ? 1 : -1;
        if (now - m.stateSince >= m.def.alertMs) this.setAi(m, 'CHASE');
        break;
      }
      case 'CHASE': {
        if (
          !p.alive ||
          p.hasStatus('stealth') ||
          dist(m.pos, m.spawn) > m.def.leashRadius ||
          dPlayer > m.def.leashRadius * 1.2
        ) {
          this.setAi(m, 'RESET');
          break;
        }
        if (now < m.staggerUntil) break;
        if (dPlayer <= reach && now >= m.nextAttackAt) {
          m.attackStartedAt = now;
          m.attackResolved = false;
          m.facingX = p.pos.x > m.pos.x ? 1 : -1;
          this.setAi(m, 'ATTACK');
          this.emit({
            type: 'monster-windup',
            time: now,
            entityId: m.id,
            windupMs: m.def.attackWindupMs,
            pos: { ...m.pos },
            radius: reach,
          });
          break;
        }
        if (dPlayer > reach * 0.8) this.moveMonster(m, p.pos, m.def.chaseSpeed, dt);
        break;
      }
      case 'ATTACK': {
        const elapsed = now - m.attackStartedAt;
        if (!m.attackResolved && elapsed >= m.def.attackWindupMs) {
          m.attackResolved = true;
          if (p.alive && dist(m.pos, p.pos) <= reach + 3 && this.grid.hasLineOfSight(m.pos, p.pos))
            this.damagePlayer(m);
        }
        if (m.ai !== 'ATTACK') break;
        if (elapsed >= m.def.attackWindupMs + m.def.attackRecoveryMs) {
          m.nextAttackAt = m.attackStartedAt + m.def.attackCooldownMs;
          this.setAi(m, 'CHASE');
        }
        break;
      }
      case 'RESET': {
        const arrived = this.moveMonster(m, m.spawn, m.def.chaseSpeed * 1.3, dt) || dist(m.pos, m.spawn) < 3;
        if (arrived || now - m.stateSince > 5000) {
          if (!arrived) m.pos = { ...m.spawn };
          m.hp = m.def.maxHp;
          m.statuses = [];
          m.stateUntil = now + 1000;
          this.setAi(m, 'IDLE');
        }
        break;
      }
      default:
        break;
    }
  }

  private separate(): void {
    const alive = this.monsters.filter((m) => m.alive && !m.def.passive);
    const p = this.player;
    for (let i = 0; i < alive.length; i++) {
      const a = alive[i] as MonsterEntity;
      for (let j = i + 1; j < alive.length; j++) {
        const b = alive[j] as MonsterEntity;
        this.pushApart(a, b.pos, a.def.radius + b.def.radius, 0.5);
        this.pushApart(b, a.pos, a.def.radius + b.def.radius, 0.5);
      }
      if (p.alive) this.pushApart(a, p.pos, a.def.radius + p.base.radius - 2, 1);
    }
  }

  private pushApart(m: MonsterEntity, other: Vec2, minDist: number, share: number): void {
    const v = sub(m.pos, other);
    const d = Math.hypot(v.x, v.y);
    if (d >= minDist) return;
    const n = d < 1e-6 ? { x: 1, y: 0 } : { x: v.x / d, y: v.y / d };
    const push = (minDist - d) * share;
    m.pos = moveWithCollision(m.pos, { x: n.x * push, y: n.y * push }, m.def.radius - 1, this.grid).pos;
  }
}
