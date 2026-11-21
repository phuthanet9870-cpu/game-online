import {
  ITEM_EXPIRE_MS, ITEM_OWNER_MS, MAX_PATH_LENGTH, PLAYER_BASE, REGEN_COMBAT_COOLDOWN_MS, REGEN_FRACTION,
  REGEN_INTERVAL_MS, WALK_SPEED, findPath, type Cell, type GameMap,
} from "../shared";
import type { MonsterDef, SpawnDef } from "../shared/content";
import { advance, type Walker } from "../server/movement";
import { cellDistance, rollAttack, type CombatStats, type Rng } from "./combat";
import { MonsterSim, type SimTarget } from "./monsters";

export interface SimPlayer {
  id: string;
  walker: Walker;
  dir: number;
  hp: number;
  maxHp: number;
  stats: CombatStats & { attackDelayMs: number; attackRange: number };
  /** Monster this player is attacking (walks into range first). */
  attackTarget: string | null;
  /** Ground item this player is walking to pick up. */
  pickupTarget: string | null;
  nextAttackAt: number;
  nextRepathAt: number;
  lastHitAt: number;
  nextRegenAt: number;
}

export interface GroundItem {
  id: string;
  itemId: string;
  x: number;
  y: number;
  ownerId: string | null;
  ownerUntil: number;
  expiresAt: number;
}

/** Things that happened during one tick, for the host to show and persist. */
export interface TickEvents {
  hits: Array<{ from: string; to: string; damage: number; miss: boolean; x: number; y: number }>;
  kills: Array<{ monsterId: string; monsterDef: string; killer: string | null }>;
  drops: GroundItem[];
  pickups: Array<{ playerId: string; item: GroundItem }>;
  deaths: string[];
  /** Pickup refused because another player owns the drop for now. */
  refused: Array<{ playerId: string; itemId: string }>;
}

const emptyEvents = (): TickEvents => ({ hits: [], kills: [], drops: [], pickups: [], deaths: [], refused: [] });

/**
 * Authoritative simulation of one map: player movement and auto-attack,
 * monster AI, loot on the ground. Hosts (the Colyseus room, the artifact's
 * elected host) feed it intents and read its state and events.
 */
export class WorldSim {
  readonly players = new Map<string, SimPlayer>();
  readonly items = new Map<string, GroundItem>();
  readonly monsters: MonsterSim;
  private events = emptyEvents();
  private nextItemId = 1;

  constructor(
    readonly map: GameMap,
    spawns: SpawnDef[],
    defs: Record<string, MonsterDef>,
    private readonly rng: Rng,
    now: number,
  ) {
    this.monsters = new MonsterSim(map, spawns, defs, rng, {
      onAttack: (monster, target, result) => {
        const p = this.players.get(target.id);
        if (!p || p.hp <= 0) return;
        this.events.hits.push({ from: monster.id, to: p.id, damage: result.damage, miss: !result.hit, x: p.walker.x, y: p.walker.y });
        if (!result.hit) return;
        p.lastHitAt = this.now;
        p.hp = Math.max(0, p.hp - result.damage);
        if (p.hp === 0) this.kill(p);
      },
    });
    this.now = now;
    this.monsters.populate(now);
  }

  private now: number;

  addPlayer(id: string, at: Cell, hp?: number): SimPlayer {
    const p: SimPlayer = {
      id, walker: { x: at.x, y: at.y, path: [] }, dir: 0,
      maxHp: PLAYER_BASE.maxHp, hp: Math.min(PLAYER_BASE.maxHp, Math.max(1, hp ?? PLAYER_BASE.maxHp)),
      stats: { ...PLAYER_BASE }, attackTarget: null, pickupTarget: null,
      nextAttackAt: 0, nextRepathAt: 0, lastHitAt: -Infinity, nextRegenAt: this.now + REGEN_INTERVAL_MS,
    };
    this.players.set(id, p);
    return p;
  }

  removePlayer(id: string) {
    this.players.delete(id);
  }

