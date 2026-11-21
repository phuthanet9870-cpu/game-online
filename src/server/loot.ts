import { getItem, isEquipment, type ItemInstance, type Rarity } from '../shared/config/items.ts';
import type { MonsterDef } from '../shared/config/monsters.ts';
import { createItem } from './inventory.ts';

function pickRarity(weights: Partial<Record<Rarity, number>>, rng: () => number): Rarity | undefined {
  const entries = Object.entries(weights) as [Rarity, number][];
  const total = entries.reduce((a, [, w]) => a + w, 0);
  if (total <= 0) return undefined;
  let r = rng() * total;
  for (const [k, w] of entries) { if ((r -= w) < 0) return k; }
  return entries[entries.length - 1][0];
}

/**
 * Roll a monster's loot table on the server. `rewardMult` < 1 is applied by
 * the farming soft cap. Returns server-created item instances.
 */
export function rollLoot(def: MonsterDef, level: number, rng: () => number, rewardMult = 1, goldMult = rewardMult): { items: ItemInstance[]; gold: number } {
  const items: ItemInstance[] = [];
  for (const e of def.loot) {
    if (rng() >= e.chance * rewardMult) continue;
    const item = getItem(e.itemId);
    if (!item) continue;
    const qty = e.min + Math.floor(rng() * (e.max - e.min + 1));
    if (isEquipment(item)) {
      for (let i = 0; i < qty; i++) {
        const rarity = e.rarityWeights ? pickRarity(e.rarityWeights, rng) : undefined;
        items.push(createItem(e.itemId, 1, { rarity, ilvl: Math.max(item.levelReq, level), bound: false }));
      }
    } else {
      items.push(createItem(e.itemId, Math.min(qty, item.stackMax), { bound: false }));
    }
  }
  const [gmin, gmax] = def.gold;
  const gold = Math.round((gmin + Math.floor(rng() * (gmax - gmin + 1))) * goldMult);
  return { items, gold };
}
