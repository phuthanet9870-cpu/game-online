/**
 * Shared, deterministic movement simulation. The server runs this to apply
 * player input; the client runs the exact same code for prediction and
 * replays unacknowledged inputs during reconciliation.
 */
import { isBlocked, speedMultAt, type TileMap } from './mapgen.ts';
import { normalize } from './math.ts';

export const TICK_RATE = 20;
export const TICK_DT = 1 / TICK_RATE;

export interface MoveState {
  x: number; y: number;
  /** Dodge roll in progress. */
  dodgeT: number; dvx: number; dvy: number;
  /** Server-applied forced movement (dash, knockback). */
  forceT: number; fvx: number; fvy: number;
  /** Root/stun: no voluntary movement or dodge. */
  rootT: number;
  /** Action animation: movement multiplier while > 0. */
  animT: number; animMoveMult: number;
  stamina: number; staminaDelay: number; dodgeCd: number;
  slowT: number; slowMult: number;
}

export interface MoveInput { mx: number; my: number; dodge: boolean; block: boolean }

export interface MoveParams {
  speed: number;
  maxStamina: number;
  staminaRegen: number;
  staminaDelayAfterUse: number;
  radius: number;
  dodge: { distance: number; duration: number; staminaCost: number; cooldown: number };
  block: { moveMult: number; staminaPerSec: number };
}

export function newMoveState(x: number, y: number, stamina: number): MoveState {
  return { x, y, dodgeT: 0, dvx: 0, dvy: 0, forceT: 0, fvx: 0, fvy: 0, rootT: 0, animT: 0, animMoveMult: 1, stamina, staminaDelay: 0, dodgeCd: 0, slowT: 0, slowMult: 1 };
}

function collides(map: TileMap, x: number, y: number, r: number): boolean {
  return isBlocked(map, x - r, y - r) || isBlocked(map, x + r, y - r) || isBlocked(map, x - r, y + r) || isBlocked(map, x + r, y + r);
}

/** Move with axis-separated collision; returns true if fully unobstructed. */
export function moveWithCollision(map: TileMap, s: { x: number; y: number }, dx: number, dy: number, r: number): boolean {
  let free = true;
  // sub-step long moves so we never tunnel through a tile
  const steps = Math.max(1, Math.ceil(Math.max(Math.abs(dx), Math.abs(dy)) / 0.25));
  const sx = dx / steps, sy = dy / steps;
  for (let i = 0; i < steps; i++) {
    if (sx !== 0) {
      if (!collides(map, s.x + sx, s.y, r)) s.x += sx; else free = false;
    }
    if (sy !== 0) {
      if (!collides(map, s.x, s.y + sy, r)) s.y += sy; else free = false;
    }
  }
  return free;
}

export interface StepResult { startedDodge: boolean; blocking: boolean }

/** Advance one fixed tick. Mutates s. */
export function stepMove(s: MoveState, input: MoveInput, p: MoveParams, map: TileMap, dt = TICK_DT): StepResult {
  const res: StepResult = { startedDodge: false, blocking: false };
  s.dodgeCd = Math.max(0, s.dodgeCd - dt);
  s.rootT = Math.max(0, s.rootT - dt);
  s.animT = Math.max(0, s.animT - dt);
  s.slowT = Math.max(0, s.slowT - dt);
  if (s.slowT <= 0) s.slowMult = 1;

  // stamina regen
  if (s.staminaDelay > 0) s.staminaDelay = Math.max(0, s.staminaDelay - dt);
  else s.stamina = Math.min(p.maxStamina, s.stamina + p.staminaRegen * dt);

  if (s.forceT > 0) {
    const t = Math.min(dt, s.forceT);
    moveWithCollision(map, s, s.fvx * t, s.fvy * t, p.radius);
    s.forceT -= t;
    return res;
  }
  if (s.dodgeT > 0) {
    const t = Math.min(dt, s.dodgeT);
    moveWithCollision(map, s, s.dvx * t, s.dvy * t, p.radius);
    s.dodgeT -= t;
    return res;
  }
  if (s.rootT > 0) return res;

  const dir = normalize(input.mx, input.my);
  if (input.dodge && s.dodgeCd <= 0 && s.stamina >= p.dodge.staminaCost) {
    // dodge in movement direction, or backwards-neutral if standing still is not allowed: require a direction
    if (dir.x !== 0 || dir.y !== 0) {
      s.stamina -= p.dodge.staminaCost;
      s.staminaDelay = p.staminaDelayAfterUse;
      s.dodgeCd = p.dodge.cooldown + p.dodge.duration;
      s.dodgeT = p.dodge.duration;
      const v = p.dodge.distance / p.dodge.duration;
      s.dvx = dir.x * v; s.dvy = dir.y * v;
      s.animT = 0;
      res.startedDodge = true;
      const t = Math.min(dt, s.dodgeT);
      moveWithCollision(map, s, s.dvx * t, s.dvy * t, p.radius);
      s.dodgeT -= t;
      return res;
    }
  }

  let speed = p.speed * speedMultAt(map, s.x, s.y) * s.slowMult;
  if (s.animT > 0) speed *= s.animMoveMult;
  if (input.block && s.stamina > 0) {
    res.blocking = true;
    speed *= p.block.moveMult;
    if (p.block.staminaPerSec > 0) {
      s.stamina = Math.max(0, s.stamina - p.block.staminaPerSec * dt);
      s.staminaDelay = p.staminaDelayAfterUse;
    }
  }
  if (dir.x !== 0 || dir.y !== 0) moveWithCollision(map, s, dir.x * speed * dt, dir.y * speed * dt, p.radius);
  return res;
}

/** Movement parameters derived from stats + weapon. Shared so prediction matches the server exactly. */
export function moveParamsFor(
  stats: { moveSpeed: number; stamina: number },
  weapon: { dodge: MoveParams['dodge']; defensive: { moveMult: number; staminaPerSec: number } } | null,
  cfg: { staminaPerSec: number; staminaDelayAfterUse: number },
  radius = 0.3,
): MoveParams {
  return {
    speed: stats.moveSpeed,
    maxStamina: stats.stamina,
    staminaRegen: cfg.staminaPerSec,
    staminaDelayAfterUse: cfg.staminaDelayAfterUse,
    radius,
    dodge: weapon ? weapon.dodge : { distance: 2.5, duration: 0.25, staminaCost: 30, cooldown: 0.5 },
    block: weapon ? { moveMult: weapon.defensive.moveMult, staminaPerSec: weapon.defensive.staminaPerSec } : { moveMult: 0.5, staminaPerSec: 12 },
  };
}
