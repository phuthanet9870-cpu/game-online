/**
 * Server-side combat resolution: skill validation, hit detection (with lag
 * compensation for instant attacks), damage, status effects, kills, rewards.
 */
import { shapeHits, rollDamage, type AttackerStats, type DefenderStats } from '../shared/combat.ts';
import type { DamageStat, Element, SkillDef, SkillEffect, SkillStat } from '../shared/config/skills.ts';
import { PROGRESSION, levelDiffMult } from '../shared/config/progression.ts';
import type { MonsterAttack } from '../shared/config/monsters.ts';
import { STAT_CONFIG } from '../shared/config/stats.ts';
import { angleBetween, normalize } from '../shared/math.ts';
import { isBlocked } from '../shared/mapgen.ts';
import { moveWithCollision } from '../shared/movement.ts';
import { ANIM } from '../shared/protocol.ts';
import type { Combatant, MonsterEntity, PlayerEntity } from './entities.ts';
import type { Zone } from './zone.ts';
import { addMastery, deathPenalty, grantExp, masteryDamageMult } from './progression.ts';
import { rollLoot } from './loot.ts';
import { recomputeStats } from './playerStats.ts';
import { AUTO_CONFIG } from '../shared/config/auto.ts';
import { stopAuto } from './autofarm.ts';
import { addPowerMastery, applyCasterEffects, applyPowerTargetEffects, chainFrom, healPlayer, powerDamageMult, trueDamage } from './powers.ts';
import { POWER_CONFIG } from '../shared/config/powers.ts';

const KNOCKBACK_TIME = 0.18;

export interface HitOptions {
  mult: number;
  flat: number;
  stat: SkillStat;
  element: Element;
  effects: SkillEffect[];
  skill: SkillDef | null;
}

function cooldownFor(p: PlayerEntity, skill: SkillDef): number {
  if (skill.type === 'normal') return skill.cooldown / Math.max(0.1, p.stats.atkSpd);
  return skill.cooldown * (1 - p.stats.cdr);
}

/** Validate and start a player action. Returns false if rejected. */
export function tryCast(z: Zone, p: PlayerEntity, skill: SkillDef, aimX: number, aimY: number, viewTick: number): boolean {
  const t = z.time;
  if (p.dead || p.ms.rootT > 0 || p.ms.forceT > 0 || p.ms.dodgeT > 0) return false;
  if (t < p.actionLockUntil) return false;
  if (!p.weapon) return false;
  const isPower = skill.type.startsWith('power');
  if (isPower ? !p.power : skill.weapon !== p.weapon.type) return false;
  if (p.rec.level < skill.unlockLevel) return false;
  const free = p.gm && p.gmFlags.nocd;
  if (!free && (p.cooldowns.get(skill.id) ?? 0) > t) return false;
  if (!free && (p.energy < skill.energyCost || p.ms.stamina < skill.staminaCost)) return false;
  const aim = normalize(aimX, aimY);
  if (aim.x === 0 && aim.y === 0) return false;
  const blink = skill.effects.find((e): e is Extract<SkillEffect, { kind: 'blink_behind' }> => e.kind === 'blink_behind');
  if (blink && !blinkTarget(z, p, aim.x, aim.y, blink)) return false; // no valid target: nothing is spent

  if (!free) p.energy -= skill.energyCost;
  if (skill.staminaCost > 0 && !free) {
    p.ms.stamina -= skill.staminaCost;
    p.ms.staminaDelay = STAT_CONFIG.regen.staminaDelayAfterUse;
  }
  if (!free) p.cooldowns.set(skill.id, t + cooldownFor(p, skill));
  const anim = skill.type === 'normal' ? skill.animTime / Math.max(0.1, p.stats.atkSpd) : skill.animTime;
  p.actionLockUntil = t + anim;
  p.ms.animT = anim;
  p.ms.animMoveMult = skill.moveMultDuringAnim;
  p.anim = skill.type === 'normal' ? ANIM.ATTACK : skill.type === 'heavy' ? ANIM.HEAVY : ANIM.SKILL;
  p.animUntil = t + Math.max(anim, 0.2);

  if (skill.damage) p.stealthUntil = 0; // attacking reveals you
  if (isPower && addPowerMastery(p, POWER_CONFIG.mastery.xpPerCast)) p.session?.send({ t: 'notice', kind: 'level', text: `Power Mastery ${p.power!.nameTh} Lv.${p.rec.powers.owned.find((o) => o.id === p.power!.id)?.masteryLevel}` });
  if (isPower) z.host.onPowersChanged(p);
  let mult = (skill.damage?.mult ?? 0) * (isPower ? powerDamageMult(p, skill) : masteryDamageMult(p.rec, p.weapon.type)) * skill.pveMult;
  if (skill.type === 'normal') {
    const w = p.weapon.combo;
    p.combo = t - p.lastNormalAt <= w.window ? (p.combo % w.hits) + 1 : 1;
    p.lastNormalAt = t;
    if (p.combo === w.hits) mult *= w.finisherMult;
  } else p.combo = 0;

  z.emit({ e: 'act', s: p.id, a: skill.id, x: aim.x, y: aim.y }, p.ms.x, p.ms.y);

  if (skill.castTime > 0) {
    const zoneId = z.def.id;
    z.schedule(t + skill.castTime, () => {
      // interrupted by death, stun or zone change
      if (p.dead || p.ms.rootT > 0 || p.rec.zoneId !== zoneId || !z.players.has(p.id)) return;
      resolveSkill(z, p, skill, aim.x, aim.y, mult, null);
    });
  } else {
    resolveSkill(z, p, skill, aim.x, aim.y, mult, viewTick);
  }
  return true;
}

