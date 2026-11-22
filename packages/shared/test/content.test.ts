import { describe, expect, it } from 'vitest';
import {
  ACTIVITY_ORDER, CLASS_IDS, CONTENT_TH, ENEMIES, GameCore, QUESTS, RECIPES, Rng, SKILLS, buildHighlands, craft, createCharacter, emptyAccount, reachableSet, computeStats, ELIXIRS, type Persistence,
} from '../src/index.js';

describe('Thai content coverage', () => {
  it('has Thai text for every class, skill, quest, enemy, activity and recipe', () => {
    const missing: string[] = [];
    const need = (k: string) => { if (!CONTENT_TH[k]) missing.push(k); };
    for (const c of CLASS_IDS) for (const f of ['name', 'role', 'fantasy', 'mechanic']) need(`class.${c}.${f}`);
    for (const s of SKILLS) { need(`skill.${s.id}.name`); need(`skill.${s.id}.desc`); }
    for (const q of QUESTS) { need(`quest.${q.id}.name`); need(`quest.${q.id}.text`); }
    for (const e of Object.keys(ENEMIES)) need(`enemy.${e}`);
    for (const a of ACTIVITY_ORDER) { need(`activity.${a}.name`); need(`activity.${a}.desc`); }
    for (const r of RECIPES) need(`recipe.${r.id}`);
    expect(missing).toEqual([]);
  });
});

describe('Ashen Highlands', () => {
  it('is connected and has ore, herbs and Cinderkin in the 10-20 band', () => {
    const m = buildHighlands(4242);
    const reach = reachableSet(m, m.spawn.x, m.spawn.y);
    for (const it of m.interactables) {
      const tx = Math.floor(it.x / 32), ty = Math.floor(it.y / 32);
      expect([[0, 0], [1, 0], [-1, 0], [0, 1], [0, -1]].some(([dx, dy]) => reach.has((ty + dy!) * m.w + tx + dx!)), it.id).toBe(true);
    }
    expect(m.interactables.filter((i) => i.type === 'ore').length).toBeGreaterThan(10);
    expect(m.spawns.every((s) => ENEMIES[s.enemy]!.family === 'cinderkin' && s.level! >= 10 && s.level! <= 20)).toBe(true);
  });
});

describe('crafting', () => {
  it('consumes materials, grants profession XP, applies elixirs and forges items', () => {
    const r = createCharacter('a', 'Crafter', 'mage', false); if (!r.ok) throw 0;
    const ch = r.value; ch.level = 12; ch.gold = 1000; ch.dust = 100;
    expect(craft(ch, 'r_fury', undefined, new Rng(1)).ok).toBe(false); // needs alchemy 2 + mats
    ch.mats = { moonpetal: 20, emberbloom: 10, iron_ore: 20 };
    ch.potions = 0;
    expect(craft(ch, 'r_potion', undefined, new Rng(1)).ok).toBe(true);
    expect(ch.potions).toBe(1);
    expect(ch.mats.moonpetal).toBe(17);
    ch.prof.alchemy = { lv: 2, xp: 0 };
    const before = computeStats(ch).m.dmgPct ?? 0;
    expect(craft(ch, 'r_fury', undefined, new Rng(1)).ok).toBe(true);
    expect(ch.elixir?.id).toBe('elixir_fury');
    void before; void ELIXIRS;
    const f = craft(ch, 'r_forge_rare', 'helmet', new Rng(5));
    expect(f.ok && f.value.item?.slot).toBe('helmet');
    expect(f.ok && f.value.item?.rarity).toBe('rare');
    expect(ch.prof.smithing!.xp).toBeGreaterThan(0);
    expect(ch.dust).toBe(90);
  });
  it('core enforces NPC proximity, profession gates on nodes, and elixir mods reach combat stats', () => {
    const persist: Persistence = { saveCharacter: async () => {}, saveAccount: async () => {}, audit: () => {}, transact: async () => {}, loadShared: async () => ({ guilds: [], listings: [] }) };
    const core = new GameCore(persist);
    const inbox: any[] = [];
    const r = createCharacter('a', 'Herbie', 'ranger', false); if (!r.ok) throw 0;
    r.value.level = 15; r.value.mats = { moonpetal: 10, emberbloom: 5 }; r.value.prof = { alchemy: { lv: 2, xp: 0 } };
    core.connect('s', 'a', r.value, emptyAccount(), (m) => inbox.push(m));
    const s = core.sessions.get('s')!;
    core.handle('s', { t: 'craft', recipe: 'r_fury' });
    expect(inbox.some((m) => m.t === 'err' && /Maelis/.test(m.msg))).toBe(true);
    const town = core.rooms.get('town')!;
    const npc = town.world.map.interactables.find((i) => i.type === 'npc_alchemist')!;
    const e = town.world.ents.get(s.entId)!; e.x = npc.x; e.y = npc.y + 40;
    core.handle('s', { t: 'craft', recipe: 'r_fury' });
    core.tick(1 / 30);
    expect(e.stats!.m.dmgPct ?? 0).toBeGreaterThanOrEqual(12);
    // starsteel vein needs Mining 4
    core.handle('s', { t: 'leave' });
    const hl = core.rooms.get('highlands')!;
    const vein = hl.world.map.interactables.find((i) => i.res === 'starsteel')!;
    (core as any).moveTo(s, 'highlands', { x: vein.x, y: vein.y + 30 });
    core.handle('s', { t: 'interact' });
    expect(inbox.some((m) => m.t === 'toast' && /Mining level 4/.test(m.msg))).toBe(true);
  });
});

