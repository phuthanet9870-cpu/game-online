// Keyboard / mouse / touch → intents. Keybinds are data so remapping UI (Phase 3) can edit them.
export const DEFAULT_KEYBINDS = {
  moveUp: ['KeyW', 'ArrowUp'], moveDown: ['KeyS', 'ArrowDown'], moveLeft: ['KeyA', 'ArrowLeft'], moveRight: ['KeyD', 'ArrowRight'],
  slot1: ['Digit1', 'KeyJ'], slot2: ['Digit2', 'KeyK'], slot3: ['Digit3', 'KeyL'], slot4: ['Digit4', 'KeyI'],
  slot12: ['Space', 'Shift+Digit2'],
  debug: ['F1', 'Backquote'], pause: ['Escape', 'KeyP'], mute: ['KeyM'], log: ['KeyC'],
};
const GAME_KEYS = new Set(['Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'F1', 'Backquote']);

export class Input {
  constructor(target, keybinds = DEFAULT_KEYBINDS) {
    this.binds = keybinds; this.down = new Set(); this.pressed = []; this.touchMove = { x: 0, y: 0 }; this.mouse = null; this.enabled = true;
    this.codeToAction = new Map();
    for (const [action, codes] of Object.entries(keybinds)) for (const c of codes) this.codeToAction.set(c, action);
    target.addEventListener('keydown', (e) => {
      if (!this.enabled) return;
      if (e.target instanceof HTMLElement && /INPUT|TEXTAREA|SELECT/.test(e.target.tagName)) return;
      const combo = e.shiftKey && e.code.startsWith('Digit') ? `Shift+${e.code}` : e.code;
      const action = this.codeToAction.get(combo) ?? this.codeToAction.get(e.code);
      if (GAME_KEYS.has(e.code) || action) e.preventDefault();
      this.down.add(e.code);
      if (action && !e.repeat) this.pressed.push(action);
    });
    target.addEventListener('keyup', (e) => this.down.delete(e.code));
    window.addEventListener('blur', () => this.down.clear());
  }
  isHeld(action) { return this.binds[action].some((c) => !c.includes('+') && this.down.has(c)); }
  moveVector() {
    let x = (this.isHeld('moveRight') ? 1 : 0) - (this.isHeld('moveLeft') ? 1 : 0);
    let y = (this.isHeld('moveDown') ? 1 : 0) - (this.isHeld('moveUp') ? 1 : 0);
    if (!x && !y) { x = this.touchMove.x; y = this.touchMove.y; }
    return { x, y };
  }
  push(action, extra) { this.pressed.push(extra ? { action, ...extra } : action); }
  consume() { const p = this.pressed; this.pressed = []; return p; }
}
