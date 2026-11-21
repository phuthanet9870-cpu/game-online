/**
 * Monster AI state machine:
 *   idle -> patrol (wander) -> idle
 *   idle/patrol --(aggro or hit)--> chase --(in range)--> windup --(resolve)--> chase
 *   chase --(target lost or leash exceeded)--> return (invulnerable, heals) -> idle
 *   any --(hp<=0)--> dead --(respawn timer)--> idle
 */
import { TICK_DT, moveWithCollision } from '../shared/movement.ts';
import { angleBetween, dist, normalize } from '../shared/math.ts';
import { ANIM } from '../shared/protocol.ts';
import type { MonsterEntity, PlayerEntity } from './entities.ts';
import type { Zone } from './zone.ts';
import { attackEffects, resolveMonsterAttack } from './combat.ts';

function findTarget(z: Zone, m: MonsterEntity): PlayerEntity | null {
  let best: PlayerEntity | null = null, bestD = Infinity;
  for (const e of z.nearby(m.x, m.y, m.def.aggroRange + 1)) {
    if (e.kind !== 1 || e.dead || (e.gm && e.gmFlags.invis) || z.time < e.stealthUntil) continue;
    const d = dist(m.x, m.y, e.ms.x, e.ms.y);
    if (d <= m.def.aggroRange && d < bestD) { best = e; bestD = d; }
  }
  return best;
}

function stepToward(z: Zone, m: MonsterEntity, tx: number, ty: number, speedMult: number): boolean {
  const dx = tx - m.x, dy = ty - m.y;
  const d = Math.hypot(dx, dy);
  if (d < 0.05) return true;
  if (z.time < m.rootUntil) { m.facingX = dx / d; m.facingY = dy / d; return false; } // rooted: can turn and attack, not move
  const slow = z.time < m.slowUntil ? m.slowMult : 1;
  const step = Math.min(d, m.def.moveSpeed * speedMult * slow * TICK_DT);
  const n = normalize(dx, dy);
  m.facingX = n.x; m.facingY = n.y;
  const free = moveWithCollision(z.map, m, n.x * step, n.y * step, m.radius);
  if (!free) {
    // simple obstacle sidestep: try perpendicular directions
    const side = (m.id % 2 === 0 ? 1 : -1);
    moveWithCollision(z.map, m, -n.y * step * side, n.x * step * side, m.radius);
  }
  m.anim = ANIM.MOVE;
  return d <= step + 0.05;
}

function startReturn(m: MonsterEntity) {
  m.state = 'return';
  m.targetId = null;
  m.windup = null;
  m.threat.clear();
}

