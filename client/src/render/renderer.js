// Canvas renderer. Reads simulation state read-only and turns events into VFX.
// It never changes gameplay state: hits/damage/death come only from the simulation.
import { buildSpriteBank, buildGroundLayers, HERO_W, HERO_H, WOLF_W, WOLF_H } from './sprites.js';
import { cardinalFromAngle, clamp } from '../core/math.js';
import { AI } from '../core/monsterAI.js';
import { CharState } from '../core/stateMachine.js';

export const VIEW_W = 384, VIEW_H = 216;

const C = {
  slash: '#eef4ff', slashEdge: '#9fc3ff', smash: '#ffb04a', counter: '#7ff3ff',
  enemyTele: 'rgba(255,64,64,0.22)', enemyTeleFill: 'rgba(255,72,48,0.45)', enemyTeleEdge: '#ff4a3d',
  selfTele: 'rgba(120,180,255,0.25)', selfTeleEdge: '#8fc0ff',
  dmgEnemy: '#ffffff', dmgCrit: '#ffd24a', dmgPlayer: '#ff5a5a', heal: '#7dff9a', info: '#bfe7ff',
  shadow: 'rgba(8,4,14,0.38)', hpBack: '#1b1222', hpFill: '#e0443a', hpFrame: '#0d0812',
};

export class Renderer {
  constructor(canvas, overlay, sim, settings) {
    this.canvas = canvas; this.overlay = overlay; this.sim = sim; this.settings = settings;
    this.ctx = canvas.getContext('2d'); this.ctx.imageSmoothingEnabled = false;
    this.octx = overlay.getContext('2d');
    canvas.width = VIEW_W; canvas.height = VIEW_H;
    this.bank = buildSpriteBank();
    const g = buildGroundLayers(sim.map);
    this.ground = g.layers; this.props = g.props;
    this.cam = { x: sim.player.x, y: sim.player.y };
    this.vfx = []; this.particles = []; this.texts = []; this.afterimages = [];
    this.shake = 0; this.time = 0; this.focusTargetId = null;
  }

  resizeOverlay(cssW, cssH, dpr) {
    this.overlay.width = Math.round(cssW * dpr); this.overlay.height = Math.round(cssH * dpr);
    this.oScale = this.overlay.width / VIEW_W;
  }

  // ---------------- events → vfx ----------------
  onEvent(ev) {
    const s = this.sim, rm = this.settings.reducedMotion;
    switch (ev.type) {
      case 'swing': {
        const col = ev.vfx === 'smash' ? C.smash : ev.vfx === 'counter' ? C.counter : C.slash;
        this.vfx.push({ kind: 'slash', x: ev.x, y: ev.y, facing: ev.facing, range: ev.range, ha: (ev.halfAngleDeg * Math.PI) / 180, color: col, rev: ev.vfx === 'slash_rev', big: ev.vfx === 'slash_big' || ev.vfx === 'counter', t: 0, dur: 0.16, owner: ev.actorId });
        if (ev.vfx === 'smash') this.vfx.push({ kind: 'ring', x: ev.x + Math.cos(ev.facing) * 18, y: ev.y + Math.sin(ev.facing) * 18, r0: 4, r1: 22, color: C.smash, t: 0, dur: 0.3 });
        break;
      }
      case 'damage': {
        const toPlayer = ev.targetId === s.player.id;
        this.texts.push({ x: ev.x + (Math.random() * 8 - 4), y: ev.y - 14, text: String(ev.amount) + (ev.crit ? '!' : ''), color: toPlayer ? C.dmgPlayer : ev.crit ? C.dmgCrit : C.dmgEnemy, size: ev.crit ? 1.35 : 1, t: 0, dur: 0.9 });
        const n = ev.crit ? 12 : 7;
        for (let i = 0; i < n; i++) {
          const a = Math.random() * Math.PI * 2, sp = 40 + Math.random() * 70;
          this.particles.push({ x: ev.x, y: ev.y - 4, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp - 20, life: 0.25 + Math.random() * 0.2, t: 0, color: toPlayer ? '#ff6b6b' : ev.crit ? '#ffd24a' : '#ffffff' });
        }
        if (!rm) this.shake = Math.max(this.shake, toPlayer ? 3 : ev.crit ? 2.5 : 1.2);
        if (!toPlayer) this.focusTargetId = ev.targetId;
        break;
      }
      case 'immune': this.texts.push({ x: ev.x, y: ev.y - 16, text: ev.reason, color: C.info, size: 0.8, t: 0, dur: 0.6 }); break;
      case 'countered':
        this.texts.push({ x: ev.x, y: ev.y - 20, text: 'COUNTER!', color: C.counter, size: 1.2, t: 0, dur: 0.8 });
        this.vfx.push({ kind: 'ring', x: ev.x, y: ev.y, r0: 6, r1: 28, color: C.counter, t: 0, dur: 0.28 });
        if (!rm) this.shake = Math.max(this.shake, 2.5);
        break;
      case 'status_applied': {
        const label = { STUN: 'STUN', GUARD_BROKEN: 'GUARD BREAK' }[ev.status];
        if (label) this.texts.push({ x: ev.x, y: ev.y - 24, text: label, color: '#ffb04a', size: 0.8, t: 0, dur: 0.8 });
        break;
      }
      case 'status_resisted': this.texts.push({ x: ev.x, y: ev.y - 24, text: 'RESIST', color: C.info, size: 0.8, t: 0, dur: 0.7 }); break;
      case 'interrupt': this.texts.push({ x: ev.x, y: ev.y - 24, text: 'INTERRUPT', color: '#ffe08a', size: 0.8, t: 0, dur: 0.7 }); break;
      case 'death':
        for (let i = 0; i < 16; i++) { const a = Math.random() * Math.PI * 2, sp = 20 + Math.random() * 40; this.particles.push({ x: ev.x, y: ev.y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp - 10, life: 0.6, t: 0, color: i % 2 ? '#6f5f74' : '#b9a9ad' }); }
        if (this.focusTargetId === ev.targetId) this.focusTargetId = null;
        break;
      case 'player_death': if (!rm) this.shake = 5; break;
      case 'respawned':
      case 'monster_respawn':
        this.vfx.push({ kind: 'ring', x: ev.x, y: ev.y, r0: 18, r1: 2, color: ev.type === 'respawned' ? '#9fe6ff' : '#c9a6ff', t: 0, dur: 0.5 });
        break;
    }
  }

