// Authoritative world simulation. Runs on the server (and inside the clearly-labelled offline mode).
// Pure TypeScript, no DOM or Node APIs, deterministic given the same seed and command stream.

import { CLASSES, MINIONS } from './data/classes.js';
import { DODGE, MINION_CAPS, SKILL_MAP } from './data/skills.js';
import { DIFFICULTIES, ELITE_AFFIXES, ENEMIES } from './data/enemies.js';
import { BLESSING_MAP, DUNGEON_MODIFIERS } from './data/dungeon.js';
import { POTION } from './data/items.js';
import { generateItem, rollRarity } from './loot.js';
import { LOOT_TUNING } from './content.js';
import { PET_PICKUP } from './data/pets.js';
import { activeElixirMods, weaponAffinity } from './character.js';
import { computeStats, type Derived } from './stats.js';
import { Rng, angleDiff, clamp, dist, dist2, normalize } from './math.js';
import { TILE, circleBlocked, clearPath, findPath, lineOfSight, moveCircle, roomAt, type GameMap } from './maps.js';
import type { CharacterData, DamageType, DifficultyId, Dmg, EnemyAttack, EnemyDef, Item, Mod, SkillDef, SkillEffect, StatusApply, StatusId } from './types.js';

export type EntKind = 'player' | 'enemy' | 'minion';

export interface Status { id: StatusId; t: number; power: number; src: number; dps: number; tickT: number; dtype: DamageType }
export interface Buff { name: string; t: number; mods: Mod[] }

export interface PlayerState {
  char: CharacterData;
  sessionId: string;
  input: { mx: number; my: number; ax: number; ay: number; attack: boolean };
  targetId: number;
  res: number;
  sec: number;
  cds: Record<string, number>;
  basicT: number;
  comboIdx: number;
  dodgeCd: number;
  potionCd: number;
  stillT: number;
  combatT: number;
  lastElem: DamageType | null;
  weaveT: number;
  runMods: Mod[];
  blessings: string[];
  deadT: number;
  partyId: string | null;
  lootBonus: number;
  softLock: boolean;
  aura: string | null;
  lastSeq: number;
  echoN?: number;
  pet?: string | null;
}
export interface EnemyState {
  def: EnemyDef;
  level: number;
  power: number;
  home: { x: number; y: number };
  threat: Map<number, number>;
  forced: { id: number; t: number } | null;
  cds: Record<string, number>;
  pending: { atk: EnemyAttack; t: number; total: number; tx: number; ty: number; ang: number } | null;
  path: Array<[number, number]> | null;
  pathT: number;
  awake: boolean;
  elite: boolean;
  affixes: string[];
  phase: number;
  breakG: number;
  breakMax: number;
  ccImmune: number;
  damagers: Set<number>;
  room?: number;
  idleT: number;
  wander: { x: number; y: number } | null;
  regenT: number;
  respawn?: { x: number; y: number; level: number; elite: boolean; group?: number };
  charge: { vx: number; vy: number; t: number; hit: Set<number>; dmg: number; type: DamageType; status?: StatusApply } | null;
  fightT: number;
  enraged: boolean;
}
export interface MinionState { owner: number; type: string; t: number; atkT: number; power: number; range: number; ranged: boolean; dtype: DamageType }

export interface Ent {
  id: number;
  kind: EntKind;
  team: 0 | 1;
  x: number; y: number; r: number; facing: number;
  hp: number; maxHp: number; barrier: number; barrierT: number;
  dead: boolean;
  statuses: Status[];
  buffs: Buff[];
  stats: Derived | null;
  dirty: boolean;
  lock: number;
  invuln: number;
  dash: { vx: number; vy: number; t: number; hit: Set<number>; packet: Packet | null; radius: number; invuln: boolean; after: SkillEffect[]; ctx: CastCtx } | null;
  name: string;
  p?: PlayerState;
  e?: EnemyState;
  mi?: MinionState;
  armor: number;
  res: Partial<Record<DamageType, number>>;
  speed: number;
  level: number;
}

export interface Packet { amount: number; type: DamageType; critChance: number; critMult: number; status?: StatusApply; src: number; tags: string[]; isBasic?: boolean; noCrit?: boolean; alwaysCrit?: boolean }
interface CastCtx { skill?: SkillDef; tags: string[]; basic: boolean; points: number; ax: number; ay: number; targetId: number; mult?: number }

export interface Proj { id: number; team: 0 | 1; owner: number; x: number; y: number; vx: number; vy: number; r: number; range: number; packet: Packet; pierce: number; chain: number; hit: Set<number>; explode?: { radius: number; packet: Packet }; homing?: boolean; visual: string }
export interface Area {
  id: number; team: 0 | 1; owner: number; x: number; y: number; r: number;
  shape: 'circle' | 'cone' | 'outside'; ang: number; arc: number;
  delay: number; delayTotal: number; dur: number; tick: number; tickT: number; fired: boolean; linger?: number;
  packet: Packet | null; healPct: number; follow: boolean; visual: string; pull: number;
}
export interface Drop { id: number; owner: number; x: number; y: number; item?: Item; gold?: number; t: number }

/** Events produced by a tick. `to` = only that player's entity; omitted = broadcast to everyone in the world. */
export type WorldEvent =
  | { t: 'dmg'; id: number; v: number; c: boolean; dt: DamageType; to?: number; src: number }
  | { t: 'heal'; id: number; v: number }
  | { t: 'miss'; id: number; kind: 'dodge' | 'block' | 'immune' }
  | { t: 'death'; id: number }
  | { t: 'cast'; id: number; skill: string; x: number; y: number }
  | { t: 'kill'; enemy: string; level: number; xp: number; players: number[]; boss: boolean; elite: boolean; x: number; y: number }
  | { t: 'player_death'; id: number }
  | { t: 'respawn'; id: number }
  | { t: 'phase'; id: number; phase: number }
  | { t: 'broken'; id: number }
  | { t: 'drop'; to: number; id: number }
  | { t: 'pickup'; to: number; item?: Item; gold?: number }
  | { t: 'boss_killed'; enemy: string; players: number[] }
  | { t: 'msg'; to?: number; text: string; kind?: 'info' | 'warn' | 'loot' }
  | { t: 'interact'; to: number; what: string; data?: unknown }
  | { t: 'level'; id: number }
  | { t: 'it_add'; it: import('./maps.js').Interactable };

export interface WorldOptions {
  difficulty: DifficultyId; partySize: number; seed: number; kind: 'town' | 'field' | 'dungeon';
  /** Enemy whose death completes the instance and opens the exit (default: veyra in dungeons). */
  finalBoss?: string;
  /** Extra enemy life/damage multiplier (tower floors). */
  scale?: number;
  /** Dead players stay down (arena / raid wipe rules). */
  noRespawn?: boolean;
  /** Added to item level of drops (endgame). */
  ilvlBonus?: number;
  /** Text shown when the final boss dies. */
  exitText?: string;
  /** Eclipse Dimension: seconds between Eclipse Pressure stacks. */
  pressureEvery?: number;
}

const ELEM_STATUS: Record<DamageType, StatusId> = { physical: 'bleed', fire: 'burn', ice: 'chill', lightning: 'shock', holy: 'weaken', shadow: 'curse', poison: 'poison' };
const DOTS = new Set<StatusId>(['burn', 'poison', 'bleed', 'curse']);
const HARD_CC = new Set<StatusId>(['stun', 'freeze', 'broken']);
export const TICK_RATE = 30;

export class World {
  map: GameMap;
  ents = new Map<number, Ent>();
  projs: Proj[] = [];
  areas: Area[] = [];
  drops: Drop[] = [];
  events: WorldEvent[] = [];
  time = 0;
  rng: Rng;
  opts: WorldOptions;
  private nextId = 1;
  private delayed: Array<{ t: number; fn: () => void }> = [];
  bossDefeated = false;
  modifierMods: Mod[] = [];
  enemyHpMul = 1;
  enemyDmgMul = 1;
  lootBonus = 0;
  /** Live-ops multipliers set by the GameCore (weekly event + staff config). */
  live = { lootBonus: 0, goldMul: 1 };
  modifierFlags = new Set<string>();
  pressure = 0;
  private pressureT = 0;

  constructor(map: GameMap, opts: WorldOptions) {
    this.map = map;
    this.opts = opts;
    this.rng = new Rng(opts.seed ^ 0x5bd1e995);
    for (const mid of map.modifiers) {
      const md = DUNGEON_MODIFIERS.find((d) => d.id === mid);
      if (!md) continue;
      this.enemyHpMul *= md.enemyHp ?? 1;
      this.enemyDmgMul *= md.enemyDmg ?? 1;
      this.lootBonus += md.loot;
      if (md.playerMods) this.modifierMods.push(...md.playerMods);
      md.flags?.forEach((f) => this.modifierFlags.add(f));
    }
    for (const s of map.spawns) this.spawnEnemy(s.enemy, s.x, s.y, s.level ?? map.level, !!s.elite, s.room, opts.kind === 'field' ? { x: s.x, y: s.y, level: s.level ?? map.level, elite: !!s.elite, group: s.group } : undefined);
  }

  get diff() { return DIFFICULTIES[this.opts.difficulty]; }
  id() { return this.nextId++; }

  // ───────────── Entities ─────────────
  addPlayer(char: CharacterData, sessionId: string, pos?: { x: number; y: number }): Ent {
    const def = CLASSES[char.cls];
    const e: Ent = {
      id: this.id(), kind: 'player', team: 0, x: pos?.x ?? this.map.spawn.x + this.rng.range(-30, 30), y: pos?.y ?? this.map.spawn.y + this.rng.range(-30, 30), r: 14, facing: 0,
      hp: 1, maxHp: 1, barrier: 0, barrierT: 0, dead: false, statuses: [], buffs: [], stats: null, dirty: true, lock: 0, invuln: 1, dash: null, name: char.name,
      armor: 0, res: {}, speed: def.base.moveSpeed, level: char.level,
      p: {
        char, sessionId, input: { mx: 0, my: 0, ax: 0, ay: 0, attack: false }, targetId: 0, res: 0, sec: 0, cds: {}, basicT: 0, comboIdx: 0, dodgeCd: 0, potionCd: 0,
        stillT: 0, combatT: 99, lastElem: null, weaveT: 0, runMods: [], blessings: [], deadT: 0, partyId: null, lootBonus: 0, softLock: false, aura: null, lastSeq: 0,
      },
    };
    if (circleBlocked(this.map, e.x, e.y, e.r)) { e.x = this.map.spawn.x; e.y = this.map.spawn.y; }
    this.ents.set(e.id, e);
    this.refresh(e);
    e.hp = e.maxHp;
    e.p!.res = def.resource.startFull ? e.stats!.maxRes : 0;
    return e;
  }

  removeEnt(id: number) {
    const e = this.ents.get(id);
    if (!e) return;
    this.ents.delete(id);
    // remove owned minions & drops
    for (const m of [...this.ents.values()]) if (m.mi?.owner === id) this.ents.delete(m.id);
    this.drops = this.drops.filter((d) => d.owner !== id);
  }