export function updateMonster(z: Zone, m: MonsterEntity) {
  const t = z.time;
  if (m.state === 'dead') {
    if (t >= m.respawnAt) z.respawnMonster(m);
    return;
  }
  if (t < m.forceUntil) {
    moveWithCollision(z.map, m, m.fvx * TICK_DT, m.fvy * TICK_DT, m.radius);
    m.anim = ANIM.HURT;
    return;
  }
  if (t < m.stunUntil) { m.anim = ANIM.HURT; return; }
  if (t >= m.animUntil) m.anim = ANIM.IDLE;

  const target = m.targetId !== null ? z.players.get(m.targetId) : undefined;

  switch (m.state) {
    case 'idle': {
      if (!m.def.behavior.passive) {
        const tgt = findTarget(z, m);
        if (tgt) { m.state = 'chase'; m.targetId = tgt.id; break; }
      }
      if (t >= m.stateUntil && m.def.behavior.wander) {
        const p = z.randomPointNear(m.homeX, m.homeY, Math.min(4, m.group.radius), m.radius);
        m.wanderX = p.x; m.wanderY = p.y;
        m.state = 'patrol';
      }
      break;
    }
    case 'patrol': {
      if (!m.def.behavior.passive) {
        const tgt = findTarget(z, m);
        if (tgt) { m.state = 'chase'; m.targetId = tgt.id; break; }
      }
      if (stepToward(z, m, m.wanderX, m.wanderY, 0.45)) { m.state = 'idle'; m.stateUntil = t + 2 + z.rng() * 4; }
      break;
    }
    case 'chase': {
      if (target && z.time < target.stealthUntil) { m.threat.delete(target.id); m.targetId = null; }
      if (!target || target.dead || z.time < target.stealthUntil || dist(m.x, m.y, m.homeX, m.homeY) > m.def.leashRange) {
        // switch to next threat holder if any
        let next: PlayerEntity | null = null, best = 0;
        for (const [pid, dmg] of m.threat) {
          const p = z.players.get(pid);
          if (p && !p.dead && dmg > best && dist(m.x, m.y, p.ms.x, p.ms.y) < m.def.leashRange) { next = p; best = dmg; }
        }
        if (next && dist(m.x, m.y, m.homeX, m.homeY) <= m.def.leashRange) { m.targetId = next.id; break; }
        startReturn(m);
        break;
      }
      const tx = target.ms.x, ty = target.ms.y;
      const d = dist(m.x, m.y, tx, ty);
      // choose the first ready attack in range (special attacks listed last get priority when ready)
      let chosen = -1;
      for (let i = m.def.attacks.length - 1; i >= 0; i--) {
        const a = m.def.attacks[i];
        if (t >= m.attackReady[i] && d <= a.range + target.radius) { chosen = i; break; }
      }
      if (chosen >= 0) {
        const a = m.def.attacks[chosen];
        const aim = normalize(tx - m.x, ty - m.y);
        m.facingX = aim.x || m.facingX; m.facingY = aim.y || m.facingY;
        m.windup = { idx: chosen, until: t + a.windup, aimX: m.facingX, aimY: m.facingY, tx, ty };
        m.state = 'windup';
        m.anim = ANIM.WINDUP;
        m.animUntil = t + a.windup;
        if (a.kind === 'aoe') z.emit({ e: 'tele', s: m.id, shape: 'circle', x: tx, y: ty, r: a.radius, ang: 0, arc: 0, dur: a.windup }, tx, ty);
        else if (a.kind === 'melee') z.emit({ e: 'tele', s: m.id, shape: 'arc', x: m.x, y: m.y, r: a.range + 0.3, ang: Math.atan2(m.facingY, m.facingX), arc: (a.arcDeg * Math.PI) / 180, dur: a.windup }, m.x, m.y);
        break;
      }
      const keep = m.def.behavior.keepDistance;
      if (keep) {
        if (d < keep - 1) {
          const away = normalize(m.x - tx, m.y - ty);
          stepToward(z, m, m.x + away.x, m.y + away.y, 0.8);
        } else if (d > keep + 0.5) stepToward(z, m, tx, ty, 1);
      } else if (d > m.def.attacks[0].range * 0.8 + target.radius) {
        stepToward(z, m, tx, ty, 1);
      }
      break;
    }
    case 'windup': {
      const w = m.windup;
      if (!w) { m.state = 'chase'; break; }
      if (t < w.until) break;
      const a = m.def.attacks[w.idx];
      m.attackReady[w.idx] = t + a.cooldown;
      // shared global cooldown so specials don't chain instantly into basics
      for (let i = 0; i < m.attackReady.length; i++) m.attackReady[i] = Math.max(m.attackReady[i], t + 0.4);
      m.windup = null;
      m.state = 'chase';
      m.anim = ANIM.ATTACK;
      m.animUntil = t + 0.25;
      z.emit({ e: 'act', s: m.id, a: `${m.def.family}_${a.kind}`, x: w.aimX, y: w.aimY }, m.x, m.y);
      const effects = attackEffects(a);
      if (a.kind === 'melee') {
        const hits: PlayerEntity[] = [];
        for (const e of z.nearby(m.x, m.y, a.range + 2)) {
          if (e.kind !== 1 || e.dead) continue;
          const d = dist(m.x, m.y, e.ms.x, e.ms.y);
          if (d > a.range + e.radius + m.radius * 0.5) continue;
          if (d > 0.3 && angleBetween(w.aimX, w.aimY, e.ms.x - m.x, e.ms.y - m.y) > (a.arcDeg * Math.PI) / 360 + 0.2) continue;
          hits.push(e);
        }
        resolveMonsterAttack(z, m, hits, a.mult, effects);
      } else if (a.kind === 'aoe') {
        const hits: PlayerEntity[] = [];
        for (const e of z.nearby(w.tx, w.ty, a.radius + 2)) {
          if (e.kind === 1 && !e.dead && dist(w.tx, w.ty, e.ms.x, e.ms.y) <= a.radius + e.radius) hits.push(e);
        }
        resolveMonsterAttack(z, m, hits, a.mult, effects);
      } else {
        const aim = normalize(w.tx - m.x, w.ty - m.y);
        const id = z.host.nextId();
        z.projectiles.push({
          id, ownerId: m.id, ownerKind: 2, x: m.x + aim.x * 0.4, y: m.y + aim.y * 0.4, vx: aim.x * a.speed, vy: aim.y * a.speed,
          radius: a.radius, remaining: a.range + 1, pierce: false, hit: new Set(), hits: 'players', skill: null,
          damageMult: a.mult, element: m.def.element, effects: [], monsterAtkMult: a.mult,
        });
        z.emit({ e: 'proj', id, s: m.id, x: m.x, y: m.y, vx: aim.x * a.speed, vy: aim.y * a.speed, r: a.radius, life: (a.range + 1) / a.speed, fx: `${m.def.family}_bolt` }, m.x, m.y);
      }
      break;
    }
    case 'return': {
      m.anim = ANIM.RETURN;
      if (stepToward(z, m, m.homeX, m.homeY, 1.6)) {
        m.state = 'idle';
        m.hp = m.maxHp;
        m.stateUntil = t + 2;
      }
      break;
    }
  }
}
