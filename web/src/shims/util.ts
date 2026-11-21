export function promisify(fn: (...a: any[]) => void) {
  return (...args: unknown[]) => new Promise((ok, fail) => fn(...args, (err: unknown, v: unknown) => (err ? fail(err) : ok(v))));
}
export const inspect = (v: unknown) => { try { return JSON.stringify(v); } catch { return String(v); } };
export const format = (...a: unknown[]) => a.map(String).join(" ");
export const deprecate = <T>(fn: T) => fn;
export const inherits = (c: any, s: any) => { Object.setPrototypeOf(c.prototype, s.prototype); };
export const TextEncoder = globalThis.TextEncoder, TextDecoder = globalThis.TextDecoder;
export default { promisify, inspect, format, deprecate, inherits, TextEncoder, TextDecoder };