  refresh(e: Ent) {
    if (!e.p) return;
    const extra: Mod[] = [...this.modifierMods, ...e.p.runMods, ...activeElixirMods(e.p.char)];
    for (const b of e.buffs) extra.push(...b.mods);
    const st = computeStats(e.p.char, extra);
    const ratio = e.maxHp > 0 ? e.hp / e.maxHp : 1;
    e.stats = st;
    e.maxHp = st.maxHp;
    e.hp = Math.min(st.maxHp, Math.max(e.dead ? 0 : 1, Math.round(st.maxHp * ratio)));
    e.armor = st.armor;
    e.res = st.res;
    e.speed = st.moveSpeed;
    e.level = st.level;
    e.p.res = Math.min(e.p.res, st.maxRes);
    e.p.sec = Math.min(e.p.sec, st.secMax);
    e.dirty = false;
  }

  spawnEnemy(defId: string, x: number, y: number, level: number, elite: boolean, room?: number, respawn?: EnemyState['respawn']): Ent | null {
    const def = ENEMIES[defId];
    if (!def) return null;
    const d = this.diff;
    const lv = Math.max(1, level);
    const partyScale = 1 + 0.6 * (this.opts.partySize - 1);
    const sc = def.id === 'dummy' ? 1 : this.opts.scale ?? 1;
    // Enemy curves: linear + gentle exponential so higher levels keep pace with item-level growth (tuned with scripts/balance.ts)
    let hp = def.hp * (1 + 0.22 * (lv - 1)) * Math.pow(1.05, lv - 1) * (def.id === 'dummy' ? 1 : d.hp * partyScale * this.enemyHpMul) * sc;
    let power = def.power * (1 + 0.13 * (lv - 1)) * Math.pow(1.02, lv - 1) * d.dmg * this.enemyDmgMul * Math.sqrt(sc);
    const affixes: string[] = [];
    if (elite) {
      hp *= 2.2; power *= 1.3;
      const keys = Object.keys(ELITE_AFFIXES);
      const n = Math.max(1, d.eliteMods);
      for (let i = 0; i < n; i++) { const k = this.rng.pick(keys); if (!affixes.includes(k)) affixes.push(k); }
    } else if (def.boss && d.eliteMods >= 2) {
      affixes.push(this.rng.pick(['hasted', 'frenzied', 'vampiric']));
    }
    const e: Ent = {
      id: this.id(), kind: 'enemy', team: 1, x, y, r: def.radius * (elite ? 1.15 : 1), facing: Math.PI / 2, hp: Math.round(hp), maxHp: Math.round(hp), barrier: 0, barrierT: 0, dead: false,
      statuses: [], buffs: [], stats: null, dirty: false, lock: 0, invuln: 0, dash: null, name: (elite ? 'Elite ' : '') + def.name, armor: def.armor * (1 + 0.1 * (lv - 1)), res: def.res,
      speed: def.speed * (affixes.includes('hasted') ? 1.35 : 1) * (this.modifierFlags.has('fast_enemies') ? 1.1 : 1), level: lv,
      e: {
        def, level: lv, power, home: { x, y }, threat: new Map(), forced: null, cds: {}, pending: null, path: null, pathT: 0, awake: false, elite, affixes, phase: 0,
        breakG: 0, breakMax: def.boss ? def.boss.breakGauge * (1 + 0.15 * (lv - 1)) * d.hp * partyScale : 0, ccImmune: 0, damagers: new Set(), room, idleT: this.rng.range(0, 3), wander: null, regenT: 0, respawn, charge: null, fightT: 0, enraged: false,
      },
    };
    if (affixes.includes('shielded')) { e.barrier = e.maxHp * 0.3; e.barrierT = 9999; }
    // stagger initial cooldowns so packs do not attack in unison
    for (const a of def.attacks) e.e!.cds[a.id] = this.rng.range(0.3, a.cooldown);
    this.ents.set(e.id, e);
    return e;
  }

  /** Public-event boss: life scales with the number of players present (shared world, not a party). */
  spawnWorldBoss(defId: string, x: number, y: number, level: number, players: number): Ent | null {
    const e = this.spawnEnemy(defId, x, y, level, false);
    if (!e) return null;
    const scale = 1 + 0.75 * Math.max(0, players - 1);
    e.maxHp = Math.round(e.maxHp * scale); e.hp = e.maxHp;
    e.e!.breakMax *= scale;
    e.e!.home = { x, y };
    return e;
  }

  spawnMinion(owner: Ent, type: string, duration: number): Ent | null {
    const md = MINIONS[type];
    if (!md || !owner.stats) return null;
    const st = owner.stats;
    let cap = (MINION_CAPS[type] ?? 2) + (st.m.minionCap ?? 0);
    if (owner.p!.char.cls === 'assassin' && type === 'wraith') cap = 2;
    const mine = [...this.ents.values()].filter((m) => m.mi?.owner === owner.id && m.mi.type === type);
    while (mine.length >= cap) { const old = mine.shift()!; this.ents.delete(old.id); }
    const ang = this.rng.range(0, Math.PI * 2);
    let x = owner.x + Math.cos(ang) * 40, y = owner.y + Math.sin(ang) * 40;
    if (circleBlocked(this.map, x, y, md.radius)) { x = owner.x; y = owner.y; }
    const hp = Math.round(st.maxHp * md.hp * (1 + (st.m.minionHpPct ?? 0) / 100));
    const e: Ent = {
      id: this.id(), kind: 'minion', team: 0, x, y, r: md.radius, facing: 0, hp, maxHp: hp, barrier: 0, barrierT: 0, dead: false, statuses: [], buffs: [], stats: null, dirty: false,
      lock: 0, invuln: 0, dash: null, name: md.name, armor: st.armor * 0.5, res: st.res, speed: md.speed * (1 + (st.m.minionSpeedPct ?? 0) / 100), level: st.level,
      mi: { owner: owner.id, type, t: duration, atkT: 0.3, power: md.power, range: md.range, ranged: !!md.ranged, dtype: md.type },
    };
    this.ents.set(e.id, e);
    return e;
  }

  // ───────────── Commands (validated; never trust the client) ─────────────
  setInput(id: number, inp: { mx: number; my: number; ax: number; ay: number; attack: boolean; seq?: number }) {
    const e = this.ents.get(id);
    if (!e?.p) return;
    if (Number.isInteger(inp.seq) && inp.seq! > e.p.lastSeq) e.p.lastSeq = inp.seq!;
    const [mx, my] = normalize(clamp(+inp.mx || 0, -1, 1), clamp(+inp.my || 0, -1, 1));
    e.p.input = { mx, my, ax: clamp(+inp.ax || 0, -1e5, 1e5), ay: clamp(+inp.ay || 0, -1e5, 1e5), attack: !!inp.attack };
  }

  setTarget(id: number, targetId: number) {
    const e = this.ents.get(id);
    if (!e?.p) return;
    const t = this.ents.get(targetId);
    e.p.targetId = t && t.team !== e.team && !t.dead ? targetId : 0;
  }

  canAct(e: Ent): boolean {
    return !e.dead && e.lock <= 0 && !e.dash && !e.statuses.some((s) => HARD_CC.has(s.id));
  }

  /** Returns an error string or null on success. */
  castSkill(id: number, kind: 'active' | 'ultimate', slot: number, ax: number, ay: number, targetId = 0): string | null {
    const e = this.ents.get(id);
    if (!e?.p || !e.stats) return 'No player';
    if (e.dead) return 'You are dead';
    const p = e.p;
    const skillId = (kind === 'active' ? p.char.loadout.active : p.char.loadout.ultimate)[slot];
    if (!skillId) return 'Empty slot';
    const sk = SKILL_MAP[skillId];
    if (!sk || sk.cls !== p.char.cls || sk.kind !== kind) return 'Invalid skill';
    if (sk.unlockLevel > p.char.level) return 'Skill locked';
    if ((p.cds[sk.id] ?? 0) > 0) return 'On cooldown';
    if (e.lock > 0 && p.softLock && !e.dash) e.lock = 0; // skills may cancel basic-attack recovery
    if (!this.canAct(e)) return 'Busy';
    if (this.opts.kind === 'town' && !this.townAllowsCombat(e)) return 'Combat is disabled in town (use the training ground)';
    const cost = this.skillCost(e, sk);
    if (p.res < cost) return `Not enough ${CLASSES[p.char.cls].resource.name}`;
    if (sk.requireSecondary && p.sec < sk.requireSecondary) return `Requires ${sk.requireSecondary} ${CLASSES[p.char.cls].secondary?.name ?? ''}`;
    // Aim resolution: tab-target uses the selected target's position.
    let tx = +ax || e.x, ty = +ay || e.y;
    const tgt = this.ents.get(targetId || p.targetId);
    const tgtValid = tgt && !tgt.dead && tgt.team !== e.team && dist(e.x, e.y, tgt.x, tgt.y) <= Math.max(sk.range, 700) && lineOfSight(this.map, e.x, e.y, tgt.x, tgt.y);
    if (targetId && tgtValid) { tx = tgt!.x; ty = tgt!.y; }
    if (sk.targeting === 'target') {
      let t = tgtValid ? tgt! : this.nearestHostile(e, tx, ty, 160) ?? this.nearestHostile(e, e.x, e.y, sk.range);
      if (!t || dist(e.x, e.y, t.x, t.y) > sk.range + t.r || !lineOfSight(this.map, e.x, e.y, t.x, t.y)) return 'No valid target in range';
      tx = t.x; ty = t.y;
    }
    if (sk.targeting === 'ground' && sk.range > 0) {
      const d = dist(e.x, e.y, tx, ty);
      if (d > sk.range) { const [nx, ny] = normalize(tx - e.x, ty - e.y); tx = e.x + nx * sk.range; ty = e.y + ny * sk.range; }
    }
    p.res -= cost;
    let points = 0;
    if (sk.consumeSecondary) { points = p.sec; p.sec = 0; }
    const cdMul = (1 - e.stats.cdr) * (kind === 'ultimate' ? 1 - Math.min(0.5, (e.stats.m.ultCdr ?? 0) / 100) : 1);
    p.cds[sk.id] = sk.cooldown * cdMul;
    const speed = sk.tags.includes('spell') ? e.stats.castSpeed : e.stats.atkSpeed;
    e.lock = sk.cast / speed;
    p.softLock = false;
    e.facing = Math.atan2(ty - e.y, tx - e.x);
    p.combatT = 0;
    // Mage Spell Weave
    if (p.char.cls === 'mage' && sk.tags.includes('spell')) {
      const elem = (['fire', 'ice', 'lightning'] as DamageType[]).find((t) => sk.tags.includes(t)) ?? null;
      if (elem && p.lastElem && elem !== p.lastElem) p.sec = Math.min(e.stats.secMax, p.sec + 1);
      if (elem) p.lastElem = elem;
      p.weaveT = 5;
    }
    this.events.push({ t: 'cast', id: e.id, skill: sk.id, x: Math.round(tx), y: Math.round(ty) });
    const ctx: CastCtx = { skill: sk, tags: sk.tags, basic: false, points, ax: tx, ay: ty, targetId: tgt?.id ?? 0 };
    this.runEffects(e, sk.effects, ctx);
    if (p.char.cls === 'chronomancer') this.timeEcho(e, sk, ctx);
    return null;
  }

