/* eslint-disable @typescript-eslint/no-explicit-any -- browser-side QA hook access inside page.evaluate */
import { expect, test, type Page } from '@playwright/test';

/**
 * Phase 1 Acceptance Gate — browser smoke test driven by real keyboard/mouse input.
 * `window.__TPE__` is a read-only QA hook used only to *observe* state (no state is written).
 */

interface Gate {
  id: string;
  done: boolean;
  required: boolean;
}

const tel = (page: Page) => page.evaluate(() => (window as any).__TPE__.sim.telemetry);
const gate = (page: Page) => page.evaluate(() => (window as any).__TPE__.gate() as Gate[]);

async function holdKeys(page: Page, keys: string[], ms: number) {
  for (const k of keys) await page.keyboard.down(k);
  await page.waitForTimeout(ms);
  for (const k of keys) await page.keyboard.up(k);
}

/** Screen position of the nearest living monster (for a real mouse click aim). */
async function nearestMonsterScreen(page: Page): Promise<{ x: number; y: number; d: number } | null> {
  return page.evaluate(() => {
    const w = window as any;
    const sim = w.__TPE__.sim;
    const cam = w.__PHASER_GAME__.scene.getScene('world').cameras.main;
    const p = sim.player.pos;
    let best: any = null;
    for (const m of sim.monsters) {
      if (m.ai === 'DEAD') continue;
      const d = Math.hypot(m.pos.x - p.x, m.pos.y - p.y);
      if (!best || d < best.d) best = { m, d };
    }
    if (!best) return null;
    return {
      x: (best.m.pos.x - cam.worldView.x) * cam.zoom,
      y: (best.m.pos.y - cam.worldView.y) * cam.zoom,
      d: best.d,
    };
  });
}