  /** Walk to a cell; cancels attacking and picking up. Returns false when ignored. */
  moveTo(id: string, to: Cell): boolean {
    const p = this.players.get(id);
    if (!p || p.hp <= 0 || !this.map.isWalkable(to.x, to.y)) return false;
    p.attackTarget = null;
    p.pickupTarget = null;
    return this.walkTo(p, to, MAX_PATH_LENGTH);
  }

  attack(id: string, monsterId: string): boolean {
    const p = this.players.get(id);
    if (!p || p.hp <= 0 || !this.monsters.isAlive(monsterId)) return false;
    p.attackTarget = monsterId;
    p.pickupTarget = null;
    p.nextRepathAt = 0;
    return true;
  }

  pickup(id: string, groundId: string): boolean {
    const p = this.players.get(id);
    const item = this.items.get(groundId);
    if (!p || p.hp <= 0 || !item) return false;
    p.attackTarget = null;
    p.pickupTarget = groundId;
    if (cellDistance(p.walker, item) > 1) this.walkTo(p, { x: item.x, y: item.y }, MAX_PATH_LENGTH);
    return true;
  }

  /** Back to life at `at` with half HP. */
  revive(id: string, at: Cell): boolean {
    const p = this.players.get(id);
    if (!p || p.hp > 0) return false;
    p.walker = { x: at.x, y: at.y, path: [] };
    p.hp = Math.ceil(p.maxHp / 2);
    p.nextRegenAt = this.now + REGEN_INTERVAL_MS;
    return true;
  }

  /** Put back an item whose pickup could not be saved. */
  restoreItem(item: GroundItem) {
    this.items.set(item.id, item);
  }

  tick(dtMs: number, now: number): TickEvents {
    this.now = now;
    this.events = emptyEvents();

    for (const p of this.players.values()) {
      if (p.hp <= 0) continue;
      this.playerAct(p, now);
      const step = advance(p.walker, (WALK_SPEED * dtMs) / 1000);
      if (step !== null) p.dir = step;
      if (now >= p.nextRegenAt) {
        p.nextRegenAt = now + REGEN_INTERVAL_MS;
        if (now - p.lastHitAt >= REGEN_COMBAT_COOLDOWN_MS) p.hp = Math.min(p.maxHp, p.hp + Math.ceil(p.maxHp * REGEN_FRACTION));
      }
    }

    const targets = new Map<string, SimTarget>();
    for (const p of this.players.values()) {
      targets.set(p.id, { id: p.id, x: p.walker.x, y: p.walker.y, alive: p.hp > 0, ...p.stats });
    }
    this.monsters.tick(dtMs, now, targets);

    for (const [id, item] of this.items) if (now >= item.expiresAt) this.items.delete(id);
    return this.events;
  }

