// Browser smoke test: loads the built single-file game in headless Chromium and plays it briefly.
// Run: npm run build && npm run smoke   (uses the pre-installed Playwright/Chromium)
import { createRequire } from 'node:module';
const { chromium } = createRequire(import.meta.url)('playwright'); // pre-installed in the environment
import { fileURLToPath } from 'node:url';
import { mkdir } from 'node:fs/promises';
import path from 'node:path';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const url = 'file://' + path.join(root, 'dist/the-power-eclipse.html');
const outDir = path.join(root, 'test-results');
await mkdir(outDir, { recursive: true });

const results = [];
const ok = (name, cond, detail = '') => { results.push({ name, pass: !!cond, detail }); console.log(`${cond ? 'PASS' : 'FAIL'} ${name}${detail ? ' — ' + detail : ''}`); };

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1280, height: 860 }, deviceScaleFactor: 1 });
const errors = [];
page.on('pageerror', (e) => errors.push(String(e)));
page.on('console', (m) => { if (m.type() === 'error' && !/fonts\.(googleapis|gstatic)/.test(m.text())) errors.push(m.text()); });
await page.goto(url);
await page.waitForFunction(() => !!window.__TPE);
const ev = (fn, arg) => page.evaluate(fn, arg);

ok('hotbar renders exactly 20 slots', (await page.locator('#hotbar .slot').count()) === 20);
ok('start screen visible before play', await page.locator('#start').isVisible());
await page.click('#btnStart');
ok('game starts after clicking Start', await ev(() => window.__TPE.isRunning()));

// movement
const x0 = await ev(() => window.__TPE.sim.player.x);
await page.keyboard.down('KeyD'); await page.waitForTimeout(700); await page.keyboard.up('KeyD');
const x1 = await ev(() => window.__TPE.sim.player.x);
ok('holding D moves the player right', x1 > x0 + 20, `x ${x0.toFixed(1)} → ${x1.toFixed(1)}`);
const y0 = await ev(() => window.__TPE.sim.player.y);
await page.keyboard.down('KeyS'); await page.keyboard.down('KeyD'); await page.waitForTimeout(400);
await page.keyboard.up('KeyS'); await page.keyboard.up('KeyD');
ok('diagonal input moves on both axes', (await ev(() => window.__TPE.sim.player.y)) > y0 + 5);

// dash
const st0 = await ev(() => window.__TPE.sim.player.stamina.value);
await page.keyboard.press('Space'); await page.waitForTimeout(60);
const st1 = await ev(() => window.__TPE.sim.player.stamina.value);
ok('Space dash spends stamina', st1 <= st0 - 25, `${st0.toFixed(0)} → ${st1.toFixed(0)}`);

// combat: place the player next to wolf #1 (test harness only), then attack with keys
await ev(() => { const s = window.__TPE.sim, m = s.monsters[0]; s.player.x = m.x - 20; s.player.y = m.y; s.player.facing = 0; });
await page.waitForTimeout(400);
for (let i = 0; i < 40 && (await ev(() => window.__TPE.sim.stats.kills)) === 0; i++) {
  await ev(() => { const s = window.__TPE.sim, p = s.player, m = s.monsters.find((q) => q.ai.state !== 'DEAD'); if (m) p.facing = Math.atan2(m.y - p.y, m.x - p.x); });
  await page.keyboard.press(i % 6 === 0 ? 'Digit2' : i % 6 === 3 ? 'Digit3' : 'KeyJ');
  await page.waitForTimeout(260);
}
const stats = await ev(() => window.__TPE.sim.stats);
ok('attacks deal damage', stats.damageDealt > 0, `dealt ${stats.damageDealt}`);
ok('a wolf can be killed', stats.kills >= 1, `kills ${stats.kills}`);
ok('damage events show in the combat log', (await page.locator('#log li').count()) > 0);

// debug overlay
await page.keyboard.press('F1'); await page.waitForTimeout(250);
ok('F1 opens the debug panel', await page.locator('#debugPanel').isVisible());
await page.screenshot({ path: path.join(outDir, 'smoke-debug.png') });
await page.keyboard.press('F1');

// death → respawn (harness forces lethal damage through the normal damage path)
await ev(() => { const s = window.__TPE.sim; s.player.statuses.clear(); s.player.invulnUntil = 0; s.player.health.hp = 1; s.dealDamage(s.monsters[1], s.player, { multiplier: 5, sourceName: 'Smoke Test' }); });
await page.waitForTimeout(200);
ok('lethal hit puts player in DEAD and shows recap', (await ev(() => window.__TPE.sim.player.life.state)) === 'DEAD' && await page.locator('#death').isVisible());
await page.screenshot({ path: path.join(outDir, 'smoke-death.png') });
await page.waitForTimeout(4300);
const after = await ev(() => ({ st: window.__TPE.sim.player.life.state, hp: window.__TPE.sim.player.health.hp, max: window.__TPE.sim.player.health.max }));
ok('player respawns with full HP', after.st === 'IN_WORLD' && after.hp === after.max, JSON.stringify(after));
ok('death overlay closes after respawn', !(await page.locator('#death').isVisible()));

// pause
await page.keyboard.press('KeyP'); const t0 = await ev(() => window.__TPE.sim.time); await page.waitForTimeout(300);
ok('pause freezes the simulation', (await ev(() => window.__TPE.sim.time)) === t0);
await page.keyboard.press('KeyP');
await page.waitForTimeout(300);
await page.screenshot({ path: path.join(outDir, 'smoke-play.png') });

// phone width layout: no horizontal scroll
const phone = await browser.newPage({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 1 });
await phone.goto(url); await phone.waitForFunction(() => !!window.__TPE);
const sw = await phone.evaluate(() => ({ sw: document.documentElement.scrollWidth, cw: document.documentElement.clientWidth }));
ok('no horizontal scroll at 390px width', sw.sw <= sw.cw, JSON.stringify(sw));
await phone.screenshot({ path: path.join(outDir, 'smoke-phone.png') });

ok('no console/page errors', errors.length === 0, errors.slice(0, 3).join(' | '));
await browser.close();
const failed = results.filter((r) => !r.pass).length;
console.log(`\nbrowser smoke: ${results.length - failed}/${results.length} passed`);
process.exit(failed ? 1 : 0);
