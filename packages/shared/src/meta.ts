// Account & character meta systems: daily login calendar, in-game shop (gold / dust / season shards only — no real
// money anywhere), level benefits, Renown (the VIP-style badge, earned by playing), Awakening, Emblems, mounts,
// costumes & portrait frames, and the Astral Wish (a cosmetic/material draw with published odds and a pity counter).
// Everything here is pure and server-authoritative: GameCore calls these and persists the results.
import { ACHIEVEMENTS } from './data/quests.js';
import { MATERIALS } from './data/crafting.js';
import { POTION } from './data/items.js';
import type { AccountProgress, CharacterData, Mod } from './types.js';
import type { Rng } from './math.js';

type Result<T> = { ok: true; value: T } | { ok: false; reason: string };
const ok = <T>(value: T): Result<T> => ({ ok: true, value });
const fail = (reason: string): Result<never> => ({ ok: false, reason });
export const DAY_MS = 86_400_000;
export const dayIndex = (now: number) => Math.floor(now / DAY_MS);

// ── account meta state ─────────────────────────────────────
export interface MetaState {
  login: { last: number; count: number; total: number };
  wish: { tokens: number; pity: number; pulls: number; history: Array<{ id: string; r: WishRarity; t: number }> };
  cosmetics: { owned: string[]; costume: string | null; frame: string | null };
  mounts: string[];
  mount: string | null;
  shop: { day: number; bought: Record<string, number> };
}
export const emptyMeta = (): MetaState => ({ login: { last: -1, count: 0, total: 0 }, wish: { tokens: 0, pity: 0, pulls: 0, history: [] }, cosmetics: { owned: [], costume: null, frame: null }, mounts: [], mount: null, shop: { day: -1, bought: {} } });
export function normalizeMeta(m: Partial<MetaState> | undefined): MetaState {
  const e = emptyMeta();
  if (!m) return e;
  return {
    login: { last: m.login?.last ?? -1, count: m.login?.count ?? 0, total: m.login?.total ?? 0 },
    wish: { tokens: Math.max(0, m.wish?.tokens ?? 0), pity: m.wish?.pity ?? 0, pulls: m.wish?.pulls ?? 0, history: (m.wish?.history ?? []).slice(-30) },
    cosmetics: { owned: m.cosmetics?.owned ?? [], costume: m.cosmetics?.costume ?? null, frame: m.cosmetics?.frame ?? null },
    mounts: m.mounts ?? [], mount: m.mount ?? null, shop: { day: m.shop?.day ?? -1, bought: m.shop?.bought ?? {} },
  };
}

/** Normalises the account's meta state in place (once) and returns that same object, so callers never write to a stale copy. */
export function ensureMeta(acc: AccountProgress): MetaState {
  const m = acc.meta as MetaState | undefined;
  if (m && m.login && m.wish && m.cosmetics && m.mounts && m.shop) return m;
  acc.meta = normalizeMeta(m);
  return acc.meta;
}

// ── rewards ────────────────────────────────────────────────
export interface Reward { gold?: number; dust?: number; tokens?: number; potions?: number; mats?: Record<string, number>; cosmetic?: string; mount?: string; respec?: number }
export function rewardText(r: Reward): string {
  return [r.gold ? `${r.gold} gold` : '', r.dust ? `${r.dust} Astral Dust` : '', r.tokens ? `${r.tokens} Wish Token${r.tokens > 1 ? 's' : ''}` : '', r.potions ? `${r.potions} potion` : '', r.respec ? `${r.respec} respec token` : '',
    ...Object.entries(r.mats ?? {}).map(([k, n]) => `${n} ${MATERIALS[k]?.name ?? k}`), r.cosmetic ? COSMETICS[r.cosmetic]?.name ?? r.cosmetic : '', r.mount ? MOUNTS[r.mount]?.name ?? r.mount : ''].filter(Boolean).join(', ');
}
/** Applies a reward; owned cosmetics / mounts are converted into Astral Dust instead of duplicating. */
export function grantReward(acc: AccountProgress, ch: CharacterData, r: Reward, goldMul = 1): Reward {
  const meta = ensureMeta(acc);
  const got: Reward = { ...r };
  if (r.gold) { got.gold = Math.round(r.gold * goldMul); ch.gold += got.gold; }
  if (r.dust) ch.dust += r.dust;
  if (r.tokens) meta.wish.tokens += r.tokens;
  if (r.potions) ch.potions = Math.min(POTION.maxCharges, ch.potions + r.potions);
  if (r.respec) ch.respecTokens += r.respec;
  for (const [k, n] of Object.entries(r.mats ?? {})) ch.mats[k] = (ch.mats[k] ?? 0) + n;
  if (r.cosmetic) { if (meta.cosmetics.owned.includes(r.cosmetic)) { ch.dust += 150; got.dust = (got.dust ?? 0) + 150; delete got.cosmetic; } else meta.cosmetics.owned.push(r.cosmetic); }
  if (r.mount) { if (meta.mounts.includes(r.mount)) { ch.dust += 250; got.dust = (got.dust ?? 0) + 250; delete got.mount; } else { meta.mounts.push(r.mount); meta.mount ??= r.mount; } }
  return got;
}

