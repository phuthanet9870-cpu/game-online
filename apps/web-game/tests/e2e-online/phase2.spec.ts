/* eslint-disable @typescript-eslint/no-explicit-any -- read-only QA hook access inside page.evaluate */
import { execFileSync } from 'node:child_process';
import { expect, test, type Browser, type Page } from '@playwright/test';

const uid = () => Math.random().toString(36).slice(2, 8);

async function register(page: Page, username: string, charName: string) {
  await page.goto('/');
  await page.getByRole('button', { name: 'สมัครบัญชี' }).click();
  await page.fill('#auth-username', username);
  await page.fill('#auth-password', 'password123');
  await page.getByRole('button', { name: 'สมัครและเข้าสู่ระบบ' }).click();
  await expect(page.getByTestId('chars')).toBeVisible();
  await page.fill('#char-name', charName);
  await page.getByRole('button', { name: 'สร้างตัวละคร' }).click();
  await expect(page.getByTestId(`play-${charName}`)).toBeVisible();
}

async function enterWorld(page: Page, charName: string) {
  await page.getByTestId(`play-${charName}`).click();
  await page.getByRole('button', { name: 'เข้าสู่โลก' }).click();
  await expect(page.getByTestId('netpanel')).toContainText('online');
}

const hook = (page: Page) =>
  page.evaluate(() => {
    const s = (window as any).__TPE__.sim;
    return {
      kills: s.telemetry.monstersKilled,
      gold: s.online.gold,
      xp: s.online.xp,
      others: s.others.length,
      pos: { ...s.player.pos },
      status: s.online.status,
    };
  });

async function huntOne(page: Page) {
  const deadline = Date.now() + 45_000;
  while ((await hook(page)).kills < 1 && Date.now() < deadline) {
    const t = await page.evaluate(() => {
      const w = window as any;
      const s = w.__TPE__.sim;
      const cam = w.__PHASER_GAME__.scene.getScene('world').cameras.main;
      const p = s.player.pos;
      const m = s.monsters
        .filter((x: any) => x.ai !== 'DEAD')
        .sort(
          (a: any, b: any) =>
            Math.hypot(a.pos.x - p.x, a.pos.y - p.y) - Math.hypot(b.pos.x - p.x, b.pos.y - p.y),
        )[0];
      return m
        ? {
            d: Math.hypot(m.pos.x - p.x, m.pos.y - p.y),
            dx: m.pos.x - p.x,
            dy: m.pos.y - p.y,
            x: (m.pos.x - cam.worldView.x) * cam.zoom,
            y: (m.pos.y - cam.worldView.y) * cam.zoom,
          }
        : null;
    });
    if (!t) continue;
    if (t.d > 26) {
      const keys: string[] = [];
      if (t.dx > 6) keys.push('KeyD');
      if (t.dx < -6) keys.push('KeyA');
      if (t.dy > 6) keys.push('KeyS');
      if (t.dy < -6) keys.push('KeyW');
      for (const k of keys) await page.keyboard.down(k);
      await page.waitForTimeout(180);
      for (const k of keys) await page.keyboard.up(k);
      continue;
    }
    await page.mouse.click(t.x, t.y);
    await page.waitForTimeout(280);
  }
}

async function newPlayer(browser: Browser, name: string) {
  const ctx = await browser.newContext();
  const page = await ctx.newPage();
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
  const user = `${name}${uid()}`.slice(0, 16);
  const char = `C${uid()}`;
  await register(page, user, char);
  return { ctx, page, user, char, errors };
}

