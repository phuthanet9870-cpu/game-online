// Trading, auction house and guild rules. Pure functions over in-memory state; the caller (GameCore)
// persists every multi-object change through one Persistence.transact() call so it commits atomically.

import type { CharacterData, ClassId, Item, Rarity } from './types.js';
import { INVENTORY_SIZE, RARITIES } from './types.js';
import type { Result } from './character.js';

const ok = <T>(value: T): Result<T> => ({ ok: true, value });
const fail = (reason: string): Result<never> => ({ ok: false, reason });

// ───────────────────────── Tradeability ─────────────────────────
/** Reasons an item may not leave a character. Bound items and mode mismatches never trade. */
export function untradeableReason(it: Item, from: CharacterData, to?: CharacterData): string | null {
  if (it.bound) return `${it.name} is bound`;
  if (to && from.hardcore !== to.hardcore) return 'Hardcore and Normal characters cannot trade with each other';
  if (it.hardcore !== from.hardcore) return 'Item mode mismatch';
  return null;
}
const freeSlots = (ch: CharacterData) => ch.inventory.filter((s) => s === null).length;

// ───────────────────────── Direct trade ─────────────────────────
export interface TradeOffer { uids: string[]; gold: number }
export const TRADE_MAX_ITEMS = 8;

export function validateOffer(ch: CharacterData, offer: TradeOffer, partner: CharacterData): Result<void> {
  if (!Number.isInteger(offer.gold) || offer.gold < 0) return fail('Invalid gold amount');
  if (offer.gold > ch.gold) return fail('Not enough gold');
  if (offer.uids.length > TRADE_MAX_ITEMS) return fail(`At most ${TRADE_MAX_ITEMS} items per trade`);
  if (new Set(offer.uids).size !== offer.uids.length) return fail('Duplicate item in offer');
  if (ch.hardcore !== partner.hardcore) return fail('Hardcore and Normal characters cannot trade with each other');
  for (const uid of offer.uids) {
    const it = ch.inventory.find((x) => x?.uid === uid);
    if (!it) return fail('An offered item is no longer in your bags');
    const r = untradeableReason(it, ch, partner);
    if (r) return fail(r);
  }
  return ok(undefined);
}

/** Atomically swaps both offers. Either both sides change or neither does. */
export function executeTrade(a: CharacterData, b: CharacterData, oa: TradeOffer, ob: TradeOffer): Result<void> {
  const va = validateOffer(a, oa, b); if (!va.ok) return va;
  const vb = validateOffer(b, ob, a); if (!vb.ok) return vb;
  if (freeSlots(a) + oa.uids.length < ob.uids.length) return fail(`${a.name} does not have enough bag space`);
  if (freeSlots(b) + ob.uids.length < oa.uids.length) return fail(`${b.name} does not have enough bag space`);
  const take = (ch: CharacterData, uids: string[]) => uids.map((u) => { const i = ch.inventory.findIndex((x) => x?.uid === u); const it = ch.inventory[i]!; ch.inventory[i] = null; return it; });
  const give = (ch: CharacterData, items: Item[]) => { for (const it of items) { const i = ch.inventory.indexOf(null); ch.inventory[i] = it; } };
  const ia = take(a, oa.uids), ib = take(b, ob.uids);
  give(a, ib); give(b, ia);
  a.gold += ob.gold - oa.gold;
  b.gold += oa.gold - ob.gold;
  return ok(undefined);
}

// ───────────────────────── Auction house ─────────────────────────
export interface Listing {
  id: string;
  sellerChar: string;
  sellerName: string;
  sellerAccount: string;
  item: Item;
  price: number;
  hardcore: boolean;
  status: 'active' | 'sold' | 'expired' | 'closed';
  buyerName?: string;
  proceeds: number;
  createdAt: number;
  expiresAt: number;
}
export const AH = { feePct: 10, deposit: 5, maxListings: 10, durationMs: 48 * 3600_000, maxPrice: 10_000_000 };