describe('world: 10 farm zones and the bestiary', async () => {
  const S = await import('../src/index.js');
  it('has 500+ monster types including bosses, each with a Thai name and a valid look', () => {
    const gen = Object.values(S.BESTIARY);
    expect(gen.length).toBeGreaterThanOrEqual(500);
    expect(gen.filter((e) => e.role === 'boss').length).toBe(40);
    for (const e of gen) { expect(S.ENEMIES[e.id]).toBe(e); expect(S.CONTENT_TH[`enemy.${e.id}`]).toBeTruthy(); }
    for (const e of gen) for (const a of e.attacks) if (a.kind === 'summon') expect(S.ENEMIES[a.summon!], `${e.id} summons ${a.summon}`).toBeTruthy();
  });
  it('builds 10 wide, connected zones whose level bands cover 1-100 and whose gates chain together', () => {
    expect(S.ZONES.length).toBe(10);
    expect(S.ZONES[0]!.levelMin).toBe(1); expect(S.ZONES.at(-1)!.levelMax).toBe(100);
    for (const [i, z] of S.ZONES.entries()) {
      const m = S.buildZone(z.id);
      expect(m.w * m.h).toBeGreaterThanOrEqual(220 * 150);
      const reach = S.reachableSet(m, m.spawn.x, m.spawn.y);
      for (const it of m.interactables) { const tx = Math.floor(it.x / 32), ty = Math.floor(it.y / 32); expect([[0, 0], [1, 0], [-1, 0], [0, 1], [0, -1]].some(([dx, dy]) => reach.has((ty + dy!) * m.w + tx + dx!)), `${z.id}:${it.id}`).toBe(true); }
      expect(m.spawns.every((s) => s.level! >= z.levelMin && s.level! <= z.levelMax), z.id).toBe(true);
      expect(m.spawns.filter((s) => S.ENEMIES[s.enemy]!.boss).length).toBe(4);
      const gates = m.interactables.filter((g) => g.type === 'zone_gate').map((g) => g.to);
      expect(gates).toContain(i === 0 ? 'town' : S.ZONES[i - 1]!.id);
      if (i < 9) expect(gates).toContain(S.ZONES[i + 1]!.id);
    }
  });
  it('gives every town service its own reachable NPC', () => {
    const t = S.buildTown();
    const reach = S.reachableSet(t, t.spawn.x, t.spawn.y);
    const types = t.interactables.map((i) => i.type);
    expect(new Set(types).size).toBe(types.length);
    for (const [type] of S.TOWN_NPCS) expect(types).toContain(type);
    for (const it of t.interactables) { const tx = Math.floor(it.x / 32), ty = Math.floor(it.y / 32); expect([[0, 0], [1, 0], [-1, 0], [0, 1], [0, -1]].some(([dx, dy]) => reach.has((ty + dy!) * t.w + tx + dx!)), it.id).toBe(true); }
  });
});
