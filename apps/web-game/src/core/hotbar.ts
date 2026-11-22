/**
 * 20-slot hotbar (2 rows x 10) — LOCKED rule §2.8 / §8.
 * Phase 1 wires slots 1-4 (basic + 3 sword skills) and 12 (Dodge). Others are visible but locked
 * until the phase that implements them. Remapping/persistence arrives in Phase 3.
 */
export type HotbarAction =
  | 'basic'
  | 'skill1'
  | 'skill2'
  | 'skill3'
  | 'power1'
  | 'power2'
  | 'power3'
  | 'power4'
  | 'power5'
  | 'powerUlt'
  | 'powerToggle'
  | 'dodge'
  | 'guard'
  | 'hpPotion'
  | 'buffItem'
  | 'consumable'
  | 'utility'
  | 'targetMark'
  | 'ping'
  | 'emote';

export interface HotbarSlot {
  index: number; // 1..20
  action: HotbarAction;
  label: string;
  key: string; // KeyboardEvent.code
  keyLabel: string;
  availableInPhase: number;
}

const ROW1_KEYS = [
  'Digit1',
  'Digit2',
  'Digit3',
  'Digit4',
  'Digit5',
  'Digit6',
  'Digit7',
  'Digit8',
  'Digit9',
  'Digit0',
];
const ROW2_KEYS = ['KeyQ', 'KeyE', 'KeyR', 'KeyT', 'KeyF', 'KeyG', 'KeyZ', 'KeyX', 'KeyC', 'KeyV'];

const DEFAULTS: Array<[HotbarAction, string, number]> = [
  ['basic', 'Basic Attack', 1],
  ['skill1', 'Weapon Skill 1', 1],
  ['skill2', 'Weapon Skill 2', 1],
  ['skill3', 'Weapon Skill 3', 1],
  ['power1', 'Power Active 1', 1],
  ['power2', 'Power Active 2', 1],
  ['power3', 'Power Active 3', 1],
  ['power4', 'Power Active 4', 1],
  ['power5', 'Power Active 5', 1],
  ['powerUlt', 'Power Ultimate', 1],
  ['powerToggle', 'Activate/Deactivate The Power', 1],
  ['dodge', 'Dodge', 1],
  ['guard', 'Guard', 3],
  ['hpPotion', 'HP Potion', 2],
  ['buffItem', 'Buff Item', 4],
  ['consumable', 'Consumable', 4],
  ['utility', 'Utility', 4],
  ['targetMark', 'Target Mark', 4],
  ['ping', 'Tactical Ping', 4],
  ['emote', 'Emote/Quick Action', 4],
];

const keyLabel = (code: string) =>
  code ? code.replace('Digit', '').replace('Key', '').replace('Numpad', 'N') : '—';

export function createDefaultHotbar(): HotbarSlot[] {
  return DEFAULTS.map(([action, label, phase], i) => {
    const key = (i < 10 ? ROW1_KEYS[i] : ROW2_KEYS[i - 10]) as string;
    return { index: i + 1, action, label, key, keyLabel: keyLabel(key), availableInPhase: phase };
  });
}

export const HOTBAR_ROWS = 2;
export const HOTBAR_COLS = 10;

/* ------------------------------------------------ Phase 3: remappable layout */

export interface HotbarLayoutEntry {
  action: HotbarAction;
  key: string; // KeyboardEvent.code, '' = unbound
}

export const HOTBAR_ACTIONS: readonly HotbarAction[] = DEFAULTS.map(([a]) => a);

/** Keys that can never be bound (movement, chat, debug, interact, aliases, browser shortcuts). Mirrors the server. */
export const RESERVED_KEYS = new Set([
  'KeyW',
  'KeyA',
  'KeyS',
  'KeyD',
  'KeyH',
  'KeyJ',
  'Space',
  'Enter',
  'Escape',
  'Tab',
  'F3',
  'F5',
  'F11',
  'F12',
  'ArrowUp',
  'ArrowDown',
  'ArrowLeft',
  'ArrowRight',
  'ShiftLeft',
  'ShiftRight',
  'ControlLeft',
  'ControlRight',
  'AltLeft',
  'AltRight',
  'MetaLeft',
  'MetaRight',
]);

export function isBindableKey(code: string): boolean {
  if (RESERVED_KEYS.has(code)) return false;
  return (
    code === '' ||
    /^Key[A-Z]$/.test(code) ||
    /^Digit[0-9]$/.test(code) ||
    /^Numpad[0-9]$/.test(code) ||
    /^F([1-9]|1[0-2])$/.test(code) ||
    [
      'Minus',
      'Equal',
      'BracketLeft',
      'BracketRight',
      'Semicolon',
      'Quote',
      'Comma',
      'Period',
      'Slash',
      'Backslash',
      'Backquote',
    ].includes(code)
  );
}

export const defaultLayout = (): HotbarLayoutEntry[] =>
  createDefaultHotbar().map((s) => ({ action: s.action, key: s.key }));

/** LOCKED 20-slot validation: every action exactly once, unique bindable keys. */
export function validateLayout(slots: HotbarLayoutEntry[]): boolean {
  if (!Array.isArray(slots) || slots.length !== 20) return false;
  const a = new Set<string>();
  const k = new Set<string>();
  for (const s of slots) {
    if (!HOTBAR_ACTIONS.includes(s.action) || a.has(s.action) || !isBindableKey(s.key)) return false;
    a.add(s.action);
    if (s.key) {
      if (k.has(s.key)) return false;
      k.add(s.key);
    }
  }
  return true;
}

export const slotMeta = (action: HotbarAction): { label: string; availableInPhase: number } => {
  const d = DEFAULTS.find(([x]) => x === action);
  return { label: d?.[1] ?? action, availableInPhase: d?.[2] ?? 99 };
};

export { keyLabel };