// ── Renown (VIP-style badge, earned by play) ───────────────
export function renownPoints(acc: AccountProgress): number {
  const meta = normalizeMeta(acc.meta);
  const seasonTiers = (acc.season?.archive ?? []).reduce((s, a) => s + a.tier, 0) + Math.floor((acc.season?.xp ?? 0) / 1000);
  return acc.achievements.length * 10 + seasonTiers * 3 + meta.login.total * 2 + Object.keys(acc.codex).length * 2;
}
export const RENOWN_STEPS = [0, 20, 50, 90, 140, 200, 270, 350, 440, 540, 650];
export function renownLevel(acc: AccountProgress): number { const p = renownPoints(acc); let l = 0; while (l < 10 && p >= RENOWN_STEPS[l + 1]!) l++; return l; }
/** Perks are small conveniences, never combat power: more gold from the daily login and one extra daily shop purchase per 5 levels. */
export const renownGoldMul = (lvl: number) => 1 + lvl * 0.05;

// ── daily login calendar (28 days, cumulative — missing a day never resets progress) ──
export const LOGIN_CYCLE = 28;
export function loginReward(i: number): Reward {
  const d = (i % LOGIN_CYCLE) + 1;
  if (d === 28) return { cosmetic: 'cos_starlight', tokens: 3 };
  if (d % 7 === 0) return { tokens: 2, dust: 40 };
  if (d === 14 || d === 21) return { dust: 80, gold: 400 };
  if (d % 3 === 0) return { mats: { moonpetal: 5, iron_ore: 5 }, gold: 150 };
  if (d % 5 === 0) return { potions: 2, gold: 200 };
  return { gold: 150 + d * 15 };
}
export function claimLogin(acc: AccountProgress, ch: CharacterData, now: number): Result<{ day: number; reward: Reward }> {
  const meta = ensureMeta(acc);
  const today = dayIndex(now);
  if (meta.login.last === today) return fail('Already claimed today — come back tomorrow');
  const day = meta.login.count % LOGIN_CYCLE;
  const reward = grantReward(acc, ch, loginReward(day), renownGoldMul(renownLevel(acc)));
  meta.login = { last: today, count: meta.login.count + 1, total: meta.login.total + 1 };
  return ok({ day, reward });
}

