/**
 * A Zone is one authoritative real-time simulation of a map. The GameServer
 * owns several zones and advances them at TICK_RATE. Clients only send
 * input intents; everything here is decided by the server.
 */
import { generateMap, isBlocked, type TileMap } from '../shared/mapgen.ts';
import type { ZoneDef, SpawnGroupDef } from '../shared/config/zones.ts';
import { getMonster, monsterStatsAt } from '../shared/config/monsters.ts';
import { SERVER_CONFIG as SC } from '../shared/config/server.ts';
import { STAT_CONFIG } from '../shared/config/stats.ts';
import { getItem } from '../shared/config/items.ts';
import { moveParamsFor, stepMove, TICK_DT, type MoveParams } from '../shared/movement.ts';
import { ANIM, BTN, FLAG, type EntityMeta, type EntityState, type GameEvent, type SelfState } from '../shared/protocol.ts';
import type { AnyEntity, DropEntity, MonsterEntity, NodeEntity, NpcEntity, PlayerEntity, PowerZone, Projectile, TrapEntity } from './entities.ts';
import { bossStatus, initBosses, tickBosses, type BossRuntime } from './bosses.ts';
import { POWER_BITS, ULT_BIT, chainFrom, powerSkillFor, tickMonsterPower, tickPlayerPower, tickZones } from './powers.ts';
import type { SkillDef, SkillEffect } from '../shared/config/skills.ts';
import { dealDamage, resolveMonsterAttack, tryCast, killPlayer } from './combat.ts';
import { updateMonster } from './ai.ts';
import { autoTick, stopAuto } from './autofarm.ts';
import type { Logger } from './util.ts';

export interface ZoneHost {
  readonly time: number;
  readonly rates: { exp: number; drop: number; gold: number };
  /** Stats changed (buff gained/expired): recompute and resend character view. */
  onStatsChanged(p: PlayerEntity): void;
  /** Power collection/mastery changed: resend powers view. */
  onPowersChanged(p: PlayerEntity): void;
  afterPowerChange(p: PlayerEntity): void;
  /** Persist a boss's next spawn time (epoch ms). */
  saveBossNext(key: string, epochMs: number): void;
  now(): number;
  zoneChat(zoneId: string, text: string): void;
  rng(): number;
  nextId(): number;
  logger: Logger;
  transfer(p: PlayerEntity, zoneId: string, x: number, y: number): void;
  requestSave(p: PlayerEntity, reason: string): void;
  audit(p: PlayerEntity | null, kind: string, data: Record<string, unknown>): void;
}

interface Scheduled { at: number; fn: () => void }

class SpatialGrid {
  private cells = new Map<number, AnyEntity[]>();
  constructor(private size: number) {}
  private key(cx: number, cy: number) { return cx * 73856093 ^ cy * 19349663; }
  clear() { this.cells.clear(); }
  insert(e: AnyEntity, x: number, y: number) {
    const k = this.key(Math.floor(x / this.size), Math.floor(y / this.size));
    let c = this.cells.get(k);
    if (!c) { c = []; this.cells.set(k, c); }
    c.push(e);
  }
  query(x: number, y: number, r: number, out: AnyEntity[] = []): AnyEntity[] {
    const x0 = Math.floor((x - r) / this.size), x1 = Math.floor((x + r) / this.size);
    const y0 = Math.floor((y - r) / this.size), y1 = Math.floor((y + r) / this.size);
    for (let cx = x0; cx <= x1; cx++) for (let cy = y0; cy <= y1; cy++) {
      const c = this.cells.get(this.key(cx, cy));
      if (c) for (const e of c) out.push(e);
    }
    return out;
  }
}

export class Zone {
  readonly map: TileMap;
  tick = 0;
  readonly players = new Map<number, PlayerEntity>();
  readonly monsters = new Map<number, MonsterEntity>();
  readonly drops = new Map<number, DropEntity>();
  readonly npcs = new Map<number, NpcEntity>();
  readonly nodes = new Map<number, NodeEntity>();
  readonly projectiles: Projectile[] = [];
  readonly traps: TrapEntity[] = [];
  readonly powerZones: PowerZone[] = [];
  bosses: BossRuntime[] = [];
  private nextBossBroadcast = 0;
  private grid = new SpatialGrid(SC.spatialCellSize);
  private history: { tick: number; pos: Map<number, [number, number]> }[] = [];
  private events: { ev: GameEvent; x: number; y: number }[] = [];
  private scheduled: Scheduled[] = [];
  private nextSpawnCheck = 0;

