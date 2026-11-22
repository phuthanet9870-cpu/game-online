// GameCore: authoritative session/room/party/quest orchestration. Transport- and storage-agnostic.
// The Node server wires it to WebSockets + PostgreSQL; the offline build wires it to an in-page
// message channel + browser storage. Both run this exact code.

import * as C from './character.js';
import { CLASSES } from './data/classes.js';
import { classSkills } from './data/skills.js';
import { BLESSINGS, BLESSING_MAP } from './data/dungeon.js';
import { DIFFICULTIES, DIFFICULTY_ORDER, ENEMIES } from './data/enemies.js';
import { POTION } from './data/items.js';
import { decodeBuild } from './data/passives.js';
import { ACHIEVEMENTS, QUESTS, QUEST_MAP } from './data/quests.js';
import { generateItem, rollRarity } from './loot.js';
import { Rng, dist } from './math.js';
import { buildField, buildTown, generateDungeon, type GameMap } from './maps.js';
import type { AccountProgress, CharacterData, DifficultyId, EquipSlot } from './types.js';
import { EQUIP_SLOTS, PROTOCOL_VERSION, STASH_SIZE } from './types.js';
import { TICK_RATE, World, type WorldEvent } from './world.js';

export interface Persistence {
  saveCharacter(ch: CharacterData): Promise<void>;
  saveAccount(accountId: string, prog: AccountProgress): Promise<void>;
  audit(entry: { accountId: string; charId: string; action: string; data: unknown }): void;
}

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
}

interface Room { id: string; kind: 'town' | 'field' | 'dungeon'; world: World; sessions: Set<string>; emptyT: number; difficulty: DifficultyId; seed: number; partyId: string | null }
interface Party { id: string; leader: string; members: string[] }

const MUTATIONS = new Set(['equip', 'unequip', 'salvage', 'sell', 'enchant', 'move_inv', 'loadout', 'passive_alloc', 'passive_refund', 'respec', 'preset_save', 'preset_load', 'import_build', 'buy_potion', 'quest_accept', 'quest_claim', 'stash_put', 'stash_take', 'choose']);

