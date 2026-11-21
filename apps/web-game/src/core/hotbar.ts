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
  ['power1', 'Power Active 1', 3],
  ['power2', 'Power Active 2', 3],
  ['power3', 'Power Active 3', 3],
  ['power4', 'Power Active 4', 3],
  ['power5', 'Power Active 5', 3],
  ['powerUlt', 'Power Ultimate', 3],
  ['powerToggle', 'Activate/Deactivate The Power', 3],
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

const keyLabel = (code: string) => code.replace('Digit', '').replace('Key', '');

export function createDefaultHotbar(): HotbarSlot[] {
  return DEFAULTS.map(([action, label, phase], i) => {
    const key = (i < 10 ? ROW1_KEYS[i] : ROW2_KEYS[i - 10]) as string;
    return { index: i + 1, action, label, key, keyLabel: keyLabel(key), availableInPhase: phase };
  });
}

export const HOTBAR_ROWS = 2;
export const HOTBAR_COLS = 10;