type Eff<K extends SkillEffect['kind']> = Extract<SkillEffect, { kind: K }>;
const findEff = <K extends SkillEffect['kind']>(skill: SkillDef, k: K) => skill.effects.find((e): e is Eff<K> => e.kind === k);

/** Nearest living monster inside the aim cone (for Shadow Step). */
export function blinkTarget(z: Zone, p: PlayerEntity, ax: number, ay: number, ef: Eff<'blink_behind'>): MonsterEntity | null {
  let best: MonsterEntity | null = null, bd = Infinity;
  for (const e of z.nearby(p.ms.x, p.ms.y, ef.range + 1)) {
    if (e.kind !== 2 || e.state === 'dead' || e.state === 'return') continue;
    const d = Math.hypot(e.x - p.ms.x, e.y - p.ms.y);
    if (d > ef.range || d < 0.05) continue;
    if (angleBetween(ax, ay, e.x - p.ms.x, e.y - p.ms.y) > (ef.coneDeg * Math.PI) / 360) continue;
    if (d < bd) { bd = d; best = e; }
  }
  return best;
}

function resolveSkill(z: Zone, p: PlayerEntity, skill: SkillDef, ax: number, ay: number, mult: number, viewTick: number | null) {
  const t = z.time;
  const shape = skill.shape;
  const hitOpts = (m: number): HitOptions => ({
    mult: m, flat: skill.damage?.flat ?? 0, stat: skill.damage?.stat ?? 'patk', element: skill.element, effects: skill.effects, skill,
  });

  const consume = findEff(skill, 'consume_charge');
  if (consume && p.charges > 0) { mult *= 1 + p.charges * consume.multPer; p.charges = 0; }
  if (skill.type.startsWith('power')) applyCasterEffects(z, p, skill, ax, ay, mult);
  if (findEff(skill, 'blink') && shape.kind !== 'self') { ax = p.facingX; ay = p.facingY; viewTick = null; }

  if (shape.kind === 'self') {
    for (const ef of skill.effects) {
      if (ef.kind === 'shield') {
        p.shield = p.stats.hp * ef.hpFraction + p.stats[ef.stat] * ef.statMult;
        p.shieldUntil = t + ef.duration;
      } else if (ef.kind === 'counter') {
        p.counterUntil = t + ef.window;
      } else if (ef.kind === 'buff_dr') {
        p.drAmount = ef.amount;
        p.drUntil = t + ef.duration;
        p.superArmorUntil = ef.superArmor ? t + ef.duration : p.superArmorUntil;
      }
    }
    return;
  }

  const backdash = findEff(skill, 'backdash');
  if (backdash) {
    const probe = { x: p.ms.x, y: p.ms.y };
    moveWithCollision(z.map, probe, -ax * backdash.distance, -ay * backdash.distance, p.radius);
    const d = Math.hypot(probe.x - p.ms.x, probe.y - p.ms.y);
    p.ms.forceT = backdash.duration;
    p.ms.fvx = (-ax * d) / backdash.duration;
    p.ms.fvy = (-ay * d) / backdash.duration;
    p.iframesUntil = Math.max(p.iframesUntil, t + backdash.duration);
  }

  if (shape.kind === 'projectile') {
    const spread = findEff(skill, 'spread');
    const n = spread ? spread.count : 1;
    const step = spread && n > 1 ? (spread.angleDeg * Math.PI) / 180 / (n - 1) : 0;
    const base = Math.atan2(ay, ax) - (step * (n - 1)) / 2;
    for (let i = 0; i < n; i++) {
      const a = base + step * i, dx = Math.cos(a), dy = Math.sin(a);
      const pr = {
        id: z.host.nextId(), ownerId: p.id, ownerKind: 1 as const, x: p.ms.x + dx * 0.4, y: p.ms.y + dy * 0.4,
        vx: dx * shape.speed, vy: dy * shape.speed, radius: shape.radius, remaining: shape.range, pierce: shape.pierce,
        hit: new Set<number>(), hits: 'monsters' as const, skill, damageMult: mult, element: skill.element, effects: skill.effects,
      };
      z.projectiles.push(pr);
      z.emit({ e: 'proj', id: pr.id, s: p.id, x: pr.x, y: pr.y, vx: pr.vx, vy: pr.vy, r: pr.radius, life: shape.range / shape.speed, fx: skill.vfx }, p.ms.x, p.ms.y);
    }
    return;
  }

  const trap = findEff(skill, 'trap');
  if (trap && shape.kind === 'circle') {
    const probe = { x: p.ms.x, y: p.ms.y };
    moveWithCollision(z.map, probe, ax * shape.forward, ay * shape.forward, 0.2); // traps can't be placed through walls
    z.placeTrap(p, probe.x, probe.y, trap, skill, mult);
    return;
  }

  const blink = findEff(skill, 'blink_behind');
  if (blink) {
    const target = blinkTarget(z, p, ax, ay, blink);
    if (!target) return;
    const dir = normalize(target.x - p.ms.x, target.y - p.ms.y);
    const behind = { x: target.x + dir.x * (target.radius + 0.6), y: target.y + dir.y * (target.radius + 0.6) };
    const free = (x: number, y: number) => !isBlocked(z.map, x - p.radius, y - p.radius) && !isBlocked(z.map, x + p.radius, y - p.radius) && !isBlocked(z.map, x - p.radius, y + p.radius) && !isBlocked(z.map, x + p.radius, y + p.radius);
    if (free(behind.x, behind.y)) { p.ms.x = behind.x; p.ms.y = behind.y; }
    ax = -dir.x; ay = -dir.y;
    p.facingX = ax; p.facingY = ay;
    p.iframesUntil = Math.max(p.iframesUntil, t + 0.2);
    viewTick = null; // we moved: use current positions
  }

  const ox = p.ms.x, oy = p.ms.y;
  let effShape = shape;
  const dash = findEff(skill, 'dash');
  if (dash) {
    // collision-checked dash: the hit line only covers the distance actually travelled
    const probe = { x: ox, y: oy };
    moveWithCollision(z.map, probe, ax * dash.distance, ay * dash.distance, p.radius);
    const travelled = Math.hypot(probe.x - ox, probe.y - oy);
    if (shape.kind === 'line') effShape = { ...shape, length: Math.max(1, travelled + 0.5) };
    p.ms.forceT = dash.duration;
    p.ms.fvx = (ax * travelled) / dash.duration;
    p.ms.fvy = (ay * travelled) / dash.duration;
    p.iframesUntil = Math.max(p.iframesUntil, t + dash.duration);
  }

  const hits = findEff(skill, 'multi')?.hits ?? 1;
  const chain = findEff(skill, 'chain');
  const reach = effShape.kind === 'arc' ? effShape.range : effShape.kind === 'circle' ? effShape.radius + effShape.forward : effShape.kind === 'line' ? effShape.length : 0;
  for (const e of z.nearby(ox, oy, reach + 2)) {
    if (e.kind !== 2 || e.state === 'dead') continue;
    const pos = viewTick !== null ? z.rewoundPos(e.id, viewTick) ?? [e.x, e.y] : [e.x, e.y];
    if (!shapeHits(effShape, ox, oy, ax, ay, pos[0], pos[1], e.radius)) continue;
    if (!skill.damage) { applyEffects(z, p, e, skill.effects); continue; } // control-only shapes (e.g. Smoke Veil)
    for (let h = 0; h < hits && (e.state as string) !== 'dead'; h++) dealDamage(z, p, e, hitOpts(mult));
    if (chain && (e.state as string) !== 'dead') chainFrom(z, p, e, skill, mult, chain.jumps, chain.range);
  }
}

