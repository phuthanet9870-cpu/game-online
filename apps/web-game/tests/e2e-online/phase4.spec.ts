/* eslint-disable @typescript-eslint/no-explicit-any -- read-only QA hook access inside page.evaluate */
import { expect, test, type Browser, type Page } from '@playwright/test';
import { goToFarm01, walkTo } from './nav';

const uid = () => Math.random().toString(36).slice(2, 8);
const st = (page: Page) =>
  page.evaluate(() => {
    const s = (window as any).__TPE__.sim;
    return { map: s.mapData.mapId, gold: s.online.gold, items: s.online.items as Array<{ templateId: string; quantity: number }> };
  });
const qty = async (page: Page, id: string) => (await st(page)).items.find((i) => i.templateId === id)?.quantity ?? 0;
const tile = (t: number) => t * 16 + 8;

async function newChar(browser: Browser, prefix: string) {
  const ctx = await browser.newContext();
  const page = await ctx.newPage();
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  const user = `${prefix}${uid()}`.slice(0, 16);
  const char = `C${uid()}`;
  await page.goto('/');
  await page.getByRole('button', { name: 'สมัครบัญชี' }).click();
  await page.fill('#auth-username', user);
  await page.fill('#auth-password', 'password123');
  await page.getByRole('button', { name: 'สมัครและเข้าสู่ระบบ' }).click();
  await page.fill('#char-name', char);
  await page.getByRole('button', { name: 'สร้างตัวละคร' }).click();
  await page.getByTestId(`play-${char}`).click();
  await page.getByRole('button', { name: 'เข้าสู่โลก' }).click();
  await expect(page.getByTestId('netpanel')).toContainText('online');
  return { ctx, page, user, char, errors };
}

test('new characters start in Aetheria Capital and travel to farm maps through portals', async ({ browser }) => {
  const a = await newChar(browser, 'trv');
  expect((await st(a.page)).map).toBe('CITY-AETHERIA');
  await goToFarm01(a.page);
  await expect.poll(async () => a.page.evaluate(() => (window as any).__TPE__.sim.monsters.length)).toBeGreaterThan(0);
  // logout/login keeps the map
  await a.page.reload();
  await a.page.getByTestId(`play-${a.char}`).click();
  await a.page.getByRole('button', { name: 'เข้าสู่โลก' }).click();
  await expect.poll(async () => (await st(a.page)).map, { timeout: 10_000 }).toBe('FARM-01');
  expect(a.errors).toEqual([]);
  await a.ctx.close();
});

test('Merchant (talk, buy, sell) and Storage work only through the NPCs, state persists', async ({ browser }) => {
  const a = await newChar(browser, 'shop');
  await walkTo(a.page, tile(10), tile(13), 12);
  await a.page.keyboard.press('KeyH');
  await expect(a.page.getByTestId('npc-merchant')).toBeVisible();
  await a.page.getByTestId('buy-CON-001').click(); // 0 gold
  await expect(a.page.locator('.toast')).toContainText('Gold');
  const potions = await qty(a.page, 'CON-001');
  await a.page.getByRole('button', { name: /ขาย 1/ }).first().click();
  await expect.poll(async () => (await st(a.page)).gold).toBeGreaterThan(0);
  expect(await qty(a.page, 'CON-001')).toBe(potions - 1);
  // storage keeper
  await walkTo(a.page, tile(26), tile(11), 12);
  await a.page.keyboard.press('KeyH');
  await expect(a.page.getByTestId('npc-storage')).toBeVisible();
  await a.page.getByTestId('deposit-CON-001').click();
  await expect.poll(async () => qty(a.page, 'CON-001')).toBe(0);
  await expect(a.page.getByTestId('withdraw-CON-001')).toBeVisible();
  await a.page.getByTestId('withdraw-CON-001').click();
  await expect.poll(async () => qty(a.page, 'CON-001')).toBe(potions - 1);
  // re-login: gold persisted from the ledger
  const gold = (await st(a.page)).gold;
  await a.page.waitForTimeout(500);
  await a.page.getByTestId('menu-exit').click();
  await expect(a.page.getByTestId('chars')).toContainText(`Gold ${gold}`);
  expect(a.errors).toEqual([]);
  await a.ctx.close();
});
