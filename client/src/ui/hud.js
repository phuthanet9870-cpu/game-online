// DOM HUD. Displays simulation state; clicking a slot only sends an intent.
import { HOTBAR } from './hotbar.js';
import { DASH_ID } from '../core/simulation.js';
import { AI } from '../core/monsterAI.js';
import { CharState } from '../core/stateMachine.js';

const REJECT_TEXT = {
  COOLDOWN: (r) => `ยังติดคูลดาวน์ ${r.remaining?.toFixed(1)}s`,
  NO_STAMINA: () => 'Stamina ไม่พอ',
  STUNNED: () => 'ติดสตัน ใช้สกิลไม่ได้',
  DEAD: () => 'ตัวละครเสียชีวิต',
  NOT_IMPLEMENTED: () => 'ยังไม่เปิดใน Phase นี้',
  NOT_EQUIPPED: () => 'สกิลนี้ไม่ใช่ของอาวุธที่ถือ',
};

// ---- 16×16 pixel icons drawn once ----
function icon(kind) {
  const c = document.createElement('canvas'); c.width = 16; c.height = 16;
  const x = c.getContext('2d');
  const r = (a, b, w, h, col) => { x.fillStyle = col; x.fillRect(a, b, w, h); };
  const steel = '#dfe7f2', gold = '#e0b04a', dark = '#171020';
  const sword = (ox = 0, oy = 0) => { for (let i = 0; i < 9; i++) { r(3 + i + ox, 12 - i + oy, 2, 1, steel); } r(3 + ox, 12 + oy, 1, 2, gold); r(2 + ox, 11 + oy, 3, 1, gold); };
  switch (kind) {
    case 'basic': sword(1, -1); break;
    case 'triple': for (let k = 0; k < 3; k++) { for (let i = 0; i < 10; i++) r(2 + i, 3 + k * 4 + Math.round(Math.sin(i / 3) * 1.5), 1, 1, k === 2 ? '#ffffff' : '#9fc3ff'); } break;
    case 'guardbreak': for (let i = 0; i < 9; i++) r(7, 1 + i, 2, 1, steel); r(5, 9, 6, 1, gold); r(7, 10, 2, 2, gold);
      r(2, 13, 3, 1, '#ffb04a'); r(11, 13, 3, 1, '#ffb04a'); r(5, 14, 6, 1, '#ffb04a'); r(1, 11, 1, 1, '#ffb04a'); r(14, 11, 1, 1, '#ffb04a'); break;
    case 'counter': r(3, 3, 8, 9, '#3d6c8f'); r(4, 4, 6, 7, '#7ff3ff'); r(5, 12, 4, 2, '#3d6c8f'); r(6, 5, 2, 5, dark);
      r(11, 2, 3, 1, '#ffffff'); r(13, 3, 1, 3, '#ffffff'); r(12, 5, 1, 1, '#ffffff'); break;
    case 'dash': r(7, 6, 5, 6, '#c58b68'); r(7, 11, 7, 2, '#5b3a22'); r(1, 6, 4, 1, '#9fc3ff'); r(0, 9, 5, 1, '#9fc3ff'); r(2, 12, 3, 1, '#9fc3ff'); break;
    case 'lock': r(5, 3, 6, 1, '#6d6380'); r(4, 4, 1, 4, '#6d6380'); r(11, 4, 1, 4, '#6d6380'); r(3, 8, 10, 6, '#6d6380'); r(7, 10, 2, 2, dark); break;
  }
  return c.toDataURL();
}

export class Hud {
  constructor(root, sim, { onSlot }) {
    this.root = root; this.sim = sim; this.onSlot = onSlot;
    this.$ = (sel) => root.querySelector(sel);
    this.log = []; this.toastUntil = 0; this.lastDebug = 0; this.lastTrace = null; this.logVisible = true;
    this.#buildHotbar();
  }

