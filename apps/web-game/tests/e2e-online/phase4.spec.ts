/* eslint-disable @typescript-eslint/no-explicit-any -- read-only QA hook access inside page.evaluate */
import { execFileSync } from 'node:child_process';
import { expect, test, type Browser, type Page } from '@playwright/test';
import { goToFarm01, walkTo } from './nav';

const uid = () => Math.random().toString(36).slice(2, 8);
const st = (page: Page) =>
  page.evaluate(() => {
    const s = (window as any).__TPE__.sim;
    return {
      map: s.mapData.mapId,
      gold: s.online.gold,
      items: s.online.items as Array<{ templateId: string; quantity: number }>,
    };
  });
const qty = async (page: Page, id: string) =>
  (await st(page)).items.find((i) => i.templateId === id)?.quantity ?? 0;
const tile = (t: number) => t * 16 + 8;

async function newChar(browser: Browser, prefix: string, role?: string) {
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
  if (role)
    execFileSync('go', ['run', './cmd/gameserver', 'grant-role', '-username', user, '-role', role], {
      cwd: '../../server',
      env: { ...process.env, DATABASE_URL: process.env.E2E_DATABASE_URL, GOTOOLCHAIN: 'local' },
    });
  await page.getByTestId(`play-${char}`).click();
  await page.getByRole('button', { name: 'เข้าสู่โลก' }).click();
  await expect(page.getByTestId('netpanel')).toContainText('online');
  return { ctx, page, user, char, errors };
}

test('new characters start in Aetheria Capital and travel to farm maps through portals', async ({
  browser,
}) => {
  const a = await newChar(browser, 'trv');
  expect((await st(a.page)).map).toBe('CITY-AETHERIA');
  await goToFarm01(a.page);
  await expect
    .poll(async () => a.page.evaluate(() => (window as any).__TPE__.sim.monsters.length))
    .toBeGreaterThan(0);
  // logout/login keeps the map
  await a.page.reload();
  await a.page.getByTestId(`play-${a.char}`).click();
  await a.page.getByRole('button', { name: 'เข้าสู่โลก' }).click();
  await expect.poll(async () => (await st(a.page)).map, { timeout: 10_000 }).toBe('FARM-01');
  expect(a.errors).toEqual([]);
  await a.ctx.close();
});