function attackerStats(src: Combatant, statIn: SkillStat): AttackerStats {
  if (src.kind === 1) {
    const s = src.stats;
    const stat: DamageStat = statIn === 'weapon' ? src.weapon?.damageStat ?? 'patk' : statIn;
    return { atk: s[stat], critRate: s.critRate, critDmg: s.critDmg, accuracy: s.accuracy, armorPen: s.armorPen, bossDmg: s.bossDmg };
  }
  return { atk: src.atk, critRate: 0.05, critDmg: 1.5, accuracy: 0.95, armorPen: 0 };
}

function isInvulnerable(z: Zone, tgt: Combatant): boolean {
  if (tgt.kind === 1) return tgt.dead || z.def.safe || z.time < tgt.iframesUntil || (tgt.gm && tgt.gmFlags.god);
  return tgt.state === 'dead' || tgt.state === 'return';
}

/** Apply one hit from src to tgt. Returns damage dealt (0 on miss/immune). */
export function dealDamage(z: Zone, src: Combatant, tgt: Combatant, o: HitOptions): number {
  const t = z.time;
  const tpos = tgt.kind === 1 ? tgt.ms : tgt;
  const spos = src.kind === 1 ? src.ms : src;
  if (isInvulnerable(z, tgt)) {
    z.emit({ e: 'hit', s: src.id, t: tgt.id, d: 0, c: 0, m: 1 }, tpos.x, tpos.y);
    return 0;
  }

  // Guard Counter: negate the hit and strike back
  if (tgt.kind === 1 && src.kind === 2 && t < tgt.counterUntil && tgt.weapon) {
    tgt.counterUntil = 0;
    const counter = tgt.weapon.skills.flatMap((s) => s.effects).find((e): e is Extract<SkillEffect, { kind: 'counter' }> => e.kind === 'counter');
    z.emit({ e: 'counter', id: tgt.id }, tpos.x, tpos.y);
    if (counter) {
      const cs = tgt.weapon.skills.find((s) => s.effects.some((e) => e.kind === 'counter'))!;
      for (const e of z.nearby(tpos.x, tpos.y, counter.range + 1)) {
        if (e.kind !== 2 || e.state === 'dead') continue;
        if ((e.x - tpos.x) ** 2 + (e.y - tpos.y) ** 2 > (counter.range + e.radius) ** 2) continue;
        dealDamage(z, tgt, e, { mult: counter.damageMult * masteryDamageMult(tgt.rec, tgt.weapon.type), flat: cs.damage?.flat ?? 0, stat: 'patk', element: 'none', effects: [{ kind: 'stun', duration: counter.stunDuration }], skill: cs });
      }
    }
    return 0;
  }

  const a = attackerStats(src, o.stat);
  const physical = src.kind === 1 ? (o.stat === 'weapon' ? src.weapon?.damageStat ?? 'patk' : o.stat) === 'patk' : src.def.damageType === 'physical';
  const d: DefenderStats = tgt.kind === 1
    ? { def: physical ? tgt.stats.pdef : tgt.stats.mdef, evasion: tgt.stats.evasion, pvpDR: tgt.stats.pvpDR }
    : { def: tgt.defense, evasion: 0.02, resist: tgt.def.resist, isBoss: tgt.def.tier === 'map_boss' || tgt.def.tier === 'world_boss' };

  let reduction = 0;
  if (tgt.kind === 1 && tgt.blocking && tgt.weapon) {
    const facing = angleBetween(tgt.facingX, tgt.facingY, spos.x - tpos.x, spos.y - tpos.y);
    if (facing <= (tgt.weapon.defensive.arcDeg * Math.PI) / 360) reduction = tgt.weapon.defensive.damageReduction;
  }
  if (tgt.kind === 1 && t < tgt.drUntil) reduction += tgt.drAmount;
  d.damageReduction = reduction;
  let mult = o.mult;
  const bs = o.effects.find((e): e is Extract<SkillEffect, { kind: 'backstab' }> => e.kind === 'backstab');
  if (bs) {
    const tf = tgt.kind === 1 ? { x: tgt.facingX, y: tgt.facingY } : { x: tgt.facingX, y: tgt.facingY };
    if (angleBetween(tf.x, tf.y, spos.x - tpos.x, spos.y - tpos.y) > (110 * Math.PI) / 180) mult *= bs.mult;
  }
  // ---- The Power modifiers (player -> monster)
  if (src.kind === 1 && tgt.kind === 2) {
    const mods = src.powerMods;
    const hpFrac = tgt.hp / tgt.maxHp;
    const controlled = t < tgt.stunUntil || t < tgt.rootUntil;
    for (const ef of o.effects) {
      if (ef.kind === 'execute' && hpFrac < ef.threshold) mult *= ef.mult;
      if (ef.kind === 'shatter' && controlled) mult *= ef.mult;
      if (ef.kind === 'pierce_def') a.armorPen = Math.min(1, a.armorPen + ef.amount);
    }
    if (mods.lowHpBonus && hpFrac < 0.5) mult *= 1 + mods.lowHpBonus;
    if (mods.shatterBonus && controlled) mult *= 1 + mods.shatterBonus;
    if (mods.elementBonus && src.power && o.element === src.power.element) mult *= 1 + mods.elementBonus;
    if (t < tgt.vulnUntil) mult *= 1 + tgt.vulnAmount;
  }

  const roll = rollDamage(a, d, mult, o.flat, o.element, 'pve', () => z.rng());
  if (roll.miss) {
    z.emit({ e: 'hit', s: src.id, t: tgt.id, d: 0, c: 0, m: 1 }, tpos.x, tpos.y);
    return 0;
  }
  let amount = roll.amount;
  if (tgt.kind === 1 && tgt.shield > 0) {
    const absorbed = Math.min(tgt.shield, amount);
    tgt.shield -= absorbed;
    amount -= absorbed;
  }
  tgt.hp -= amount;
  // cheat death (Phoenix Rebirth / Life Miracle)
  if (tgt.kind === 1 && tgt.hp <= 0 && tgt.cheatDeath && tgt.cheatDeath.until > t) {
    tgt.hp = Math.max(1, tgt.stats.hp * tgt.cheatDeath.hpPct);
    tgt.cheatDeath = null;
    z.emit({ e: 'heal', t: tgt.id, v: Math.round(tgt.hp) }, tpos.x, tpos.y);
    z.emit({ e: 'counter', id: tgt.id }, tpos.x, tpos.y);
  }
  z.emit({ e: 'hit', s: src.id, t: tgt.id, d: roll.amount, c: roll.crit ? 1 : 0, m: 0 }, tpos.x, tpos.y);

  if (src.kind === 1) {
    src.lastCombatAt = t;
    if (src.weapon && addMastery(src.rec, src.weapon.type, PROGRESSION.weaponMastery.xpPerHit)) {
      src.charDirty = true;
      src.session?.send({ t: 'notice', kind: 'level', text: `Weapon Mastery ${src.weapon.name} Lv.${src.rec.mastery[src.weapon.type]?.level}` });
    }
  }
  if (tgt.kind === 2) {
    if (src.kind === 1) tgt.threat.set(src.id, (tgt.threat.get(src.id) ?? 0) + roll.amount);
    tgt.lastHitAt = t;
    if (tgt.state === 'idle' || tgt.state === 'patrol') { tgt.state = 'chase'; tgt.targetId = src.id; }
  } else {
    tgt.lastCombatAt = t;
  }

  applyEffects(z, src, tgt, o.effects);
  if (src.kind === 1 && tgt.kind === 2) {
    applyPowerTargetEffects(z, src, tgt, o.effects);
    for (const proc of src.powerOnHit) if (z.rng() < proc.chance) applyPowerTargetEffects(z, src, tgt, proc.effects);
    const ls = o.effects.find((e): e is Extract<SkillEffect, { kind: 'lifesteal' }> => e.kind === 'lifesteal');
    if (ls) healPlayer(z, src, roll.amount * ls.fraction);
  }
  // Thorn Armor style reflect
  if (tgt.kind === 1 && src.kind === 2 && tgt.reflect && tgt.reflect.until > t && amount > 0) trueDamage(z, tgt, src, amount * tgt.reflect.fraction);

  if (tgt.hp <= 0 && (tgt.kind === 1 || tgt.state !== 'dead')) {
    if (tgt.kind === 2) killMonster(z, tgt);
    else killPlayer(z, tgt);
  }
  return roll.amount;
}

