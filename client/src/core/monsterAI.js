// Monster AI: IDLE → PATROL → ALERT → CHASE → ATTACK → RESET → DEAD → RESPAWN (Master Prompt §11)
import { angleTo, dist } from './math.js';
import { shapeHits } from './hitbox.js';

export const AI = Object.freeze({ IDLE: 'IDLE', PATROL: 'PATROL', ALERT: 'ALERT', CHASE: 'CHASE', ATTACK: 'ATTACK', RESET: 'RESET', DEAD: 'DEAD', RESPAWN: 'RESPAWN' });
const RESPAWN_FADE = 0.6;
const LOS_LOST_RESET = 4;

export function setAI(m, state) {
  if (m.ai.state === state) return;
  m.ai.prev = m.ai.state; m.ai.state = state; m.ai.t = 0;
}

function canSee(sim, m, p) {
  if (!p || !p.life.alive || p.statuses.has('SPAWN_PROTECTION')) return false;
  if (dist(m.x, m.y, p.x, p.y) > m.def.aggroRadius) return false;
  return sim.map.hasLineOfSight(m.x, m.y, p.x, p.y);
}

/** Steer toward a point; if blocked, try sliding at ±50° / ±90°. Returns distance moved. */
function steer(sim, m, tx, ty, speed, dt) {
  const base = angleTo(m.x, m.y, tx, ty);
  const step = Math.min(speed * dt, dist(m.x, m.y, tx, ty));
  for (const off of [0, 0.87, -0.87, 1.57, -1.57]) {
    const a = base + off;
    const r = sim.map.moveAndSlide(m.x, m.y, Math.cos(a) * step, Math.sin(a) * step, m.collisionRadius);
    const moved = dist(m.x, m.y, r.x, r.y);
    if (moved > step * 0.35 || off === -1.57) {
      if (moved > 0.01) { m.facing = Math.atan2(r.y - m.y, r.x - m.x); m.moving = true; }
      m.x = r.x; m.y = r.y;
      return moved;
    }
  }
  return 0;
}

export function onMonsterDamaged(sim, m, attacker) {
  if (m.ai.state === AI.IDLE || m.ai.state === AI.PATROL || m.ai.state === AI.ALERT) {
    m.ai.targetId = attacker.id; setAI(m, AI.CHASE);
  }
  m.ai.lastSeen = sim.time;
}

export function updateMonster(sim, m, dt) {
  const ai = m.ai, def = m.def, p = sim.player;
  ai.t += dt;
  ai.attackCd = Math.max(0, ai.attackCd - dt);
  m.moving = false;

  if (ai.state === AI.DEAD) {
    if (ai.t >= def.respawnTime) sim.respawnMonster(m);
    return;
  }
  if (ai.state === AI.RESPAWN) { if (ai.t >= RESPAWN_FADE) setAI(m, AI.IDLE); return; }
  if (m.statuses.stunned) {
    if (ai.state === AI.ATTACK) { ai.attack = null; setAI(m, AI.CHASE); sim.emit({ type: 'interrupt', targetId: m.id, x: m.x, y: m.y }); }
    return;
  }

  const target = ai.targetId ? sim.entities.get(ai.targetId) : null;
  const anchorDist = dist(m.x, m.y, m.anchor.x, m.anchor.y);

  switch (ai.state) {
    case AI.IDLE:
      if (canSee(sim, m, p)) { ai.targetId = p.id; setAI(m, AI.ALERT); break; }
      if (ai.t >= ai.idleFor) {
        for (let i = 0; i < 8; i++) {
          const a = sim.rng.range(0, Math.PI * 2), r = sim.rng.range(10, def.patrolRadius);
          const tx = m.anchor.x + Math.cos(a) * r, ty = m.anchor.y + Math.sin(a) * r;
          if (!sim.map.overlapsSolid(tx, ty, m.collisionRadius)) { ai.patrol = { x: tx, y: ty }; setAI(m, AI.PATROL); break; }
        }
        ai.idleFor = sim.rng.range(def.idleTime[0], def.idleTime[1]);
      }
      break;
    case AI.PATROL:
      if (canSee(sim, m, p)) { ai.targetId = p.id; setAI(m, AI.ALERT); break; }
      steer(sim, m, ai.patrol.x, ai.patrol.y, def.patrolSpeed, dt);
      if (dist(m.x, m.y, ai.patrol.x, ai.patrol.y) < 3 || ai.t > 4) setAI(m, AI.IDLE);
      break;
    case AI.ALERT:
      if (!target || !target.life.alive) { setAI(m, AI.RESET); break; }
      m.facing = angleTo(m.x, m.y, target.x, target.y);
      if (ai.t >= def.alertTime) { ai.lastSeen = sim.time; setAI(m, AI.CHASE); }
      break;
    case AI.CHASE: {
      if (!target || !target.life.alive || target.statuses.has('SPAWN_PROTECTION')) { setAI(m, AI.RESET); break; }
      if (anchorDist > def.leashRadius) { setAI(m, AI.RESET); break; }
      const los = sim.map.hasLineOfSight(m.x, m.y, target.x, target.y);
      if (los) ai.lastSeen = sim.time;
      else if (sim.time - ai.lastSeen > LOS_LOST_RESET) { setAI(m, AI.RESET); break; }
      const d = dist(m.x, m.y, target.x, target.y);
      m.facing = angleTo(m.x, m.y, target.x, target.y);
      if (los && d <= def.attack.range + target.hurtboxRadius) {
        if (ai.attackCd <= 0) {
          ai.attack = { facing: m.facing, hit: false, lunged: false };
          setAI(m, AI.ATTACK);
          sim.emit({ type: 'telegraph', sourceId: m.id, x: m.x, y: m.y, facing: m.facing, duration: def.attack.windup });
        }
      } else steer(sim, m, target.x, target.y, def.chaseSpeed, dt);
      break;
    }
    case AI.ATTACK: {
      const at = def.attack, atk = ai.attack;
      if (ai.t >= at.windup && !atk.lunged) {
        atk.lunged = true;
        const r = sim.map.moveAndSlide(m.x, m.y, Math.cos(atk.facing) * at.lunge, Math.sin(atk.facing) * at.lunge, m.collisionRadius);
        m.x = r.x; m.y = r.y;
      }
      if (!atk.hit && ai.t >= at.windup && ai.t <= at.windup + at.active && target && target.life.alive) {
        if (shapeHits({ shape: at.shape, range: at.hitRange, halfAngleDeg: at.halfAngleDeg }, m.x, m.y, atk.facing, target)
            && sim.map.hasLineOfSight(m.x, m.y, target.x, target.y)) {
          atk.hit = true;
          sim.dealDamage(m, target, { multiplier: at.multiplier, sourceName: `${def.name} Bite` });
        }
      }
      if (ai.t >= at.windup + at.active + at.recovery) { ai.attack = null; ai.attackCd = at.cooldown; setAI(m, AI.CHASE); }
      break;
    }
    case AI.RESET:
      m.health.heal(def.resetRegenPerSec * dt);
      steer(sim, m, m.anchor.x, m.anchor.y, def.returnSpeed, dt);
      if (dist(m.x, m.y, m.anchor.x, m.anchor.y) < 4 || ai.t > 8) {
        if (ai.t > 8) { m.x = m.anchor.x; m.y = m.anchor.y; }
        m.health.reset(); m.statuses.clear(); ai.targetId = null; setAI(m, AI.IDLE);
      }
      break;
  }
}
