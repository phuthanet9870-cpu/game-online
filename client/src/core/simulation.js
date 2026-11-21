// Authoritative combat simulation (Phase 1 runs it in the browser, offline).
// Design rule: the client only sends *intent* (move vector, action request). Every rule —
// cooldown, stamina, range, line of sight, damage, death — is decided here, so in Phase 2
// this module moves to the server unchanged and the browser becomes a renderer + predictor.
import { TileMap } from './tilemap.js';
import { Health, Stamina } from './resources.js';
import { computeSecondaryStats } from './stats.js';
import { computeDamage } from './damage.js';
import { shapeHits } from './hitbox.js';
import { CharacterStateMachine, CharState } from './stateMachine.js';
import { StatusEffects } from './statusEffects.js';
import { createRng } from './rng.js';
import { normalizeInput, dir8FromAngle, angleFromDir8, angleTo, dist } from './math.js';
import { AI, setAI, updateMonster, onMonsterDamaged } from './monsterAI.js';
import { buildRegistry } from './gameData.js';

export const Reject = Object.freeze({
  UNKNOWN_ACTOR: 'UNKNOWN_ACTOR', DEAD: 'DEAD', STUNNED: 'STUNNED', BUSY: 'BUSY', COOLDOWN: 'COOLDOWN',
  NO_STAMINA: 'NO_STAMINA', NOT_EQUIPPED: 'NOT_EQUIPPED', NOT_IMPLEMENTED: 'NOT_IMPLEMENTED', BAD_REQUEST: 'BAD_REQUEST',
});
export const DASH_ID = 'ACT-DODGE';

export class Simulation {
  constructor({ registry = buildRegistry(), seed } = {}) {
    this.reg = registry;
    this.cfg = registry.config;
    this.rng = createRng(seed ?? this.cfg.seed);
    this.map = new TileMap(registry.map);
    this.dt = 1 / this.cfg.tickRate;
    this.time = 0;
    this.tick = 0;
    this.events = [];
    this.entities = new Map();
    this.monsters = [];
    this.stats = { kills: 0, deaths: 0, damageDealt: 0, damageTaken: 0 };
    this.player = this.#createPlayer();
    this.map.monsterAnchors.forEach((a, i) => this.#createMonster(a, i));
  }

  // ---------- creation ----------
  #createPlayer() {
    const pc = this.cfg.player;
    const weapon = this.reg.weapons[pc.starterWeapon];
    const stats = computeSecondaryStats(pc.primaryStats, this.cfg.statFormula, weapon);
    const p = {
      id: 'CHR-LOCAL-0001', kind: 'player', team: 'player', name: 'Tester',
      x: this.map.playerSpawn.x, y: this.map.playerSpawn.y, facing: 0,
      collisionRadius: pc.collisionRadius, hurtboxRadius: pc.hurtboxRadius,
      speed: pc.baseMoveSpeed, moveInput: { x: 0, y: 0 }, moving: false, walkTime: 0,
      primary: { ...pc.primaryStats }, stats, weapon,
      health: new Health(stats.maxHp),
      stamina: new Stamina(pc.staminaMax, pc.staminaRegenPerSec, pc.staminaRegenDelay),
      statuses: new StatusEffects(this.reg.statusDefs, this.cfg.cc),
      life: new CharacterStateMachine(),
      action: null, dash: null, cooldowns: new Map(), invulnUntil: 0,
      lastCombatTime: -Infinity, lastHitTime: -Infinity, incoming: [], deathRecap: null, deathTime: 0,
    };
    p.life.transition(CharState.IN_WORLD);
    this.entities.set(p.id, p);
    return p;
  }

