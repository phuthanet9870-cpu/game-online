/**
 * Client entry: screen flow, transport selection, input, render loop.
 */
import { PROTOCOL_VERSION, BTN, type ServerMessage } from '../shared/protocol.ts';
import { SERVER_CONFIG } from '../shared/config/server.ts';
import { GameClient } from './game.ts';
import { ClickController } from './clickmove.ts';
import { LocalTransport, WsTransport, clearLocalSave, type Transport } from './net.ts';
import { Renderer } from './render/renderer.ts';
import { Hud } from './ui/hud.ts';
import { charCreateScreen, charSelectScreen, loginScreen, showError, titleScreen } from './ui/screens.ts';
import { clear, confirmBox, h, messageBox } from './ui/dom.ts';

declare const __BUILD_MODE__: string | undefined;
const MODE = typeof __BUILD_MODE__ === 'string' ? __BUILD_MODE__ : 'artifact';

const app = document.getElementById('app')!;
const ss = {
  get: (k: string) => { try { return sessionStorage.getItem(k); } catch { return null; } },
  set: (k: string, v: string) => { try { sessionStorage.setItem(k, v); } catch { /* ignore */ } },
};

let net: Transport | null = null;
let game: GameClient | null = null;
let hud: Hud | null = null;
let renderer: Renderer | null = null;
let screen: 'title' | 'login' | 'select' | 'create' | 'game' = 'title';
let token: string | null = null;
let lastChar: string | null = ss.get('tpew.lastChar');
let reconnecting = false;
let latency = 0;

function makeTransport(): Transport {
  if (MODE === 'online') {
    const proto = location.protocol === 'https:' ? 'wss' : 'ws';
    return new WsTransport(`${proto}://${location.host}/ws`);
  }
  return new LocalTransport();
}

async function connect(resume = false) {
  const t = makeTransport();
  t.latencyMs = latency;
  net = t;
  if (game) game.net = t;
  t.onMessage = route;
  t.onClose = (reason) => onDisconnected(reason);
  if (t instanceof LocalTransport) await t.start();
  t.send({ t: 'hello', v: PROTOCOL_VERSION });
  if (resume && token) t.send({ t: 'resume', token });
  else showLogin();
}

function showLogin() {
  screen = 'login';
  loginScreen(app, {
    onLogin: (user, pass) => net?.send({ t: 'login', user, pass }),
    onRegister: (user, pass) => net?.send({ t: 'register', user, pass }),
  });
}

function onDisconnected(reason: string) {
  if (reconnecting) return;
  reconnecting = true;
  const overlay = h('div', { class: 'overlay' }, h('div', { class: 'panel narrow' }, h('h2', {}, 'การเชื่อมต่อหลุด'), h('p', {}, reason), h('p', { class: 'dim' }, 'กำลังเชื่อมต่อใหม่...')));
  document.body.append(overlay);
  let attempt = 0;
  const retry = () => {
    attempt++;
    connect(true).then(() => { reconnecting = false; overlay.remove(); }).catch(() => setTimeout(retry, Math.min(8000, 1000 * attempt)));
  };
  setTimeout(retry, 800);
}

function onMessage(m: ServerMessage) {
  game?.handle(m);
  hud?.handle(m);
  switch (m.t) {
    case 'error':
      if (screen !== 'game') showError(m.msg);
      if (m.code === 'bad_token') { token = null; showLogin(); }
      if (m.code === 'kicked' || m.code === 'logged_in_elsewhere' || m.code === 'banned') messageBox(m.msg);
      break;
    case 'auth_ok':
      token = m.token;
      if (reconnecting && lastChar) net!.send({ t: 'char_select', id: lastChar });
      else net!.send({ t: 'char_list' });
      break;
    case 'char_list':
      if (!m.chars.length) { showCreate(false); break; }
      screen = 'select';
      teardownGame();
      charSelectScreen(app, m.chars, m.max, {
        onPlay: (id) => { lastChar = id; ss.set('tpew.lastChar', id); net!.send({ t: 'char_select', id }); },
        onCreate: () => showCreate(true),
      });
      break;
    case 'enter_zone':
      if (screen !== 'game') startGame();
      break;
    case 'logged_out':
      teardownGame();
      break;
    default: break;
  }
}

