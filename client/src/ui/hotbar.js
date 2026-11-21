// [LOCKED] 20-slot hotbar, 2 rows × 10 (Master Prompt §8). Phase 1 wires the sword kit + dodge;
// every other slot is present, labelled and visibly locked with the phase that delivers it.
export const HOTBAR = [
  { slot: 1,  label: 'Basic Attack',      action: { type: 'skill', skillId: 'SKL-WPN-SWORD-BA' }, key: '1', alt: 'J / Click', icon: 'basic' },
  { slot: 2,  label: 'Triple Slash',      action: { type: 'skill', skillId: 'SKL-WPN-SWORD-01' }, key: '2', alt: 'K', icon: 'triple' },
  { slot: 3,  label: 'Guard Break',       action: { type: 'skill', skillId: 'SKL-WPN-SWORD-02' }, key: '3', alt: 'L', icon: 'guardbreak' },
  { slot: 4,  label: 'Counter Slash',     action: { type: 'skill', skillId: 'SKL-WPN-SWORD-03' }, key: '4', alt: 'I', icon: 'counter' },
  { slot: 5,  label: 'Power Active 1',    locked: 'Phase 3', key: '5' },
  { slot: 6,  label: 'Power Active 2',    locked: 'Phase 3', key: '6' },
  { slot: 7,  label: 'Power Active 3',    locked: 'Phase 3', key: '7' },
  { slot: 8,  label: 'Power Active 4',    locked: 'Phase 3', key: '8' },
  { slot: 9,  label: 'Power Active 5',    locked: 'Phase 3', key: '9' },
  { slot: 10, label: 'Power Ultimate',    locked: 'Phase 3', key: '0' },
  { slot: 11, label: 'Activate The Power',locked: 'Phase 3', key: '⇧1' },
  { slot: 12, label: 'Dodge',             action: { type: 'dash' }, key: 'Space', alt: '⇧2', icon: 'dash' },
  { slot: 13, label: 'Guard',             locked: 'Phase 3', key: '⇧3' },
  { slot: 14, label: 'HP Potion',         locked: 'Phase 2', key: '⇧4' },
  { slot: 15, label: 'Buff Item',         locked: 'Phase 2', key: '⇧5' },
  { slot: 16, label: 'Consumable',        locked: 'Phase 2', key: '⇧6' },
  { slot: 17, label: 'Utility',           locked: 'Phase 3', key: '⇧7' },
  { slot: 18, label: 'Target Mark',       locked: 'Phase 3', key: '⇧8' },
  { slot: 19, label: 'Tactical Ping',     locked: 'Phase 6', key: '⇧9' },
  { slot: 20, label: 'Emote / Quick',     locked: 'Phase 4', key: '⇧0' },
];
if (HOTBAR.length !== 20) throw new Error('hotbar must have exactly 20 slots');