  constructor(readonly def: ZoneDef, readonly host: ZoneHost) {
    this.map = generateMap(def);
    for (const n of def.npcs) {
      const id = host.nextId();
      this.npcs.set(id, { kind: 4, id, def: n, x: n.x, y: n.y });
    }
    for (const n of def.resourceNodes) {
      const id = host.nextId();
      this.nodes.set(id, { kind: 5, id, def: n, x: n.x, y: n.y, readyAt: 0 });
    }
    for (const g of def.spawnGroups) for (let i = 0; i < g.baseCount; i++) this.spawnMonster(g);
    this.bosses = initBosses(this);
    this.rebuildGrid();
  }

  get time() { return this.host.time; }
  rng() { return this.host.rng(); }

  // ------------------------------------------------------------ entities
  spawnMonster(g: SpawnGroupDef): MonsterEntity | null {
    const def = getMonster(g.monsterId);
    if (!def) return null;
    const level = def.levelMin + Math.floor(this.rng() * (def.levelMax - def.levelMin + 1));
    const s = monsterStatsAt(def, level);
    const id = this.host.nextId();
    const pos = this.randomPointNear(g.x, g.y, g.radius, def.radius);
    const m: MonsterEntity = {
      kind: 2, id, def, group: g, level, x: pos.x, y: pos.y, homeX: pos.x, homeY: pos.y, facingX: 1, facingY: 0,
      radius: def.radius, hp: s.maxHp, maxHp: s.maxHp, atk: s.atk, defense: s.def, exp: s.exp,
      state: 'idle', stateUntil: this.time + this.rng() * 3, wanderX: pos.x, wanderY: pos.y, targetId: null,
      attackReady: def.attacks.map(() => 0), windup: null, threat: new Map(), stunUntil: 0, rootUntil: 0, slowUntil: 0, slowMult: 1,
      dots: [], frost: 0, frostUntil: 0, vulnAmount: 0, vulnUntil: 0,
      forceUntil: 0, fvx: 0, fvy: 0, respawnAt: 0, anim: ANIM.IDLE, animUntil: 0, lastHitAt: -999,
    };
    this.monsters.set(id, m);
    return m;
  }

  respawnMonster(m: MonsterEntity) {
    const pos = this.randomPointNear(m.group.x, m.group.y, m.group.radius, m.radius);
    const level = m.def.levelMin + Math.floor(this.rng() * (m.def.levelMax - m.def.levelMin + 1));
    const s = monsterStatsAt(m.def, level);
    Object.assign(m, {
      level, x: pos.x, y: pos.y, homeX: pos.x, homeY: pos.y, hp: s.maxHp, maxHp: s.maxHp, atk: s.atk, defense: s.def, exp: s.exp,
      state: 'idle', stateUntil: this.time + 1, targetId: null, windup: null, stunUntil: 0, rootUntil: 0, slowUntil: 0, forceUntil: 0,
      dots: [], frost: 0, frostUntil: 0, vulnAmount: 0, vulnUntil: 0,
      anim: ANIM.IDLE, animUntil: 0,
    });
    m.threat.clear();
    m.attackReady = m.def.attacks.map(() => 0);
  }

  randomPointNear(cx: number, cy: number, r: number, rad: number) {
    for (let i = 0; i < 20; i++) {
      const a = this.rng() * Math.PI * 2, d = Math.sqrt(this.rng()) * r;
      const x = cx + Math.cos(a) * d, y = cy + Math.sin(a) * d;
      if (!isBlocked(this.map, x - rad, y - rad) && !isBlocked(this.map, x + rad, y + rad)
        && !isBlocked(this.map, x + rad, y - rad) && !isBlocked(this.map, x - rad, y + rad)) return { x, y };
    }
    return { x: cx, y: cy };
  }

