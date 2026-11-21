/**
 * Point-and-click control. Turns orders (move here / attack that / talk to that)
 * into the same per-tick inputs the keyboard produces, so the server validates
 * click movement and attacks exactly like any other input.
 */
import { BTN } from '../shared/protocol.ts';
import { SERVER_CONFIG } from '../shared/config/server.ts';
import { findPath, lineClear } from '../shared/pathfind.ts';
import { attackBand } from '../shared/combat.ts';
import type { GameClient } from './game.ts';

export type Order =
  | { kind: 'move'; x: number; y: number }
  | { kind: 'attack'; id: number }
  | { kind: 'interact'; id: number };

export interface ClickOutput { mx: number; my: number; aimX: number | null; aimY: number | null; buttons: number; interact: number | null }

export class ClickController {
  order: Order | null = null;
  private path: { x: number; y: number }[] = [];
  private pathGoal = { x: NaN, y: NaN };
  private repathAt = 0;
  private stuck = { x: 0, y: 0, t: 0 };
  private queued = 0;
  private queuedUntil = 0;

  constructor(private g: GameClient) {}

  cancel() { this.order = null; this.path = []; this.g.targetId = null; }

  moveTo(x: number, y: number, marker = true) {
    this.order = { kind: 'move', x, y };
    this.g.targetId = null;
    this.planPath(x, y, true);
    if (marker) this.g.moveMarker = { x, y, t: performance.now() };
  }

  attack(id: number) { this.order = { kind: 'attack', id }; this.g.targetId = id; this.path = []; this.repathAt = 0; }
  interact(id: number) { this.order = { kind: 'interact', id }; this.g.targetId = null; this.path = []; this.repathAt = 0; }

  /** Press buttons (skills from the skill bar) for a short window so the next input ticks carry them. */
  press(bits: number, ms = 220) { this.queued |= bits; this.queuedUntil = performance.now() + ms; }

  private planPath(x: number, y: number, force = false) {
    const g = this.g;
    if (!g.map) return;
    const now = performance.now();
    if (!force && now < this.repathAt && Math.hypot(x - this.pathGoal.x, y - this.pathGoal.y) < 1) return;
    this.repathAt = now + 400;
    this.pathGoal = { x, y };
    this.path = findPath(g.map, g.ms.x, g.ms.y, x, y) ?? [];
  }


  private follow(): { mx: number; my: number } {
    const g = this.g;
    while (this.path.length && Math.hypot(this.path[0].x - g.ms.x, this.path[0].y - g.ms.y) < 0.18) this.path.shift();
    if (!this.path.length) return { mx: 0, my: 0 };
    const p = this.path[0];
    const dx = p.x - g.ms.x, dy = p.y - g.ms.y, d = Math.hypot(dx, dy);
    // stuck detection -> re-plan
    const now = performance.now();
    if (Math.hypot(g.ms.x - this.stuck.x, g.ms.y - this.stuck.y) > 0.3) this.stuck = { x: g.ms.x, y: g.ms.y, t: now };
    else if (now - this.stuck.t > 900) { this.stuck.t = now; this.repathAt = 0; }
    return { mx: dx / d, my: dy / d };
  }

  tick(): ClickOutput {
    const g = this.g;
    const now = performance.now();
    const out: ClickOutput = { mx: 0, my: 0, aimX: null, aimY: null, buttons: 0, interact: null };
    if (now < this.queuedUntil) out.buttons |= this.queued; else this.queued = 0;
    const o = this.order;
    if (!o || !g.map || g.self?.dead) return out;

    if (o.kind === 'move') {
      if (!this.path.length) { this.order = null; return out; }
      Object.assign(out, this.follow());
      return out;
    }

    const e = g.ents.get(o.id);
    if (!e || (o.kind === 'attack' && (e.dead || e.hp <= 0 || !e.snaps.length))) { this.cancel(); return out; }
    const d = Math.hypot(e.x - g.ms.x, e.y - g.ms.y);

    if (o.kind === 'attack') {
      out.aimX = e.x - g.ms.x; out.aimY = e.y - g.ms.y;
      const [minR, maxR] = this.g.weapon ? attackBand(this.g.weapon.normal.shape) : [0, 1.2];
      const clear = lineClear(g.map, g.ms.x, g.ms.y, e.x, e.y, 0.1);
      if (d < minR) { this.path = []; out.mx = -(e.x - g.ms.x) / (d || 1); out.my = -(e.y - g.ms.y) / (d || 1); }
      else if (d <= maxR && clear) {
        out.buttons |= BTN.ATTACK;
        this.path = [];
      } else {
        this.planPath(e.x, e.y);
        Object.assign(out, this.follow());
      }
      return out;
    }

    // interact: walk into range, then act once
    const range = e.meta.k === 4 ? SERVER_CONFIG.npcRange - 0.6 : e.meta.k === 3 ? SERVER_CONFIG.pickupRange - 0.5 : SERVER_CONFIG.gatherRange - 0.5;
    if (d <= range) {
      out.interact = o.id;
      this.order = null;
      this.path = [];
      return out;
    }
    this.planPath(e.x, e.y);
    Object.assign(out, this.follow());
    return out;
  }
}