// ── cosmetics & mounts ─────────────────────────────────────
export interface CosmeticDef { id: string; kind: 'costume' | 'frame'; name: string; color: string; accent?: string; rarity: WishRarity }
export const COSMETICS: Record<string, CosmeticDef> = {
  cos_starlight: { id: 'cos_starlight', kind: 'costume', name: 'Starlight Vestments', color: '#e8eaff', accent: '#9fd8ff', rarity: 'SR' },
  cos_dawn: { id: 'cos_dawn', kind: 'costume', name: 'Dawnguard Regalia', color: '#e8c06a', accent: '#fff0b8', rarity: 'R' },
  cos_eclipse: { id: 'cos_eclipse', kind: 'costume', name: 'Eclipse Court Attire', color: '#3a1a6a', accent: '#ffd36a', rarity: 'SR' },
  cos_ember: { id: 'cos_ember', kind: 'costume', name: 'Emberforged Garb', color: '#a8301e', accent: '#ffb02e', rarity: 'R' },
  cos_sovereign: { id: 'cos_sovereign', kind: 'costume', name: 'Sovereign of Night', color: '#120a24', accent: '#ff4fa0', rarity: 'SSR' },
  frame_gold: { id: 'frame_gold', kind: 'frame', name: 'Gilded Frame', color: '#e8c062', rarity: 'R' },
  frame_eclipse: { id: 'frame_eclipse', kind: 'frame', name: 'Eclipse Frame', color: '#9b6cff', rarity: 'SR' },
  frame_sovereign: { id: 'frame_sovereign', kind: 'frame', name: 'Sovereign Frame', color: '#ff4fa0', rarity: 'SSR' },
};
export interface MountDef { id: string; name: string; color: string; speed: number; rarity: WishRarity }
/** Mounts: +speed while out of combat only; any attack, cast or damage dismounts. */
export const MOUNTS: Record<string, MountDef> = {
  mount_starmare: { id: 'mount_starmare', name: 'Starmare', color: '#e8eaff', speed: 0.3, rarity: 'R' },
  mount_ashwolf: { id: 'mount_ashwolf', name: 'Ashen Wolf', color: '#5a5a6a', speed: 0.3, rarity: 'SR' },
  mount_eclipse: { id: 'mount_eclipse', name: 'Eclipse Drake', color: '#3a1a6a', speed: 0.35, rarity: 'SSR' },
};
export function setCosmetic(acc: AccountProgress, kind: 'costume' | 'frame' | 'mount', id: string | null): Result<null> {
  const meta = ensureMeta(acc);
  if (kind === 'mount') { if (id && !meta.mounts.includes(id)) return fail('You do not own that mount'); meta.mount = id; return ok(null); }
  if (id && (!meta.cosmetics.owned.includes(id) || COSMETICS[id]?.kind !== kind)) return fail('You do not own that cosmetic');
  meta.cosmetics[kind] = id;
  return ok(null);
}

// ── shop (gold / dust / season shards) ─────────────────────
export type Currency = 'gold' | 'dust' | 'shards';
export interface ShopItem { id: string; name: string; price: number; cur: Currency; daily: number; reward: Reward; tab: 'supplies' | 'materials' | 'cosmetics' | 'mounts' }
export const SHOP: ShopItem[] = [
  { id: 'sh_token', name: 'Wish Token', price: 450, cur: 'gold', daily: 5, reward: { tokens: 1 }, tab: 'supplies' },
  { id: 'sh_token_s', name: 'Wish Token (shards)', price: 25, cur: 'shards', daily: 3, reward: { tokens: 1 }, tab: 'supplies' },
  { id: 'sh_potion', name: 'Restorative Draught ×2', price: 120, cur: 'gold', daily: 10, reward: { potions: 2 }, tab: 'supplies' },
  { id: 'sh_respec', name: 'Respec Token', price: 900, cur: 'gold', daily: 1, reward: { respec: 1 }, tab: 'supplies' },
  { id: 'sh_ore', name: 'Iron Ore ×10', price: 140, cur: 'gold', daily: 3, reward: { mats: { iron_ore: 10 } }, tab: 'materials' },
  { id: 'sh_herb', name: 'Moonpetal ×10', price: 140, cur: 'gold', daily: 3, reward: { mats: { moonpetal: 10 } }, tab: 'materials' },
  { id: 'sh_steel', name: 'Starsteel Ore ×3', price: 60, cur: 'dust', daily: 2, reward: { mats: { starsteel: 3 } }, tab: 'materials' },
  { id: 'sh_core', name: 'Cinder Core ×1', price: 45, cur: 'dust', daily: 2, reward: { mats: { cinder_core: 1 } }, tab: 'materials' },
  { id: 'sh_dawn', name: 'Dawnguard Regalia', price: 2500, cur: 'gold', daily: 1, reward: { cosmetic: 'cos_dawn' }, tab: 'cosmetics' },
  { id: 'sh_ember', name: 'Emberforged Garb', price: 90, cur: 'shards', daily: 1, reward: { cosmetic: 'cos_ember' }, tab: 'cosmetics' },
  { id: 'sh_frame', name: 'Gilded Frame', price: 1500, cur: 'gold', daily: 1, reward: { cosmetic: 'frame_gold' }, tab: 'cosmetics' },
  { id: 'sh_starmare', name: 'Starmare (mount)', price: 3000, cur: 'gold', daily: 1, reward: { mount: 'mount_starmare' }, tab: 'mounts' },
  { id: 'sh_ashwolf', name: 'Ashen Wolf (mount)', price: 150, cur: 'shards', daily: 1, reward: { mount: 'mount_ashwolf' }, tab: 'mounts' },
];
export const SHOP_MAP = Object.fromEntries(SHOP.map((s) => [s.id, s]));
export function shopBought(acc: AccountProgress, id: string, now: number): number { const m = normalizeMeta(acc.meta); return m.shop.day === dayIndex(now) ? m.shop.bought[id] ?? 0 : 0; }
export function buyShop(acc: AccountProgress, ch: CharacterData, id: string, now: number): Result<{ item: ShopItem; reward: Reward }> {
  const it = SHOP_MAP[id];
  if (!it) return fail('Unknown shop item');
  const meta = ensureMeta(acc);
  const today = dayIndex(now);
  if (meta.shop.day !== today) meta.shop = { day: today, bought: {} };
  const limit = it.daily + Math.floor(renownLevel(acc) / 5);
  if ((meta.shop.bought[id] ?? 0) >= limit) return fail('Daily limit reached for this item');
  if ((it.reward.cosmetic && meta.cosmetics.owned.includes(it.reward.cosmetic)) || (it.reward.mount && meta.mounts.includes(it.reward.mount))) return fail('You already own this');
  if (it.cur === 'gold') { if (ch.gold < it.price) return fail('Not enough gold'); ch.gold -= it.price; }
  else if (it.cur === 'dust') { if (ch.dust < it.price) return fail('Not enough Astral Dust'); ch.dust -= it.price; }
  else { if (!acc.season || acc.season.shards < it.price) return fail('Not enough Ember Shards'); acc.season.shards -= it.price; }
  meta.shop.bought[id] = (meta.shop.bought[id] ?? 0) + 1;
  return ok({ item: it, reward: grantReward(acc, ch, it.reward) });
}

