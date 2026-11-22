// Procedural sound: every effect is synthesized with Web Audio (no asset downloads). Audio starts only after the
// first user gesture (browser autoplay policy). Volumes persist per browser.
import { store } from './net.js';

type Wave = OscillatorType;
const ELEM: Record<string, { f: number; w: Wave; noise: number }> = {
  physical: { f: 140, w: 'square', noise: 0.6 }, fire: { f: 220, w: 'sawtooth', noise: 0.8 }, ice: { f: 880, w: 'triangle', noise: 0.2 },
  lightning: { f: 1200, w: 'square', noise: 0.5 }, holy: { f: 660, w: 'sine', noise: 0.1 }, shadow: { f: 110, w: 'sawtooth', noise: 0.4 }, poison: { f: 300, w: 'triangle', noise: 0.3 },
};

export class Sound {
  private ctx: AudioContext | null = null;
  private master!: GainNode;
  private sfx!: GainNode;
  private music!: GainNode;
  private noiseBuf: AudioBuffer | null = null;
  private drone: { stop: () => void } | null = null;
  private last = new Map<string, number>();
  settings = { master: 0.6, sfx: 0.8, music: 0.35, on: true };

  constructor() {
    try { Object.assign(this.settings, JSON.parse(store.get('astra.audio') ?? '{}')); } catch { /* defaults */ }
    const unlock = () => { this.init(); removeEventListener('pointerdown', unlock); removeEventListener('keydown', unlock); };
    addEventListener('pointerdown', unlock); addEventListener('keydown', unlock);
  }
  private init() {
    if (this.ctx || typeof AudioContext === 'undefined') return;
    try {
      this.ctx = new AudioContext();
      this.master = this.ctx.createGain(); this.master.connect(this.ctx.destination);
      this.sfx = this.ctx.createGain(); this.sfx.connect(this.master);
      this.music = this.ctx.createGain(); this.music.connect(this.master);
      const len = this.ctx.sampleRate * 0.5;
      this.noiseBuf = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
      const d = this.noiseBuf.getChannelData(0);
      for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
      this.apply();
    } catch { this.ctx = null; }
  }
  apply() {
    store.set('astra.audio', JSON.stringify(this.settings));
    if (!this.ctx) return;
    this.master.gain.value = this.settings.on ? this.settings.master : 0;
    this.sfx.gain.value = this.settings.sfx;
    this.music.gain.value = this.settings.music;
  }
  /** Rate-limit identical sounds so big fights do not become noise. */
  private gate(key: string, ms: number) { const n = performance.now(); if (n - (this.last.get(key) ?? 0) < ms) return false; this.last.set(key, n); return true; }

