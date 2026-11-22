// GameCore: authoritative session/room/party/quest orchestration. Transport- and storage-agnostic.
// The Node server wires it to WebSockets + PostgreSQL; the offline build wires it to an in-page
// message channel + browser storage. Both run this exact code.

import * as M from './meta.js';
import { ITEM_BASE_MAP } from './data/items.js';
import { RARITIES, LEVEL_CAP } from './types.js';
import { emptyMeta, normalizeMeta } from './meta.js';
import * as C from './character.js';
import { CLASSES } from './data/classes.js';
import { classSkills } from './data/skills.js';
import { BLESSINGS, BLESSING_MAP } from './data/dungeon.js';
import { DIFFICULTIES, DIFFICULTY_ORDER, ENEMIES } from './data/enemies.js';
import { POTION } from './data/items.js';
import { decodeBuild } from './data/passives.js';
import { ACHIEVEMENTS, QUESTS, QUEST_MAP } from './data/quests.js';
import { generateItem, rollRarity } from './loot.js';
import type { Item } from './types.js';
import { Rng, dist } from './math.js';
import { buildArena, buildHouse, buildTown, buildZone, validatePlacement, generateDungeon, generateLabyrinth, type GameMap } from './maps.js';
import { ZONES, ZONE_MAP, waypointCost } from './data/bestiary.js';
import { ACTIVITIES, ACTIVITY_ORDER, ECLIPSE_POOL, NIGHTMARE_MODS, towerScale, type Activity } from './data/activities.js';
import { MATERIALS, PROFESSIONS, RECIPE_MAP } from './data/crafting.js';
import { PETS } from './data/pets.js';
import { TUTORIAL } from './data/tutorial.js';
import { FURNITURE, emptyHouse, type HouseState } from './data/housing.js';
import { AURAS, DEFAULT_LIVE, SEASON_XP_PER_TIER, SHARD_SOURCES, currentSeason, weekIndex, weeklyEvent, weeklyObjectives, type LiveConfig, type SeasonDef } from './data/seasons.js';
import type { AccountProgress, CharacterData, DifficultyId, EquipSlot } from './types.js';
import { EQUIP_SLOTS, PROTOCOL_VERSION, STASH_SIZE } from './types.js';
import { TICK_RATE, World, type WorldEvent, type WorldOptions } from './world.js';
import * as EC from './economy.js';
import { applyContentPatch, type ContentPatch } from './content.js';
import type { Guild, Listing, TradeOffer } from './economy.js';
import { TILE, circleBlocked, reachableSet } from './maps.js';

export interface Persistence {
  saveCharacter(ch: CharacterData): Promise<void>;
  saveAccount(accountId: string, prog: AccountProgress): Promise<void>;
  audit(entry: { accountId: string; charId: string; action: string; data: unknown }): void;
  /** Commit several objects in ONE transaction (trades, auction purchases, guild changes). */
  transact(tx: PersistTx): Promise<void>;
  /** Load shared world state (guilds, auction listings) at startup. */
  loadShared(): Promise<{ guilds: Guild[]; listings: Listing[]; records?: LeaderRecord[] }>;
}
export interface PersistTx { characters?: CharacterData[]; accounts?: Array<{ id: string; progress: AccountProgress }>; listings?: Listing[]; guilds?: Guild[]; deleteGuilds?: string[]; records?: LeaderRecord[] }

interface TradeState { id: string; a: string; b: string; open: boolean; offers: Record<string, TradeOffer>; locked: Set<string>; confirmed: Set<string> }
interface PfEntry { sid: string; name: string; cls: string; level: number; note: string; diff: string; size: number; hardcore: boolean; at: number }

type Send = (msg: unknown) => void;

interface Session {
  id: string;
  accountId: string;
  char: CharacterData;
  account: AccountProgress;
  send: Send;
  roomId: string;
  entId: number;
  rids: string[];
  bucket: number;
  violations: number;
  lastChat: number;
  dirty: boolean;
  saveT: number;
  partyId: string | null;
  invites: Set<string>; // party ids
  blocked: Set<string>; // char names
  pendingChoice: { kind: 'shrine' | 'altar'; options: string[]; itId: string } | null;
  run: { kills: number; gold: number; items: number; xp: number; startGold: number } | null;
  closed: boolean;
  tradeId: string | null;
  guildInvites: Set<string>;
  chatHist: Array<{ text: string; t: number }>;
  mutedUntil: number;
  reviveCd?: number;
  fishing?: { spot: string; x: number; y: number; res: string; biteAt: number; until: number; bit: boolean } | null;
  netCache?: { room: string; ents: Map<number, string>; projs: Map<number, string>; areas: Map<number, string> };
  friendReqs: Set<string>;
  role: string;
  gm: boolean;
}

interface Room { id: string; kind: 'town' | 'field' | 'dungeon'; world: World; sessions: Set<string>; emptyT: number; difficulty: DifficultyId; seed: number; partyId: string | null; mode?: Activity; floor?: number; startedAt?: number; arena?: { wave: number; nextT: number } }
export interface LeaderRecord { board: string; charId: string; name: string; cls: string; hardcore: boolean; value: number; at: number }
interface Party { id: string; leader: string; members: string[] }

export const FRIEND_MAX = 50;
const MUTATIONS = new Set(['house_buy', 'house_place', 'house_remove', 'use_map', 'guild_vault_put', 'guild_vault_take', 'pet_buy', 'season_claim', 'craft', 'trade_confirm', 'ah_list', 'ah_buy', 'ah_cancel', 'ah_claim', 'guild_create', 'equip', 'unequip', 'salvage', 'sell', 'enchant', 'move_inv', 'loadout', 'passive_alloc', 'passive_refund', 'respec', 'preset_save', 'preset_load', 'import_build', 'buy_potion', 'quest_accept', 'quest_claim', 'stash_put', 'stash_take', 'choose', 'login_claim', 'shop_buy', 'benefit_claim', 'awaken', 'wish', 'emblem_set', 'cosmetic_set', 'afk_claim', 'bag_expand', 'sell_many', 'stash_put_many', 'guild_apply', 'guild_req', 'guild_settings', 'discard', 'waypoint']);

/** Character as sent to its owner: hidden server knowledge (exact treasure spot) is removed. */
export function publicChar(ch: CharacterData): CharacterData {
  if (!ch.treasure) return ch;
  const { x: _x, y: _y, ...hint } = ch.treasure;
  return { ...ch, treasure: { ...hint, x: -1, y: -1 } };
}

export function emptyAccount(): AccountProgress {
  return { codex: {}, achievements: [], titles: [], stash: { normal: Array(STASH_SIZE).fill(null), hardcore: Array(STASH_SIZE).fill(null) }, season: null, auras: [], aura: null, pets: [], pet: null, meta: emptyMeta(), friends: [] };
}
export function normalizeAccount(a: Partial<AccountProgress> | null | undefined): AccountProgress {
  const e = emptyAccount();
  if (!a) return e;
  return { codex: a.codex ?? {}, achievements: a.achievements ?? [], titles: a.titles ?? [], stash: { normal: pad(a.stash?.normal, STASH_SIZE), hardcore: pad(a.stash?.hardcore, STASH_SIZE) }, season: a.season ?? null, auras: a.auras ?? [], aura: a.aura ?? null, pets: a.pets ?? [], pet: a.pet ?? null, meta: normalizeMeta(a.meta), friends: (a.friends ?? []).slice(0, FRIEND_MAX), house: a.house ? { owned: a.house.owned ?? {}, placed: a.house.placed ?? [], perm: a.house.perm ?? 'private' } : undefined };
}
const pad = <T>(arr: (T | null)[] | undefined, n: number) => { const o = (arr ?? []).slice(0, n); while (o.length < n) o.push(null); return o; };

export class GameCore {
  rooms = new Map<string, Room>();
  sessions = new Map<string, Session>();
  parties = new Map<string, Party>();
  /** Reconnect grace: charId -> { roomId, until, x, y } */
  private reconnect = new Map<string, { roomId: string; until: number; x: number; y: number }>();
  private tickN = 0;
  private now = 0;
  private rng = new Rng(Date.now() & 0xffffffff);
  announcement: string | null = null;
  guilds = new Map<string, Guild>();
  listings = new Map<string, Listing>();
  records = new Map<string, LeaderRecord>();
  private trades = new Map<string, TradeState>();
  private pf = new Map<string, PfEntry>();
  private worldEvent = { active: false, nextAt: 90, bossId: 0, startedAt: 0, x: 0, y: 0, statusT: 0 };
  live: LiveConfig = structuredClone(DEFAULT_LIVE);
  contentPatch: ContentPatch | null = null;
  /** Publish a validated content patch: applied to the authoritative data now and pushed to every client. */
  setContent(patch: ContentPatch | null) { this.contentPatch = patch; applyContentPatch(patch); for (const o of this.sessions.values()) o.send({ t: 'content', patch }); }
  /** Wall-clock source (ms). Injectable for tests. */
  clock: () => number = () => Date.now();

  /** Load persisted shared state. Call once before accepting players. */
  async init() {
    const st = await this.persist.loadShared();
    for (const g of st.guilds) { g.vault ??= Array(EC.GUILD_VAULT_SIZE).fill(null); g.withdrawals ??= {}; EC.normalizeGuild(g); this.guilds.set(g.id, g); }
    for (const l of st.listings) this.listings.set(l.id, l);
    for (const r of st.records ?? []) this.records.set(`${r.board}:${r.charId}`, r);
  }
  /** Fire-and-forget persistence that never crashes the game loop; failures are logged to the audit trail. */
  private tx(t: PersistTx) { this.persist.transact(t).catch((e) => this.persist.audit({ accountId: '', charId: '', action: 'persist_error', data: String(e).slice(0, 300) })); }
  private saveAcct(id: string, prog: AccountProgress) { this.persist.saveAccount(id, prog).catch((e) => this.persist.audit({ accountId: id, charId: '', action: 'persist_error', data: String(e).slice(0, 300) })); }
  private uid(prefix: string) { return prefix + Math.floor(this.rng.next() * 1e12).toString(36) + this.clock().toString(36); }
  guildOf(charId: string): Guild | undefined { for (const g of this.guilds.values()) if (g.members.some((m) => m.charId === charId)) return g; return undefined; }

  constructor(private persist: Persistence, private opts: { label: string } = { label: 'server' }) {
    this.createRoom('town', buildTown(), 'normal', 0);
    for (const z of ZONES) this.createRoom(z.id, buildZone(z.id), 'normal', z.seed, 1, null, { zoneLoot: z.loot });
  }

  private createRoom(id: string, map: GameMap, difficulty: DifficultyId, seed: number, partySize = 1, partyId: string | null = null, extra: Partial<WorldOptions> = {}): Room {
    const kind = map.theme;
    const world = new World(map, { difficulty, partySize, seed, kind, ...extra });
    world.live = this.liveLoot();
    const room: Room = { id, kind, world, sessions: new Set(), emptyT: 0, difficulty, seed, partyId };
    this.rooms.set(id, room);
    return room;
  }

  // ─────────── Connection lifecycle ───────────
  connect(sessionId: string, accountId: string, rawChar: CharacterData, account: AccountProgress, send: Send, opts: { role?: string } = {}): void {
    const char = C.normalizeCharacter(rawChar);
    if (char.dead) { send({ t: 'err', msg: 'This Hardcore character has fallen and cannot be played.', fatal: true }); return; }
    // one live session per character
    for (const s of this.sessions.values()) if (s.char.id === char.id) this.disconnect(s.id, 'Logged in from another session');
    const s: Session = {
      id: sessionId, accountId, char, account: normalizeAccount(account), send, roomId: 'town', entId: 0, rids: [], bucket: 60, violations: 0, lastChat: -99,
      dirty: false, saveT: 30, partyId: null, invites: new Set(), blocked: new Set(), pendingChoice: null, run: null, closed: false,
      tradeId: null, guildInvites: new Set(), chatHist: [], mutedUntil: 0, friendReqs: new Set(), role: opts.role ?? 'player', gm: false,
    };
    this.sessions.set(sessionId, s);
    M.afkSettle(char, this.clock());
    const rc = this.reconnect.get(char.id);
    if (rc && rc.until > this.now && this.rooms.has(rc.roomId)) {
      this.reconnect.delete(char.id);
      this.joinRoom(s, rc.roomId, { x: rc.x, y: rc.y });
      this.toast(s, 'Reconnected to your previous instance.');
    } else this.joinRoom(s, 'town');
    if (this.announcement) this.toast(s, this.announcement);
    this.sendTutorial(s);
    if (char.afkPending) s.send({ t: 'afk', pending: char.afkPending });
    const g = this.guildOf(char.id);
    if (g) { const m = g.members.find((x) => x.charId === char.id)!; m.level = char.level; m.name = char.name; this.sendGuild(s); }
  }

  disconnect(sessionId: string, reason?: string) {
    const s = this.sessions.get(sessionId);
    if (!s || s.closed) return;
    s.closed = true;
    if (reason) s.send({ t: 'err', msg: reason, fatal: true });
    const room = this.rooms.get(s.roomId);
    const ent = room?.world.ents.get(s.entId);
    if (room && room.kind === 'dungeon' && ent && !ent.dead) this.reconnect.set(s.char.id, { roomId: room.id, until: this.now + 90, x: ent.x, y: ent.y });
    this.cancelTrade(s, 'Trade cancelled: player left');
    this.pf.delete(s.id);
    if (room?.kind === 'field' && ent && !ent.dead) M.afkStart(s.char, room.id, this.clock());
    this.leaveRoom(s);
    this.leaveParty(s);
    this.save(s);
    this.sessions.delete(sessionId);
  }

  private joinRoom(s: Session, roomId: string, pos?: { x: number; y: number }) {
    const room = this.rooms.get(roomId);
    if (!room) return;
    s.roomId = roomId;
    room.sessions.add(s.id);
    room.emptyT = 0;
    const ent = room.world.addPlayer(s.char, s.id, pos);
    ent.p!.partyId = s.partyId;
    ent.p!.aura = s.account.aura;
    ent.p!.costume = normalizeMeta(s.account.meta).cosmetics.costume;
    ent.p!.pet = s.account.pet;
    const guild = this.guildOf(s.char.id);
    if (guild) ent.name = `${s.char.name} ‹${guild.tag}›`;
    s.entId = ent.id;
    s.send({
      t: 'welcome', v: PROTOCOL_VERSION, mode: this.opts.label, pid: ent.id, room: { id: room.id, kind: room.kind, mode: room.mode, floor: room.floor, difficulty: room.difficulty, seed: room.seed, modifiers: room.world.map.modifiers, level: room.world.map.level },
      map: room.world.map, char: publicChar(s.char), account: s.account, content: this.contentPatch,
    });
    this.sendParty(s);
    if (room.kind === 'field') this.sendWorldEvent(s);
  }

  private leaveRoom(s: Session) {
    const room = this.rooms.get(s.roomId);
    if (!room) return;
    room.sessions.delete(s.id);
    room.world.removeEnt(s.entId);
    s.entId = 0;
  }

  /** Walk through a zone gate: arrive just inside the matching gate on the other side. */
  private travelGate(s: Session, room: Room, to: string) {
    const dest = this.rooms.get(to);
    if (!dest) return;
    const z = ZONE_MAP[to];
    if (z && s.char.level < z.levelMin - 2) { this.toast(s, `${z.name} is dangerous — enemies are level ${z.levelMin}-${z.levelMax}.`); if (s.char.level < z.levelMin - 5 && to !== 'field') return; }
    const back = dest.world.map.interactables.find((i) => i.type === 'zone_gate' && i.to === room.id);
    const pos = back ? { x: back.x + (back.x < dest.world.map.w * 16 ? 96 : -96), y: back.y } : undefined;
    this.moveTo(s, to, pos);
  }
  private moveTo(s: Session, roomId: string, pos?: { x: number; y: number }) {
    this.cancelTrade(s, 'Trade cancelled: player changed zone');
    this.leaveRoom(s);
    s.pendingChoice = null;
    this.joinRoom(s, roomId, pos);
    this.save(s);
  }

