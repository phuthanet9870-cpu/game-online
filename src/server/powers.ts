/**
 * The Power — server runtime: deriving the active power from the record,
 * passive stats, buffs, damage-over-time, zones, summons, frost/charge
 * mechanics, and the Power transactions (exchange, awakening, loadout, ritual).
 */
import { POWERS, POWER_CONFIG, getPower, masteryXpToNext, powerAllowsWeapon, unlockedAbilities, type PassiveMods, type PowerDef } from '../shared/config/powers.ts';
import type { SkillDef, SkillEffect } from '../shared/config/skills.ts';
import { STAT_KEYS, type StatKey, type Stats } from '../shared/config/stats.ts';
import { moveWithCollision } from '../shared/movement.ts';
import { applyCaps } from '../shared/stats.ts';
import { normalize } from '../shared/math.ts';
import type { MonsterEntity, PlayerEntity, PowerZone } from './entities.ts';
import type { OwnedPower, PowerLoadout } from './storage/types.ts';
import type { Zone } from './zone.ts';
import { dealDamage, killMonster } from './combat.ts';

export const POWER_BITS = [128, 256, 512, 1024, 2048] as const;
export const ULT_BIT = 4096;

export function ownedPower(p: PlayerEntity, id: string): OwnedPower | undefined {
  return p.rec.powers.owned.find((o) => o.id === id);
}

/** Recompute p.power / passive mods from the record (call after equip/ritual/awaken/loadout). */
export function refreshPower(p: PlayerEntity) {
  const ps = p.rec.powers;
  const def = getPower(ps.active);
  p.power = def && powerAllowsWeapon(def, p.weapon?.type) ? def : null;
  p.powerMods = {};
  p.powerOnHit = [];
  if (!p.power) return;
  const lo = ps.loadouts[p.power.id];
  const own = ownedPower(p, p.power.id);
  if (!lo || !own) return;
  const unlocked = new Set(unlockedAbilities(p.power, own.awakening).passives.map((x) => x.id));
  for (const pid of lo.passives) {
    const pas = p.power.passives.find((x) => x.id === pid);
    if (!pas || !unlocked.has(pas.id)) continue;
    for (const [k, v] of Object.entries(pas.mods ?? {}) as [keyof PassiveMods, number][]) p.powerMods[k] = (p.powerMods[k] ?? 0) + v;
    if (pas.onHit) p.powerOnHit.push(pas.onHit);
  }
}

/** Passive stat bonuses of the active power + active buffs, applied on top of base stats. */
export function applyPowerStats(p: PlayerEntity, s: Stats, now: number): Stats {
  const base = { ...s };
  const add = (k: string, v: number) => { if ((STAT_KEYS as readonly string[]).includes(k)) s[k as StatKey] += v; };
  const pct = (k: string, v: number) => { if ((STAT_KEYS as readonly string[]).includes(k)) s[k as StatKey] += base[k as StatKey] * v; };
  if (p.power) {
    const lo = p.rec.powers.loadouts[p.power.id];
    const own = ownedPower(p, p.power.id);
    if (lo && own) {
      const unlocked = new Set(unlockedAbilities(p.power, own.awakening).passives.map((x) => x.id));
      for (const pid of lo.passives) {
        const pas = p.power.passives.find((x) => x.id === pid);
        if (!pas || !unlocked.has(pas.id)) continue;
        for (const [k, v] of Object.entries(pas.stats ?? {})) add(k, v as number);
        for (const [k, v] of Object.entries(pas.statsPct ?? {})) pct(k, v as number);
      }
    }
  }
  for (const b of p.buffs) {
    if (b.until <= now) continue;
    for (const [k, v] of Object.entries(b.stats ?? {})) add(k, v as number);
    for (const [k, v] of Object.entries(b.statsPct ?? {})) pct(k, v as number);
  }
  return applyCaps(s);
}

/** Is this skill usable by the player right now (power side checks)? */
export function powerSkillFor(p: PlayerEntity, slot: number): SkillDef | null {
  if (!p.power) return null;
  const lo = p.rec.powers.loadouts[p.power.id];
  const own = ownedPower(p, p.power.id);
  if (!lo || !own) return null;
  const id = slot === -1 ? lo.ult : lo.actives[slot];
  if (!id) return null;
  const un = unlockedAbilities(p.power, own.awakening);
  return (slot === -1 ? un.ultimates : un.actives).find((x) => x.id === id) ?? null;
}

