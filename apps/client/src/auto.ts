// AutoPilot — optional automation that plays through the same messages a player sends (the server still validates
// everything): auto-combat (target, approach, basic attack, skill rotation), auto-potion, auto-loot and auto-quest
// travel (A* inside a zone, zone-to-zone through the gates). Any manual movement or click pauses it briefly.
import { CLASSES, ENEMIES, QUESTS, RARITIES, SKILL_MAP, findPath, clearPath, type CharacterData, type GameMap } from '@astra/shared';
import type { ClientGame, CEnt } from './game.js';
import { store } from './net.js';

export interface AutoSettings { combat: boolean; potion: boolean; loot: boolean; potionPct: number; lootMin: string; useUlts: boolean; leash: number; skillsOff: string[]; autoMount: boolean; stopBagFull: boolean; dodge: boolean; townIdle: boolean }
const DEFAULTS: AutoSettings = { combat: false, potion: true, loot: true, potionPct: 40, lootMin: 'uncommon', useUlts: true, leash: 700, skillsOff: [], autoMount: true, stopBagFull: true, dodge: true, townIdle: true };
type Zone = 'town' | 'field' | 'highlands' | 'wastes';
/** Which gate in each zone leads where. */
const GATES: Record<Zone, Partial<Record<Zone, string>>> = { town: { field: 'gate_field' }, field: { town: 'gate_town', highlands: 'gate_highlands' }, highlands: { field: 'gate_meadow', wastes: 'gate_wastes' }, wastes: { highlands: 'gate_ash' } };
const FAMILY_ZONE: Record<string, Zone | 'rift'> = { wildlife: 'field', cinderkin: 'highlands', shardborn: 'wastes', hollowborn: 'rift', construct: 'rift' };

export interface QuestGoal { label: string; zone: Zone; target?: string /* interactable type */; farm?: boolean }
/** Where should the player go for a quest right now? */
export function questGoal(ch: CharacterData, questId: string): QuestGoal | null {
  const q = QUESTS.find((x) => x.id === questId);
  if (!q) return null;
  const st = ch.quests[q.id];
  if (!st || st.done) return { label: q.giver, zone: 'town', target: 'npc_quests' };
  const o = q.objective;
  const fam = o.kind === 'kill_family' ? o.target : o.kind === 'kill_enemy' && o.target ? ENEMIES[o.target]?.family : null;
  if (fam) { const z = FAMILY_ZONE[fam] ?? 'rift'; return z === 'rift' ? { label: 'Rift Gate', zone: 'town', target: 'portal_dungeon' } : { label: z, zone: z, farm: true }; }
  if (o.kind === 'gather') return { label: 'gather', zone: o.target === 'iron_ore' || o.target === 'emberbloom' || o.target === 'starsteel' ? 'highlands' : 'field', farm: true };
  if (o.kind === 'craft') return { label: 'crafting', zone: 'town', target: o.target === 'smithing' ? 'npc_smith' : 'npc_alchemist' };
  if (o.kind === 'house') return { label: 'Hearth', zone: 'town', target: 'house_door' };
  if (o.kind === 'treasure') return { label: 'treasure', zone: 'field', farm: true };
  return { label: 'Rift Gate', zone: 'town', target: 'portal_dungeon' };
}

export class AutoPilot {
  s: AutoSettings;
  quest: string | null = null;
  status = '';
  private pauseT = 0;
  private castT = 0;
  private interactT = 0;
  private path: Array<[number, number]> | null = null;
  private pathGoal = '';
  private pathT = 0;
  private anchor: { x: number; y: number; room: string } | null = null;
  private potT = 0;
  private targetSent = { id: 0, t: 0 };
  private mountT = 0;
  private dodgeT = 0;
  constructor(private g: ClientGame, private send: (m: any) => void) {
    let saved: Partial<AutoSettings> = {};
    try { saved = JSON.parse(store.get('astra.auto') ?? '{}'); } catch { /* defaults */ }
    this.s = { ...DEFAULTS, ...saved, combat: false };
  }
  save() { store.set('astra.auto', JSON.stringify({ ...this.s, combat: false })); }
  /** The player took manual control. */
  pause(sec = 2.5) { this.pauseT = Math.max(this.pauseT, sec); this.path = null; }
  get active() { return this.s.combat || !!this.quest; }
  setCombat(on: boolean) { this.s.combat = on; this.anchor = null; this.path = null; if (!on) this.quest = null; this.save(); }
  setQuest(id: string | null) { this.quest = id; this.path = null; if (id) this.s.combat = true; }

