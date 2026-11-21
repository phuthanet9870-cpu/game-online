import { Room, ServerError, type AuthContext, type Client, type Deferred } from "@colyseus/core";
import { CLOSE_CODE_SESSION_TAKEN, type Account, type HostServices } from "@game/core";
import {
  AUTOSAVE_MS, CHAT_COOLDOWN_MS, CHAT_MAX_LENGTH, DEFAULT_MAP_ID, MAPS, MAX_PATH_LENGTH, MAX_PLAYERS_PER_MAP,
  Player, RECONNECT_SECONDS, TICK_MS, WALK_SPEED, WorldState, findPath,
  type ChatBroadcast, type GameMap,
} from "../shared";
import { CharacterStore } from "./characters";
import { advance, type Walker } from "./movement";

interface AuthResult {
  account: Account;
  characterId: number;
}

/** Everything the room tracks for one connected character. Server-only. */
interface Seat {
  client: Client;
  accountId: number;
  characterId: number;
  walker: Walker;
  release: () => void;
  /** Pending reconnection while the client is dropped. */
  reconnection?: Deferred<Client>;
  /** Set once the seat has been saved and removed, so later hooks do nothing. */
  closed: boolean;
}

/**
 * One instance per map. The server is authoritative: clients only say where
 * they want to go; the room pathfinds and moves them, and saves characters to
 * the database on leave, on eviction and every AUTOSAVE_MS.
 *
 * Abstract because it needs host services; `createWorldRooms` binds them.
 */
export abstract class WorldRoom extends Room<{ state: WorldState }> {
  maxClients = MAX_PLAYERS_PER_MAP;
  maxMessagesPerSecond = 30;

  protected abstract readonly services: HostServices;
  private store!: CharacterStore;
  private map!: GameMap;
  private seats = new Map<string, Seat>();
  private lastChat = new Map<string, number>();

  messages = {
    move: (client: Client, message: unknown) => this.handleMove(client, message),
    chat: (client: Client, message: unknown) => this.handleChat(client, message),
  };

  onCreate(options: { mapId?: string } = {}) {
    const map = MAPS[options.mapId ?? DEFAULT_MAP_ID];
    if (!map) throw new Error(`unknown map ${options.mapId}`);
    this.map = map;
    this.store = new CharacterStore(this.services.db);
    this.state = new WorldState();
    this.state.mapId = map.id;
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

    const spawn = character.mapId === this.map.id && this.map.isWalkable(character.x, character.y)
      ? { x: character.x, y: character.y }
      : this.nearSpawn();
    const player = new Player();
    player.name = character.name;
    player.color = character.color;
    player.x = spawn.x;
    player.y = spawn.y;
    player.dir = 0;
    player.moving = false;
    this.state.players.set(client.sessionId, player);
    this.seats.set(client.sessionId, {
      client, accountId: account.id, characterId, release, closed: false,
      walker: { x: spawn.x, y: spawn.y, path: [] },
    });
  }

  onDrop(client: Client) {
    const seat = this.seats.get(client.sessionId);
    if (!seat || seat.closed) return;
    seat.walker.path = [];
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
      await this.save(seat);
    } finally {
      seat.release();
      this.seats.delete(sessionId);
      this.state.players.delete(sessionId);
    }
  }

  private async save(seat: Seat) {
    const cell = this.restingCell(seat.walker);
    await this.store.savePosition(seat.characterId, this.map.id, cell.x, cell.y);
  }

  private async saveAll() {
    const open = [...this.seats.values()].filter((s) => !s.closed);
    const results = await Promise.allSettled(open.map((s) => this.save(s)));
    for (const r of results) if (r.status === "rejected") console.error("autosave failed", r.reason);
  }

  /** The walkable cell a walker is standing in (or heading into, mid-step). */
  private restingCell(walker: Walker) {
    const x = Math.round(walker.x);
    const y = Math.round(walker.y);
    if (this.map.isWalkable(x, y)) return { x, y };
    return walker.path[0] ?? this.map.spawn;
  }

  private handleMove(client: Client, message: unknown) {
    const walker = this.seats.get(client.sessionId)?.walker;
    if (!walker || !isCell(message) || !this.map.isWalkable(message.x, message.y)) return;
    // Path from the cell the player is currently in; the first waypoint pulls
    // them to its centre, so a mid-step re-route stays on the grid.
    const from = { x: Math.round(walker.x), y: Math.round(walker.y) };
    const path = findPath(this.map, from, message, MAX_PATH_LENGTH);
    if (!path) return;
    walker.path = from.x === walker.x && from.y === walker.y ? path : [from, ...path];
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
    const distance = (WALK_SPEED * deltaMs) / 1000;
    for (const [sessionId, seat] of this.seats) {
      const player = this.state.players.get(sessionId);
      if (!player) continue;
      const dir = advance(seat.walker, distance);
      if (dir !== null) player.dir = dir;
      player.x = seat.walker.x;
      player.y = seat.walker.y;
      player.moving = seat.walker.path.length > 0;
    }
  }

  /** A walkable cell within two cells of the map spawn. */
  private nearSpawn() {
    const { x: sx, y: sy } = this.map.spawn;
    const candidates: Array<{ x: number; y: number }> = [];
    for (let dy = -2; dy <= 2; dy++) {
      for (let dx = -2; dx <= 2; dx++) {
        if (this.map.isWalkable(sx + dx, sy + dy)) candidates.push({ x: sx + dx, y: sy + dy });
      }
    }
    return candidates[Math.floor(Math.random() * candidates.length)] ?? this.map.spawn;
  }
}

function isCell(value: unknown): value is { x: number; y: number } {
  if (typeof value !== "object" || value === null) return false;
  const { x, y } = value as { x?: unknown; y?: unknown };
  return Number.isInteger(x) && Number.isInteger(y);
}