export function createListing(ch: CharacterData, invIndex: number, price: number, mine: Listing[], now: number, id: string): Result<Listing> {
  if (!Number.isInteger(price) || price < 1 || price > AH.maxPrice) return fail(`Price must be 1-${AH.maxPrice} gold`);
  if (mine.filter((l) => l.status === 'active').length >= AH.maxListings) return fail(`You can have at most ${AH.maxListings} active listings`);
  const it = ch.inventory[invIndex];
  if (!it) return fail('Empty slot');
  const r = untradeableReason(it, ch);
  if (r) return fail(r);
  if (ch.gold < AH.deposit) return fail(`Listing deposit is ${AH.deposit} gold`);
  ch.gold -= AH.deposit; // non-refundable: gold sink
  ch.inventory[invIndex] = null; // escrow: the item now lives only in the listing
  return ok({ id, sellerChar: ch.id, sellerName: ch.name, sellerAccount: ch.accountId, item: it, price, hardcore: ch.hardcore, status: 'active', proceeds: 0, createdAt: now, expiresAt: now + AH.durationMs });
}

export function buyListing(buyer: CharacterData, l: Listing, now: number): Result<void> {
  if (l.status !== 'active' || l.expiresAt <= now) return fail('This listing is no longer available');
  if (l.sellerChar === buyer.id) return fail('You cannot buy your own listing');
  if (l.sellerAccount === buyer.accountId) return fail('You cannot buy from your own account');
  if (l.hardcore !== buyer.hardcore) return fail('Hardcore and Normal markets are separate');
  if (buyer.gold < l.price) return fail('Not enough gold');
  const slot = buyer.inventory.indexOf(null);
  if (slot < 0) return fail('Your bags are full');
  buyer.gold -= l.price;
  buyer.inventory[slot] = l.item;
  l.status = 'sold';
  l.buyerName = buyer.name;
  l.proceeds = l.price - Math.ceil((l.price * AH.feePct) / 100);
  return ok(undefined);
}

/** Seller collects proceeds (sold), or the item back (expired/cancelled). */
export function claimListing(ch: CharacterData, l: Listing, now: number): Result<{ gold?: number; item?: Item }> {
  if (l.sellerChar !== ch.id) return fail('Not your listing');
  if (l.status === 'active' && l.expiresAt <= now) l.status = 'expired';
  if (l.status === 'sold') { ch.gold += l.proceeds; l.status = 'closed'; return ok({ gold: l.proceeds }); }
  if (l.status === 'expired') {
    const slot = ch.inventory.indexOf(null);
    if (slot < 0) return fail('Your bags are full');
    ch.inventory[slot] = l.item;
    l.status = 'closed';
    return ok({ item: l.item });
  }
  return fail('Nothing to collect yet');
}

export function cancelListing(ch: CharacterData, l: Listing): Result<void> {
  if (l.sellerChar !== ch.id) return fail('Not your listing');
  if (l.status !== 'active') return fail('Listing is not active');
  const slot = ch.inventory.indexOf(null);
  if (slot < 0) return fail('Your bags are full');
  ch.inventory[slot] = l.item;
  l.status = 'closed';
  return ok(undefined);
}

export interface AhQuery { text?: string; slot?: string; rarity?: Rarity; maxLevel?: number; sort?: 'price' | 'newest'; page?: number }
export function searchListings(all: Iterable<Listing>, q: AhQuery, hardcore: boolean, now: number) {
  const text = (q.text ?? '').toLowerCase().slice(0, 40);
  const minR = q.rarity ? RARITIES.indexOf(q.rarity) : 0;
  let rows = [...all].filter((l) => l.status === 'active' && l.expiresAt > now && l.hardcore === hardcore
    && (!text || l.item.name.toLowerCase().includes(text))
    && (!q.slot || l.item.slot === q.slot)
    && RARITIES.indexOf(l.item.rarity) >= minR
    && (!q.maxLevel || l.item.reqLevel <= q.maxLevel));
  rows.sort(q.sort === 'newest' ? (a, b) => b.createdAt - a.createdAt : (a, b) => a.price - b.price);
  const page = Math.max(0, Math.floor(q.page ?? 0));
  const total = rows.length;
  rows = rows.slice(page * 30, page * 30 + 30);
  return { total, page, rows };
}