  // ─────────── Messages ───────────
  handle(sessionId: string, msg: any): void {
    const s = this.sessions.get(sessionId);
    if (!s || s.closed || !msg || typeof msg !== 'object' || typeof msg.t !== 'string') return;
    // token bucket rate limit
    if (s.bucket < 1) { if (++s.violations > 300) this.disconnect(s.id, 'Rate limit exceeded'); return; }
    s.bucket -= 1;
    // idempotency for state-changing requests
    if (MUTATIONS.has(msg.t)) {
      const rid = typeof msg.rid === 'string' ? msg.rid.slice(0, 40) : null;
      if (rid) { if (s.rids.includes(rid)) { this.sendChar(s); return; } s.rids.push(rid); if (s.rids.length > 200) s.rids.shift(); }
    }
    const room = this.rooms.get(s.roomId);
    if (!room) return;
    const w = room.world;
    const pid = s.entId;
    const err = (m: string | null) => { if (m) s.send({ t: 'err', msg: m }); };
    try {
      switch (msg.t) {
        case 'ping': s.send({ t: 'pong', c: msg.c }); break;
        case 'input': if (msg.mx || msg.my) this.tutorial(s, 'move'); w.setInput(pid, { mx: msg.mx, my: msg.my, ax: msg.ax, ay: msg.ay, attack: msg.atk, seq: Math.floor(Number(msg.q)) || 0 }); break;
        case 'cast': { const e = w.castSkill(pid, msg.k === 'u' ? 'ultimate' : 'active', clampInt(msg.s, 0, msg.k === 'u' ? 3 : 7), +msg.ax, +msg.ay, +msg.tid || 0); err(e); if (!e) this.tutorial(s, 'skill'); break; }
        case 'dodge': { const e = w.dodge(pid, +msg.dx, +msg.dy); err(e); if (!e) this.tutorial(s, 'dodge'); break; }
        case 'tutorial_skip': if ((s.char.tutorial ?? -1) >= 0) { s.char.tutorial = -1; s.dirty = true; this.sendTutorial(s); } break;
        case 'potion': err(w.usePotion(pid)); this.sendChar(s); break;
        case 'target': w.setTarget(pid, +msg.id || 0); break;
        case 'pickup': { const e = w.pickup(pid, +msg.id); if (e) err(e); else { s.dirty = true; } break; }
        case 'interact': this.interact(s, room); break;
        case 'choose': this.choose(s, room, String(msg.choice ?? '')); break;
        case 'enter_dungeon': this.enterDungeon(s, room, msg.diff, msg.mode); break;
        case 'ladder': s.send({ t: 'ladder', boards: this.ladder() }); break;
        case 'season_info': this.sendSeason(s); break;
        case 'season_claim': this.seasonClaim(s, clampInt(msg.tier, 1, 100)); break;
        case 'set_aura': { const id = msg.id === null ? null : String(msg.id); if (id && !s.account.auras.includes(id)) return err('You have not unlocked that aura'); s.account.aura = id; const en = room.world.ents.get(s.entId); if (en?.p) en.p.aura = id; this.saveAcct(s.accountId, s.account); this.sendChar(s); break; }
        case 'leave': if (room.kind !== 'town') this.returnToTown(s, room, false); break;
        case 'equip': { const r = C.equipFromInventory(s.char, clampInt(msg.inv, 0, s.char.inventory.length - 1), EQUIP_SLOTS.includes(msg.slot) ? msg.slot : undefined); this.mutate(s, r, 'equip'); if (r.ok) this.tutorial(s, 'equip'); break; }
        case 'unequip': this.mutate(s, EQUIP_SLOTS.includes(msg.slot) ? C.unequip(s.char, msg.slot as EquipSlot) : { ok: false, reason: 'Bad slot' }, 'unequip'); break;
        case 'move_inv': this.mutate(s, C.moveInventory(s.char, clampInt(msg.from, 0, s.char.inventory.length - 1), clampInt(msg.to, 0, s.char.inventory.length - 1)), null); break;
        case 'salvage': { if (!this.nearNpc(s, room, 'npc_salvager')) return err('Visit Salvager Grimm to salvage'); const it = s.char.inventory[clampInt(msg.inv, 0, s.char.inventory.length - 1)]; const r = C.salvageItem(s.char, clampInt(msg.inv, 0, s.char.inventory.length - 1)); this.mutate(s, r, 'salvage', { item: it?.uid, dust: r.ok ? r.value : 0 }); break; }
        case 'sell': { if (!this.nearNpc(s, room, 'npc_merchant')) return err('Visit Merchant Tobin to sell'); const it = s.char.inventory[clampInt(msg.inv, 0, s.char.inventory.length - 1)]; const r = C.sellItem(s.char, clampInt(msg.inv, 0, s.char.inventory.length - 1)); this.mutate(s, r, 'sell', { item: it?.uid, gold: r.ok ? r.value : 0 }); break; }
        case 'enchant': { if (!this.nearNpc(s, room, 'npc_enchanter')) return err('Visit Enchantress Lyra to enchant'); const loc = msg.slot && EQUIP_SLOTS.includes(msg.slot) ? { slot: msg.slot as EquipSlot } : { inv: clampInt(msg.inv, 0, s.char.inventory.length - 1) }; this.mutate(s, C.enchantItem(s.char, loc, clampInt(msg.affix, 0, 9), this.rng), 'enchant', loc); break; }
        case 'waypoint': {
          if (!this.nearNpc(s, room, 'npc_waymaster')) return err('Visit Waymaster Juno to travel');
          const z = ZONE_MAP[String(msg.zone)];
          if (!z) return err('Unknown destination');
          if (s.char.level < z.levelMin - 5 && z.id !== 'field') return err(`Reach level ${z.levelMin - 5} to travel to ${z.name}`);
          const cost = waypointCost(z.id);
          if (s.char.gold < cost) return err(`Need ${cost} gold`);
          s.char.gold -= cost;
          this.persist.audit({ accountId: s.accountId, charId: s.char.id, action: 'waypoint', data: { zone: z.id, cost } });
          const g = this.rooms.get(z.id)!.world.map.interactables.find((i) => i.id === 'gate_w')!;
          this.moveTo(s, z.id, { x: g.x + 96, y: g.y });
          break;
        }
        case 'buy_potion': {
          if (!this.nearNpc(s, room, 'npc_apothecary')) return err('Visit Apothecary Fenna for potions');
          if (s.char.potions >= POTION.maxCharges) return err('Potion belt is full');
          if (s.char.gold < POTION.buyPrice) return err(`Need ${POTION.buyPrice} gold`);
          s.char.gold -= POTION.buyPrice; s.char.potions++;
          this.mutate(s, { ok: true, value: undefined }, 'buy_potion', { gold: -POTION.buyPrice });
          break;
        }
        case 'loadout': { const r = Array.isArray(msg.active) && Array.isArray(msg.ultimate) ? C.setLoadout(s.char, msg.active.map(str), msg.ultimate.map(str)) : { ok: false as const, reason: 'Bad loadout' }; this.mutate(s, r, null); break; }
        case 'passive_alloc': { const r = C.allocatePassive(s.char, String(msg.node)); this.mutateStats(s, r); if (r.ok) this.tutorial(s, 'passive'); break; }
        case 'passive_refund': this.mutateStats(s, C.refundPassive(s.char, String(msg.node))); break;
        case 'respec': if (room.kind !== 'town') return err('Respec is only available in town'); this.mutateStats(s, C.respecAll(s.char, !!msg.token)); break;
        case 'preset_save': {
          const name = String(msg.name ?? 'Preset').slice(0, 20);
          s.char.presets = s.char.presets.filter((p) => p.name !== name).slice(0, 4);
          s.char.presets.push({ name, passives: s.char.passives.slice(), active: s.char.loadout.active.slice(), ultimate: s.char.loadout.ultimate.slice() });
          this.mutate(s, { ok: true, value: undefined }, null); break;
        }
        case 'preset_load': {
          if (room.kind !== 'town') return err('Presets can only be swapped in town');
          const p = s.char.presets[clampInt(msg.idx, 0, 4)];
          if (!p) return err('No such preset');
          const r = C.applyBuild(s.char, p.passives);
          if (r.ok) C.setLoadout(s.char, p.active, p.ultimate);
          this.mutateStats(s, r); break;
        }
        case 'import_build': {
          if (room.kind !== 'town') return err('Builds can only be imported in town');
          const b = decodeBuild(String(msg.code ?? ''));
          if (!b) return err('Invalid build code');
          if (b.c !== s.char.cls) return err('That build is for another class');
          const r = C.applyBuild(s.char, b.p.filter((x) => typeof x === 'string'));
          if (r.ok) { const lr = C.setLoadout(s.char, b.a, b.u); if (!lr.ok) this.toast(s, 'Passives applied; loadout skipped: ' + lr.reason); }
          this.mutateStats(s, r); break;
        }
        case 'use_map': {
          if (s.char.treasure) return err('You are already following a treasure map');
          if ((s.char.mats.treasure_map ?? 0) < 1) return err('You have no Treasure Map');
          if (room.kind !== 'field') return err('Read the map in the open world (Duskmeadow, Ashen Highlands or Starfall Wastes)');
          const m = room.world.map;
          const reach = reachableSet(m, m.spawn.x, m.spawn.y);
          let spot: [number, number] | null = null;
          for (let i = 0; i < 400 && !spot; i++) { const tx = this.rng.int(12, m.w - 6), ty = this.rng.int(4, m.h - 5); if (reach.has(ty * m.w + tx)) spot = [tx * TILE + 16, ty * TILE + 16]; }
          if (!spot) return err('The map is unreadable here');
          const a = this.rng.range(0, Math.PI * 2), off = this.rng.range(0, 220);
          s.char.mats.treasure_map! -= 1;
          s.char.treasure = { zone: room.id, x: spot[0], y: spot[1], hx: Math.round(spot[0] + Math.cos(a) * off), hy: Math.round(spot[1] + Math.sin(a) * off), hr: 300 };
          this.toast(s, 'The map marks a circle on your minimap. Search inside it and press Interact (E) to dig.');
          this.mutate(s, { ok: true, value: undefined }, 'use_map', { zone: room.id });
          break;
        }
        case 'craft': {
          const r = RECIPE_MAP[String(msg.recipe)];
          if (!r) return err('Unknown recipe');
          const npc = r.prof === 'smithing' ? 'npc_smith' : r.prof === 'cooking' ? 'npc_cook' : 'npc_alchemist';
          if (!this.nearNpc(s, room, npc)) return err(r.prof === 'smithing' ? 'Visit Brenna the Smith to forge' : r.prof === 'cooking' ? 'Visit Chef Bramble to cook' : 'Visit Sister Maelis to brew');
          const res = C.craft(s.char, r.id, typeof msg.slot === 'string' ? msg.slot : undefined, this.rng);
          if (!res.ok) return err(res.reason);
          this.toast(s, res.value.text);
          this.progressQuest(s, 'craft', r.prof, 1);
          this.weekly(s, 'craft', 1);
          this.mutate(s, { ok: true, value: undefined }, 'craft', { recipe: r.id, item: res.value.item?.uid });
          break;
        }
        case 'quest_accept': if (!this.nearNpc(s, room, 'npc_quests')) return err('Talk to Commander Aveline in Lumenhold'); this.questAccept(s, String(msg.id)); break;
        case 'quest_claim': if (!this.nearNpc(s, room, 'npc_quests')) return err('Talk to Commander Aveline in Lumenhold'); this.questClaim(s, String(msg.id)); break;
        case 'stash_put': case 'stash_take': this.stash(s, room, msg); break;
        case 'sell_many': case 'stash_put_many': case 'discard': this.batchItems(s, room, msg); break;
        case 'chat': this.chat(s, room, msg); break;
        case 'block': s.blocked.add(String(msg.name).slice(0, 16)); this.toast(s, `Blocked ${msg.name}`); break;
        case 'report': this.persist.audit({ accountId: s.accountId, charId: s.char.id, action: 'report', data: { name: String(msg.name).slice(0, 16), reason: String(msg.reason ?? '').slice(0, 200) } }); this.toast(s, 'Report submitted. Thank you.'); break;
        case 'party_invite': this.partyInvite(s, String(msg.name)); break;
        case 'gm_open': case 'gm': this.gmMsg(s, room, msg); break;
        case 'friend_request': case 'friend_accept': case 'friend_remove': case 'friend_list': this.friends(s, msg); break;
        case 'party_accept': this.partyAccept(s, String(msg.id)); break;
        case 'party_leave': this.leaveParty(s); break;
        case 'party_kick': this.partyKick(s, String(msg.name)); break;
        case 'party_transfer': this.partyTransfer(s, String(msg.name)); break;
        // party finder
        case 'pf_list': this.pfList(s); break;
        case 'pf_post': this.pfPost(s, msg); break;
        case 'pf_remove': this.pf.delete(s.id); this.pfList(s); break;
        case 'pf_join': this.pfJoin(s, String(msg.sid)); break;
        // direct trade
        case 'trade_request': if (!this.live.flags.trade) return err('Trading is temporarily disabled'); this.tradeRequest(s, room, String(msg.name)); break;
        case 'trade_respond': this.tradeRespond(s, room, String(msg.id), !!msg.accept); break;
        case 'trade_offer': this.tradeOffer(s, msg); break;
        case 'trade_lock': this.tradeLock(s); break;
        case 'trade_confirm': this.tradeConfirm(s); break;
        case 'trade_cancel': this.cancelTrade(s, `${s.char.name} cancelled the trade`); break;
        // auction house
        case 'ah_search': case 'ah_list': case 'ah_buy': case 'ah_cancel': case 'ah_claim': case 'ah_mine': this.auction(s, room, msg); break;
        // guilds
        case 'house_buy': case 'house_place': case 'house_remove': case 'house_perm': case 'house_visit': this.housing(s, room, msg); break;
        case 'guild_vault_put': case 'guild_vault_take': this.guildVault(s, room, msg); break;
        case 'pet_buy': case 'pet_set': this.pets(s, room, msg); break;
        case 'login_claim': case 'shop_buy': case 'benefit_claim': case 'awaken': case 'wish': case 'emblem_set': case 'cosmetic_set': case 'mount_toggle': case 'afk_claim': case 'bag_expand': this.metaMsg(s, room, msg); break;
        case 'guild_create': case 'guild_invite': case 'guild_accept': case 'guild_leave': case 'guild_kick': case 'guild_rank': case 'guild_transfer': case 'guild_motd': case 'guild_info': case 'guild_browse': case 'guild_apply': case 'guild_req': case 'guild_settings': case 'guild_ranking': case 'guild_withdraw_req': this.guild(s, room, msg); break;
        default: break;
      }
    } catch (e) {
      s.send({ t: 'err', msg: 'Server error handling request' });
      this.persist.audit({ accountId: s.accountId, charId: s.char.id, action: 'error', data: String((e as Error)?.stack ?? e).slice(0, 500) });
    }
  }

  private mutate(s: Session, r: C.Result<unknown>, auditAction: string | null, data?: unknown) {
    if (!r.ok) { s.send({ t: 'err', msg: r.reason }); return; }
    if (auditAction) this.persist.audit({ accountId: s.accountId, charId: s.char.id, action: auditAction, data: data ?? null });
    const ent = this.rooms.get(s.roomId)?.world.ents.get(s.entId);
    if (ent) ent.dirty = true;
    s.dirty = true;
    this.sendChar(s);
  }
  private mutateStats(s: Session, r: C.Result<unknown>) { this.mutate(s, r, null); }

  private sendChar(s: Session) { s.send({ t: 'char', char: publicChar(s.char), account: s.account }); }
  private toast(s: Session, msg: string) { s.send({ t: 'toast', msg }); }

  private nearNpc(s: Session, room: Room, type: string): boolean {
    if (room.kind !== 'town') return false;
    const e = room.world.ents.get(s.entId);
    const npc = room.world.map.interactables.find((i) => i.type === type);
    return !!e && !!npc && dist(e.x, e.y, npc.x, npc.y) < 180;
  }

