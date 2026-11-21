import { findPath, type Cell, type GameMap } from "../shared";
import type { MonsterDef, SpawnDef } from "../shared/content";
import { advance, type Walker } from "../server/movement";
import { cellDistance, rollAttack, type CombatStats, type HitResult, type Rng } from "./combat";

/** Monsters farther than this from every player do not think (respawn timers still run). */
export const SLEEP_RADIUS = 24;
const WANDER_RADIUS = 4;
const REPATH_MS = 400;

/** What the monster simulation needs to know about a player. */
export interface SimTarget extends CombatStats {
  id: string;
  x: number;
  y: number;
  alive: boolean;
}

export type MonsterMode = "idle" | "chase" | "return" | "dead";

export interface MonsterState {
  id: string;
  def: MonsterDef;
  spawn: number;
  walker: Walker;
  dir: number;
  hp: number;
  mode: MonsterMode;
  targetId: string | null;
  nextAttackAt: number;
  nextWanderAt: number;
  nextRepathAt: number;
  respawnAt: number;
  home: Cell;
  /** Damage dealt by each attacker since spawning; decides loot ownership. */
  damageBy: Map<string, number>;
}

export interface MonsterHooks {
  /** A monster attacked a player. Apply the result to the player. */
  onAttack(monster: MonsterState, target: SimTarget, result: HitResult): void;
  onSpawn?(monster: MonsterState): void;
}

export interface DeathReport {
  monster: MonsterState;
  /** Attacker id with the most damage dealt, or null. */
  topDamager: string | null;
}

/**
 * Server-side monster AI for one map, independent of Colyseus so the same
 * code runs in the room and in the artifact host. A small state machine per
 * monster, modelled on rAthena's mob AI: idle (random walk) → chase → attack,
 * and return home when the target escapes past chaseRange.
 */
export class MonsterSim {
  readonly monsters = new Map<string, MonsterState>();
  private nextId = 1;

  constructor(
    private readonly map: GameMap,
    private readonly spawns: SpawnDef[],
    private readonly defs: Record<string, MonsterDef>,
    private readonly rng: Rng,
    private readonly hooks: MonsterHooks,
  ) {}

  /** Create every monster from the spawn list, alive, at `now`. */
  populate(now: number) {
    this.spawns.forEach((spawn, index) => {
      for (let i = 0; i < spawn.count; i++) {
        const state: MonsterState = {
          id: `m${this.nextId++}`, def: this.defs[spawn.monster], spawn: index,
          walker: { x: 0, y: 0, path: [] }, dir: 0, hp: 0, mode: "dead", targetId: null,
          nextAttackAt: 0, nextWanderAt: 0, nextRepathAt: 0, respawnAt: now, home: { x: 0, y: 0 }, damageBy: new Map(),
        };
        this.monsters.set(state.id, state);
        this.respawn(state, now);
      }
    });
  }

  tick(dtMs: number, now: number, players: ReadonlyMap<string, SimTarget>) {
    const living = [...players.values()].filter((p) => p.alive);
    for (const m of this.monsters.values()) {
      if (m.mode === "dead") {
        if (now >= m.respawnAt) this.respawn(m, now);
        continue;
      }
      if (!living.some((p) => cellDistance(p, m.walker) <= SLEEP_RADIUS)) continue;
      this.think(m, now, players, living);
      const step = advance(m.walker, (m.def.walkSpeed * dtMs) / 1000);
      if (step !== null) m.dir = step;
    }
  }

  /**
   * Apply player damage to a monster. Returns the death report when this hit
   * killed it. Also makes the monster (and assisting neighbours) target the attacker.
   */
  damage(monsterId: string, attackerId: string, amount: number, now: number): DeathReport | null {
    const m = this.monsters.get(monsterId);
    if (!m || m.mode === "dead") return null;
    m.hp = Math.max(0, m.hp - amount);
    m.damageBy.set(attackerId, (m.damageBy.get(attackerId) ?? 0) + amount);
    if (m.hp === 0) {
      m.mode = "dead";
      m.targetId = null;
      m.walker.path = [];
      const [lo, hi] = this.spawns[m.spawn].respawnMs;
      m.respawnAt = now + lo + Math.floor(this.rng() * (hi - lo + 1));
      let top: string | null = null;
      let best = -1;
      for (const [id, dealt] of m.damageBy) if (dealt > best) { best = dealt; top = id; }
      return { monster: m, topDamager: top };
    }
    if (m.targetId === null) this.engage(m, attackerId, now);
    if (m.def.modes.assist) {
      for (const other of this.monsters.values()) {
        if (other !== m && other.def.id === m.def.id && other.mode === "idle" && cellDistance(other.walker, m.walker) <= 6) {
          this.engage(other, attackerId, now);
        }
      }
    }
    return null;
  }

  isAlive(monsterId: string): boolean {
    const m = this.monsters.get(monsterId);
    return !!m && m.mode !== "dead";
  }