// ── level benefits (per character, claim once) ─────────────
export interface BenefitDef { id: string; name: string; level?: number; achievement?: string; reward: Reward }
export const BENEFITS: BenefitDef[] = [
  { id: 'bn_5', name: 'Reach level 5', level: 5, reward: { gold: 300, tokens: 1 } },
  { id: 'bn_10', name: 'Reach level 10', level: 10, reward: { gold: 600, dust: 40, tokens: 2 } },
  { id: 'bn_15', name: 'Reach level 15', level: 15, reward: { gold: 900, dust: 60, tokens: 2 } },
  { id: 'bn_20', name: 'Reach level 20', level: 20, reward: { mount: 'mount_starmare', tokens: 3 } },
  { id: 'bn_25', name: 'Reach level 25', level: 25, reward: { dust: 150, tokens: 3, cosmetic: 'frame_gold' } },
  { id: 'bn_30', name: 'Reach level 30', level: 30, reward: { dust: 250, tokens: 5 } },
  { id: 'bn_rift', name: 'Clear your first Rift', achievement: 'rift_walker', reward: { gold: 500, tokens: 1 } },
  { id: 'bn_boss', name: 'Defeat the world boss', achievement: 'world_boss', reward: { dust: 80, tokens: 2 } },
  { id: 'bn_raid', name: 'Defeat the Eclipse Sovereign', achievement: 'raid_clear', reward: { cosmetic: 'cos_eclipse', tokens: 5 } },
];
export function benefitReady(acc: AccountProgress, ch: CharacterData, b: BenefitDef) { return (b.level === undefined || ch.level >= b.level) && (!b.achievement || acc.achievements.includes(b.achievement)); }
export function claimBenefit(acc: AccountProgress, ch: CharacterData, id: string): Result<{ reward: Reward }> {
  const b = BENEFITS.find((x) => x.id === id);
  if (!b) return fail('Unknown benefit');
  ch.benefits ??= [];
  if (ch.benefits.includes(id)) return fail('Already claimed');
  if (!benefitReady(acc, ch, b)) return fail('Not reached yet');
  ch.benefits.push(id);
  return ok({ reward: grantReward(acc, ch, b.reward) });
}