  /** Per frame: returns an input override, or null to leave the player's input alone. */
  update(dt: number): { mx: number; my: number; ax: number; ay: number; atk: boolean } | null {
    const g = this.g, me = g.me(), ch = g.char, self = g.self, map = g.map;
    this.castT -= dt; this.interactT -= dt; this.pathT -= dt; this.potT -= dt; this.mountT -= dt; this.dodgeT -= dt; this.dt = dt;
    if (!me || !ch || !self || !map || me.dead) { this.status = ''; return null; }
    // auto-potion and auto-loot work even while the player drives
    if (this.s.potion && this.potT <= 0 && me.hp / me.mhp * 100 < this.s.potionPct && self.potCd <= 0 && self.potions > 0) { this.potT = 1.2; this.send({ t: 'potion' }); }
    if (this.pauseT > 0) { this.pauseT -= dt; this.status = 'paused'; return null; }
    if (!this.active) { this.status = ''; return null; }
    if (this.s.stopBagFull && this.s.loot && ch.inventory.every(Boolean) && !this.quest) { this.status = 'bags full'; }
    const roomId = g.room?.id ?? '';
    if (!this.anchor || this.anchor.room !== roomId) this.anchor = { x: me.rx, y: me.ry, room: roomId };
    // 1) fight whatever is near
    const tgt = this.pickTarget(me);
    if (tgt) {
      this.status = 'combat';
      if (this.s.dodge && this.dodgeT <= 0 && self.dodge <= 0) { const danger = g.areas.find((a) => a.team === 1 && a.delay > 0 && a.delay < 0.45 && Math.hypot(a.x - me.rx, a.y - me.ry) < a.r + 10); if (danger) { this.dodgeT = 1; const dx = me.rx - danger.x, dy = me.ry - danger.y, d = Math.hypot(dx, dy) || 1; this.send({ t: 'dodge', dx: dx / d, dy: dy / d }); } }
      this.rotation(ch, me, tgt);
      const reach = this.reach(ch);
      const d = Math.hypot(tgt.rx - me.rx, tgt.ry - me.ry);
      if (d > reach) { const [mx, my] = this.steer(map, me, tgt.rx, tgt.ry, `e${tgt.id}`); return { mx, my, ax: tgt.rx, ay: tgt.ry - 10, atk: false }; }
      return { mx: 0, my: 0, ax: tgt.rx, ay: tgt.ry - 10, atk: true };
    }
    // 2) loot
    if (this.s.loot && !(this.s.stopBagFull && ch.inventory.every(Boolean))) {
      const minI = RARITIES.indexOf(this.s.lootMin as never);
      const drop = g.drops.filter((d) => d.rarity === 'gold' || RARITIES.indexOf(d.rarity as never) >= minI).map((d) => ({ d, dist: Math.hypot(d.x - me.rx, d.y - me.ry) })).filter((x) => x.dist < 360).sort((a, b) => a.dist - b.dist)[0];
      if (drop) {
        this.status = 'loot';
        if (drop.dist < 50) { if (this.interactT <= 0) { this.interactT = 0.3; this.send({ t: 'pickup', id: drop.d.id }); } return { mx: 0, my: 0, ax: drop.d.x, ay: drop.d.y, atk: false }; }
        const [mx, my] = this.steer(map, me, drop.d.x, drop.d.y, `d${drop.d.id}`); return { mx, my, ax: drop.d.x, ay: drop.d.y, atk: false };
      }
    }
    // 3) quest travel
    if (this.quest) {
      const goal = questGoal(ch, this.quest);
      if (!goal) { this.quest = null; return null; }
      const here = (roomId.startsWith('house:') ? 'town' : roomId) as Zone;
      if (g.room?.kind === 'dungeon') { this.status = 'quest: fighting in the instance'; return this.wander(map, me); }
      if (here !== goal.zone) {
        const next = this.nextZone(here, goal.zone);
        const gate = next ? GATES[here]?.[next] : undefined;
        this.status = `quest → ${goal.zone}`;
        if (this.s.autoMount && !self.mount && this.mountT <= 0 && g.account?.meta?.mount) { this.mountT = 4; this.send({ t: 'mount_toggle' }); }
        if (gate) return this.goInteract(map, me, gate);
        return null;
      }
      if (goal.target) { this.status = `quest → ${goal.label}`; const r = this.goInteract(map, me, goal.target); if (r) return r; this.quest = goal.target === 'npc_quests' ? this.quest : null; return null; }
      if (goal.farm) { this.status = `quest: hunting in ${goal.label}`; return this.wander(map, me); }
    }
    // 4) nothing to do: drift back towards where auto-combat started (towns are safe: stand still)
    if (this.s.combat && this.s.townIdle && g.room?.kind === 'town') { this.status = 'town'; return null; }
    if (this.s.combat && this.anchor) {
      const d = Math.hypot(this.anchor.x - me.rx, this.anchor.y - me.ry);
      this.status = 'searching';
      if (d > 160) { const [mx, my] = this.steer(map, me, this.anchor.x, this.anchor.y, 'anchor'); return { mx, my, ax: this.anchor.x, ay: this.anchor.y, atk: false }; }
      return this.wander(map, me);
    }
    return null;
  }

