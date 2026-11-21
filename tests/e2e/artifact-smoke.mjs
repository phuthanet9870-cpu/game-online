// E2E smoke test of the single-file artifact build (server in Web Worker), driven by mouse clicks.
// Usage: npm run build && node tests/e2e/artifact-smoke.mjs [outDir]
import { createRequire } from 'node:module';
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { join, resolve } from 'node:path';
const { chromium } = createRequire(import.meta.url)('playwright');

const out = resolve(process.argv[2] ?? 'dist/e2e');
mkdirSync(out, { recursive: true });
const frag = readFileSync('dist/artifact/the-power.html', 'utf8');
const pageHtml = join(out, 'artifact-wrapped.html');
writeFileSync(pageHtml, `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"></head><body>${frag}</body></html>`);

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1280, height: 760 } });
const errors = [];
const checks = {};
page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));
page.on('console', (m) => { if (m.type() === 'error' && !m.text().includes('fonts.g')) errors.push('console: ' + m.text()); });
const st = () => page.evaluate(() => window.__tpew());
const gm = async (line) => { await page.keyboard.press('Enter'); await page.keyboard.type(line); await page.keyboard.press('Enter'); await page.waitForTimeout(300); };

await page.goto('file://' + pageHtml);
await page.click('#start');
await page.waitForSelector('#user', { timeout: 15000 });
await page.fill('#user', 'tester'); await page.fill('#pass', 'secret123');
await page.click('#register');
await page.waitForSelector('#cname', { timeout: 15000 });
await page.fill('#cname', 'Aria');
await page.click('#create');
await page.waitForSelector('#play', { timeout: 15000 });
await page.click('#play');
await page.waitForSelector('canvas.view', { timeout: 15000 });
await page.waitForTimeout(1200);

// 1) click on the ground to walk
const p0 = (await st()).pos;
await page.mouse.click(900, 300);
await page.waitForTimeout(1500);
const p1 = (await st()).pos;
checks.clickMove = Math.hypot(p1.x - p0.x, p1.y - p0.y) > 2;

// 2) click an NPC to walk over and talk (merchant opens the shop / others open dialog)
const npc = await page.evaluate(() => window.__tpew().nearestScreen(4));
await page.mouse.click(npc.x, npc.y - 20);
await page.waitForSelector('.win.shop:not(.hidden), .win.dialog:not(.hidden)', { timeout: 10000 }).then(() => { checks.clickTalk = true; }).catch(() => { checks.clickTalk = false; });
await page.screenshot({ path: join(out, '1-talk.png') });
await page.keyboard.press('Escape');

// 3) GM panel: categorized item spawning by clicking
await gm('/gmstefanonline');
await page.click('.gm-btn');
await page.waitForSelector('.win.gm:not(.hidden)');
await page.click('.win.gm .tab:has-text("เกราะ")');
await page.click('.win.gm .gmitem:has-text("เสื้อหนัง")');
await page.click('.win.gm .tab:has-text("วัตถุดิบ")');
await page.click('.win.gm button:has-text("เสกทั้งหมวด")');
await page.waitForTimeout(500);
await page.screenshot({ path: join(out, '2-gm-items.png') });
const items = (await st()).items;
checks.gmSpawnItem = items.includes('arm_leather_vest');
checks.gmSpawnCategory = items.includes('mat_wolf_pelt') && items.includes('mat_power_fragment');
await page.click('.win.gm .tab:has-text("โลก / มอนสเตอร์")');
await page.screenshot({ path: join(out, '3-gm-world.png') });
await page.click('.win.gm .x');

// 4) teleport to the field, click a monster to auto-attack it
await gm('/gm tp 14 44 greenfall_plains');
await page.waitForTimeout(1200);
const exp0 = await page.evaluate(() => window.__tpew().char.exp + window.__tpew().char.level * 1e6);
let exp1 = exp0;
for (let i = 0; i < 20 && exp1 <= exp0; i++) {
  const t = await page.evaluate(() => window.__tpew().nearestMonsterScreen);
  if (t) await page.mouse.click(t.x, t.y);
  await page.waitForTimeout(700);
  exp1 = await page.evaluate(() => window.__tpew().char.exp + window.__tpew().char.level * 1e6);
}
checks.clickAttackKill = exp1 > exp0;