function showCreate(canBack: boolean) {
  screen = 'create';
  charCreateScreen(app, {
    onCreate: (name, appearance, weapon) => net!.send({ t: 'char_create', name, app: appearance, weapon }),
    onBack: canBack ? () => net!.send({ t: 'char_list' }) : undefined,
  });
}

// ---------------------------------------------------------------- game
const keys = new Set<string>();
let mouse = { x: 0, y: 0, l: false, r: false, overUi: false, holdMove: false };
let click: ClickController | null = null;
let holdRepathAt = 0;
let raf = 0;
let pingTimer: ReturnType<typeof setInterval> | null = null;

function teardownGame() {
  cancelAnimationFrame(raf);
  if (pingTimer) clearInterval(pingTimer);
  game = null; hud = null; renderer = null; click = null;
}

function startGame() {
  screen = 'game';
  clear(app);
  const view = h('canvas', { class: 'view' });
  const overlay = h('canvas', { class: 'overlay-c' });
  app.append(view, overlay);
  renderer = new Renderer(view, overlay);
  const g = new GameClient(net!);
  game = g;
  click = new ClickController(g);
  hud = new Hud(app, g, renderer, () => { void confirmBox('กลับไปหน้าเลือกตัวละคร?', 'ออก').then((ok) => ok && net?.send({ t: 'logout' })); }, onSkillButton);
  hud.addChat('[System] กด H เพื่อดูปุ่มควบคุม', 'system');
  // replay the enter_zone we just received into the fresh client
  pendingEnter && g.handle(pendingEnter);
  pingTimer = setInterval(() => net?.send({ t: 'ping', c: performance.now() }), 2000);
  let last = performance.now();
  const loop = (now: number) => {
    raf = requestAnimationFrame(loop);
    if (!game || !renderer || !hud) return;
    const dt = Math.min(100, now - last);
    last = now;
    sampleInput();
    const alpha = game.update(dt);
    renderer.render(game, alpha, now);
    hud.update();
  };
  raf = requestAnimationFrame(loop);
}

/** Latest enter_zone, so a freshly created GameClient can apply it. */
let pendingEnter: ServerMessage | null = null;

function sampleInput() {
  const g = game!, r = renderer!, c = click!;
  const typing = document.activeElement instanceof HTMLInputElement || document.activeElement instanceof HTMLSelectElement;
  let sx = 0, sy = 0;
  if (!typing) {
    if (keys.has('KeyW') || keys.has('ArrowUp')) sy -= 1;
    if (keys.has('KeyS') || keys.has('ArrowDown')) sy += 1;
    if (keys.has('KeyA') || keys.has('ArrowLeft')) sx -= 1;
    if (keys.has('KeyD') || keys.has('ArrowRight')) sx += 1;
  }
  // screen direction -> world direction (iso): screen right = (+1,-1), screen down = (+1,+1)
  let mx = sx + sy, my = sy - sx;
  const l = Math.hypot(mx, my);
  if (l > 0) { mx /= l; my /= l; c.order = null; g.targetId = null; } // keyboard movement overrides click orders
  const me = g.selfRenderPos(0);
  const w = r.screenToWorld(mouse.x, mouse.y);
  // holding the left button on the ground keeps walking toward the cursor
  if (mouse.l && mouse.holdMove && !mouse.overUi && performance.now() > holdRepathAt) {
    holdRepathAt = performance.now() + 150;
    c.moveTo(w.x, w.y, false);
  }
  let b = 0;
  if (!typing) {
    if (mouse.r && !mouse.overUi) b |= BTN.HEAVY;
    if (keys.has('Space')) b |= BTN.DODGE;
    if (keys.has('ShiftLeft') || keys.has('ShiftRight')) b |= BTN.BLOCK;
    if (keys.has('Digit1')) b |= BTN.SKILL1;
    if (keys.has('Digit2')) b |= BTN.SKILL2;
    if (keys.has('Digit3')) b |= BTN.SKILL3;
  }
  const co = c.tick();
  if (co.interact !== null) doInteract(co.interact);
  // aim: the selected target when there is one, otherwise the cursor
  const tgt = g.targetId !== null ? g.ents.get(g.targetId) : undefined;
  const aimX = co.aimX ?? (tgt ? tgt.x - g.ms.x : w.x - me.x);
  const aimY = co.aimY ?? (tgt ? tgt.y - g.ms.y : w.y - me.y);
  g.input = { mx: l > 0 ? mx : co.mx, my: l > 0 ? my : co.my, aimX, aimY, buttons: b | co.buttons };
  // hover + nearest interactable (for the F key)
  const hover = mouse.overUi ? null : r.pick(g, mouse.x, mouse.y);
  let inter: number | null = null, idist = Infinity;
  for (const e of g.ents.values()) {
    if (e.meta.k === 3 || e.meta.k === 4 || (e.meta.k === 5 && e.meta.ready)) {
      const range = e.meta.k === 4 ? SERVER_CONFIG.npcRange : e.meta.k === 3 ? SERVER_CONFIG.pickupRange : SERVER_CONFIG.gatherRange;
      const pd = Math.hypot(e.x - g.ms.x, e.y - g.ms.y);
      if (pd <= range && pd < idist) { idist = pd; inter = e.id; }
    }
  }
  r.hoverId = hover;
  r.interactId = inter;
  document.body.style.cursor = hover !== null ? (g.ents.get(hover)?.meta.k === 2 ? 'crosshair' : 'pointer') : '';
}