  // ─────────── Interactions ───────────
  private interact(s: Session, room: Room) {
    const w = room.world;
    const ent = w.ents.get(s.entId);
    if (ent && !ent.dead && w.opts.noRespawn) {
      const down = [...w.ents.values()].find((o) => o.kind === 'player' && o.dead && dist(o.x, o.y, ent.x, ent.y) < 90);
      if (down) {
        if ((s.reviveCd ?? 0) > this.now) return this.toast(s, `Revive ready in ${Math.ceil(s.reviveCd! - this.now)}s`);
        down.dead = false; down.hp = Math.round(down.maxHp * 0.3); down.invuln = 2;
        s.reviveCd = this.now + 20;
        this.broadcast(room, { t: 'toast', msg: `${s.char.name} revived ${down.name}!` });
        return;
      }
    }
    const it = w.interactableNear(s.entId, 110);
    if (!it) { if (ent && !ent.dead) this.dig(s, room, ent.x, ent.y); return; }
    if (!ent || ent.dead) return;
    switch (it.type) {
      case 'portal_dungeon': s.send({ t: 'open', what: 'dungeon', unlocked: this.unlockedTiers(s), locks: Object.fromEntries(ACTIVITY_ORDER.map((a) => [a, this.activityLock(s, a)])) }); break;
      case 'zone_gate': this.travelGate(s, room, it.to ?? 'town'); break;
      case 'npc_alchemist': s.send({ t: 'open', what: 'alchemist' }); break;
      case 'npc_cook': s.send({ t: 'open', what: 'cook' }); break;
      case 'npc_enchanter': s.send({ t: 'open', what: 'enchanter' }); break;
      case 'npc_salvager': s.send({ t: 'open', what: 'salvager' }); break;
      case 'npc_merchant': s.send({ t: 'open', what: 'merchant' }); break;
      case 'npc_apothecary': s.send({ t: 'open', what: 'apothecary' }); break;
      case 'npc_stable': s.send({ t: 'open', what: 'stable' }); break;
      case 'npc_guild': s.send({ t: 'open', what: 'guild' }); this.sendGuild(s); break;
      case 'npc_stylist': s.send({ t: 'open', what: 'wardrobe' }); break;
      case 'npc_tailor': s.send({ t: 'open', what: 'tailor' }); break;
      case 'npc_wish': s.send({ t: 'open', what: 'wish' }); break;
      case 'npc_awaken': s.send({ t: 'open', what: 'awaken' }); break;
      case 'npc_shop': s.send({ t: 'open', what: 'shop' }); break;
      case 'npc_waymaster': s.send({ t: 'open', what: 'waymaster' }); break;
      case 'npc_carpenter': s.send({ t: 'open', what: 'carpenter' }); break;
      case 'house_door': this.enterHouse(s, s); break;
      case 'house_exit': { const d = this.rooms.get('town')!.world.map.interactables.find((i) => i.type === 'house_door')!; this.moveTo(s, 'town', { x: d.x, y: d.y + 40 }); break; }
      case 'npc_smith': s.send({ t: 'open', what: 'smith' }); break;
      case 'npc_trainer': s.send({ t: 'open', what: 'trainer' }); break;
      case 'npc_quartermaster': s.send({ t: 'open', what: 'quartermaster' }); break;
      case 'npc_quests': s.send({ t: 'open', what: 'quests' }); break;
      case 'stash': s.send({ t: 'open', what: 'stash' }); break;
      case 'npc_auction': s.send({ t: 'open', what: 'auction' }); this.auction(s, room, { t: 'ah_search', q: {} }); this.auction(s, room, { t: 'ah_mine' }); break;
      case 'fishing': {
        if ((it.req ?? 0) > C.profLevel(s.char, 'fishing')) return this.toast(s, `Requires Fishing level ${it.req}`);
        const f = s.fishing;
        if (f && f.spot === it.id) {
          s.fishing = null;
          if (!f.bit || this.now > f.until) return this.toast(s, f.bit ? 'Too slow — it got away.' : 'Too early! You scared it off.');
          const lv = C.profLevel(s.char, 'fishing');
          const res = it.res === 'fish' && this.rng.chance(0.05 + 0.03 * lv) ? 'golden_carp' : it.res ?? 'fish';
          C.addMats(s.char, { [res]: 1 });
          const ups = C.grantProfXp(s.char, 'fishing', res === 'golden_carp' ? 40 : 15);
          this.weekly(s, 'gather', 1);
          this.toast(s, `Caught a ${MATERIALS[res]?.name ?? res}!${ups ? ` · Fishing level ${C.profLevel(s.char, 'fishing')}!` : ''}`);
          s.send({ t: 'fish', state: 'caught', res });
          this.mutate(s, { ok: true, value: undefined }, 'fish', { spot: it.id, res });
          return;
        }
        const wait = this.rng.range(2, 5);
        s.fishing = { spot: it.id, x: it.x, y: it.y, res: it.res ?? 'fish', biteAt: this.now + wait, until: this.now + wait + 1.2, bit: false };
        s.send({ t: 'fish', state: 'cast' });
        break;
      }
      case 'herb': case 'ore': {
        const prof = it.type === 'ore' ? 'mining' : 'herbalism';
        if ((it.req ?? 0) > C.profLevel(s.char, prof)) return this.toast(s, `Requires ${PROFESSIONS[prof].name} level ${it.req}`);
        if (this.herbCooldown(s, it.id)) return this.toast(s, it.type === 'ore' ? 'This vein is depleted for now.' : 'This bloom is still regrowing.');
        const res = it.res ?? 'moonpetal';
        const n = 1 + (this.rng.chance(0.15 * C.profLevel(s.char, prof)) ? 1 : 0);
        C.addMats(s.char, { [res]: n });
        s.char.dust += 1;
        const ups = C.grantProfXp(s.char, prof, it.req ? 25 : 12);
        this.progressQuest(s, 'gather', it.type, 1);
        this.weekly(s, 'gather', 1);
        this.toast(s, `Gathered ${n} ${MATERIALS[res]?.name ?? res} (+1 Astral Dust)${ups ? ` · ${PROFESSIONS[prof].name} level ${C.profLevel(s.char, prof)}!` : ''}`);
        this.mutate(s, { ok: true, value: undefined }, 'gather', { node: it.id, res, n });
        break;
      }
      case 'chest': {
        it.used = true;
        const gold = Math.round((20 + room.world.map.level * 8) * (room.world.modifierFlags.has('extra_gold') ? 2.5 : 1) * this.effects().goldMul);
        w.addDrop(ent, it.x, it.y + 20, undefined, gold);
        for (let i = 0; i < 2; i++) w.addDrop(ent, it.x + (i ? 24 : -24), it.y + 30, generateItem({ rng: this.rng, ilvl: room.world.map.level, rarity: rollRarity(this.rng, 0.5 + DIFFICULTIES[room.difficulty].loot, 'uncommon'), cls: s.char.cls, hardcore: s.char.hardcore }));
        this.broadcast(room, { t: 'it_used', id: it.id });
        break;
      }
      case 'fountain': {
        it.used = true;
        for (const sid of room.sessions) { const o = this.sessions.get(sid); const e = w.ents.get(o?.entId ?? 0); if (o && e && !e.dead) { e.hp = e.maxHp; o.char.potions = POTION.maxCharges; this.sendChar(o); } }
        this.broadcast(room, { t: 'it_used', id: it.id });
        this.broadcast(room, { t: 'toast', msg: 'The Moonwell restores the party (life and potions refilled).' });
        break;
      }
      case 'shrine': {
        const pool = BLESSINGS.filter((b) => !b.curse && !(ent.p!.blessings.includes(b.id)));
        const opts = new Rng(room.seed ^ it.x ^ s.entId).shuffle(pool.slice()).slice(0, 3).map((b) => b.id);
        s.pendingChoice = { kind: 'shrine', options: opts, itId: it.id };
        s.send({ t: 'choice', kind: 'shrine', options: opts.map((id) => BLESSING_MAP[id]) });
        break;
      }
      case 'altar': {
        const pool = BLESSINGS.filter((b) => b.curse);
        const opts = pool.map((b) => b.id);
        s.pendingChoice = { kind: 'altar', options: opts, itId: it.id };
        s.send({ t: 'choice', kind: 'altar', options: opts.map((id) => BLESSING_MAP[id]) });
        break;
      }
      case 'exit': if (room.mode === 'tower') this.towerNext(room); else this.returnToTown(s, room, true); break;
      default: break;
    }
  }

  /** Treasure hunting: digging gives warm/cold feedback; within 70px of the exact spot unearths the cache. */
  private dig(s: Session, room: Room, x: number, y: number) {
    const tr = s.char.treasure;
    if (!tr || tr.zone !== room.id) return;
    const d = dist(x, y, tr.x, tr.y);
    if (d > 70) return this.toast(s, d < 200 ? 'Warm — the soil here was disturbed recently.' : d < 450 ? 'Lukewarm — keep searching inside the circle.' : 'Cold — nothing buried here.');
    s.char.treasure = null;
    const lvl = room.world.map.level + 6;
    const ent = room.world.ents.get(s.entId)!;
    room.world.addDrop(ent, x, y - 20, undefined, Math.round((100 + lvl * 20) * this.effects().goldMul));
    for (let i = 0; i < 2; i++) room.world.addDrop(ent, x + (i ? 26 : -26), y + 10, generateItem({ rng: this.rng, ilvl: lvl, rarity: rollRarity(this.rng, 0.8, 'rare'), cls: s.char.cls, hardcore: s.char.hardcore }));
    s.char.dust += 10;
    if (this.rng.chance(0.15)) C.addMats(s.char, { treasure_map: 1 });
    this.progressQuest(s, 'treasure', undefined, 1);
    this.achieve(s, 'treasure_hunter');
    this.toast(s, 'You unearthed a buried cache!');
    this.mutate(s, { ok: true, value: undefined }, 'treasure_dig', { zone: room.id });
  }

  private herbCd = new Map<string, number>();
  private herbCooldown(s: Session, nodeId: string): boolean {
    const k = s.char.id + ':' + nodeId;
    const t = this.herbCd.get(k) ?? 0;
    if (t > this.now) return true;
    this.herbCd.set(k, this.now + 120);
    return false;
  }

  private choose(s: Session, room: Room, choice: string) {
    const pc = s.pendingChoice;
    if (!pc) return;
    const it = room.world.map.interactables.find((i) => i.id === pc.itId);
    if (!it || (pc.kind === 'shrine' && it.used)) { s.pendingChoice = null; return; }
    if (choice === 'decline') { s.pendingChoice = null; return; }
    if (!pc.options.includes(choice)) return s.send({ t: 'err', msg: 'Invalid choice' });
    const e = room.world.applyBlessing(s.entId, choice);
    if (e) return s.send({ t: 'err', msg: e });
    s.pendingChoice = null;
    // A shrine serves every party member once; mark used when all have chosen (simplified: per-player use)
    if (pc.kind === 'altar') it.used = true;
    else { const users = ((it as unknown as { users?: string[] }).users ??= []); users.push(s.char.id); if (users.length >= room.sessions.size) { it.used = true; this.broadcast(room, { t: 'it_used', id: it.id }); } }
    this.toast(s, `${BLESSING_MAP[choice]!.name} — lasts until this run ends.`);
    this.sendRunState(s, room);
  }

  private sendRunState(s: Session, room: Room) {
    const e = room.world.ents.get(s.entId);
    s.send({ t: 'run', blessings: e?.p?.blessings ?? [] });
  }

  private unlockedTiers(s: Session): DifficultyId[] {
    return DIFFICULTY_ORDER.filter((d, i) => s.char.level >= DIFFICULTIES[d].minLevel && i <= Math.max(1, s.char.stats.highestTier + 1));
  }

  private enterDungeon(s: Session, room: Room, diffRaw: unknown, modeRaw: unknown = 'rift') {
    if (room.kind !== 'town') return;
    const mode: Activity = (ACTIVITY_ORDER as string[]).includes(String(modeRaw)) ? (modeRaw as Activity) : 'rift';
    const act = ACTIVITIES[mode];
    if ((mode === 'tower' && !this.live.flags.tower) || (mode === 'raid' && !this.live.flags.raid)) return s.send({ t: 'err', msg: `${act.name} is temporarily closed` });
    let diff = (DIFFICULTY_ORDER as string[]).includes(String(diffRaw)) ? (diffRaw as DifficultyId) : 'normal';
    if (!act.chooseDifficulty) diff = 'normal';
    if (mode === 'nightmare' && DIFFICULTY_ORDER.indexOf(diff) < 2) diff = 'hard';
    const ent = room.world.ents.get(s.entId);
    const portal = room.world.map.interactables.find((i) => i.type === 'portal_dungeon')!;
    if (!ent || dist(ent.x, ent.y, portal.x, portal.y) > 200) return s.send({ t: 'err', msg: 'Stand at the Rift Gate to enter' });
    const party = s.partyId ? this.parties.get(s.partyId) : null;
    if (party && party.leader !== s.id) return s.send({ t: 'err', msg: 'Only the party leader can open the Rift' });
    const members = (party ? party.members : [s.id]).map((id) => this.sessions.get(id)!).filter((m) => m && m.roomId === 'town');
    if (members.length > act.maxParty) return s.send({ t: 'err', msg: `${act.name} allows at most ${act.maxParty} players` });
    for (const m of members) {
      const lock = this.activityLock(m, mode);
      if (lock) return s.send({ t: 'err', msg: `${m.char.name}: ${lock}` });
      if (act.chooseDifficulty && !this.unlockedTiers(m).includes(diff) && !(mode === 'nightmare' && diff === 'hard')) return s.send({ t: 'err', msg: `${m.char.name} has not unlocked ${DIFFICULTIES[diff].name}` });
    }
    const level = Math.max(...members.map((m) => m.char.level));
    const seed = Math.floor(this.rng.next() * 0xffffffff) >>> 0;
    const id = this.openInstance(mode, diff, seed, level, 1, members.length, party?.id ?? null);
    for (const m of members) {
      m.run = { kills: 0, gold: 0, items: 0, xp: 0, startGold: m.char.gold };
      this.tutorial(m, 'rift');
      this.moveTo(m, id);
      this.toast(m, `Entered ${act.name} (${act.chooseDifficulty ? DIFFICULTIES[diff].name : 'scaling'}). Seed ${seed}.`);
      if (mode === 'raid' && members.length < 4) this.toast(m, 'The raid is tuned for 4-8 players — expect a hard fight.');
    }
    this.persist.audit({ accountId: s.accountId, charId: s.char.id, action: 'dungeon_enter', data: { mode, seed, diff, level, party: members.map((m) => m.char.id) } });
  }

  /** Requirement check for an activity; returns a reason or null. */
  activityLock(s: Session, mode: Activity): string | null {
    const a = ACTIVITIES[mode];
    if (s.char.level < a.minLevel) return `${a.name} unlocks at level ${a.minLevel}`;
    if (a.needTier !== undefined && s.char.stats.highestTier < a.needTier) return `${a.name} requires clearing a ${DIFFICULTIES[DIFFICULTY_ORDER[a.needTier]!].name} Rift`;
    return null;
  }

  private openInstance(mode: Activity, diff: DifficultyId, seed: number, level: number, floor: number, partySize: number, partyId: string | null): string {
    let map: GameMap;
    const extra: Partial<WorldOptions> = {};
    switch (mode) {
      case 'tower': {
        const boss = floor % 5 === 0 ? 'veyra' : 'hollow_captain';
        map = generateDungeon({ seed, level: level + Math.floor(floor / 2), difficulty: diff, layout: 'tower', floor, boss });
        Object.assign(extra, { finalBoss: boss, scale: towerScale(floor), ilvlBonus: Math.floor(floor / 2), exitText: `Floor ${floor} cleared! The stairs upward are open.` });
        break;
      }
      case 'labyrinth': map = generateLabyrinth(seed, level + 1); Object.assign(extra, { finalBoss: 'labyrinth_warden', ilvlBonus: 3, exitText: 'Oruk falls and the maze grows still. The way out is open.' }); break;
      case 'arena': map = buildArena('arena', seed, level); Object.assign(extra, { finalBoss: '__none__', noRespawn: true }); break;
      case 'raid': map = buildArena('raid', seed, level + 2); Object.assign(extra, { finalBoss: 'sovereign', noRespawn: true, ilvlBonus: 5, exitText: 'The Eclipse Sovereign is defeated! Light returns to the Throne.' }); partySize = Math.max(2, partySize); break;
      case 'nightmare': map = generateDungeon({ seed, level: level + 2, difficulty: diff, modifiers: NIGHTMARE_MODS }); Object.assign(extra, { ilvlBonus: 2 }); break;
      case 'eclipse': map = generateDungeon({ seed, level: level + 3, difficulty: diff, pool: ECLIPSE_POOL, eliteChance: 0.08 }); Object.assign(extra, { ilvlBonus: 4, pressureEvery: 45, exitText: 'The Eclipse Dimension collapses behind you. A way out has opened.' }); break;
      default: map = generateDungeon({ seed, level, difficulty: diff, eliteChance: this.effects().eliteBonus });
    }
    const id = `${mode}_${seed.toString(36)}_${floor}`;
    const r = this.createRoom(id, map, diff, seed, partySize, partyId, extra);
    r.mode = mode; r.floor = floor; r.startedAt = this.now;
    if (mode === 'arena') r.arena = { wave: 0, nextT: this.now + 3 };
    return id;
  }

  /** Endless Tower: move everyone on this floor to a freshly generated next floor. */
  private towerNext(room: Room) {
    const floor = room.floor ?? 1;
    const members = [...room.sessions].map((id) => this.sessions.get(id)!).filter(Boolean);
    for (const m of members) { this.record(m, 'tower', floor); if (floor >= 10) this.achieve(m, 'tower10'); this.progressQuest(m, 'tower_floor', undefined, floor, true); this.weekly(m, 'tower_floor', floor + 1, true); this.seasonGain(m, SHARD_SOURCES.towerFloor); this.guildXp(m, 20 * floor, `reached tower floor ${floor + 1}`); }
    const level = Math.max(...members.map((m) => m.char.level));
    const id = this.openInstance('tower', 'normal', Math.floor(this.rng.next() * 0xffffffff) >>> 0, level, floor + 1, members.length, room.partyId);
    for (const m of members) { this.moveTo(m, id); this.toast(m, `Endless Tower — floor ${floor + 1} (enemies ×${towerScale(floor + 1).toFixed(2)})`); }
  }

