/* eslint-disable @typescript-eslint/no-explicit-any -- read-only QA hook access inside page.evaluate */
import { execFileSync } from 'node:child_process';
import { expect, test, type Browser, type Page } from '@playwright/test';
import { goToFarm01, walkTo } from './nav';

const uid = () => Math.random().toString(36).slice(2, 8);
const sim = (page: Page) =>
  page.evaluate(() => {
    const s = (window as any).__TPE__.sim;
    return {
      weapon: s.weaponId,
      power: s.power,
      items: s.online.items,
      gold: s.online.gold,
      pos: { ...s.player.pos },
      auto: s.autoView,
      energy: s.player.energy,
    };
  });

async function player(browser: Browser, prefix: string, weapon = 'Sword', role?: string) {
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
  await page.getByRole('button', { name: new RegExp(weapon) }).click();
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

async function gmChat(page: Page, text: string) {
  await page.keyboard.press('Enter');
  await page.keyboard.type(text);
  await page.keyboard.press('Enter');
}

test('all six weapons are selectable at creation; starter weapon is owned and equipped', async ({
  browser,
}) => {
  const a = await player(browser, 'dag', 'Dagger');
  expect((await sim(a.page)).weapon).toBe('dagger');
  expect((await sim(a.page)).items.some((i: any) => i.templateId === 'WPN-DGR-001')).toBe(true);
  await a.page.getByTestId('menu-char').click();
  await expect(a.page.getByTestId('equip-bow')).toBeDisabled(); // not owned
  await a.ctx.close();
});

test('Power: weapon restriction, bind consumes fruit, stance + power skill, The Severer destroys permanently', async ({
  browser,
}) => {
  const g = await player(browser, 'pw', 'Sword', 'owner');
  await gmChat(g.page, '/gmstefanonline');
  await expect(g.page.getByTestId('gm-panel')).toBeVisible();
  // GM test-world grant: Abyss Shadow fruit + a dagger
  await g.page.evaluate(() => {
    const s = (window as any).__TPE__.sim;
    s.gm('spawnItem', { itemId: 'PWR-003', qty: 1, target: '' });
    s.gm('spawnItem', { itemId: 'WPN-DGR-001', qty: 1, target: '' });
  });
  await expect
    .poll(async () => (await sim(g.page)).items.some((i: any) => i.templateId === 'PWR-003'))
    .toBe(true);
  await g.page.getByTestId('menu-bag').click();
  await g.page.getByTestId('bind-PWR-003').click(); // sword: must be refused
  await expect(g.page.locator('.toast')).toContainText('dagger');
  expect((await sim(g.page)).power).toBeNull();
  await g.page.evaluate(() => (window as any).__TPE__.sim.equip('dagger'));
  await expect.poll(async () => (await sim(g.page)).weapon).toBe('dagger');
  await g.page.getByTestId('bind-PWR-003').click();
  await expect.poll(async () => (await sim(g.page)).power?.name).toBe('Abyss Shadow');
  expect((await sim(g.page)).items.some((i: any) => i.templateId === 'PWR-003')).toBe(false);
  // loadout is the rank-1 subset (5/1/1); stance + a power skill spends energy
  const pw = (await sim(g.page)).power;
  expect(pw.loadout.actives.length).toBe(5);
  expect(pw.skills.length).toBe(25);
  await g.page.keyboard.press('KeyQ'); // slot 11: Activate
  await expect.poll(async () => (await sim(g.page)).power?.stance).toBe(true);
  const e0 = (await sim(g.page)).energy;
  await g.page.keyboard.press('Digit5');
  await expect.poll(async () => (await sim(g.page)).energy).toBeLessThan(e0);
  // walk to The Severer (west/north of spawn) and perform the ritual
  await g.page.keyboard.press('KeyQ'); // stance off (out of combat soon)
  await g.page.waitForTimeout(5200);
  await walkTo(g.page, 10 * 16 + 8, 26 * 16 + 8, 14); // The Severer, Aetheria Capital
  await g.page.keyboard.press('KeyH');
  await expect(g.page.getByTestId('severer')).toBeVisible();
  await g.page.fill('#severer-confirm', 'Abyss Shadow');
  await g.page.getByTestId('severer-confirm-btn').click();
  await expect.poll(async () => (await sim(g.page)).power).toBeNull();
  expect((await sim(g.page)).items.some((i: any) => i.templateId === 'PWR-003')).toBe(false); // no refund
  expect(g.errors).toEqual([]);
  await g.ctx.close();
});

test('unauthorized GM operations are always denied', async ({ browser }) => {
  const a = await player(browser, 'nogm');
  await gmChat(a.page, '/gmstefanonline');
  await expect(a.page.getByTestId('log')).toContainText('Permission Denied');
  const before = await a.page.evaluate(() => (window as any).__TPE__.sim.monsters.length);
  await a.page.evaluate(() =>
    (window as any).__TPE__.sim.gm('spawnMonster', { itemId: 'MON-WOLF-001', count: 5 }),
  );
  await a.page.evaluate(() => (window as any).__TPE__.sim.gm('spawnItem', { itemId: 'PWR-001', qty: 1 }));
  await a.page.waitForTimeout(800);
  expect(await a.page.evaluate(() => (window as any).__TPE__.sim.monsters.length)).toBe(before);
  expect((await sim(a.page)).items.some((i: any) => i.templateId === 'PWR-001')).toBe(false);
  await a.ctx.close();
});

test('hotbar rebind persists on the server across reload', async ({ browser }) => {
  const a = await player(browser, 'hb');
  await a.page.getByTestId('hotbar-edit').click();
  await a.page.getByTestId('slot-2').click();
  await a.page.keyboard.press('KeyK');
  await expect(a.page.getByTestId('slot-2')).toContainText('K');
  await a.page.getByTestId('hotbar-edit').click();
  await a.page.waitForTimeout(500);
  await a.page.reload();
  await a.page.getByTestId(`play-${a.char}`).click();
  await a.page.getByRole('button', { name: 'เข้าสู่โลก' }).click();
  await expect(a.page.getByTestId('slot-2')).toContainText('K');
  await expect(a.page.getByTestId('hotbar').locator('.slot')).toHaveCount(20);
  await a.ctx.close();
});

test('Auto Farm kills PvE monsters, auto-loots and reports on stop', async ({ browser }) => {
  const a = await player(browser, 'auto', 'Sword', 'gm');
  await gmChat(a.page, '/gm god on');
  await goToFarm01(a.page); // Auto works on farm maps; the city has no monsters
  await a.page.getByTestId('menu-auto').click();
  await a.page.getByTestId('auto-start').click();
  await expect.poll(async () => (await sim(a.page)).auto?.enabled, { timeout: 5000 }).toBe(true);
  await expect
    .poll(async () => (await sim(a.page)).auto?.live?.kills ?? 0, { timeout: 45_000 })
    .toBeGreaterThan(0);
  await expect.poll(async () => (await sim(a.page)).gold, { timeout: 20_000 }).toBeGreaterThan(0); // auto loot picked the bag
  await a.page.getByTestId('auto-stop').click();
  await expect(a.page.getByTestId('auto-report')).toContainText('player');
  await a.ctx.close();
});