  /** Chronomancer: every Nth cast replays its damaging effects 1s later at reduced power. Casting gathers Sand. */
  private timeEcho(e: Ent, sk: SkillDef, ctx: CastCtx) {
    const p = e.p!, st = e.stats!;
    if (!sk.consumeSecondary) p.sec = Math.min(st.secMax, p.sec + 1);
    p.echoN = (p.echoN ?? 0) + 1;
    const loop = st.flags.has('closed_loop');
    if (p.echoN % (loop ? 2 : 3) !== 0) return;
    const dmgFx = sk.effects.filter((f) => f.t === 'melee' || f.t === 'projectile' || (f.t === 'area' && !!f.dmg));
    if (!dmgFx.length) return;
    const mult = (loop ? 0.35 : 0.5) * (1 + (st.m.echoPct ?? 0) / 100);
    this.delayed.push({ t: this.time + 1, fn: () => { if (!this.ents.has(e.id) || e.dead) return; this.events.push({ t: 'cast', id: e.id, skill: sk.id, x: Math.round(ctx.ax), y: Math.round(ctx.ay) }); this.runEffects(e, dmgFx, { ...ctx, mult, points: ctx.points }); } });
  }

  skillCost(e: Ent, sk: SkillDef): number {
    const m = e.stats!.m;
    return Math.max(0, Math.round(sk.cost * (1 + (m.costPct ?? 0) / 100)));
  }

  private townAllowsCombat(e: Ent): boolean {
    return e.x < 10 * TILE; // training ground on the west side of town
  }

  dodge(id: number, dx: number, dy: number): string | null {
    const e = this.ents.get(id);
    if (!e?.p || !this.canAct(e)) return 'Busy';
    if (e.p.dodgeCd > 0) return 'Dodge on cooldown';
    let [nx, ny] = normalize(+dx || 0, +dy || 0);
    if (!nx && !ny) { nx = Math.cos(e.facing); ny = Math.sin(e.facing); }
    e.p.dodgeCd = DODGE.cooldown;
    const sp = DODGE.dist / 0.22;
    e.dash = { vx: nx * sp, vy: ny * sp, t: 0.22, hit: new Set(), packet: null, radius: 0, invuln: true, after: [], ctx: { tags: [], basic: false, points: 0, ax: 0, ay: 0, targetId: 0 } };
    e.invuln = Math.max(e.invuln, DODGE.invuln);
    return null;
  }

  usePotion(id: number): string | null {
    const e = this.ents.get(id);
    if (!e?.p || e.dead) return 'Cannot';
    if (e.p.potionCd > 0) return 'Potion on cooldown';
    if (e.p.char.potions <= 0) return 'No potions left';
    e.p.char.potions--;
    e.p.potionCd = POTION.cooldown;
    this.heal(e, e, e.maxHp * POTION.healPct, true);
    return null;
  }

  pickup(id: number, dropId: number): string | null {
    const e = this.ents.get(id);
    if (!e?.p) return 'No player';
    const d = this.drops.find((x) => x.id === dropId);
    if (!d || d.owner !== id) return 'Nothing to pick up';
    if (dist(e.x, e.y, d.x, d.y) > (e.p.pet ? PET_PICKUP.itemReach : 110)) return 'Too far away';
    if (d.item) {
      const idx = e.p.char.inventory.findIndex((s) => s === null);
      if (idx < 0) return 'Inventory full';
      e.p.char.inventory[idx] = d.item;
      this.events.push({ t: 'pickup', to: id, item: d.item });
    }
    this.drops = this.drops.filter((x) => x !== d);
    return null;
  }

  // ───────────── Effects ─────────────
  private dir(e: Ent, ctx: CastCtx): [number, number] {
    const [nx, ny] = normalize(ctx.ax - e.x, ctx.ay - e.y);
    return nx || ny ? [nx, ny] : [Math.cos(e.facing), Math.sin(e.facing)];
  }

  private runEffects(e: Ent, effects: SkillEffect[], ctx: CastCtx) {
    for (let i = 0; i < effects.length; i++) {
      const fx = effects[i]!;
      if (fx.t === 'dash') {
        this.startDash(e, fx, ctx, effects.slice(i + 1));
        return; // remaining effects run on landing
      }
      this.applyEffect(e, fx, ctx);
    }
  }

  private applyEffect(e: Ent, fx: SkillEffect, ctx: CastCtx) {
    const st = e.stats;
    const aoe = 1 + (st?.m.aoePct ?? 0) / 100;
    switch (fx.t) {
      case 'melee': {
        const [nx, ny] = this.dir(e, ctx);
        const ang = Math.atan2(ny, nx);
        const pk = this.packet(e, fx.dmg, ctx);
        this.areas.push(this.mkArea(e, { x: e.x, y: e.y, r: fx.range * aoe, shape: 'cone', ang, arc: (fx.arc * Math.PI) / 180, delay: 0, dur: 0, packet: pk, visual: 'slash_' + pk.type }));
        if (fx.knock) this.delayed.push({ t: this.time + 0.05, fn: () => this.knockback(e, fx.range * aoe, fx.knock!) });
        break;
      }
      case 'projectile': {
        const lone = st?.flags.has('lone_arrow');
        const base = fx.count ?? 1;
        const count = lone ? 1 : base + (st?.m.projCount ?? 0) * (ctx.basic ? 0 : 1);
        const [nx, ny] = this.dir(e, ctx);
        const ang0 = Math.atan2(ny, nx);
        const spread = ((fx.spread ?? 10 * (count - 1)) * Math.PI) / 180;
        const pk = this.packet(e, fx.dmg, ctx);
        if (lone) pk.amount *= 1 + Math.min(1.8, 0.6 * Math.max(0, base + (st?.m.projCount ?? 0) - 1));
        const fire = (mult: number) => {
          for (let i = 0; i < count; i++) {
            const a = count === 1 ? ang0 : ang0 - spread / 2 + (spread * i) / (count - 1);
            const p2 = { ...pk, amount: pk.amount * mult };
            this.projs.push({
              id: this.id(), team: e.team, owner: e.id, x: e.x + Math.cos(a) * e.r, y: e.y + Math.sin(a) * e.r, vx: Math.cos(a) * fx.speed, vy: Math.sin(a) * fx.speed, r: fx.radius ?? 8,
              range: fx.range, packet: p2, pierce: lone ? 99 : fx.pierce ?? 0, chain: fx.chain ?? 0, hit: new Set(), homing: fx.homing,
              explode: fx.explode ? { radius: fx.explode.radius * aoe, packet: { ...this.packet(e, fx.explode.dmg, ctx), amount: this.packet(e, fx.explode.dmg, ctx).amount * mult } } : undefined,
              visual: pk.type + (ctx.basic ? '_basic' : ''),
            });
          }
        };
        fire(1);
        if (st?.flags.has('spell_echo') && ctx.tags.includes('spell')) this.delayed.push({ t: this.time + 0.25, fn: () => { if (!e.dead && this.ents.has(e.id)) fire(0.5); } });
        break;
      }
      case 'area': {
        const n = fx.count ?? 1;
        const cx = fx.at === 'self' ? e.x : ctx.ax, cy = fx.at === 'self' ? e.y : ctx.ay;
        for (let i = 0; i < n; i++) {
          let x = cx, y = cy;
          if (n > 1) {
            if (fx.at === 'self') {
              // prefer hitting enemies when scattering around self
              const foes = this.hostilesNear(e, e.x, e.y, fx.scatter ?? 150);
              const f = foes.length ? foes[i % foes.length]! : null;
              const a = this.rng.range(0, Math.PI * 2), rr = this.rng.range(0, fx.scatter ?? 100);
              x = f ? f.x + this.rng.range(-20, 20) : cx + Math.cos(a) * rr; y = f ? f.y + this.rng.range(-20, 20) : cy + Math.sin(a) * rr;
            } else { const a = this.rng.range(0, Math.PI * 2), rr = this.rng.range(0, fx.scatter ?? 100); x = cx + Math.cos(a) * rr; y = cy + Math.sin(a) * rr; }
          }
          const pk = fx.dmg ? this.packet(e, fx.dmg, ctx) : null;
          this.areas.push(this.mkArea(e, { x, y, r: fx.radius * aoe, shape: 'circle', ang: 0, arc: 0, delay: (fx.delay ?? 0) + (n > 1 ? i * 0.12 : 0), dur: fx.duration ?? 0, tick: fx.tick ?? 0.5, packet: pk, healPct: fx.healPct ?? 0, follow: !!fx.follow, visual: (pk?.type ?? 'holy') + (fx.healPct ? '_heal' : ''), pull: fx.pull ?? 0 }));
        }
        break;
      }
      case 'buff': {
        const targets = fx.party ? this.alliesNear(e, fx.radius ?? 300) : [e];
        for (const t of targets) this.addBuff(t, fx.name, fx.duration, fx.mods);
        if (fx.mods.some((m) => m.stat === 'invuln')) e.invuln = Math.max(e.invuln, fx.duration);
        break;
      }
      case 'heal': {
        const targets = fx.radius ? this.alliesNear(e, fx.radius) : [e];
        for (const t of targets) this.heal(e, t, t.maxHp * fx.pct);
        break;
      }
      case 'barrier': {
        const targets = fx.radius ? this.alliesNear(e, fx.radius) : [e];
        const mult = 1 + (st?.m.barrierPct ?? 0) / 100;
        for (const t of targets) { t.barrier = Math.max(t.barrier, t.maxHp * fx.pct * mult); t.barrierT = fx.duration; }
        break;
      }
      case 'summon':
        for (let i = 0; i < fx.count; i++) this.spawnMinion(e, fx.minion, fx.duration);
        break;
      case 'gain':
        if (e.p && st) {
          if (fx.resource) e.p.res = Math.min(st.maxRes, e.p.res + fx.resource);
          if (fx.secondary) e.p.sec = Math.min(st.secMax, e.p.sec + fx.secondary);
        }
        break;
      case 'taunt':
        for (const t of this.hostilesNear(e, e.x, e.y, fx.radius)) if (t.e) { t.e.forced = { id: e.id, t: fx.duration }; t.e.awake = true; this.addThreat(t, e, 500); }
        break;
      default:
        break;
    }
  }

  private startDash(e: Ent, fx: Extract<SkillEffect, { t: 'dash' }>, ctx: CastCtx, after: SkillEffect[]) {
    let [nx, ny] = this.dir(e, ctx);
    let d = fx.dist;
    if (ctx.skill?.targeting === 'ground') d = Math.min(fx.dist, dist(e.x, e.y, ctx.ax, ctx.ay));
    if (fx.backward) { nx = -nx; ny = -ny; }
    const speed = 950;
    const t = Math.max(0.05, d / speed);
    e.dash = { vx: nx * speed, vy: ny * speed, t, hit: new Set(), packet: fx.dmg ? this.packet(e, fx.dmg, ctx) : null, radius: fx.radius ?? 30, invuln: !!fx.invuln, after, ctx };
    if (fx.invuln) e.invuln = Math.max(e.invuln, t + 0.1);
  }

  private knockback(src: Ent, range: number, force: number) {
    for (const t of this.hostilesNear(src, src.x, src.y, range + 30)) {
      if (t.e?.def.boss) continue;
      const [nx, ny] = normalize(t.x - src.x, t.y - src.y);
      [t.x, t.y] = moveCircle(this.map, t.x, t.y, t.r, nx * force, ny * force);
    }
  }