  addPlayer(p: PlayerEntity, x: number, y: number) {
    p.ms.x = x; p.ms.y = y;
    p.ms.forceT = 0; p.ms.dodgeT = 0;
    p.rec.zoneId = this.def.id;
    p.known.clear();
    p.inputQueue.length = 0;
    this.players.set(p.id, p);
    this.rebuildGrid();
    const metas = this.visibleFor(p).map((e) => this.meta(e));
    for (const m of metas) p.known.add(m.id);
    p.session?.send({ t: 'enter_zone', zone: this.def.id, selfId: p.id, tick: this.tick, self: this.selfState(p), metas });
  }

  removePlayer(p: PlayerEntity) {
    this.players.delete(p.id);
    for (const m of this.monsters.values()) {
      m.threat.delete(p.id);
      if (m.targetId === p.id) m.targetId = null;
    }
  }

  emit(ev: GameEvent, x: number, y: number) { this.events.push({ ev, x, y }); }
  schedule(at: number, fn: () => void) { this.scheduled.push({ at, fn }); }

  combatantById(id: number): PlayerEntity | MonsterEntity | undefined {
    return this.players.get(id) ?? this.monsters.get(id);
  }

  /** Position of an entity at a past tick (lag compensation), clamped. */
  rewoundPos(id: number, tick: number): [number, number] | null {
    const target = Math.max(this.tick - SC.maxRewindTicks, Math.min(this.tick, tick));
    for (let i = this.history.length - 1; i >= 0; i--) {
      const h = this.history[i];
      if (h.tick <= target) return h.pos.get(id) ?? null;
    }
    return null;
  }

  nearby(x: number, y: number, r: number): AnyEntity[] { return this.grid.query(x, y, r); }

  moveParams(p: PlayerEntity): MoveParams {
    return moveParamsFor(p.stats, p.weapon, STAT_CONFIG.regen, p.radius);
  }

  // ------------------------------------------------------------ main tick
  update() {
    this.tick++;
    const t = this.time;

    for (const p of this.players.values()) this.updatePlayer(p);

    if (this.scheduled.length) {
      const due = this.scheduled.filter((s) => s.at <= t);
      this.scheduled = this.scheduled.filter((s) => s.at > t);
      for (const s of due) s.fn();
    }

    for (const m of this.monsters.values()) { tickMonsterPower(this, m); updateMonster(this, m); }
    tickZones(this);
    tickBosses(this);
    if (this.bosses.length && t >= this.nextBossBroadcast) {
      this.nextBossBroadcast = t + 5;
      const list = bossStatus(this);
      for (const p of this.players.values()) p.session?.send({ t: 'boss', zone: this.def.id, list });
    }
    this.updateProjectiles();
    this.updateTraps();

    for (const d of this.drops.values()) if (t >= d.despawnAt) this.drops.delete(d.id);
    for (const n of this.nodes.values()) {
      if (n.readyAt > 0 && t >= n.readyAt) { n.readyAt = 0; this.emit({ e: 'node', id: n.id, ready: true }, n.x, n.y); }
    }
    if (t >= this.nextSpawnCheck) { this.maintainSpawns(); this.nextSpawnCheck = t + SC.spawnMaintainEverySec; }

    this.recordHistory();
    this.rebuildGrid();
    this.sendSnapshots();
  }

