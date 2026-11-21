import { createDefaultHotbar, type HotbarAction } from '../core/hotbar';
import type { Vec2 } from '../core/math';
import { axesToVector } from '../core/movement';

const MOVE_KEYS: Record<string, 'up' | 'down' | 'left' | 'right'> = {
  KeyW: 'up',
  ArrowUp: 'up',
  KeyS: 'down',
  ArrowDown: 'down',
  KeyA: 'left',
  ArrowLeft: 'left',
  KeyD: 'right',
  ArrowRight: 'right',
};

/** Extra aliases on top of the 20 hotbar keys. */
const ALIASES: Record<string, HotbarAction> = { Space: 'dodge', ShiftLeft: 'dodge', KeyJ: 'basic' };

const PREVENT = new Set(['Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Tab', 'F3']);

/**
 * Keyboard manager using window listeners so React text inputs can take focus without the game
 * eating keystrokes (spec §1 "input focus between React and canvas").
 */
export class KeyboardInput {
  private held = { up: false, down: false, left: false, right: false };
  private pressed: HotbarAction[] = [];
  private enabled = true;
  private readonly bindings = new Map<string, HotbarAction>();
  onToggleDebug: () => void = () => {};
  onFocusChat: () => void = () => {};

  constructor() {
    for (const s of createDefaultHotbar()) this.bindings.set(s.key, s.action);
    for (const [k, a] of Object.entries(ALIASES)) this.bindings.set(k, a);
    window.addEventListener('keydown', this.down);
    window.addEventListener('keyup', this.up);
    window.addEventListener('blur', this.clear);
    document.addEventListener('visibilitychange', this.clear);
  }

  destroy(): void {
    window.removeEventListener('keydown', this.down);
    window.removeEventListener('keyup', this.up);
    window.removeEventListener('blur', this.clear);
    document.removeEventListener('visibilitychange', this.clear);
  }

  setEnabled(v: boolean): void {
    this.enabled = v;
    if (!v) this.clear();
  }

  private isTyping(): boolean {
    const el = document.activeElement as HTMLElement | null;
    return !!el && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.isContentEditable);
  }

  private down = (e: KeyboardEvent): void => {
    if (this.isTyping() || !this.enabled) return;
    if (PREVENT.has(e.code)) e.preventDefault();
    if (e.code === 'F3') {
      this.onToggleDebug();
      return;
    }
    if (e.code === 'Enter') {
      e.preventDefault();
      this.onFocusChat();
      return;
    }
    const dir = MOVE_KEYS[e.code];
    if (dir) {
      this.held[dir] = true;
      return;
    }
    if (e.repeat || e.ctrlKey || e.metaKey || e.altKey) return;
    const action = this.bindings.get(e.code);
    if (action) this.pressed.push(action);
  };

  private up = (e: KeyboardEvent): void => {
    const dir = MOVE_KEYS[e.code];
    if (dir) this.held[dir] = false;
  };

  clear = (): void => {
    this.held = { up: false, down: false, left: false, right: false };
    this.pressed = [];
  };

  queue(action: HotbarAction): void {
    this.pressed.push(action);
  }

  moveVector(): Vec2 {
    return this.enabled ? axesToVector(this.held) : { x: 0, y: 0 };
  }

  drainPressed(): HotbarAction[] {
    const p = this.pressed;
    this.pressed = [];
    return p;
  }
}