  mkArea(e: Ent, a: Partial<Area> & { x: number; y: number; r: number }): Area {
    return { id: this.id(), team: e.team, owner: e.id, shape: 'circle', ang: 0, arc: 0, delay: 0, dur: 0, tick: 0.5, tickT: 0, fired: false, packet: null, healPct: 0, follow: false, visual: 'physical', pull: 0, ...a, delayTotal: a.delay ?? 0 };
  }

  /** Build a damage packet from the caster's stats. */
  packet(e: Ent, d: Dmg, ctx: CastCtx): Packet {
    let type = d.type;
    if (e.kind === 'enemy') {
      return { amount: e.e!.power * d.coef, type, critChance: 0, critMult: 1, status: d.status, src: e.id, tags: ctx.tags };
    }
    if (e.kind === 'minion') {
      const owner = this.ents.get(e.mi!.owner);
      const st = owner?.stats;
      const pow = (st?.power ?? 10) * e.mi!.power * (1 + ((st?.m.minionDmgPct ?? 0) + (st?.m.dmgPct ?? 0) * 0.5) / 100);
      return { amount: pow * d.coef, type, critChance: (st?.critChance ?? 5) * 0.5, critMult: 1.5, status: d.status, src: e.mi!.owner, tags: ['minion'] };
    }
    const st = e.stats!;
    const m = st.m;
    if (ctx.basic) {
      for (const k of Object.keys(m)) if (k.startsWith('basic.convert.') && m[k]! > 0) type = k.slice(14) as DamageType;
    }
    let inc = (m.dmgPct ?? 0) + (m['dmgPct.' + type] ?? 0);
    for (const tag of ctx.tags) inc += m['dmgPct.' + tag] ?? 0;
    if (ctx.basic) inc += m['basic.dmgPct'] ?? 0;
    if (ctx.skill?.consumeSecondary) inc += 0; // handled via `more`
    if (e.hp / e.maxHp > 0.8) inc += m.highLifeDmgPct ?? 0;
    let more = 1;
    if (st.flags.has('glass')) more *= 1.4;
    if (st.flags.has('thousand_cuts')) more *= 1.35;
    if (st.flags.has('hollow_legion')) more *= 0.75;
    if (st.flags.has('still_orbit') && e.p!.stillT > 0.6) more *= 1.3;
    if (e.p!.char.cls === 'mage' && e.p!.sec > 0) more *= 1 + 0.08 * e.p!.sec;
    if (ctx.skill?.consumeSecondary) more *= 1 + ctx.points * (ctx.skill.consumeSecondary.bonusPerPoint + (m.finisherPct ?? 0) / 100);
    if (weaponAffinity(e.p!.char)) more *= 1.1;
    const weak = e.statuses.find((s) => s.id === 'weaken');
    if (weak) more *= 1 - weak.power;
    let status = d.status;
    if (ctx.basic && (m['basic.statusChance'] ?? 0) > 0 && !status) status = { id: ELEM_STATUS[type], chance: m['basic.statusChance']!, duration: 3, power: 0.2 };
    if (st.flags.has('thousand_cuts') && !status) status = { id: 'bleed', chance: 1, duration: 3, power: 0.15 };
    more *= ctx.mult ?? 1;
    return { amount: st.power * d.coef * (1 + inc / 100) * more, type, critChance: st.critChance, critMult: st.critMult / 100, status, src: e.id, tags: ctx.tags, isBasic: ctx.basic, alwaysCrit: ctx.skill?.id === 'asn_u_assassinate' };
  }

  // ───────────── Damage ─────────────
  applyHit(target: Ent, pk: Packet, opts: { dot?: boolean } = {}): number {
    if (target.dead) return 0;
    const src = this.ents.get(pk.src);
    if (target.invuln > 0 || target.buffs.some((b) => b.mods.some((m) => m.stat === 'invuln'))) { if (!opts.dot) this.events.push({ t: 'miss', id: target.id, kind: 'immune' }); return 0; }
    if (target.e?.def.id === 'dummy') target.e.regenT = 5;
    let amt = pk.amount;
    let crit = false;
    // player defenses
    if (target.kind === 'player' && target.stats && !opts.dot) {
      if (this.rng.chance(target.stats.dodge / 100)) { this.events.push({ t: 'miss', id: target.id, kind: 'dodge' }); return 0; }
      if (this.rng.chance(target.stats.block / 100)) {
        amt *= 0.5;
        this.events.push({ t: 'miss', id: target.id, kind: 'block' });
        if (target.p!.char.cls === 'paladin') target.p!.res = Math.min(target.stats.maxRes, target.p!.res + 5);
        if (target.stats.flags.has('retaliate') && src && src.team !== target.team) this.applyHit(src, { amount: target.stats.power, type: 'physical', critChance: 0, critMult: 1, src: target.id, tags: [] });
      }
    }
    if (!opts.dot && !pk.noCrit && (pk.alwaysCrit || this.rng.chance(pk.critChance / 100))) { amt *= pk.critMult; crit = true; }
    // vulnerability family
    for (const s of target.statuses) {
      if (s.id === 'vulnerable' || s.id === 'shock' || s.id === 'curse') amt *= 1 + s.power;
      if (s.id === 'marked' && src) amt *= 1 + s.power + ((src.stats?.m.markPct ?? 0) / 100);
      if (s.id === 'broken') amt *= 1.3;
    }
    if (src?.stats?.flags.has('shatter') && target.statuses.some((s) => s.id === 'freeze' || s.id === 'chill')) amt *= 1.15;
    if (src?.e?.affixes.includes('frenzied') && src.hp < src.maxHp * 0.5) amt *= 1.4;
    if (src?.team === 1 && this.pressure) amt *= 1 + 0.08 * this.pressure;
    // mitigation
    if (pk.type === 'physical') {
      const attLvl = src?.level ?? 1;
      const dr = Math.min(0.75, target.armor / (target.armor + 200 + 20 * attLvl));
      amt *= 1 - dr;
    } else {
      const pen = src?.stats?.m.penetration ?? 0;
      const res = clamp((target.res[pk.type] ?? 0) - pen, -100, 75);
      amt *= 1 - res / 100;
    }
    if (target.stats) {
      const dt = target.stats.m.dmgTakenPct ?? 0;
      amt *= Math.max(0.1, 1 + dt / 100);
      if (target.stats.flags.has('martyr')) amt *= 0.85;
      if (target.stats.flags.has('still_orbit') && target.p!.stillT > 0.6) amt *= 1 / 1.3 ** 0.5;
    }
    // Martyr's Covenant: redirect 20% of an ally's damage to a nearby paladin
    if (target.kind === 'player' && !opts.dot) {
      const martyr = [...this.ents.values()].find((o) => o !== target && o.kind === 'player' && !o.dead && o.stats?.flags.has('martyr') && dist2(o.x, o.y, target.x, target.y) < 300 * 300);
      if (martyr) { const moved = amt * 0.2; amt -= moved; this.applyHit(martyr, { amount: moved, type: 'physical', critChance: 0, critMult: 1, src: pk.src, tags: [], noCrit: true }, { dot: true }); }
    }
    amt = Math.max(1, Math.round(amt));
    // barrier
    let toHp = amt;
    if (target.barrier > 0) { const absorbed = Math.min(target.barrier, toHp); target.barrier -= absorbed; toHp -= absorbed; }
    target.hp -= toHp;
    this.events.push({ t: 'dmg', id: target.id, v: amt, c: crit, dt: pk.type, src: pk.src });
    // on-hit bookkeeping
    if (src) this.onDealt(src, target, amt, pk, opts.dot ?? false);
    if (target.p) {
      target.p.combatT = 0;
      const rd = CLASSES[target.p.char.cls].resource;
      if (rd.onHitTaken && !opts.dot) target.p.res = Math.min(target.stats!.maxRes, target.p.res + rd.onHitTaken);
    }
    if (target.e) {
      target.e.awake = true;
      const owner = src?.mi ? this.ents.get(src.mi.owner) : src;
      if (owner?.kind === 'player') target.e.damagers.add(owner.id);
      if (src) this.addThreat(target, src, amt * (1 + (src.stats?.m.threatPct ?? 0) / 100));
      if (target.e.breakMax > 0 && !target.statuses.some((s) => s.id === 'broken')) {
        target.e.breakG += amt * 0.15;
        if (target.e.breakG >= target.e.breakMax) this.breakBoss(target);
      }
    }
    // status
    if (pk.status && !opts.dot) this.tryStatus(target, pk.status, amt, pk.src, pk.type);
    if (target.hp <= 0) this.kill(target, src);
    return amt;
  }

  private onDealt(src: Ent, target: Ent, amt: number, pk: Packet, dot: boolean) {
    const owner = src.mi ? this.ents.get(src.mi.owner) : src;
    if (src.e?.affixes.includes('vampiric')) src.hp = Math.min(src.maxHp, src.hp + amt * 0.2);
    if (!owner?.p || !owner.stats || dot) return;
    owner.p.combatT = 0;
    if (src === owner) {
      const st = owner.stats;
      if (st.leech > 0) this.heal(owner, owner, amt * st.leech, false, true);
      const m = st.m;
      if ((m.onHitPoison ?? 0) > 0 && this.rng.chance(m.onHitPoison!)) this.tryStatus(target, { id: 'poison', chance: 1, duration: 4, power: 0.25 }, amt, owner.id, 'poison');
      if ((m.onHitBurn ?? 0) > 0 && this.rng.chance(m.onHitBurn!)) this.tryStatus(target, { id: 'burn', chance: 1, duration: 3, power: 0.25 }, amt, owner.id, 'fire');
      if ((m.onHitBleed ?? 0) > 0 && this.rng.chance(m.onHitBleed!)) this.tryStatus(target, { id: 'bleed', chance: 1, duration: 4, power: 0.2 }, amt, owner.id, 'physical');
      // Assassin: Death Sigil makes marked targets grant combo
      if (owner.p.char.cls === 'assassin' && target.statuses.some((s) => s.id === 'vulnerable' && s.src === owner.id) && this.rng.chance(0.3)) owner.p.sec = Math.min(st.secMax, owner.p.sec + 1);
    }
  }

  private addThreat(enemy: Ent, src: Ent, v: number) {
    if (!enemy.e) return;
    enemy.e.threat.set(src.id, (enemy.e.threat.get(src.id) ?? 0) + v);
  }

  private breakBoss(b: Ent) {
    b.e!.breakG = 0;
    b.e!.pending = null;
    b.statuses = b.statuses.filter((s) => !HARD_CC.has(s.id));
    b.statuses.push({ id: 'broken', t: 4, power: 0.3, src: 0, dps: 0, tickT: 0, dtype: 'physical' });
    this.events.push({ t: 'broken', id: b.id });
  }