  private updatePlayer(p: PlayerEntity) {
    const t = this.time;
    p.inputBudget = Math.min(SC.inputBudgetMax, p.inputBudget + 1);
    const before = { x: p.ms.x, y: p.ms.y };
    let processed = 0;
    if (p.auto) {
      // Auto farm: the server drives this character. Client inputs are only
      // acknowledged; any manual movement or button press cancels auto.
      while (p.inputQueue.length) {
        const input = p.inputQueue.shift()!;
        if (input.s <= p.lastSeq) continue;
        p.lastSeq = input.s;
        if (input.b !== 0 || Math.abs(input.mx) + Math.abs(input.my) > 0.01) stopAuto(p, 'ผู้เล่นควบคุมเอง');
      }
      const c = p.auto ? autoTick(this, p) : null;
      if (c) { this.applyControls(p, { ...c, vt: this.tick }); processed = 1; }
    }
    while (!p.auto && p.inputQueue.length && p.inputBudget >= 1) {
      const input = p.inputQueue.shift()!;
      p.inputBudget -= 1;
      processed++;
      this.applyInput(p, input);
    }
    if (processed === 0) {
      p.ticksWithoutInput++;
      if (p.ticksWithoutInput >= SC.idleStepAfterTicks || p.ms.forceT > 0) {
        stepMove(p.ms, { mx: 0, my: 0, dodge: false, block: false }, this.moveParams(p), this.map);
        p.blocking = false;
      }
    } else p.ticksWithoutInput = 0;

    p.buffsNow = t;
    tickPlayerPower(this, p);
    if (p.dead) { p.anim = ANIM.DEAD; return; }

    // regen
    const cfg = STAT_CONFIG.regen;
    if (!p.blocking || p.weapon?.defensive.kind !== 'mana_guard') p.energy = Math.min(p.stats.energy, p.energy + cfg.energyPerSec * (1 + (p.powerMods.energyRegenPct ?? 0)) * TICK_DT);
    if (t - p.lastCombatAt > cfg.outOfCombatAfterSec && p.hp < p.stats.hp) {
      p.hp = Math.min(p.stats.hp, p.hp + p.stats.hp * cfg.hpOutOfCombatPerSec * TICK_DT);
    }
    if (p.shield > 0 && t >= p.shieldUntil) p.shield = 0;

    // hazards (damage once per second)
    if (!this.def.safe && t >= p.hazardTickAt) {
      p.hazardTickAt = t + 1;
      for (const h of this.def.hazards) {
        if (h.dpsFraction <= 0) continue;
        if ((p.ms.x - h.x) ** 2 + (p.ms.y - h.y) ** 2 <= h.radius ** 2) {
          const dmg = Math.max(1, Math.round(p.stats.hp * h.dpsFraction));
          p.hp -= dmg;
          p.lastCombatAt = t;
          this.emit({ e: 'hit', s: 0, t: p.id, d: dmg, c: 0, m: 0 }, p.ms.x, p.ms.y);
          if (p.hp <= 0) killPlayer(this, p);
          break;
        }
      }
    }

    // animation state
    const moved = Math.abs(before.x - p.ms.x) + Math.abs(before.y - p.ms.y) > 0.001;
    if (p.ms.dodgeT > 0) p.anim = ANIM.DODGE;
    else if (t < p.animUntil) { /* keep action anim */ }
    else if (p.blocking) p.anim = ANIM.BLOCK;
    else p.anim = moved ? ANIM.MOVE : ANIM.IDLE;

    // portals
    for (const portal of this.def.portals) {
      if (p.ms.x >= portal.x && p.ms.x <= portal.x + portal.w && p.ms.y >= portal.y && p.ms.y <= portal.y + portal.h) {
        this.host.transfer(p, portal.to, portal.toX, portal.toY);
        return;
      }
    }

    // auto-loot gold and stackable materials owned by (or free for) this player
    for (const d of this.drops.values()) {
      if ((d.x - p.ms.x) ** 2 + (d.y - p.ms.y) ** 2 > SC.autoLootRange ** 2) continue;
      if (d.item) {
        const def = getItem(d.item.defId);
        if (!def || (def.category !== 'material' && def.category !== 'consumable')) continue;
      }
      if (d.ownerCharId && d.ownerCharId !== p.rec.id && this.time < d.ownerUntil) continue;
      this.pickup(p, d.id, true);
    }
  }

  private applyInput(p: PlayerEntity, input: { s: number; mx: number; my: number; ax: number; ay: number; b: number; vt: number }) {
    if (input.s <= p.lastSeq) return; // replayed/duplicate input
    p.lastSeq = input.s;
    this.applyControls(p, input);
  }

