// Reusable Health + Stamina components.
export class Health {
  constructor(max) { this.max = max; this.hp = max; }
  get dead() { return this.hp <= 0; }
  get ratio() { return this.max > 0 ? this.hp / this.max : 0; }
  /** Applies damage, returns the amount actually removed (never below 0 HP). */
  takeDamage(amount) {
    if (!(amount > 0) || this.dead) return 0;
    const applied = Math.min(this.hp, amount);
    this.hp -= applied;
    return applied;
  }
  heal(amount) {
    if (!(amount > 0) || this.dead) return 0;
    const applied = Math.min(this.max - this.hp, amount);
    this.hp += applied;
    return applied;
  }
  reset() { this.hp = this.max; }
}

export class Stamina {
  constructor(max, regenPerSec, regenDelay) {
    this.max = max; this.value = max; this.regenPerSec = regenPerSec; this.regenDelay = regenDelay; this.sinceSpend = Infinity;
  }
  canSpend(n) { return this.value + 1e-9 >= n; }
  spend(n) {
    if (!this.canSpend(n)) return false;
    this.value = Math.max(0, this.value - n);
    this.sinceSpend = 0;
    return true;
  }
  update(dt) {
    this.sinceSpend += dt;
    if (this.sinceSpend >= this.regenDelay) this.value = Math.min(this.max, this.value + this.regenPerSec * dt);
  }
  reset() { this.value = this.max; this.sinceSpend = Infinity; }
}