// ── Awakening (per character) ──────────────────────────────
export const AWAKEN_MAX = 10;
export const awakenReqLevel = (l: number) => 5 + l * 3;
export const awakenCost = (l: number) => ({ gold: Math.round(400 * Math.pow(l + 1, 1.6)), dust: Math.round(30 * Math.pow(l + 1, 1.5)) });
/** +2% damage and +1.5% life per level; +10% critical damage at 5 and again at 10. */
export function awakenMods(l: number): Mod[] { if (l <= 0) return []; return [{ stat: 'dmgPct', value: 2 * l }, { stat: 'maxHpPct', value: 1.5 * l }, { stat: 'critMult', value: (l >= 5 ? 10 : 0) + (l >= 10 ? 10 : 0) }]; }
export function awaken(ch: CharacterData): Result<{ level: number }> {
  const l = ch.awaken ?? 0;
  if (l >= AWAKEN_MAX) return fail('Fully awakened');
  if (ch.level < awakenReqLevel(l)) return fail(`Requires character level ${awakenReqLevel(l)}`);
  const c = awakenCost(l);
  if (ch.gold < c.gold) return fail(`Needs ${c.gold} gold`);
  if (ch.dust < c.dust) return fail(`Needs ${c.dust} Astral Dust`);
  ch.gold -= c.gold; ch.dust -= c.dust; ch.awaken = l + 1;
  return ok({ level: l + 1 });
}

// ── Emblems (account unlocks, three equipped per character) ──
export interface EmblemDef { id: string; name: string; color: string; mods: Mod[]; unlock: string | null; hint: string }
export const EMBLEMS: Record<string, EmblemDef> = {
  em_wayfarer: { id: 'em_wayfarer', name: 'Wayfarer', color: '#7be0b5', mods: [{ stat: 'moveSpeedPct', value: 4 }], unlock: null, hint: 'Every adventurer starts with it' },
  em_first_light: { id: 'em_first_light', name: 'First Light', color: '#ffe070', mods: [{ stat: 'maxHpPct', value: 4 }], unlock: 'first_blood', hint: 'Achievement: First Light' },
  em_riftwalker: { id: 'em_riftwalker', name: 'Riftwalker', color: '#9b6cff', mods: [{ stat: 'dmgPct', value: 4 }], unlock: 'rift_walker', hint: 'Achievement: Rift Walker' },
  em_deep: { id: 'em_deep', name: 'Of the Deep', color: '#4f9dff', mods: [{ stat: 'critChance', value: 2 }], unlock: 'tier_hard', hint: 'Achievement: Into the Deep' },
  em_grove: { id: 'em_grove', name: 'Grovebreaker', color: '#5bd16a', mods: [{ stat: 'armorPct', value: 6 }], unlock: 'world_boss', hint: 'Achievement: Grove Breaker' },
  em_coil: { id: 'em_coil', name: 'Coilbreaker', color: '#5fe0d0', mods: [{ stat: 'cdr', value: 3 }], unlock: 'labyrinth', hint: 'Achievement: Out of the Coil' },
  em_corona: { id: 'em_corona', name: 'Corona', color: '#ffb02e', mods: [{ stat: 'critMult', value: 8 }], unlock: 'eclipse_walker', hint: 'Achievement: Beyond the Corona' },
  em_sovereign: { id: 'em_sovereign', name: 'Sovereign-Slayer', color: '#ff4fa0', mods: [{ stat: 'dmgPct', value: 6 }], unlock: 'raid_clear', hint: 'Achievement: Sovereign-Slayer' },
};
export const EMBLEM_SLOTS = 3;
export const emblemUnlocked = (acc: AccountProgress, id: string) => { const e = EMBLEMS[id]; return !!e && (!e.unlock || acc.achievements.includes(e.unlock)); };
export function setEmblems(acc: AccountProgress, ch: CharacterData, ids: unknown): Result<null> {
  if (!Array.isArray(ids)) return fail('Bad emblem list');
  const list = [...new Set(ids.map(String))];
  if (list.length > EMBLEM_SLOTS) return fail(`At most ${EMBLEM_SLOTS} emblems`);
  for (const id of list) if (!emblemUnlocked(acc, id)) return fail('Emblem not unlocked');
  ch.emblems = list;
  return ok(null);
}
export function emblemMods(ch: CharacterData): Mod[] { return (ch.emblems ?? []).flatMap((id) => EMBLEMS[id]?.mods ?? []); }

