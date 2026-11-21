// Pure math helpers. No DOM, no globals — portable to the Phase 2 server.
export const TAU = Math.PI * 2;
export const clamp = (v, lo, hi) => (v < lo ? lo : v > hi ? hi : v);
export const dist = (ax, ay, bx, by) => Math.hypot(bx - ax, by - ay);
export const angleTo = (ax, ay, bx, by) => Math.atan2(by - ay, bx - ax);
export function angleDiff(a, b) {
  let d = (b - a) % TAU;
  if (d > Math.PI) d -= TAU;
  if (d < -Math.PI) d += TAU;
  return d;
}
/** Normalise a raw input vector so diagonals are not faster than cardinals. */
export function normalizeInput(x, y) {
  const len = Math.hypot(x, y);
  if (len === 0) return { x: 0, y: 0 };
  const s = len > 1 ? 1 / len : 1;
  return { x: x * s, y: y * s };
}
/** 8-direction index: 0=E,1=SE,2=S,3=SW,4=W,5=NW,6=N,7=NE (screen coordinates, +y down). */
export function dir8FromAngle(a) {
  const i = Math.round(a / (Math.PI / 4));
  return ((i % 8) + 8) % 8;
}
export const angleFromDir8 = (d) => d * (Math.PI / 4);
/** 4 cardinal facing used by sprites: 'right' | 'down' | 'left' | 'up'. */
export function cardinalFromAngle(a) {
  const d = dir8FromAngle(a);
  if (d === 0) return 'right';
  if (d === 4) return 'left';
  if (d === 2) return 'down';
  if (d === 6) return 'up';
  // diagonals: prefer horizontal so walking sideways reads clearly
  return d === 1 || d === 7 ? 'right' : 'left';
}