  // ---------------- frame ----------------
  render(dt, alpha = 1) {
    this.time += dt;
    const s = this.sim, p = s.player, ctx = this.ctx;
    // camera
    const k = 1 - Math.exp(-dt * 10);
    this.cam.x += (p.x - this.cam.x) * k; this.cam.y += (p.y - this.cam.y) * k;
    const mw = s.map.pixelWidth, mh = s.map.pixelHeight;
    let cx = clamp(this.cam.x, VIEW_W / 2, mw - VIEW_W / 2), cy = clamp(this.cam.y, VIEW_H / 2, mh - VIEW_H / 2);
    this.shake = Math.max(0, this.shake - dt * 18);
    if (this.shake > 0) { cx += (Math.random() * 2 - 1) * this.shake; cy += (Math.random() * 2 - 1) * this.shake; }
    const ox = Math.round(cx - VIEW_W / 2), oy = Math.round(cy - VIEW_H / 2);
    this.ox = ox; this.oy = oy;

    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.fillStyle = '#0b0710'; ctx.fillRect(0, 0, VIEW_W, VIEW_H);
    const wf = Math.floor(this.time * 2) % 3;
    ctx.drawImage(this.ground[wf], ox, oy, VIEW_W, VIEW_H, 0, 0, VIEW_W, VIEW_H);
    ctx.translate(-ox, -oy);

    this.#drawTelegraphs(ctx);
    // shadows
    for (const e of s.entities.values()) {
      if (e.kind === 'monster' && e.ai.state === AI.DEAD && e.ai.t > 0.8) continue;
      ctx.fillStyle = C.shadow; ctx.beginPath(); ctx.ellipse(Math.round(e.x), Math.round(e.y + (e.kind === 'player' ? 9 : 6)), e.kind === 'player' ? 6 : 8, 2.5, 0, 0, Math.PI * 2); ctx.fill();
    }
    // afterimages
    if (p.dash && Math.floor(this.time * 60) % 2 === 0) this.afterimages.push({ x: p.x, y: p.y, facing: p.facing, t: 0 });
    for (const a of this.afterimages) {
      a.t += dt;
      const img = this.bank.heroFlash[`${cardinalFromAngle(a.facing)}:s:0`];
      ctx.globalAlpha = Math.max(0, 0.45 - a.t * 1.8);
      ctx.drawImage(img, Math.round(a.x - HERO_W / 2), Math.round(a.y - HERO_H + 10));
    }
    ctx.globalAlpha = 1;
    this.afterimages = this.afterimages.filter((a) => a.t < 0.25);

    // y-sorted entities + props
    const list = [...s.entities.values(), ...this.props];
    list.sort((a, b) => a.y - b.y);
    for (const e of list) {
      if (e.kind === 'tree') { ctx.drawImage(this.bank.tree, e.x - 13, e.y - 28); continue; }
      if (e.kind === 'player') this.#drawPlayer(ctx, e); else this.#drawMonster(ctx, e);
    }
    this.#drawVfx(ctx, dt);
    if (this.settings.debug) this.#drawDebug(ctx);
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    this.#drawOverlay(dt);
  }

