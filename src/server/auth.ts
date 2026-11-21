/**
 * Password hashing with PBKDF2-SHA256 via WebCrypto, which exists both in
 * Node 22 and in browsers/workers, so the in-browser server uses the same code.
 */
const ITERATIONS = 120_000;
const enc = new TextEncoder();

const toHex = (b: ArrayBuffer | Uint8Array) => [...new Uint8Array(b)].map((x) => x.toString(16).padStart(2, '0')).join('');
const fromHex = (h: string) => new Uint8Array((h.match(/.{2}/g) ?? []).map((x) => parseInt(x, 16)));

export function randomToken(bytes = 24): string {
  const b = new Uint8Array(bytes);
  crypto.getRandomValues(b);
  return toHex(b);
}

export async function hashPassword(password: string, saltHex?: string, iterations = ITERATIONS): Promise<{ hash: string; salt: string }> {
  const salt = saltHex ? fromHex(saltHex) : crypto.getRandomValues(new Uint8Array(16));
  const key = await crypto.subtle.importKey('raw', enc.encode(password), 'PBKDF2', false, ['deriveBits']);
  const bits = await crypto.subtle.deriveBits({ name: 'PBKDF2', hash: 'SHA-256', salt, iterations }, key, 256);
  return { hash: `pbkdf2$${iterations}$${toHex(bits)}`, salt: toHex(salt) };
}

export async function verifyPassword(password: string, stored: string, saltHex: string): Promise<boolean> {
  const parts = stored.split('$');
  const iterations = Number(parts[1]);
  if (parts.length !== 3 || !Number.isInteger(iterations) || iterations < 1000) return false;
  const { hash } = await hashPassword(password, saltHex, iterations);
  if (hash.length !== stored.length) return false;
  let diff = 0;
  for (let i = 0; i < hash.length; i++) diff |= hash.charCodeAt(i) ^ stored.charCodeAt(i);
  return diff === 0;
}
