import { randomInt } from "node:crypto";
import { Room, ServerError, type AuthContext, type Client, type Deferred } from "@colyseus/core";
import { StateView } from "@colyseus/schema";
import { CLOSE_CODE_SESSION_TAKEN, type Account, type HostServices } from "@game/core";
import {
  AOI_RADIUS, AUTOSAVE_MS, CHAT_COOLDOWN_MS, CHAT_MAX_LENGTH, DEFAULT_MAP_ID, GroundItem, MAPS, MAX_PLAYERS_PER_MAP,
  Monster, Player, RECONNECT_SECONDS, TICK_MS, WorldState,
  type ChatBroadcast, type GameMap, type HitEvent, type InventoryMessage, type NoticeMessage,
} from "../shared";
import { ITEMS, MONSTERS, SPAWNS, validateContent } from "../shared/content";
import { cellDistance } from "../sim/combat";
import { WorldSim, type GroundItem as SimItem } from "../sim/world";
import { CharacterStore } from "./characters";

interface AuthResult {
  account: Account;
  characterId: number;
}

/** Everything the room tracks for one connected character. Server-only. */
interface Seat {
  client: Client;
  accountId: number;
  characterId: number;
  savePoint: { x: number; y: number };
  release: () => void;
  /** Pending reconnection while the client is dropped. */
  reconnection?: Deferred<Client>;
  /** Set once the seat has been saved and removed, so later hooks do nothing. */
  closed: boolean;
}

/** How often each client's area of interest is recomputed. */
const AOI_EVERY_TICKS = 5;
/** Server-wide tick timing, for /api/games/world/stats and load tests. */
export const tickStats = { ticks: 0, totalMs: 0, maxMs: 0, reset() { this.ticks = 0; this.totalMs = 0; this.maxMs = 0; } };

/**
 * One instance per map. The server is authoritative: clients send intents
 * (move, attack, pickup, revive, chat); `WorldSim` decides what happens and
 * the room mirrors it into the synced state. Characters are saved on leave,
 * on eviction and every AUTOSAVE_MS; picked-up items are saved immediately.
 *
 * Abstract because it needs host services; `createRooms` binds them.
 */
export abstract class WorldRoom extends Room<{ state: WorldState }> {
  maxClients = MAX_PLAYERS_PER_MAP;
  maxMessagesPerSecond = 30;

  protected abstract readonly services: HostServices;
  private store!: CharacterStore;
  private map!: GameMap;
  private sim!: WorldSim;
  private seats = new Map<string, Seat>();
  private lastChat = new Map<string, number>();
  private tickCount = 0;

  messages = {
    move: (client: Client, message: unknown) => {
      if (isCell(message)) this.sim.moveTo(client.sessionId, message);
    },
    attack: (client: Client, message: unknown) => {
      const id = idOf(message);
      if (id) this.sim.attack(client.sessionId, id);
    },
    pickup: (client: Client, message: unknown) => {
      const id = idOf(message);
      if (id) this.sim.pickup(client.sessionId, id);
    },
    revive: (client: Client) => {
      const seat = this.seats.get(client.sessionId);
      if (seat && this.sim.revive(client.sessionId, seat.savePoint)) this.mirrorPlayers();
    },
    chat: (client: Client, message: unknown) => this.handleChat(client, message),
  };

  onCreate(options: { mapId?: string } = {}) {
    validateContent();
    const map = MAPS[options.mapId ?? DEFAULT_MAP_ID];
    if (!map) throw new Error(`unknown map ${options.mapId}`);
    this.map = map;
    this.store = new CharacterStore(this.services.db);
    this.state = new WorldState();
    this.state.mapId = map.id;
    // Loot and hit rolls use the OS CSPRNG: players cannot predict them.
    const rng = () => randomInt(0, 2 ** 32) / 2 ** 32;
    this.sim = new WorldSim(map, SPAWNS[map.id] ?? [], MONSTERS, rng, Date.now());
    this.setPatchRate(TICK_MS);
    this.setTimestep((deltaMs) => this.tick(deltaMs), TICK_MS);
    this.clock.setInterval(() => void this.saveAll(), AUTOSAVE_MS);
  }

  async onAuth(_client: Client, options: { characterId?: unknown } | undefined, context: AuthContext): Promise<AuthResult> {
    const account = await this.services.authenticate(context.token);
    if (!account) throw new ServerError(401, "กรุณาเข้าสู่ระบบใหม่");
    const characterId = Number(options?.characterId);
    if (!Number.isInteger(characterId) || !(await this.store.load(account.id, characterId))) {
      throw new ServerError(404, "ไม่พบตัวละคร");
    }
    return { account, characterId };
  }