  private returnToTown(s: Session, room: Room, cleared: boolean) {
    const ent = room.world.ents.get(s.entId);
    const blessings = ent?.p?.blessings ?? [];
    if (room.kind === 'dungeon') {
      const mode = room.mode ?? 'rift';
      const won = cleared && room.world.bossDefeated;
      if (won) {
        s.char.stats.runsCleared++;
        this.tutorial(s, 'clear');
        const ti = DIFFICULTY_ORDER.indexOf(room.difficulty);
        if (mode === 'rift' || mode === 'nightmare') {
          s.char.stats.highestTier = Math.max(s.char.stats.highestTier, ti);
          if (ti >= 2) { this.progressQuest(s, 'clear_tier', 'hard', 1); this.achieve(s, 'tier_hard'); }
          if (ti >= 4) this.achieve(s, 'tier_nightmare');
        }
        if (mode === 'labyrinth') { this.achieve(s, 'labyrinth'); this.progressQuest(s, 'clear_mode', 'labyrinth', 1); }
        if (mode === 'raid') { this.achieve(s, 'raid_clear'); this.progressQuest(s, 'clear_mode', 'raid', 1); }
        if (mode === 'nightmare') {
          this.progressQuest(s, 'clear_mode', 'nightmare', 1);
          if (this.now - (room.startedAt ?? this.now) <= 600) {
            this.achieve(s, 'nightmare_timed');
            const bonus = generateItem({ rng: this.rng, ilvl: room.world.map.level + 2, rarity: rollRarity(this.rng, 1.5, 'epic'), cls: s.char.cls, hardcore: s.char.hardcore });
            if (C.addItem(s.char, bonus).ok) this.toast(s, `Timed bonus: ${bonus.name}`);
          }
        }
        this.guildXp(s, 100 + 100 * ti + (mode === 'raid' ? 500 : mode === 'labyrinth' ? 200 : 0), `cleared ${ACTIVITIES[mode].name}`);
        this.seasonGain(s, (SHARD_SOURCES.riftClear + SHARD_SOURCES.perTierBonus * ti + (mode === 'raid' ? SHARD_SOURCES.raid : 0) + room.world.pressure * 3) * (mode === 'eclipse' ? 2 : 1));
        if (mode === 'eclipse') { this.achieve(s, 'eclipse_walker'); if (room.world.pressure >= 8) this.achieve(s, 'eclipse_deep'); }
        this.weekly(s, 'rift_clear', 1);
      }
      if (mode === 'arena') {
        const wave = Math.max(0, (room.arena?.wave ?? 1) - 1);
        this.record(s, 'arena', wave);
        if (wave >= 10) this.achieve(s, 'arena10');
        this.progressQuest(s, 'arena_wave', undefined, wave, true);
        this.weekly(s, 'arena_wave', wave, true);
        this.seasonGain(s, wave * SHARD_SOURCES.arenaWave);
        const gold = wave * 15;
        s.char.gold += gold;
        this.toast(s, `Arena: survived ${wave} waves (+${gold} gold)`);
      }
      if (mode === 'tower') this.record(s, 'tower', (room.floor ?? 1) - 1);
      const r = s.run;
      s.send({ t: 'run_end', mode, cleared: won || mode === 'arena', floor: room.floor, wave: room.arena ? Math.max(0, room.arena.wave - 1) : undefined, retained: { gold: r ? s.char.gold - r.startGold : 0, items: r?.items ?? 0, xp: r?.xp ?? 0, kills: r?.kills ?? 0 }, lost: blessings.map((b) => BLESSING_MAP[b]?.name ?? b), seed: room.seed, difficulty: room.difficulty });
      this.persist.audit({ accountId: s.accountId, charId: s.char.id, action: 'run_end', data: { mode, won, diff: room.difficulty, floor: room.floor, wave: room.arena?.wave, secs: Math.round(this.now - (room.startedAt ?? this.now)) } });
      s.run = null;
      if (ent?.dead) { ent.dead = false; }
    }
    this.moveTo(s, 'town');
  }

  // ─────────── Arena waves & raid wipes ───────────
  private tickInstance(room: Room) {
    if (room.kind !== 'dungeon' || !room.sessions.size) return;
    const w = room.world;
    const players = [...w.ents.values()].filter((e) => e.kind === 'player');
    if (w.opts.noRespawn && players.length && players.every((p) => p.dead)) {
      const wipe = room.mode === 'raid';
      for (const sid of [...room.sessions]) { const o = this.sessions.get(sid); if (o) { if (wipe) this.toast(o, 'Your group was defeated. The Sovereign waits.'); this.returnToTown(o, room, false); } }
      return;
    }
    if (room.mode === 'raid' && w.bossDefeated) for (const p of players) if (p.dead) { p.dead = false; p.hp = Math.round(p.maxHp * 0.5); }
    if (room.mode === 'arena' && room.arena) {
      const a = room.arena;
      const alive = [...w.ents.values()].some((e) => e.kind === 'enemy');
      if (alive) { a.nextT = this.now + 4; return; }
      if (this.now < a.nextT) return;
      a.wave++;
      const lvl = w.map.level + Math.floor(a.wave / 3);
      const n = Math.min(14, 2 + a.wave);
      const c = w.map.rooms[0]!;
      const pool = a.wave < 4 ? ['hollow_grunt', 'gloomfang'] : ['hollow_grunt', 'hollow_archer', 'hollow_hexer', 'gloomfang', 'wisp', 'thornback'];
      for (let i = 0; i < n; i++) {
        const ang = (i / n) * Math.PI * 2, rr = (c.w / 2 - 3) * TILE;
        const e = w.spawnEnemy(this.rng.pick(pool), c.cx * TILE + Math.cos(ang) * rr, c.cy * TILE + Math.sin(ang) * rr, lvl, a.wave >= 6 && i === 0, 0);
        if (e) e.e!.awake = true;
      }
      if (a.wave % 5 === 0) { const b = w.spawnEnemy(a.wave % 10 === 0 ? 'hollow_captain' : 'hollow_brute', c.cx * TILE, (c.cy - 6) * TILE, lvl, true, 0); if (b) b.e!.awake = true; }
      this.broadcast(room, { t: 'activity', mode: 'arena', wave: a.wave });
      this.broadcast(room, { t: 'toast', msg: `Wave ${a.wave}${a.wave % 5 === 0 ? ' — champion wave!' : ''}` });
    }
  }

  // ─────────── Leaderboards ───────────
  private record(s: Session, board: string, value: number) {
    if (value <= 0) return;
    const key = `${board}:${s.char.id}`;
    const prev = this.records.get(key);
    if (prev && prev.value >= value) return;
    const rec: LeaderRecord = { board, charId: s.char.id, name: s.char.name, cls: s.char.cls, hardcore: s.char.hardcore, value, at: this.clock() };
    this.records.set(key, rec);
    this.tx({ records: [rec] });
    this.toast(s, `New personal best (${board}): ${value}`);
  }
  ladder() {
    const out: Record<string, { normal: LeaderRecord[]; hardcore: LeaderRecord[] }> = {};
    for (const r of this.records.values()) {
      const b = (out[r.board] ??= { normal: [], hardcore: [] });
      (r.hardcore ? b.hardcore : b.normal).push(r);
    }
    for (const b of Object.values(out)) for (const k of ['normal', 'hardcore'] as const) b[k] = b[k].sort((x, y) => y.value - x.value || x.at - y.at).slice(0, 20);
    return out;
  }

  // ─────────── Quests / achievements ───────────
  private questAccept(s: Session, id: string) {
    const q = QUEST_MAP[id];
    if (!q) return;
    if (s.char.quests[id]) return s.send({ t: 'err', msg: 'Already accepted' });
    if (q.requires && !s.char.quests[q.requires]?.claimed) return s.send({ t: 'err', msg: 'Complete the previous quest first' });
    s.char.quests[id] = { progress: 0, done: false, claimed: false };
    this.tutorial(s, 'quest');
    this.mutate(s, { ok: true, value: undefined }, null);
  }
  private questClaim(s: Session, id: string) {
    const q = QUEST_MAP[id];
    const st = s.char.quests[id];
    if (!q || !st?.done || st.claimed) return s.send({ t: 'err', msg: 'Quest not complete' });
    st.claimed = true;
    const r = q.reward;
    s.char.gold += r.gold ?? 0;
    s.char.dust += r.dust ?? 0;
    s.char.potions = Math.min(POTION.maxCharges, s.char.potions + (r.potions ?? 0));
    s.char.bonusPoints += r.bonusPoints ?? 0;
    s.char.respecTokens += r.respecTokens ?? 0;
    if (r.mats) C.addMats(s.char, r.mats);
    if (r.xp) this.giveXp(s, r.xp);
    this.mutate(s, { ok: true, value: undefined }, 'quest_reward', { quest: id, reward: r });
    this.toast(s, `Quest complete: ${q.name}`);
  }
  private progressQuest(s: Session, kind: string, target: string | undefined, n: number, absolute = false) {
    for (const q of QUESTS) {
      const st = s.char.quests[q.id];
      if (!st || st.done || q.objective.kind !== kind) continue;
      if (q.objective.target && q.objective.target !== target) continue;
      st.progress = Math.min(q.objective.count, absolute ? Math.max(st.progress, n) : st.progress + n);
      if (st.progress >= q.objective.count) { st.done = true; this.toast(s, `Objective complete: ${q.name} — return to ${q.giver}`); }
      s.dirty = true;
    }
  }
  private achieve(s: Session, id: string) {
    if (s.account.achievements.includes(id) || !ACHIEVEMENTS[id]) return;
    s.account.achievements.push(id);
    const t = ACHIEVEMENTS[id]!.title;
    if (t && !s.account.titles.includes(t)) s.account.titles.push(t);
    s.send({ t: 'achievement', id, name: ACHIEVEMENTS[id]!.name });
    this.saveAcct(s.accountId, s.account);
  }

  private giveXp(s: Session, xp: number) {
    const before = s.char.level;
    const r = C.grantXp(s.char, xp);
    if (s.run) s.run.xp += Math.round(xp);
    if (r.levels > 0) {
      const ent = this.rooms.get(s.roomId)?.world.ents.get(s.entId);
      if (ent) { ent.dirty = true; ent.hp = Number.MAX_SAFE_INTEGER; this.rooms.get(s.roomId)!.world.refresh(ent); ent.hp = ent.maxHp; }
      // auto-slot newly unlocked skills into empty slots
      for (const sk of classSkills(s.char.cls)) {
        if (sk.unlockLevel <= before || sk.unlockLevel > s.char.level) continue;
        const arr = sk.kind === 'active' ? s.char.loadout.active : s.char.loadout.ultimate;
        const free = arr.indexOf(null);
        if (free >= 0 && !arr.includes(sk.id)) { arr[free] = sk.id; this.toast(s, `New skill: ${sk.name} (equipped)`); }
        else if (!arr.includes(sk.id)) this.toast(s, `New skill unlocked: ${sk.name} — equip it from Skills (K)`);
      }
      this.toast(s, `Level up! You are now level ${s.char.level}. (+${r.levels} passive point${r.levels > 1 ? 's' : ''})`);
      this.broadcast(this.rooms.get(s.roomId)!, { t: 'ev', list: [{ t: 'level', id: s.entId }] });
      this.record(s, 'level', s.char.level);
      if (s.char.level >= 10 && before < 10) this.achieve(s, 'level10');
      if (s.char.level >= 25 && before < 25) this.achieve(s, 'level25');
      this.save(s);
    }
    if (r.masteryLevels > 0) {
      const title = C.masteryTitle(s.char.cls, s.char.mastery.level);
      this.toast(s, `${CLASSES[s.char.cls].name} Mastery ${s.char.mastery.level}${title ? ` — title "${title}"` : ''}`);
      if (title && !s.account.titles.includes(title)) { s.account.titles.push(title); this.saveAcct(s.accountId, s.account); }
    }
    s.dirty = true;
  }

  // ─────────── Stash (account storage, separated by mode) ───────────
  /** Sell or store several selected items in one go (one transaction). */
  private batchItems(s: Session, room: Room, msg: any) {
    // Invalid indexes are dropped, never clamped: clamping could hit an item the player did not pick.
    const idx = [...new Set((Array.isArray(msg.inv) ? msg.inv : []).slice(0, 80).filter((v: unknown) => Number.isInteger(v) && (v as number) >= 0 && (v as number) < s.char.inventory.length))] as number[];
    if (!idx.length) return;
    let n = 0, gold = 0, skipped = 0;
    if (msg.t === 'discard') {
      // Destroy (not drop on the ground: ground drops would bypass trade/bound rules). Item ids are audited for support recovery.
      const gone: Item[] = [];
      for (const i of idx) { const it = s.char.inventory[i]; if (!it) continue; gone.push(it); s.char.inventory[i] = null; n++; }
      this.tx({ characters: [s.char] });
      this.persist.audit({ accountId: s.accountId, charId: s.char.id, action: 'discard', data: { n, items: gone } });
      this.toast(s, `Discarded ${n} item${n === 1 ? '' : 's'}`);
      return this.mutate(s, { ok: true, value: undefined }, null);
    }
    if (msg.t === 'sell_many') {
      if (!this.nearNpc(s, room, 'npc_merchant')) return s.send({ t: 'err', msg: 'Visit Merchant Tobin to sell' });
      for (const i of idx) { const r = C.sellItem(s.char, i); if (r.ok) { n++; gold += r.value; } else skipped++; }
      this.tx({ characters: [s.char] });
      this.toast(s, `Sold ${n} item${n === 1 ? '' : 's'} for ${gold} gold${skipped ? ` (${skipped} skipped)` : ''}`);
    } else {
      if (!this.nearNpc(s, room, 'stash')) return s.send({ t: 'err', msg: 'Visit the Astral Vault' });
      const box = s.char.hardcore ? s.account.stash.hardcore : s.account.stash.normal;
      for (const i of idx) { const it = s.char.inventory[i]; if (!it || it.bound) { skipped++; continue; } const j = box.indexOf(null); if (j < 0) { skipped++; continue; } box[j] = it; s.char.inventory[i] = null; n++; }
      this.tx({ characters: [s.char], accounts: [{ id: s.accountId, progress: s.account }] });
      this.toast(s, `Stored ${n} item${n === 1 ? '' : 's'}${skipped ? ` (${skipped} skipped: bound or vault full)` : ''}`);
    }
    this.persist.audit({ accountId: s.accountId, charId: s.char.id, action: msg.t, data: { n, gold } });
    this.mutate(s, { ok: true, value: undefined }, null);
  }
  private stash(s: Session, room: Room, msg: any) {
    if (!this.nearNpc(s, room, 'stash')) return s.send({ t: 'err', msg: 'Visit the Astral Vault' });
    const box = s.char.hardcore ? s.account.stash.hardcore : s.account.stash.normal;
    if (msg.t === 'stash_put') {
      const i = clampInt(msg.inv, 0, s.char.inventory.length - 1);
      const it = s.char.inventory[i];
      if (!it) return;
      if (it.bound) return s.send({ t: 'err', msg: 'Bound items cannot be stored in the shared vault' });
      const j = box.findIndex((x) => x === null);
      if (j < 0) return s.send({ t: 'err', msg: 'Vault is full' });
      box[j] = it; s.char.inventory[i] = null;
    } else {
      const j = clampInt(msg.idx, 0, STASH_SIZE - 1);
      const it = box[j];
      if (!it) return;
      const r = C.addItem(s.char, it);
      if (!r.ok) return s.send({ t: 'err', msg: r.reason });
      box[j] = null;
    }
    // vault (account) and bag (character) change together in one transaction so an item can never be duplicated or lost
    this.tx({ characters: [s.char], accounts: [{ id: s.accountId, progress: s.account }] });
    this.mutate(s, { ok: true, value: undefined }, msg.t, { idx: msg.idx ?? msg.inv });
  }

  // ─────────── Chat & social ───────────
  private chat(s: Session, room: Room, msg: any) {
    const text = String(msg.text ?? '').replace(/[\u0000-\u001f\u007f]/g, '').trim().slice(0, 200);
    if (!text) return;
    if (this.now < s.mutedUntil) return s.send({ t: 'err', msg: `You are muted for ${Math.ceil(s.mutedUntil - this.now)}s (spam protection)` });
    if (this.now - s.lastChat < 0.7) return s.send({ t: 'err', msg: 'You are sending messages too quickly' });
    s.lastChat = this.now;
    s.chatHist = s.chatHist.filter((h) => this.now - h.t < 15);
    if (s.chatHist.filter((h) => h.text === text).length >= 2) {
      s.mutedUntil = this.now + 30;
      this.persist.audit({ accountId: s.accountId, charId: s.char.id, action: 'auto_mute', data: { text } });
      return s.send({ t: 'err', msg: 'Repeated message — chat muted for 30s' });
    }
    s.chatHist.push({ text, t: this.now });
    const out = { t: 'chat', from: s.char.name, ch: 'local', text };
    if (msg.ch === 'guild') {
      const g = this.guildOf(s.char.id);
      if (!g) return s.send({ t: 'err', msg: 'You are not in a guild' });
      for (const o of this.sessions.values()) if (g.members.some((m) => m.charId === o.char.id) && !o.blocked.has(s.char.name)) o.send({ ...out, ch: 'guild' });
    } else if (msg.ch === 'party') {
      const p = s.partyId ? this.parties.get(s.partyId) : null;
      if (!p) return s.send({ t: 'err', msg: 'You are not in a party' });
      for (const id of p.members) this.sessions.get(id)?.send({ ...out, ch: 'party' });
    } else if (msg.ch === 'whisper') {
      const to = [...this.sessions.values()].find((o) => o.char.name.toLowerCase() === String(msg.to ?? '').toLowerCase());
      if (!to) return s.send({ t: 'err', msg: 'Player not online' });
      if (!to.blocked.has(s.char.name)) to.send({ ...out, ch: 'whisper' });
      s.send({ ...out, ch: 'whisper', to: to.char.name });
    } else {
      for (const id of room.sessions) { const o = this.sessions.get(id); if (o && !o.blocked.has(s.char.name)) o.send(out); }
    }
  }