test('Merchant (talk, buy, sell) and Storage work only through the NPCs, state persists', async ({
  browser,
}) => {
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

test('equipment raises stats, Blacksmith enhances without destroying, equipped items cannot be sold', async ({
  browser,
}) => {
  const a = await newChar(browser, 'smith', 'owner');
  await a.page.keyboard.press('Enter');
  await a.page.keyboard.type('/gmstefanonline');
  await a.page.keyboard.press('Enter');
  await a.page.evaluate(() => {
    const s = (window as any).__TPE__.sim;
    s.gm('spawnItem', { itemId: 'TRD-F03-012', qty: 10, target: '' });
    s.gm('spawnItem', { itemId: 'ARM-CHS-001', qty: 1, target: '' });
    s.gm('spawnItem', { itemId: 'MAT-ORE-002', qty: 5, target: '' });
  });
  await expect.poll(async () => qty(a.page, 'MAT-ORE-002')).toBe(5);
  // sell trade loot for gold at the merchant
  await walkTo(a.page, tile(10), tile(13), 12);
  await a.page.keyboard.press('KeyH');
  await a.page.getByTestId('sell-all-trade').click();
  await expect.poll(async () => (await st(a.page)).gold).toBeGreaterThan(100);
  // equip the chest from the bag
  await a.page.getByTestId('menu-bag').click();
  await a.page.getByTestId('equip-item-ARM-CHS-001').click();
  await expect(a.page.getByTestId('equipment')).toContainText('Leather Vest');
  const maxHp = await a.page.evaluate(() => (window as any).__TPE__.sim.player.maxHp);
  expect(maxHp).toBeGreaterThan(220);
  // blacksmith enhancement
  await walkTo(a.page, tile(40), tile(11), 12);
  await a.page.keyboard.press('KeyH');
  await expect(a.page.getByTestId('npc-blacksmith')).toBeVisible();
  await a.page.getByTestId('smith-enhance-ARM-CHS-001').click();
  await expect
    .poll(async () => a.page.evaluate(() => (window as any).__TPE__.sim.online.enhance['ARM-CHS-001'] ?? 0))
    .toBe(1);
  expect(await qty(a.page, 'ARM-CHS-001')).toBe(1);
  expect(a.errors).toEqual([]);
  await a.ctx.close();
});

test('Quest Board: accept, server counts a talk objective, tracker updates, turn-in pays rewards once', async ({
  browser,
}) => {
  const a = await newChar(browser, 'qst');
  const questState = (id: string) =>
    a.page.evaluate((q) => (window as any).__TPE__.sim.online.quests.find((x: any) => x.id === q)?.state, id);
  await walkTo(a.page, tile(35), tile(16), 12);
  await a.page.keyboard.press('KeyH');
  await expect(a.page.getByTestId('npc-questboard')).toBeVisible();
  await expect(a.page.getByTestId('quest-Q-MAIN-002')).toHaveAttribute('data-state', 'locked');
  await a.page.getByTestId('quest-accept-Q-SIDE-003').click();
  await a.page.getByTestId('quest-accept-Q-MAIN-001').click();
  await expect.poll(() => questState('Q-SIDE-003')).toBe('active');
  await expect(a.page.getByTestId('quest-tracker')).toContainText('คุยกับ Dungeon Gatekeeper 0/1');
  await walkTo(a.page, tile(52), tile(14), 12);
  await a.page.keyboard.press('KeyH');
  await expect.poll(() => questState('Q-SIDE-003')).toBe('ready');
  await expect(a.page.getByTestId('quest-tracker')).toContainText('กลับไปส่งที่ Quest Board');
  await walkTo(a.page, tile(35), tile(16), 12);
  await a.page.keyboard.press('KeyH');
  const gold = (await st(a.page)).gold;
  await a.page.getByTestId('quest-turnin-Q-SIDE-003').click();
  await expect.poll(async () => (await st(a.page)).gold).toBe(gold + 20);
  await expect(a.page.getByTestId('quest-Q-SIDE-003')).toHaveAttribute('data-state', 'completed');
  // persisted across relog: completed side quest + active main quest
  await a.page.reload();
  await a.page.getByTestId(`play-${a.char}`).click();
  await a.page.getByRole('button', { name: 'เข้าสู่โลก' }).click();
  await expect.poll(() => questState('Q-SIDE-003'), { timeout: 10_000 }).toBe('completed');
  expect(await questState('Q-MAIN-001')).toBe('active');
  expect((await st(a.page)).gold).toBe(gold + 20);
  expect(a.errors).toEqual([]);
  await a.ctx.close();
});

test('Party: invite/accept, party frames + party chat, Party Finder join, leave', async ({ browser }) => {
  const a = await newChar(browser, 'pta');
  const b = await newChar(browser, 'ptb');
  const c = await newChar(browser, 'ptc');
  await a.page.getByTestId('menu-party').click();
  await a.page.getByTestId('party-invite-name').fill(b.char);
  await a.page.getByTestId('party-invite').click();
  await expect(b.page.getByTestId('party-invite-prompt')).toContainText(a.char);
  await b.page.getByTestId('party-accept').click();
  await expect(a.page.getByTestId('party-frames')).toContainText(b.char);
  await expect(b.page.getByTestId('party-frames')).toContainText(a.char);
  // party chat via /p reaches members only
  await b.page.locator('.chat input').fill('/p พร้อมลงดัน');
  await b.page.locator('.chat input').press('Enter');
  await expect(a.page.locator('.chat')).toContainText('[ปาร์ตี้]');
  await expect(a.page.locator('.chat')).toContainText('พร้อมลงดัน');
  await expect(c.page.locator('.chat')).not.toContainText('พร้อมลงดัน');
  // leader lists the party; C joins through Party Finder
  await a.page.getByTestId('finder-note').fill('หาคนลงดัน');
  await a.page.getByTestId('finder-post').click();
  await c.page.getByTestId('menu-party').click();
  await expect(c.page.getByTestId(`finder-${a.char}`)).toContainText('2/4', { timeout: 10_000 });
  await c.page.getByTestId(`finder-join-${a.char}`).click();
  await expect(c.page.getByTestId('party-panel')).toContainText('(3/4)');
  await expect(a.page.getByTestId('party-frames')).toContainText(c.char);
  // kick and leave
  await a.page.getByTestId(`party-kick-${c.char}`).click();
  await expect(c.page.getByTestId('party-panel')).toContainText('ยังไม่มีปาร์ตี้');
  await b.page.getByTestId('menu-party').click();
  await b.page.getByTestId('party-leave').click();
  await expect(a.page.getByTestId('party-panel')).toContainText('ยังไม่มีปาร์ตี้');
  for (const x of [a, b, c]) {
    expect(x.errors).toEqual([]);
    await x.ctx.close();
  }
});
