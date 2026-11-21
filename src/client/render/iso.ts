/** Isometric projection: 1 world tile = 32x16 screen pixels (at pixel scale 1). */
export const TW = 32;
export const TH = 16;

export function toScreen(x: number, y: number): { sx: number; sy: number } {
  return { sx: (x - y) * (TW / 2), sy: (x + y) * (TH / 2) };
}

export function toWorld(sx: number, sy: number): { x: number; y: number } {
  const a = sx / (TW / 2), b = sy / (TH / 2);
  return { x: (a + b) / 2, y: (b - a) / 2 };
}

/** Screen-space direction for a world-space direction (for sprite facing). */
export function screenDir(wx: number, wy: number): { dx: number; dy: number } {
  return { dx: wx - wy, dy: (wx + wy) / 2 };
}
