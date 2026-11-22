import { CLASSES } from './data/classes.js';
import { PASSIVE_MAP } from './data/passives.js';
import { LEGENDARY_POWERS } from './data/items.js';
import type { CharacterData, ClassId, DamageType, Item, Mod } from './types.js';
import { DAMAGE_TYPES, EQUIP_SLOTS } from './types.js';

export interface Derived {
  level: number;
  cls: ClassId;
  str: number; dex: number; int: number; vit: number;
  maxHp: number;
  maxRes: number;
  secMax: number;
  armor: number;
  res: Record<DamageType, number>;
  power: number;
  weaponPower: number;
  critChance: number; // %
  critMult: number; // % (150 = x1.5)
  atkSpeed: number; // multiplier
  castSpeed: number; // multiplier
  cdr: number; // fraction (0..0.5)
  moveSpeed: number;
  dodge: number; // %
  block: number; // %
  hpRegen: number;
  resRegen: number;
  leech: number; // fraction
  m: Record<string, number>;
  flags: Set<string>;
}

export const sumMods = (mods: Mod[], into: Record<string, number> = {}) => {
  for (const md of mods) into[md.stat] = (into[md.stat] ?? 0) + md.value;
  return into;
};

export function itemMods(it: Item): Mod[] {
  const out: Mod[] = [...it.implicit, ...it.affixes.map((a) => ({ stat: a.stat, value: a.value }))];
  if (it.power && LEGENDARY_POWERS[it.power]) out.push(...LEGENDARY_POWERS[it.power]!.mods);
  return out;
}

/** Collect every modifier source for a character. `extra` = buffs, run blessings, dungeon modifiers. */
export function collectMods(ch: CharacterData, extra: Mod[] = []): { m: Record<string, number>; flags: Set<string>; weaponPower: number; affinity: boolean } {
  const m: Record<string, number> = {};
  const flags = new Set<string>();
  const start = PASSIVE_MAP[`${ch.cls}_start`];
  if (start) sumMods(start.mods, m);
  for (const id of ch.passives) {
    const n = PASSIVE_MAP[id];
    if (!n) continue;
    sumMods(n.mods, m);
    n.flags?.forEach((f) => flags.add(f));
  }
  let weaponPower = 4; // bare hands
  let affinity = false;
  for (const slot of EQUIP_SLOTS) {
    const it = ch.equipment[slot];
    if (!it) continue;
    sumMods(itemMods(it), m);
    if (slot === 'weapon') {
      weaponPower = it.weaponPower ?? weaponPower;
      affinity = true; // equipped item already validated for class affinity bonus below
    }
  }
  sumMods(extra, m);
  return { m, flags, weaponPower, affinity };
}

export function computeStats(ch: CharacterData, extra: Mod[] = []): Derived {
  const def = CLASSES[ch.cls];
  const { m, flags, weaponPower } = collectMods(ch, extra);
  const L = ch.level - 1;
  const str = def.base.str + def.perLevel.str * L + (m.str ?? 0);
  const dex = def.base.dex + def.perLevel.dex * L + (m.dex ?? 0);
  const int = def.base.int + def.perLevel.int * L + (m.int ?? 0);
  const vit = def.base.vit + def.perLevel.vit * L + (m.vit ?? 0);
  const primary = def.primaryAttr === 'str' ? str : def.primaryAttr === 'dex' ? dex : int;

  let maxHp = (def.base.hp + def.perLevel.hp * L + vit * 6 + (m.maxHp ?? 0)) * (1 + (m.maxHpPct ?? 0) / 100);
  if (flags.has('glass')) maxHp *= 0.65;

  const res = {} as Record<DamageType, number>;
  for (const t of DAMAGE_TYPES) res[t] = t === 'physical' ? 0 : Math.min(75, (m['res.all'] ?? 0) + (m['res.' + t] ?? 0));

  const weaponBonus = ch.equipment.weapon ? 1 : 0;
  const power = weaponPower * (1 + 0.04 * L) + primary * 0.6 + ch.level * 1.5 + weaponBonus;

  let moveSpeed = def.base.moveSpeed * (1 + (m.moveSpeedPct ?? 0) / 100);
  if (flags.has('unbreakable')) moveSpeed *= 0.9;

  const secBase = def.secondary?.max ?? 0;
  return {
    level: ch.level,
    cls: ch.cls,
    str, dex, int, vit,
    maxHp: Math.round(maxHp),
    maxRes: def.resource.max + (m.maxRes ?? 0),
    secMax: secBase + (secBase ? (m.secondaryMax ?? 0) + (ch.cls === 'mage' ? (m.weaveMax ?? 0) : 0) : 0),
    armor: Math.round((def.base.armor + (m.armor ?? 0) + str * 0.5) * (1 + (m.armorPct ?? 0) / 100)),
    res,
    power,
    weaponPower,
    critChance: flags.has('thousand_cuts') ? 0 : Math.min(95, 5 + dex * 0.05 + (m.critChance ?? 0)),
    critMult: 150 + (m.critMult ?? 0),
    atkSpeed: Math.max(0.3, 1 + (m.atkSpeed ?? 0) / 100 + dex * 0.001),
    castSpeed: Math.max(0.3, 1 + (m.castSpeed ?? 0) / 100 + int * 0.001),
    cdr: Math.min(0.5, (m.cdr ?? 0) / 100),
    moveSpeed,
    dodge: flags.has('unbreakable') ? 0 : Math.min(60, (m.dodge ?? 0) + dex * 0.04),
    block: Math.min(60, (ch.cls === 'paladin' ? 15 : 0) + (m.block ?? 0)),
    hpRegen: (m.hpRegen ?? 0) + maxHp * 0.002,
    resRegen: def.resource.regen * (1 + (m.resRegenPct ?? 0) / 100),
    leech: Math.min(0.1, (m.lifeOnHitPct ?? 0) / 100),
    m,
    flags,
  };
}

