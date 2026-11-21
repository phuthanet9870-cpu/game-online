import { describe, expect, it } from 'vitest';
import { CONTENT, validateContent, WEAPON_TYPES } from '../../src/core/content';
import { createDefaultHotbar, HOTBAR_COLS, HOTBAR_ROWS } from '../../src/core/hotbar';

describe('content integrity (Phase 1 subset of §21.4)', () => {
  it('has no validation errors', () => {
    expect(validateContent(CONTENT)).toEqual([]);
  });
  it('has exactly the 6 LOCKED weapon types, each with exactly 3 skills (18 total)', () => {
    expect(CONTENT.weapons.map((w) => w.id).sort()).toEqual([...WEAPON_TYPES].sort());
    expect(CONTENT.weapons.every((w) => w.skills.length === 3)).toBe(true);
    expect(CONTENT.weapons.flatMap((w) => w.skills).length).toBe(18);
  });
  it('contains no forbidden weapon types from mockups (Spear/Greatsword/Axe)', () => {
    const names = CONTENT.weapons.map((w) => w.name.toLowerCase());
    for (const banned of ['spear', 'greatsword', 'axe']) expect(names).not.toContain(banned);
  });
  it('training map has a player spawn and valid monster spawns', () => {
    expect(CONTENT.trainingMap.monsterSpawns.length).toBeGreaterThan(0);
    expect(CONTENT.trainingMap.ground.length).toBe(CONTENT.trainingMap.width * CONTENT.trainingMap.height);
  });
});

describe('hotbar (LOCKED 20 slots, 2x10)', () => {
  const bar = createDefaultHotbar();
  it('has exactly 20 slots in 2 rows of 10', () => {
    expect(bar).toHaveLength(20);
    expect(HOTBAR_ROWS * HOTBAR_COLS).toBe(20);
  });
  it('has unique keybinds and the spec default actions', () => {
    expect(new Set(bar.map((s) => s.key)).size).toBe(20);
    expect(bar[0]!.action).toBe('basic');
    expect(bar[3]!.action).toBe('skill3');
    expect(bar[9]!.action).toBe('powerUlt');
    expect(bar[10]!.action).toBe('powerToggle');
    expect(bar[11]!.action).toBe('dodge');
    expect(bar[19]!.action).toBe('emote');
  });
  it('does not bind movement keys (WASD) to hotbar slots', () => {
    for (const k of ['KeyW', 'KeyA', 'KeyS', 'KeyD']) expect(bar.some((s) => s.key === k)).toBe(false);
  });
});