  /** Apply one tick of controls (from a client input or the auto farm) with full validation. */
  private applyControls(p: PlayerEntity, input: { mx: number; my: number; ax: number; ay: number; b: number; vt: number }) {
    if (p.dead) return;
    const al = Math.hypot(input.ax, input.ay);
    if (al > 0.01) { p.facingX = input.ax / al; p.facingY = input.ay / al; }
    const wantsBlock = (input.b & BTN.BLOCK) !== 0 && p.weapon !== null;
    let canBlock = wantsBlock;
    if (wantsBlock && p.weapon?.defensive.kind === 'mana_guard') {
      const cost = p.weapon.defensive.energyPerSec * TICK_DT;
      if (p.energy >= cost) p.energy -= cost; else canBlock = false;
    }
    const res = stepMove(p.ms, { mx: input.mx, my: input.my, dodge: (input.b & BTN.DODGE) !== 0, block: canBlock }, this.moveParams(p), this.map);
    p.blocking = res.blocking;
    if (res.startedDodge) {
      p.iframesUntil = this.time + (p.weapon?.dodge.iframes ?? 0.2);
      p.combo = 0;
      p.actionLockUntil = 0;
      this.emit({ e: 'act', s: p.id, a: 'dodge', x: p.ms.dvx, y: p.ms.dvy }, p.ms.x, p.ms.y);
    }
    if (!p.weapon || p.blocking) return;
    const aimX = p.facingX, aimY = p.facingY;
    const w = p.weapon;
    if (input.b & ULT_BIT) { const s = powerSkillFor(p, -1); if (s) tryCast(this, p, s, aimX, aimY, input.vt); return; }
    for (let i = 0; i < POWER_BITS.length; i++) {
      if (input.b & POWER_BITS[i]) { const s = powerSkillFor(p, i); if (s) tryCast(this, p, s, aimX, aimY, input.vt); return; }
    }
    if (input.b & BTN.SKILL1) tryCast(this, p, w.skills[0], aimX, aimY, input.vt);
    else if (input.b & BTN.SKILL2) tryCast(this, p, w.skills[1], aimX, aimY, input.vt);
    else if (input.b & BTN.SKILL3) tryCast(this, p, w.skills[2], aimX, aimY, input.vt);
    else if (input.b & BTN.HEAVY) tryCast(this, p, w.heavy, aimX, aimY, input.vt);
    else if (input.b & BTN.ATTACK) tryCast(this, p, w.normal, aimX, aimY, input.vt);
  }

  pickup(p: PlayerEntity, dropId: number, auto = false): string | null {
    const d = this.drops.get(dropId);
    if (!d) return 'no_drop';
    if (p.dead) return 'dead';
    const range = auto ? SC.autoLootRange : SC.pickupRange;
    if ((d.x - p.ms.x) ** 2 + (d.y - p.ms.y) ** 2 > range ** 2) return 'too_far';
    if (d.ownerCharId && d.ownerCharId !== p.rec.id && this.time < d.ownerUntil) return 'not_owner';
    if (d.item) {
      if (!p.inv.addInstance(d.item)) return 'inventory_full';
      p.session?.send({ t: 'notice', kind: 'loot', text: `+${d.item.qty} ${d.item.defId}` });
      this.host.audit(p, 'loot_pickup', { def: d.item.defId, qty: d.item.qty, uid: d.item.uid, rarity: d.item.rarity });
    } else {
      p.rec.gold = Math.min(2_000_000_000, p.rec.gold + d.gold);
      p.session?.send({ t: 'notice', kind: 'loot', text: `+${d.gold} gold` });
    }
    // remove BEFORE anything else can observe it: no double claim
    this.drops.delete(d.id);
    p.invDirty = true;
    p.dirty = true;
    return null;
  }

  createDrop(x: number, y: number, item: DropEntity['item'], gold: number, ownerCharId: string | null, ownerSec: number = SC.dropOwnerSec) {
    const id = this.host.nextId();
    const a = this.rng() * Math.PI * 2, r = 0.3 + this.rng() * 0.9;
    let dx = x + Math.cos(a) * r, dy = y + Math.sin(a) * r;
    if (isBlocked(this.map, dx, dy)) { dx = x; dy = y; }
    this.drops.set(id, {
      kind: 3, id, x: dx, y: dy, item, gold, ownerCharId,
      ownerUntil: this.time + ownerSec, despawnAt: this.time + Math.max(SC.dropDespawnSec, ownerSec + 30),
    });
  }