  async onJoin(client: Client) {
    const { account, characterId } = client.auth as AuthResult;
    // Kick any other live session of this account (it saves first), then load
    // the character fresh so we start from what that session just saved.
    const release = await this.services.sessions.claim(account.id, () => this.evict(client.sessionId));
    const character = await this.store.load(account.id, characterId);
    if (!character) {
      release();
      throw new ServerError(404, "ไม่พบตัวละคร");
    }
    const savePoint = this.map.isWalkable(character.saveX, character.saveY) ? { x: character.saveX, y: character.saveY } : this.map.spawn;
    const spawn = character.mapId === this.map.id && this.map.isWalkable(character.x, character.y)
      ? { x: character.x, y: character.y }
      : savePoint;
    // A character saved dead comes back at its save point.
    const dead = character.hp === 0;
    const sp = this.sim.addPlayer(client.sessionId, dead ? savePoint : spawn, dead ? undefined : character.hp ?? undefined);
    if (dead) sp.hp = Math.ceil(sp.maxHp / 2);

    const player = new Player();
    player.name = character.name;
    player.color = character.color;
    this.state.players.set(client.sessionId, player);
    this.seats.set(client.sessionId, { client, accountId: account.id, characterId, savePoint, release, closed: false });
    this.mirrorPlayers();

    client.view = new StateView();
    this.updateView(client);
    client.send("inventory", { items: await this.store.inventory(characterId) } satisfies InventoryMessage);
  }

  onDrop(client: Client) {
    const seat = this.seats.get(client.sessionId);
    if (!seat || seat.closed) return;
    this.sim.moveTo(client.sessionId, roundCell(this.sim.players.get(client.sessionId)?.walker ?? seat.savePoint));
    seat.reconnection = this.allowReconnection(client, RECONNECT_SECONDS);
  }

  onReconnect(client: Client) {
    const seat = this.seats.get(client.sessionId);
    if (seat) {
      seat.reconnection = undefined;
      seat.client = client;
    }
  }

  async onLeave(client: Client) {
    const seat = this.seats.get(client.sessionId);
    if (seat) await this.closeSeat(client.sessionId, seat);
    this.lastChat.delete(client.sessionId);
  }

  async onDispose() {
    await this.saveAll();
  }

  /** Another session of the same account took over: save, then disconnect this one. */
  private async evict(sessionId: string) {
    const seat = this.seats.get(sessionId);
    if (!seat || seat.closed) return;
    await this.closeSeat(sessionId, seat);
    if (seat.reconnection) seat.reconnection.reject(new Error("session taken over"));
    else seat.client.leave(CLOSE_CODE_SESSION_TAKEN, "บัญชีนี้ถูกเข้าใช้จากที่อื่น");
  }

  private async closeSeat(sessionId: string, seat: Seat) {
    if (seat.closed) return;
    seat.closed = true;
    try {
      await this.save(sessionId, seat);
    } finally {
      seat.release();
      this.seats.delete(sessionId);
      this.sim.removePlayer(sessionId);
      this.state.players.delete(sessionId);
    }
  }

  private async save(sessionId: string, seat: Seat) {
    const p = this.sim.players.get(sessionId);
    if (!p) return;
    const cell = this.restingCell(p.walker);
    await this.store.saveState(seat.characterId, { mapId: this.map.id, x: cell.x, y: cell.y, hp: p.hp });
  }

  private async saveAll() {
    const open = [...this.seats.entries()].filter(([, s]) => !s.closed);
    const results = await Promise.allSettled(open.map(([id, s]) => this.save(id, s)));
    for (const r of results) if (r.status === "rejected") console.error("autosave failed", r.reason);
  }

  /** The walkable cell a walker is standing in (or heading into, mid-step). */
  private restingCell(walker: { x: number; y: number; path: Array<{ x: number; y: number }> }) {
    const cell = roundCell(walker);
    if (this.map.isWalkable(cell.x, cell.y)) return cell;
    return walker.path[0] ?? this.map.spawn;
  }

  private handleChat(client: Client, message: unknown) {
    const player = this.state.players.get(client.sessionId);
    if (!player || typeof message !== "object" || message === null) return;
    const raw = (message as { text?: unknown }).text;
    if (typeof raw !== "string") return;
    const text = raw.replace(/\s+/g, " ").trim().slice(0, CHAT_MAX_LENGTH);
    if (!text) return;
    const now = Date.now();
    if (now - (this.lastChat.get(client.sessionId) ?? 0) < CHAT_COOLDOWN_MS) return;
    this.lastChat.set(client.sessionId, now);
    const line: ChatBroadcast = { sessionId: client.sessionId, name: player.name, text };
    this.broadcast("chat", line);
  }

