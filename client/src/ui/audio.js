// Tiny WebAudio synth for combat cues (original, generated at runtime — no licensed assets needed).
export class Sfx {
  constructor() { this.ctx = null; this.muted = false; this.vol = 0.18; }
  unlock() { if (!this.ctx) { try { this.ctx = new (window.AudioContext || window.webkitAudioContext)(); } catch { this.ctx = null; } } this.ctx?.resume?.(); }
  #tone(freq, dur, type = 'square', slide = 0, gain = 1) {
    if (this.muted || !this.ctx) return;
    const t = this.ctx.currentTime, o = this.ctx.createOscillator(), g = this.ctx.createGain();
    o.type = type; o.frequency.setValueAtTime(freq, t); if (slide) o.frequency.exponentialRampToValueAtTime(Math.max(30, freq + slide), t + dur);
    g.gain.setValueAtTime(this.vol * gain, t); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g).connect(this.ctx.destination); o.start(t); o.stop(t + dur + 0.02);
  }
  #noise(dur, hp = 1200, gain = 1) {
    if (this.muted || !this.ctx) return;
    const n = Math.floor(this.ctx.sampleRate * dur), b = this.ctx.createBuffer(1, n, this.ctx.sampleRate), d = b.getChannelData(0);
    for (let i = 0; i < n; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / n);
    const s = this.ctx.createBufferSource(), f = this.ctx.createBiquadFilter(), g = this.ctx.createGain();
    f.type = 'highpass'; f.frequency.value = hp; g.gain.value = this.vol * gain;
    s.buffer = b; s.connect(f).connect(g).connect(this.ctx.destination); s.start();
  }
  play(ev, playerId) {
    switch (ev.type) {
      case 'swing': this.#noise(0.07, ev.vfx === 'smash' ? 500 : 2200, 0.8); break;
      case 'damage':
        if (ev.targetId === playerId) this.#tone(160, 0.12, 'sawtooth', -80, 0.9);
        else { this.#tone(ev.crit ? 520 : 300, 0.07, 'square', -150, 0.6); if (ev.crit) this.#tone(880, 0.09, 'triangle', 0, 0.5); }
        break;
      case 'dash': this.#noise(0.12, 800, 0.5); break;
      case 'countered': this.#tone(1200, 0.18, 'triangle', -400, 0.7); break;
      case 'telegraph': this.#tone(110, 0.1, 'triangle', 40, 0.35); break;
      case 'death': this.#tone(220, 0.3, 'sawtooth', -160, 0.5); break;
      case 'player_death': this.#tone(200, 0.7, 'sawtooth', -170, 0.8); break;
      case 'respawned': this.#tone(440, 0.2, 'triangle', 440, 0.5); break;
      case 'action_rejected': if (ev.reason !== 'BUSY') this.#tone(90, 0.08, 'square', 0, 0.3); break;
    }
  }
}