export function emptyAccount(): AccountProgress {
  return { codex: {}, achievements: [], titles: [], stash: { normal: Array(STASH_SIZE).fill(null), hardcore: Array(STASH_SIZE).fill(null) } };
}
export function normalizeAccount(a: Partial<AccountProgress> | null | undefined): AccountProgress {
  const e = emptyAccount();
  if (!a) return e;
  return { codex: a.codex ?? {}, achievements: a.achievements ?? [], titles: a.titles ?? [], stash: { normal: pad(a.stash?.normal, STASH_SIZE), hardcore: pad(a.stash?.hardcore, STASH_SIZE) } };
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

  constructor(private persist: Persistence, private opts: { label: string } = { label: 'server' }) {
    this.createRoom('town', buildTown(), 'normal', 0);
    this.createRoom('field', buildField(1337), 'normal', 1337);
  }

  private createRoom(id: string, map: GameMap, difficulty: DifficultyId, seed: number, partySize = 1, partyId: string | null = null): Room {
    const kind = map.theme;
    const world = new World(map, { difficulty, partySize, seed, kind });
    const room: Room = { id, kind, world, sessions: new Set(), emptyT: 0, difficulty, seed, partyId };
    this.rooms.set(id, room);
    return room;
  }

  // ─────────── Connection lifecycle ───────────
  connect(sessionId: string, accountId: string, rawChar: CharacterData, account: AccountProgress, send: Send): void {
    const char = C.normalizeCharacter(rawChar);
    if (char.dead) { send({ t: 'err', msg: 'This Hardcore character has fallen and cannot be played.', fatal: true }); return; }
    // one live session per character
    for (const s of this.sessions.values()) if (s.char.id === char.id) this.disconnect(s.id, 'Logged in from another session');
    const s: Session = {
      id: sessionId, accountId, char, account: normalizeAccount(account), send, roomId: 'town', entId: 0, rids: [], bucket: 60, violations: 0, lastChat: 0,
      dirty: false, saveT: 30, partyId: null, invites: new Set(), blocked: new Set(), pendingChoice: null, run: null, closed: false,
    };
    this.sessions.set(sessionId, s);
    const rc = this.reconnect.get(char.id);
    if (rc && rc.until > this.now && this.rooms.has(rc.roomId)) {
      this.reconnect.delete(char.id);
      this.joinRoom(s, rc.roomId, { x: rc.x, y: rc.y });
      this.toast(s, 'Reconnected to your previous instance.');
    } else this.joinRoom(s, 'town');
    if (this.announcement) this.toast(s, this.announcement);
  }

  disconnect(sessionId: string, reason?: string) {
    const s = this.sessions.get(sessionId);
    if (!s || s.closed) return;
    s.closed = true;
    if (reason) s.send({ t: 'err', msg: reason, fatal: true });
    const room = this.rooms.get(s.roomId);
    const ent = room?.world.ents.get(s.entId);
    if (room && room.kind === 'dungeon' && ent && !ent.dead) this.reconnect.set(s.char.id, { roomId: room.id, until: this.now + 90, x: ent.x, y: ent.y });
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
    s.entId = ent.id;
    s.send({
      t: 'welcome', v: PROTOCOL_VERSION, mode: this.opts.label, pid: ent.id, room: { id: room.id, kind: room.kind, difficulty: room.difficulty, seed: room.seed, modifiers: room.world.map.modifiers, level: room.world.map.level },
      map: room.world.map, char: s.char, account: s.account,
    });
    this.sendParty(s);
  }

  private leaveRoom(s: Session) {
    const room = this.rooms.get(s.roomId);
    if (!room) return;
    room.sessions.delete(s.id);
    room.world.removeEnt(s.entId);
    s.entId = 0;
  }

  private moveTo(s: Session, roomId: string, pos?: { x: number; y: number }) {
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
        case 'input': w.setInput(pid, { mx: msg.mx, my: msg.my, ax: msg.ax, ay: msg.ay, attack: msg.atk }); break;
        case 'cast': err(w.castSkill(pid, msg.k === 'u' ? 'ultimate' : 'active', clampInt(msg.s, 0, msg.k === 'u' ? 3 : 7), +msg.ax, +msg.ay, +msg.tid || 0)); break;
        case 'dodge': err(w.dodge(pid, +msg.dx, +msg.dy)); break;
        case 'potion': err(w.usePotion(pid)); this.sendChar(s); break;
        case 'target': w.setTarget(pid, +msg.id || 0); break;
        case 'pickup': { const e = w.pickup(pid, +msg.id); if (e) err(e); else { s.dirty = true; } break; }
        case 'interact': this.interact(s, room); break;
        case 'choose': this.choose(s, room, String(msg.choice ?? '')); break;
        case 'enter_dungeon': this.enterDungeon(s, room, msg.diff); break;
        case 'leave': if (room.kind !== 'town') this.returnToTown(s, room, false); break;
        case 'equip': this.mutate(s, C.equipFromInventory(s.char, clampInt(msg.inv, 0, 39), EQUIP_SLOTS.includes(msg.slot) ? msg.slot : undefined), 'equip'); break;
        case 'unequip': this.mutate(s, EQUIP_SLOTS.includes(msg.slot) ? C.unequip(s.char, msg.slot as EquipSlot) : { ok: false, reason: 'Bad slot' }, 'unequip'); break;
        case 'move_inv': this.mutate(s, C.moveInventory(s.char, clampInt(msg.from, 0, 39), clampInt(msg.to, 0, 39)), null); break;
        case 'salvage': { if (!this.nearNpc(s, room, 'npc_smith')) return err('Visit the Blacksmith to salvage'); const it = s.char.inventory[clampInt(msg.inv, 0, 39)]; const r = C.salvageItem(s.char, clampInt(msg.inv, 0, 39)); this.mutate(s, r, 'salvage', { item: it?.uid, dust: r.ok ? r.value : 0 }); break; }
        case 'sell': { if (!this.nearNpc(s, room, 'npc_quartermaster')) return err('Visit the Quartermaster to sell'); const it = s.char.inventory[clampInt(msg.inv, 0, 39)]; const r = C.sellItem(s.char, clampInt(msg.inv, 0, 39)); this.mutate(s, r, 'sell', { item: it?.uid, gold: r.ok ? r.value : 0 }); break; }
        case 'enchant': { if (!this.nearNpc(s, room, 'npc_smith')) return err('Visit the Blacksmith to enchant'); const loc = msg.slot && EQUIP_SLOTS.includes(msg.slot) ? { slot: msg.slot as EquipSlot } : { inv: clampInt(msg.inv, 0, 39) }; this.mutate(s, C.enchantItem(s.char, loc, clampInt(msg.affix, 0, 9), this.rng), 'enchant', loc); break; }
        case 'buy_potion': {
          if (!this.nearNpc(s, room, 'npc_quartermaster')) return err('Visit the Quartermaster');
          if (s.char.potions >= POTION.maxCharges) return err('Potion belt is full');
          if (s.char.gold < POTION.buyPrice) return err(`Need ${POTION.buyPrice} gold`);
          s.char.gold -= POTION.buyPrice; s.char.potions++;
          this.mutate(s, { ok: true, value: undefined }, 'buy_potion', { gold: -POTION.buyPrice });
          break;
        }
        case 'loadout': { const r = Array.isArray(msg.active) && Array.isArray(msg.ultimate) ? C.setLoadout(s.char, msg.active.map(str), msg.ultimate.map(str)) : { ok: false as const, reason: 'Bad loadout' }; this.mutate(s, r, null); break; }
        case 'passive_alloc': this.mutateStats(s, C.allocatePassive(s.char, String(msg.node))); break;
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
        case 'quest_accept': if (!this.nearNpc(s, room, 'npc_quests')) return err('Talk to Commander Aveline in Lumenhold'); this.questAccept(s, String(msg.id)); break;
        case 'quest_claim': if (!this.nearNpc(s, room, 'npc_quests')) return err('Talk to Commander Aveline in Lumenhold'); this.questClaim(s, String(msg.id)); break;
        case 'stash_put': case 'stash_take': this.stash(s, room, msg); break;
        case 'chat': this.chat(s, room, msg); break;
        case 'block': s.blocked.add(String(msg.name).slice(0, 16)); this.toast(s, `Blocked ${msg.name}`); break;
        case 'report': this.persist.audit({ accountId: s.accountId, charId: s.char.id, action: 'report', data: { name: String(msg.name).slice(0, 16), reason: String(msg.reason ?? '').slice(0, 200) } }); this.toast(s, 'Report submitted. Thank you.'); break;
        case 'party_invite': this.partyInvite(s, String(msg.name)); break;
        case 'party_accept': this.partyAccept(s, String(msg.id)); break;
        case 'party_leave': this.leaveParty(s); break;
        case 'party_kick': this.partyKick(s, String(msg.name)); break;
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

  private sendChar(s: Session) { s.send({ t: 'char', char: s.char, account: s.account }); }
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
    const it = w.interactableNear(s.entId, 110);
    if (!it) return;
    const ent = w.ents.get(s.entId);
    if (!ent || ent.dead) return;
    switch (it.type) {
      case 'portal_dungeon': s.send({ t: 'open', what: 'dungeon', unlocked: this.unlockedTiers(s) }); break;
      case 'gate_field': this.moveTo(s, 'field'); break;
      case 'gate_town': this.moveTo(s, 'town', { x: 52 * 32, y: 22 * 32 + 16 }); break;
      case 'npc_smith': s.send({ t: 'open', what: 'smith' }); break;
      case 'npc_trainer': s.send({ t: 'open', what: 'trainer' }); break;
      case 'npc_quartermaster': s.send({ t: 'open', what: 'quartermaster' }); break;
      case 'npc_quests': s.send({ t: 'open', what: 'quests' }); break;
      case 'stash': s.send({ t: 'open', what: 'stash' }); break;
      case 'herb': {
        if (this.herbCooldown(s, it.id)) return this.toast(s, 'This bloom is still regrowing.');
        s.char.dust += 2;
        this.progressQuest(s, 'gather', 'herb', 1);
        this.toast(s, 'Gathered Moonpetal Bloom (+2 Astral Dust)');
        this.mutate(s, { ok: true, value: undefined }, 'gather', { node: it.id });
        break;
      }
      case 'chest': {
        it.used = true;
        const gold = Math.round((20 + room.world.map.level * 8) * (room.world.modifierFlags.has('extra_gold') ? 2.5 : 1));
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
      case 'exit': this.returnToTown(s, room, true); break;
      default: break;
    }
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

  private enterDungeon(s: Session, room: Room, diffRaw: unknown) {
    if (room.kind !== 'town') return;
    const diff = (DIFFICULTY_ORDER as string[]).includes(String(diffRaw)) ? (diffRaw as DifficultyId) : 'normal';
    const ent = room.world.ents.get(s.entId);
    const portal = room.world.map.interactables.find((i) => i.type === 'portal_dungeon')!;
    if (!ent || dist(ent.x, ent.y, portal.x, portal.y) > 200) return s.send({ t: 'err', msg: 'Stand at the Rift Gate to enter' });
    const party = s.partyId ? this.parties.get(s.partyId) : null;
    if (party && party.leader !== s.id) return s.send({ t: 'err', msg: 'Only the party leader can open the Rift' });
    const members = (party ? party.members : [s.id]).map((id) => this.sessions.get(id)!).filter((m) => m && m.roomId === 'town');
    for (const m of members) if (!this.unlockedTiers(m).includes(diff)) return s.send({ t: 'err', msg: `${m.char.name} has not unlocked ${DIFFICULTIES[diff].name}` });
    const level = Math.max(...members.map((m) => m.char.level));
    const seed = Math.floor(this.rng.next() * 0xffffffff) >>> 0;
    const map = generateDungeon({ seed, level, difficulty: diff });
    const id = `dungeon_${seed.toString(36)}`;
    this.createRoom(id, map, diff, seed, members.length, party?.id ?? null);
    for (const m of members) {
      m.run = { kills: 0, gold: 0, items: 0, xp: 0, startGold: m.char.gold };
      this.moveTo(m, id);
      this.toast(m, `Entered the Rift (${DIFFICULTIES[diff].name}). Seed ${seed}.`);
    }
    this.persist.audit({ accountId: s.accountId, charId: s.char.id, action: 'dungeon_enter', data: { seed, diff, level, party: members.map((m) => m.char.id) } });
  }

  private returnToTown(s: Session, room: Room, cleared: boolean) {
    const ent = room.world.ents.get(s.entId);
    const blessings = ent?.p?.blessings ?? [];
    if (room.kind === 'dungeon') {
      if (cleared && room.world.bossDefeated) {
        s.char.stats.runsCleared++;
        const ti = DIFFICULTY_ORDER.indexOf(room.difficulty);
        s.char.stats.highestTier = Math.max(s.char.stats.highestTier, ti);
        if (ti >= 2) { this.progressQuest(s, 'clear_tier', 'hard', 1); this.achieve(s, 'tier_hard'); }
        if (ti >= 4) this.achieve(s, 'tier_nightmare');
      }
      const r = s.run;
      s.send({ t: 'run_end', cleared: cleared && room.world.bossDefeated, retained: { gold: r ? s.char.gold - r.startGold : 0, items: r?.items ?? 0, xp: r?.xp ?? 0, kills: r?.kills ?? 0 }, lost: blessings.map((b) => BLESSING_MAP[b]?.name ?? b), seed: room.seed, difficulty: room.difficulty });
      s.run = null;
    }
    this.moveTo(s, 'town');
  }

  // ─────────── Quests / achievements ───────────
  private questAccept(s: Session, id: string) {
    const q = QUEST_MAP[id];
    if (!q) return;
    if (s.char.quests[id]) return s.send({ t: 'err', msg: 'Already accepted' });
    if (q.requires && !s.char.quests[q.requires]?.claimed) return s.send({ t: 'err', msg: 'Complete the previous quest first' });
    s.char.quests[id] = { progress: 0, done: false, claimed: false };
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
    if (r.xp) this.giveXp(s, r.xp);
    this.mutate(s, { ok: true, value: undefined }, 'quest_reward', { quest: id, reward: r });
    this.toast(s, `Quest complete: ${q.name}`);
  }
  private progressQuest(s: Session, kind: string, target: string | undefined, n: number) {
    for (const q of QUESTS) {
      const st = s.char.quests[q.id];
      if (!st || st.done || q.objective.kind !== kind) continue;
      if (q.objective.target && q.objective.target !== target) continue;
      st.progress = Math.min(q.objective.count, st.progress + n);
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
    void this.persist.saveAccount(s.accountId, s.account);
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
      if (s.char.level >= 10 && before < 10) this.achieve(s, 'level10');
      if (s.char.level >= 25 && before < 25) this.achieve(s, 'level25');
      this.save(s);
    }
    if (r.masteryLevels > 0) {
      const title = C.masteryTitle(s.char.cls, s.char.mastery.level);
      this.toast(s, `${CLASSES[s.char.cls].name} Mastery ${s.char.mastery.level}${title ? ` — title "${title}"` : ''}`);
      if (title && !s.account.titles.includes(title)) { s.account.titles.push(title); void this.persist.saveAccount(s.accountId, s.account); }
    }
    s.dirty = true;
  }

  // ─────────── Stash (account storage, separated by mode) ───────────
  private stash(s: Session, room: Room, msg: any) {
    if (!this.nearNpc(s, room, 'stash')) return s.send({ t: 'err', msg: 'Visit the Astral Vault' });
    const box = s.char.hardcore ? s.account.stash.hardcore : s.account.stash.normal;
    if (msg.t === 'stash_put') {
      const i = clampInt(msg.inv, 0, 39);
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
    // Save both atomically-ish: account first (item now in vault), then character. Server uses one DB transaction.
    void this.persist.saveAccount(s.accountId, s.account);
    this.mutate(s, { ok: true, value: undefined }, msg.t, { idx: msg.idx ?? msg.inv });
    this.save(s);
  }

  // ─────────── Chat & social ───────────
  private chat(s: Session, room: Room, msg: any) {
    const text = String(msg.text ?? '').replace(/[\u0000-\u001f\u007f]/g, '').trim().slice(0, 200);
    if (!text) return;
    if (this.now - s.lastChat < 0.7) return s.send({ t: 'err', msg: 'You are sending messages too quickly' });
    s.lastChat = this.now;
    const out = { t: 'chat', from: s.char.name, ch: 'local', text };
    if (msg.ch === 'party') {
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

  private broadcast(room: Room, msg: unknown) {
    for (const id of room.sessions) this.sessions.get(id)?.send(msg);
  }

  // ─────────── Simulation loop ───────────
  tick(dt: number) {
    this.now += dt;
    this.tickN++;
    for (const s of this.sessions.values()) s.bucket = Math.min(90, s.bucket + dt * 45);
    for (const room of [...this.rooms.values()]) {
      if (room.sessions.size === 0 && room.kind !== 'dungeon' && room.kind !== 'field') continue;
      room.world.tick(dt);
      this.processEvents(room, room.world.events);
      room.world.events = [];
      if (room.kind === 'dungeon') {
        if (room.sessions.size === 0) { room.emptyT += dt; if (room.emptyT > 120) this.rooms.delete(room.id); }
      }
    }
    if (this.tickN % 2 === 0) {
      for (const s of this.sessions.values()) {
        const room = this.rooms.get(s.roomId);
        if (room) s.send({ t: 'snap', ...room.world.snapshotFor(s.entId) });
      }
    }
    // periodic saves
    for (const s of this.sessions.values()) { s.saveT -= dt; if (s.saveT <= 0) { s.saveT = 30; if (s.dirty) this.save(s); } }
    for (const [k, v] of this.reconnect) if (v.until < this.now) this.reconnect.delete(k);
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
            this.giveXp(s, ev.xp * penalty * Math.min(1, share));
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
            this.sendChar(s);
          }
          break;
        }
        case 'boss_killed':
          for (const pid of ev.players) {
            const s = this.sessionByEnt(room, pid);
            if (!s) continue;
            this.achieve(s, 'rift_walker');
            if (s.char.hardcore) this.achieve(s, 'hardcore_warden');
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
            } else {
              const loss = Math.floor(s.char.gold * 0.05);
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