export function powerDamageMult(p: PlayerEntity, skill: SkillDef | null): number {
  if (!skill || !p.power || !skill.type.startsWith('power')) return 1;
  const own = ownedPower(p, p.power.id);
  return 1 + (own?.masteryLevel ?? 0) * POWER_CONFIG.mastery.damagePerLevel;
}

export function addPowerMastery(p: PlayerEntity, xp: number): boolean {
  if (!p.power) return false;
  const own = ownedPower(p, p.power.id);
  if (!own || own.masteryLevel >= POWER_CONFIG.mastery.maxLevel) return false;
  own.masteryXp += xp;
  let up = false;
  while (own.masteryLevel < POWER_CONFIG.mastery.maxLevel && own.masteryXp >= masteryXpToNext(own.masteryLevel)) {
    own.masteryXp -= masteryXpToNext(own.masteryLevel);
    own.masteryLevel++;
    up = true;
  }
  if (own.masteryLevel >= POWER_CONFIG.mastery.maxLevel) own.masteryXp = 0;
  p.dirty = true;
  return up;
}

// ------------------------------------------------------------------ caster-side effects
export function healPlayer(z: Zone, p: PlayerEntity, amount: number) {
  if (p.dead || amount <= 0) return;
  const v = Math.round(amount * Math.max(0.1, p.stats.healPower));
  p.hp = Math.min(p.stats.hp, p.hp + v);
  z.emit({ e: 'heal', t: p.id, v }, p.ms.x, p.ms.y);
}

function healStat(p: PlayerEntity) { return p.weapon ? p.stats[p.weapon.damageStat] : p.stats.matk; }

/** Effects that act on the caster or the world, applied once when the skill resolves. */
export function applyCasterEffects(z: Zone, p: PlayerEntity, skill: SkillDef, ax: number, ay: number, mult: number) {
  const t = z.time;
  for (const ef of skill.effects) {
    switch (ef.kind) {
      case 'buff':
        p.buffs.push({ until: t + ef.duration, stats: ef.stats, statsPct: ef.statsPct, src: skill.id });
        z.host.onStatsChanged(p);
        break;
      case 'stealth':
        p.stealthUntil = t + ef.duration;
        for (const m of z.monsters.values()) if (m.targetId === p.id) { m.targetId = null; m.threat.delete(p.id); }
        break;
      case 'blink': {
        const probe = { x: p.ms.x, y: p.ms.y };
        moveWithCollision(z.map, probe, ax * ef.distance, ay * ef.distance, p.radius);
        p.ms.x = probe.x; p.ms.y = probe.y;
        p.iframesUntil = Math.max(p.iframesUntil, t + 0.15);
        break;
      }
      case 'heal': {
        const amt = p.stats.hp * ef.pct + healStat(p) * ef.statMult;
        healPlayer(z, p, amt);
        if (ef.radius > 0) for (const o of z.players.values()) {
          if (o !== p && !o.dead && (o.ms.x - p.ms.x) ** 2 + (o.ms.y - p.ms.y) ** 2 <= ef.radius ** 2) healPlayer(z, o, o.stats.hp * ef.pct + healStat(p) * ef.statMult);
        }
        break;
      }
      case 'cheat_death': p.cheatDeath = { until: t + ef.duration, hpPct: ef.hpPct }; break;
      case 'reflect': p.reflect = { until: t + ef.duration, fraction: ef.fraction }; break;
      case 'cleanse': p.ms.slowT = 0; p.ms.slowMult = 1; p.ms.rootT = 0; break;
      case 'summon': {
        for (let i = 0; i < ef.count; i++) p.summons.push({ kind: ef.summon, until: t + ef.duration, nextAt: t + 0.4 + i * 0.2, atkMult: ef.atkMult, interval: ef.interval, range: ef.range });
        z.emit({ e: 'summon', owner: p.id, kind: ef.summon, count: ef.count, dur: ef.duration }, p.ms.x, p.ms.y);
        break;
      }
      case 'zone': {
        const probe = { x: p.ms.x, y: p.ms.y };
        if (ef.forward) moveWithCollision(z.map, probe, ax * ef.forward, ay * ef.forward, 0.2);
        const zn: PowerZone = {
          id: z.host.nextId(), ownerId: p.id, x: probe.x, y: probe.y, radius: ef.radius, until: t + ef.duration, nextTick: t + ef.tick,
          tick: ef.tick, follow: ef.follow, skill, damageMult: mult, healPct: ef.healPct ?? 0,
        };
        z.powerZones.push(zn);
        z.emit({ e: 'zone', id: zn.id, owner: p.id, x: zn.x, y: zn.y, r: zn.radius, dur: ef.duration, follow: zn.follow, fx: skill.vfx, heal: zn.healPct > 0, on: true }, zn.x, zn.y);
        break;
      }
      default: break;
    }
  }
}

