export const APPEARANCE = {
  genders: ['male', 'female'] as const,
  skin: ['#f6d7b8', '#eac096', '#d29a6c', '#a86b42', '#7a4a2a', '#5a3620'],
  hairColor: ['#2b1d14', '#5b3a1e', '#a0662c', '#e0b85a', '#c9c9c9', '#b03030', '#3050b0', '#6a2a8a'],
  hairStyles: ['Short', 'Spiky', 'Long', 'Ponytail', 'Bob', 'Mohawk'],
  faces: ['Calm', 'Sharp', 'Bright', 'Stern'],
  outfits: [
    { name: 'Wanderer', main: '#4f6d8f', trim: '#c9a35a', pants: '#3b3b4f' },
    { name: 'Forester', main: '#4f7f3f', trim: '#a07040', pants: '#3f3a2a' },
    { name: 'Crimson', main: '#a83a3a', trim: '#e0c070', pants: '#3a2a2a' },
    { name: 'Mystic', main: '#6a4a9a', trim: '#d0d0f0', pants: '#2a2a40' },
  ],
};

export interface Appearance { gender: 'male' | 'female'; skin: number; hairStyle: number; hairColor: number; face: number; outfit: number }

export function validAppearance(a: unknown): a is Appearance {
  if (!a || typeof a !== 'object') return false;
  const o = a as Record<string, unknown>;
  const idx = (v: unknown, n: number) => Number.isInteger(v) && (v as number) >= 0 && (v as number) < n;
  return (o.gender === 'male' || o.gender === 'female')
    && idx(o.skin, APPEARANCE.skin.length) && idx(o.hairStyle, APPEARANCE.hairStyles.length)
    && idx(o.hairColor, APPEARANCE.hairColor.length) && idx(o.face, APPEARANCE.faces.length)
    && idx(o.outfit, APPEARANCE.outfits.length);
}
