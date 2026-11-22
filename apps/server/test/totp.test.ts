import { describe, expect, it } from 'vitest';
import { base32Encode, totp, verifyTotp } from '../src/totp.js';
describe('TOTP (RFC 6238)', () => {
  it('matches the RFC test vector and tolerates one step of drift', () => {
    const secret = base32Encode(Buffer.from('12345678901234567890'));
    expect(totp(secret, 59_000)).toBe('287082');
    expect(totp(secret, 1111111109_000)).toBe('081804');
    expect(verifyTotp(secret, totp(secret, 1_000_000_000_000 - 30_000), 1_000_000_000_000)).toBe(true);
    expect(verifyTotp(secret, '000000', 59_000)).toBe(false);
  });
});
