import { Room, type Client } from "@colyseus/core";
import {
  CHAT_COOLDOWN_MS, CHAT_MAX_LENGTH, DEFAULT_MAP_ID, MAPS, MAX_PATH_LENGTH, MAX_PLAYERS_PER_MAP,
  NAME_MAX_LENGTH, Player, TICK_MS, WALK_SPEED, WorldState, findPath,
  type ChatBroadcast, type GameMap, type JoinOptions,
} from "../shared";
import { advance, type Walker } from "./movement";

const PLAYER_COLORS = 8;

/**
 * One instance per map. The server is authoritative: clients only say where
 * they want to go; the room pathfinds and moves them.
 */
export class WorldRoom extends Room<{ state: WorldState }> {
  maxClients = MAX_PLAYERS_PER_MAP;
  maxMessagesPerSecond = 30;

  private map!: GameMap;
  private walkers = new Map<string, Walker>();
  private lastChat = new Map<string, number>();

  messages = {
    move: (client: Client, message: unknown) => this.handleMove(client, message),
    chat: (client: Client, message: unknown) => this.handleChat(client, message),
  };

  onCreate(options: { mapId?: string } = {}) {
    const map = MAPS[options.mapId ?? DEFAULT_MAP_ID];
    if (!map) throw new Error(`unknown map ${options.mapId}`);
    this.map = map;
    this.state = new WorldState();
    this.state.mapId = map.id;
    this.setPatchRate(TICK_MS);
    this.setTimestep((deltaMs) => this.tick(deltaMs), TICK_MS);
  }

  onJoin(client: Client, options: JoinOptions = {}) {
    const spawn = this.findSpawnCell();
    const player = new Player();
    player.name = sanitizeName(options.name);
    player.x = spawn.x;
    player.y = spawn.y;
    player.dir = 0;
    player.moving = false;
    player.color = Math.floor(Math.random() * PLAYER_COLORS);
    this.state.players.set(client.sessionId, player);
    this.walkers.set(client.sessionId, { x: spawn.x, y: spawn.y, path: [] });
  }

  onLeave(client: Client) {
    this.state.players.delete(client.sessionId);
    this.walkers.delete(client.sessionId);
    this.lastChat.delete(client.sessionId);
  }

  private handleMove(client: Client, message: unknown) {
    const walker = this.walkers.get(client.sessionId);
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
    for (const [sessionId, walker] of this.walkers) {
      const player = this.state.players.get(sessionId);
      if (!player) continue;
      const dir = advance(walker, distance);
      if (dir !== null) player.dir = dir;
      player.x = walker.x;
      player.y = walker.y;
      player.moving = walker.path.length > 0;
    }
  }

  /** The map spawn, or the nearest walkable cell to it within a few rings. */
  private findSpawnCell() {
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

export function sanitizeName(name: unknown): string {
  const clean = typeof name === "string" ? name.replace(/[\u0000-\u001f\u007f]/g, "").trim().slice(0, NAME_MAX_LENGTH) : "";
  return clean || "Novice";
}