// ------------------------------------------------------------------ target-side effects (monsters)
export function applyPowerTargetEffects(z: Zone, src: PlayerEntity, m: MonsterEntity, effects: SkillEffect[]) {
  const t = z.time;
  const ccMult = 1 + (src.powerMods.ccBonus ?? 0);
  for (const ef of effects) {
    switch (ef.kind) {
      case 'dot': {
        const stat = src.weapon ? src.stats[src.weapon.damageStat] : src.stats.matk;
        const dps = stat * ef.dpsMult * (1 + (src.powerMods.dotBonus ?? 0));
        const ex = m.dots.find((d) => d.srcId === src.id && d.label === ef.label);
        if (ex) { ex.until = t + ef.duration; ex.dps = Math.max(ex.dps, dps); }
        else m.dots.push({ dps, until: t + ef.duration, nextAt: t + 1, srcId: src.id, label: ef.label });
        break;
      }
      case 'pull': {
        const d = normalize(src.ms.x - m.x, src.ms.y - m.y);
        const dist = Math.min(ef.distance * (m.def.tier === 'normal' ? 1 : 0.35), Math.hypot(src.ms.x - m.x, src.ms.y - m.y) - 0.8);
        if (dist > 0) moveWithCollision(z.map, m, d.x * dist, d.y * dist, m.radius);
        break;
      }
      case 'frost': {
        m.frost = (m.frostUntil > t ? m.frost : 0) + ef.stacks;
        m.frostUntil = t + POWER_CONFIG.frostStackDuration;
        if (m.frost >= POWER_CONFIG.freezeAtStacks) {
          m.frost = 0;
          m.stunUntil = Math.max(m.stunUntil, t + POWER_CONFIG.freezeDuration * ccMult * (m.def.tier === 'normal' ? 1 : 0.4));
          m.windup = null;
          if (m.state === 'windup') m.state = 'chase';
          z.emit({ e: 'frozen', id: m.id }, m.x, m.y);
        }
        break;
      }
      case 'vuln': m.vulnAmount = Math.max(m.vulnUntil > t ? m.vulnAmount : 0, ef.amount); m.vulnUntil = t + ef.duration; break;
      case 'charge':
        src.charges = Math.min(POWER_CONFIG.maxCharges, src.charges + ef.gain + (src.powerMods.chargeBonus ?? 0));
        break;
      default: break;
    }
  }
}

/** Damage that bypasses hit/crit rolls (DoT, reflect, summons use dealDamage instead). */
export function trueDamage(z: Zone, src: PlayerEntity, m: MonsterEntity, amount: number) {
  if (m.state === 'dead' || m.state === 'return') return;
  const v = Math.max(1, Math.round(amount * (m.vulnUntil > z.time ? 1 + m.vulnAmount : 1)));
  m.hp -= v;
  m.threat.set(src.id, (m.threat.get(src.id) ?? 0) + v);
  if (m.state === 'idle' || m.state === 'patrol') { m.state = 'chase'; m.targetId = src.id; }
  z.emit({ e: 'hit', s: src.id, t: m.id, d: v, c: 0, m: 0 }, m.x, m.y);
  if (m.hp <= 0) killMonster(z, m);
}

