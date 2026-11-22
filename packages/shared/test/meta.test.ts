import { describe, expect, it } from 'vitest';
import { createCharacter, emptyAccount, claimLogin, buyShop, wish, awaken, setEmblems, claimBenefit, computeStats, normalizeMeta, Rng, WISH_PITY, DAY_MS, setCosmetic } from '../src/index.js';

const mk = () => { const r = createCharacter('acc1', 'Tester', 'mage', false); if (!r.ok) throw new Error(r.reason); return { ch: r.value, acc: emptyAccount() }; };

describe('meta systems', () => {
  it('login calendar: once per UTC day, cumulative', () => {
    const { ch, acc } = mk();
    const t0 = Date.UTC(2026, 10, 22, 10);
    const g0 = ch.gold;
    expect(claimLogin(acc, ch, t0).ok).toBe(true);
    expect(ch.gold).toBeGreaterThan(g0);
    expect(claimLogin(acc, ch, t0 + 3600_000).ok).toBe(false);
    expect(claimLogin(acc, ch, t0 + 3 * DAY_MS).ok).toBe(true); // a gap does not reset progress
    expect(normalizeMeta(acc.meta).login.count).toBe(2);
  });
  it('shop charges currency, enforces daily limits and ownership', () => {
    const { ch, acc } = mk();
    ch.gold = 10_000;
    const now = Date.UTC(2026, 10, 22);
    for (let i = 0; i < 5; i++) expect(buyShop(acc, ch, 'sh_token', now).ok).toBe(true);
    expect(buyShop(acc, ch, 'sh_token', now).ok).toBe(false);
    expect(normalizeMeta(acc.meta).wish.tokens).toBe(5);
    expect(ch.gold).toBe(10_000 - 5 * 450);
    expect(buyShop(acc, ch, 'sh_token', now + DAY_MS).ok).toBe(true); // limits reset next day
    expect(buyShop(acc, ch, 'sh_starmare', now).ok).toBe(true);
    expect(buyShop(acc, ch, 'sh_starmare', now + DAY_MS).ok).toBe(false); // already owned
    expect(buyShop(acc, ch, 'sh_ember', now).ok).toBe(false); // no season shards
  });
  it('wish spends tokens and the pity guarantees an SSR', () => {
    const { ch, acc } = mk();
    acc.meta = normalizeMeta(acc.meta); acc.meta.wish.tokens = 200;
    const rng = new Rng(1); let sinceSsr = 0, maxGap = 0;
    for (let i = 0; i < 20; i++) { const r = wish(acc, ch, 10, rng, 0); expect(r.ok).toBe(true); if (r.ok) for (const p of r.value) { sinceSsr = p.prize.r === 'SSR' ? 0 : sinceSsr + 1; maxGap = Math.max(maxGap, sinceSsr); } }
    expect(maxGap).toBeLessThan(WISH_PITY);
    expect(wish(acc, ch, 1, rng, 0).ok).toBe(false);
  });
  it('awakening costs resources, needs level and raises stats', () => {
    const { ch } = mk();
    expect(awaken(ch).ok).toBe(false); // level 1 cannot awaken
    ch.level = 20; ch.gold = 100_000; ch.dust = 10_000;
    const before = computeStats(ch).maxHp;
    expect(awaken(ch).ok).toBe(true);
    expect(computeStats(ch).maxHp).toBeGreaterThan(before);
  });
  it('emblems need unlocks; max three; benefits claim once', () => {
    const { ch, acc } = mk();
    expect(setEmblems(acc, ch, ['em_riftwalker']).ok).toBe(false);
    acc.achievements.push('rift_walker', 'first_blood');
    expect(setEmblems(acc, ch, ['em_riftwalker', 'em_wayfarer', 'em_first_light']).ok).toBe(true);
    expect(setEmblems(acc, ch, ['em_riftwalker', 'em_wayfarer', 'em_first_light', 'em_deep']).ok).toBe(false);
    expect(claimBenefit(acc, ch, 'bn_rift').ok).toBe(true);
    expect(claimBenefit(acc, ch, 'bn_rift').ok).toBe(false);
    expect(claimBenefit(acc, ch, 'bn_30').ok).toBe(false);
    expect(setCosmetic(acc, 'costume', 'cos_sovereign').ok).toBe(false);
  });
});

import { afkStart, afkSettle, claimAfk, AFK_MAX } from '../src/index.js';
describe('AFK camp', () => {
  it('pays only for open-world camps, with a minimum and a cap', () => {
    const { ch, acc } = mk();
    afkStart(ch, 'town', 0); expect(ch.afk ?? null).toBeNull();
    afkStart(ch, 'field', 0); afkSettle(ch, 5 * 60_000); expect(ch.afkPending ?? null).toBeNull(); // under 10 minutes
    afkStart(ch, 'field', 0); afkSettle(ch, 48 * 3600_000);
    expect(ch.afkPending!.minutes).toBe(AFK_MAX);
    const g = ch.gold;
    const r = claimAfk(acc, ch);
    expect(r.ok).toBe(true);
    expect(ch.gold).toBeGreaterThan(g);
    expect(claimAfk(acc, ch).ok).toBe(false);
  });
});