  private pickTarget(me: CEnt): CEnt | null {
    const g = this.g;
    const cur = g.self?.target ? g.ents.get(g.self.target) : null;
    const leash = this.quest ? 900 : this.s.leash;
    const inLeash = (e: CEnt) => !this.anchor || this.quest || Math.hypot(e.rx - this.anchor.x, e.ry - this.anchor.y) < leash;
    if (cur && cur.kind === 1 && !cur.dead && cur.def !== 'dummy' && Math.hypot(cur.rx - me.rx, cur.ry - me.ry) < 750) return cur;
    let best: CEnt | null = null, bd = 520;
    for (const e of g.ents.values()) {
      if (e.kind !== 1 || e.dead || e.def === 'dummy' || !inLeash(e)) continue;
      const d = Math.hypot(e.rx - me.rx, e.ry - me.ry) - (e.windup > 0 ? 120 : 0); // whoever is swinging at us first
      if (d < bd) { bd = d; best = e; }
    }
    if (best && best.id !== g.self?.target && (this.targetSent.id !== best.id || performance.now() - this.targetSent.t > 1000)) { this.targetSent = { id: best.id, t: performance.now() }; this.send({ t: 'target', id: best.id }); }
    return best;
  }
  private reach(ch: CharacterData) { const b = CLASSES[ch.cls].basic; return Math.max(60, (b.chain[0]?.range ?? 80) * (b.kind === 'projectile' ? 0.8 : 0.85)); }
  /** Skill rotation: ultimates on bosses/elites (or packs), heals when hurt, summons when alone, else the active bar in order. */
  private rotation(ch: CharacterData, me: CEnt, tgt: CEnt) {
    if (this.castT > 0) return;
    const self = this.g.self;
    const tough = (tgt.flags & 3) !== 0;
    const pack = [...this.g.ents.values()].filter((e) => e.kind === 1 && !e.dead && Math.hypot(e.rx - tgt.rx, e.ry - tgt.ry) < 180).length;
    const minions = [...this.g.ents.values()].filter((e) => e.kind === 2).length;
    const d = Math.hypot(tgt.rx - me.rx, tgt.ry - me.ry);
    const ok = (id: string | null, cd: number) => {
      const sk = id ? SKILL_MAP[id] : null;
      if (!sk || cd > 0 || this.s.skillsOff.includes(sk.id)) return false;
      if (self.res < sk.cost) return false;
      if (sk.requireSecondary && self.sec < sk.requireSecondary) return false;
      if (sk.consumeSecondary && self.sec < Math.max(2, (self.secMax ?? 3) - 1)) return false; // finishers at (near) full points
      const kinds = sk.effects.map((f) => f.t);
      if (kinds.includes('heal') && me.hp / me.mhp > 0.65) return false;
      if (kinds.includes('summon') && minions >= 3) return false;
      if (kinds.includes('dash') && !kinds.includes('area') && d < 90) return false;
      if (kinds.every((k) => k === 'buff' || k === 'gain' || k === 'barrier') && !tough && pack < 2) return false;
      if (sk.range && sk.targeting !== 'self' && d > sk.range) return false;
      return true;
    };
    if (this.s.useUlts && (tough || pack >= 3)) for (let i = 0; i < 4; i++) if (ok(ch.loadout.ultimate[i] ?? null, self.cdU?.[i] ?? 0)) { this.cast('u', i, tgt); return; }
    for (let i = 0; i < 8; i++) if (ok(ch.loadout.active[i] ?? null, self.cdA?.[i] ?? 0)) { this.cast('a', i, tgt); return; }
  }
  private cast(k: 'a' | 'u', s: number, tgt: CEnt) { this.castT = 0.35; this.send({ t: 'cast', k, s, ax: Math.round(tgt.rx), ay: Math.round(tgt.ry), tid: tgt.id }); }
  /** Walks to an interactable of the given type and presses Interact when there. */
  private goInteract(map: GameMap, me: CEnt, type: string) {
    const it = map.interactables.find((i) => i.type === type);
    if (!it) return null;
    const d = Math.hypot(it.x - me.rx, it.y - me.ry);
    if (d < 70) {
      if (this.interactT <= 0) {
        this.interactT = 1.5; this.send({ t: 'interact' });
        if (type === 'npc_quests' && this.quest && this.g.char) { // hand in or pick up the quest, then carry on
          const st = this.g.char.quests[this.quest];
          if (st?.done && !st.claimed) this.send({ t: 'quest_claim', id: this.quest });
          else if (!st) this.send({ t: 'quest_accept', id: this.quest });
          else if (st.claimed) { const nx = QUESTS.find((q) => !this.g.char!.quests[q.id] && (!q.requires || this.g.char!.quests[q.requires]?.claimed)); this.quest = nx?.id ?? null; }
        } else if (!type.startsWith('gate')) this.quest = null;
      }
      return { mx: 0, my: 0, ax: it.x, ay: it.y, atk: false };
    }
    const [mx, my] = this.steer(map, me, it.x, it.y, `i${type}`);
    return { mx, my, ax: it.x, ay: it.y, atk: false };
  }
  private wanderT = 0; private wanderDir = 0; private dt = 0.016;
  private wander(map: GameMap, me: CEnt) {
    this.wanderT -= this.dt;
    if (this.wanderT <= 0) { this.wanderT = 2 + Math.random() * 2; this.wanderDir = Math.random() * Math.PI * 2; }
    const tx = me.rx + Math.cos(this.wanderDir) * 200, ty = me.ry + Math.sin(this.wanderDir) * 200;
    if (!clearPath(map, me.rx, me.ry, tx, ty, 14)) { this.wanderT = 0; return { mx: 0, my: 0, ax: tx, ay: ty, atk: false }; }
    return { mx: Math.cos(this.wanderDir) * 0.7, my: Math.sin(this.wanderDir) * 0.7, ax: tx, ay: ty, atk: false };
  }
  private nextZone(from: Zone, to: Zone): Zone | null {
    const q: Zone[] = [from], prev = new Map<Zone, Zone | null>([[from, null]]);
    while (q.length) { const z = q.shift()!; if (z === to) break; for (const n of Object.keys(GATES[z] ?? {}) as Zone[]) if (!prev.has(n)) { prev.set(n, z); q.push(n); } }
    if (!prev.has(to)) return null;
    let z: Zone = to; while (prev.get(z) && prev.get(z) !== from) z = prev.get(z)!;
    return z;
  }
  /** Direction toward a point: straight if clear, else along an A* path (recomputed now and then). */
  private steer(map: GameMap, me: CEnt, x: number, y: number, key: string): [number, number] {
    if (clearPath(map, me.rx, me.ry, x, y, 14)) { this.path = null; const d = Math.hypot(x - me.rx, y - me.ry) || 1; return [(x - me.rx) / d, (y - me.ry) / d]; }
    if (!this.path || this.pathGoal !== key || this.pathT <= 0) { this.path = findPath(map, me.rx, me.ry, x, y, 4000); this.pathGoal = key; this.pathT = 1.5; }
    const wp = this.path?.find((w) => Math.hypot(w[0] - me.rx, w[1] - me.ry) > 20);
    if (!wp) return [0, 0];
    const d = Math.hypot(wp[0] - me.rx, wp[1] - me.ry) || 1;
    return [(wp[0] - me.rx) / d, (wp[1] - me.ry) / d];
  }
}
