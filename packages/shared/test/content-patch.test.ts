import { afterEach, describe, expect, it } from 'vitest';
import { ENEMIES, GameCore, LOOT_TUNING, RARITY_DEFS, SKILL_MAP, applyContentPatch, createCharacter, emptyAccount, validateContentPatch, type Persistence } from '../src/index.js';

afterEach(() => applyContentPatch(null));

describe('content patches', () => {
  it('validates ids and ranges', () => {
    expect(validateContentPatch({ skills: { nope: { cost: 1 } } }).ok).toBe(false);
    expect(validateContentPatch({ skills: { mag_fireball: { cooldown: 9999 } } }).ok).toBe(false);
    expect(validateContentPatch({ items: { a_hood: { weaponPower: 10 } } }).ok).toBe(false);
    expect(validateContentPatch({ enemies: { veyra: { hp: 6000 } }, loot: { dropChance: 0.3, rarityWeights: { legendary: 20 } } }).ok).toBe(true);
  });
  it('applies on top of the baseline and reverts cleanly', () => {
    const coef0 = (SKILL_MAP.mag_fireball!.effects[0] as any).dmg.coef;
    const veyraHp0 = ENEMIES.veyra!.hp;
    applyContentPatch({ skills: { mag_fireball: { cooldown: 3, coefMul: 2 } }, enemies: { veyra: { hp: 9999 } }, loot: { dropChance: 0.5, rarityWeights: { legendary: 50 } } });
    expect(SKILL_MAP.mag_fireball!.cooldown).toBe(3);
    expect((SKILL_MAP.mag_fireball!.effects[0] as any).dmg.coef).toBeCloseTo(coef0 * 2);
    applyContentPatch({ skills: { mag_fireball: { coefMul: 2 } } }); // applying again must not compound
    expect((SKILL_MAP.mag_fireball!.effects[0] as any).dmg.coef).toBeCloseTo(coef0 * 2);
    expect(ENEMIES.veyra!.hp).toBe(veyraHp0); // second patch dropped the hp override
    applyContentPatch(null);
    expect(SKILL_MAP.mag_fireball!.cooldown).toBe(0.8);
    expect(LOOT_TUNING.dropChance).toBe(0.22);
    expect(RARITY_DEFS.legendary.weight).toBe(10);
  });
  it('core publishes to connected clients and the server enforces the new cooldown', () => {
    const persist: Persistence = { saveCharacter: async () => {}, saveAccount: async () => {}, audit: () => {}, transact: async () => {}, loadShared: async () => ({ guilds: [], listings: [] }) };
    const core = new GameCore(persist);
    const inbox: any[] = [];
    const r = createCharacter('a', 'Tuner', 'mage', false); if (!r.ok) throw 0;
    core.connect('s', 'a', r.value, emptyAccount(), (m) => inbox.push(m));
    core.setContent({ skills: { mag_fireball: { cooldown: 10 } } });
    expect(inbox.some((m) => m.t === 'content' && m.patch.skills.mag_fireball.cooldown === 10)).toBe(true);
    const s = core.sessions.get('s')!;
    const town = core.rooms.get('town')!;
    const e = town.world.ents.get(s.entId)!; e.x = 4 * 32; e.y = 22 * 32;
    expect(town.world.castSkill(e.id, 'active', 0, e.x + 100, e.y)).toBeNull();
    expect(e.p!.cds.mag_fireball).toBeGreaterThan(9);
  });
});
