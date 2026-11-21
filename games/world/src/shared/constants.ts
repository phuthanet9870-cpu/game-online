/** Room name the world game registers on the server. */
export const WORLD_ROOM = "world";

/** Server simulation rate. */
export const TICK_MS = 50;
/** Walking speed in cells per second (RO's default walk is ~150 ms per cell). */
export const WALK_SPEED = 6.5;
/** Longest path a single click may request, in cells. */
export const MAX_PATH_LENGTH = 60;

export const NAME_MAX_LENGTH = 16;
export const CHAT_MAX_LENGTH = 120;
export const CHAT_COOLDOWN_MS = 400;
export const MAX_PLAYERS_PER_MAP = 100;

/** Number of body colours a character can pick, until real sprites exist. */
export const PLAYER_COLORS = 8;
/** Seconds a dropped player stays in the world waiting to reconnect. */
export const RECONNECT_SECONDS = 20;
/** How often the room saves every player's position. */
export const AUTOSAVE_MS = 60_000;

/** Player combat stats until MVP 3 adds levels and stats. */
export const PLAYER_BASE = {
  maxHp: 120,
  atk: [12, 18] as const,
  def: 3,
  hit: 10,
  flee: 5,
  attackDelayMs: 800,
  attackRange: 1,
};
/** HP regained every REGEN_INTERVAL_MS, as a fraction of max HP, when not hit recently. */
export const REGEN_FRACTION = 0.03;
export const REGEN_INTERVAL_MS = 4000;
export const REGEN_COMBAT_COOLDOWN_MS = 5000;
/** Only the top damage dealer may pick up a drop during this window. */
export const ITEM_OWNER_MS = 3000;
export const ITEM_EXPIRE_MS = 60_000;
/** Monsters and ground items are sent to a player only within this many cells. */
export const AOI_RADIUS = 18;