// ── Astral Wish (cosmetics & materials; odds published in the UI; pity guarantees SSR) ──
export type WishRarity = 'N' | 'R' | 'SR' | 'SSR';
export const WISH_ODDS: Record<WishRarity, number> = { N: 0.6, R: 0.28, SR: 0.1, SSR: 0.02 };
export const WISH_PITY = 60;
export interface WishPrize { id: string; r: WishRarity; reward: Reward; name: string }
export const WISH_POOL: WishPrize[] = [
  { id: 'w_gold', r: 'N', reward: { gold: 200 }, name: '200 gold' }, { id: 'w_ore', r: 'N', reward: { mats: { iron_ore: 6 } }, name: 'Iron Ore ×6' }, { id: 'w_herb', r: 'N', reward: { mats: { moonpetal: 6 } }, name: 'Moonpetal ×6' }, { id: 'w_pot', r: 'N', reward: { potions: 1 }, name: 'Restorative Draught' },
  { id: 'w_dust', r: 'R', reward: { dust: 40 }, name: '40 Astral Dust' }, { id: 'w_steel', r: 'R', reward: { mats: { starsteel: 3 } }, name: 'Starsteel Ore ×3' }, { id: 'w_core', r: 'R', reward: { mats: { cinder_core: 2 } }, name: 'Cinder Core ×2' }, { id: 'w_dawn', r: 'R', reward: { cosmetic: 'cos_dawn' }, name: 'Dawnguard Regalia' }, { id: 'w_ember', r: 'R', reward: { cosmetic: 'cos_ember' }, name: 'Emberforged Garb' },
  { id: 'w_glass', r: 'SR', reward: { mats: { starglass: 3 } }, name: 'Starglass ×3' }, { id: 'w_eclipse', r: 'SR', reward: { cosmetic: 'cos_eclipse' }, name: 'Eclipse Court Attire' }, { id: 'w_frame', r: 'SR', reward: { cosmetic: 'frame_eclipse' }, name: 'Eclipse Frame' }, { id: 'w_wolf', r: 'SR', reward: { mount: 'mount_ashwolf' }, name: 'Ashen Wolf' },
  { id: 'w_sov', r: 'SSR', reward: { cosmetic: 'cos_sovereign' }, name: 'Sovereign of Night' }, { id: 'w_drake', r: 'SSR', reward: { mount: 'mount_eclipse' }, name: 'Eclipse Drake' }, { id: 'w_sframe', r: 'SSR', reward: { cosmetic: 'frame_sovereign' }, name: 'Sovereign Frame' },
];
export function wish(acc: AccountProgress, ch: CharacterData, count: number, rng: Rng, now: number): Result<Array<{ prize: WishPrize; got: Reward }>> {
  const meta = ensureMeta(acc);
  if (count !== 1 && count !== 10) return fail('Wish 1 or 10 at a time');
  if (meta.wish.tokens < count) return fail('Not enough Wish Tokens');
  meta.wish.tokens -= count;
  const out: Array<{ prize: WishPrize; got: Reward }> = [];
  for (let i = 0; i < count; i++) {
    meta.wish.pulls++; meta.wish.pity++;
    let r: WishRarity;
    if (meta.wish.pity >= WISH_PITY) r = 'SSR';
    else { const x = rng.next(); r = x < WISH_ODDS.SSR ? 'SSR' : x < WISH_ODDS.SSR + WISH_ODDS.SR ? 'SR' : x < WISH_ODDS.SSR + WISH_ODDS.SR + WISH_ODDS.R ? 'R' : 'N'; }
    if (r === 'SSR') meta.wish.pity = 0;
    const pool = WISH_POOL.filter((p) => p.r === r);
    const prize = pool[Math.floor(rng.next() * pool.length)]!;
    out.push({ prize, got: grantReward(acc, ch, prize.reward) });
    meta.wish.history.push({ id: prize.id, r, t: now });
  }
  meta.wish.history = meta.wish.history.slice(-30);
  return ok(out);
}
export { ACHIEVEMENTS };
