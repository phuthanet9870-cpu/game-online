import { arcHitsCircle } from './hitbox';
import { computeDamage, DEFAULT_DAMAGE_CONFIG, type DamageConfig } from './damage';
import { dirToAngle, vectorToDir8, type Dir8 } from './direction';
import { CollisionGrid, moveWithCollision } from './movement';
import { dist, normalize, sub, type Vec2 } from './math';
import { CooldownTracker, Resource } from './resources';
import { createRng, type Rng } from './rng';
import {
  isActionDef,
  type ActionDef,
  type HitDef,
  type MapData,
  type MonsterDef,
  type PlayerBaseDef,
  type StatusDef,
  type WeaponDef,
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
export type RejectReason = 'cooldown' | 'stamina' | 'busy' | 'dead' | 'full' | 'no-item';

export type ActionRequest = { type: 'attack'; slot: ActionSlot } | { type: 'dash' };

export interface PlayerInput {
  /** Unit (or zero) movement vector. */
  move: Vec2;
  /** Optional world-space aim point (mouse). If absent, the facing direction is used. */
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
  | { type: 'evade'; time: number; targetId: string; pos: Vec2; reason: 'dash' | 'reset' | 'protected' }
  | { type: 'heal'; time: number; targetId: string; amount: number; pos: Vec2; actionId: string }
  | { type: 'death'; time: number; entityId: string; killerId: string; pos: Vec2 }
  | { type: 'respawn'; time: number; entityId: string; pos: Vec2 }
  | { type: 'action'; time: number; actionId: string; slot: ActionSlot; angle: number }
  | {
      type: 'swing';
      time: number;
      actionId: string;
      origin: Vec2;
      angle: number;
      radius: number;
      arcDeg: number;
    }
  | { type: 'dash'; time: number; from: Vec2; dir: Vec2 }
  | { type: 'rejected'; time: number; action: string; reason: RejectReason }
  | { type: 'status'; time: number; targetId: string; statusId: string; durationMs: number }
  | { type: 'counter'; time: number; attackerId: string; pos: Vec2 }
  | { type: 'interrupt'; time: number; entityId: string }
  | { type: 'ai-state'; time: number; entityId: string; from: AiState; to: AiState }
  | { type: 'monster-windup'; time: number; entityId: string; windupMs: number; pos: Vec2; radius: number }
  | { type: 'char-state'; time: number; from: CharacterState; to: CharacterState };

export interface DeathRecapEntry {
  time: number;
  attackerId: string;
  attackerName: string;
  actionId: string;
  amount: number;
  isCrit: boolean;
  mitigation: number;
}

interface ActiveStatus {
  id: string;
  expiresAt: number;
  defenseMultiplier: number;
}

interface RunningAction {
  def: ActionDef;
  slot: ActionSlot;
  startedAt: number;
  angle: number;
  hitsDone: number;
  hitTargets: Array<Set<string>>;
  countered: boolean;
}

export interface Telemetry {
  distanceMoved: number;
  collisionBlocks: number;
  monstersKilled: number;
  monsterRespawns: number;
  actionsUsed: Record<string, number>;
  dashes: number;
  dashStaminaSpent: number;
  rejected: Record<RejectReason, number>;
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

  constructor(
    readonly base: PlayerBaseDef,
    spawn: Vec2,
    name = 'Eclipse',
  ) {
    this.name = name;
    this.pos = { ...spawn };
    this.hp = base.maxHp;
    this.maxHp = base.maxHp;
    this.stamina = new Resource(base.stamina.max, base.stamina.regenPerSec, base.stamina.regenDelayMs);
  }

  get alive(): boolean {
    return this.charState !== 'DEAD' && this.charState !== 'RESPAWNING';
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

/**
 * Deterministic single-player combat simulation (Phase 1).
 * Runs headless (unit tests) and inside the Phaser scene. No Phaser/React imports allowed here:
 * from Phase 2 the authoritative copy of these rules lives on the server.
 */
export class GameSimulation {
  readonly mode = 'offline' as const;
  /** Other players — always empty in the offline sandbox. */
  readonly others: never[] = [];
  time = 0;
  readonly grid: CollisionGrid;
  readonly player: PlayerEntity;
  readonly monsters: MonsterEntity[];
  readonly weapon: WeaponDef;
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
    rejected: { cooldown: 0, stamina: 0, busy: 0, dead: 0, full: 0, 'no-item': 0 },
    playerDeaths: 0,
    playerRespawns: 0,
    counters: 0,
    damageDealt: 0,
    damageTaken: 0,
  };
  /** Last monster the player hit or was hit by (for the target frame). */
  targetId: string | null = null;
  /** QA/GM only: invulnerability for testing. Not exposed in production player UI. */
  debugGodMode = false;
  private events: SimEvent[] = [];
  private currentMove: Vec2 = { x: 0, y: 0 };
  private readonly spawnPoint: Vec2;

  constructor(opts: SimulationOptions) {
    const { map } = opts;
    this.grid = new CollisionGrid(map.width, map.height, map.tileSize, map.collision);
    this.weapon = opts.weapon;
    if (!opts.weapon.implemented || !opts.weapon.basicAttack)
      throw new Error(`weapon ${opts.weapon.id} is not implemented in this phase`);
    this.rng = createRng(opts.seed ?? 20261121);
    this.damageConfig = {
      ...DEFAULT_DAMAGE_CONFIG,
      defenseK: opts.player.defenseK,
      maxDamage: opts.player.maxDamage,
    };
    this.spawnPoint = { ...map.playerSpawn };
    this.player = new PlayerEntity(opts.player, map.playerSpawn, opts.playerName);
    this.monsters = map.monsterSpawns.map((s) => {
      const def = opts.monsters.find((m) => m.id === s.monsterId);
      if (!def) throw new Error(`unknown monster ${s.monsterId}`);
      return new MonsterEntity(s.id, def, { x: s.x, y: s.y });
    });
    this.setCharState('IN_WORLD');
  }

  /* ---------------------------------------------------------- public api */

  drainEvents(): SimEvent[] {
    const e = this.events;
    this.events = [];
    return e;
  }

  getActionDef(slot: ActionSlot): ActionDef {
    if (slot === 'basic') return this.weapon.basicAttack as ActionDef;
    const s = this.weapon.skills[SLOT_TO_SKILL_INDEX[slot]];
    if (!s || !isActionDef(s)) throw new Error(`slot ${slot} has no implemented skill`);
    return s;
  }

  getMonster(id: string | null): MonsterEntity | undefined {
    return id ? this.monsters.find((m) => m.id === id) : undefined;
  }

  step(dtMs: number, input: PlayerInput = EMPTY_INPUT): void {
    this.time += dtMs;
    this.updatePlayer(dtMs, input);
    for (const m of this.monsters) this.updateMonster(m, dtMs);
    this.separate();
  }

  /* -------------------------------------------------------------- player */

  private emit(e: SimEvent): void {
    this.events.push(e);
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

  private updatePlayer(dt: number, input: PlayerInput): void {
    const p = this.player;
    const now = this.time;

    if (p.charState === 'DEAD') {
      if (now >= p.respawnAt) this.respawnPlayer();
      return;
    }

    p.stamina.update(dt, now);
    p.statuses = p.statuses.filter((s) => s.expiresAt > now);

    if (p.charState === 'IN_COMBAT' && now - p.lastCombatAt >= p.base.outOfCombatMs)
      this.setCharState('IN_WORLD');
    if (p.charState === 'IN_WORLD' && p.hp < p.maxHp)
      p.hp = Math.min(p.maxHp, p.hp + (p.maxHp * p.base.outOfCombatRegenPctPerSec * dt) / 1000);

    this.currentMove = input.move;
    // action requests (edge-triggered)
    for (const req of input.actions) this.handleRequest(req, input.aim ?? null, true);

    // dash in progress
    if (p.dash) {
      const d = p.dash;
      const stepLen = (d.speed * dt) / 1000;
      const before = p.pos;
      const r = moveWithCollision(
        p.pos,
        { x: d.dir.x * stepLen, y: d.dir.y * stepLen },
        p.base.radius,
        this.grid,
      );
      p.pos = r.pos;
      this.telemetry.distanceMoved += dist(before, r.pos);
      if (now >= d.endsAt) {
        p.dash = null;
        p.combatState = 'idle';
      }
      return;
    }

    // running action
    if (p.action) {
      this.advanceAction(p.action);
      const a = p.action;
      if (a) {
        const elapsed = now - a.startedAt;
        const lockEnd = a.def.windupMs + a.def.activeMs;
        // cancel window: movement input during recovery ends the action
        if (elapsed >= lockEnd && (input.move.x !== 0 || input.move.y !== 0)) p.action = null;
        else return;
      }
    }

    // buffered request (pressed while busy)
    if (p.buffered) {
      const b = p.buffered;
      p.buffered = null;
      if (now <= b.expiresAt) {
        this.handleRequest(b.req, b.aim, false);
        if (p.action || p.dash) return;
      }
    }

    // free movement
    const mv = input.move;
    if (mv.x !== 0 || mv.y !== 0) {
      const n = normalize(mv);
      const stepLen = (p.base.moveSpeed * dt) / 1000;
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
    const elapsed = this.time - p.action.startedAt;
    return elapsed < p.action.def.windupMs + p.action.def.activeMs;
  }

  private handleRequest(req: ActionRequest, aim: Vec2 | null, allowBuffer: boolean): void {
    const p = this.player;
    const label = req.type === 'dash' ? 'dash' : req.slot;
    if (!p.alive) {
      this.reject(label, 'dead');
      return;
    }
    if (this.isBusy()) {
      if (allowBuffer) p.buffered = { req, aim, expiresAt: this.time + BUFFER_MS };
      else this.reject(label, 'busy');
      return;
    }
    if (req.type === 'dash') this.tryDash();
    else this.tryStartAction(req.slot, aim);
  }

  private reject(action: string, reason: RejectReason): void {
    this.telemetry.rejected[reason]++;
    this.emit({ type: 'rejected', time: this.time, action, reason });
  }

  private tryDash(): void {
    const p = this.player;
    const cfg = p.base.dash;
    if (!p.cooldowns.isReady('dash', this.time)) return this.reject('dash', 'cooldown');
    if (!p.stamina.trySpend(cfg.staminaCost, this.time)) return this.reject('dash', 'stamina');
    p.cooldowns.trigger('dash', this.time, cfg.cooldownMs);
    // dash direction: held movement direction, otherwise current facing
    const mv = this.currentMove;
    if (mv.x !== 0 || mv.y !== 0) p.facing = vectorToDir8(mv, p.facing);
    const dir =
      mv.x !== 0 || mv.y !== 0
        ? normalize(mv)
        : (() => {
            const ang = dirToAngle(p.facing);
            return { x: Math.cos(ang), y: Math.sin(ang) };
          })();
    p.action = null; // dash cancels recovery
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
    this.emit({ type: 'dash', time: this.time, from: { ...p.pos }, dir });
  }

  private tryStartAction(slot: ActionSlot, aim: Vec2 | null): void {
    const p = this.player;
    const def = this.getActionDef(slot);
    if (!p.cooldowns.isReady(def.id, this.time)) return this.reject(slot, 'cooldown');
    if (!p.stamina.trySpend(def.staminaCost, this.time)) return this.reject(slot, 'stamina');
    p.cooldowns.trigger(def.id, this.time, def.cooldownMs);
    if (aim) {
      const v = sub(aim, p.pos);
      if (v.x !== 0 || v.y !== 0) {
        p.facing = vectorToDir8(v, p.facing);
        p.aimAngle = Math.atan2(v.y, v.x);
      }
    } else p.aimAngle = dirToAngle(p.facing);
    p.action = {
      def,
      slot,
      startedAt: this.time,
      angle: p.aimAngle,
      hitsDone: 0,
      hitTargets: (def.hits ?? []).map(() => new Set<string>()),
      countered: false,
    };
    p.combatState = def.windupMs > 0 ? 'windup' : def.counter ? 'counter' : 'active';
    this.telemetry.actionsUsed[def.id] = (this.telemetry.actionsUsed[def.id] ?? 0) + 1;
    this.emit({ type: 'action', time: this.time, actionId: def.id, slot, angle: p.aimAngle });
    this.advanceAction(p.action); // resolve 0ms hits immediately
  }

  private advanceAction(a: RunningAction): void {
    const p = this.player;
    const elapsed = this.time - a.startedAt;
    const hits = a.def.hits ?? [];
    while (a.hitsDone < hits.length) {
      const h = hits[a.hitsDone] as HitDef;
      if (elapsed < h.atMs) break;
      this.performPlayerHit(a, h, a.hitTargets[a.hitsDone] as Set<string>);
      a.hitsDone++;
    }
    const { windupMs, activeMs, recoveryMs } = a.def;
    if (elapsed < windupMs) p.combatState = 'windup';
    else if (elapsed < windupMs + activeMs) p.combatState = a.def.counter ? 'counter' : 'active';
    else if (elapsed < windupMs + activeMs + recoveryMs) p.combatState = 'recovery';
    else {
      p.action = null;
      p.combatState = 'idle';
    }
  }

  private performPlayerHit(a: RunningAction, h: HitDef, already: Set<string>): void {
    const p = this.player;
    this.emit({
      type: 'swing',
      time: this.time,
      actionId: a.def.id,
      origin: { ...p.pos },
      angle: a.angle,
      radius: h.radius,
      arcDeg: h.arcDeg,
    });
    for (const m of this.monsters) {
      if (!m.alive || already.has(m.id)) continue;
      if (!arcHitsCircle(p.pos, a.angle, h.radius, h.arcDeg, m.pos, m.def.radius)) continue;
      if (!this.grid.hasLineOfSight(p.pos, m.pos)) continue;
      already.add(m.id);
      this.damageMonster(m, a.def.id, h.modifier, h.knockback, h.applyStatus, !!h.interrupt);
    }
  }

  private damageMonster(
    m: MonsterEntity,
    actionId: string,
    modifier: number,
    knockback: number,
    status: StatusDef | undefined,
    interrupt: boolean,
  ): void {
    const p = this.player;
    this.targetId = m.id;
    this.enterCombat();
    if (m.ai === 'RESET') {
      this.emit({ type: 'evade', time: this.time, targetId: m.id, pos: { ...m.pos }, reason: 'reset' });
      return;
    }
    const defMul = m.statuses.reduce((acc, s) => acc * s.defenseMultiplier, 1);
    const r = computeDamage(
      {
        baseDamage: p.base.attack,
        weaponCoefficient: this.weapon.weaponCoefficient ?? 1,
        statScaling: 1,
        skillModifier: modifier,
        targetDefense: m.def.defense,
        defenseMultiplier: defMul,
        critChance: p.base.critChance,
        critMultiplier: p.base.critMultiplier,
        context: 'pve',
        absorb: 0,
      },
      this.rng,
      this.damageConfig,
    );
    m.hp = Math.max(0, m.hp - r.amount);
    m.lastHitAt = this.time;
    this.telemetry.damageDealt += r.amount;
    this.emit({
      type: 'damage',
      time: this.time,
      sourceId: p.id,
      targetId: m.id,
      amount: r.amount,
      isCrit: r.isCrit,
      pos: { ...m.pos },
      actionId,
    });
    if (status) {
      m.statuses = m.statuses.filter((s) => s.id !== status.id);
      m.statuses.push({
        id: status.id,
        expiresAt: this.time + status.durationMs,
        defenseMultiplier: status.defenseMultiplier ?? 1,
      });
      this.emit({
        type: 'status',
        time: this.time,
        targetId: m.id,
        statusId: status.id,
        durationMs: status.durationMs,
      });
    }
    if (knockback > 0) {
      const dir = normalize(sub(m.pos, p.pos));
      const speed = (knockback / KNOCKBACK_MS) * 1000;
      m.knock = { vx: dir.x * speed, vy: dir.y * speed, until: this.time + KNOCKBACK_MS };
    }
    if (m.hp <= 0) {
      this.killMonster(m);
      return;
    }
    if (interrupt && m.ai === 'ATTACK' && !m.attackResolved) {
      m.staggerUntil = this.time + STAGGER_MS;
      m.nextAttackAt = this.time + STAGGER_MS;
      this.setAi(m, 'CHASE');
      this.emit({ type: 'interrupt', time: this.time, entityId: m.id });
    }
    // getting hit always pulls a passive monster into combat
    if (m.ai === 'IDLE' || m.ai === 'PATROL' || m.ai === 'ALERT') this.setAi(m, 'CHASE');
  }

  private killMonster(m: MonsterEntity): void {
    m.diedAt = this.time;
    m.respawnAt = this.time + m.def.respawnMs;
    m.knock = null;
    m.statuses = [];
    this.setAi(m, 'DEAD');
    this.telemetry.monstersKilled++;
    this.emit({
      type: 'death',
      time: this.time,
      entityId: m.id,
      killerId: this.player.id,
      pos: { ...m.pos },
    });
  }

  private damagePlayer(m: MonsterEntity): void {
    const p = this.player;
    if (!p.alive) return;
    // Counter Slash stance
    const a = p.action;
    if (a?.def.counter && !a.countered) {
      const elapsed = this.time - a.startedAt;
      if (elapsed >= a.def.windupMs && elapsed < a.def.windupMs + a.def.counter.stanceMs) {
        this.performCounter(a, m);
        return;
      }
    }
    if (this.time < p.invulnerableUntil || this.debugGodMode) {
      const reason = p.dash ? 'dash' : 'protected';
      this.emit({ type: 'evade', time: this.time, targetId: p.id, pos: { ...p.pos }, reason });
      return;
    }
    const defMul = p.statuses.reduce((acc, s) => acc * s.defenseMultiplier, 1);
    const r = computeDamage(
      {
        baseDamage: m.def.attack,
        weaponCoefficient: 1,
        statScaling: 1,
        skillModifier: 1,
        targetDefense: p.base.defense,
        defenseMultiplier: defMul,
        critChance: m.def.critChance,
        critMultiplier: 1.5,
        context: 'pve',
        absorb: 0,
      },
      this.rng,
      this.damageConfig,
    );
    p.hp = Math.max(0, p.hp - r.amount);
    this.telemetry.damageTaken += r.amount;
    this.targetId ??= m.id;
    this.enterCombat();
    const entry: DeathRecapEntry = {
      time: this.time,
      attackerId: m.id,
      attackerName: m.def.name,
      actionId: `${m.def.id}:attack`,
      amount: r.amount,
      isCrit: r.isCrit,
      mitigation: r.breakdown.mitigation,
    };
    p.recentDamage.push(entry);
    while (
      p.recentDamage.length > 0 &&
      (p.recentDamage[0] as DeathRecapEntry).time < this.time - RECAP_WINDOW_MS
    )
      p.recentDamage.shift();
    this.emit({
      type: 'damage',
      time: this.time,
      sourceId: m.id,
      targetId: p.id,
      amount: r.amount,
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
    this.emit({ type: 'counter', time: this.time, attackerId: attacker.id, pos: { ...p.pos } });
    this.emit({
      type: 'swing',
      time: this.time,
      actionId: a.def.id,
      origin: { ...p.pos },
      angle,
      radius: c.radius,
      arcDeg: c.arcDeg,
    });
    for (const m of this.monsters) {
      if (!m.alive) continue;
      if (!arcHitsCircle(p.pos, angle, c.radius, c.arcDeg, m.pos, m.def.radius)) continue;
      this.damageMonster(m, a.def.id, c.modifier, c.knockback, undefined, true);
    }
    // stance ends; short recovery with i-frames
    a.startedAt = this.time - (a.def.windupMs + a.def.activeMs); // jump to recovery phase
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
    if (!p.alive || this.time < p.spawnProtectedUntil) return false;
    const d = dist(m.pos, p.pos);
    return d <= m.def.aggroRadius && this.grid.hasLineOfSight(m.pos, p.pos);
  }

  private moveMonster(m: MonsterEntity, toward: Vec2, speed: number, dt: number): boolean {
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

  private updateMonster(m: MonsterEntity, dt: number): void {
    const now = this.time;
    const p = this.player;
    m.statuses = m.statuses.filter((s) => s.expiresAt > now);

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

    if (m.knock && now < m.knock.until) {
      const r = moveWithCollision(
        m.pos,
        { x: (m.knock.vx * dt) / 1000, y: (m.knock.vy * dt) / 1000 },
        m.def.radius - 1,
        this.grid,
      );
      m.pos = r.pos;
    } else m.knock = null;

    const dPlayer = dist(m.pos, p.pos);
    const reach = m.def.attackRange + m.def.radius + p.base.radius;

    switch (m.ai) {
      case 'IDLE': {
        if (this.canAggro(m)) {
          this.setAi(m, 'ALERT');
          break;
        }
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
        break;
      }
      case 'PATROL': {
        if (this.canAggro(m)) {
          this.setAi(m, 'ALERT');
          break;
        }
        const target = m.patrolTarget ?? m.spawn;
        const stuck = this.moveMonster(m, target, m.def.moveSpeed, dt);
        if (dist(m.pos, target) < 2 || stuck || now >= m.stateUntil) {
          m.stateUntil = now + this.rng.range(1000, 2500);
          this.setAi(m, 'IDLE');
        }
        break;
      }
      case 'ALERT': {
        if (dPlayer > 1) m.facingX = p.pos.x > m.pos.x ? 1 : -1;
        if (!p.alive) {
          this.setAi(m, 'IDLE');
          break;
        }
        if (now - m.stateSince >= m.def.alertMs) this.setAi(m, 'CHASE');
        break;
      }
      case 'CHASE': {
        if (!p.alive || dist(m.pos, m.spawn) > m.def.leashRadius || dPlayer > m.def.leashRadius * 1.2) {
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
          // hit check at resolve time: player can dodge out of range or i-frame through it
          if (p.alive && dist(m.pos, p.pos) <= reach + 3 && this.grid.hasLineOfSight(m.pos, p.pos))
            this.damagePlayer(m);
        }
        if (m.ai !== 'ATTACK') break; // state may have changed (player died → RESET)
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

  /** Anti-clumping: push overlapping monsters apart and out of the player. */
  private separate(): void {
    const alive = this.monsters.filter((m) => m.alive);
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