  // ─────────── GM tools (admin accounts only; every action is audited) ───────────
  static readonly GM_CODE = 'gmadminonline01';
  private gmMsg(s: Session, room: Room, msg: any) {
    if (msg.t === 'gm_open') {
      if (s.role !== 'admin' || msg.code !== GameCore.GM_CODE) return s.send({ t: 'err', msg: 'Unknown command' }); // never reveal that the command exists
      s.gm = true;
      this.persist.audit({ accountId: s.accountId, charId: s.char.id, action: 'gm_open', data: null });
      return s.send({ t: 'gm', on: true });
    }
    if (!s.gm || s.role !== 'admin') return s.send({ t: 'err', msg: 'Unknown command' });
    const w = room.world, me = w.ents.get(s.entId);
    const int = (v: unknown, lo: number, hi: number, d: number) => { const n = Math.floor(Number(v)); return Number.isFinite(n) ? Math.max(lo, Math.min(hi, n)) : d; };
    const a = String(msg.a ?? '');
    let note = '';
    switch (a) {
      case 'item': {
        const base = ITEM_BASE_MAP[String(msg.baseId)];
        if (!base) return s.send({ t: 'err', msg: 'Unknown item' });
        const rarity = RARITIES.includes(msg.rarity) ? msg.rarity : 'rare';
        const n = int(msg.n, 1, 10, 1);
        let given = 0;
        for (let k = 0; k < n; k++) { const slot = s.char.inventory.indexOf(null); if (slot < 0) break; s.char.inventory[slot] = generateItem({ rng: this.rng, ilvl: int(msg.ilvl, 1, 100, s.char.level), rarity, baseId: base.id, cls: s.char.cls, hardcore: s.char.hardcore }); given++; }
        note = `Created ${given}× ${rarity} ${base.name}${given < n ? ' (bags full)' : ''}`; break;
      }
      case 'mat': { const id = String(msg.id); if (!MATERIALS[id]) return s.send({ t: 'err', msg: 'Unknown material' }); s.char.mats[id] = (s.char.mats[id] ?? 0) + int(msg.n, 1, 9999, 10); note = `+${int(msg.n, 1, 9999, 10)} ${MATERIALS[id]!.name}`; break; }
      case 'currency': {
        const n = int(msg.n, -1e9, 1e9, 0), k = String(msg.k);
        if (k === 'gold') s.char.gold = Math.max(0, s.char.gold + n); else if (k === 'dust') s.char.dust = Math.max(0, s.char.dust + n);
        else if (k === 'tokens') { const mm = M.ensureMeta(s.account); mm.wish.tokens = Math.max(0, mm.wish.tokens + n); }
        else if (k === 'shards') { if (!s.account.season) return s.send({ t: 'err', msg: 'No season running' }); s.account.season.shards = Math.max(0, s.account.season.shards + n); }
        else if (k === 'potions') s.char.potions = Math.max(0, s.char.potions + n);
        else return s.send({ t: 'err', msg: 'Unknown currency' });
        note = `${n >= 0 ? '+' : ''}${n} ${k}`; break;
      }
      case 'level': { s.char.level = int(msg.n, 1, LEVEL_CAP, s.char.level); s.char.xp = 0; note = `Level set to ${s.char.level}`; break; }
      case 'heal': { if (me) { me.dead = false; me.hp = me.maxHp; if (me.p) { me.p.res = me.stats?.maxRes ?? me.p.res; me.p.cds = {}; } } note = 'Fully restored, cooldowns reset'; break; }
      case 'god': { if (!me) break; const on = !me.buffs.some((b) => b.name === 'GM: God Mode'); me.buffs = me.buffs.filter((b) => b.name !== 'GM: God Mode'); if (on) w.addBuff(me, 'GM: God Mode', 1e9, [{ stat: 'invuln', value: 1 }]); note = on ? 'God mode ON' : 'God mode OFF'; break; }
      case 'spawn': {
        const def = ENEMIES[String(msg.id)];
        if (!def || !me) return s.send({ t: 'err', msg: 'Unknown monster' });
        const n = int(msg.n, 1, 20, 1), lv = int(msg.level, 1, 100, s.char.level);
        let made = 0;
        for (let k = 0; k < n; k++) { const ang = (k / n) * Math.PI * 2, r = 110 + (n > 1 ? 40 : 0); if (w.spawnEnemy(def.id, me.x + Math.cos(ang) * r, me.y + Math.sin(ang) * r, lv, !!msg.elite)) made++; }
        note = `Spawned ${made}× ${def.name} (Lv.${lv}${msg.elite ? ', elite' : ''})`; break;
      }
      case 'killall': { let k = 0; for (const e of [...w.ents.values()]) if (e.kind === 'enemy' && !e.dead && e.e?.def.id !== 'dummy') { e.invuln = 0; w.applyHit(e, { amount: 1e12, type: 'holy', critChance: 0, critMult: 1, src: me?.id ?? 0, tags: [] }); k++; } note = `Defeated ${k} enemies`; break; }
      case 'cleardrops': { w.drops = []; note = 'Drops cleared'; break; }
      case 'teleport': { const z = String(msg.zone); if (z !== 'town' && !ZONE_MAP[z]) return s.send({ t: 'err', msg: 'Unknown zone' }); this.persist.audit({ accountId: s.accountId, charId: s.char.id, action: 'gm_teleport', data: { zone: z } }); this.moveTo(s, z); return; }
      case 'announce': { const text = String(msg.text ?? '').slice(0, 200); if (!text) return; for (const o of this.sessions.values()) this.toast(o, `[GM] ${text}`); note = 'Announced'; break; }
      case 'kick': case 'mute': {
        const target = [...this.sessions.values()].find((o) => o.char.name.toLowerCase() === String(msg.name ?? '').toLowerCase());
        if (!target) return s.send({ t: 'err', msg: 'Player not found online' });
        if (a === 'kick') { this.disconnect(target.id, 'You were removed from the game by a GM'); note = `Kicked ${target.char.name}`; }
        else { target.mutedUntil = this.now + int(msg.minutes, 1, 1440, 10) * 60; this.toast(target, 'A GM muted you'); note = `Muted ${target.char.name}`; }
        break;
      }
      default: return s.send({ t: 'err', msg: 'Unknown GM action' });
    }
    this.persist.audit({ accountId: s.accountId, charId: s.char.id, action: 'gm_' + a, data: { ...msg, t: undefined } });
    if (me) { me.dirty = true; if (a === 'level') w.refresh(me); }
    s.dirty = true;
    this.tx({ characters: [s.char], accounts: [{ id: s.accountId, progress: s.account }] });
    if (note) this.toast(s, `[GM] ${note}`);
    this.sendChar(s);
  }

  // ─────────── Friends (mutual, per account) ───────────
  private friendList(s: Session) {
    const online = new Map([...this.sessions.values()].map((o) => [o.char.id, o]));
    s.send({ t: 'friends', list: (s.account.friends ?? []).map((f) => { const o = online.get(f.charId); return { ...f, online: !!o, level: o?.char.level ?? null, room: o ? (o.roomId.startsWith('house:') ? 'hearth' : this.rooms.get(o.roomId)?.kind === 'dungeon' ? 'instance' : o.roomId) : null }; }), requests: [...s.friendReqs].map((id) => ({ id, name: online.get(id)?.char.name ?? '?' })).filter((r) => r.name !== '?') });
  }
  private friends(s: Session, msg: any) {
    const list = (s.account.friends ??= []);
    const save = (...ss: Session[]) => this.tx({ accounts: ss.map((x) => ({ id: x.accountId, progress: x.account })) });
    switch (msg.t) {
      case 'friend_list': break;
      case 'friend_request': {
        const name = String(msg.name ?? '').trim().toLowerCase();
        const target = [...this.sessions.values()].find((o) => o.char.name.toLowerCase() === name);
        if (!target || target === s) return s.send({ t: 'err', msg: 'Player not found online' });
        if (target.accountId === s.accountId) return s.send({ t: 'err', msg: 'That is one of your own characters' });
        if (list.some((f) => f.charId === target.char.id)) return s.send({ t: 'err', msg: 'Already friends' });
        if (list.length >= FRIEND_MAX) return s.send({ t: 'err', msg: `Friend list is full (${FRIEND_MAX})` });
        if (target.blocked.has(s.char.name.toLowerCase())) return s.send({ t: 'err', msg: 'Player not found online' });
        target.friendReqs.add(s.char.id);
        target.send({ t: 'friend_request', id: s.char.id, from: s.char.name });
        this.toast(s, `Friend request sent to ${target.char.name}`);
        return;
      }
      case 'friend_accept': {
        const id = String(msg.id ?? '');
        const from = [...this.sessions.values()].find((o) => o.char.id === id);
        if (!from || !s.friendReqs.has(id)) return s.send({ t: 'err', msg: 'Request expired' });
        s.friendReqs.delete(id);
        const fl = (from.account.friends ??= []);
        if (list.length >= FRIEND_MAX || fl.length >= FRIEND_MAX) return s.send({ t: 'err', msg: 'A friend list is full' });
        if (!list.some((f) => f.charId === from.char.id)) list.push({ charId: from.char.id, name: from.char.name, cls: from.char.cls });
        if (!fl.some((f) => f.charId === s.char.id)) fl.push({ charId: s.char.id, name: s.char.name, cls: s.char.cls });
        save(s, from);
        this.toast(from, `${s.char.name} accepted your friend request`);
        this.friendList(from);
        break;
      }
      case 'friend_remove': {
        const id = String(msg.id ?? '');
        s.account.friends = list.filter((f) => f.charId !== id);
        const other = [...this.sessions.values()].find((o) => o.char.id === id);
        if (other) { other.account.friends = (other.account.friends ?? []).filter((f) => f.charId !== s.char.id); save(s, other); this.friendList(other); } else save(s);
        break;
      }
    }
    this.friendList(s);
  }

  private partyInvite(s: Session, name: string) {
    const target = [...this.sessions.values()].find((o) => o.char.name.toLowerCase() === name.toLowerCase());
    if (!target || target === s) return s.send({ t: 'err', msg: 'Player not found online' });
    if (target.partyId) return s.send({ t: 'err', msg: `${target.char.name} is already in a party` });
    let p = s.partyId ? this.parties.get(s.partyId)! : null;
    if (!p) { p = { id: 'p' + Math.floor(this.rng.next() * 1e9).toString(36), leader: s.id, members: [s.id] }; this.parties.set(p.id, p); s.partyId = p.id; this.syncParty(p); }
    if (p.leader !== s.id) return s.send({ t: 'err', msg: 'Only the leader can invite' });
    if (p.members.length >= 4) return s.send({ t: 'err', msg: 'Party is full (4 players)' });
    target.invites.add(p.id);
    target.send({ t: 'party_invite', id: p.id, from: s.char.name });
    this.toast(s, `Invited ${target.char.name}`);
  }
  private partyAccept(s: Session, id: string) {
    const p = this.parties.get(id);
    if (!p || !s.invites.has(id)) return s.send({ t: 'err', msg: 'Invite expired' });
    if (s.partyId) this.leaveParty(s);
    if (p.members.length >= 4) return s.send({ t: 'err', msg: 'Party is full' });
    s.invites.delete(id);
    p.members.push(s.id);
    s.partyId = p.id;
    this.syncParty(p);
  }
  private partyKick(s: Session, name: string) {
    const p = s.partyId ? this.parties.get(s.partyId) : null;
    if (!p || p.leader !== s.id) return s.send({ t: 'err', msg: 'Only the leader can kick' });
    const t = p.members.map((id) => this.sessions.get(id)!).find((o) => o && o.char.name.toLowerCase() === name.toLowerCase());
    if (t && t !== s) { this.leaveParty(t); this.toast(t, 'You were removed from the party.'); }
  }
  private leaveParty(s: Session) {
    const p = s.partyId ? this.parties.get(s.partyId) : null;
    s.partyId = null;
    const ent = this.rooms.get(s.roomId)?.world.ents.get(s.entId);
    if (ent?.p) ent.p.partyId = null;
    this.sendParty(s);
    if (!p) return;
    p.members = p.members.filter((m) => m !== s.id);
    if (p.members.length <= 1) {
      for (const m of p.members) { const o = this.sessions.get(m); if (o) { o.partyId = null; this.sendParty(o); } }
      this.parties.delete(p.id);
      return;
    }
    if (p.leader === s.id) p.leader = p.members[0]!; // leader hand-off
    this.syncParty(p);
  }
  private syncParty(p: Party) {
    for (const id of p.members) { const o = this.sessions.get(id); if (o) { o.partyId = p.id; const ent = this.rooms.get(o.roomId)?.world.ents.get(o.entId); if (ent?.p) ent.p.partyId = p.id; this.sendParty(o); } }
  }
  private sendParty(s: Session) {
    const p = s.partyId ? this.parties.get(s.partyId) : null;
    s.send({ t: 'party', id: p?.id ?? null, leader: p ? this.sessions.get(p.leader)?.char.name : null, members: p ? p.members.map((id) => { const o = this.sessions.get(id); return o ? { name: o.char.name, cls: o.char.cls, level: o.char.level, room: this.rooms.get(o.roomId)?.kind } : null; }).filter(Boolean) : [] });
  }

  private partyTransfer(s: Session, name: string) {
    const p = s.partyId ? this.parties.get(s.partyId) : null;
    if (!p || p.leader !== s.id) return s.send({ t: 'err', msg: 'Only the leader can transfer leadership' });
    const t = p.members.map((id) => this.sessions.get(id)!).find((o) => o && o.char.name.toLowerCase() === name.toLowerCase());
    if (!t || t === s) return s.send({ t: 'err', msg: 'Member not found' });
    p.leader = t.id;
    this.syncParty(p);
  }

  // ─────────── Party finder ───────────
  private pfList(s: Session) {
    s.send({ t: 'pf', entries: [...this.pf.values()].filter((e) => e.hardcore === s.char.hardcore).map((e) => ({ sid: e.sid, name: e.name, cls: e.cls, level: e.level, note: e.note, diff: e.diff, size: this.partySize(e.sid), mine: e.sid === s.id })) });
  }
  private partySize(sid: string) { const o = this.sessions.get(sid); return o?.partyId ? this.parties.get(o.partyId)?.members.length ?? 1 : 1; }
  private pfPost(s: Session, msg: any) {
    const p = s.partyId ? this.parties.get(s.partyId) : null;
    if (p && p.leader !== s.id) return s.send({ t: 'err', msg: 'Only the party leader can post' });
    if (p && p.members.length >= 4) return s.send({ t: 'err', msg: 'Your party is already full' });
    const diff = (DIFFICULTY_ORDER as string[]).includes(String(msg.diff)) ? String(msg.diff) : 'normal';
    const note = String(msg.note ?? '').replace(/[\u0000-\u001f\u007f]/g, '').slice(0, 80);
    this.pf.set(s.id, { sid: s.id, name: s.char.name, cls: s.char.cls, level: s.char.level, note, diff, size: p?.members.length ?? 1, hardcore: s.char.hardcore, at: this.clock() });
    this.toast(s, 'Listed in the Party Finder');
    this.pfList(s);
  }
  private pfJoin(s: Session, sid: string) {
    const e = this.pf.get(sid);
    const leader = this.sessions.get(sid);
    if (!e || !leader) return s.send({ t: 'err', msg: 'That listing is gone' });
    if (e.hardcore !== s.char.hardcore) return s.send({ t: 'err', msg: 'Hardcore and Normal groups are separate' });
    if (s.partyId) return s.send({ t: 'err', msg: 'Leave your current party first' });
    leader.send({ t: 'party_request', from: s.char.name, cls: s.char.cls, level: s.char.level });
    this.toast(s, `Request sent to ${leader.char.name}`);
  }

