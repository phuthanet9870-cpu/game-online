import { AFFIXES, ITEM_BASES, ITEM_BASE_MAP, LEGENDARY_POWERS, RARITY_DEFS, type AffixDef } from './data/items.js';
import { Rng } from './math.js';
import type { ClassId, Item, ItemAffix, Rarity } from './types.js';
import { RARITIES } from './types.js';

let uidCounter = 0;
export function makeUid(rng?: Rng): string {
  const r = rng ? Math.floor(rng.next() * 0xffffffff) : Math.floor(Math.random() * 0xffffffff);
  uidCounter = (uidCounter + 1) % 0xffffff;
  return `${Date.now().toString(36)}${r.toString(36)}${uidCounter.toString(36)}`;
}

/** Roll a rarity. `bonus` (0..~2) shifts weight toward rarer tiers. `minRarity` for guaranteed drops. */
export function rollRarity(rng: Rng, bonus: number, minRarity: Rarity = 'common'): Rarity {
  const minIdx = RARITIES.indexOf(minRarity);
  const pool = RARITIES.slice(minIdx);
  return rng.weighted(pool, (r) => {
    const idx = RARITIES.indexOf(r);
    return RARITY_DEFS[r].weight * Math.pow(1 + bonus, idx * 0.9);
  });
}

function affixValue(a: AffixDef, ilvl: number, tier: number, rng: Rng): number {
  const raw = (a.base + a.per * ilvl) * (0.8 + 0.2 * tier) * rng.range(0.85, 1.15);
  return a.int ? Math.max(1, Math.round(raw)) : Math.round(raw * 100) / 100;
}

export function rollAffix(slot: string, ilvl: number, rng: Rng, tierBonus: number, exclude: Set<string>): ItemAffix | null {
  const pool = AFFIXES.filter((a) => (!a.slots || a.slots.includes(slot)) && !exclude.has(a.id));
  if (!pool.length) return null;
  const a = rng.pick(pool);
  const tier = Math.min(5, 1 + Math.floor(rng.next() * 3 + tierBonus * 4 + ilvl / 25));
  return { id: a.id, stat: a.stat, value: affixValue(a, ilvl, tier, rng), tier };
}

export function generateItem(opts: { rng: Rng; ilvl: number; rarity: Rarity; baseId?: string; cls?: ClassId; hardcore?: boolean }): Item {
  const { rng, ilvl, rarity } = opts;
  let base = opts.baseId ? ITEM_BASE_MAP[opts.baseId]! : undefined;
  if (!base) {
    // 35% chance to roll a weapon for the looting class (smart loot), otherwise any base.
    const pool = opts.cls && rng.chance(0.35) ? ITEM_BASES.filter((b) => b.slot === 'weapon' && b.classes?.includes(opts.cls!)) : ITEM_BASES;
    base = rng.pick(pool.length ? pool : ITEM_BASES);
  }
  const rd = RARITY_DEFS[rarity];
  const scale = 1 + ilvl * 0.06;
  const implicit = base.implicit.map((md) => ({ stat: md.stat, value: Number.isInteger(md.value) && Math.abs(md.value) >= 2 ? Math.round(md.value * (md.stat.startsWith('armor') || md.stat === 'maxHp' ? scale : 1)) : md.value }));
  const n = rng.int(rd.affixes[0], rd.affixes[1]);
  const affixes: ItemAffix[] = [];
  const used = new Set<string>();
  for (let i = 0; i < n; i++) {
    const af = rollAffix(base.slot, ilvl, rng, rd.tierBonus, used);
    if (!af) break;
    used.add(af.id);
    affixes.push(af);
  }
  let power: string | undefined;
  if (rarity === 'legendary' || rarity === 'ancient') power = rng.pick(Object.keys(LEGENDARY_POWERS));
  const weaponPower = base.weaponPower ? Math.round(base.weaponPower * (1 + ilvl * 0.08) * (rarity === 'ancient' ? 1.25 : 1) * rng.range(0.92, 1.08)) : undefined;
  const name = power ? `${base.name} ${LEGENDARY_POWERS[power]!.name}` : base.name;
  return {
    uid: makeUid(rng), baseId: base.id, name, slot: base.slot, rarity, ilvl, reqLevel: Math.max(1, Math.min(100, ilvl - 2)),
    implicit, affixes, power, weaponPower, bound: rarity === 'ancient', hardcore: !!opts.hardcore,
  };
}

export function salvageValue(it: Item): number {
  return RARITY_DEFS[it.rarity].salvage * (1 + Math.floor(it.ilvl / 10));
}

export function sellValue(it: Item): number {
  return Math.round(RARITY_DEFS[it.rarity].salvage * 4 * (1 + it.ilvl * 0.15));
}

/** Enchant: reroll one affix. Costs dust + gold. */
export function enchantCost(it: Item): { dust: number; gold: number } {
  const r = RARITIES.indexOf(it.rarity);
  return { dust: 3 + r * 3, gold: 20 + it.ilvl * 5 * (r + 1) };
}

export function rerollAffix(it: Item, index: number, rng: Rng): Item {
  const used = new Set(it.affixes.map((a, i) => (i === index ? '' : a.id)));
  const af = rollAffix(it.slot, it.ilvl, rng, RARITY_DEFS[it.rarity].tierBonus, used);
  if (!af) return it;
  const affixes = it.affixes.slice();
  affixes[index] = af;
  return { ...it, affixes };
}

/** Starter weapon for each class. */
export const STARTER_WEAPON: Record<ClassId, string> = {
  warrior: 'w_greatsword', mage: 'w_staff', assassin: 'w_daggers', ranger: 'w_bow', paladin: 'w_sword_shield', necromancer: 'w_tome', chronomancer: 'w_hourglass',
};
