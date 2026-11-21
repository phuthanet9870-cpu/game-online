// Character State Machine (Master Prompt §4.4). Animation never decides life state.
export const CharState = Object.freeze({
  CREATED: 'CREATED', IN_WORLD: 'IN_WORLD', IN_COMBAT: 'IN_COMBAT', DEAD: 'DEAD', RESPAWNING: 'RESPAWNING',
  DISCONNECTING: 'DISCONNECTING', RECONNECTING: 'RECONNECTING',
});
const S = CharState;
const ALLOWED = {
  [S.CREATED]: [S.IN_WORLD],
  [S.IN_WORLD]: [S.IN_COMBAT, S.DEAD, S.DISCONNECTING],
  [S.IN_COMBAT]: [S.IN_WORLD, S.DEAD, S.DISCONNECTING],
  [S.DEAD]: [S.RESPAWNING, S.DISCONNECTING],
  [S.RESPAWNING]: [S.IN_WORLD],
  [S.DISCONNECTING]: [S.RECONNECTING],
  [S.RECONNECTING]: [S.IN_WORLD, S.DEAD],
};
export class CharacterStateMachine {
  constructor() { this.state = S.CREATED; this.timeInState = 0; this.history = [S.CREATED]; }
  can(next) { return ALLOWED[this.state].includes(next); }
  transition(next) {
    if (next === this.state) return false;
    if (!this.can(next)) throw new Error(`illegal character transition ${this.state} → ${next}`);
    this.state = next; this.timeInState = 0; this.history.push(next);
    if (this.history.length > 50) this.history.shift();
    return true;
  }
  update(dt) { this.timeInState += dt; }
  get alive() { return this.state !== S.DEAD && this.state !== S.RESPAWNING; }
}