  // ─────────── Direct trade (both sides lock, then both confirm; swap is atomic) ───────────
  private tradeRequest(s: Session, room: Room, name: string) {
    if (s.tradeId) return s.send({ t: 'err', msg: 'You are already trading' });
    const t = [...room.sessions].map((id) => this.sessions.get(id)!).find((o) => o && o.char.name.toLowerCase() === name.toLowerCase());
    if (!t || t === s) return s.send({ t: 'err', msg: 'Player must be in the same zone' });
    const a = room.world.ents.get(s.entId), b = room.world.ents.get(t.entId);
    if (!a || !b || dist(a.x, a.y, b.x, b.y) > 400) return s.send({ t: 'err', msg: 'Move closer to trade' });
    if (t.tradeId) return s.send({ t: 'err', msg: `${t.char.name} is busy` });
    if (s.char.hardcore !== t.char.hardcore) return s.send({ t: 'err', msg: 'Hardcore and Normal characters cannot trade' });
    const tr: TradeState = { id: this.uid('t'), a: s.id, b: t.id, open: false, offers: { [s.id]: { uids: [], gold: 0 }, [t.id]: { uids: [], gold: 0 } }, locked: new Set(), confirmed: new Set() };
    this.trades.set(tr.id, tr);
    s.tradeId = tr.id;
    t.send({ t: 'trade_request', id: tr.id, from: s.char.name });
    this.toast(s, `Trade request sent to ${t.char.name}`);
  }
  private tradeRespond(s: Session, room: Room, id: string, accept: boolean) {
    const tr = this.trades.get(id);
    if (!tr || tr.b !== s.id || tr.open) return;
    const a = this.sessions.get(tr.a);
    if (!accept || !a || a.roomId !== room.id || s.tradeId) { this.trades.delete(id); if (a) { a.tradeId = null; this.toast(a, `${s.char.name} declined the trade`); } return; }
    tr.open = true;
    s.tradeId = id;
    this.sendTrade(tr);
  }
  private tradeOf(s: Session) { const tr = s.tradeId ? this.trades.get(s.tradeId) : undefined; return tr?.open ? tr : undefined; }
  private tradeOffer(s: Session, msg: any) {
    const tr = this.tradeOf(s);
    if (!tr) return;
    const idx: number[] = Array.isArray(msg.inv) ? msg.inv.slice(0, EC.TRADE_MAX_ITEMS).map((v: unknown) => clampInt(v, 0, s.char.inventory.length - 1)) : [];
    const uids = [...new Set(idx)].map((i) => s.char.inventory[i]?.uid).filter((u): u is string => !!u);
    const offer = { uids, gold: clampInt(msg.gold, 0, 1e9) };
    const partner = this.sessions.get(tr.a === s.id ? tr.b : tr.a)!;
    const v = EC.validateOffer(s.char, offer, partner.char);
    if (!v.ok) return s.send({ t: 'err', msg: v.reason });
    tr.offers[s.id] = offer;
    tr.locked.clear(); tr.confirmed.clear(); // any change resets both sides (anti bait-and-switch)
    this.sendTrade(tr);
  }
  private tradeLock(s: Session) { const tr = this.tradeOf(s); if (!tr) return; tr.locked.add(s.id); tr.confirmed.clear(); this.sendTrade(tr); }
  private tradeConfirm(s: Session) {
    const tr = this.tradeOf(s);
    if (!tr) return;
    if (tr.locked.size < 2) return s.send({ t: 'err', msg: 'Both players must lock their offers first' });
    tr.confirmed.add(s.id);
    if (tr.confirmed.size < 2) return this.sendTrade(tr);
    const A = this.sessions.get(tr.a)!, B = this.sessions.get(tr.b)!;
    const r = EC.executeTrade(A.char, B.char, tr.offers[tr.a]!, tr.offers[tr.b]!);
    if (!r.ok) { tr.locked.clear(); tr.confirmed.clear(); this.sendTrade(tr); for (const x of [A, B]) x.send({ t: 'err', msg: `Trade failed: ${r.reason}` }); return; }
    this.closeTrade(tr);
    this.tx({ characters: [A.char, B.char] });
    this.persist.audit({ accountId: A.accountId, charId: A.char.id, action: 'trade', data: { with: B.char.id, gave: tr.offers[tr.a], got: tr.offers[tr.b] } });
    this.persist.audit({ accountId: B.accountId, charId: B.char.id, action: 'trade', data: { with: A.char.id, gave: tr.offers[tr.b], got: tr.offers[tr.a] } });
    for (const x of [A, B]) { x.send({ t: 'trade', closed: true, done: true }); this.toast(x, 'Trade complete'); this.markDirty(x); this.sendChar(x); }
  }
  private closeTrade(tr: TradeState) { this.trades.delete(tr.id); for (const sid of [tr.a, tr.b]) { const x = this.sessions.get(sid); if (x && x.tradeId === tr.id) x.tradeId = null; } }
  private cancelTrade(s: Session, why: string) {
    const tr = s.tradeId ? this.trades.get(s.tradeId) : undefined;
    s.tradeId = null;
    if (!tr) return;
    this.closeTrade(tr);
    for (const sid of [tr.a, tr.b]) { const x = this.sessions.get(sid); if (x) { x.send({ t: 'trade', closed: true }); if (tr.open) this.toast(x, why); } }
  }
  private sendTrade(tr: TradeState) {
    for (const sid of [tr.a, tr.b]) {
      const me = this.sessions.get(sid), other = this.sessions.get(sid === tr.a ? tr.b : tr.a);
      if (!me || !other) continue;
      const view = (x: Session) => ({ name: x.char.name, gold: tr.offers[x.id]!.gold, items: tr.offers[x.id]!.uids.map((u) => x.char.inventory.find((i) => i?.uid === u)).filter(Boolean), locked: tr.locked.has(x.id), confirmed: tr.confirmed.has(x.id) });
      me.send({ t: 'trade', id: tr.id, me: { ...view(me), uids: tr.offers[me.id]!.uids }, them: view(other) });
    }
  }
  private markDirty(s: Session) { const ent = this.rooms.get(s.roomId)?.world.ents.get(s.entId); if (ent) ent.dirty = true; s.dirty = true; }

  // ─────────── Auction house ───────────
  private auction(s: Session, room: Room, msg: any): void {
    if (!this.live.flags.auction) return s.send({ t: 'err', msg: 'The auction house is temporarily closed' });
    if (!this.nearNpc(s, room, 'npc_auction')) return s.send({ t: 'err', msg: 'Visit the Auctioneer in Lumenhold' });
    const now = this.clock();
    const mine = () => [...this.listings.values()].filter((l) => l.sellerChar === s.char.id && l.status !== 'closed');
    const sendMine = () => s.send({ t: 'ah_mine', rows: mine().map((l) => ({ ...l, status: l.status === 'active' && l.expiresAt <= now ? 'expired' : l.status })) });
    const done = (l: Listing, action: string, chars: CharacterData[], data: unknown) => {
      this.tx({ characters: chars, listings: [l] });
      this.persist.audit({ accountId: s.accountId, charId: s.char.id, action, data });
      this.markDirty(s); this.sendChar(s); sendMine();
    };
    switch (msg.t) {
      case 'ah_search': { const q = msg.q && typeof msg.q === 'object' ? msg.q : {}; s.send({ t: 'ah_results', ...EC.searchListings(this.listings.values(), { text: String(q.text ?? ''), slot: q.slot ? String(q.slot) : undefined, rarity: q.rarity, maxLevel: q.maxLevel ? clampInt(q.maxLevel, 1, 100) : undefined, sort: q.sort === 'newest' ? 'newest' : 'price', page: clampInt(q.page, 0, 999) }, s.char.hardcore, now) }); return; }
      case 'ah_mine': sendMine(); return;
      case 'ah_list': {
        const r = EC.createListing(s.char, clampInt(msg.inv, 0, s.char.inventory.length - 1), Math.floor(Number(msg.price)), mine(), now, this.uid('L'));
        if (!r.ok) return s.send({ t: 'err', msg: r.reason });
        this.listings.set(r.value.id, r.value);
        this.toast(s, `Listed ${r.value.item.name} for ${r.value.price}g (deposit ${EC.AH.deposit}g)`);
        return done(r.value, 'ah_list', [s.char], { listing: r.value.id, uid: r.value.item.uid, price: r.value.price });
      }
      case 'ah_buy': {
        const l = this.listings.get(String(msg.id));
        if (!l) return s.send({ t: 'err', msg: 'Listing not found' });
        const r = EC.buyListing(s.char, l, now);
        if (!r.ok) return s.send({ t: 'err', msg: r.reason });
        this.toast(s, `Bought ${l.item.name} for ${l.price}g`);
        const seller = [...this.sessions.values()].find((o) => o.char.id === l.sellerChar);
        if (seller) this.toast(seller, `Your ${l.item.name} sold for ${l.price}g — collect ${l.proceeds}g at the Auctioneer`);
        done(l, 'ah_buy', [s.char], { listing: l.id, uid: l.item.uid, price: l.price, seller: l.sellerChar });
        return this.auction(s, room, { t: 'ah_search', q: msg.q ?? {} });
      }
      case 'ah_cancel': case 'ah_claim': {
        const l = this.listings.get(String(msg.id));
        if (!l) return s.send({ t: 'err', msg: 'Listing not found' });
        const r = msg.t === 'ah_cancel' ? EC.cancelListing(s.char, l) : EC.claimListing(s.char, l, now);
        if (!r.ok) return s.send({ t: 'err', msg: r.reason });
        return done(l, msg.t, [s.char], { listing: l.id, result: r.value ?? null });
      }
    }
  }

  // ─────────── Guilds ───────────
  private sendGuild(s: Session) {
    const g = this.guildOf(s.char.id);
    if (!g) return s.send({ t: 'guild', guild: null, invites: [...s.guildInvites].map((id) => { const x = this.guilds.get(id); return x ? { id, name: x.name, tag: x.tag } : null; }).filter(Boolean), pending: [...this.guilds.values()].filter((x) => x.requests?.some((r) => r.charId === s.char.id)).map((x) => ({ id: x.id, name: x.name, tag: x.tag })) });
    const online = new Set([...this.sessions.values()].map((o) => o.char.id));
    s.send({ t: 'guild', guild: { ...g, members: g.members.map((m) => ({ ...m, online: online.has(m.charId) })), xpToNext: EC.guildXpToNext(g.level), requests: EC.can(g, s.char.id, 'invite') ? g.requests ?? [] : [] }, invites: [] });
  }
  /** A character joined `joined`: drop their pending requests everywhere else. */
  private clearRequests(charId: string, joined: Guild) {
    const touched: Guild[] = [];
    for (const x of this.guilds.values()) if (x !== joined && x.requests?.some((r) => r.charId === charId)) { x.requests = x.requests.filter((r) => r.charId !== charId); touched.push(x); }
    if (touched.length) { this.tx({ guilds: touched }); for (const x of touched) this.guildSync(x); }
  }
  private guildSync(g: Guild) { for (const o of this.sessions.values()) if (g.members.some((m) => m.charId === o.char.id)) this.sendGuild(o); }
  private guildXp(s: Session, xp: number, why: string) {
    const g = this.guildOf(s.char.id);
    if (!g) return;
    const ups = EC.addGuildXp(g, xp);
    if (ups) { EC.logGuild(g, this.clock(), `Guild reached level ${g.level} (${s.char.name} ${why})`); this.guildSync(g); }
    this.tx({ guilds: [g] });
  }
  private guild(s: Session, room: Room, msg: any): void {
    const now = this.clock();
    const g = this.guildOf(s.char.id);
    const fail = (m: string) => s.send({ t: 'err', msg: m });
    const commit = (gg: Guild, chars: CharacterData[] = [], action?: string) => { this.tx({ guilds: [gg], characters: chars }); if (action) this.persist.audit({ accountId: s.accountId, charId: s.char.id, action, data: { guild: gg.id } }); this.guildSync(gg); };
    switch (msg.t) {
      case 'guild_info': return this.sendGuild(s);
      case 'guild_create': {
        if (!this.live.flags.guilds) return fail('Guild creation is temporarily disabled');
        if (room.kind !== 'town') return fail('Guilds are founded in Lumenhold');
        const r = EC.createGuild(s.char, String(msg.name ?? ''), String(msg.tag ?? ''), this.guilds.values(), now, this.uid('g'));
        if (!r.ok) return fail(r.reason);
        EC.normalizeGuild(r.value); this.clearRequests(s.char.id, r.value); this.guilds.set(r.value.id, r.value);
        this.markDirty(s); this.sendChar(s);
        this.toast(s, `Founded ‹${r.value.tag}› ${r.value.name}`);
        return commit(r.value, [s.char], 'guild_create');
      }
      case 'guild_invite': {
        if (!g) return fail('You are not in a guild');
        if (!EC.can(g, s.char.id, 'invite')) return fail('Only officers and the leader can invite');
        const t = [...this.sessions.values()].find((o) => o.char.name.toLowerCase() === String(msg.name ?? '').toLowerCase());
        if (!t) return fail('Player not online');
        if (this.guildOf(t.char.id)) return fail(`${t.char.name} is already in a guild`);
        t.guildInvites.add(g.id);
        t.send({ t: 'guild_invite', id: g.id, name: g.name, tag: g.tag, from: s.char.name });
        return this.toast(s, `Invited ${t.char.name} to the guild`);
      }
      case 'guild_accept': {
        const gg = this.guilds.get(String(msg.id));
        if (!gg || !s.guildInvites.has(gg.id)) return fail('Invite expired');
        if (g) return fail('Leave your current guild first');
        const r = EC.addMember(gg, s.char, now);
        if (!r.ok) return fail(r.reason);
        s.guildInvites.clear(); this.clearRequests(s.char.id, gg);
        return commit(gg, [], 'guild_join');
      }
      case 'guild_leave': {
        if (!g) return fail('You are not in a guild');
        const r = EC.leaveGuild(g, s.char.id, now);
        if (!r.ok) return fail(r.reason);
        if (r.value === 'disband') { this.guilds.delete(g.id); this.tx({ deleteGuilds: [g.id] }); this.persist.audit({ accountId: s.accountId, charId: s.char.id, action: 'guild_disband', data: { guild: g.id } }); }
        else commit(g, [], 'guild_leave');
        return this.sendGuild(s);
      }
      case 'guild_kick': {
        if (!g) return fail('You are not in a guild');
        const r = EC.kickMember(g, s.char.id, String(msg.name ?? ''), now);
        if (!r.ok) return fail(r.reason);
        const t = [...this.sessions.values()].find((o) => o.char.id === r.value.charId);
        commit(g, [], 'guild_kick');
        if (t) { this.toast(t, `You were removed from ${g.name}`); this.sendGuild(t); }
        return;
      }
      case 'guild_rank': {
        if (!g) return fail('You are not in a guild');
        const r = EC.setRank(g, s.char.id, String(msg.name ?? ''), msg.rank === 'officer' ? 'officer' : 'member', now);
        return r.ok ? commit(g, [], 'guild_rank') : fail(r.reason);
      }
      case 'guild_transfer': {
        if (!g) return fail('You are not in a guild');
        const r = EC.transferLeader(g, s.char.id, String(msg.name ?? ''), String(msg.confirm ?? ''), now);
        return r.ok ? commit(g, [], 'guild_transfer') : fail(r.reason);
      }
      case 'guild_browse': {
        const mine = new Set([...this.guilds.values()].filter((x) => x.requests?.some((r) => r.charId === s.char.id)).map((x) => x.id));
        return s.send({ t: 'guild_browse', rows: EC.browseGuilds(this.guilds.values(), { cat: String(msg.cat ?? 'all'), text: String(msg.q ?? ''), hardcore: s.char.hardcore, openOnly: !!msg.openOnly }).map((r) => ({ ...r, applied: mine.has(r.id) })) });
      }
      case 'guild_ranking': {
        const board = (['level', 'power', 'members'] as const).includes(msg.board) ? msg.board as EC.GuildBoard : 'level';
        return s.send({ t: 'guild_ranking', board, rows: EC.rankGuilds(this.guilds.values(), board, s.char.hardcore), mine: g?.id ?? null });
      }
      case 'guild_apply': {
        const gg = this.guilds.get(String(msg.id));
        if (!gg) return fail('Guild not found');
        const r = EC.applyGuild(gg, s.char, String(msg.msg ?? ''), now, !!g);
        if (!r.ok) return fail(r.reason);
        if (r.value === 'joined') { this.clearRequests(s.char.id, gg); this.toast(s, `Joined ‹${gg.tag}› ${gg.name}`); commit(gg, [], 'guild_join'); return this.sendGuild(s); }
        commit(gg, [], 'guild_apply');
        this.toast(s, `Request sent to ‹${gg.tag}› ${gg.name}`);
        for (const o of this.sessions.values()) if (EC.can(gg, o.char.id, 'invite')) this.toast(o, `${s.char.name} (Lv ${s.char.level}) asked to join the guild`);
        return;
      }
      case 'guild_withdraw_req': {
        const gg = this.guilds.get(String(msg.id));
        if (!gg?.requests?.some((r) => r.charId === s.char.id)) return fail('No pending request');
        gg.requests = gg.requests.filter((r) => r.charId !== s.char.id);
        this.tx({ guilds: [gg] }); this.guildSync(gg);
        return this.toast(s, 'Request withdrawn');
      }
      case 'guild_req': {
        if (!g) return fail('You are not in a guild');
        const cid = String(msg.charId ?? '');
        const r = EC.decideRequest(g, s.char.id, cid, !!msg.accept, now, !!this.guildOf(cid));
        if (!r.ok) { this.tx({ guilds: [g] }); this.guildSync(g); return fail(r.reason); }
        if (msg.accept) this.clearRequests(cid, g);
        commit(g, [], msg.accept ? 'guild_req_accept' : 'guild_req_decline');
        const t = [...this.sessions.values()].find((o) => o.char.id === cid);
        if (t) { this.toast(t, msg.accept ? `You were accepted into ‹${g.tag}› ${g.name}!` : `‹${g.tag}› ${g.name} declined your request`); this.sendGuild(t); }
        return;
      }
      case 'guild_settings': {
        if (!g) return fail('You are not in a guild');
        const r = EC.guildSettings(g, s.char.id, { category: msg.category, desc: msg.desc, open: msg.open, minLevel: msg.minLevel });
        if (!r.ok) return fail(r.reason);
        EC.logGuild(g, now, `${s.char.name} updated the guild profile`);
        this.toast(s, 'Guild profile saved');
        return commit(g, [], 'guild_settings');
      }
      case 'guild_motd': {
        if (!g) return fail('You are not in a guild');
        if (!EC.can(g, s.char.id, 'motd')) return fail('Only officers and the leader can edit the message');
        g.motd = String(msg.text ?? '').replace(/[\u0000-\u001f\u007f]/g, '').slice(0, 200);
        EC.logGuild(g, now, `${s.char.name} updated the message of the day`);
        return commit(g);
      }
    }
  }