  private engage(m: MonsterState, targetId: string, now: number) {
    m.mode = "chase";
    m.targetId = targetId;
    m.nextRepathAt = now;
    m.nextAttackAt = Math.max(m.nextAttackAt, now + 300);
  }

  private think(m: MonsterState, now: number, players: ReadonlyMap<string, SimTarget>, living: SimTarget[]) {
    if (m.mode === "return") {
      if (m.walker.path.length === 0) m.mode = "idle";
      return;
    }
    if (m.mode === "idle" && m.def.modes.aggressive) {
      const seen = living
        .filter((p) => cellDistance(p, m.walker) <= m.def.sight)
        .sort((a, b) => cellDistance(a, m.walker) - cellDistance(b, m.walker))[0];
      if (seen) this.engage(m, seen.id, now);
    }
    if (m.mode === "chase") {
      const target = m.targetId ? players.get(m.targetId) : undefined;
      if (!target || !target.alive || cellDistance(target, m.home) > m.def.chaseRange) {
        this.goHome(m);
        return;
      }
      if (cellDistance(target, m.walker) <= m.def.attackRange) {
        // In reach: stop at the cell centre we are entering, then swing on cooldown.
        if (m.walker.path.length > 1) m.walker.path = m.walker.path.slice(0, 1);
        if (now >= m.nextAttackAt && m.walker.path.length === 0) {
          m.nextAttackAt = now + m.def.attackDelayMs;
          this.hooks.onAttack(m, target, rollAttack(this.stats(m), target, this.rng));
        }
        return;
      }
      if (now >= m.nextRepathAt) {
        m.nextRepathAt = now + REPATH_MS;
        const from = { x: Math.round(m.walker.x), y: Math.round(m.walker.y) };
        const path = this.pathNextTo(from, { x: Math.round(target.x), y: Math.round(target.y) });
        if (path) m.walker.path = from.x === m.walker.x && from.y === m.walker.y ? path : [from, ...path];
      }
      return;
    }
    // Idle: wander now and then inside its spawn area.
    if (m.def.modes.randomWalk && m.walker.path.length === 0 && now >= m.nextWanderAt) {
      m.nextWanderAt = now + 3000 + Math.floor(this.rng() * 5000);
      const from = { x: Math.round(m.walker.x), y: Math.round(m.walker.y) };
      for (let tries = 0; tries < 5; tries++) {
        const to = {
          x: from.x + Math.floor(this.rng() * (2 * WANDER_RADIUS + 1)) - WANDER_RADIUS,
          y: from.y + Math.floor(this.rng() * (2 * WANDER_RADIUS + 1)) - WANDER_RADIUS,
        };
        if (!this.inArea(m, to) || !this.map.isWalkable(to.x, to.y)) continue;
        const path = findPath(this.map, from, to, WANDER_RADIUS * 2);
        if (path && path.length > 0) {
          m.walker.path = path;
          break;
        }
      }
    }
  }

  stats(m: MonsterState): CombatStats {
    return { atk: m.def.atk, def: m.def.def, hit: m.def.hit, flee: m.def.flee };
  }

  /** Path to the closest walkable cell next to `to` (attack range 1). */
  private pathNextTo(from: Cell, to: Cell): Cell[] | null {
    let best: Cell[] | null = null;
    for (let dy = -1; dy <= 1; dy++) {
      for (let dx = -1; dx <= 1; dx++) {
        if (dx === 0 && dy === 0) continue;
        const cell = { x: to.x + dx, y: to.y + dy };
        if (!this.map.isWalkable(cell.x, cell.y)) continue;
        const path = findPath(this.map, from, cell, 40);
        if (path && (!best || path.length < best.length)) best = path;
      }
    }
    return best;
  }

  private goHome(m: MonsterState) {
    m.mode = "return";
    m.targetId = null;
    m.damageBy.clear();
    m.hp = m.def.hp; // leashing resets the fight, as in most MMOs
    const from = { x: Math.round(m.walker.x), y: Math.round(m.walker.y) };
    m.walker.path = findPath(this.map, from, m.home, 80) ?? [];
    if (m.walker.path.length === 0) m.mode = "idle";
  }

  private inArea(m: MonsterState, c: Cell) {
    const a = this.spawns[m.spawn].area;
    return c.x >= a.x && c.y >= a.y && c.x < a.x + a.w && c.y < a.y + a.h;
  }

  private respawn(m: MonsterState, now: number) {
    const a = this.spawns[m.spawn].area;
    let cell: Cell = this.map.spawn;
    for (let tries = 0; tries < 50; tries++) {
      const c = { x: a.x + Math.floor(this.rng() * a.w), y: a.y + Math.floor(this.rng() * a.h) };
      if (this.map.isWalkable(c.x, c.y)) { cell = c; break; }
    }
    m.walker = { x: cell.x, y: cell.y, path: [] };
    m.home = cell;
    m.hp = m.def.hp;
    m.mode = "idle";
    m.targetId = null;
    m.damageBy = new Map();
    m.nextWanderAt = now + Math.floor(this.rng() * 4000);
    m.nextAttackAt = 0;
    this.hooks.onSpawn?.(m);
  }
}