// ───────────────────────── Guilds ─────────────────────────
export type GuildRank = 'leader' | 'officer' | 'member';
export interface GuildMember { charId: string; name: string; cls: ClassId; level: number; rank: GuildRank; joinedAt: number }
export interface Guild { id: string; name: string; tag: string; motd: string; createdAt: number; members: GuildMember[]; log: Array<{ t: number; text: string }>; level: number; xp: number; hardcore: boolean; vault?: (Item | null)[]; withdrawals?: Record<string, { day: number; n: number }> }
export const GUILD_VAULT_SIZE = 30;
/** Daily withdrawal limit per rank (anti-scam: a new member cannot empty the vault). */
export const VAULT_LIMITS: Record<GuildRank, number> = { leader: 999, officer: 20, member: 3 };
export const GUILD = { createCost: 500, maxMembers: 50, nameRe: /^[A-Za-z฀-๿][A-Za-z0-9฀-๿ ]{2,23}$/, tagRe: /^[A-Z0-9]{2,5}$/ };
export const guildXpToNext = (lvl: number) => 1000 * lvl * lvl;

export const PERMS: Record<string, GuildRank[]> = {
  invite: ['leader', 'officer'], kick: ['leader', 'officer'], motd: ['leader', 'officer'], promote: ['leader'], transfer: ['leader'], disband: ['leader'],
};
export function can(g: Guild, charId: string, action: keyof typeof PERMS): boolean {
  const m = g.members.find((x) => x.charId === charId);
  return !!m && PERMS[action]!.includes(m.rank);
}
const rankOrder: Record<GuildRank, number> = { leader: 3, officer: 2, member: 1 };

export function createGuild(ch: CharacterData, name: string, tag: string, existing: Iterable<Guild>, now: number, id: string): Result<Guild> {
  const n = name.trim().replace(/\s+/g, ' '), tg = tag.trim().toUpperCase();
  if (!GUILD.nameRe.test(n)) return fail('Guild name: 3-24 letters, numbers or spaces');
  if (!GUILD.tagRe.test(tg)) return fail('Guild tag: 2-5 capital letters or digits');
  for (const g of existing) {
    if (g.name.toLowerCase() === n.toLowerCase()) return fail('That guild name is taken');
    if (g.tag === tg) return fail('That guild tag is taken');
    if (g.members.some((m) => m.charId === ch.id)) return fail('Leave your current guild first');
  }
  if (ch.gold < GUILD.createCost) return fail(`Founding a guild costs ${GUILD.createCost} gold`);
  ch.gold -= GUILD.createCost;
  return ok({ id, name: n, tag: tg, motd: 'Welcome!', createdAt: now, members: [{ charId: ch.id, name: ch.name, cls: ch.cls, level: ch.level, rank: 'leader', joinedAt: now }], log: [{ t: now, text: `${ch.name} founded the guild` }], level: 1, xp: 0, hardcore: ch.hardcore });
}

export function addMember(g: Guild, ch: CharacterData, now: number): Result<void> {
  if (g.members.length >= GUILD.maxMembers) return fail('Guild is full');
  if (g.hardcore !== ch.hardcore) return fail('Hardcore and Normal guilds are separate');
  if (g.members.some((m) => m.charId === ch.id)) return fail('Already a member');
  g.members.push({ charId: ch.id, name: ch.name, cls: ch.cls, level: ch.level, rank: 'member', joinedAt: now });
  logGuild(g, now, `${ch.name} joined`);
  return ok(undefined);
}

export function kickMember(g: Guild, actorId: string, targetName: string, now: number): Result<GuildMember> {
  const actor = g.members.find((m) => m.charId === actorId);
  const target = g.members.find((m) => m.name.toLowerCase() === targetName.toLowerCase());
  if (!actor || !target) return fail('Member not found');
  if (!can(g, actorId, 'kick') || rankOrder[actor.rank] <= rankOrder[target.rank]) return fail('You cannot remove that member');
  g.members = g.members.filter((m) => m !== target);
  logGuild(g, now, `${actor.name} removed ${target.name}`);
  return ok(target);
}

