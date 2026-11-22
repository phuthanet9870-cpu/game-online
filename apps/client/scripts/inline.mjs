// Inline the built JS/CSS into self-contained HTML files (offline build).
//  - astra-offline.html : complete standalone document (open directly in any browser)
//  - astra-artifact.html: body-level page for claude.ai Artifact hosting (skeleton is added by the host)
import { readFileSync, writeFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
const dir = process.argv[2];
let html = readFileSync(join(dir, 'index.html'), 'utf8');
const assets = join(dir, 'assets');
let js = '', css = '';
for (const f of readdirSync(assets)) {
  const body = readFileSync(join(assets, f), 'utf8');
  if (f.endsWith('.js')) { js = body.replace(/<\/script/g, '<\\/script'); html = html.replace(new RegExp(`<script[^>]*src="[^"]*${f}"[^>]*></script>`), () => `<script type="module">${js}</script>`); }
  if (f.endsWith('.css')) { css = body; html = html.replace(new RegExp(`<link[^>]*href="[^"]*${f}"[^>]*>`), () => `<style>${css}</style>`); }
}
writeFileSync(join(dir, 'astra-offline.html'), html);
const artifact = `<title>Astra: Eclipse Chronicles</title>
<meta name="claude:viewport-fit-sides" content="cover">
<link rel="preconnect" href="https://fonts.googleapis.com"><link rel="preconnect" href="https://fonts.gstatic.com" crossorigin><link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Cinzel:wght@600;700&family=Noto+Sans+Thai:wght@400;600;700&display=swap">
<style>${css}</style>
<div id="app"><div class="screen center"><p>Loading…</p></div></div>
<script type="module">${js}</script>
`;
writeFileSync(join(dir, 'astra-artifact.html'), artifact);
console.log('wrote offline + artifact builds', (html.length / 1024).toFixed(0) + ' KB');