  private tick(deltaMs: number) {
    const started = performance.now();
    const events = this.sim.tick(deltaMs, Date.now());

    this.mirrorPlayers();
    this.mirrorMonsters();
    this.mirrorItems();

    // Hits go only to players who can see where they happened.
    if (events.hits.length > 0) {
      for (const seat of this.seats.values()) {
        const me = this.sim.players.get(seat.client.sessionId);
        if (!me) continue;
        const near = events.hits.filter((h) => cellDistance(me.walker, h) <= AOI_RADIUS)
          .map(({ from, to, damage, miss }): HitEvent => ({ from, to, damage, miss }));
        if (near.length > 0) seat.client.send("hits", near);
      }
    }
    for (const { playerId, item } of events.pickups) void this.persistPickup(playerId, item);
    for (const { playerId, itemId } of events.refused) this.notice(playerId, `${ITEMS[itemId]?.name ?? itemId} เป็นของผู้เล่นอื่นอยู่ รออีกสักครู่`);
    for (const id of events.deaths) this.notice(id, "คุณหมดแรงแล้ว กดฟื้นเพื่อกลับไปที่จุดเซฟ");

    if (++this.tickCount % AOI_EVERY_TICKS === 0) {
      for (const seat of this.seats.values()) this.updateView(seat.client);
    }
    const ms = performance.now() - started;
    tickStats.ticks++;
    tickStats.totalMs += ms;
    tickStats.maxMs = Math.max(tickStats.maxMs, ms);
  }

  private async persistPickup(playerId: string, item: SimItem) {
    const seat = this.seats.get(playerId);
    if (!seat || seat.closed) {
      this.sim.restoreItem(item);
      return;
    }
    try {
      await this.store.addItem(seat.characterId, item.itemId, 1, "pickup");
      seat.client.send("inventory", { items: await this.store.inventory(seat.characterId) } satisfies InventoryMessage);
      this.notice(playerId, `ได้รับ ${ITEMS[item.itemId]?.name ?? item.itemId}`);
    } catch (err) {
      console.error("saving pickup failed", err);
      this.sim.restoreItem(item);
      this.notice(playerId, "เก็บของไม่สำเร็จ ลองใหม่อีกครั้ง");
    }
  }

  private notice(playerId: string, text: string) {
    this.seats.get(playerId)?.client.send("notice", { text } satisfies NoticeMessage);
  }

  private mirrorPlayers() {
    for (const [id, p] of this.sim.players) {
      const s = this.state.players.get(id);
      if (!s) continue;
      s.x = p.walker.x;
      s.y = p.walker.y;
      s.dir = p.dir;
      s.moving = p.walker.path.length > 0;
      s.hp = p.hp;
      s.maxHp = p.maxHp;
    }
  }

  private mirrorMonsters() {
    for (const [id, m] of this.sim.monsters.monsters) {
      let s = this.state.monsters.get(id);
      if (m.mode === "dead") {
        if (s) this.state.monsters.delete(id);
        continue;
      }
      if (!s) {
        s = new Monster();
        s.def = m.def.id;
        s.maxHp = m.def.hp;
        this.state.monsters.set(id, s);
      }
      s.x = m.walker.x;
      s.y = m.walker.y;
      s.dir = m.dir;
      s.moving = m.walker.path.length > 0;
      s.hp = m.hp;
    }
  }

  private mirrorItems() {
    for (const [id, item] of this.sim.items) {
      if (this.state.items.has(id)) continue;
      const s = new GroundItem();
      s.item = item.itemId;
      s.x = item.x;
      s.y = item.y;
      this.state.items.set(id, s);
    }
    for (const id of [...this.state.items.keys()]) if (!this.sim.items.has(id)) this.state.items.delete(id);
  }

  /** Add what is near this client to its view and drop what is far. */
  private updateView(client: Client) {
    const view = client.view;
    const me = this.sim.players.get(client.sessionId);
    if (!view || !me) return;
    const sync = (entity: object, pos: { x: number; y: number }) => {
      const near = cellDistance(me.walker, pos) <= AOI_RADIUS;
      const has = view.has(entity as never);
      if (near && !has) view.add(entity as never);
      else if (!near && has) view.remove(entity as never);
    };
    for (const m of this.state.monsters.values()) sync(m, m);
    for (const i of this.state.items.values()) sync(i, i);
  }
}

function roundCell(p: { x: number; y: number }) {
  return { x: Math.round(p.x), y: Math.round(p.y) };
}

function isCell(value: unknown): value is { x: number; y: number } {
  if (typeof value !== "object" || value === null) return false;
  const { x, y } = value as { x?: unknown; y?: unknown };
  return Number.isInteger(x) && Number.isInteger(y);
}

function idOf(value: unknown): string | null {
  const id = typeof value === "object" && value !== null ? (value as { id?: unknown }).id : undefined;
  return typeof id === "string" && id.length <= 16 ? id : null;
}