export function setRank(g: Guild, actorId: string, targetName: string, rank: 'officer' | 'member', now: number): Result<void> {
  if (!can(g, actorId, 'promote')) return fail('Only the guild leader can change ranks');
  const t = g.members.find((m) => m.name.toLowerCase() === targetName.toLowerCase());
  if (!t || t.rank === 'leader') return fail('Member not found');
  t.rank = rank;
  logGuild(g, now, `${t.name} is now ${rank}`);
  return ok(undefined);
}

/** Leadership transfer requires typing the guild name (anti-scam confirmation) and the target to be a member. */
export function transferLeader(g: Guild, actorId: string, targetName: string, confirmName: string, now: number): Result<void> {
  if (!can(g, actorId, 'transfer')) return fail('Only the guild leader can transfer leadership');
  if (confirmName !== g.name) return fail('Type the exact guild name to confirm the transfer');
  const t = g.members.find((m) => m.name.toLowerCase() === targetName.toLowerCase());
  const me = g.members.find((m) => m.charId === actorId)!;
  if (!t || t === me) return fail('Member not found');
  me.rank = 'officer';
  t.rank = 'leader';
  logGuild(g, now, `${me.name} transferred leadership to ${t.name}`);
  return ok(undefined);
}

/** Returns 'disband' if the last member left. Leaders must transfer before leaving a non-empty guild. */
export function leaveGuild(g: Guild, charId: string, now: number): Result<'left' | 'disband'> {
  const m = g.members.find((x) => x.charId === charId);
  if (!m) return fail('Not a member');
  if (m.rank === 'leader' && g.members.length > 1) return fail('Transfer leadership before leaving');
  g.members = g.members.filter((x) => x !== m);
  logGuild(g, now, `${m.name} left`);
  return ok(g.members.length ? 'left' : 'disband');
}

export function vaultDeposit(g: Guild, ch: CharacterData, invIndex: number, now: number): Result<Item> {
  const it = ch.inventory[invIndex];
  if (!it) return fail('Empty slot');
  const r = untradeableReason(it, ch);
  if (r) return fail(r);
  if (it.hardcore !== g.hardcore) return fail('Item mode does not match the guild');
  g.vault ??= Array(GUILD_VAULT_SIZE).fill(null);
  const j = g.vault.indexOf(null);
  if (j < 0) return fail('Guild vault is full');
  g.vault[j] = it; ch.inventory[invIndex] = null;
  logGuild(g, now, `${ch.name} deposited ${it.name}`);
  return ok(it);
}
export function vaultWithdraw(g: Guild, ch: CharacterData, idx: number, now: number): Result<Item> {
  const m = g.members.find((x) => x.charId === ch.id);
  if (!m) return fail('Not a member');
  const it = g.vault?.[idx];
  if (!it) return fail('Empty vault slot');
  const day = Math.floor(now / 86400_000);
  g.withdrawals ??= {};
  const w = g.withdrawals[ch.id]?.day === day ? g.withdrawals[ch.id]! : { day, n: 0 };
  if (w.n >= VAULT_LIMITS[m.rank]) return fail(`Daily withdrawal limit reached for rank ${m.rank} (${VAULT_LIMITS[m.rank]})`);
  const slot = ch.inventory.indexOf(null);
  if (slot < 0) return fail('Your bags are full');
  ch.inventory[slot] = it; g.vault![idx] = null;
  w.n++; g.withdrawals[ch.id] = w;
  logGuild(g, now, `${ch.name} withdrew ${it.name}`);
  return ok(it);
}

export function addGuildXp(g: Guild, xp: number): number {
  g.xp += Math.round(xp);
  let ups = 0;
  while (g.xp >= guildXpToNext(g.level)) { g.xp -= guildXpToNext(g.level); g.level++; ups++; }
  return ups;
}

export function logGuild(g: Guild, t: number, text: string) {
  g.log.push({ t, text });
  if (g.log.length > 50) g.log.splice(0, g.log.length - 50);
}

export { INVENTORY_SIZE };
