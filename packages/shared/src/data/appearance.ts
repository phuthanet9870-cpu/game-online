// Character appearance chosen at creation: hair colour and outfit tint (indexes into these palettes; -1 = the
// class default). Validated on the server, sent to everyone nearby, drawn by the client sprites.
import { CLASSES } from './classes.js';
import type { ClassId } from '../types.js';

export const HAIR_COLORS = ['#efeaf8', '#e8c66a', '#f0a0c8', '#b48ae8', '#6aa8ff', '#2a2440', '#8a4a2a', '#d84a4a', '#5fe0d0', '#c8c8d8'];
export const OUTFIT_TINTS = ['#6a3ad8', '#2f4c9c', '#9c2f2f', '#e8e0d0', '#2b2b38', '#2f6b3a', '#c8902a', '#1f5a5a'];
export interface Look { hair: number; outfit: number }
export const DEFAULT_LOOK: Look = { hair: -1, outfit: -1 };
export function sanitizeLook(l: unknown): Look {
  const o = (l && typeof l === 'object' ? l : {}) as Record<string, unknown>;
  const pick = (v: unknown, n: number) => (Number.isInteger(v) && (v as number) >= -1 && (v as number) < n ? (v as number) : -1);
  return { hair: pick(o.hair, HAIR_COLORS.length), outfit: pick(o.outfit, OUTFIT_TINTS.length) };
}
/** Sprite colours for a class with an optional look applied. */
export function lookColors(cls: ClassId, look?: Look | null): { body: string; hair: string; accent: string } {
  const c = CLASSES[cls]?.colors ?? { body: '#888', hair: '#333', accent: '#ccc' };
  return { body: look && look.outfit >= 0 ? OUTFIT_TINTS[look.outfit]! : c.body, hair: look && look.hair >= 0 ? HAIR_COLORS[look.hair]! : c.hair, accent: c.accent };
}
/** Compact wire form ("hair,outfit"). */
export const lookKey = (l?: Look | null) => (l && (l.hair >= 0 || l.outfit >= 0) ? `${l.hair},${l.outfit}` : '');
export const parseLookKey = (s: string): Look | null => { if (!s) return null; const [a, b] = s.split(',').map(Number); return sanitizeLook({ hair: a, outfit: b }); };