  #buildHotbar() {
    const bar = this.$('#hotbar');
    const icons = {};
    bar.innerHTML = '';
    this.slots = HOTBAR.map((def) => {
      const el = document.createElement('button');
      el.type = 'button'; el.className = 'slot' + (def.locked ? ' locked' : '');
      el.id = `slot-${def.slot}`;
      const ic = def.locked ? 'lock' : def.icon;
      icons[ic] ??= icon(ic);
      const skill = def.action?.type === 'skill' ? this.sim.reg.skills[def.action.skillId] : null;
      const cost = skill ? skill.staminaCost : def.action?.type === 'dash' ? this.sim.cfg.dash.staminaCost : 0;
      el.innerHTML = `<span class="key">${def.key}</span><img alt="" src="${icons[ic]}"><span class="cd"></span><span class="cdt"></span>${cost ? `<span class="cost">${cost}</span>` : ''}${def.locked ? `<span class="lk">${def.locked.replace('Phase ', 'P')}</span>` : ''}`;
      const tip = def.locked ? `${def.label} — เปิดใน ${def.locked}` : `${def.label}${skill?.description ? ' — ' + skill.description : ''}${cost ? ` (Stamina ${cost})` : ''}${skill?.cooldown ? ` · CD ${skill.cooldown}s` : ''} · ปุ่ม ${def.key}${def.alt ? ' / ' + def.alt : ''}`;
      el.title = tip; el.setAttribute('aria-label', tip);
      if (def.locked) el.setAttribute('aria-disabled', 'true');
      el.addEventListener('click', () => { if (!def.locked) this.onSlot(def.slot); });
      return { def, el, cd: el.querySelector('.cd'), cdt: el.querySelector('.cdt'), skill, cost };
    });
    for (const s of this.slots) bar.appendChild(s.el);
  }

  toast(text) {
    const t = this.$('#toast'); t.textContent = text; t.hidden = false; this.toastUntil = performance.now() + 1100;
  }

  pushLog(html, cls = '') {
    this.log.push(`<li class="${cls}">${html}</li>`);
    if (this.log.length > 7) this.log.shift();
    this.$('#log').innerHTML = this.log.join('');
  }

  onEvent(ev) {
    const s = this.sim, pid = s.player.id;
    switch (ev.type) {
      case 'action_rejected': if (ev.reason !== 'BUSY' && REJECT_TEXT[ev.reason]) this.toast(REJECT_TEXT[ev.reason](ev)); break;
      case 'damage':
        if (ev.targetId === pid) this.pushLog(`<b>${ev.attackerName}</b> → คุณ <em>${ev.amount}</em>${ev.crit ? ' CRIT' : ''} <small>${ev.source}</small>`, 'in');
        else { this.pushLog(`${ev.source} → ${ev.targetName} <em>${ev.amount}</em>${ev.crit ? ' CRIT' : ''}`, 'out'); this.lastTrace = ev; this.targetId = ev.targetId; }
        break;
      case 'countered': this.pushLog('Counter Slash ป้องกันการโจมตีสำเร็จ', 'good'); break;
      case 'status_applied': if (ev.targetId !== pid) this.pushLog(`${ev.status} ${ev.duration.toFixed(1)}s`, 'out'); break;
      case 'status_resisted': this.pushLog(`${ev.status} ถูกต้านทาน (diminishing returns)`, 'muted'); break;
      case 'death': this.pushLog(`${ev.targetName} ถูกกำจัด — เกิดใหม่ใน ${s.reg.monsters['MON-0001'].respawnTime}s`, 'good'); break;
      case 'player_death': this.pushLog(`คุณพ่ายแพ้ให้ ${ev.killer}`, 'in'); this.#showDeath(); break;
      case 'respawned': this.pushLog('เกิดใหม่ที่จุดเกิด (Spawn Protection 2s)', 'muted'); break;
      case 'monster_respawn': this.pushLog('Ashfang Wolf เกิดใหม่ที่จุด spawn', 'muted'); break;
    }
  }

  #showDeath() {
    const p = this.sim.player, r = p.deathRecap;
    const rows = r.hits.map((h) => `<tr><td>-${(r.time - h.time).toFixed(1)}s</td><td>${h.attacker}</td><td>${h.source}</td><td class="num">${h.amount}${h.crit ? '!' : ''}</td><td class="num">${h.hpAfter}</td></tr>`).join('');
    this.$('#deathRecap').innerHTML = `<thead><tr><th>เวลา</th><th>ผู้โจมตี</th><th>ที่มา</th><th class="num">ดาเมจ</th><th class="num">HP เหลือ</th></tr></thead><tbody>${rows || '<tr><td colspan="5">ไม่มีข้อมูล</td></tr>'}</tbody>`;
    this.$('#deathKiller').textContent = `${r.killer} · ${r.source}`;
    this.$('#death').hidden = false;
  }

  update(fps) {
    const s = this.sim, p = s.player, now = performance.now();
    // player frame
    const hpR = p.health.ratio, stR = p.stamina.value / p.stamina.max;
    this.$('#hpFill').style.transform = `scaleX(${hpR})`;
    this.$('#hpText').textContent = `${Math.ceil(p.health.hp)} / ${p.health.max}`;
    this.$('#stFill').style.transform = `scaleX(${stR})`;
    this.$('#stText').textContent = `${Math.floor(p.stamina.value)} / ${p.stamina.max}`;
    const life = this.$('#lifeState');
    life.textContent = p.life.state.replace('_', ' ');
    life.dataset.state = p.life.state;
    this.$('#pStatus').innerHTML = p.statuses.list().map((st) => `<span class="chip ${st.category.toLowerCase()}">${st.name} ${st.remaining.toFixed(1)}</span>`).join('');
    this.$('#kills').textContent = s.stats.kills;
    this.$('#deaths').textContent = s.stats.deaths;

    // target frame (last monster hit, still alive)
    const t = this.targetId ? s.entities.get(this.targetId) : null;
    const tf = this.$('#target');
    if (t && t.ai.state !== AI.DEAD) {
      tf.hidden = false;
      this.$('#tName').textContent = `${t.name} · Lv ${t.def.level}`;
      this.$('#tFill').style.transform = `scaleX(${t.health.ratio})`;
      this.$('#tText').textContent = `${Math.ceil(t.health.hp)} / ${t.health.max}`;
      this.$('#tStatus').innerHTML = t.statuses.list().map((st) => `<span class="chip ${st.category.toLowerCase()}">${st.name}</span>`).join('') + (t.ai.state === AI.RESET ? '<span class="chip buff">EVADE (reset)</span>' : '');
    } else tf.hidden = true;

    // hotbar
    const alive = p.life.alive;
    for (const sl of this.slots) {
      if (sl.def.locked) continue;
      const id = sl.def.action.type === 'dash' ? DASH_ID : sl.def.action.skillId;
      const total = sl.def.action.type === 'dash' ? s.cfg.dash.cooldown : sl.skill.cooldown;
      const rem = p.cooldowns.get(id) ?? 0;
      sl.cd.style.setProperty('--p', total > 0 ? String(rem / total) : '0');
      sl.cdt.textContent = rem > 0.05 && total >= 1 ? rem.toFixed(rem < 1 ? 1 : 0) : '';
      const noSt = !p.stamina.canSpend(sl.cost);
      sl.el.classList.toggle('nost', noSt);
      sl.el.classList.toggle('off', !alive || p.statuses.stunned);
      const activeNow = (p.action && p.action.skill.skill_id === id) || (id === DASH_ID && p.dash);
      sl.el.classList.toggle('active', !!activeNow);
    }
    if (this.toastUntil && now > this.toastUntil) { this.$('#toast').hidden = true; this.toastUntil = 0; }

    // death overlay countdown
    const death = this.$('#death');
    if (!death.hidden) {
      if (p.life.state === CharState.DEAD) this.$('#respawnIn').textContent = Math.max(0, s.cfg.player.respawnDelay - p.life.timeInState).toFixed(1);
      else death.hidden = true;
    }

    // debug panel (10 Hz)
    if (now - this.lastDebug > 100 && !this.$('#debugPanel').hidden) {
      this.lastDebug = now;
      const mons = s.monsters.map((m) => `<tr><td>${m.id.slice(-3)}</td><td>${m.ai.state}</td><td>${s.combatState(m)}</td><td class="num">${Math.ceil(m.health.hp)}</td><td class="num">${Math.round(Math.hypot(m.x - p.x, m.y - p.y))}</td></tr>`).join('');
      const tr = this.lastTrace ? this.lastTrace.trace.map(([k, v]) => `<span>${k} <b>${typeof v === 'number' ? (Number.isInteger(v) ? v : v.toFixed(1)) : v}</b></span>`).join('<i>→</i>') : '—';
      const cds = [...p.cooldowns].map(([k, v]) => `${k.replace('SKL-WPN-', '')} ${v.toFixed(1)}`).join(', ') || '—';
      this.$('#debugBody').innerHTML = `
        <dl>
          <dt>FPS</dt><dd>${fps.toFixed(0)}</dd><dt>Tick</dt><dd>${s.tick} (${s.cfg.tickRate} Hz)</dd>
          <dt>Pos</dt><dd>${p.x.toFixed(1)}, ${p.y.toFixed(1)} · tile ${Math.floor(p.x / 16)},${Math.floor(p.y / 16)}</dd>
          <dt>Life</dt><dd>${p.life.state}</dd><dt>Combat</dt><dd>${s.combatState(p)}</dd>
          <dt>Cooldowns</dt><dd>${cds}</dd>
          <dt>Map</dt><dd>${s.map.id} (non-core)</dd>
        </dl>
        <table><thead><tr><th>MON</th><th>AI</th><th>Combat</th><th class="num">HP</th><th class="num">Dist</th></tr></thead><tbody>${mons}</tbody></table>
        <p class="trace"><b>Damage trace</b> ${tr}</p>`;
    }
  }
}
