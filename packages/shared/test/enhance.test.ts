import { describe, expect, it } from 'vitest';
import { ENHANCE_RATE, Rng, bonusSlots, computeStats, createCharacter, enhanceItem, generateItem, itemMods, rerollBonus } from '../src/index.js';

const mk = () => { const r = createCharacter('a', 'Forger', 'warrior', false); if (!r.ok) throw new Error(); const ch = r.value; ch.gold = 1e9; ch.dust = 1e9; ch.mats = { iron_ore: 999, starsteel: 999, starglass: 999 }; ch.inventory[0] = generateItem({ rng: new Rng(3), ilvl: 20, rarity: 'rare', baseId: 'w_axe' }); return ch; };

describe('enhancement +15', () => {
  it('never fails up to +6, unlocks bonus slots at +5/+10/+15 and scales weapon power', () => {
    const ch = mk();
    const it = ch.inventory[0]!;
    const base = itemMods(it); void base;
    for (let i = 0; i < 6; i++) { const r = enhanceItem(ch, { inv: 0 }, new Rng(i)); expect(r.ok && r.value.success).toBe(true); }
    expect(it.plus).toBe(6);
    expect(bonusSlots(it)).toBe(1);
    expect(it.bonus).toHaveLength(1);
    ch.equipment.weapon = it; ch.inventory[0] = null;
    const p6 = computeStats(ch).power;
    it.plus = 0; const p0 = computeStats(ch).power; it.plus = 6;
    expect(p6).toBeGreaterThan(p0);
  });
  it('follows the fail rules: +7..+11 keep level, +12..+15 drop one level, never break', () => {
    const ch = mk();
    const it = ch.inventory[0]!;
    const fail = { next: () => 0.9999, int: () => 0, pick: <T>(a: T[]) => a[0], range: () => 0, chance: () => false } as unknown as Rng;
    it.plus = 8;
    let r = enhanceItem(ch, { inv: 0 }, fail);
    expect(r.ok && !r.value.success && !r.value.dropped).toBe(true); expect(it.plus).toBe(8);
    it.plus = 13;
    r = enhanceItem(ch, { inv: 0 }, fail);
    expect(r.ok && r.value.dropped).toBe(true); expect(it.plus).toBe(12);
    expect(ch.inventory[0]).toBe(it);
    expect(ENHANCE_RATE.length).toBe(16);
  });
  it('charges materials, refuses at +15, and rerolls only unlocked bonus slots', () => {
    const ch = mk();
    const it = ch.inventory[0]!;
    ch.mats.iron_ore = 0;
    expect(enhanceItem(ch, { inv: 0 }, new Rng(1)).ok).toBe(false);
    it.plus = 15; it.bonus = [];
    expect(enhanceItem(ch, { inv: 0 }, new Rng(1)).ok).toBe(false);
    expect(rerollBonus(ch, { inv: 0 }, [0, 1, 2], new Rng(1)).ok).toBe(false); // must leave one unlocked
    expect(rerollBonus(ch, { inv: 0 }, [0], new Rng(1)).ok).toBe(true);
    const keep = it.bonus![0];
    const g = ch.gold;
    expect(rerollBonus(ch, { inv: 0 }, [0], new Rng(9)).ok).toBe(true);
    expect(it.bonus![0]).toEqual(keep);
    expect(it.bonus).toHaveLength(3);
    expect(ch.gold).toBeLessThan(g);
  });
});
