/* eslint-disable @typescript-eslint/no-explicit-any -- read-only QA hook access inside page.evaluate */
import { expect, type Page } from '@playwright/test';

/** Greedy keyboard walk to a world position (stops within `tol` px). */
export async function walkTo(page: Page, x: number, y: number, tol = 10, maxSteps = 120): Promise<void> {
  const startMap = await mapId(page);
  for (let i = 0; i < maxSteps; i++) {
    if ((await mapId(page)) !== startMap) return; // portal crossed: coordinates no longer apply
    const p = await page.evaluate(() => ({ ...(window as any).__TPE__.sim.player.pos }));
    const dx = x - p.x;
    const dy = y - p.y;
    if (Math.hypot(dx, dy) <= tol) return;
    const keys = [dx > 3 ? 'KeyD' : dx < -3 ? 'KeyA' : '', dy > 3 ? 'KeyS' : dy < -3 ? 'KeyW' : ''].filter(Boolean);
    for (const k of keys) await page.keyboard.down(k);
    await page.waitForTimeout(110);
    for (const k of keys) await page.keyboard.up(k);
  }
}

const mapId = (page: Page) => page.evaluate(() => (window as any).__TPE__.sim.mapData.mapId as string);

/** From the Aetheria spawn, walk through the east gate portal into FARM-01 Greenfield Plains. */
export async function goToFarm01(page: Page): Promise<void> {
  if ((await mapId(page)) === 'FARM-01') return;
  await walkTo(page, 40 * 16 + 8, 23 * 16 + 8, 12);
  await walkTo(page, 40 * 16 + 8, 19 * 16 + 8, 12);
  await walkTo(page, 63 * 16, 19 * 16 + 8, 4, 200);
  await expect.poll(() => mapId(page), { timeout: 10_000 }).toBe('FARM-01');
}