  tryStatus(target: Ent, s: StatusApply, hitAmt: number, srcId: number, dtype: DamageType) {
    const src = this.ents.get(srcId);
    if (!this.rng.chance(s.chance)) return;
    let dur = s.duration * (1 + ((src?.stats?.m.statusDurPct ?? 0) + (s.id === 'stun' ? src?.stats?.m.stunDurPct ?? 0 : 0)) / 100);
    if (HARD_CC.has(s.id)) {
      if (target.e?.def.boss) { target.e.breakG += 60 * dur * (1 + target.level * 0.1); if (target.e.breakG >= target.e.breakMax) this.breakBoss(target); return; }
      if (target.e && target.e.ccImmune > 0) { this.events.push({ t: 'miss', id: target.id, kind: 'immune' }); return; }
      if (target.stats?.flags.has('unbreakable')) return;
      if (target.kind === 'player') dur *= 0.6; // players get shorter CC
      if (target.e) { target.e.pending = null; target.e.charge = null; }
    }
    const existing = target.statuses.find((x) => x.id === s.id && (s.id !== 'poison' || x.src === srcId));
    const dotMul = 1 + (src?.stats?.m.dotDmgPct ?? 0) / 100;
    const dps = DOTS.has(s.id) ? hitAmt * (s.power ?? 0.2) * dotMul : 0;
    const poisonStacks = target.statuses.filter((x) => x.id === 'poison').length;
    if (s.id === 'poison' && poisonStacks < 5) {
      target.statuses.push({ id: 'poison', t: dur, power: s.power ?? 0.2, src: srcId, dps, tickT: 0.5, dtype: 'poison' });
    } else if (existing) {
      existing.t = Math.max(existing.t, dur);
      existing.power = Math.max(existing.power, s.power ?? 0);
      existing.dps = Math.max(existing.dps, dps);
    } else {
      target.statuses.push({ id: s.id, t: dur, power: s.power ?? 0.2, src: srcId, dps, tickT: 0.5, dtype: s.id === 'curse' ? 'shadow' : s.id === 'burn' ? 'fire' : dtype });
    }
  }

  heal(src: Ent, target: Ent, amount: number, isPotion = false, isLeech = false) {
    if (target.dead) return;
    let mul = 1 + ((src.stats?.m.healPct ?? 0) + (isLeech || isPotion ? 0 : 0)) / 100;
    if (target.stats && target !== src) mul *= 1;
    const v = Math.round(amount * Math.max(0.1, mul));
    const before = target.hp;
    target.hp = Math.min(target.maxHp, target.hp + v);
    const gained = target.hp - before;
    if (gained >= 3 && !isLeech) this.events.push({ t: 'heal', id: target.id, v: gained });
  }

  addBuff(e: Ent, name: string, t: number, mods: Mod[]) {
    const ex = e.buffs.find((b) => b.name === name);
    if (ex) ex.t = Math.max(ex.t, t);
    else e.buffs.push({ name, t, mods });
    e.dirty = true;
  }

  private kill(target: Ent, src: Ent | undefined) {
    if (target.dead) return;
    if (target.e?.def.id === 'dummy') { target.hp = target.maxHp; return; }
    target.dead = true;
    target.hp = 0;
    this.events.push({ t: 'death', id: target.id });
    if (target.kind === 'player') {
      target.p!.deadT = 5;
      target.statuses = [];
      target.p!.char.stats.deaths++;
      this.events.push({ t: 'player_death', id: target.id });
      for (const m of [...this.ents.values()]) if (m.mi?.owner === target.id) this.ents.delete(m.id);
      return;
    }
    if (target.kind === 'minion') { this.ents.delete(target.id); return; }
    const es = target.e!;
    // reward eligibility: damaged it, or in the same world within 1000px (party share)
    const players = [...this.ents.values()].filter((p) => p.kind === 'player' && !p.dead && (es.damagers.has(p.id) || dist2(p.x, p.y, target.x, target.y) < 1000 * 1000));
    const xp = es.def.xp * (1 + 0.15 * (es.level - 1)) * this.diff.xp * (es.elite ? 2.5 : 1);
    this.events.push({ t: 'kill', enemy: es.def.id, level: es.level, xp, players: players.map((p) => p.id), boss: !!es.def.boss, elite: es.elite, x: target.x, y: target.y });
    // necromancer souls
    for (const p of players) if (p.p!.char.cls === 'necromancer' && dist2(p.x, p.y, target.x, target.y) < 600 * 600) p.p!.sec = Math.min(p.stats!.secMax, p.p!.sec + (es.def.boss ? 5 : 1));
    // contagion
    const killer = src?.mi ? this.ents.get(src.mi.owner) : src;
    if (killer?.stats?.flags.has('contagion') && target.statuses.some((s) => s.id === 'curse')) {
      for (const o of this.hostilesNear(killer, target.x, target.y, 160)) this.tryStatus(o, { id: 'curse', chance: 1, duration: 6, power: 0.2 }, killer.stats.power, killer.id, 'shadow');
    }
    if (es.affixes.includes('volatile') || this.diff.extraMechanics.includes('death_burst')) {
      const pk: Packet = { amount: es.power * 1.5, type: 'shadow', critChance: 0, critMult: 1, src: target.id, tags: [] };
      this.areas.push(this.mkArea(target, { x: target.x, y: target.y, r: 90, delay: 1.1, packet: pk, visual: 'shadow' }));
    }
    for (const p of players) this.rollLoot(p, target);
    if (es.def.boss) this.events.push({ t: 'boss_killed', enemy: es.def.id, players: players.map((p) => p.id) });
    const finalBoss = this.opts.finalBoss ?? (this.opts.kind === 'dungeon' ? 'veyra' : null);
    if (es.def.id === finalBoss && !this.bossDefeated) {
      this.bossDefeated = true;
      const room = this.map.rooms.find((r) => r.type === 'boss');
      const ex = room ? { x: room.cx * TILE + TILE / 2, y: room.cy * TILE + TILE / 2 + 64 } : { x: target.x, y: target.y };
      const exitIt = { id: 'exit', type: 'exit' as const, name: 'Rift Exit', ...ex };
      this.map.interactables.push(exitIt);
      this.events.push({ t: 'it_add', it: exitIt });
      this.events.push({ t: 'msg', text: this.opts.exitText ?? 'The Umbral Warden falls! A Rift Exit has opened.', kind: 'info' });
    }
    if (es.respawn) {
      const r = es.respawn;
      this.delayed.push({ t: this.time + 25, fn: () => this.spawnEnemy(es.def.id, r.x, r.y, r.level, r.elite, undefined, r) });
    }
    this.ents.delete(target.id);
  }

  rollLoot(p: Ent, enemy: Ent) {
    const es = enemy.e!;
    const ch = p.p!.char;
    const mf = (p.stats?.m.magicFindPct ?? 0) / 100;
    const bonus = this.diff.loot + this.lootBonus + this.live.lootBonus + this.pressure * 0.1 + mf + p.p!.lootBonus + (es.def.lootBonus ?? 0) * 0.15 + (es.elite ? 0.3 : 0);
    const rolls = es.def.boss ? (es.def.id === 'veyra' || es.def.id === 'gloomheart' ? 3 : 2) : es.elite ? LOOT_TUNING.eliteRolls : 1;
    const dropChance = es.def.boss || es.elite ? 1 : LOOT_TUNING.dropChance;
    const gf = (1 + (p.stats?.m.goldFindPct ?? 0) / 100) * this.live.goldMul;
    // gold
    if (this.rng.chance(0.6) || es.def.boss) this.addDrop(p, enemy.x + this.rng.range(-20, 20), enemy.y + this.rng.range(-20, 20), undefined, Math.round((3 + es.level * 2) * (es.def.boss ? 15 : es.elite ? 4 : 1) * gf * this.rng.range(0.7, 1.3)));
    for (let i = 0; i < rolls; i++) {
      if (!this.rng.chance(dropChance)) continue;
      const min = (es.def.id === 'veyra' || es.def.id === 'gloomheart') && i === 0 ? 'rare' : es.def.boss && i === 0 ? 'uncommon' : 'common';
      const rarity = rollRarity(this.rng, bonus, min);
      const item = generateItem({ rng: this.rng, ilvl: Math.min(100, es.level + (this.opts.ilvlBonus ?? 0)), rarity, cls: ch.cls, hardcore: ch.hardcore });
      this.addDrop(p, enemy.x + this.rng.range(-30, 30), enemy.y + this.rng.range(-30, 30), item);
    }
    // potion recharge on kills
    if (this.rng.chance(es.def.boss ? 1 : 0.08) && ch.potions < POTION.maxCharges) { ch.potions++; }
  }

  addDrop(p: Ent, x: number, y: number, item?: Item, gold?: number) {
    if (circleBlocked(this.map, x, y, 6)) { x = p.x; y = p.y; }
    const d: Drop = { id: this.id(), owner: p.id, x, y, item, gold, t: 120 };
    this.drops.push(d);
    this.events.push({ t: 'drop', to: p.id, id: d.id });
  }

  // ───────────── Queries ─────────────
  hostilesNear(e: Ent, x: number, y: number, r: number): Ent[] {
    const out: Ent[] = [];
    for (const o of this.ents.values()) if (o.team !== e.team && !o.dead && dist2(o.x, o.y, x, y) <= (r + o.r) ** 2) out.push(o);
    return out;
  }
  alliesNear(e: Ent, r: number): Ent[] {
    const out: Ent[] = [];
    for (const o of this.ents.values()) if (o.team === e.team && o.kind === 'player' && !o.dead && dist2(o.x, o.y, e.x, e.y) <= r * r) out.push(o);
    return out;
  }
  nearestHostile(e: Ent, x: number, y: number, r: number): Ent | null {
    let best: Ent | null = null, bd = r * r;
    for (const o of this.ents.values()) {
      if (o.team === e.team || o.dead || o.e?.def.id === 'dummy' && this.opts.kind !== 'town') continue;
      const d = dist2(o.x, o.y, x, y);
      if (d < bd) { bd = d; best = o; }
    }
    return best;
  }

  // ───────────── Tick ─────────────
  tick(dt: number) {
    this.time += dt;
    if (this.opts.pressureEvery && [...this.ents.values()].some((e) => e.kind === 'player')) {
      this.pressureT += dt;
      if (this.pressureT >= this.opts.pressureEvery) { this.pressureT = 0; this.pressure++; this.events.push({ t: 'msg', text: `Eclipse Pressure ${this.pressure}: enemies hit ${this.pressure * 8}% harder, loot +${this.pressure * 10}%.`, kind: 'warn' }); }
    }
    // delayed actions
    if (this.delayed.length) {
      const due = this.delayed.filter((d) => d.t <= this.time);
      this.delayed = this.delayed.filter((d) => d.t > this.time);
      for (const d of due) d.fn();
    }
    for (const e of [...this.ents.values()]) {
      if (!this.ents.has(e.id)) continue;
      this.tickCommon(e, dt);
      if (e.kind === 'player') this.tickPlayer(e, dt);
      else if (e.kind === 'enemy') this.tickEnemy(e, dt);
      else this.tickMinion(e, dt);
    }
    this.tickProjectiles(dt);
    this.tickAreas(dt);
    // drops
    for (const d of this.drops) d.t -= dt;
    const expired = this.drops.filter((d) => d.t <= 0);
    if (expired.length) this.drops = this.drops.filter((d) => d.t > 0);
    // auto-pickup gold
    for (const d of [...this.drops]) {
      if (!d.gold) continue;
      const p = this.ents.get(d.owner);
      const gr = p?.p?.pet ? PET_PICKUP.goldRadius : 70;
      if (p && !p.dead && dist2(p.x, p.y, d.x, d.y) < gr * gr) {
        p.p!.char.gold += d.gold;
        this.events.push({ t: 'pickup', to: p.id, gold: d.gold });
        this.drops = this.drops.filter((x) => x !== d);
      }
    }
  }