test('MVP online loop: register → character → kill → server rewards → refresh and re-login keep data', async ({
  browser,
}) => {
  const a = await newPlayer(browser, 'loop');
  // Phase 3: all six starter weapons are selectable
  for (const w of ['Staff', 'Sword', 'Dagger', 'Bow', 'Grimoire', 'Gauntlet'])
    await expect(a.page.getByRole('button', { name: new RegExp(w) })).toBeEnabled();
  await enterWorld(a.page, a.char);
  await a.page.keyboard.down('KeyD');
  await a.page.waitForTimeout(1500);
  await a.page.keyboard.up('KeyD');
  await huntOne(a.page);
  // Phase 3: Gold/items drop as a personal loot bag — walk onto it and press H
  for (let i = 0; i < 60 && (await hook(a.page)).gold === 0; i++) {
    const d = await a.page.evaluate(() => {
      const s = (window as any).__TPE__.sim;
      const b = s.drops[0];
      return b ? { dx: b.x - s.player.pos.x, dy: b.y - s.player.pos.y } : null;
    });
    if (!d) {
      await a.page.waitForTimeout(150);
      continue;
    }
    if (Math.hypot(d.dx, d.dy) > 16) {
      const keys = [
        d.dx > 4 ? 'KeyD' : d.dx < -4 ? 'KeyA' : '',
        d.dy > 4 ? 'KeyS' : d.dy < -4 ? 'KeyW' : '',
      ].filter(Boolean);
      for (const k of keys) await a.page.keyboard.down(k);
      await a.page.waitForTimeout(100);
      for (const k of keys) await a.page.keyboard.up(k);
    } else {
      await a.page.keyboard.press('KeyH');
      await a.page.waitForTimeout(300);
    }
  }
  await expect.poll(async () => (await hook(a.page)).gold, { timeout: 5000 }).toBeGreaterThan(0);
  const before = await hook(a.page);
  expect(before.xp).toBeGreaterThan(0);
  await expect(a.page.getByTestId('gold')).toHaveText(String(before.gold));

  // browser refresh → same session, same character state (in-memory authority within grace)
  await a.page.reload();
  await enterWorld(a.page, a.char);
  const afterRefresh = await hook(a.page);
  expect(afterRefresh.gold).toBe(before.gold);
  expect(afterRefresh.xp).toBe(before.xp);
  expect(Math.hypot(afterRefresh.pos.x - before.pos.x, afterRefresh.pos.y - before.pos.y)).toBeLessThan(24);

  // leave the world, log out, log in again → values come from PostgreSQL
  await a.page.getByTestId('menu-exit').click();
  await a.page.getByRole('button', { name: 'ออกจากระบบ' }).click();
  await a.page.fill('#auth-username', a.user);
  await a.page.fill('#auth-password', 'password123');
  await a.page.getByRole('button', { name: 'เข้าสู่ระบบ' }).last().click();
  await expect(a.page.getByTestId('chars')).toContainText(`Gold ${before.gold.toLocaleString()}`);
  expect(a.errors).toEqual([]);
  await a.ctx.close();
});

test('two players see each other and chat; unauthorized GM command is denied', async ({ browser }) => {
  const a = await newPlayer(browser, 'pa');
  const b = await newPlayer(browser, 'pb');
  await enterWorld(a.page, a.char);
  await enterWorld(b.page, b.char);
  await expect.poll(async () => (await hook(a.page)).others).toBeGreaterThanOrEqual(1);
  await expect.poll(async () => (await hook(b.page)).others).toBeGreaterThanOrEqual(1);

  await a.page.keyboard.press('Enter');
  await a.page.keyboard.type('hello-from-a');
  await a.page.keyboard.press('Enter');
  await expect(b.page.getByTestId('log')).toContainText('hello-from-a');

  await b.page.keyboard.press('Enter');
  await b.page.keyboard.type('/gmstefanonline');
  await b.page.keyboard.press('Enter');
  await expect(b.page.getByTestId('log')).toContainText('Permission Denied');
  await expect(b.page.getByTestId('gm-panel')).toHaveCount(0);
  expect([...a.errors, ...b.errors]).toEqual([]);
  await a.ctx.close();
  await b.ctx.close();
});

test('authorized GM (role granted via server CLI) opens the GM panel', async ({ browser }) => {
  const g = await newPlayer(browser, 'gm');
  execFileSync('go', ['run', './cmd/gameserver', 'grant-role', '-username', g.user, '-role', 'owner'], {
    cwd: '../../server',
    env: { ...process.env, DATABASE_URL: process.env.E2E_DATABASE_URL, GOTOOLCHAIN: 'local' },
  });
  await enterWorld(g.page, g.char);
  await g.page.keyboard.press('Enter');
  await g.page.keyboard.type('/gmstefanonline');
  await g.page.keyboard.press('Enter');
  await expect(g.page.getByTestId('gm-panel')).toContainText('owner');
  await g.page.keyboard.press('Enter');
  await g.page.keyboard.type('/gm who');
  await g.page.keyboard.press('Enter');
  await expect(g.page.getByTestId('log')).toContainText('ผู้เล่น');
  await g.ctx.close();
});

test('dropped WebSocket reconnects automatically and keeps character state', async ({ browser }) => {
  const a = await newPlayer(browser, 'rc');
  await enterWorld(a.page, a.char);
  await a.page.keyboard.down('KeyS');
  await a.page.waitForTimeout(500);
  await a.page.keyboard.up('KeyS');
  await a.page.waitForTimeout(400);
  const before = await hook(a.page);
  // simulate a network drop: close the socket from the client side without a clean leave
  await a.page.evaluate(() => (window as any).__TPE__.sim.ws.close(4000, 'test-drop'));
  await expect.poll(async () => (await hook(a.page)).status, { timeout: 10_000 }).toBe('online');
  const after = await hook(a.page);
  expect(Math.hypot(after.pos.x - before.pos.x, after.pos.y - before.pos.y)).toBeLessThan(24);
  await a.ctx.close();
});
