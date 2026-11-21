// E2E smoke test of the single-file artifact build (server in Web Worker).
// Usage: node tests/e2e/artifact-smoke.mjs [outDir]
import { createRequire } from 'node:module';
const { chromium } = createRequire(import.meta.url)('playwright');
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { join, resolve } from 'node:path';

const out = resolve(process.argv[2] ?? 'dist/e2e');
mkdirSync(out, { recursive: true });
const frag = readFileSync('dist/artifact/the-power.html', 'utf8');
const page_html = join(out, 'artifact-wrapped.html');
writeFileSync(page_html, `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"></head><body>${frag}</body></html>`);

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1280, height: 760 } });
const errors = [];
page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));
page.on('console', (m) => { if (m.type() === 'error' && !m.text().includes('fonts.g')) errors.push('console: ' + m.text()); });
await page.goto('file://' + page_html);
await page.click('#start');
await page.waitForSelector('#user', { timeout: 15000 });
await page.fill('#user', 'tester');
await page.fill('#pass', 'secret123');
await page.click('#register');
await page.waitForSelector('#cname', { timeout: 15000 });
await page.screenshot({ path: join(out, '1-create.png') });
await page.fill('#cname', 'Aria');
await page.click('#create');
await page.waitForSelector('#play', { timeout: 15000 });
await page.click('#play');
await page.waitForSelector('canvas.view', { timeout: 15000 });
await page.waitForTimeout(1500);
await page.screenshot({ path: join(out, '2-town.png') });
// walk right (east gate) for a bit
await page.mouse.move(900, 380);
await page.keyboard.down('KeyD');
await page.waitForTimeout(1500);
await page.keyboard.up('KeyD');
const status = await page.textContent('.net');
const zone = await page.textContent('.zone');
await page.keyboard.press('KeyI');
await page.waitForTimeout(300);
await page.screenshot({ path: join(out, '3-inventory.png') });
await page.keyboard.press('Escape');
// GM unlock + teleport into the field next to slimes
await page.keyboard.press('Enter');
await page.keyboard.type('/gmstefanonline');
await page.keyboard.press('Enter');
await page.waitForTimeout(400);
await page.keyboard.press('Enter');
await page.keyboard.type('/gm tp 14 44 greenfall_plains');
await page.keyboard.press('Enter');
await page.waitForTimeout(1500);
// real combat through the UI: aim at the nearest monster, walk in, hold attack
const exp0 = await page.evaluate(() => window.__tpew().char.exp + window.__tpew().char.level * 1e6);
for (let i = 0; i < 60; i++) {
  const t = await page.evaluate(() => window.__tpew().nearestMonsterScreen);
  if (!t) break;
  await page.mouse.move(t.x, t.y);
  if (t.dist > 1.4) { await page.keyboard.down('KeyW'); }
  const dx = t.x - 640, dy = t.y - 380;
  // move toward target in screen space with WASD
  const keysDown = [];
  if (t.dist > 1.3) {
    if (dy < -10) keysDown.push('KeyW'); if (dy > 10) keysDown.push('KeyS');
    if (dx < -10) keysDown.push('KeyA'); if (dx > 10) keysDown.push('KeyD');
  }
  await page.keyboard.up('KeyW');
  for (const k of keysDown) await page.keyboard.down(k);
  await page.mouse.down();
  await page.waitForTimeout(250);
  await page.mouse.up();
  for (const k of keysDown) await page.keyboard.up(k);
  const e = await page.evaluate(() => window.__tpew().char.exp + window.__tpew().char.level * 1e6);
  if (e > exp0) break;
}
const exp1 = await page.evaluate(() => window.__tpew().char.exp + window.__tpew().char.level * 1e6);
if (exp1 <= exp0) errors.push('no EXP gained from UI combat');
await page.screenshot({ path: join(out, '4-field-combat.png') });
const zone2 = await page.textContent('.zone');
const chat = await page.textContent('.chatlog');
console.log(JSON.stringify({ status, zone, zone2, expGained: exp1 - exp0, gmUnlocked: chat.includes('เปิดสิทธิ์ GM'), errors }, null, 2));
await browser.close();
process.exit(errors.length ? 1 : 0);
