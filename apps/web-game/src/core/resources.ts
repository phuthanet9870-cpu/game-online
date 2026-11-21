/** Regenerating resource (Stamina now; Power Energy in Phase 3). Times in ms. */
export class Resource {
  current: number;
  constructor(
    public max: number,
    public regenPerSec: number,
    public regenDelayMs: number,
    private lastSpentAt = -Infinity,
  ) {
    this.current = max;
  }

  canSpend(amount: number): boolean {
    return this.current + 1e-9 >= amount;
  }

  /** Atomically spend; returns false (and changes nothing) when insufficient. */
  trySpend(amount: number, now: number): boolean {
    if (!this.canSpend(amount)) return false;
    this.current -= amount;
    if (amount > 0) this.lastSpentAt = now;
    return true;
  }

  update(dtMs: number, now: number): void {
    if (now - this.lastSpentAt < this.regenDelayMs) return;
    this.current = Math.min(this.max, this.current + (this.regenPerSec * dtMs) / 1000);
  }

  refill(): void {
    this.current = this.max;
  }
}

export class CooldownTracker {
  private readyAt = new Map<string, number>();
  private durations = new Map<string, number>();

  isReady(id: string, now: number): boolean {
    return now >= (this.readyAt.get(id) ?? -Infinity);
  }
  trigger(id: string, now: number, durationMs: number): void {
    this.readyAt.set(id, now + durationMs);
    this.durations.set(id, durationMs);
  }
  remaining(id: string, now: number): number {
    return Math.max(0, (this.readyAt.get(id) ?? 0) - now);
  }
  /** 0 = ready, 1 = just triggered. */
  fraction(id: string, now: number): number {
    const d = this.durations.get(id) ?? 0;
    return d <= 0 ? 0 : this.remaining(id, now) / d;
  }
  reset(): void {
    this.readyAt.clear();
  }
}