/** Chain: jump from `from` to nearby monsters. */
export function chainFrom(z: Zone, p: PlayerEntity, from: MonsterEntity, skill: SkillDef, mult: number, jumps: number, range: number) {
  const hit = new Set<number>([from.id]);
  let cur = from;
  let m = mult;
  for (let j = 0; j < jumps; j++) {
    let next: MonsterEntity | null = null, bd = Infinity;
    for (const e of z.nearby(cur.x, cur.y, range + 1)) {
      if (e.kind !== 2 || hit.has(e.id) || e.state === 'dead') continue;
      const d = Math.hypot(e.x - cur.x, e.y - cur.y);
      if (d <= range && d < bd) { bd = d; next = e; }
    }
    if (!next) break;
    m *= 0.8;
    hit.add(next.id);
    z.emit({ e: 'chain', a: cur.id, b: next.id }, cur.x, cur.y);
    dealDamage(z, p, next, { mult: m, flat: skill.damage?.flat ?? 0, stat: 'weapon', element: skill.element, effects: skill.effects.filter((e) => e.kind !== 'chain'), skill });
    cur = next;
  }
}

// ------------------------------------------------------------------ per-tick
export function tickPlayerPower(z: Zone, p: PlayerEntity) {
  const t = z.time;
  if (p.buffs.length && p.buffs.some((b) => b.until <= t)) { p.buffs = p.buffs.filter((b) => b.until > t); z.host.onStatsChanged(p); }
  if (p.cheatDeath && p.cheatDeath.until <= t) p.cheatDeath = null;
  if (p.reflect && p.reflect.until <= t) p.reflect = null;
  if (p.dead) { p.summons = []; return; }
  if (p.powerMods.regenPct && Math.floor(t * 20) % 20 === 0) healPlayer(z, p, p.stats.hp * p.powerMods.regenPct);
  // summons attack the nearest monster around their owner
  if (p.summons.length) {
    p.summons = p.summons.filter((s) => s.until > t);
    for (const s of p.summons) {
      if (t < s.nextAt) continue;
      s.nextAt = t + s.interval;
      let tgt: MonsterEntity | null = null, bd = Infinity;
      for (const e of z.nearby(p.ms.x, p.ms.y, s.range + 1)) {
        if (e.kind !== 2 || e.state === 'dead' || e.state === 'return') continue;
        const d = Math.hypot(e.x - p.ms.x, e.y - p.ms.y);
        if (d <= s.range && d < bd) { bd = d; tgt = e; }
      }
      if (!tgt) continue;
      z.emit({ e: 'sact', owner: p.id, kind: s.kind, t: tgt.id }, p.ms.x, p.ms.y);
      dealDamage(z, p, tgt, { mult: s.atkMult * (1 + (p.powerMods.summonBonus ?? 0)), flat: 0, stat: 'weapon', element: p.power?.element ?? 'none', effects: [], skill: null });
    }
  }
}

export function tickMonsterPower(z: Zone, m: MonsterEntity) {
  if (!m.dots.length || m.state === 'dead') return;
  const t = z.time;
  for (const d of m.dots) {
    if (t < d.nextAt || t > d.until + 0.01) continue;
    d.nextAt = t + 1;
    const src = z.players.get(d.srcId);
    if (src) trueDamage(z, src, m, d.dps);
    if ((m.state as string) === 'dead') break;
  }
  m.dots = m.dots.filter((d) => d.until > t);
}

export function tickZones(z: Zone) {
  const t = z.time;
  for (let i = z.powerZones.length - 1; i >= 0; i--) {
    const zn = z.powerZones[i];
    const owner = z.players.get(zn.ownerId);
    if (!owner || owner.dead || t >= zn.until) {
      z.powerZones.splice(i, 1);
      z.emit({ e: 'zone', id: zn.id, owner: zn.ownerId, x: zn.x, y: zn.y, r: zn.radius, dur: 0, follow: zn.follow, fx: zn.skill.vfx, heal: zn.healPct > 0, on: false }, zn.x, zn.y);
      continue;
    }
    if (zn.follow) { zn.x = owner.ms.x; zn.y = owner.ms.y; }
    if (t < zn.nextTick) continue;
    zn.nextTick = t + zn.tick;
    if (zn.healPct > 0) {
      for (const o of z.players.values()) if (!o.dead && (o.ms.x - zn.x) ** 2 + (o.ms.y - zn.y) ** 2 <= zn.radius ** 2) healPlayer(z, o, o.stats.hp * zn.healPct);
    }
    if (!zn.skill.damage) continue;
    const effects = zn.skill.effects.filter((e) => e.kind !== 'zone' && e.kind !== 'buff' && e.kind !== 'buff_dr');
    let charged = false;
    for (const e of z.nearby(zn.x, zn.y, zn.radius + 1)) {
      if (e.kind !== 2 || e.state === 'dead' || (e.x - zn.x) ** 2 + (e.y - zn.y) ** 2 > (zn.radius + e.radius) ** 2) continue;
      // static charge from zones accrues at most once per tick
      const fx = charged ? effects.filter((x) => x.kind !== 'charge') : effects;
      if (fx.some((x) => x.kind === 'charge')) charged = true;
      dealDamage(z, owner, e, { mult: zn.damageMult, flat: zn.skill.damage.flat, stat: 'weapon', element: zn.skill.element, effects: fx, skill: zn.skill });
    }
  }
}

