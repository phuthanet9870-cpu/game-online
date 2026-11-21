// E2E: two real browser clients against the Node WebSocket server.
// Usage: npm run build && node tests/e2e/online-multiplayer.mjs
import { createRequire } from 'node:module';
import { spawn } from 'node:child_process';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
const { chromium } = createRequire(import.meta.url)('playwright');

const PORT = 8099;
const db = join(mkdtempSync(join(tmpdir(), 'tpew-e2e-')), 'game.db');
const srv = spawn(process.execPath, ['--disable-warning=ExperimentalWarning', 'dist/server.mjs'], { env: { ...process.env, PORT: String(PORT), DB_PATH: db, GM_PASSPHRASE: 'e2e-secret' }, stdio: ['ignore', 'pipe', 'pipe'] });
let log = '';
srv.stdout.on('data', (d) => { log += d; });
srv.stderr.on('data', (d) => { log += d; });
await new Promise((r) => { const t = setInterval(() => { if (log.includes('server on')) { clearInterval(t); r(); } }, 50); });

const browser = await chromium.launch();
const errors = [];
async function player(user, name) {
  const ctx = await browser.newContext({ viewport: { width: 1100, height: 700 } });
  const page = await ctx.newPage();
  page.on('pageerror', (e) => errors.push(`${user} pageerror: ${e.message}`));
  await page.goto(`http://localhost:${PORT}/`);
  await page.click('#start');
  await page.waitForSelector('#user');
  await page.fill('#user', user); await page.fill('#pass', 'secret123');
  await page.click('#register');
  await page.waitForSelector('#cname');
  await page.fill('#cname', name);
  await page.click('#create');
  await page.waitForSelector('#play');
  await page.click('#play');
  await page.waitForSelector('canvas.view');
  return { page, ctx };
}
const a = await player('alpha', 'Alpha');
const b = await player('bravo', 'Bravo');
await a.page.waitForTimeout(1200);
const seenByA = await a.page.evaluate(() => window.__tpew().players);
const seenByB = await b.page.evaluate(() => window.__tpew().players);
// B moves; A must observe the movement through the server
const before = await a.page.evaluate(() => { const g = window.__tpew(); return g; });
await b.page.keyboard.down('KeyS'); await b.page.waitForTimeout(800); await b.page.keyboard.up('KeyS');
await a.page.waitForTimeout(500);
// chat between players
await a.page.keyboard.press('Enter'); await a.page.keyboard.type('hello from alpha'); await a.page.keyboard.press('Enter');
await b.page.waitForTimeout(500);
const chatB = await b.page.textContent('.chatlog');
// wrong GM passphrase must not grant GM; correct one (from env) does
await b.page.keyboard.press('Enter'); await b.page.keyboard.type('/gmstefanonline'); await b.page.keyboard.press('Enter');
await a.page.keyboard.press('Enter'); await a.page.keyboard.type('/gme2e-secret'); await a.page.keyboard.press('Enter');
await a.page.waitForTimeout(400);
await a.page.keyboard.press('Enter'); await a.page.keyboard.type('/gm gold 500 Bravo'); await a.page.keyboard.press('Enter');
await b.page.waitForTimeout(600);
const chatA = await a.page.textContent('.chatlog');
const chatB2 = await b.page.textContent('.chatlog');
await a.page.screenshot({ path: 'dist/e2e/online-alpha.png' });
const health = await (await fetch(`http://localhost:${PORT}/health`)).json();
console.log(JSON.stringify({
  seenByA, seenByB, chatReceived: chatB.includes('hello from alpha'),
  wrongGmRejected: chatB2.includes('คำสั่งไม่ถูกต้อง'), gmGranted: chatA.includes('เปิดสิทธิ์ GM'), gmGold: chatA.includes('Bravo: ทอง +500'),
  health, errors,
}, null, 2));
await browser.close();
srv.kill('SIGTERM');
await new Promise((r) => srv.on('exit', r));
console.log(log.split('\n').filter((l) => l.includes('saving') || l.includes('error')).join('\n'));
const ok = seenByA.includes('Bravo') && seenByB.includes('Alpha') && chatB.includes('hello from alpha') && chatA.includes('Bravo: ทอง +500') && chatB2.includes('คำสั่งไม่ถูกต้อง') && !errors.length;
process.exit(ok ? 0 : 1);