// 5) click a skill on the skill bar (Blade Rush): energy must drop on the server
const en0 = (await st()).self.en;
const t2 = await page.evaluate(() => window.__tpew().nearestMonsterScreen);
if (t2) await page.mouse.move(t2.x, t2.y);
await page.click('.sk:has-text("พุ่งฟัน")');
await page.waitForTimeout(400);
checks.clickSkill = (await st()).self.en < en0;
await page.screenshot({ path: join(out, '4-field-combat.png') });

// 6) auto farm from the panel
await page.keyboard.press('KeyO');
await page.waitForSelector('#auto-start');
await page.click('#auto-start');
await page.waitForTimeout(400);
await page.mouse.move(640, 700); // keep the cursor off the canvas: clicks/keys would cancel auto
let kills = 0;
for (let i = 0; i < 40 && kills < 2; i++) { await page.waitForTimeout(500); kills = (await st()).self.autoKills; }
checks.autoFarmKills = kills >= 2;
await page.screenshot({ path: join(out, '5-auto.png') });
await page.click('#auto-stop');
await page.waitForTimeout(300);
checks.autoStopped = (await st()).self.auto === false;

// 7) every weapon fires its skills in the browser without errors
for (const w of ['dagger', 'bow', 'grimoire', 'gauntlet']) {
  await gm(`/gm weapon ${w}`);
  await page.waitForTimeout(300);
  const t = await page.evaluate(() => window.__tpew().nearestMonsterScreen);
  if (t) await page.mouse.move(t.x, t.y);
  for (const k of ['Digit1', 'Digit2', 'Digit3']) { await page.keyboard.press(k); await page.waitForTimeout(250); }
  await page.screenshot({ path: join(out, `6-${w}.png`) });
  checks[`weapon_${w}`] = (await st()).char.weapon === w;
}

// 8) The Power: exchange fragments at the Sage by clicking, then cast all slots in the field
await gm('/gm weapon staff');
await gm('/gm item mat_power_fragment 30');
await gm('/gm gold 5000');
await gm('/gm tp 28.5 22.5 aether_capital');
await page.waitForTimeout(800);
await page.keyboard.press('Escape'); // close any open panels
const sage = await page.evaluate(() => { const g = window.__tpew(); return g && g.nearestScreen(4); });
await page.mouse.click(sage.x, sage.y - 20);
await page.waitForSelector('.win.power:not(.hidden)', { timeout: 8000 }).catch(async (e) => { await page.screenshot({ path: join(out, 'fail-sage.png') }); console.log('sage', JSON.stringify(sage), await page.textContent('.chatlog')); throw e; });
await page.click('.win.power .pcard:has-text("อัคคีสุริยะ")');
await page.click('.win.power button:has-text("หลอมเป็น")');
await page.waitForTimeout(500);
checks.powerExchange = await page.evaluate(() => window.__tpew().powersActive === 'solar');
await page.screenshot({ path: join(out, '7-power-panel.png') });
await page.keyboard.press('Escape');
await gm('/gm power solar 3');
await gm('/gm tp 14 44 greenfall_plains');
await page.waitForTimeout(1000);
const en0p = (await st()).self.en;
for (const k of ['KeyQ', 'KeyE', 'KeyR', 'KeyT', 'KeyG', 'KeyX']) {
  const t = await page.evaluate(() => window.__tpew().nearestMonsterScreen);
  if (t) await page.mouse.move(t.x, t.y);
  await page.keyboard.down(k); await page.waitForTimeout(120); await page.keyboard.up(k);
  await page.waitForTimeout(700);
}
await page.screenshot({ path: join(out, '8-power-combat.png') });
checks.powerCast = (await st()).self.en < en0p || (await page.evaluate(() => window.__tpew().powerMastery)) > 0;

console.log(JSON.stringify({ checks, errors }, null, 2));
await browser.close();
process.exit(errors.length || Object.values(checks).some((v) => !v) ? 1 : 0);