  private tickCommon(e: Ent, dt: number) {
    if (e.dead) return;
    e.lock = Math.max(0, e.lock - dt);
    e.invuln = Math.max(0, e.invuln - dt);
    if (e.barrierT > 0) { e.barrierT -= dt; if (e.barrierT <= 0) e.barrier = 0; }
    // buffs
    let changed = false;
    for (const b of e.buffs) b.t -= dt;
    if (e.buffs.some((b) => b.t <= 0)) { e.buffs = e.buffs.filter((b) => b.t > 0); changed = true; }
    if (changed || e.dirty) this.refresh(e);
    // statuses
    for (const s of e.statuses) {
      s.t -= dt;
      if (s.dps > 0) {
        s.tickT -= dt;
        if (s.tickT <= 0) {
          s.tickT += 0.5;
          this.applyHit(e, { amount: s.dps * 0.5, type: s.dtype, critChance: 0, critMult: 1, src: s.src, tags: ['dot'], noCrit: true }, { dot: true });
          if (e.dead) return;
        }
      }
    }
    const hadHard = e.statuses.some((s) => HARD_CC.has(s.id) && s.t <= 0);
    e.statuses = e.statuses.filter((s) => s.t > 0);
    if (hadHard && e.e) e.e.ccImmune = 1.5;
    if (e.e && e.e.ccImmune > 0) e.e.ccImmune -= dt;
    // dash movement
    if (e.dash) {
      const d = e.dash;
      const step = Math.min(dt, d.t);
      const [nx, ny] = moveCircle(this.map, e.x, e.y, e.r, d.vx * step, d.vy * step);
      const blocked = Math.abs(nx - (e.x + d.vx * step)) + Math.abs(ny - (e.y + d.vy * step)) > 2;
      e.x = nx; e.y = ny;
      if (d.packet) for (const o of this.hostilesNear(e, e.x, e.y, d.radius)) if (!d.hit.has(o.id)) { d.hit.add(o.id); this.applyHit(o, d.packet); }
      d.t -= step;
      if (d.t <= 0 || blocked) {
        e.dash = null;
        if (d.after.length) this.runEffects(e, d.after, { ...d.ctx, ax: e.x + Math.cos(e.facing) * 50, ay: e.y + Math.sin(e.facing) * 50 });
      }
    }
  }

  private tickPlayer(e: Ent, dt: number) {
    const p = e.p!;
    const st = e.stats!;
    const def = CLASSES[p.char.cls];
    if (e.dead) {
      p.deadT -= dt;
      if (p.deadT <= 0 && !p.char.hardcore && !this.opts.noRespawn) {
        e.dead = false;
        e.x = this.map.spawn.x; e.y = this.map.spawn.y;
        this.refresh(e);
        e.hp = e.maxHp; e.invuln = 2;
        p.res = def.resource.startFull ? st.maxRes : 0;
        this.events.push({ t: 'respawn', id: e.id });
      }
      return;
    }
    // cooldowns
    for (const k in p.cds) { p.cds[k] = Math.max(0, p.cds[k]! - dt); }
    p.dodgeCd = Math.max(0, p.dodgeCd - dt);
    p.potionCd = Math.max(0, p.potionCd - dt);
    p.basicT = Math.max(0, p.basicT - dt);
    p.combatT += dt;
    // regen / decay
    e.hp = Math.min(e.maxHp, e.hp + st.hpRegen * dt * (p.combatT > 5 ? 3 : 1));
    for (const ally of this.ents.values()) if (ally.kind === 'player' && ally !== e && ally.stats?.m.auraRegen && dist2(ally.x, ally.y, e.x, e.y) < 300 * 300) e.hp = Math.min(e.maxHp, e.hp + e.maxHp * 0.01 * dt);
    let regen = st.resRegen;
    if (p.combatT > 3 && def.resource.decay && !e.buffs.some((b) => b.name === 'Titan')) regen -= def.resource.decay * (st.flags.has('rage_tempo') ? 2 : 1);
    p.res = clamp(p.res + regen * dt, 0, st.maxRes);
    if (p.char.cls === 'mage') { p.weaveT -= dt; if (p.weaveT <= 0) p.sec = 0; }
    if (p.char.cls === 'assassin' && p.combatT > 8) p.sec = Math.max(0, p.sec - dt * 0.5);
    // movement
    const hardCC = e.statuses.some((s) => HARD_CC.has(s.id));
    if (!e.dash && !hardCC) {
      let speed = e.speed;
      for (const s of e.statuses) if (s.id === 'slow' || s.id === 'chill') speed *= 1 - clamp(s.power, 0, 0.7);
      if (e.lock > 0) speed *= 0.35; // casting slows movement
      const { mx, my } = p.input;
      if (mx || my) {
        [e.x, e.y] = moveCircle(this.map, e.x, e.y, e.r, mx * speed * dt, my * speed * dt);
        p.stillT = 0;
        if (e.lock <= 0) e.facing = Math.atan2(my, mx);
      } else p.stillT += dt;
      if (p.input.attack || e.lock > 0) e.facing = Math.atan2(p.input.ay - e.y, p.input.ax - e.x) || e.facing;
    }
    // basic attack
    if (p.input.attack && this.canAct(e) && p.basicT <= 0 && (this.opts.kind !== 'town' || this.townAllowsCombat(e))) this.basicAttack(e);
  }

  private basicAttack(e: Ent) {
    const p = e.p!;
    const st = e.stats!;
    const def = CLASSES[p.char.cls];
    const b = def.basic;
    const step = b.chain[p.comboIdx % b.chain.length]!;
    let as = st.atkSpeed;
    if (st.flags.has('rage_tempo')) as += p.res * 0.004;
    const interval = b.interval / as;
    p.basicT = interval;
    e.lock = Math.min(0.18, interval * 0.5);
    p.softLock = true;
    p.combatT = 0;
    let ax = p.input.ax, ay = p.input.ay;
    const tgt = this.ents.get(p.targetId);
    if (tgt && !tgt.dead && dist(e.x, e.y, tgt.x, tgt.y) < (b.kind === 'melee' ? 180 : step.range)) { ax = tgt.x; ay = tgt.y; }
    const ctx: CastCtx = { tags: [b.kind === 'melee' ? 'melee' : 'projectile', 'attack', 'basic'], basic: true, points: 0, ax, ay, targetId: p.targetId };
    e.facing = Math.atan2(ay - e.y, ax - e.x);
    const extra = Math.round(st.m['basic.proj'] ?? 0);
    const dmg: Dmg = { coef: step.coef, type: b.type };
    const isLast = p.comboIdx % b.chain.length === b.chain.length - 1;
    if (b.kind === 'melee') {
      this.applyEffect(e, { t: 'melee', range: step.range, arc: step.arc ?? 100, dmg }, ctx);
      for (let i = 0; i < extra; i++) this.delayed.push({ t: this.time + 0.08 * (i + 1), fn: () => { if (this.ents.has(e.id) && !e.dead) this.applyEffect(e, { t: 'melee', range: step.range, arc: step.arc ?? 100, dmg }, ctx); } });
      const chains = Math.round(st.m['basic.chain'] ?? 0);
      if (chains > 0) {
        const near = this.hostilesNear(e, e.x, e.y, 260).slice(0, chains);
        for (const n of near) this.applyHit(n, { ...this.packet(e, { coef: step.coef * 0.5, type: 'lightning' }, ctx) });
      }
    } else {
      const n = 1 + extra;
      this.applyEffect(e, { t: 'projectile', count: n, spread: n > 1 ? 8 * (n - 1) : 0, speed: step.speed ?? 600, range: step.range, radius: 7, dmg, pierce: Math.round(st.m['basic.pierce'] ?? 0), chain: Math.round(st.m['basic.chain'] ?? 0) }, ctx);
    }
    if (st.flags.has('twin_moon')) {
      const echo: Dmg = { coef: step.coef * 0.6, type: b.type };
      this.delayed.push({ t: this.time + 0.15, fn: () => { if (!this.ents.has(e.id) || e.dead) return; if (b.kind === 'melee') this.applyEffect(e, { t: 'melee', range: step.range, arc: step.arc ?? 100, dmg: echo }, ctx); else this.applyEffect(e, { t: 'projectile', speed: step.speed ?? 600, range: step.range, radius: 7, dmg: echo }, ctx); } });
    }
    if ((st.m['basic.burst'] ?? 0) > 0 && p.comboIdx % b.chain.length === 1) {
      const [nx, ny] = normalize(ax - e.x, ay - e.y);
      this.applyEffect(e, { t: 'area', at: 'cursor', radius: 80, dmg: { coef: 0.8, type: 'holy' } }, { ...ctx, ax: e.x + nx * 70, ay: e.y + ny * 70 });
    }
    // resources
    if (b.resourceGain) p.res = Math.min(st.maxRes, p.res + b.resourceGain);
    if (b.secondaryGain) p.sec = Math.min(st.secMax, p.sec + b.secondaryGain);
    if (p.char.cls === 'warrior' && isLast) p.res = Math.min(st.maxRes, p.res + 10); // Momentum Cleave
    p.comboIdx++;
  }

  private tickMinion(e: Ent, dt: number) {
    const mi = e.mi!;
    const owner = this.ents.get(mi.owner);
    mi.t -= dt;
    if (!owner || owner.dead || mi.t <= 0) { this.ents.delete(e.id); return; }
    if (e.statuses.some((s) => HARD_CC.has(s.id))) return;
    mi.atkT -= dt;
    const target = this.nearestHostile(e, owner.x, owner.y, 420);
    let gx = owner.x, gy = owner.y, want = 70;
    if (target) { gx = target.x; gy = target.y; want = mi.range * 0.8 + target.r; }
    const d = dist(e.x, e.y, gx, gy);
    if (target && d <= mi.range + target.r && mi.atkT <= 0) {
      mi.atkT = MINIONS[mi.type]!.interval;
      e.facing = Math.atan2(gy - e.y, gx - e.x);
      const ctx: CastCtx = { tags: ['minion'], basic: false, points: 0, ax: gx, ay: gy, targetId: target.id };
      if (mi.ranged) this.applyEffect(e, { t: 'projectile', speed: 520, range: mi.range + 40, radius: 7, dmg: { coef: 1, type: mi.dtype } }, ctx);
      else this.applyHit(target, this.packet(e, { coef: 1, type: mi.dtype }, ctx));
    } else if (d > want && e.speed > 0) {
      let [nx, ny] = normalize(gx - e.x, gy - e.y);
      if (!clearPath(this.map, e.x, e.y, gx, gy, e.r)) { const path = findPath(this.map, e.x, e.y, gx, gy, 800); const wp = path?.find((w) => dist(w[0], w[1], e.x, e.y) > 16); if (wp) [nx, ny] = normalize(wp[0] - e.x, wp[1] - e.y); }
      [e.x, e.y] = moveCircle(this.map, e.x, e.y, e.r, nx * e.speed * dt, ny * e.speed * dt);
      e.facing = Math.atan2(ny, nx);
    }
    if (dist(e.x, e.y, owner.x, owner.y) > 900) { e.x = owner.x; e.y = owner.y; }
  }