function applyEffects(z: Zone, src: Combatant, tgt: Combatant, effects: SkillEffect[]) {
  const t = z.time;
  const spos = src.kind === 1 ? src.ms : src;
  const tpos = tgt.kind === 1 ? tgt.ms : tgt;
  for (const ef of effects) {
    if (tgt.kind === 1 && t < tgt.superArmorUntil && (ef.kind === 'stun' || ef.kind === 'knockback' || ef.kind === 'root')) continue;
    const cc = src.kind === 1 ? 1 + (src.powerMods.ccBonus ?? 0) : 1;
    if (ef.kind === 'root') {
      if (tgt.kind === 2) tgt.rootUntil = Math.max(tgt.rootUntil, t + ef.duration * cc * (tgt.def.tier === 'normal' ? 1 : 0.4));
      else tgt.ms.rootT = Math.max(tgt.ms.rootT, ef.duration * (1 - tgt.stats.ccRes));
    } else if (ef.kind === 'stun') {
      if (tgt.kind === 2) {
        const resist = tgt.def.tier === 'normal' ? 1 : 0.4; // elites shrug off CC faster
        tgt.stunUntil = Math.max(tgt.stunUntil, t + ef.duration * resist * cc);
        tgt.windup = null;
        if (tgt.state === 'windup') tgt.state = 'chase';
      } else {
        tgt.ms.rootT = Math.max(tgt.ms.rootT, ef.duration * (1 - tgt.stats.ccRes));
      }
    } else if (ef.kind === 'knockback') {
      const dir = normalize(tpos.x - spos.x, tpos.y - spos.y);
      const dist = tgt.kind === 2 && tgt.def.tier !== 'normal' ? ef.distance * 0.3 : ef.distance;
      if (tgt.kind === 2) {
        tgt.forceUntil = t + KNOCKBACK_TIME;
        tgt.fvx = (dir.x * dist) / KNOCKBACK_TIME; tgt.fvy = (dir.y * dist) / KNOCKBACK_TIME;
      } else {
        const d2 = dist * (1 - tgt.stats.ccRes);
        tgt.ms.forceT = KNOCKBACK_TIME; tgt.ms.fvx = (dir.x * d2) / KNOCKBACK_TIME; tgt.ms.fvy = (dir.y * d2) / KNOCKBACK_TIME;
      }
    } else if (ef.kind === 'slow') {
      if (tgt.kind === 2) { tgt.slowUntil = t + ef.duration; tgt.slowMult = ef.mult; }
      else { tgt.ms.slowT = ef.duration * (1 - tgt.stats.ccRes); tgt.ms.slowMult = ef.mult; }
    }
  }
}