  private maintainSpawns() {
    const n = [...this.players.values()].filter((p) => !p.dead).length;
    for (const g of this.def.spawnGroups) {
      const desired = Math.min(g.maxCount, g.baseCount + g.perPlayer * Math.max(0, n - 1));
      const members = [...this.monsters.values()].filter((m) => m.group === g);
      if (members.length < desired) {
        for (let i = members.length; i < desired; i++) { const m = this.spawnMonster(g); if (m) { m.state = 'dead'; m.respawnAt = this.time + m.def.respawnSec * this.rng(); m.hp = 0; } }
      } else if (members.length > desired) {
        // shrink only by removing dead members (never despawn a monster mid-fight)
        let extra = members.length - desired;
        for (const m of members) { if (extra <= 0) break; if (m.state === 'dead') { this.monsters.delete(m.id); extra--; } }
      }
    }
  }

  private updateProjectiles() {
    for (let i = this.projectiles.length - 1; i >= 0; i--) {
      const pr = this.projectiles[i];
      const step = Math.hypot(pr.vx, pr.vy) * TICK_DT;
      const sub = Math.max(1, Math.ceil(step / 0.3));
      let done = false;
      for (let s = 0; s < sub && !done; s++) {
        pr.x += (pr.vx * TICK_DT) / sub;
        pr.y += (pr.vy * TICK_DT) / sub;
        pr.remaining -= step / sub;
        if (pr.remaining <= 0 || isBlocked(this.map, pr.x, pr.y)) { done = true; break; }
        for (const e of this.grid.query(pr.x, pr.y, pr.radius + 1)) {
          if (pr.hits === 'monsters' ? e.kind !== 2 : e.kind !== 1) continue;
          if (pr.hit.has(e.id)) continue;
          const tgt = e as MonsterEntity | PlayerEntity;
          const pos = tgt.kind === 1 ? tgt.ms : tgt;
          if ((pos.x - pr.x) ** 2 + (pos.y - pr.y) ** 2 > (pr.radius + tgt.radius) ** 2) continue;
          if (tgt.kind === 2 && tgt.state === 'dead') continue;
          if (tgt.kind === 1 && tgt.dead) continue;
          const src = this.combatantById(pr.ownerId);
          pr.hit.add(e.id);
          if (src) {
            if (src.kind === 2 && tgt.kind === 1) resolveMonsterAttack(this, src, [tgt], pr.monsterAtkMult ?? 1, []);
            else if (src.kind === 1 && pr.skill) {
              dealDamage(this, src, tgt, { mult: pr.damageMult, flat: pr.skill.damage?.flat ?? 0, stat: pr.skill.damage?.stat ?? 'matk', element: pr.element, effects: pr.effects, skill: pr.skill });
              const ch = pr.effects.find((e) => e.kind === 'chain');
              if (ch && ch.kind === 'chain' && tgt.kind === 2) chainFrom(this, src, tgt, pr.skill, pr.damageMult, ch.jumps, ch.range);
            }
          }
          if (!pr.pierce) { done = true; break; }
        }
      }
      if (done) {
        this.emit({ e: 'pend', id: pr.id }, pr.x, pr.y);
        this.projectiles.splice(i, 1);
      }
    }
  }

  placeTrap(p: PlayerEntity, x: number, y: number, ef: Extract<SkillEffect, { kind: 'trap' }>, skill: SkillDef, mult: number) {
    const mine = this.traps.filter((tr) => tr.ownerId === p.id);
    while (mine.length >= ef.maxActive) {
      const old = mine.shift()!;
      this.traps.splice(this.traps.indexOf(old), 1);
      this.emit({ e: 'trap', id: old.id, x: old.x, y: old.y, r: old.radius, arm: 0, on: false, owner: p.id }, old.x, old.y);
    }
    const tr: TrapEntity = { id: this.host.nextId(), ownerId: p.id, x, y, radius: ef.radius, armAt: this.time + ef.armSec, expireAt: this.time + ef.lifeSec, skill, damageMult: mult };
    this.traps.push(tr);
    this.emit({ e: 'trap', id: tr.id, x, y, r: ef.radius, arm: ef.armSec, on: true, owner: p.id }, x, y);
  }