  private playerAct(p: SimPlayer, now: number) {
    if (p.pickupTarget) {
      const item = this.items.get(p.pickupTarget);
      if (!item) {
        p.pickupTarget = null;
      } else if (cellDistance(p.walker, item) <= 1 && p.walker.path.length <= 1) {
        p.pickupTarget = null;
        if (item.ownerId && item.ownerId !== p.id && now < item.ownerUntil) {
          this.events.refused.push({ playerId: p.id, itemId: item.itemId });
        } else {
          // Removing here is the lock: two players reaching it in one tick cannot both get it.
          this.items.delete(item.id);
          this.events.pickups.push({ playerId: p.id, item });
        }
      }
      return;
    }
    if (!p.attackTarget) return;
    const m = this.monsters.monsters.get(p.attackTarget);
    if (!m || m.mode === "dead") {
      p.attackTarget = null;
      return;
    }
    if (cellDistance(p.walker, m.walker) <= p.stats.attackRange) {
      if (p.walker.path.length > 1) p.walker.path = p.walker.path.slice(0, 1);
      if (p.walker.path.length === 0 && now >= p.nextAttackAt) {
        p.nextAttackAt = now + p.stats.attackDelayMs;
        const r = this.strike(p.id, p.stats, m.id, now);
        this.events.hits.push(...r.hits);
        this.events.kills.push(...r.kills);
        this.events.drops.push(...r.drops);
        if (r.kills.length > 0) p.attackTarget = null;
      }
      return;
    }
    if (now >= p.nextRepathAt) {
      p.nextRepathAt = now + 300;
      // Walk next to the monster; the closest neighbouring cell.
      const target = { x: Math.round(m.walker.x), y: Math.round(m.walker.y) };
      let best: Cell | null = null;
      let bestLen = Infinity;
      const from = { x: Math.round(p.walker.x), y: Math.round(p.walker.y) };
      for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
        if (!dx && !dy) continue;
        const c = { x: target.x + dx, y: target.y + dy };
        if (!this.map.isWalkable(c.x, c.y)) continue;
        const len = Math.max(Math.abs(c.x - from.x), Math.abs(c.y - from.y));
        if (len < bestLen) { bestLen = len; best = c; }
      }
      if (!best || !this.walkTo(p, best, MAX_PATH_LENGTH)) p.attackTarget = null;
    }
  }

  /**
   * One basic attack by an attacker on a monster: roll, apply damage, and on a
   * kill drop loot. Range and attack speed are the caller's job. Public so a
   * host that does not simulate the attacker's movement (the artifact) can
   * resolve hits it was sent.
   */
  strike(attackerId: string, stats: CombatStats, monsterId: string, now: number): Pick<TickEvents, "hits" | "kills" | "drops"> {
    const out: Pick<TickEvents, "hits" | "kills" | "drops"> = { hits: [], kills: [], drops: [] };
    const m = this.monsters.monsters.get(monsterId);
    if (!m || m.mode === "dead") return out;
    const result = rollAttack(stats, this.monsters.stats(m), this.rng);
    out.hits.push({ from: attackerId, to: m.id, damage: result.damage, miss: !result.hit, x: m.walker.x, y: m.walker.y });
    if (!result.hit) return out;
    const death = this.monsters.damage(m.id, attackerId, result.damage, now);
    if (death) {
      out.kills.push({ monsterId: m.id, monsterDef: m.def.id, killer: death.topDamager });
      out.drops.push(...this.dropLoot(m.def, { x: Math.round(m.walker.x), y: Math.round(m.walker.y) }, death.topDamager, now));
    }
    return out;
  }

  /** Take a ground item if `takerId` may: returns it, or null when gone or still another player's. */
  take(takerId: string, groundId: string, now: number): GroundItem | null {
    const item = this.items.get(groundId);
    if (!item || (item.ownerId && item.ownerId !== takerId && now < item.ownerUntil)) return null;
    this.items.delete(groundId);
    return item;
  }

  private walkTo(p: SimPlayer, to: Cell, max: number): boolean {
    const from = { x: Math.round(p.walker.x), y: Math.round(p.walker.y) };
    const path = findPath(this.map, from, to, max);
    if (!path) return false;
    // The first waypoint pulls a mid-step walker to its cell centre, so re-routes stay on the grid.
    p.walker.path = from.x === p.walker.x && from.y === p.walker.y ? path : [from, ...path];
    return true;
  }

  private kill(p: SimPlayer) {
    p.walker.path = [];
    p.attackTarget = null;
    p.pickupTarget = null;
    this.events.deaths.push(p.id);
  }

  private dropLoot(def: MonsterDef, at: Cell, owner: string | null, now: number): GroundItem[] {
    const dropped: GroundItem[] = [];
    const spots: Cell[] = [at];
    for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
      if ((dx || dy) && this.map.isWalkable(at.x + dx, at.y + dy)) spots.push({ x: at.x + dx, y: at.y + dy });
    }
    let n = 0;
    for (const drop of def.drops) {
      if (this.rng() * 10000 >= drop.rate) continue;
      const spot = spots[n++ % spots.length];
      const item: GroundItem = {
        id: `i${this.nextItemId++}`, itemId: drop.item, x: spot.x, y: spot.y,
        ownerId: owner, ownerUntil: now + ITEM_OWNER_MS, expiresAt: now + ITEM_EXPIRE_MS,
      };
      this.items.set(item.id, item);
      dropped.push(item);
    }
    return dropped;
  }
}