  #createMonster(anchor, index) {
    const def = this.reg.monsters[anchor.monsterId];
    if (!def) throw new Error(`monster ${anchor.monsterId} not defined`);
    const m = {
      id: `MON-INST-${String(index + 1).padStart(3, '0')}`, kind: 'monster', team: 'monster', name: def.name, def,
      x: anchor.x, y: anchor.y, anchor: { x: anchor.x, y: anchor.y }, facing: Math.PI,
      collisionRadius: def.collisionRadius, hurtboxRadius: def.hurtboxRadius, moving: false, walkTime: 0,
      stats: { ...def.stats }, health: new Health(def.stats.maxHp),
      statuses: new StatusEffects(this.reg.statusDefs, this.cfg.cc),
      life: { get alive() { return m.ai.state !== AI.DEAD; } },
      ai: { state: AI.IDLE, prev: null, t: 0, idleFor: this.rng.range(def.idleTime[0], def.idleTime[1]), attackCd: 0, targetId: null, lastSeen: 0, attack: null, patrol: null },
      lastHitTime: -Infinity,
    };
    this.entities.set(m.id, m);
    this.monsters.push(m);
    return m;
  }

  emit(ev) { ev.time = this.time; ev.tick = this.tick; this.events.push(ev); }
  drainEvents() { const e = this.events; this.events = []; return e; }

  // ---------- client intents ----------
  setMoveInput(actorId, x, y) {
    const a = this.entities.get(actorId);
    if (!a || a.kind !== 'player') return;
    if (!Number.isFinite(x) || !Number.isFinite(y)) return; // reject garbage input
    a.moveInput = { x: Math.max(-1, Math.min(1, x)), y: Math.max(-1, Math.min(1, y)) };
  }

  /** Validate + start an action. Returns { ok } or { ok:false, reason }. */
  requestAction(actorId, req) {
    const res = this.#validateAndStart(actorId, req ?? {});
    if (!res.ok) this.emit({ type: 'action_rejected', actorId, action: req?.skillId ?? req?.type, reason: res.reason, remaining: res.remaining });
    return res;
  }

  #validateAndStart(actorId, req) {
    const p = this.entities.get(actorId);
    if (!p || p.kind !== 'player') return { ok: false, reason: Reject.UNKNOWN_ACTOR };
    if (!p.life.alive) return { ok: false, reason: Reject.DEAD };
    if (p.statuses.stunned) return { ok: false, reason: Reject.STUNNED };
    if (req.aimAngle !== undefined && !Number.isFinite(req.aimAngle)) return { ok: false, reason: Reject.BAD_REQUEST };

    if (req.type === 'dash') {
      if (p.dash) return { ok: false, reason: Reject.BUSY };
      if (p.action && p.action.t < p.action.skill.cancelableAfter) return { ok: false, reason: Reject.BUSY };
      const cd = p.cooldowns.get(DASH_ID) ?? 0;
      if (cd > 0) return { ok: false, reason: Reject.COOLDOWN, remaining: cd };
      const dc = this.cfg.dash;
      if (!p.stamina.spend(dc.staminaCost)) return { ok: false, reason: Reject.NO_STAMINA };
      let dx = p.moveInput.x, dy = p.moveInput.y;
      let ang = dx || dy ? angleFromDir8(dir8FromAngle(Math.atan2(dy, dx))) : p.facing;
      p.action = null;
      p.dash = { t: 0, ang, speed: dc.distance / dc.duration };
      p.facing = ang;
      p.cooldowns.set(DASH_ID, dc.cooldown);
      p.statuses.endOnAction();
      this.emit({ type: 'dash', actorId: p.id, x: p.x, y: p.y, facing: ang });
      return { ok: true };
    }

    if (req.type !== 'skill') return { ok: false, reason: Reject.BAD_REQUEST };
    const skill = this.reg.skills[req.skillId];
    if (!skill) return { ok: false, reason: Reject.BAD_REQUEST };
    const w = p.weapon;
    if (skill.weaponType !== w.weapon_type_id || (skill.skill_id !== w.basicAttack && !w.skills.includes(skill.skill_id)))
      return { ok: false, reason: Reject.NOT_EQUIPPED };
    if (skill.status) return { ok: false, reason: Reject.NOT_IMPLEMENTED };
    if (p.dash) return { ok: false, reason: Reject.BUSY };
    if (p.action && p.action.t < p.action.skill.cancelableAfter) return { ok: false, reason: Reject.BUSY };
    const cd = p.cooldowns.get(skill.skill_id) ?? 0;
    if (cd > 0) return { ok: false, reason: Reject.COOLDOWN, remaining: cd };
    if (!p.stamina.canSpend(skill.staminaCost)) return { ok: false, reason: Reject.NO_STAMINA };

    p.stamina.spend(skill.staminaCost);
    if (skill.cooldown > 0) p.cooldowns.set(skill.skill_id, skill.cooldown);
    if (req.aimAngle !== undefined) p.facing = req.aimAngle;
    p.action = { skill, t: 0, facing: p.facing, hitSets: skill.hits.map(() => new Set()), lunged: skill.hits.map(() => false), counter: null };
    p.statuses.endOnAction();
    this.emit({ type: 'action_started', actorId: p.id, skillId: skill.skill_id, name: skill.name, x: p.x, y: p.y, facing: p.facing });
    return { ok: true };
  }

  // ---------- simulation step ----------
  step(dt = this.dt) {
    this.time += dt;
    this.tick++;
    this.#updatePlayer(this.player, dt);
    for (const m of this.monsters) {
      m.statuses.update(dt);
      updateMonster(this, m, dt);
      if (m.moving) m.walkTime += dt;
    }
    this.#separateMonsters();
  }

  #updatePlayer(p, dt) {
    p.life.update(dt);
    p.statuses.update(dt);
    p.stamina.update(dt);
    for (const [k, v] of p.cooldowns) { const n = v - dt; if (n <= 0) p.cooldowns.delete(k); else p.cooldowns.set(k, n); }
    p.moving = false;

    const st = p.life.state;
    if (st === CharState.DEAD) {
      if (p.life.timeInState >= this.cfg.player.respawnDelay) this.#beginRespawn(p);
      return;
    }
    if (st === CharState.RESPAWNING) {
      if (p.life.timeInState >= this.cfg.player.respawningDuration) {
        p.life.transition(CharState.IN_WORLD);
        p.statuses.apply('SPAWN_PROTECTION', this.cfg.player.spawnProtection, p.id);
        this.emit({ type: 'respawned', actorId: p.id, x: p.x, y: p.y });
      }
      return;
    }
    if (st === CharState.IN_COMBAT && this.time - p.lastCombatTime > this.cfg.player.inCombatTimeout) p.life.transition(CharState.IN_WORLD);

    if (p.statuses.stunned) { p.action = null; return; }

    if (p.dash) {
      const d = p.dash;
      const step = Math.min(dt, this.cfg.dash.duration - d.t);
      const r = this.map.moveAndSlide(p.x, p.y, Math.cos(d.ang) * d.speed * step, Math.sin(d.ang) * d.speed * step, p.collisionRadius);
      p.x = r.x; p.y = r.y;
      d.t += dt;
      if (d.t >= this.cfg.dash.duration - 1e-9) p.dash = null;
      return;
    }

    if (p.action) { this.#updateAction(p, dt); return; }

    // free movement, quantised to 8 directions
    const n = normalizeInput(p.moveInput.x, p.moveInput.y);
    const mag = Math.hypot(n.x, n.y);
    if (mag > 0.2) {
      const ang = angleFromDir8(dir8FromAngle(Math.atan2(n.y, n.x)));
      const s = p.speed * Math.min(1, mag) * dt;
      const r = this.map.moveAndSlide(p.x, p.y, Math.cos(ang) * s, Math.sin(ang) * s, p.collisionRadius);
      p.x = r.x; p.y = r.y; p.facing = ang; p.moving = true; p.walkTime += dt;
    }
  }

  #updateAction(p, dt) {
    const a = p.action, sk = a.skill;
    a.t += dt;

    if (sk.counter) {
      const c = sk.counter;
      if (a.counter) {
        a.counter.t += dt;
        this.#resolveHit(p, c.hit, a.counter.t, a.counter.hitSet, a.counter, sk.name);
        if (a.counter.t >= c.strikeDuration) p.action = null;
        return;
      }
      p.counterStance = a.t >= c.windowStart && a.t <= c.windowEnd;
      if (a.t >= sk.duration) { p.counterStance = false; p.action = null; }
      return;
    }

    sk.hits.forEach((h, i) => {
      if (a.t >= h.t && !a.lunged[i]) {
        a.lunged[i] = true;
        if (h.lunge) { const r = this.map.moveAndSlide(p.x, p.y, Math.cos(a.facing) * h.lunge, Math.sin(a.facing) * h.lunge, p.collisionRadius); p.x = r.x; p.y = r.y; }
        this.emit({ type: 'swing', actorId: p.id, skillId: sk.skill_id, vfx: h.vfx, x: p.x, y: p.y, facing: a.facing, range: h.range, halfAngleDeg: h.halfAngleDeg });
      }
      this.#resolveHit(p, h, a.t, a.hitSets[i], a, sk.name);
    });
    if (a.t >= sk.duration) p.action = null;
  }

  #resolveHit(p, h, t, hitSet, holder, sourceName) {
    if (t < h.t || t > h.t + h.active) return;
    const facing = holder.facing ?? p.facing;
    for (const m of this.monsters) {
      if (hitSet.has(m.id) || !m.life.alive) continue;
      if (!shapeHits(h, p.x, p.y, facing, m)) continue;
      if (!this.map.hasLineOfSight(p.x, p.y, m.x, m.y)) continue; // no hitting through walls
      hitSet.add(m.id);
      this.dealDamage(p, m, { multiplier: h.multiplier, forceCrit: h.forceCrit, sourceName, applyStatus: h.applyStatus });
    }
  }

  // ---------- damage / death ----------
  isInvulnerable(e) {
    if (e.kind === 'player') return !!e.dash && this.cfg.dash.invulnerable || this.time < e.invulnUntil || e.statuses.invulnerable || !e.life.alive;
    return e.ai.state === AI.RESET || e.ai.state === AI.RESPAWN || e.ai.state === AI.DEAD;
  }

  dealDamage(attacker, target, { multiplier = 1, forceCrit = false, sourceName = 'Attack', applyStatus } = {}) {
    if (this.isInvulnerable(target)) {
      this.emit({ type: 'immune', attackerId: attacker.id, targetId: target.id, x: target.x, y: target.y, reason: target.dash ? 'DODGED' : target.ai?.state === AI.RESET ? 'EVADE' : 'IMMUNE' });
      return null;
    }
    if (target.kind === 'player' && target.counterStance && target.action?.skill.counter && !target.action.counter) {
      // Counter Slash triggered: negate the hit, turn toward the attacker, strike back.
      const c = target.action.skill.counter;
      target.counterStance = false;
      target.facing = angleTo(target.x, target.y, attacker.x, attacker.y);
      target.action.counter = { t: 0, hitSet: new Set(), facing: target.facing };
      target.invulnUntil = this.time + c.invulnerableAfter;
      this.emit({ type: 'countered', actorId: target.id, attackerId: attacker.id, x: target.x, y: target.y, facing: target.facing });
      this.emit({ type: 'swing', actorId: target.id, skillId: target.action.skill.skill_id, vfx: c.hit.vfx, x: target.x, y: target.y, facing: target.facing, range: c.hit.range, halfAngleDeg: c.hit.halfAngleDeg });
      return null;
    }
    const isPvp = attacker.kind === 'player' && target.kind === 'player';
    const res = computeDamage({ attacker, target, multiplier, forceCrit, isPvp, rng: this.rng, config: this.cfg.damage, defenseMultiplier: target.statuses.defenseMultiplier() });
    const applied = target.health.takeDamage(res.amount);
    target.lastHitTime = this.time;
    const ev = { type: 'damage', attackerId: attacker.id, attackerName: attacker.name, targetId: target.id, targetName: target.name, source: sourceName,
                 amount: applied, raw: res.amount, crit: res.crit, trace: res.trace, x: target.x, y: target.y, targetHp: target.health.hp };
    this.emit(ev);

    if (attacker.kind === 'player') { this.#markCombat(attacker); this.stats.damageDealt += applied; }
    if (target.kind === 'player') {
      this.#markCombat(target);
      this.stats.damageTaken += applied;
      target.incoming.push({ time: this.time, attacker: attacker.name, source: sourceName, amount: applied, crit: res.crit, hpAfter: target.health.hp });
      if (target.incoming.length > 20) target.incoming.shift();
    }
    if (applyStatus && !target.health.dead) {
      for (const s of applyStatus) {
        const d = target.statuses.apply(s.status, s.duration, attacker.id);
        this.emit({ type: d > 0 ? 'status_applied' : 'status_resisted', targetId: target.id, status: s.status, duration: d, x: target.x, y: target.y });
      }
    }
    if (target.kind === 'monster' && !target.health.dead) onMonsterDamaged(this, target, attacker);
    if (target.health.dead) this.#onDeath(target, attacker, sourceName);
    return ev;
  }

  #markCombat(p) {
    p.lastCombatTime = this.time;
    if (p.life.state === CharState.IN_WORLD) p.life.transition(CharState.IN_COMBAT);
  }

  #onDeath(target, killer, source) {
    if (target.kind === 'monster') {
      target.ai.attack = null; target.statuses.clear();
      setAI(target, AI.DEAD);
      this.stats.kills++;
      this.emit({ type: 'death', targetId: target.id, targetName: target.name, killerId: killer.id, x: target.x, y: target.y });
      return;
    }
    const p = target;
    p.action = null; p.dash = null; p.counterStance = false; p.statuses.clear();
    p.life.transition(CharState.DEAD);
    p.deathTime = this.time;
    this.stats.deaths++;
    const n = this.cfg.player.deathRecapSize;
    p.deathRecap = { killer: killer.name, source, time: this.time, hits: p.incoming.filter((h) => this.time - h.time <= 10).slice(-n) };
    for (const m of this.monsters) if (m.ai.targetId === p.id && m.ai.state !== AI.DEAD) { m.ai.attack = null; setAI(m, AI.RESET); }
    this.emit({ type: 'player_death', actorId: p.id, killer: killer.name, source, x: p.x, y: p.y });
  }

  #beginRespawn(p) {
    p.life.transition(CharState.RESPAWNING);
    p.x = this.map.playerSpawn.x; p.y = this.map.playerSpawn.y; p.facing = 0;
    p.health.reset(); p.stamina.reset(); p.statuses.clear(); p.incoming = [];
    p.action = null; p.dash = null; p.moveInput = { x: 0, y: 0 };
    this.emit({ type: 'respawning', actorId: p.id, x: p.x, y: p.y });
  }

  respawnMonster(m) {
    m.x = m.anchor.x; m.y = m.anchor.y; m.health.reset(); m.statuses.clear();
    m.ai.targetId = null; m.ai.attack = null; m.ai.attackCd = 0;
    setAI(m, AI.RESPAWN);
    this.emit({ type: 'monster_respawn', targetId: m.id, x: m.x, y: m.y });
  }

  #separateMonsters() {
    const ms = this.monsters;
    for (let i = 0; i < ms.length; i++) for (let j = i + 1; j < ms.length; j++) {
      const a = ms[i], b = ms[j];
      if (!a.life.alive || !b.life.alive) continue;
      const d = dist(a.x, a.y, b.x, b.y), min = a.collisionRadius + b.collisionRadius;
      if (d > 0 && d < min) {
        const push = (min - d) / 2, ux = (b.x - a.x) / d, uy = (b.y - a.y) / d;
        const ra = this.map.moveAndSlide(a.x, a.y, -ux * push, -uy * push, a.collisionRadius);
        const rb = this.map.moveAndSlide(b.x, b.y, ux * push, uy * push, b.collisionRadius);
        a.x = ra.x; a.y = ra.y; b.x = rb.x; b.y = rb.y;
      }
    }
  }

  // ---------- read-only views ----------
  /** Combat state per Master Prompt §5.2: idle, windup, active, recovery, casting, moving, CC, disabled, death. */
  combatState(e) {
    if (e.kind === 'player') {
      if (!e.life.alive) return e.life.state === CharState.DEAD ? 'death' : 'disabled';
      if (e.statuses.stunned) return 'CC';
      if (e.dash) return 'moving';
      if (e.action) {
        const a = e.action, sk = a.skill;
        if (sk.counter) {
          if (a.counter) return a.counter.t < sk.counter.hit.t ? 'windup' : a.counter.t <= sk.counter.hit.t + sk.counter.hit.active ? 'active' : 'recovery';
          return 'casting';
        }
        const first = sk.hits[0], last = sk.hits[sk.hits.length - 1];
        if (a.t < first.t) return 'windup';
        if (a.t <= last.t + last.active) return 'active';
        return 'recovery';
      }
      return e.moving ? 'moving' : 'idle';
    }
    const s = e.ai.state;
    if (s === AI.DEAD) return 'death';
    if (e.statuses.stunned) return 'CC';
    if (s === AI.ATTACK) { const at = e.def.attack; return e.ai.t < at.windup ? 'windup' : e.ai.t <= at.windup + at.active ? 'active' : 'recovery'; }
    return e.moving ? 'moving' : 'idle';
  }

  getCooldown(actorId, id) { return this.entities.get(actorId)?.cooldowns.get(id) ?? 0; }

  snapshot() {
    const p = this.player;
    return {
      tick: this.tick, time: this.time,
      player: { id: p.id, x: p.x, y: p.y, facing: p.facing, hp: p.health.hp, maxHp: p.health.max, stamina: p.stamina.value, maxStamina: p.stamina.max,
                life: p.life.state, combat: this.combatState(p), statuses: p.statuses.list(), cooldowns: Object.fromEntries(p.cooldowns) },
      monsters: this.monsters.map((m) => ({ id: m.id, x: m.x, y: m.y, hp: m.health.hp, maxHp: m.health.max, ai: m.ai.state, combat: this.combatState(m), statuses: m.statuses.list() })),
      stats: { ...this.stats },
    };
  }
}
