/** Server / network tuning. Values here are operational, not balance. */
export const SERVER_CONFIG = {
  /** Radius (tiles) of the interest-management area per player. */
  interestRadius: 22,
  spatialCellSize: 8,
  /** Max lag compensation rewind (ticks at 20 Hz -> 300 ms). */
  maxRewindTicks: 6,
  historyTicks: 10,
  /** Input commands accepted per tick are limited by a budget that refills 1/tick. */
  inputBudgetMax: 3,
  inputQueueMax: 12,
  /** After this many ticks without input the server steps an empty input (keeps knockback/regen moving). */
  idleStepAfterTicks: 6,
  disconnectGraceSec: 15,
  autosaveSec: 30,
  sessionTokenTtlSec: 60 * 60 * 12,
  maxCharactersPerAccount: 4,
  dropOwnerSec: 30,
  dropDespawnSec: 120,
  pickupRange: 2.4,
  autoLootRange: 1.2,
  npcRange: 4.5,
  gatherRange: 2.4,
  spawnMaintainEverySec: 1,
  respawnHpFraction: 0.5,
  /** Message rate limits (per session). */
  rate: { msgPerSec: 60, msgBurst: 120, chatPerSec: 0.8, chatBurst: 3, authPerMin: 10 },
  /** Kick after this many protocol violations within a session. */
  maxViolations: 40,
};