  private pickTarget(e: Ent): Ent | null {
    const es = e.e!;
    if (es.forced) {
      es.forced.t -= 1 / TICK_RATE;
      const f = this.ents.get(es.forced.id);
      if (es.forced.t > 0 && f && !f.dead) return f;
      es.forced = null;
    }
    let best: Ent | null = null, bv = -1;
    for (const [id, v] of es.threat) {
      const o = this.ents.get(id);
      if (!o || o.dead || dist2(o.x, o.y, e.x, e.y) > 1100 * 1100) { es.threat.delete(id); continue; }
      if (v > bv) { bv = v; best = o; }
    }
    if (best) return best;
    // aggro on sight
    for (const o of this.ents.values()) {
      if (o.team === e.team || o.dead) continue;
      if (dist2(o.x, o.y, e.x, e.y) < es.def.aggroRange ** 2 && lineOfSight(this.map, e.x, e.y, o.x, o.y)) {
        es.awake = true; this.addThreat(e, o, 1);
        // wake room-mates
        if (es.room !== undefined) for (const m of this.ents.values()) if (m.e && m.e.room === es.room && !m.e.awake) { m.e.awake = true; this.addThreat(m, o, 1); }
        return o;
      }
    }
    return null;
  }

  private tickEnemy(e: Ent, dt: number) {
    const es = e.e!;
    const def = es.def;
    if (def.id === 'dummy') { es.regenT -= dt; if (es.regenT <= 0) e.hp = e.maxHp; e.statuses = e.statuses.filter((s) => s.id !== 'stun'); return; }
    for (const k in es.cds) es.cds[k] = Math.max(0, es.cds[k]! - dt * (es.affixes.includes('hasted') ? 1.33 : 1));
    // boss phases
    if (def.boss) {
      const ratio = e.hp / e.maxHp;
      const extra = this.diff.extraMechanics.includes('boss_extra') ? 1 : 0;
      const ph = def.boss.phases.filter((t) => ratio < t).length;
      if (ph > es.phase) {
        es.phase = ph;
        e.invuln = 1.2;
        es.pending = null;
        this.events.push({ t: 'phase', id: e.id, phase: ph });
        this.events.push({ t: 'msg', text: `${def.name} enters phase ${ph + 1}!`, kind: 'warn' });
        const nova = def.attacks.find((a) => a.kind === 'nova');
        if (nova) this.enemyNova(e, nova, (nova.count ?? 12) + 6);
      }
      if (extra && es.phase === 0) es.phase = 0; // phase-gated attacks unlocked below
    }
    if (es.awake && def.enrage) {
      es.fightT += dt;
      if (!es.enraged && es.fightT >= def.enrage) { es.enraged = true; es.power *= 1.8; e.speed *= 1.2; this.events.push({ t: 'msg', text: `${def.name} is ENRAGED!`, kind: 'warn' }); }
    }
    if (e.statuses.some((s) => HARD_CC.has(s.id))) return;
    // charging
    if (es.charge) {
      const c = es.charge;
      const step = Math.min(dt, c.t);
      [e.x, e.y] = moveCircle(this.map, e.x, e.y, e.r, c.vx * step, c.vy * step);
      for (const o of this.hostilesNear(e, e.x, e.y, 20)) if (!c.hit.has(o.id)) { c.hit.add(o.id); this.applyHit(o, { amount: c.dmg, type: c.type, critChance: 0, critMult: 1, src: e.id, tags: [], status: c.status }); }
      c.t -= step;
      if (c.t <= 0) es.charge = null;
      return;
    }
    // resolve pending (telegraphed) attack
    if (es.pending) {
      es.pending.t -= dt;
      if (es.pending.t <= 0) { const pa = es.pending; es.pending = null; this.executeEnemyAttack(e, pa.atk, pa.tx, pa.ty, pa.ang); }
      return;
    }
    const target = this.pickTarget(e);
    if (!target) {
      // idle wander / leash home
      es.idleT -= dt;
      const dh = dist(e.x, e.y, es.home.x, es.home.y);
      if (dh > 400) es.wander = { ...es.home };
      if (!es.wander && es.idleT <= 0 && this.opts.kind === 'field') { es.wander = { x: es.home.x + this.rng.range(-120, 120), y: es.home.y + this.rng.range(-120, 120) }; es.idleT = this.rng.range(2, 5); }
      if (es.wander) {
        const [nx, ny] = normalize(es.wander.x - e.x, es.wander.y - e.y);
        [e.x, e.y] = moveCircle(this.map, e.x, e.y, e.r, nx * e.speed * 0.5 * dt, ny * e.speed * 0.5 * dt);
        e.facing = Math.atan2(ny, nx);
        if (dist(e.x, e.y, es.wander.x, es.wander.y) < 12) es.wander = null;
      }
      if (dh > 300) e.hp = Math.min(e.maxHp, e.hp + e.maxHp * 0.05 * dt);
      return;
    }
    const d = dist(e.x, e.y, target.x, target.y) - target.r;
    const los = lineOfSight(this.map, e.x, e.y, target.x, target.y);
    // choose attack
    const bossExtra = def.boss && this.diff.extraMechanics.includes('boss_extra') ? 1 : 0;
    if (e.lock <= 0 && los) {
      const ready = def.attacks.filter((a) => (es.cds[a.id] ?? 0) <= 0 && (a.phase ?? 0) <= es.phase + bossExtra && d <= a.range);
      if (ready.length) {
        const atk = ready[ready.length - 1]!;
        this.beginEnemyAttack(e, atk, target);
        return;
      }
    }
    // movement
    let speed = e.speed;
    for (const s of e.statuses) if (s.id === 'slow' || s.id === 'chill') speed *= 1 - clamp(s.power, 0, 0.7);
    const pref = def.preferRange ?? Math.max(30, Math.min(...def.attacks.map((a) => a.range)) * 0.8);
    let mx = 0, my = 0;
    if (def.preferRange && d < pref * 0.6 && los) { [mx, my] = normalize(e.x - target.x, e.y - target.y); }
    else if (d > pref || !los) {
      const walkable = los && clearPath(this.map, e.x, e.y, target.x, target.y, e.r);
      if (walkable) { [mx, my] = normalize(target.x - e.x, target.y - e.y); es.path = null; }
      else {
        es.pathT -= dt;
        if (!es.path || es.pathT <= 0) { es.path = findPath(this.map, e.x, e.y, target.x, target.y, 1800); es.pathT = 0.6; }
        const wp = es.path?.[0];
        if (wp) { if (dist(e.x, e.y, wp[0], wp[1]) < 18) es.path!.shift(); [mx, my] = normalize(wp[0] - e.x, wp[1] - e.y); }
      }
    }
    // separation from other enemies
    for (const o of this.ents.values()) {
      if (o === e || o.team !== e.team || o.kind !== 'enemy') continue;
      const dd = dist2(o.x, o.y, e.x, e.y);
      const rr = (o.r + e.r) * 1.1;
      if (dd < rr * rr && dd > 0.01) { const [sx, sy] = normalize(e.x - o.x, e.y - o.y); mx += sx * 0.6; my += sy * 0.6; }
    }
    [mx, my] = normalize(mx, my);
    if (mx || my) { [e.x, e.y] = moveCircle(this.map, e.x, e.y, e.r, mx * speed * dt, my * speed * dt); }
    e.facing = Math.atan2(target.y - e.y, target.x - e.x);
  }

  private beginEnemyAttack(e: Ent, atk: EnemyAttack, target: Ent) {
    const es = e.e!;
    const windup = atk.windup * this.diff.telegraphSpeed * (es.affixes.includes('hasted') ? 0.8 : 1) * (es.phase >= 2 ? 0.85 : 1);
    es.cds[atk.id] = atk.cooldown;
    const ang = Math.atan2(target.y - e.y, target.x - e.x);
    e.facing = ang;
    e.lock = windup + 0.25;
    es.pending = { atk, t: windup, total: windup, tx: target.x, ty: target.y, ang };
    const pk: Packet = { amount: es.power * atk.dmg, type: atk.type, critChance: 0, critMult: 1, src: e.id, tags: [], status: atk.status };
    // Telegraphs: visible danger zones that resolve when the windup ends.
    if (atk.kind === 'melee') this.areas.push(this.mkArea(e, { x: e.x, y: e.y, r: atk.range + 16, shape: 'cone', ang, arc: (100 * Math.PI) / 180, delay: windup, packet: pk, visual: 'enemy' }));
    else if (atk.kind === 'cleave') this.areas.push(this.mkArea(e, { x: e.x, y: e.y, r: atk.range + 20, shape: 'cone', ang, arc: (150 * Math.PI) / 180, delay: windup, packet: pk, visual: 'enemy' }));
    else if (atk.kind === 'slam') this.areas.push(this.mkArea(e, { x: e.x, y: e.y, r: atk.radius ?? 90, delay: windup, packet: pk, visual: 'enemy' }));
    else if (atk.kind === 'eruption') {
      const n = atk.count ?? 1;
      const players = [...this.ents.values()].filter((o) => o.team !== e.team && !o.dead && dist(o.x, o.y, e.x, e.y) < atk.range + 200);
      for (let i = 0; i < n; i++) {
        const t = i === 0 ? target : players.length ? this.rng.pick(players) : target;
        const jitter = i === 0 ? 0 : 90;
        this.areas.push(this.mkArea(e, { x: t.x + this.rng.range(-jitter, jitter), y: t.y + this.rng.range(-jitter, jitter), r: atk.radius ?? 70, delay: windup + i * 0.15, packet: pk, visual: 'enemy' }));
      }
    } else if (atk.kind === 'eclipse') {
      // Raid mechanic: the whole arena is engulfed except one small circle of light. Players must gather in it.
      const room = this.map.rooms[0];
      const cx = room ? room.cx * TILE : e.x, cy = room ? room.cy * TILE : e.y;
      const a = this.rng.range(0, Math.PI * 2), rr = this.rng.range(120, 300);
      let sx = cx + Math.cos(a) * rr, sy = cy + Math.sin(a) * rr;
      if (circleBlocked(this.map, sx, sy, 20)) { sx = cx; sy = cy; }
      this.areas.push(this.mkArea(e, { x: sx, y: sy, r: atk.radius ?? 150, shape: 'outside', delay: windup, packet: pk, visual: 'enemy_eclipse' }));
      this.events.push({ t: 'msg', text: `${es.def.name} begins a Total Eclipse — get into the circle of light!`, kind: 'warn' });
    } else if (atk.kind === 'charge') {
      const [nx, ny] = normalize(target.x - e.x, target.y - e.y);
      this.areas.push(this.mkArea(e, { x: e.x + nx * atk.range * 0.5, y: e.y + ny * atk.range * 0.5, r: atk.range * 0.5, shape: 'cone', ang, arc: 0.35, delay: windup, packet: null, visual: 'enemy_line' }));
    }
  }