  private updateTraps() {
    for (let i = this.traps.length - 1; i >= 0; i--) {
      const tr = this.traps[i];
      const owner = this.players.get(tr.ownerId);
      let fire = false;
      if (this.time >= tr.armAt && owner) {
        for (const e of this.grid.query(tr.x, tr.y, tr.radius + 1)) {
          if (e.kind === 2 && e.state !== 'dead' && e.state !== 'return' && (e.x - tr.x) ** 2 + (e.y - tr.y) ** 2 <= (tr.radius + e.radius) ** 2) { fire = true; break; }
        }
      }
      if (fire && owner) {
        const effects = tr.skill.effects.filter((e) => e.kind !== 'trap');
        for (const e of this.grid.query(tr.x, tr.y, tr.radius + 1)) {
          if (e.kind !== 2 || e.state === 'dead' || (e.x - tr.x) ** 2 + (e.y - tr.y) ** 2 > (tr.radius + e.radius) ** 2) continue;
          dealDamage(this, owner, e, { mult: tr.damageMult, flat: tr.skill.damage?.flat ?? 0, stat: tr.skill.damage?.stat ?? 'matk', element: tr.skill.element, effects, skill: tr.skill });
        }
      }
      if (fire || !owner || this.time >= tr.expireAt) {
        this.traps.splice(i, 1);
        this.emit({ e: 'trap', id: tr.id, x: tr.x, y: tr.y, r: tr.radius, arm: 0, on: false, owner: tr.ownerId }, tr.x, tr.y);
      }
    }
  }

  private recordHistory() {
    const pos = new Map<number, [number, number]>();
    for (const p of this.players.values()) pos.set(p.id, [p.ms.x, p.ms.y]);
    for (const m of this.monsters.values()) if (m.state !== 'dead') pos.set(m.id, [m.x, m.y]);
    this.history.push({ tick: this.tick, pos });
    if (this.history.length > SC.historyTicks) this.history.shift();
  }

  private rebuildGrid() {
    this.grid.clear();
    for (const p of this.players.values()) this.grid.insert(p, p.ms.x, p.ms.y);
    for (const m of this.monsters.values()) if (m.state !== 'dead') this.grid.insert(m, m.x, m.y);
    for (const d of this.drops.values()) this.grid.insert(d, d.x, d.y);
    for (const n of this.npcs.values()) this.grid.insert(n, n.x, n.y);
    for (const n of this.nodes.values()) this.grid.insert(n, n.x, n.y);
  }

  // ------------------------------------------------------------ replication
  visibleFor(p: PlayerEntity): AnyEntity[] {
    const r = SC.interestRadius;
    return this.grid.query(p.ms.x, p.ms.y, r).filter((e) => {
      if (e === p) return false; // the client predicts itself; never replicate self as a remote entity
      if (e.kind === 1 && e.gm && e.gmFlags.invis && !p.gm) return false;
      if (e.kind === 1 && this.time < e.stealthUntil && !p.gm) return false; // stealthed players are hidden from others
      const pos = e.kind === 1 ? e.ms : e;
      return (pos.x - p.ms.x) ** 2 + (pos.y - p.ms.y) ** 2 <= r * r;
    });
  }

  meta(e: AnyEntity): EntityMeta {
    switch (e.kind) {
      case 1: return { id: e.id, k: 1, name: e.rec.name, level: e.rec.level, app: e.rec.app, weapon: e.weapon?.type ?? null };
      case 2: return { id: e.id, k: 2, def: e.def.id, level: e.level, name: (e.boss?.mutated ? 'Mutated ' : '') + e.def.name, tier: e.def.tier };
      case 3: return { id: e.id, k: 3, item: e.item?.defId ?? 'gold', qty: e.item?.qty ?? e.gold, rarity: e.item?.rarity ?? 'common', owner: e.ownerCharId, x: e.x, y: e.y };
      case 4: return { id: e.id, k: 4, npc: e.def.id, name: e.def.nameTh, role: e.def.role, x: e.x, y: e.y, color: e.def.color, shop: e.def.shopId };
      case 5: return { id: e.id, k: 5, node: e.def.id, kind: e.def.kind, x: e.x, y: e.y, ready: e.readyAt === 0 };
    }
  }