// ------------------------------------------------------------------ transactions
export type TxResult = { ok: true; msg: string } | { ok: false; code: string; msg: string };

function defaultLoadout(def: PowerDef, awakening: number): PowerLoadout {
  const u = unlockedAbilities(def, awakening);
  return {
    actives: Array.from({ length: POWER_CONFIG.loadout.actives }, (_, i) => u.actives[i]?.id ?? null),
    ult: u.ultimates[0]?.id ?? null,
    passives: Array.from({ length: POWER_CONFIG.loadout.passives }, (_, i) => u.passives[i]?.id ?? null),
  };
}

/** Give a power (exchange, boss drop, GM). First power is equipped immediately. */
export function grantPower(p: PlayerEntity, id: string, awakening = 1): TxResult {
  const def = getPower(id);
  if (!def) return { ok: false, code: 'bad_power', msg: 'ไม่มีพลังนี้' };
  if (ownedPower(p, id)) return { ok: false, code: 'already_owned', msg: 'มีพลังนี้อยู่แล้ว' };
  p.rec.powers.owned.push({ id, awakening, masteryLevel: 0, masteryXp: 0 });
  p.rec.powers.loadouts[id] = defaultLoadout(def, awakening);
  if (!p.rec.powers.active) p.rec.powers.active = id;
  p.dirty = true;
  return { ok: true, msg: `ได้รับ The Power: ${def.nameTh} (${def.name})` };
}

export function exchangeFragments(p: PlayerEntity, id: string): TxResult {
  const def = getPower(id);
  if (!def) return { ok: false, code: 'bad_power', msg: 'ไม่มีพลังนี้' };
  if (ownedPower(p, id)) return { ok: false, code: 'already_owned', msg: 'มีพลังนี้อยู่แล้ว' };
  const c = POWER_CONFIG.exchange;
  if (p.inv.count('mat_power_fragment') < c.fragments) return { ok: false, code: 'no_fragments', msg: `ต้องใช้เศษพลัง ${c.fragments} ชิ้น (มี ${p.inv.count('mat_power_fragment')})` };
  if (p.rec.gold < c.gold) return { ok: false, code: 'no_gold', msg: `ต้องใช้ทอง ${c.gold}` };
  // validated above: both removals succeed together
  p.inv.removeDef('mat_power_fragment', c.fragments);
  p.rec.gold -= c.gold;
  return grantPower(p, id);
}

export function awaken(p: PlayerEntity, id: string): TxResult {
  const own = ownedPower(p, id);
  const def = getPower(id);
  if (!own || !def) return { ok: false, code: 'not_owned', msg: 'ยังไม่มีพลังนี้' };
  if (own.awakening >= 3) return { ok: false, code: 'max', msg: 'ปลุกพลังขั้นสูงสุดแล้ว' };
  const tier = POWER_CONFIG.awakening[own.awakening];
  const cost = tier.cost!;
  if (own.masteryLevel < cost.masteryLevel) return { ok: false, code: 'mastery', msg: `ต้องมี Power Mastery Lv.${cost.masteryLevel}` };
  for (const [item, n] of Object.entries(cost.items)) if (p.inv.count(item) < n) return { ok: false, code: 'materials', msg: `วัตถุดิบไม่พอ: ${item} ×${n}` };
  if (p.rec.gold < cost.gold) return { ok: false, code: 'no_gold', msg: `ต้องใช้ทอง ${cost.gold}` };
  for (const [item, n] of Object.entries(cost.items)) p.inv.removeDef(item, n);
  p.rec.gold -= cost.gold;
  own.awakening++;
  p.dirty = true;
  return { ok: true, msg: `${def.nameTh}: ${tier.name} สำเร็จ!` };
}