  #sector(ctx, x, y, r, f, ha) { ctx.beginPath(); ctx.moveTo(x, y); ctx.arc(x, y, r, f - ha, f + ha); ctx.closePath(); }

  #drawTelegraphs(ctx) {
    const s = this.sim;
    for (const m of s.monsters) {
      if (m.ai.state !== AI.ATTACK || !m.ai.attack) continue;
      const at = m.def.attack;
      if (m.ai.t > at.windup) continue;
      const prog = clamp(m.ai.t / at.windup, 0, 1), ha = (at.halfAngleDeg * Math.PI) / 180, f = m.ai.attack.facing;
      const r = at.hitRange + at.lunge;
      ctx.fillStyle = C.enemyTele; this.#sector(ctx, m.x, m.y, r, f, ha); ctx.fill();
      ctx.fillStyle = C.enemyTeleFill; this.#sector(ctx, m.x, m.y, r * prog, f, ha); ctx.fill();
      ctx.strokeStyle = C.enemyTeleEdge; ctx.lineWidth = 1; this.#sector(ctx, m.x, m.y, r, f, ha); ctx.stroke();
    }
    const p = s.player, a = p.action;
    if (a?.skill.telegraph && a.t <= a.skill.telegraph.to) {
      const h = a.skill.hits[0], ha = (h.halfAngleDeg * Math.PI) / 180, prog = a.t / a.skill.telegraph.to;
      ctx.fillStyle = C.selfTele; this.#sector(ctx, p.x, p.y, h.range * prog + 4, a.facing, ha); ctx.fill();
      ctx.strokeStyle = C.selfTeleEdge; this.#sector(ctx, p.x, p.y, h.range + 4, a.facing, ha); ctx.stroke();
    }
    if (p.counterStance) {
      ctx.strokeStyle = C.counter; ctx.globalAlpha = 0.55 + 0.35 * Math.sin(this.time * 30);
      ctx.beginPath(); ctx.arc(p.x, p.y, 13, 0, Math.PI * 2); ctx.stroke(); ctx.globalAlpha = 1;
    }
  }

  #drawPlayer(ctx, p) {
    const s = this.sim, st = p.life.state;
    const dir = cardinalFromAngle(p.facing);
    const showBlade = !!p.action;
    const frame = p.moving || p.dash ? Math.floor(p.walkTime * 9) % 4 : 0;
    const flash = s.time - p.lastHitTime < 0.09;
    const key = `${dir}:${showBlade ? 'n' : 's'}:${frame}`;
    const img = (flash ? this.bank.heroFlash : this.bank.hero)[key];
    const x = Math.round(p.x - HERO_W / 2), y = Math.round(p.y - HERO_H + 10);
    if (st === CharState.DEAD) {
      ctx.save(); ctx.translate(Math.round(p.x), Math.round(p.y + 4)); ctx.rotate(Math.PI / 2); ctx.globalAlpha = 0.75;
      ctx.drawImage(this.bank.hero['down:n:0'], -HERO_W / 2, -HERO_H / 2); ctx.restore(); return;
    }
    if (st === CharState.RESPAWNING) ctx.globalAlpha = clamp(p.life.timeInState / s.cfg.player.respawningDuration, 0.1, 1);
    else if (p.statuses.has('SPAWN_PROTECTION')) ctx.globalAlpha = Math.floor(this.time * 12) % 2 ? 0.45 : 0.9;
    // blade behind when facing up
    if (showBlade && dir === 'up') this.#drawBlade(ctx, p);
    ctx.drawImage(img, x, y);
    if (showBlade && dir !== 'up') this.#drawBlade(ctx, p);
    ctx.globalAlpha = 1;
    if (p.statuses.stunned) this.#stunStars(ctx, p.x, p.y - 16);
  }

  #drawBlade(ctx, p) {
    const a = p.action, sk = a.skill;
    let ang = a.facing, glow = null;
    if (sk.counter) {
      if (a.counter) { const pr = clamp(a.counter.t / 0.18, 0, 1); ang = a.counter.facing - 1.9 + 3.8 * pr; glow = C.counter; }
      else { ang = a.facing - Math.PI / 2; glow = p.counterStance ? C.counter : null; }
    } else {
      let idx = 0;
      sk.hits.forEach((h, i) => { if (a.t >= h.t - 0.08) idx = i; });
      const h = sk.hits[idx], ha = (h.halfAngleDeg * Math.PI) / 180;
      const pr = clamp((a.t - (h.t - 0.05)) / (h.active + 0.07), 0, 1);
      const rev = h.vfx === 'slash_rev';
      if (sk.telegraph && a.t < h.t) { ang = a.facing - 2.2; glow = C.smash; }
      else ang = rev ? a.facing + ha - 2 * ha * pr : a.facing - ha + 2 * ha * pr;
    }
    const hx = p.x + Math.cos(a.facing) * 3, hy = p.y - 2 + Math.sin(a.facing) * 2;
    const len = 13;
    const ex = hx + Math.cos(ang) * len, ey = hy + Math.sin(ang) * len;
    ctx.lineCap = 'square';
    if (glow) { ctx.save(); ctx.strokeStyle = glow; ctx.globalAlpha *= 0.6; ctx.lineWidth = 4; ctx.beginPath(); ctx.moveTo(hx, hy); ctx.lineTo(ex, ey); ctx.stroke(); ctx.restore(); }
    ctx.strokeStyle = '#160f1d'; ctx.lineWidth = 3; ctx.beginPath(); ctx.moveTo(hx, hy); ctx.lineTo(ex, ey); ctx.stroke();
    ctx.strokeStyle = '#dfe7f2'; ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(hx, hy); ctx.lineTo(ex, ey); ctx.stroke();
    ctx.fillStyle = '#c9a24a'; ctx.fillRect(Math.round(hx) - 1, Math.round(hy) - 1, 2, 2);
  }

  #stunStars(ctx, x, y) {
    for (let i = 0; i < 3; i++) {
      const a = this.time * 6 + (i * Math.PI * 2) / 3;
      ctx.fillStyle = '#ffe08a'; ctx.fillRect(Math.round(x + Math.cos(a) * 6), Math.round(y + Math.sin(a) * 2), 2, 2);
    }
  }

  #drawMonster(ctx, m) {
    const s = this.sim, st = m.ai.state;
    let alpha = 1;
    if (st === AI.DEAD) { if (m.ai.t > 0.8) return; alpha = 1 - m.ai.t / 0.8; }
    if (st === AI.RESPAWN) alpha = clamp(m.ai.t / 0.6, 0.05, 1);
    if (st === AI.RESET) alpha = 0.6;
    const side = Math.cos(m.facing) >= 0 ? 'right' : 'left';
    const cs = s.combatState(m);
    const pose = cs === 'windup' ? 'windup' : cs === 'active' || cs === 'recovery' && m.ai.t < m.def.attack.windup + 0.2 ? 'attack' : m.moving ? 'walk' : 'idle';
    const frame = pose === 'walk' ? Math.floor(m.walkTime * 10) % 4 : 0;
    const flash = s.time - m.lastHitTime < 0.09 || (pose === 'windup' && Math.floor(this.time * 16) % 2 === 0);
    const bank = flash && st !== AI.DEAD ? this.bank.wolfFlash : this.bank.wolf;
    ctx.globalAlpha = alpha;
    if (st === AI.DEAD) {
      ctx.save(); ctx.translate(Math.round(m.x), Math.round(m.y)); ctx.scale(1, -1);
      ctx.drawImage(this.bank.wolf[`${side}:idle:0`], -WOLF_W / 2, -WOLF_H / 2); ctx.restore();
    } else ctx.drawImage(bank[`${side}:${pose}:${frame}`], Math.round(m.x - WOLF_W / 2), Math.round(m.y - WOLF_H + 6));
    ctx.globalAlpha = 1;
    if (st === AI.DEAD || st === AI.RESPAWN) return;
    if (m.statuses.stunned) this.#stunStars(ctx, m.x, m.y - 12);
    if (m.health.hp < m.health.max || st === AI.CHASE || st === AI.ATTACK) {
      const w = 18, bx = Math.round(m.x - w / 2), by = Math.round(m.y - 15);
      ctx.fillStyle = C.hpFrame; ctx.fillRect(bx - 1, by - 1, w + 2, 4);
      ctx.fillStyle = C.hpBack; ctx.fillRect(bx, by, w, 2);
      ctx.fillStyle = m.statuses.has('GUARD_BROKEN') ? '#ffb04a' : C.hpFill; ctx.fillRect(bx, by, Math.round(w * m.health.ratio), 2);
    }
  }

  #drawVfx(ctx, dt) {
    for (const v of this.vfx) {
      v.t += dt;
      const pr = clamp(v.t / v.dur, 0, 1);
      if (v.kind === 'slash') {
        // follow the owner so lunging slashes stay attached
        const o = this.sim.entities.get(v.owner);
        const x = o ? o.x : v.x, y = o ? o.y : v.y;
        const sweep = v.ha * 2, start = v.rev ? v.facing + v.ha : v.facing - v.ha;
        const end = start + (v.rev ? -1 : 1) * sweep * Math.min(1, pr * 1.6);
        const r = v.range - 2;
        ctx.globalAlpha = 1 - pr;
        ctx.strokeStyle = C.slashEdge; ctx.lineWidth = v.big ? 5 : 4;
        ctx.beginPath(); ctx.arc(x, y, r - 1, Math.min(start, end), Math.max(start, end)); ctx.stroke();
        ctx.strokeStyle = v.color; ctx.lineWidth = v.big ? 3 : 2;
        ctx.beginPath(); ctx.arc(x, y, r, Math.min(start, end), Math.max(start, end)); ctx.stroke();
        ctx.globalAlpha = 1;
      } else if (v.kind === 'ring') {
        ctx.globalAlpha = 1 - pr; ctx.strokeStyle = v.color; ctx.lineWidth = 2;
        ctx.beginPath(); ctx.arc(v.x, v.y, v.r0 + (v.r1 - v.r0) * pr, 0, Math.PI * 2); ctx.stroke(); ctx.globalAlpha = 1;
      }
    }
    this.vfx = this.vfx.filter((v) => v.t < v.dur);
    for (const q of this.particles) {
      q.t += dt; q.x += q.vx * dt; q.y += q.vy * dt; q.vx *= 0.9; q.vy = q.vy * 0.9 + 60 * dt;
      ctx.globalAlpha = clamp(1 - q.t / q.life, 0, 1); ctx.fillStyle = q.color; ctx.fillRect(Math.round(q.x), Math.round(q.y), 1, 1);
    }
    ctx.globalAlpha = 1;
    this.particles = this.particles.filter((q) => q.t < q.life);
    if (this.particles.length > 400) this.particles.splice(0, this.particles.length - 400);
  }

  #drawDebug(ctx) {
    const s = this.sim, p = s.player;
    ctx.lineWidth = 1;
    // solid tiles in view
    ctx.fillStyle = 'rgba(255,0,80,0.14)';
    const tx0 = Math.floor(this.ox / 16), ty0 = Math.floor(this.oy / 16);
    for (let ty = ty0; ty <= ty0 + 14; ty++) for (let tx = tx0; tx <= tx0 + 24; tx++) if (s.map.isSolidTile(tx, ty)) ctx.fillRect(tx * 16, ty * 16, 16, 16);
    // player hurtbox + collision box
    ctx.strokeStyle = '#4dff88'; ctx.beginPath(); ctx.arc(p.x, p.y, p.hurtboxRadius, 0, Math.PI * 2); ctx.stroke();
    ctx.strokeStyle = '#ffffff'; ctx.strokeRect(p.x - p.collisionRadius, p.y - p.collisionRadius, p.collisionRadius * 2, p.collisionRadius * 2);
    // active player hitboxes
    const a = p.action;
    if (a) {
      const hits = a.counter ? [[a.skill.counter.hit, a.counter.t, a.counter.facing]] : a.skill.hits.map((h) => [h, a.t, a.facing]);
      for (const [h, t, f] of hits) if (t >= h.t && t <= h.t + h.active) {
        ctx.strokeStyle = '#ff3df5'; this.#sector(ctx, p.x, p.y, h.range, f, (h.halfAngleDeg * Math.PI) / 180); ctx.stroke();
      }
    }
    for (const m of s.monsters) {
      if (!m.life.alive) continue;
      ctx.strokeStyle = '#ffa53d'; ctx.beginPath(); ctx.arc(m.x, m.y, m.hurtboxRadius, 0, Math.PI * 2); ctx.stroke();
      ctx.setLineDash([2, 3]);
      ctx.strokeStyle = 'rgba(255,230,90,0.6)'; ctx.beginPath(); ctx.arc(m.x, m.y, m.def.aggroRadius, 0, Math.PI * 2); ctx.stroke();
      ctx.strokeStyle = 'rgba(190,120,255,0.55)'; ctx.beginPath(); ctx.arc(m.anchor.x, m.anchor.y, m.def.leashRadius, 0, Math.PI * 2); ctx.stroke();
      ctx.setLineDash([]);
      const d = Math.hypot(p.x - m.x, p.y - m.y);
      if (d < m.def.aggroRadius * 1.6) {
        ctx.strokeStyle = s.map.hasLineOfSight(m.x, m.y, p.x, p.y) ? 'rgba(80,255,120,0.7)' : 'rgba(255,60,60,0.7)';
        ctx.beginPath(); ctx.moveTo(m.x, m.y); ctx.lineTo(p.x, p.y); ctx.stroke();
      }
      if (m.ai.state === AI.ATTACK && m.ai.attack && m.ai.t >= m.def.attack.windup && m.ai.t <= m.def.attack.windup + m.def.attack.active) {
        ctx.strokeStyle = '#ff3df5'; this.#sector(ctx, m.x, m.y, m.def.attack.hitRange, m.ai.attack.facing, (m.def.attack.halfAngleDeg * Math.PI) / 180); ctx.stroke();
      }
    }
  }

  #drawOverlay(dt) {
    const o = this.octx, sc = this.oScale ?? 1, ox = this.ox, oy = this.oy;
    o.setTransform(1, 0, 0, 1, 0, 0);
    o.clearRect(0, 0, this.overlay.width, this.overlay.height);
    o.textAlign = 'center'; o.textBaseline = 'middle';
    const font = (px) => `${Math.round(px)}px "Silkscreen", "Courier New", monospace`;
    o.lineJoin = 'round';
    for (const t of this.texts) {
      t.t += dt;
      const pr = t.t / t.dur, rise = 10 * pr + (pr < 0.15 ? -4 * (0.15 - pr) * 10 : 0);
      o.globalAlpha = clamp(1.4 - pr * 1.4, 0, 1);
      o.font = font(7 * sc * t.size * (pr < 0.12 ? 1.25 : 1));
      const x = (t.x - ox) * sc, y = (t.y - oy - rise) * sc;
      o.lineWidth = Math.max(2, sc * 1.1); o.strokeStyle = '#120a18'; o.strokeText(t.text, x, y);
      o.fillStyle = t.color; o.fillText(t.text, x, y);
    }
    o.globalAlpha = 1;
    this.texts = this.texts.filter((t) => t.t < t.dur);
    const s = this.sim;
    for (const m of s.monsters) {
      if (m.ai.state === AI.ALERT) {
        o.font = font(10 * sc); o.lineWidth = Math.max(2, sc); o.strokeStyle = '#120a18';
        const x = (m.x - ox) * sc, y = (m.y - oy - 22 - Math.abs(Math.sin(this.time * 10)) * 2) * sc;
        o.strokeText('!', x, y); o.fillStyle = '#ffd24a'; o.fillText('!', x, y);
      }
    }
    if (this.settings.debug) {
      o.font = `${Math.round(4.2 * sc)}px "IBM Plex Mono", monospace`;
      for (const e of s.entities.values()) {
        if (e.kind === 'monster' && e.ai.state === AI.DEAD) continue;
        const label = e.kind === 'monster' ? `${e.ai.state} · ${s.combatState(e)}` : `${e.life.state} · ${s.combatState(e)}`;
        const x = (e.x - ox) * sc, y = (e.y - oy + 14) * sc;
        o.lineWidth = 3; o.strokeStyle = '#000'; o.strokeText(label, x, y); o.fillStyle = '#b8ffcf'; o.fillText(label, x, y);
      }
    }
  }
}
