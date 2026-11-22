// Enhancement (+1..+15) and bonus options. Rules chosen with the player:
//  +1..+6 always succeed · +7..+11 a failure only consumes the materials · +12..+15 a failure drops the item one level.
//  Items never break. Bonus option slots unlock at +5 / +10 / +15 and can be rerolled with chosen slots locked.
import type { Result } from './character.js';
import { AFFIXES } from './data/items.js';
import { affixValue } from './loot.js';
import type { Rng } from './math.js';
import type { CharacterData, EquipSlot, Item, ItemAffix } from './types.js';

export const ENHANCE_MAX = 15;
/** Success chance for reaching +n (index = target level). */
export const ENHANCE_RATE = [1, 1, 1, 1, 1, 1, 1, 0.8, 0.7, 0.6, 0.5, 0.45, 0.4, 0.33, 0.25, 0.2];
export const BONUS_UNLOCK = [5, 10, 15];
export type FailRule = 'none' | 'keep' | 'drop';
export const failRule = (target: number): FailRule => target <= 6 ? 'none' : target <= 11 ? 'keep' : 'drop';
export function enhanceCost(it: Item): { gold: number; dust: number; mats: Record<string, number> } {
  const t = (it.plus ?? 0) + 1, lvl = 1 + it.ilvl / 25;
  const mat = t <= 6 ? 'iron_ore' : t <= 11 ? 'starsteel' : 'starglass';
  return { gold: Math.round(40 * t * t * lvl), dust: Math.round(4 * t * lvl), mats: { [mat]: t <= 6 ? t : t <= 11 ? t - 5 : (t - 10) * 2 } };
}
export function bonusSlots(it: Item): number { return BONUS_UNLOCK.filter((p) => (it.plus ?? 0) >= p).length; }
function rollBonus(it: Item, rng: Rng, exclude: Set<string>): ItemAffix | null {
  const pool = AFFIXES.filter((a) => (!a.slots || a.slots.includes(it.slot)) && !exclude.has(a.id));
  if (!pool.length) return null;
  const a = rng.pick(pool);
  const tier = Math.min(5, 1 + Math.floor(rng.next() * 3 + (it.plus ?? 0) / 6));
  return { id: a.id, stat: a.stat, value: Math.max(a.int ? 1 : 0.01, Math.round(affixValue(a, it.ilvl, tier, rng) * 0.6 * (a.int ? 1 : 100)) / (a.int ? 1 : 100)), tier };
}
/** Fill newly unlocked bonus slots (never rerolls existing ones). */
function fillBonus(it: Item, rng: Rng) {
  it.bonus ??= [];
  while (it.bonus.length < bonusSlots(it)) { const b = rollBonus(it, rng, new Set([...it.affixes, ...it.bonus].map((x) => x.id))); if (!b) break; it.bonus.push(b); }
}
const locate = (ch: CharacterData, loc: { inv?: number; slot?: EquipSlot }) => loc.inv !== undefined ? ch.inventory[loc.inv] : loc.slot ? ch.equipment[loc.slot] : undefined;
const hasMats = (ch: CharacterData, m: Record<string, number>) => Object.entries(m).every(([k, n]) => (ch.mats[k] ?? 0) >= n);

export interface EnhanceResult { success: boolean; plus: number; before: number; dropped: boolean; newBonus: number }
export function enhanceItem(ch: CharacterData, loc: { inv?: number; slot?: EquipSlot }, rng: Rng): Result<EnhanceResult> {
  const it = locate(ch, loc);
  if (!it) return { ok: false, reason: 'No item' };
  const before = it.plus ?? 0;
  if (before >= ENHANCE_MAX) return { ok: false, reason: 'Already +15' };
  const c = enhanceCost(it);
  if (ch.gold < c.gold || ch.dust < c.dust || !hasMats(ch, c.mats)) return { ok: false, reason: `Need ${c.gold} gold, ${c.dust} Astral Dust and ${Object.entries(c.mats).map(([k, n]) => `${n} ${k}`).join(', ')}` };
  ch.gold -= c.gold; ch.dust -= c.dust;
  for (const [k, n] of Object.entries(c.mats)) ch.mats[k] = (ch.mats[k] ?? 0) - n;
  const target = before + 1;
  const success = rng.next() < ENHANCE_RATE[target]!;
  const slotsBefore = bonusSlots(it);
  let dropped = false;
  if (success) it.plus = target;
  else if (failRule(target) === 'drop') { it.plus = Math.max(0, before - 1); dropped = true; }
  if (success) fillBonus(it, rng);
  // a level drop below an unlock threshold keeps the rolled options but disables the extra slot
  if (it.bonus && it.bonus.length > bonusSlots(it)) it.bonus = it.bonus.slice(0, bonusSlots(it));
  return { ok: true, value: { success, plus: it.plus ?? 0, before, dropped, newBonus: Math.max(0, bonusSlots(it) - slotsBefore) } };
}
export function bonusRerollCost(it: Item, locks: number): { gold: number; dust: number } {
  const lvl = 1 + it.ilvl / 25;
  return { gold: Math.round(150 * lvl * (1 + locks * 2)), dust: Math.round(15 * lvl * (1 + locks * 2)) };
}
/** Reroll every unlocked bonus slot except the locked ones. At least one slot must stay unlocked. */
export function rerollBonus(ch: CharacterData, loc: { inv?: number; slot?: EquipSlot }, locks: number[], rng: Rng): Result<Item> {
  const it = locate(ch, loc);
  if (!it) return { ok: false, reason: 'No item' };
  const n = bonusSlots(it);
  if (!n) return { ok: false, reason: 'Enhance the item to +5 to unlock a bonus option slot' };
  fillBonus(it, rng);
  const lock = new Set(locks.filter((i) => Number.isInteger(i) && i >= 0 && i < n));
  if (lock.size >= n) return { ok: false, reason: 'Leave at least one slot unlocked' };
  const c = bonusRerollCost(it, lock.size);
  if (ch.gold < c.gold || ch.dust < c.dust) return { ok: false, reason: `Need ${c.gold} gold and ${c.dust} Astral Dust` };
  ch.gold -= c.gold; ch.dust -= c.dust;
  const next = it.bonus!.slice();
  for (let i = 0; i < n; i++) {
    if (lock.has(i)) continue;
    const used = new Set([...it.affixes.map((a) => a.id), ...next.filter((_, j) => j !== i).map((a) => a.id)]);
    const b = rollBonus(it, rng, used);
    if (b) next[i] = b;
  }
  it.bonus = next;
  return { ok: true, value: it };
}