/** Human readable label for a stat key; used for tooltips and the character sheet. */
export function statLabel(key: string, v: number): string {
  const sign = v >= 0 ? '+' : '';
  const map: Record<string, string> = {
    str: 'Strength', dex: 'Dexterity', int: 'Intelligence', vit: 'Vitality', maxHp: 'Maximum Life', maxRes: 'Maximum Resource', armor: 'Armor',
    critChance: '% Critical Chance', critMult: '% Critical Damage', atkSpeed: '% Attack Speed', castSpeed: '% Cast Speed', cdr: '% Cooldown Reduction',
    moveSpeedPct: '% Movement Speed', dodge: '% Dodge', block: '% Block', hpRegen: ' Life/sec', lifeOnHitPct: '% Life Leech', maxHpPct: '% Maximum Life',
    armorPct: '% Armor', dmgPct: '% Damage', 'res.all': '% All Resistances', minionDmgPct: '% Minion Damage', minionHpPct: '% Minion Life', dotDmgPct: '% Damage over Time',
    aoePct: '% Area of Effect', projCount: ' Skill Projectiles', 'basic.proj': ' Basic Attack hits/projectiles', 'basic.dmgPct': '% Basic Attack Damage', 'basic.chain': ' Basic Attack Chains',
    'basic.pierce': ' Basic Attack Pierce', healPct: '% Healing', barrierPct: '% Barrier Strength', statusDurPct: '% Status Duration', stunDurPct: '% Stun Duration',
    resRegenPct: '% Resource Regen', costPct: '% Skill Cost', finisherPct: '% Finisher bonus per point', secondaryMax: ' Max Secondary Resource', weaveMax: ' Max Weave',
    minionCap: ' Max Minions', penetration: '% Resistance Penetration', goldFindPct: '% Gold Found', magicFindPct: '% Item Rarity', onHitBurn: ' Burn chance on hit',
    onHitPoison: ' Poison chance on hit', onHitBleed: ' Bleed chance on hit', markPct: "% Hunter's Mark effect", threatPct: '% Threat', ultCdr: '% Ultimate Recharge',
    minionSpeedPct: '% Minion Speed', 'dmgPct.trap': '% Trap Damage', highLifeDmgPct: '% Damage above 80% Life', 'basic.statusChance': ' Basic Attack status chance',
    dmgTakenPct: '% Damage Taken', sizePct: '% Size',
  };
  if (key.startsWith('dmgPct.')) return `${sign}${v}% ${cap(key.slice(7))} Damage`;
  if (key.startsWith('res.')) return `${sign}${v}% ${cap(key.slice(4))} Resistance`;
  if (key.startsWith('basic.convert.')) return `Basic attacks convert to ${cap(key.slice(14))}`;
  if (key.startsWith('onHit')) return `${Math.round(v * 100)}% chance on hit to ${key.slice(5)}`;
  if (key.startsWith('flag')) return '';
  const lbl = map[key] ?? key;
  const val = Number.isInteger(v) ? v : Math.round(v * 100) / 100;
  return lbl.startsWith('%') || lbl.startsWith(' ') ? `${sign}${val}${lbl}` : `${sign}${val} ${lbl}`;
}
const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);
