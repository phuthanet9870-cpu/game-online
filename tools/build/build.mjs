// Bundles the web client into ONE self-contained HTML file (dist/the-power-eclipse.html).
// No external runtime assets except Google Fonts (with fallbacks), so it runs offline from file://
// and as a claude.ai artifact.
import { build } from 'esbuild';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const res = await build({
  entryPoints: [path.join(root, 'client/src/main.js')],
  bundle: true, format: 'iife', target: ['es2022'], minify: true, write: false, legalComments: 'none',
});
const js = res.outputFiles[0].text.replace(/<\/script/gi, '<\\/script');
const tpl = await readFile(path.join(root, 'client/index.html'), 'utf8');
if (!tpl.includes('<!-- BUNDLE -->')) throw new Error('template is missing <!-- BUNDLE --> marker');
const html = tpl.replace('<!-- BUNDLE -->', () => `<script>${js}</script>`);
await mkdir(path.join(root, 'dist'), { recursive: true });
const out = path.join(root, 'dist/the-power-eclipse.html');
await writeFile(out, html);
console.log(`built ${path.relative(root, out)} — ${(html.length / 1024).toFixed(1)} KB (js ${(js.length / 1024).toFixed(1)} KB)`);