function doInteract(id: number) {
  const g = game;
  const e = g?.ents.get(id);
  if (!g || !e) return;
  if (e.meta.k === 3) g.send({ t: 'pickup', id: e.id });
  else if (e.meta.k === 4) g.send({ t: 'talk', id: e.id });
  else if (e.meta.k === 5) g.send({ t: 'gather', id: e.id });
}

/** Skill bar clicks: same effect as the hotkeys. */
function onSkillButton(id: string) {
  const g = game, c = click;
  if (!g || !c) return;
  const w = g.weapon;
  if (id === 'pot_hp') return usePotion('pot_hp_small');
  if (id === 'pot_en') return usePotion('pot_energy_small');
  if (id === 'dodge') return c.press(BTN.DODGE, 120);
  if (id === 'block') return c.press(BTN.BLOCK, 700);
  if (!w) return;
  if (id === w.normal.id) return c.press(BTN.ATTACK);
  if (id === w.heavy.id) return c.press(BTN.HEAVY);
  const i = w.skills.findIndex((s) => s.id === id);
  if (i >= 0) c.press([BTN.SKILL1, BTN.SKILL2, BTN.SKILL3][i]);
}

function interact() {
  if (renderer?.interactId != null) doInteract(renderer.interactId);
}

function usePotion(defId: string) {
  const g = game;
  if (!g) return;
  const it = g.items.find((i) => i.defId === defId && i.slot !== null);
  if (it) g.send({ t: 'use', uid: it.uid });
  else hud?.notice('ไม่มียานี้ในกระเป๋า (ซื้อได้ที่ร้านค้าในเมือง)', 'warn');
}