  private tone(f: number, dur: number, w: Wave, vol: number, slide = 0, delay = 0) {
    const c = this.ctx; if (!c) return;
    const t = c.currentTime + delay;
    const o = c.createOscillator(), g = c.createGain();
    o.type = w; o.frequency.setValueAtTime(f, t);
    if (slide) o.frequency.exponentialRampToValueAtTime(Math.max(30, f * slide), t + dur);
    g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(vol, t + 0.01); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g); g.connect(this.sfx); o.start(t); o.stop(t + dur + 0.02);
  }
  private noise(dur: number, vol: number, hp = 800, delay = 0) {
    const c = this.ctx; if (!c || !this.noiseBuf) return;
    const t = c.currentTime + delay;
    const s = c.createBufferSource(), f = c.createBiquadFilter(), g = c.createGain();
    s.buffer = this.noiseBuf; f.type = 'highpass'; f.frequency.value = hp;
    g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    s.connect(f); f.connect(g); g.connect(this.sfx); s.start(t); s.stop(t + dur);
  }

  hit(type: string, crit: boolean) {
    if (!this.ctx || !this.gate('hit', crit ? 30 : 55)) return;
    const e = ELEM[type] ?? ELEM.physical!;
    this.tone(e.f * (0.9 + Math.random() * 0.2), 0.09, e.w, 0.08, 0.6);
    if (e.noise) this.noise(0.06, 0.05 * e.noise, 1200);
    if (crit) this.tone(e.f * 2, 0.12, 'triangle', 0.08, 1.5, 0.02);
  }
  hurt() { if (this.ctx && this.gate('hurt', 120)) { this.tone(90, 0.15, 'sawtooth', 0.1, 0.5); this.noise(0.08, 0.06, 300); } }
  cast(type: string) { if (!this.ctx || !this.gate('cast', 60)) return; const e = ELEM[type] ?? ELEM.holy!; this.tone(e.f * 0.75, 0.18, e.w === 'square' ? 'triangle' : e.w, 0.06, 1.8); }
  dodge() { if (this.ctx) this.noise(0.18, 0.07, 2000); }
  potion() { if (this.ctx) { this.tone(500, 0.12, 'sine', 0.07, 1.6); this.tone(750, 0.15, 'sine', 0.05, 1.4, 0.08); } }
  loot(rarity: string) {
    if (!this.ctx || !this.gate('loot', 80)) return;
    const steps = { common: 1, uncommon: 1, rare: 2, epic: 3, legendary: 4, ancient: 5 }[rarity] ?? 1;
    for (let i = 0; i < steps; i++) this.tone(660 * Math.pow(1.26, i), 0.18, 'triangle', 0.06, 1, i * 0.07);
  }
  gold() { if (this.ctx && this.gate('gold', 90)) { this.tone(1320, 0.07, 'square', 0.03); this.tone(1760, 0.08, 'square', 0.025, 1, 0.05); } }
  levelUp() { if (!this.ctx) return; [523, 659, 784, 1046].forEach((f, i) => this.tone(f, 0.3, 'triangle', 0.08, 1, i * 0.09)); }
  phase() { if (this.ctx) { this.tone(70, 0.9, 'sawtooth', 0.12, 0.5); this.noise(0.6, 0.08, 150); } }
  death() { if (this.ctx) this.tone(180, 0.35, 'triangle', 0.05, 0.4); }
  ui() { if (this.ctx && this.gate('ui', 40)) this.tone(900, 0.04, 'sine', 0.03); }
  warn() { if (this.ctx && this.gate('warn', 600)) { this.tone(440, 0.2, 'square', 0.05); this.tone(440, 0.2, 'square', 0.05, 1, 0.25); } }

  /** Soft ambient drone per zone. */
  ambience(zone: 'town' | 'field' | 'ash' | 'dungeon' | 'raid' | null) {
    this.drone?.stop(); this.drone = null;
    const c = this.ctx; if (!c || !zone) return;
    const chords: Record<string, number[]> = { town: [220, 277, 330], field: [196, 247, 294], ash: [147, 175, 220], dungeon: [98, 117, 147], raid: [82, 98, 123] };
    const g = c.createGain(); g.gain.value = 0; g.connect(this.music);
    const f = c.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = zone === 'town' ? 900 : 600; f.connect(g);
    const oscs = (chords[zone] ?? chords.town!).map((fr, i) => { const o = c.createOscillator(); o.type = i === 0 ? 'triangle' : 'sine'; o.frequency.value = fr; o.detune.value = (i - 1) * 6; o.connect(f); o.start(); return o; });
    const lfo = c.createOscillator(), lg = c.createGain(); lfo.frequency.value = 0.08; lg.gain.value = 0.03; lfo.connect(lg); lg.connect(g.gain); lfo.start();
    g.gain.linearRampToValueAtTime(0.06, c.currentTime + 2);
    this.drone = { stop: () => { const t = c.currentTime; g.gain.cancelScheduledValues(t); g.gain.setValueAtTime(g.gain.value, t); g.gain.linearRampToValueAtTime(0, t + 1); setTimeout(() => { oscs.forEach((o) => o.stop()); lfo.stop(); g.disconnect(); }, 1200); } };
  }
}
export const sound = new Sound();
