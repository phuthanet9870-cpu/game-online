/** Token bucket rate limiter. Time source is injected for testability. */
export class TokenBucket {
  private tokens: number;
  private last: number;
  constructor(private ratePerSec: number, private burst: number, private now: () => number) {
    this.tokens = burst;
    this.last = now();
  }
  take(n = 1): boolean {
    const t = this.now();
    this.tokens = Math.min(this.burst, this.tokens + ((t - this.last) / 1000) * this.ratePerSec);
    this.last = t;
    if (this.tokens < n) return false;
    this.tokens -= n;
    return true;
  }
}

/**
 * Server RNG. Uses crypto.getRandomValues so outcomes can't be predicted
 * from client-visible state. Tests can inject a seeded function instead.
 */
export function cryptoRng(): () => number {
  const buf = new Uint32Array(256);
  let i = buf.length;
  return () => {
    if (i >= buf.length) { crypto.getRandomValues(buf); i = 0; }
    return buf[i++] / 4294967296;
  };
}

export interface Logger { info(msg: string, data?: unknown): void; warn(msg: string, data?: unknown): void; error(msg: string, data?: unknown): void }

export const consoleLogger: Logger = {
  info: (m, d) => console.log(`[info] ${m}`, d ?? ''),
  warn: (m, d) => console.warn(`[warn] ${m}`, d ?? ''),
  error: (m, d) => console.error(`[error] ${m}`, d ?? ''),
};

export const silentLogger: Logger = { info() {}, warn() {}, error() {} };