  // ─────────── Live ops: weekly events, seasons, staff hooks ───────────
  effects() {
    const ev = weeklyEvent(this.clock(), this.live.weeklyOverride).effects;
    return { xpMul: this.live.xpMul * (ev.xpMul ?? 1), goldMul: this.live.goldMul * (ev.goldMul ?? 1), shardMul: ev.shardMul ?? 1, lootBonus: this.live.lootBonus + (ev.lootBonus ?? 0), eliteBonus: ev.eliteBonus ?? 0 };
  }
  private liveLoot() { const e = this.effects(); return { lootBonus: e.lootBonus, goldMul: e.goldMul }; }
  /** Apply a validated live config (staff panel). */
  setLive(cfg: LiveConfig) {
    const wasMaint = this.live.maintenance;
    this.live = cfg;
    const l = this.liveLoot();
    for (const r of this.rooms.values()) r.world.live = l;
    if (cfg.maintenance && !wasMaint) this.announce('Maintenance is starting soon. Please finish your activity and log out safely.');
    this.announcement = cfg.motd || null;
  }
  announce(text: string) { for (const o of this.sessions.values()) { o.send({ t: 'toast', msg: `📢 ${text}` }); o.send({ t: 'chat', from: 'Lumenhold', ch: 'system', text }); } }
  kickAccount(accountId: string, reason: string) { for (const o of [...this.sessions.values()]) if (o.accountId === accountId) this.disconnect(o.id, reason); }
  muteAccount(accountId: string, untilMs: number) { for (const o of this.sessions.values()) if (o.accountId === accountId) { o.mutedUntil = this.now + Math.max(0, (untilMs - this.clock()) / 1000); this.toast(o, untilMs > this.clock() ? `You have been muted by a moderator until ${new Date(untilMs).toUTCString()}` : 'Your chat mute was lifted.'); } }

  private seasonState(s: Session): { def: SeasonDef; st: NonNullable<AccountProgress['season']> } | null {
    const def = currentSeason(this.clock());
    if (!def) return null;
    let st = s.account.season;
    if (!st || st.id !== def.id) {
      const archive = st ? [...(st.archive ?? []), { id: st.id, xp: st.xp, tier: Math.floor(st.xp / SEASON_XP_PER_TIER) }] : [];
      st = { id: def.id, xp: 0, shards: 0, claimed: [], week: weekIndex(this.clock()), weekly: {}, weeklyDone: [], archive };
      s.account.season = st;
    }
    const w = weekIndex(this.clock());
    if (st.week !== w) { st.week = w; st.weekly = {}; st.weeklyDone = []; }
    return { def, st };
  }
  private seasonGain(s: Session, shards: number, xp = shards * 40) {
    const ss = this.seasonState(s);
    if (!ss || shards <= 0) return;
    const before = Math.floor(ss.st.xp / SEASON_XP_PER_TIER);
    ss.st.shards += Math.round(shards * this.effects().shardMul);
    ss.st.xp += Math.round(xp * this.effects().shardMul);
    const after = Math.floor(ss.st.xp / SEASON_XP_PER_TIER);
    if (after > before) this.toast(s, `Season tier ${after} reached — claim rewards in the Season panel (Y)`);
    this.saveAcct(s.accountId, s.account);
  }
  private weekly(s: Session, kind: string, n: number, absolute = false) {
    const ss = this.seasonState(s);
    if (!ss) return;
    for (const o of weeklyObjectives(this.clock())) {
      if (o.kind !== kind || ss.st.weeklyDone.includes(o.id)) continue;
      const cur = ss.st.weekly[o.id] ?? 0;
      ss.st.weekly[o.id] = Math.min(o.count, absolute ? Math.max(cur, n) : cur + n);
      if (ss.st.weekly[o.id]! >= o.count) { ss.st.weeklyDone.push(o.id); this.toast(s, `Weekly objective complete: ${o.name} (+${o.xp} Season XP)`); this.seasonGain(s, o.shards, o.xp); }
    }
  }
  sendSeason(s: Session) {
    const ss = this.seasonState(s);
    const now = this.clock();
    s.send({ t: 'season', season: ss?.def ?? null, progress: ss?.st ?? null, tierXp: SEASON_XP_PER_TIER, event: weeklyEvent(now, this.live.weeklyOverride), objectives: weeklyObjectives(now), weekEndsIn: Math.round(((weekIndex(now) + 1) * 7 * 86400_000 + Date.parse('2026-01-05T00:00:00Z') - now) / 1000), auras: AURAS });
  }
  private seasonClaim(s: Session, tier: number) {
    const ss = this.seasonState(s);
    if (!ss) return s.send({ t: 'err', msg: 'No season is running' });
    const rw = ss.def.rewards.find((r) => r.tier === tier);
    if (!rw) return s.send({ t: 'err', msg: 'No reward at that tier' });
    if (Math.floor(ss.st.xp / SEASON_XP_PER_TIER) < tier) return s.send({ t: 'err', msg: 'Tier not reached yet' });
    if (ss.st.claimed.includes(tier)) return s.send({ t: 'err', msg: 'Already claimed' });
    ss.st.claimed.push(tier);
    switch (rw.kind) {
      case 'gold': s.char.gold += Number(rw.value); break;
      case 'dust': s.char.dust += Number(rw.value); break;
      case 'respec': s.char.respecTokens += Number(rw.value); break;
      case 'title': if (!s.account.titles.includes(String(rw.value))) s.account.titles.push(String(rw.value)); break;
      case 'aura': if (!s.account.auras.includes(String(rw.value))) s.account.auras.push(String(rw.value)); break;
      default: break;
    }
    this.tx({ characters: [s.char] });
    this.saveAcct(s.accountId, s.account);
    this.persist.audit({ accountId: s.accountId, charId: s.char.id, action: 'season_claim', data: { season: ss.def.id, tier, reward: rw } });
    this.toast(s, `Season reward: ${rw.label}`);
    this.markDirty(s); this.sendChar(s); this.sendSeason(s);
  }

  private guildVault(s: Session, room: Room, msg: any) {
    const g = this.guildOf(s.char.id);
    if (!g) return s.send({ t: 'err', msg: 'You are not in a guild' });
    if (!this.nearNpc(s, room, 'stash')) return s.send({ t: 'err', msg: 'Use the Astral Vault in Lumenhold to reach the guild vault' });
    const r = msg.t === 'guild_vault_put' ? EC.vaultDeposit(g, s.char, clampInt(msg.inv, 0, s.char.inventory.length - 1), this.clock()) : EC.vaultWithdraw(g, s.char, clampInt(msg.idx, 0, EC.GUILD_VAULT_SIZE - 1), this.clock());
    if (!r.ok) return s.send({ t: 'err', msg: r.reason });
    this.tx({ guilds: [g], characters: [s.char] }); // one transaction: item leaves one side and arrives on the other
    this.persist.audit({ accountId: s.accountId, charId: s.char.id, action: msg.t, data: { guild: g.id, uid: r.value.uid } });
    this.markDirty(s); this.sendChar(s); this.guildSync(g);
  }

  private pets(s: Session, room: Room, msg: any) {
    const id = msg.id === null ? null : String(msg.id ?? '');
    if (msg.t === 'pet_set') {
      if (id && !s.account.pets.includes(id)) return s.send({ t: 'err', msg: 'You do not own that companion' });
      s.account.pet = id;
    } else {
      if (!this.nearNpc(s, room, 'npc_stable')) return s.send({ t: 'err', msg: 'Companions are adopted from Stablemaster Rook' });
      const pet = id ? PETS[id] : undefined;
      if (!pet) return s.send({ t: 'err', msg: 'Unknown companion' });
      if (s.account.pets.includes(id!)) return s.send({ t: 'err', msg: 'Already adopted' });
      for (const [m, n] of Object.entries(pet.cost.mats ?? {})) if ((s.char.mats[m] ?? 0) < n) return s.send({ t: 'err', msg: `Needs ${n} ${MATERIALS[m]?.name ?? m}` });
      if (s.char.gold < pet.cost.gold) return s.send({ t: 'err', msg: `Needs ${pet.cost.gold} gold` });
      s.char.gold -= pet.cost.gold;
      for (const [m, n] of Object.entries(pet.cost.mats ?? {})) s.char.mats[m]! -= n;
      s.account.pets.push(id!); s.account.pet = id;
      this.tx({ characters: [s.char] });
      this.persist.audit({ accountId: s.accountId, charId: s.char.id, action: 'pet_buy', data: { pet: id, cost: pet.cost } });
      this.toast(s, `${pet.name} joins you!`);
    }
    const ent = room.world.ents.get(s.entId);
    if (ent?.p) ent.p.pet = s.account.pet;
    this.saveAcct(s.accountId, s.account);
    this.markDirty(s); this.sendChar(s);
  }

  // ─────────── Meta systems: login, shop, benefits, awakening, emblems, cosmetics, mounts, wishes ───────────
  private metaMsg(s: Session, room: Room, msg: any) {
    const now = this.clock();
    const ent = room.world.ents.get(s.entId);
    const meta = M.ensureMeta(s.account);
    let r: { ok: true; value: any } | { ok: false; reason: string };
    let text = '';
    switch (msg.t) {
      case 'login_claim': r = M.claimLogin(s.account, s.char, now); if (r.ok) text = `Day ${r.value.day + 1} reward: ${M.rewardText(r.value.reward)}`; break;
      case 'shop_buy': r = M.buyShop(s.account, s.char, String(msg.id ?? ''), now); if (r.ok) text = `Bought ${r.value.item.name}`; break;
      case 'benefit_claim': r = M.claimBenefit(s.account, s.char, String(msg.id ?? '')); if (r.ok) text = `Benefit claimed: ${M.rewardText(r.value.reward)}`; break;
      case 'bag_expand': r = M.expandBag(s.char); if (r.ok) text = `Bags expanded to ${r.value.size} slots`; break;
      case 'awaken': r = M.awaken(s.char); if (r.ok) text = `Awakening ${r.value.level} reached`; break;
      case 'afk_claim': r = M.claimAfk(s.account, s.char); if (r.ok) { text = `Camp rewards collected: ${r.value.gold} gold, ${r.value.xp} XP${r.value.levels ? ` (+${r.value.levels} level)` : ''}`; if (ent) room.world.refresh(ent); } break;
      case 'emblem_set': r = M.setEmblems(s.account, s.char, msg.ids); break;
      case 'cosmetic_set': { const kind = msg.kind === 'frame' ? 'frame' : msg.kind === 'mount' ? 'mount' : 'costume'; r = M.setCosmetic(s.account, kind, msg.id === null ? null : String(msg.id ?? '')); if (r.ok && ent?.p) { ent.p.costume = meta.cosmetics.costume; if (kind === 'mount' && !meta.mount) ent.p.mount = null; } break; }
      case 'mount_toggle': {
        if (!ent?.p) return;
        if (ent.p.mount) { ent.p.mount = null; ent.dirty = true; return; }
        if (!meta.mount) return s.send({ t: 'err', msg: 'You have no mount yet — buy one in the Shop or earn one from Benefits' });
        if (ent.p.combatT < 3 || ent.dead) return s.send({ t: 'err', msg: 'Cannot mount while in combat' });
        if (room.kind === 'dungeon') return s.send({ t: 'err', msg: 'Mounts are for towns and the open world' });
        ent.p.mount = meta.mount; ent.dirty = true; return;
      }
      case 'wish': { const n = Number(msg.n) === 10 ? 10 : 1; r = M.wish(s.account, s.char, n, this.rng, now); if (r.ok) s.send({ t: 'wish_result', prizes: r.value.map((x: any) => ({ id: x.prize.id, r: x.prize.r, name: x.prize.name, got: x.got })) }); break; }
      default: return;
    }
    if (!r.ok) return s.send({ t: 'err', msg: r.reason });
    this.tx({ characters: [s.char], accounts: [{ id: s.accountId, progress: s.account }] });
    this.persist.audit({ accountId: s.accountId, charId: s.char.id, action: msg.t, data: { id: msg.id ?? msg.n ?? null } });
    if (text) this.toast(s, text);
    if (ent) ent.dirty = true;
    s.dirty = true;
    this.sendChar(s);
  }

  // ─────────── Tutorial ───────────
  /** Advance only when the observed action matches the current step (no skipping ahead by accident). */
  private tutorial(s: Session, id: string) {
    const i = s.char.tutorial ?? -1;
    if (i < 0 || TUTORIAL[i]?.id !== id) return;
    s.char.gold += TUTORIAL[i]!.gold;
    s.char.tutorial = i + 1 >= TUTORIAL.length ? -1 : i + 1;
    s.dirty = true;
    this.persist.audit({ accountId: s.accountId, charId: s.char.id, action: 'tutorial', data: { step: id } });
    s.send({ t: 'tutorial_done', id, gold: TUTORIAL[i]!.gold });
    this.sendChar(s);
    this.sendTutorial(s);
  }
  private sendTutorial(s: Session) {
    const i = s.char.tutorial ?? -1;
    s.send({ t: 'tutorial', step: i, total: TUTORIAL.length, cur: i >= 0 ? TUTORIAL[i] : null });
  }

  // ─────────── Hearth (player housing) ───────────
  private houseOf(s: Session): HouseState { return (s.account.house ??= emptyHouse()); }
  private enterHouse(s: Session, owner: Session) {
    const id = `house:${owner.accountId}`;
    let room = this.rooms.get(id);
    if (!room) room = this.createRoom(id, buildHouse(owner.accountId, owner.char.name, this.houseOf(owner)), 'normal', 0);
    this.moveTo(s, id);
    s.send({ t: 'house', owner: owner.char.name, mine: owner.accountId === s.accountId, house: owner.accountId === s.accountId ? this.houseOf(owner) : null });
  }
  /** Rebuild the owner's house map in place (players stay where they are) and push it to everyone inside. */
  private refreshHouse(owner: Session) {
    const room = this.rooms.get(`house:${owner.accountId}`);
    if (!room) return;
    const map = buildHouse(owner.accountId, owner.char.name, this.houseOf(owner));
    const w = room.world;
    for (const e of [...w.ents.values()]) if (e.kind === 'enemy') w.ents.delete(e.id);
    w.map = map;
    for (const sp of map.spawns) w.spawnEnemy(sp.enemy, sp.x, sp.y, 1, false);
    for (const e of w.ents.values()) if (e.kind === 'player') { const [x, y] = [e.x, e.y]; if (circleBlocked(map, x, y, e.r)) { e.x = map.spawn.x; e.y = map.spawn.y; } }
    this.broadcast(room, { t: 'map_update', map });
  }
  private housing(s: Session, room: Room, msg: any) {
    const err = (m: string) => s.send({ t: 'err', msg: m });
    const house = this.houseOf(s);
    const inOwnHouse = room.id === `house:${s.accountId}`;
    const commit = (action: string, data: unknown) => {
      this.tx({ characters: [s.char], accounts: [{ id: s.accountId, progress: s.account }] }); // gold/materials and furniture in one transaction
      this.persist.audit({ accountId: s.accountId, charId: s.char.id, action, data });
      this.markDirty(s); this.sendChar(s);
      s.send({ t: 'house', owner: s.char.name, mine: true, house });
    };
    switch (msg.t) {
      case 'house_buy': {
        if (!this.nearNpc(s, room, 'npc_carpenter')) return err('Furniture is sold by Carpenter Odo in Lumenhold');
        const f = FURNITURE[String(msg.id)];
        if (!f) return err('Unknown furniture');
        if (f.req && !s.account.achievements.includes(f.req)) return err(`Requires the achievement "${ACHIEVEMENTS[f.req]?.name ?? f.req}"`);
        if (s.char.gold < f.cost.gold) return err(`Needs ${f.cost.gold} gold`);
        for (const [m, n] of Object.entries(f.cost.mats ?? {})) if ((s.char.mats[m] ?? 0) < n) return err(`Needs ${n} ${MATERIALS[m]?.name ?? m}`);
        s.char.gold -= f.cost.gold;
        for (const [m, n] of Object.entries(f.cost.mats ?? {})) s.char.mats[m]! -= n;
        house.owned[f.id] = (house.owned[f.id] ?? 0) + 1;
        this.toast(s, `Bought ${f.name} — place it in your Hearth`);
        return commit('house_buy', { id: f.id, cost: f.cost });
      }
      case 'house_place': {
        if (!inOwnHouse) return err('Enter your Hearth to place furniture');
        const id = String(msg.id), x = Math.floor(Number(msg.x)), y = Math.floor(Number(msg.y));
        const why = validatePlacement(house, id, x, y);
        if (why) return err(why);
        house.placed.push({ id, x, y });
        this.progressQuest(s, 'house', undefined, house.placed.length, true);
        this.achieve(s, 'homeowner');
        commit('house_place', { id, x, y });
        return this.refreshHouse(s);
      }
      case 'house_remove': {
        if (!inOwnHouse) return err('Enter your Hearth first');
        const i = clampInt(msg.index, 0, 999);
        if (!house.placed[i]) return err('Nothing there');
        house.placed.splice(i, 1);
        commit('house_remove', { index: i });
        return this.refreshHouse(s);
      }
      case 'house_perm': {
        const p = String(msg.perm);
        if (!['private', 'party', 'guild', 'public'].includes(p)) return err('Bad permission');
        house.perm = p as HouseState['perm'];
        this.saveAcct(s.accountId, s.account);
        return s.send({ t: 'house', owner: s.char.name, mine: true, house });
      }
      case 'house_visit': {
        if (room.kind !== 'town') return err('Visit Hearths from Lumenhold');
        const o = [...this.sessions.values()].find((x) => x.char.name.toLowerCase() === String(msg.name ?? '').toLowerCase());
        if (!o) return err('That player is not online');
        const perm = this.houseOf(o).perm;
        const sameParty = !!s.partyId && s.partyId === o.partyId;
        const g = this.guildOf(o.char.id);
        const sameGuild = !!g && g.members.some((m) => m.charId === s.char.id);
        const allowed = o.accountId === s.accountId || perm === 'public' || (perm === 'party' && sameParty) || (perm === 'guild' && sameGuild);
        if (!allowed) return err(`${o.char.name}'s Hearth is ${perm === 'private' ? 'private' : `open to their ${perm} only`}`);
        return this.enterHouse(s, o);
      }
    }
  }