test('Phase 1 gate: load, move 8-dir, collide, fight, 3 sword skills, dodge, kill, respawn', async ({
  page,
}) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => {
    if (m.type() === 'error') errors.push(m.text());
  });

  await page.goto('/');
  await page.getByRole('button', { name: 'เล่น Sandbox ออฟไลน์' }).click();
  await expect(page.locator('#game-root canvas')).toBeVisible();
  await expect(page.getByTestId('hotbar').locator('.slot')).toHaveCount(20);
  await page.getByRole('button', { name: 'เริ่มทดสอบ' }).click();

  // 8 directions
  for (const keys of [
    ['KeyW'],
    ['KeyS'],
    ['KeyD'],
    ['KeyA'],
    ['KeyW', 'KeyD'],
    ['KeyW', 'KeyA'],
    ['KeyS', 'KeyD'],
    ['KeyS', 'KeyA'],
  ])
    await holdKeys(page, keys, 220);
  expect(await page.evaluate(() => (window as any).__TPE__.facings.size)).toBe(8);

  // collision: walk west into the tree border
  const before = await page.evaluate(() => ({ ...(window as any).__TPE__.sim.player.pos }));
  await holdKeys(page, ['KeyA'], 2500);
  const after = await page.evaluate(() => ({ ...(window as any).__TPE__.sim.player.pos }));
  expect(after.x).toBeLessThan(before.x);
  expect(after.x).toBeGreaterThanOrEqual(32); // 2-tile tree border is solid
  expect((await tel(page)).collisionBlocks).toBeGreaterThan(0);

  // dodge costs stamina
  await page.keyboard.down('KeyD');
  await page.keyboard.press('Space');
  await page.keyboard.up('KeyD');
  expect((await tel(page)).dashStaminaSpent).toBeGreaterThan(0);

  // walk toward the slimes, then fight with mouse-aimed attacks and the 3 sword skills
  await holdKeys(page, ['KeyD'], 1800);
  const skillKeys = ['Digit2', 'Digit3', 'Digit4'];
  let i = 0;
  const deadline = Date.now() + 40_000;
  while ((await tel(page)).monstersKilled < 1 && Date.now() < deadline) {
    const t = await nearestMonsterScreen(page);
    if (t && t.d > 26) {
      // approach
      const sim = await page.evaluate(() => (window as any).__TPE__.sim.player.pos);
      const mon = await page.evaluate(() => {
        const s = (window as any).__TPE__.sim;
        const alive = s.monsters.filter((m: any) => m.ai !== 'DEAD');
        alive.sort(
          (a: any, b: any) =>
            Math.hypot(a.pos.x - s.player.pos.x, a.pos.y - s.player.pos.y) -
            Math.hypot(b.pos.x - s.player.pos.x, b.pos.y - s.player.pos.y),
        );
        return alive[0]?.pos;
      });
      const keys: string[] = [];
      if (mon.x > sim.x + 6) keys.push('KeyD');
      if (mon.x < sim.x - 6) keys.push('KeyA');
      if (mon.y > sim.y + 6) keys.push('KeyS');
      if (mon.y < sim.y - 6) keys.push('KeyW');
      await holdKeys(page, keys, 150);
      continue;
    }
    if (t) await page.mouse.click(t.x, t.y);
    if (i < 3 * 4 && i % 4 === 0) await page.keyboard.press(skillKeys[(i / 4) % 3] as string);
    i++;
    await page.waitForTimeout(260);
  }
  const t1 = await tel(page);
  expect(t1.damageDealt).toBeGreaterThan(0);
  expect(t1.monstersKilled).toBeGreaterThanOrEqual(1);

  // make sure all 3 skills were used (cooldowns may have blocked some above)
  for (const k of skillKeys) {
    await page.keyboard.press(k);
    await page.waitForTimeout(900);
  }
  const t2 = await tel(page);
  for (const id of ['sword_triple_slash', 'sword_guard_break', 'sword_counter_slash'])
    expect(t2.actionsUsed[id] ?? 0, id).toBeGreaterThan(0);

  // monster respawn (slime respawn is 5s; wolves 7s)
  await expect.poll(async () => (await tel(page)).monsterRespawns, { timeout: 12_000 }).toBeGreaterThan(0);

  const g = await gate(page);
  const missing = g.filter((x) => x.required && !x.done).map((x) => x.id);
  expect(missing).toEqual([]);
  await expect(page.getByTestId('gate')).toContainText('ผ่านเงื่อนไขฝั่ง client ครบแล้ว');

  await page.screenshot({ path: 'test-results/phase1-gate.png' });
  expect(errors).toEqual([]);
});

test('GM command is denied client-side and chat input does not leak keys to the game', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: 'เล่น Sandbox ออฟไลน์' }).click();
  await page.getByRole('button', { name: 'เริ่มทดสอบ' }).click();
  const start = await page.evaluate(() => ({ ...(window as any).__TPE__.sim.player.pos }));
  await page.keyboard.press('Enter');
  await expect(page.locator('#chat-input')).toBeFocused();
  await page.keyboard.type('/gmstefanonline dddd');
  await page.locator('#chat-input').fill('/gmstefanonline');
  await page.keyboard.press('Enter');
  await expect(page.getByTestId('log')).toContainText('Permission Denied');
  const end = await page.evaluate(() => ({ ...(window as any).__TPE__.sim.player.pos }));
  expect(end).toEqual(start); // typing "dddd" in chat must not move the player
});

test('resize keeps an integer pixel zoom and the 20-slot hotbar', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: 'เล่น Sandbox ออฟไลน์' }).click();
  await page.setViewportSize({ width: 1920, height: 1080 });
  await page.waitForTimeout(300);
  expect(await page.evaluate(() => (window as any).__TPE__.zoom())).toBe(3);
  await page.setViewportSize({ width: 800, height: 600 });
  await page.waitForTimeout(300);
  const z = await page.evaluate(() => (window as any).__TPE__.zoom());
  expect(Number.isInteger(z)).toBe(true);
  await expect(page.getByTestId('hotbar').locator('.slot')).toHaveCount(20);
});