window.addEventListener('keydown', (e) => {
  if (screen !== 'game') return;
  if (document.activeElement instanceof HTMLInputElement || document.activeElement instanceof HTMLSelectElement) return;
  keys.add(e.code);
  if (['Space', 'Tab'].includes(e.code)) e.preventDefault();
  if (e.repeat) return;
  switch (e.code) {
    case 'KeyF': interact(); break;
    case 'KeyI': hud?.toggle('inv'); break;
    case 'KeyC': hud?.toggle('char'); break;
    case 'KeyH': hud?.toggle('help'); break;
    case 'Digit4': usePotion('pot_hp_small'); break;
    case 'Digit5': usePotion('pot_energy_small'); break;
    case 'Escape': hud?.closeAll(); break;
    case 'Enter': hud?.chatInput.focus(); e.preventDefault(); break;
  }
});
window.addEventListener('keyup', (e) => keys.delete(e.code));
window.addEventListener('blur', () => { keys.clear(); mouse.l = mouse.r = false; });
window.addEventListener('mousemove', (e) => {
  mouse.x = e.clientX; mouse.y = e.clientY;
  mouse.overUi = !(e.target instanceof HTMLCanvasElement);
});
window.addEventListener('mousedown', (e) => {
  if (screen !== 'game' || !(e.target instanceof HTMLCanvasElement)) return;
  (document.activeElement as HTMLElement | null)?.blur?.();
  mouse.x = e.clientX; mouse.y = e.clientY; mouse.overUi = false;
  if (e.button === 2) { mouse.r = true; return; }
  if (e.button !== 0 || !game || !renderer || !click) return;
  mouse.l = true;
  mouse.holdMove = false;
  const id = renderer.pick(game, e.clientX, e.clientY);
  const ent = id !== null ? game.ents.get(id) : undefined;
  if (ent && ent.meta.k === 2) click.attack(ent.id);                 // monster: walk into range and auto-attack
  else if (ent && ent.meta.k !== 1) click.interact(ent.id);          // NPC / item / resource: walk over and use
  else {                                                             // ground: walk there (hold to keep following the cursor)
    const w = renderer.screenToWorld(e.clientX, e.clientY);
    click.moveTo(w.x, w.y);
    mouse.holdMove = true;
    holdRepathAt = performance.now() + 250;
  }
});
window.addEventListener('mouseup', (e) => { if (e.button === 0) { mouse.l = false; mouse.holdMove = false; } if (e.button === 2) mouse.r = false; });
window.addEventListener('contextmenu', (e) => { if (screen === 'game') e.preventDefault(); });
window.addEventListener('resize', () => renderer?.resize());

function route(m: ServerMessage) {
  if (m.t === 'enter_zone') pendingEnter = m;
  onMessage(m);
}
function boot() {
  titleScreen(app, {
    mode: MODE === 'online' ? 'online' : 'local',
    onStart: (lat) => {
      latency = lat;
      connect(false).catch((e) => { messageBox('เริ่มเซิร์ฟเวอร์ไม่สำเร็จ: ' + e); });
    },
    onReset: () => { clearLocalSave(); location.reload(); },
  });
}
boot();

// Read-only hook for automated tests (exposes client view state, grants no authority).
(window as unknown as { __tpew: () => unknown }).__tpew = () => game && { zone: game.zone?.id, self: game.self, char: game.char, players: [...game.ents.values()].filter((e) => e.meta.k === 1).map((e) => ('name' in e.meta ? e.meta.name : '')), monsters: [...game.ents.values()].filter((e) => e.meta.k === 2).length,
  pos: { x: game.ms.x, y: game.ms.y },
  items: game.items.map((i) => i.defId),
  nearestScreen: (k: number) => {
    if (!renderer || !game) return null;
    let best: { x: number; y: number } | null = null, bd = Infinity;
    for (const e of game.ents.values()) {
      if (e.meta.k !== k || e.dead || (k <= 2 && !e.snaps.length)) continue;
      const d = Math.hypot(e.x - game.ms.x, e.y - game.ms.y);
      if (d < bd) { bd = d; best = { x: ((e.x - e.y) * 16 - renderer.camX) * renderer.scale, y: ((e.x + e.y) * 8 - renderer.camY - 6) * renderer.scale }; }
    }
    return best && { ...best, dist: bd };
  },
  nearestMonsterScreen: (() => {
    if (!renderer) return null;
    let best: { x: number; y: number } | null = null, bd = Infinity;
    for (const e of game.ents.values()) {
      if (e.meta.k !== 2 || e.dead || !e.snaps.length) continue;
      const d = Math.hypot(e.x - game.ms.x, e.y - game.ms.y);
      if (d < bd) { bd = d; best = { x: ((e.x - e.y) * 16 - renderer.camX) * renderer.scale, y: ((e.x + e.y) * 8 - renderer.camY - 6) * renderer.scale }; }
    }
    return best && { ...best, dist: bd };
  })() };
