// node:crypto for the in-page server (accounts live only in this browser, so PBKDF2 via WebCrypto stands in for scrypt).
import { Buffer } from "buffer";

export function randomBytes(n: number) { return Buffer.from(crypto.getRandomValues(new Uint8Array(n))); }
export function randomUUID() { return crypto.randomUUID(); }
export function scrypt(pw: string, salt: Uint8Array, len: number, _opts: unknown, cb: (e: unknown, b?: Buffer) => void) {
  (async () => {
    const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(pw), "PBKDF2", false, ["deriveBits"]);
    const bits = await crypto.subtle.deriveBits({ name: "PBKDF2", hash: "SHA-256", salt: new Uint8Array(salt), iterations: 100_000 }, key, len * 8);
    return Buffer.from(new Uint8Array(bits));
  })().then((b) => cb(null, b), (e) => cb(e));
}
export function timingSafeEqual(a: Uint8Array, b: Uint8Array) {
  if (a.length !== b.length) throw new RangeError("Input buffers must have the same byte length");
  let d = 0;
  for (let i = 0; i < a.length; i++) d |= a[i] ^ b[i];
  return d === 0;
}
export default { randomBytes, randomUUID, scrypt, timingSafeEqual };