export function setLoadout(p: PlayerEntity, id: string, lo: PowerLoadout): TxResult {
  const own = ownedPower(p, id);
  const def = getPower(id);
  if (!own || !def) return { ok: false, code: 'not_owned', msg: 'ยังไม่มีพลังนี้' };
  const u = unlockedAbilities(def, own.awakening);
  const L = POWER_CONFIG.loadout;
  if (!Array.isArray(lo.actives) || lo.actives.length !== L.actives || !Array.isArray(lo.passives) || lo.passives.length !== L.passives) return { ok: false, code: 'bad_loadout', msg: 'รูปแบบ loadout ไม่ถูกต้อง' };
  const ok = (v: string | null, list: { id: string }[]) => v === null || list.some((x) => x.id === v);
  const dup = (arr: (string | null)[]) => new Set(arr.filter(Boolean)).size !== arr.filter(Boolean).length;
  if (!lo.actives.every((a) => ok(a, u.actives)) || !ok(lo.ult, u.ultimates) || !lo.passives.every((a) => ok(a, u.passives))) return { ok: false, code: 'locked', msg: 'มีสกิลที่ยังไม่ปลดล็อก' };
  if (dup(lo.actives) || dup(lo.passives)) return { ok: false, code: 'duplicate', msg: 'ใส่สกิลซ้ำไม่ได้' };
  p.rec.powers.loadouts[id] = { actives: [...lo.actives], ult: lo.ult, passives: [...lo.passives] };
  p.dirty = true;
  return { ok: true, msg: 'บันทึก loadout แล้ว' };
}

/**
 * Power Rebirth Ritual (PART 8) — switch the active power. Materials, gold and
 * cooldown are validated and deducted in one step; the previous power stays in
 * the collection with its mastery.
 */
export function performRitual(p: PlayerEntity, id: string, nowMs: number, inCombat: boolean): TxResult {
  const def = getPower(id);
  const ps = p.rec.powers;
  if (!def || !ownedPower(p, id)) return { ok: false, code: 'not_owned', msg: 'ต้องเลือกพลังที่ครอบครองอยู่' };
  if (ps.active === id) return { ok: false, code: 'same', msg: 'กำลังใช้พลังนี้อยู่แล้ว' };
  if (!powerAllowsWeapon(def, p.weapon?.type)) return { ok: false, code: 'weapon', msg: `${def.nameTh} ใช้ได้กับ: ${def.weapons?.join(', ')}` };
  if (inCombat) return { ok: false, code: 'combat', msg: 'ทำพิธีระหว่างต่อสู้ไม่ได้' };
  if (nowMs < ps.ritualReadyAt) return { ok: false, code: 'cooldown', msg: `พิธีอยู่ในคูลดาวน์อีก ${Math.ceil((ps.ritualReadyAt - nowMs) / 60000)} นาที` };
  const R = POWER_CONFIG.ritual;
  const need: Record<string, number> = { ...R.items, [def.ritualItem]: R.powerItemQty };
  for (const [item, n] of Object.entries(need)) if (p.inv.count(item) < n) return { ok: false, code: 'materials', msg: `วัตถุดิบไม่พอ: ${item} ×${n} (มี ${p.inv.count(item)})` };
  if (p.rec.gold < R.gold) return { ok: false, code: 'no_gold', msg: `ต้องใช้ทอง ${R.gold.toLocaleString()}` };
  for (const [item, n] of Object.entries(need)) p.inv.removeDef(item, n);
  p.rec.gold -= R.gold;
  ps.active = id;
  ps.ritualReadyAt = nowMs + R.cooldownSec * 1000;
  p.charges = 0; p.summons = []; p.buffs = [];
  p.dirty = true;
  return { ok: true, msg: `พิธีสำเร็จ! เปลี่ยนเป็น ${def.nameTh}` };
}

export function powersView(p: PlayerEntity, nowMs: number) {
  const ps = p.rec.powers;
  return {
    owned: ps.owned.map((o) => ({ ...o, next: masteryXpToNext(o.masteryLevel) })), active: ps.active, loadouts: ps.loadouts,
    ritualIn: Math.max(0, Math.ceil((ps.ritualReadyAt - nowMs) / 1000)), usable: !!p.power,
  };
}

export const ALL_POWER_IDS = Object.keys(POWERS);