/** Monster attack lands on the given players. */
export function resolveMonsterAttack(z: Zone, m: MonsterEntity, targets: PlayerEntity[], mult: number, effects: SkillEffect[]) {
  for (const p of targets) dealDamage(z, m, p, { mult, flat: 0, stat: 'patk', element: m.def.element, effects, skill: null });
}

export function attackEffects(a: MonsterAttack): SkillEffect[] {
  const out: SkillEffect[] = [];
  if (a.kind === 'melee' && a.knockback > 0) out.push({ kind: 'knockback', distance: a.knockback });
  if (a.kind === 'aoe' && a.slow) out.push({ kind: 'slow', mult: a.slow.mult, duration: a.slow.duration });
  return out;
}

export function killMonster(z: Zone, m: MonsterEntity) {
  const t = z.time;
  m.hp = 0;
  m.state = 'dead';
  m.windup = null;
  m.anim = ANIM.DEAD;
  m.respawnAt = t + m.def.respawnSec;
  z.emit({ e: 'die', id: m.id }, m.x, m.y);

  let total = 0, topId: number | null = null, topDmg = 0;
  for (const [pid, dmg] of m.threat) { total += dmg; if (dmg > topDmg) { topDmg = dmg; topId = pid; } }
  const top = topId !== null ? z.players.get(topId) : undefined;
  let rewardMult = 1;

  for (const [pid, dmg] of m.threat) {
    const p = z.players.get(pid);
    if (!p || p.dead || total <= 0) continue;
    // farming soft cap (anti-bot): track kills per rolling hour
    p.killTimes.push(t);
    while (p.killTimes.length && p.killTimes[0] < t - 3600) p.killTimes.shift();
    const over = p.killTimes.length > PROGRESSION.farming.killsPerHourSoftCap;
    const capMult = over ? PROGRESSION.farming.overCapRewardMult : 1;
    if (p === top) rewardMult = capMult * (p.auto && m.def.tier === 'elite' ? AUTO_CONFIG.eliteRewardMult : 1);
    if (p.auto) { p.auto.kills++; p.autoKillTimes.push(t); while (p.autoKillTimes.length && p.autoKillTimes[0] < t - 3600) p.autoKillTimes.shift(); }
    const share = Math.max(0.25, Math.min(1, (dmg / total) * 1.5));
    const exp = m.exp * share * levelDiffMult(p.rec.level, m.level) * capMult * z.host.rates.exp;
    const res = grantExp(p.rec, exp);
    if (p.weapon) addMastery(p.rec, p.weapon.type, PROGRESSION.weaponMastery.xpPerKill);
    if (p.power) { addPowerMastery(p, POWER_CONFIG.mastery.xpPerKill); z.host.onPowersChanged(p); }
    if (p.powerMods.healOnKill) healPlayer(z, p, p.stats.hp * p.powerMods.healOnKill);
    p.charDirty = true;
    p.dirty = true;
    if (res.levelsGained > 0) {
      recomputeStats(p);
      p.hp = p.stats.hp;
      p.energy = p.stats.energy;
      z.emit({ e: 'lvl', id: p.id, lvl: p.rec.level }, p.ms.x, p.ms.y);
      z.invalidateMeta(p.id);
      p.session?.send({ t: 'notice', kind: 'level', text: `LEVEL UP! Lv.${p.rec.level}` });
      z.host.requestSave(p, 'level_up');
    }
  }

  const loot = rollLoot(m.def, m.level, () => z.rng(), rewardMult * z.host.rates.drop, rewardMult * z.host.rates.gold);
  const owner = top?.rec.id ?? null;
  for (const it of loot.items) z.createDrop(m.x, m.y, it, 0, owner);
  if (loot.gold > 0) z.createDrop(m.x, m.y, null, loot.gold, owner);
  if (top && loot.items.length) z.host.audit(top, 'loot_roll', { monster: m.def.id, items: loot.items.map((i) => [i.defId, i.qty, i.rarity, i.uid]), gold: loot.gold });
  m.threat.clear();
}

export function killPlayer(z: Zone, p: PlayerEntity) {
  if (p.dead) return;
  p.hp = 0;
  p.dead = true;
  p.shield = 0;
  p.blocking = false;
  p.anim = ANIM.DEAD;
  p.ms.dodgeT = 0; p.ms.forceT = 0;
  stopAuto(p, 'ตัวละครตาย');
  p.summons = [];
  p.charges = 0;
  const lost = deathPenalty(p.rec);
  p.charDirty = true;
  p.dirty = true;
  z.emit({ e: 'die', id: p.id }, p.ms.x, p.ms.y);
  p.session?.send({ t: 'notice', kind: 'warn', text: `คุณถูกสังหาร (เสีย EXP ${lost})` });
  for (const m of z.monsters.values()) if (m.targetId === p.id) { m.targetId = null; m.threat.delete(p.id); }
}

