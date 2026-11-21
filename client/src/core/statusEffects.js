// Status effects with refresh rules + CC diminishing returns.
export class StatusEffects {
  constructor(defs, ccConfig) { this.defs = defs; this.cc = ccConfig; this.active = new Map(); this.drHistory = new Map(); this.time = 0; }
  has(id) { return this.active.has(id); }
  get(id) { return this.active.get(id); }
  /** Returns the effective duration applied (0 if fully resisted by DR). */
  apply(id, duration, sourceId) {
    const def = this.defs[id];
    if (!def) throw new Error(`unknown status ${id}`);
    let d = duration;
    if (def.diminishingReturns) {
      const key = def.ccType;
      const recent = (this.drHistory.get(key) ?? []).filter((t) => this.time - t < this.cc.drWindow);
      const factor = this.cc.drFactors[Math.min(recent.length, this.cc.drFactors.length - 1)];
      d = duration * factor;
      recent.push(this.time);
      this.drHistory.set(key, recent);
      if (d <= 0) return 0;
    }
    const cur = this.active.get(id);
    if (cur && def.stacking === 'refresh_longer') cur.remaining = Math.max(cur.remaining, d);
    else this.active.set(id, { id, remaining: d, duration: d, sourceId });
    return d;
  }
  remove(id) { this.active.delete(id); }
  clear() { this.active.clear(); }
  update(dt) {
    this.time += dt;
    for (const [id, s] of this.active) { s.remaining -= dt; if (s.remaining <= 0) this.active.delete(id); }
  }
  get stunned() { for (const s of this.active.values()) if (this.defs[s.id].blocksActions) return true; return false; }
  get invulnerable() { for (const s of this.active.values()) if (this.defs[s.id].invulnerable) return true; return false; }
  defenseMultiplier() {
    let m = 1;
    for (const s of this.active.values()) { const mod = this.defs[s.id].modifiers; if (mod?.physDefMultiplier !== undefined) m *= mod.physDefMultiplier; }
    return m;
  }
  endOnAction() { for (const [id] of this.active) if (this.defs[id].endsOnAction) this.active.delete(id); }
  list() { return [...this.active.values()].map((s) => ({ id: s.id, name: this.defs[s.id].name, category: this.defs[s.id].category, remaining: s.remaining, duration: s.duration })); }
}