  private entState(e: PlayerEntity | MonsterEntity): EntityState {
    if (e.kind === 1) {
      let flags = 0;
      if (e.blocking) flags |= FLAG.BLOCKING;
      if (e.shield > 0) flags |= FLAG.SHIELDED;
      if (e.ms.rootT > 0) flags |= FLAG.STUNNED;
      if (this.time < e.iframesUntil) flags |= FLAG.INVULN;
      if (e.ms.slowT > 0) flags |= FLAG.SLOWED;
      if (this.time < e.stealthUntil) flags |= FLAG.STEALTH;
      return [e.id, Math.round(e.ms.x * 100), Math.round(e.ms.y * 100), Math.round(Math.atan2(e.facingY, e.facingX) * 100),
        Math.max(0, Math.round((e.hp / e.stats.hp) * 100)), e.anim, flags];
    }
    let flags = 0;
    if (this.time < e.stunUntil) flags |= FLAG.STUNNED;
    if (this.time < e.slowUntil) flags |= FLAG.SLOWED;
    if (this.time < e.rootUntil) flags |= FLAG.ROOTED;
    if (e.frost > 0 && this.time < e.frostUntil) flags |= FLAG.FROZEN;
    for (const d of e.dots) flags |= d.label === 'burn' ? FLAG.BURNING : FLAG.POISONED;
    if (e.state === 'return') flags |= FLAG.INVULN;
    if (e.def.tier !== 'normal') flags |= FLAG.ELITE;
    return [e.id, Math.round(e.x * 100), Math.round(e.y * 100), Math.round(Math.atan2(e.facingY, e.facingX) * 100),
      Math.max(0, Math.ceil((e.hp / e.maxHp) * 100)), e.anim, flags];
  }

  selfState(p: PlayerEntity): SelfState {
    const t = this.time;
    const cd: Record<string, number> = {};
    for (const [k, v] of p.cooldowns) if (v > t) cd[k] = Math.round((v - t) * 100) / 100;
    const ms = p.ms;
    return {
      x: ms.x, y: ms.y, dodgeT: ms.dodgeT, dvx: ms.dvx, dvy: ms.dvy, forceT: ms.forceT, fvx: ms.fvx, fvy: ms.fvy,
      rootT: ms.rootT, animT: ms.animT, animMoveMult: ms.animMoveMult, stamina: ms.stamina, staminaDelay: ms.staminaDelay,
      dodgeCd: ms.dodgeCd, slowT: ms.slowT, slowMult: ms.slowMult,
      hp: Math.ceil(p.hp), mhp: p.stats.hp, en: Math.floor(p.energy), men: p.stats.energy, mst: p.stats.stamina,
      shield: Math.ceil(p.shield), dead: p.dead, cd, combo: p.combo, potCd: Math.max(0, Math.round((p.potCdUntil - t) * 10) / 10),
      auto: p.auto !== null, autoKills: p.auto?.kills ?? 0, fx: Math.round(p.facingX * 1000) / 1000, fy: Math.round(p.facingY * 1000) / 1000, dr: Math.max(0, Math.round((p.drUntil - t) * 10) / 10),
      charges: p.charges, stealth: t < p.stealthUntil, cheat: !!p.cheatDeath,
      buffs: p.buffs.filter((b) => b.until > t).map((b) => [b.src, Math.round((b.until - t) * 10) / 10] as [string, number]),
    };
  }

  private sendSnapshots() {
    const evs = this.events;
    this.events = [];
    for (const p of this.players.values()) {
      if (!p.session) continue;
      const vis = this.visibleFor(p);
      const visIds = new Set<number>();
      const add: EntityMeta[] = [];
      const ents: EntityState[] = [];
      for (const e of vis) {
        visIds.add(e.id);
        if (!p.known.has(e.id)) { p.known.add(e.id); add.push(this.meta(e)); }
        if ((e.kind === 1 && e.id !== p.id) || e.kind === 2) ents.push(this.entState(e));
      }
      const rem: number[] = [];
      for (const id of p.known) if (!visIds.has(id)) { rem.push(id); p.known.delete(id); }
      const r2 = (SC.interestRadius + 4) ** 2;
      const ev = evs.filter((x) => (x.x - p.ms.x) ** 2 + (x.y - p.ms.y) ** 2 <= r2).map((x) => x.ev);
      p.session.send({ t: 'snap', tick: this.tick, ack: p.lastSeq, self: this.selfState(p), ents, add, rem, ev });
    }
  }

  /** Called when an entity's meta changed (e.g. node depleted, level up). */
  invalidateMeta(id: number) { for (const p of this.players.values()) p.known.delete(id); }
}
