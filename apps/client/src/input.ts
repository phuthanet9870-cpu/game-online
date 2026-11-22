import { store } from './net.js';

export const DEFAULT_BINDS: Record<string, string> = {
  up: 'KeyW', down: 'KeyS', left: 'KeyA', right: 'KeyD',
  a1: 'Digit1', a2: 'Digit2', a3: 'Digit3', a4: 'Digit4', a5: 'Digit5', a6: 'Digit6', a7: 'Digit7', a8: 'Digit8',
  u1: 'KeyR', u2: 'KeyF', u3: 'KeyT', u4: 'KeyG',
  dodge: 'Space', potion: 'KeyQ', interact: 'KeyE', target: 'Tab', pickup: 'KeyZ',
  inventory: 'KeyI', skills: 'KeyK', passives: 'KeyP', character: 'KeyC', quests: 'KeyJ', map: 'KeyM', codex: 'KeyO', social: 'KeyL', guild: 'KeyH', ladder: 'KeyN',
};
export const BIND_LABELS: Record<string, string> = {
  up: 'Move up', down: 'Move down', left: 'Move left', right: 'Move right', a1: 'Active 1', a2: 'Active 2', a3: 'Active 3', a4: 'Active 4', a5: 'Active 5', a6: 'Active 6', a7: 'Active 7', a8: 'Active 8',
  u1: 'Ultimate 1', u2: 'Ultimate 2', u3: 'Ultimate 3', u4: 'Ultimate 4', dodge: 'Dodge roll', potion: 'Potion', interact: 'Interact / talk', target: 'Cycle target (Tab Target)', pickup: 'Pick up nearest item',
  inventory: 'Inventory', skills: 'Skills', passives: 'Passive tree', character: 'Character sheet', quests: 'Quest log', map: 'World map', codex: 'Codex', social: 'Party & social', guild: 'Guild', ladder: 'Leaderboards',
};

export function loadBinds(): Record<string, string> {
  try { return { ...DEFAULT_BINDS, ...JSON.parse(store.get('astra.binds') ?? '{}') }; } catch { return { ...DEFAULT_BINDS }; }
}
export function saveBinds(b: Record<string, string>) { store.set('astra.binds', JSON.stringify(b)); }
export const keyLabel = (code: string) => code.replace(/^Key/, '').replace(/^Digit/, '').replace('Space', 'Space').replace('Arrow', '');

export class Input {
  binds = loadBinds();
  down = new Set<string>();
  mouse = { x: 0, y: 0, left: false };
  joy = { active: false, x: 0, y: 0, id: -1, ox: 0, oy: 0 };
  touchAttack = false;
  onAction: (action: string) => void = () => {};
  enabled = true;
  private byCode = new Map<string, string>();

  constructor(private canvas: HTMLCanvasElement) {
    this.rebuild();
    addEventListener('keydown', (e) => {
      if (!this.enabled || isTyping(e)) return;
      const a = this.byCode.get(e.code);
      if (a) { e.preventDefault(); if (!this.down.has(e.code)) this.onAction(a); }
      if (e.code === 'Escape') this.onAction('escape');
      if (e.code === 'Enter') { e.preventDefault(); this.onAction('chat'); }
      this.down.add(e.code);
    });
    addEventListener('keyup', (e) => this.down.delete(e.code));
    addEventListener('blur', () => { this.down.clear(); this.mouse.left = false; });
    canvas.addEventListener('mousemove', (e) => { this.mouse.x = e.offsetX; this.mouse.y = e.offsetY; });
    canvas.addEventListener('mousedown', (e) => { if (e.button === 0) { this.mouse.left = true; this.onAction('click'); } if (e.button === 2) this.onAction('rclick'); });
    addEventListener('mouseup', (e) => { if (e.button === 0) this.mouse.left = false; });
    canvas.addEventListener('contextmenu', (e) => e.preventDefault());
  }

  rebuild() { this.byCode.clear(); for (const [a, c] of Object.entries(this.binds)) this.byCode.set(c, a); }

  moveVector(): [number, number] {
    if (this.joy.active) { const l = Math.hypot(this.joy.x, this.joy.y); return l > 0.15 ? [this.joy.x / Math.max(1, l), this.joy.y / Math.max(1, l)] : [0, 0]; }
    let x = 0, y = 0;
    const b = this.binds;
    if (this.down.has(b.up!) || this.down.has('ArrowUp')) y -= 1;
    if (this.down.has(b.down!) || this.down.has('ArrowDown')) y += 1;
    if (this.down.has(b.left!) || this.down.has('ArrowLeft')) x -= 1;
    if (this.down.has(b.right!) || this.down.has('ArrowRight')) x += 1;
    const l = Math.hypot(x, y);
    return l ? [x / l, y / l] : [0, 0];
  }

  /** Virtual joystick on the left half of the screen for touch devices. */
  attachTouch(joyEl: HTMLElement, knob: HTMLElement) {
    const start = (e: TouchEvent) => {
      for (const t of Array.from(e.changedTouches)) {
        if (t.clientX > innerWidth * 0.45 || this.joy.active) continue;
        this.joy = { active: true, x: 0, y: 0, id: t.identifier, ox: t.clientX, oy: t.clientY };
        joyEl.style.display = 'block'; joyEl.style.left = t.clientX - 60 + 'px'; joyEl.style.top = t.clientY - 60 + 'px';
        e.preventDefault();
      }
    };
    const move = (e: TouchEvent) => {
      for (const t of Array.from(e.changedTouches)) {
        if (t.identifier !== this.joy.id) continue;
        const dx = (t.clientX - this.joy.ox) / 50, dy = (t.clientY - this.joy.oy) / 50;
        const l = Math.hypot(dx, dy);
        this.joy.x = l > 1 ? dx / l : dx; this.joy.y = l > 1 ? dy / l : dy;
        knob.style.transform = `translate(${this.joy.x * 40}px, ${this.joy.y * 40}px)`;
        e.preventDefault();
      }
    };
    const end = (e: TouchEvent) => { for (const t of Array.from(e.changedTouches)) if (t.identifier === this.joy.id) { this.joy.active = false; this.joy.x = this.joy.y = 0; joyEl.style.display = 'none'; knob.style.transform = ''; } };
    this.canvas.addEventListener('touchstart', start, { passive: false });
    this.canvas.addEventListener('touchmove', move, { passive: false });
    this.canvas.addEventListener('touchend', end);
    this.canvas.addEventListener('touchcancel', end);
  }
}

const isTyping = (e: KeyboardEvent) => { const t = e.target as HTMLElement; return t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.isContentEditable); };