  private executeEnemyAttack(e: Ent, atk: EnemyAttack, tx: number, ty: number, ang: number) {
    const es = e.e!;
    if (atk.kind === 'projectile') {
      const pk: Packet = { amount: es.power * atk.dmg, type: atk.type, critChance: 0, critMult: 1, src: e.id, tags: [], status: atk.status };
      const target = this.pickTarget(e);
      const a = target ? Math.atan2(target.y - e.y, target.x - e.x) : ang;
      const sp = atk.speed ?? 380;
      this.projs.push({ id: this.id(), team: 1, owner: e.id, x: e.x, y: e.y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp, r: 8, range: atk.range + 80, packet: pk, pierce: 0, chain: 0, hit: new Set(), visual: 'enemy_' + atk.type });
    } else if (atk.kind === 'nova') this.enemyNova(e, atk, atk.count ?? 12);
    else if (atk.kind === 'summon' && atk.summon) {
      const live = [...this.ents.values()].filter((o) => o.e && o.e.room === es.room && o.e.def.id === atk.summon).length;
      if (live < 8) for (let i = 0; i < (atk.count ?? 2); i++) {
        const a = this.rng.range(0, Math.PI * 2);
        let x = e.x + Math.cos(a) * 80, y = e.y + Math.sin(a) * 80;
        if (circleBlocked(this.map, x, y, 16)) { x = e.x; y = e.y; }
        const m = this.spawnEnemy(atk.summon, x, y, es.level, false, es.room);
        if (m) { m.e!.awake = true; m.e!.threat = new Map(es.threat); }
      }
    } else if (atk.kind === 'charge') {
      const [nx, ny] = normalize(Math.cos(ang), Math.sin(ang));
      const sp = 750;
      es.charge = { vx: nx * sp, vy: ny * sp, t: atk.range / sp, hit: new Set(), dmg: es.power * atk.dmg, type: atk.type, status: atk.status };
    }
    // melee / cleave / slam / eruption resolve via their telegraph areas
  }

  private enemyNova(e: Ent, atk: EnemyAttack, count: number) {
    const es = e.e!;
    const sp = atk.speed ?? 220;
    const off = this.rng.range(0, Math.PI);
    for (let i = 0; i < count; i++) {
      const a = off + (i / count) * Math.PI * 2;
      this.projs.push({ id: this.id(), team: 1, owner: e.id, x: e.x, y: e.y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp, r: 10, range: atk.range, packet: { amount: es.power * atk.dmg, type: atk.type, critChance: 0, critMult: 1, src: e.id, tags: [] }, pierce: 0, chain: 0, hit: new Set(), visual: 'enemy_orb' });
    }
  }

  private tickProjectiles(dt: number) {
    const keep: Proj[] = [];
    for (const pr of this.projs) {
      const sp = Math.hypot(pr.vx, pr.vy);
      const step = sp * dt;
      pr.x += pr.vx * dt; pr.y += pr.vy * dt; pr.range -= step;
      let alive = pr.range > 0;
      if (alive && this.map && circleBlocked(this.map, pr.x, pr.y, Math.min(pr.r, 6))) {
        alive = false;
        if (pr.explode) this.explode(pr);
      }
      if (alive) {
        for (const o of this.ents.values()) {
          if (o.team === pr.team || o.dead || pr.hit.has(o.id)) continue;
          if (dist2(o.x, o.y, pr.x, pr.y) > (o.r + pr.r) ** 2) continue;
          pr.hit.add(o.id);
          this.applyHit(o, pr.packet);
          if (pr.explode) { this.explode(pr); pr.explode = undefined; }
          if (pr.chain > 0) {
            pr.chain--;
            const owner = this.ents.get(pr.owner);
            let next: Ent | null = null, bd = 260 * 260;
            for (const n of this.ents.values()) {
              if (n.team === pr.team || n.dead || pr.hit.has(n.id) || !owner) continue;
              const dd = dist2(n.x, n.y, pr.x, pr.y);
              if (dd < bd) { bd = dd; next = n; }
            }
            if (next) { const [nx, ny] = normalize(next.x - pr.x, next.y - pr.y); pr.vx = nx * sp; pr.vy = ny * sp; pr.range = 300; continue; }
          }
          if (pr.pierce > 0) { pr.pierce--; continue; }
          alive = false;
          break;
        }
      }
      if (alive) keep.push(pr);
    }
    this.projs = keep;
  }

  private explode(pr: Proj) {
    if (!pr.explode) return;
    const owner = this.ents.get(pr.owner);
    if (!owner) return;
    this.areas.push(this.mkArea(owner, { x: pr.x, y: pr.y, r: pr.explode.radius, packet: pr.explode.packet, visual: pr.explode.packet.type }));
  }

  private tickAreas(dt: number) {
    const keep: Area[] = [];
    for (const a of this.areas) {
      const owner = this.ents.get(a.owner);
      if (a.linger !== undefined) { a.linger -= dt; if (a.linger > 0) keep.push(a); continue; }
      if (a.follow && owner) { a.x = owner.x; a.y = owner.y; }
      if (a.delay > 0) {
        a.delay -= dt;
        // telegraphed enemy attacks are cancelled if the caster dies or is crowd-controlled
        if (a.team === 1 && a.visual.startsWith('enemy') && (!owner || owner.dead || owner.statuses.some((s) => HARD_CC.has(s.id)))) continue;
        if (a.delay > 0) { keep.push(a); continue; }
      }
      if (!a.fired) { a.fired = true; a.tickT = 0; }
      a.tickT -= dt;
      if (a.tickT <= 0) {
        a.tickT += a.tick > 0 ? a.tick : 999;
        if (a.packet) {
          const victims = [...this.ents.values()].filter((o) => o.team !== a.team && !o.dead && this.inArea(a, o));
          for (const v of victims) this.applyHit(v, a.packet);
          if (victims.length && owner?.p) {
            const rd = CLASSES[owner.p.char.cls].resource;
            if (rd.onHitDealt) owner.p.res = Math.min(owner.stats!.maxRes, owner.p.res + rd.onHitDealt);
          }
        }
        if (a.healPct > 0 && owner) for (const ally of this.ents.values()) if (ally.team === a.team && ally.kind === 'player' && !ally.dead && this.inArea(a, ally)) this.heal(owner, ally, ally.maxHp * a.healPct);
        if (a.pull > 0) for (const v of this.hostilesNear(owner ?? ({ team: a.team } as Ent), a.x, a.y, a.r)) if (!v.e?.def.boss) { const [nx, ny] = normalize(a.x - v.x, a.y - v.y); [v.x, v.y] = moveCircle(this.map, v.x, v.y, v.r, nx * a.pull, ny * a.pull); }
      }
      a.dur -= dt;
      if (a.dur > 0) keep.push(a);
      else { a.linger = 0.2; keep.push(a); }
    }
    this.areas = keep;
  }

  inArea(a: Area, o: Ent): boolean {
    const d2 = dist2(a.x, a.y, o.x, o.y);
    if (a.shape === 'outside') return Math.sqrt(d2) + o.r * 0.5 > a.r; // everyone NOT inside the safe circle is hit
    if (d2 > (a.r + o.r) ** 2) return false;
    if (a.shape === 'cone') {
      if (d2 < (o.r + 10) ** 2) return true;
      return Math.abs(angleDiff(a.ang, Math.atan2(o.y - a.y, o.x - a.x))) <= a.arc / 2 + Math.atan2(o.r, Math.sqrt(d2));
    }
    return true;
  }

  // ───────────── Snapshot ─────────────
  snapshotFor(pid: number, radius = 1100) {
    const me = this.ents.get(pid);
    const cx = me?.x ?? this.map.spawn.x, cy = me?.y ?? this.map.spawn.y;
    const r2 = radius * radius;
    const ents: unknown[] = [];
    for (const e of this.ents.values()) {
      if (dist2(e.x, e.y, cx, cy) > r2 && e.id !== pid) continue;
      const pend = e.e?.pending;
      ents.push([
        e.id, e.kind === 'player' ? 0 : e.kind === 'enemy' ? 1 : 2, Math.round(e.x), Math.round(e.y), Math.round(e.facing * 100) / 100, Math.ceil(e.hp), e.maxHp, Math.round(e.barrier),
        e.p ? e.p.char.cls : e.e ? e.e.def.id : e.mi!.type, e.name, e.level, e.statuses.map((s) => s.id).filter((v, i, a) => a.indexOf(v) === i).join(','),
        e.e ? (e.e.elite ? 1 : 0) | (e.e.def.boss ? 2 : 0) : 0, pend ? Math.round((1 - pend.t / pend.total) * 100) / 100 : 0, e.dead ? 1 : 0,
        Math.round((e.buffs.reduce((s, b) => s + (b.mods.find((m) => m.stat === 'sizePct')?.value ?? 0), 0))) || 0,
        e.e?.affixes.join(',') ?? '', e.e ? Math.round((e.e.breakG / (e.e.breakMax || 1)) * 100) / 100 : 0, e.e?.phase ?? 0, e.invuln > 0 || !!e.dash ? 1 : 0, e.p?.aura ?? '', e.p?.pet ?? '',
      ]);
    }
    const projs = this.projs.filter((p) => dist2(p.x, p.y, cx, cy) < r2).map((p) => [p.id, Math.round(p.x), Math.round(p.y), Math.round(p.vx), Math.round(p.vy), p.r, p.visual, p.team]);
    const areas = this.areas.filter((a) => dist2(a.x, a.y, cx, cy) < r2 * 1.2).map((a) => [a.id, Math.round(a.x), Math.round(a.y), Math.round(a.r), a.shape === 'cone' ? 1 : a.shape === 'outside' ? 2 : 0, Math.round(a.ang * 100) / 100, Math.round(a.arc * 100) / 100, Math.round(a.delay * 100) / 100, Math.round(a.delayTotal * 100) / 100, a.team, a.visual, Math.round(a.dur * 10) / 10, a.fired ? 1 : 0]);
    const drops = this.drops.filter((d) => d.owner === pid).map((d) => [d.id, Math.round(d.x), Math.round(d.y), d.item?.rarity ?? 'gold', d.item?.name ?? `${d.gold} gold`]);
    let self: unknown = null;
    if (me?.p && me.stats) {
      const p = me.p;
      const lo = p.char.loadout;
      self = {
        id: me.id, res: Math.round(p.res), maxRes: me.stats.maxRes, sec: Math.round(p.sec * 10) / 10, secMax: me.stats.secMax,
        cdA: lo.active.map((s) => (s ? Math.round((p.cds[s] ?? 0) * 10) / 10 : 0)), cdU: lo.ultimate.map((s) => (s ? Math.round((p.cds[s] ?? 0) * 10) / 10 : 0)),
        dodge: Math.round(p.dodgeCd * 10) / 10, potCd: Math.round(p.potionCd * 10) / 10, potions: p.char.potions, buffs: me.buffs.map((b) => [b.name, Math.round(b.t * 10) / 10]),
        target: p.targetId, ack: p.lastSeq, deadT: me.dead ? (this.opts.noRespawn ? -2 : Math.max(0, Math.round(p.deadT * 10) / 10)) : -1, lock: Math.round(me.lock * 100) / 100,
      };
    }
    return { time: Math.round(this.time * 1000), ents, projs, areas, drops, self };
  }

  /** Interactables nearest a player within reach. */
  interactableNear(pid: number, reach = 100) {
    const e = this.ents.get(pid);
    if (!e) return null;
    let best = null, bd = reach * reach;
    for (const it of this.map.interactables) {
      if (it.used) continue;
      const d = dist2(it.x, it.y, e.x, e.y);
      if (d < bd) { bd = d; best = it; }
    }
    return best;
  }

  roomOf(pid: number) {
    const e = this.ents.get(pid);
    return e ? roomAt(this.map, e.x, e.y) : undefined;
  }

  applyBlessing(pid: number, blessingId: string): string | null {
    const e = this.ents.get(pid);
    const b = BLESSING_MAP[blessingId];
    if (!e?.p || !b) return 'Invalid blessing';
    e.p.blessings.push(b.id);
    e.p.runMods.push(...b.mods);
    e.p.lootBonus += b.loot ?? 0;
    e.dirty = true;
    return null;
  }
}