  // ─────────── Open-world public event: world boss ───────────
  private tickWorldEvent() {
    const field = this.rooms.get('field');
    if (!field) return;
    const ev = this.worldEvent;
    ev.statusT -= 1 / TICK_RATE;
    if (!ev.active) {
      if (this.now >= ev.nextAt && field.sessions.size > 0 && this.live.flags.worldBoss) {
        const m = field.world.map;
        const reach = reachableSet(m, m.spawn.x, m.spawn.y);
        let x = m.w * TILE * 0.55, y = m.h * TILE * 0.5;
        for (let i = 0; i < 200; i++) {
          const tx = Math.floor(m.w * (0.35 + this.rng.next() * 0.5)), ty = Math.floor(m.h * (0.2 + this.rng.next() * 0.6));
          if (reach.has(ty * m.w + tx) && reach.has(ty * m.w + tx + 1) && reach.has((ty + 1) * m.w + tx)) { x = tx * TILE + 16; y = ty * TILE + 16; break; }
        }
        const boss = field.world.spawnWorldBoss('gloomheart', x, y, 8, field.sessions.size);
        if (!boss) return;
        Object.assign(ev, { active: true, bossId: boss.id, startedAt: this.now, x, y, statusT: 0 });
        for (const o of this.sessions.values()) { this.toast(o, 'World event: Gloomheart, the Eclipsed Grove, has awakened in Duskmeadow!'); }
      } else if (ev.statusT <= 0) { ev.statusT = 10; for (const id of field.sessions) { const o = this.sessions.get(id); if (o) this.sendWorldEvent(o); } }
      return;
    }
    const boss = field.world.ents.get(ev.bossId);
    if (!boss || boss.dead) {
      ev.active = false; ev.nextAt = this.now + 300;
      this.broadcast(field, { t: 'toast', msg: 'Gloomheart has fallen! The grove will stir again in 5 minutes.' });
    } else if (this.now - ev.startedAt > 600) {
      field.world.removeEnt(ev.bossId);
      ev.active = false; ev.nextAt = this.now + 300;
      this.broadcast(field, { t: 'toast', msg: 'Gloomheart sinks back into the earth…' });
    }
    if (ev.statusT <= 0) { ev.statusT = 2; for (const id of field.sessions) { const o = this.sessions.get(id); if (o) this.sendWorldEvent(o); } }
  }
  private sendWorldEvent(s: Session) {
    const ev = this.worldEvent;
    const boss = ev.active ? this.rooms.get('field')?.world.ents.get(ev.bossId) : undefined;
    s.send({ t: 'world_event', active: ev.active, name: 'Gloomheart, the Eclipsed Grove', x: Math.round(ev.x), y: Math.round(ev.y), hp: boss ? Math.round((boss.hp / boss.maxHp) * 100) : 0, nextIn: ev.active ? 0 : Math.max(0, Math.round(ev.nextAt - this.now)), endsIn: ev.active ? Math.max(0, Math.round(600 - (this.now - ev.startedAt))) : 0 });
  }

  private broadcast(room: Room, msg: unknown) {
    for (const id of room.sessions) this.sessions.get(id)?.send(msg);
  }

  // ─────────── Simulation loop ───────────
  tick(dt: number) {
    this.now += dt;
    this.tickN++;
    for (const s of this.sessions.values()) s.bucket = Math.min(90, s.bucket + dt * 45);
    for (const room of [...this.rooms.values()]) {
      if (room.sessions.size === 0 && room.id.startsWith('house:')) { room.emptyT += dt; if (room.emptyT > 60) this.rooms.delete(room.id); continue; }
      if (room.sessions.size === 0 && room.kind !== 'dungeon' && room.kind !== 'field') continue;
      // Empty open-world zones only advance timers (respawns) twice a second instead of simulating at 30 Hz.
      if (room.sessions.size === 0 && room.kind === 'field') { room.emptyT += dt; if (room.emptyT < 0.5) continue; const step = room.emptyT; room.emptyT = 0; room.world.idle(step); continue; }
      room.world.tick(dt);
      this.processEvents(room, room.world.events);
      room.world.events = [];
      this.tickInstance(room);
      if (room.kind === 'dungeon' || room.id.startsWith('house:')) {
        if (room.sessions.size === 0) { room.emptyT += dt; if (room.emptyT > (room.kind === 'dungeon' ? 120 : 60)) this.rooms.delete(room.id); }
      }
    }
    if (this.tickN % 2 === 0) {
      for (const s of this.sessions.values()) {
        const room = this.rooms.get(s.roomId);
        if (room) s.send({ t: 'snap', ...this.compress(s, room.world.snapshotFor(s.entId)) });
      }
    }
    // periodic saves
    for (const s of this.sessions.values()) { s.saveT -= dt; if (s.saveT <= 0) { s.saveT = 30; if (s.dirty) this.save(s); } }
    for (const [k, v] of this.reconnect) if (v.until < this.now) this.reconnect.delete(k);
    this.tickWorldEvent();
    for (const s of this.sessions.values()) {
      const f = s.fishing;
      if (!f) continue;
      const e = this.rooms.get(s.roomId)?.world.ents.get(s.entId);
      if (!e || dist(e.x, e.y, f.x, f.y) > 150) { s.fishing = null; s.send({ t: 'fish', state: 'cancel' }); continue; }
      if (!f.bit && this.now >= f.biteAt) { f.bit = true; s.send({ t: 'fish', state: 'bite' }); }
      else if (f.bit && this.now > f.until) { s.fishing = null; s.send({ t: 'fish', state: 'lost' }); this.toast(s, 'It got away.'); }
    }
    if (this.tickN % (TICK_RATE * 5) === 0) {
      const l = this.liveLoot();
      for (const r of this.rooms.values()) r.world.live = l;
      const t = this.clock();
      for (const s of this.sessions.values()) if (s.char.elixir && s.char.elixir.until <= t) { s.char.elixir = null; this.markDirty(s); this.sendChar(s); this.toast(s, 'Your elixir has worn off.'); }
    }
    for (const [k, e] of this.pf) if (this.clock() - e.at > 15 * 60_000) this.pf.delete(k);
  }

  /**
   * Delta-compress a snapshot for one client: entity static fields are sent only when new/changed,
   * projectiles and areas only once (the client extrapolates them) plus a list of ids still alive.
   */
  private compress(s: Session, snap: ReturnType<World['snapshotFor']>) {
    const known = (s.netCache ??= { room: '', ents: new Map<number, string>(), projs: new Map<number, string>(), areas: new Map<number, string>() });
    if (known.room !== s.roomId) { known.room = s.roomId; known.ents.clear(); known.projs.clear(); known.areas.clear(); }
    const ents = (snap.ents as any[][]).map((e) => {
      const key = `${e[1]}|${e[6]}|${e[8]}|${e[9]}|${e[10]}|${e[12]}|${e[16]}|${e[20]}|${e[21]}|${e[22]}|${e[23]}`;
      if (known.ents.get(e[0]) === key) return [e[0], e[2], e[3], e[4], e[5], e[7], e[11], e[13], e[14], e[15], e[17], e[18], e[19]];
      known.ents.set(e[0], key);
      return e;
    });
    const alive = new Set(ents.map((e) => e[0] as number));
    for (const id of known.ents.keys()) if (!alive.has(id)) known.ents.delete(id);
    const delta = (list: any[][], cache: Map<number, string>, sig: (x: any[]) => string) => {
      const out: any[][] = [];
      const ids = list.map((x) => x[0] as number);
      for (const x of list) { const k = sig(x); if (cache.get(x[0]) !== k) { cache.set(x[0], k); out.push(x); } }
      const keep = new Set(ids);
      for (const id of cache.keys()) if (!keep.has(id)) cache.delete(id);
      return { full: out, ids };
    };
    const pr = delta(snap.projs as any[][], known.projs, (p) => `${p[3]},${p[4]}`); // re-send only when direction changes (chain/bounce)
    const ar = delta(snap.areas as any[][], known.areas, (a) => `${a[1]},${a[2]},${a[12]}`); // re-send when moved or fired
    return { ...snap, ents, projs: pr.full, pid: pr.ids, areas: ar.full, aid: ar.ids, z: 1 };
  }

  private sessionByEnt(room: Room, entId: number): Session | undefined {
    for (const id of room.sessions) { const s = this.sessions.get(id); if (s?.entId === entId) return s; }
    return undefined;
  }

  private processEvents(room: Room, events: WorldEvent[]) {
    if (!events.length) return;
    const pub: WorldEvent[] = [];
    const priv = new Map<number, WorldEvent[]>();
    for (const ev of events) {
      switch (ev.t) {
        case 'kill': {
          for (const pid of ev.players) {
            const s = this.sessionByEnt(room, pid);
            if (!s) continue;
            const lvlGap = s.char.level - ev.level;
            const penalty = lvlGap > 5 ? Math.max(0.1, 1 - (lvlGap - 5) * 0.15) : 1; // anti low-level farming
            const share = ev.players.length > 1 ? 1.1 / ev.players.length + 0.3 : 1; // group bonus
            this.giveXp(s, ev.xp * penalty * Math.min(1, share) * this.effects().xpMul);
            this.weekly(s, 'kills', 1);
            s.char.stats.kills++;
            if (ev.boss) s.char.stats.bossKills++;
            if (s.run) s.run.kills++;
            s.account.codex[ev.enemy] = (s.account.codex[ev.enemy] ?? 0) + 1;
            const fam = ENEMIES[ev.enemy]?.family;
            this.progressQuest(s, 'kill_family', fam, 1);
            this.progressQuest(s, 'kill_enemy', ev.enemy, 1);
            if (ev.elite) this.progressQuest(s, 'elite', undefined, 1);
            if (ev.boss) this.progressQuest(s, 'boss', ev.enemy, 1);
            if (s.char.stats.kills === 1) this.achieve(s, 'first_blood');
            if (Object.keys(s.account.codex).length >= 8) this.achieve(s, 'codex8');
            // material drops go straight to the material pouch (no inventory clutter)
            const drop: Record<string, number> = {};
            if (fam === 'wildlife' && this.rng.chance(0.3)) drop.beast_meat = 1;
            if (room.kind === 'field' && this.rng.chance(0.02)) drop.treasure_map = 1;
            if (fam === 'shardborn' && this.rng.chance(0.2)) drop.starglass = 1;
            if (fam === 'cinderkin') { if (this.rng.chance(0.25)) drop.cinder_core = 1; if (ev.enemy === 'cinder_drake' && this.rng.chance(0.4)) drop.beast_meat = 1; }
            if (Object.keys(drop).length) { C.addMats(s.char, drop); s.send({ t: 'mats', got: drop }); }
            this.sendChar(s);
          }
          break;
        }
        case 'boss_killed':
          for (const pid of ev.players) {
            const s = this.sessionByEnt(room, pid);
            if (!s) continue;
            if (ev.enemy === 'veyra') {
              this.achieve(s, 'rift_walker');
              if (s.char.hardcore) this.achieve(s, 'hardcore_warden');
            }
            if (ev.enemy === 'gloomheart') { this.achieve(s, 'world_boss'); this.guildXp(s, 300, 'helped defeat Gloomheart'); this.weekly(s, 'world_boss', 1); this.seasonGain(s, SHARD_SOURCES.worldBoss); }
            this.save(s);
          }
          pub.push(ev);
          break;
        case 'player_death': {
          const s = this.sessionByEnt(room, ev.id);
          if (s) {
            if (s.char.hardcore) {
              s.char.dead = true;
              this.persist.audit({ accountId: s.accountId, charId: s.char.id, action: 'hardcore_death', data: { room: room.id, level: s.char.level } });
              this.save(s);
              s.send({ t: 'hc_dead', name: s.char.name, level: s.char.level });
              const sid = s.id;
              setTimeout(() => this.disconnect(sid), 3500);
            } else if (room.world.opts.noRespawn) {
              this.toast(s, 'You are down! An ally can revive you (stand next to you and press Interact).');
            } else {
              const loss = s.char.level < 5 ? 0 : Math.floor(s.char.gold * 0.05); // no death penalty while learning
              s.char.gold -= loss;
              this.toast(s, `You have fallen. ${loss > 0 ? `Lost ${loss} gold. ` : ''}Respawning in 5s...`);
              s.dirty = true;
            }
          }
          pub.push(ev);
          break;
        }
        case 'pickup': {
          const s = this.sessionByEnt(room, ev.to);
          if (s) {
            if (ev.item) {
              if (s.run) s.run.items++;
              this.tutorial(s, 'loot');
              this.persist.audit({ accountId: s.accountId, charId: s.char.id, action: 'loot', data: { uid: ev.item.uid, base: ev.item.baseId, rarity: ev.item.rarity } });
              if (ev.item.rarity === 'legendary' || ev.item.rarity === 'ancient') this.achieve(s, 'legendary');
              this.sendChar(s);
            }
            s.dirty = true;
          }
          (priv.get(ev.to) ?? priv.set(ev.to, []).get(ev.to)!).push(ev);
          break;
        }
        default:
          if (ev.t === 'dmg' && room.world.ents.get(ev.id)?.e?.def.id === 'dummy') { const o = this.sessionByEnt(room, ev.src); if (o) this.tutorial(o, 'dummy'); }
          if ('to' in ev && typeof ev.to === 'number' && ev.t !== 'dmg') (priv.get(ev.to) ?? priv.set(ev.to, []).get(ev.to)!).push(ev);
          else pub.push(ev);
      }
    }
    for (const id of room.sessions) {
      const s = this.sessions.get(id);
      if (!s) continue;
      const mine = priv.get(s.entId);
      const list = mine ? pub.concat(mine) : pub;
      if (list.length) s.send({ t: 'ev', list });
    }
  }

  save(s: Session) {
    s.dirty = false;
    void this.persist.saveCharacter(s.char).catch(() => { s.dirty = true; });
  }

  saveAll() {
    for (const s of this.sessions.values()) this.save(s);
  }

  stats() {
    return { sessions: this.sessions.size, rooms: [...this.rooms.values()].map((r) => ({ id: r.id, kind: r.kind, players: r.sessions.size, ents: r.world.ents.size })) };
  }
}

function clampInt(v: unknown, lo: number, hi: number): number {
  const n = Math.floor(Number(v));
  return Number.isFinite(n) ? Math.max(lo, Math.min(hi, n)) : lo;
}
const str = (v: unknown) => (typeof v === 'string' ? v : null);

export const SIM_DT = 1 / TICK_RATE;

/** Rebuilds full entity tuples from a delta-compressed snapshot. `statics` must persist across snapshots. */
export function expandEntities(statics: Map<number, any[]>, ents: any[][]): any[][] {
  const out: any[][] = [];
  const seen = new Set<number>();
  for (const raw of ents) {
    seen.add(raw[0]);
    if (raw.length === 13) { const st = statics.get(raw[0]); if (!st) continue; out.push([raw[0], st[1], raw[1], raw[2], raw[3], raw[4], st[6], raw[5], st[8], st[9], st[10], raw[6], st[12], raw[7], raw[8], raw[9], st[16], raw[10], raw[11], raw[12], st[20], st[21], st[22], st[23]]); }
    else { statics.set(raw[0], raw); out.push(raw); }
  }
  for (const id of statics.keys()) if (!seen.has(id)) statics.delete(id);
  return out;
}
