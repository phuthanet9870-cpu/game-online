// Browser entry: wires Input → Simulation (intents) → Renderer/HUD/Audio (events).
import { Simulation, DASH_ID } from './core/simulation.js';
import { Renderer, VIEW_W, VIEW_H } from './render/renderer.js';
import { Hud } from './ui/hud.js';
import { HOTBAR } from './ui/hotbar.js';
import { Input } from './ui/input.js';
import { Sfx } from './ui/audio.js';

export const BUILD = { version: '0.1.0-phase1', phase: 1 };
const BUFFER_WINDOW = 0.2; // seconds an action press waits for the current action's cancel window

function boot(hot = {}) {
  const $ = (s) => document.querySelector(s);
  const sim = new Simulation();
  const reduced = (() => { try { return matchMedia('(prefers-reduced-motion: reduce)').matches; } catch { return false; } })();
  const settings = { debug: false, reducedMotion: reduced, muted: false, ...(hot.settings ?? {}) };
  const canvas = $('#game'), overlay = $('#overlay'), stage = $('#stage');
  const renderer = new Renderer(canvas, overlay, sim, settings);
  const input = new Input(window);
  const sfx = new Sfx(); sfx.muted = settings.muted;
  let running = false, paused = false, buffered = null, mouseHeld = false, mouseAim = null;

  const slotDef = (n) => HOTBAR.find((h) => h.slot === n);
  const pid = sim.player.id;

  /** Client-side prediction for UX only (hold-to-repeat / buffering). The simulation still validates. */
  const wouldAccept = (n) => {
    const p = sim.player, d = slotDef(n);
    if (!d?.action || !p.life.alive || p.statuses.stunned || p.dash) return false;
    if (p.action && p.action.t < p.action.skill.cancelableAfter) return false;
    const id = d.action.type === 'dash' ? DASH_ID : d.action.skillId;
    return !(p.cooldowns.get(id) > 0);
  };
  const trigger = (n, aimAngle, { silent = false } = {}) => {
    const d = slotDef(n);
    if (!d?.action || !running || paused) return;
    if (silent && !wouldAccept(n)) return;
    const req = d.action.type === 'dash' ? { type: 'dash' } : { type: 'skill', skillId: d.action.skillId, aimAngle };
    const res = sim.requestAction(pid, req);
    if (!res.ok && res.reason === 'BUSY') buffered = { n, aimAngle, until: sim.time + BUFFER_WINDOW };
    else if (res.ok) buffered = null;
  };

  const hud = new Hud(document.body, sim, { onSlot: (n) => { sfx.unlock(); trigger(n); } });
  const setDebug = (v) => { settings.debug = v; $('#debugPanel').hidden = !v; $('#btnDebug').setAttribute('aria-pressed', String(v)); };
  const setMute = (v) => { settings.muted = v; sfx.muted = v; $('#btnSound').setAttribute('aria-pressed', String(!v)); $('#btnSound').textContent = v ? 'เสียง: ปิด' : 'เสียง: เปิด'; };
  const setPause = (v) => { if (!running) return; paused = v; $('#pause').hidden = !v; $('#btnPause').setAttribute('aria-pressed', String(v)); };
  const setLog = (v) => { $('#log').hidden = !v; };
  setDebug(settings.debug); setMute(settings.muted);

  $('#btnDebug').addEventListener('click', () => setDebug(!settings.debug));
  $('#btnSound').addEventListener('click', () => { sfx.unlock(); setMute(!settings.muted); });
  $('#btnPause').addEventListener('click', () => setPause(!paused));
  $('#btnResume').addEventListener('click', () => setPause(false));
  const startGame = () => {
    if (running) return;
    running = true; sfx.unlock(); $('#start').hidden = true; stage.focus({ preventScroll: true });
  };
  $('#btnStart').addEventListener('click', startGame);
  window.addEventListener('keydown', (e) => { if (!running && (e.code === 'Enter' || e.code === 'Space')) { e.preventDefault(); startGame(); } });

  // mouse aim: left click = basic attack toward the cursor (hold to keep attacking)
  const aimFromEvent = (e) => {
    const r = canvas.getBoundingClientRect();
    const wx = ((e.clientX - r.left) / r.width) * VIEW_W + renderer.ox, wy = ((e.clientY - r.top) / r.height) * VIEW_H + renderer.oy;
    return Math.atan2(wy - sim.player.y, wx - sim.player.x);
  };
  canvas.addEventListener('pointerdown', (e) => {
    if (e.pointerType !== 'mouse' || e.button !== 0 || !running) return;
    mouseHeld = true; mouseAim = aimFromEvent(e); trigger(1, mouseAim);
  });
  canvas.addEventListener('pointermove', (e) => { if (mouseHeld) mouseAim = aimFromEvent(e); });
  window.addEventListener('pointerup', () => { mouseHeld = false; });
  canvas.addEventListener('contextmenu', (e) => e.preventDefault());

  // touch controls (experimental, Phase 1 test aid only — real mobile UI is a separate work item)
  const pad = $('#stick'), knob = $('#knob');
  let stickId = null;
  const stickMove = (e) => {
    const r = pad.getBoundingClientRect(), cx = r.left + r.width / 2, cy = r.top + r.height / 2;
    let dx = (e.clientX - cx) / (r.width / 2), dy = (e.clientY - cy) / (r.height / 2);
    const len = Math.hypot(dx, dy); if (len > 1) { dx /= len; dy /= len; }
    input.touchMove = { x: Math.abs(dx) > 0.3 ? dx : 0, y: Math.abs(dy) > 0.3 ? dy : 0 };
    knob.style.transform = `translate(${dx * 28}px, ${dy * 28}px)`;
  };
  pad.addEventListener('pointerdown', (e) => { stickId = e.pointerId; pad.setPointerCapture(e.pointerId); stickMove(e); if (!running) startGame(); });
  pad.addEventListener('pointermove', (e) => { if (e.pointerId === stickId) stickMove(e); });
  const stickEnd = (e) => { if (e.pointerId !== stickId) return; stickId = null; input.touchMove = { x: 0, y: 0 }; knob.style.transform = ''; };
  pad.addEventListener('pointerup', stickEnd); pad.addEventListener('pointercancel', stickEnd);
  document.querySelectorAll('[data-slot]').forEach((b) => b.addEventListener('pointerdown', (e) => { e.preventDefault(); if (!running) startGame(); trigger(Number(b.dataset.slot)); }));

  // layout: overlay canvas tracks the stage size for crisp text
  const fit = () => { const r = canvas.getBoundingClientRect(); renderer.resizeOverlay(r.width, r.height, Math.min(2, window.devicePixelRatio || 1)); };
  new ResizeObserver(fit).observe(canvas); fit();

  // hot-update hook (artifact viewer); keeps viewer settings across republishes
  window.claude?.hot?.snapshot?.(() => ({ settings: { debug: settings.debug, muted: settings.muted } }));

  let last = performance.now(), acc = 0, fps = 60, fpsAcc = 0, fpsN = 0;
  function frame(now) {
    const dt = Math.min(0.1, (now - last) / 1000); last = now;
    fpsAcc += dt; fpsN++; if (fpsAcc >= 0.5) { fps = fpsN / fpsAcc; fpsAcc = 0; fpsN = 0; }
    for (const a of input.consume()) {
      if (a === 'debug') setDebug(!settings.debug);
      else if (a === 'pause') setPause(!paused);
      else if (a === 'mute') setMute(!settings.muted);
      else if (a === 'log') setLog($('#log').hidden);
      else if (a.startsWith?.('slot')) trigger(Number(a.slice(4)));
    }
    if (running && !paused) {
      const mv = input.moveVector();
      sim.setMoveInput(pid, mv.x, mv.y);
      if (buffered) { if (sim.time > buffered.until) buffered = null; else if (wouldAccept(buffered.n)) trigger(buffered.n, buffered.aimAngle); }
      if (input.isHeld('slot1')) trigger(1, undefined, { silent: true });
      if (mouseHeld) trigger(1, mouseAim, { silent: true });
      acc += dt;
      let steps = 0;
      while (acc >= sim.dt && steps < 6) { sim.step(); acc -= sim.dt; steps++; }
      if (steps === 6) acc = 0;
      for (const ev of sim.drainEvents()) { renderer.onEvent(ev); hud.onEvent(ev); sfx.play(ev, pid); }
    }
    renderer.render(running && !paused ? dt : 0);
    hud.update(fps);
    requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);

  // read-only handle for automated smoke tests
  window.__TPE = { sim, renderer, settings, build: BUILD, isRunning: () => running, start: startGame };
}

const hot = window.claude?.hot;
if (hot?.ready) hot.ready(boot); else boot(hot?.data ?? {});
