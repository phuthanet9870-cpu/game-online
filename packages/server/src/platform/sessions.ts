import type { SessionRegistry } from "@game/core";

/**
 * In-process registry: one live game session per account. A later claim
 * evicts the earlier holder (it saves and disconnects), like rAthena kicking
 * a duplicate login. With several server processes this moves to Redis
 * presence (MVP 10); the interface stays the same.
 */
export class LocalSessionRegistry implements SessionRegistry {
  private holders = new Map<number, { evict: () => Promise<void>; id: number }>();
  private queue = new Map<number, Promise<unknown>>();
  private nextId = 1;

  async claim(accountId: number, evict: () => Promise<void>): Promise<() => void> {
    // Serialise claims per account so two near-simultaneous joins cannot both win.
    const previous = this.queue.get(accountId) ?? Promise.resolve();
    let done!: () => void;
    const turn = new Promise<void>((r) => (done = r));
    this.queue.set(accountId, previous.then(() => turn));
    await previous;
    try {
      const holder = this.holders.get(accountId);
      if (holder) {
        this.holders.delete(accountId);
        await holder.evict().catch((err) => console.error("evicting previous session failed", err));
      }
      const id = this.nextId++;
      this.holders.set(accountId, { evict, id });
      return () => {
        if (this.holders.get(accountId)?.id === id) this.holders.delete(accountId);
      };
    } finally {
      done();
    }
  }
}
