// Build:
//   dist/server.mjs                     Node game server (WebSocket + static files)
//   dist/public/index.html + app.js     client for online play (served by the Node server)
//   dist/artifact/the-power.html        single-file playable build (server runs in a Web Worker)
import { build } from 'esbuild';
import { mkdir, readFile, writeFile } from 'node:fs/promises';

const minify = !process.argv.includes('--dev');
const common = { bundle: true, minify, sourcemap: false, target: 'es2022', logLevel: 'warning', legalComments: 'none' };

await mkdir('dist/public', { recursive: true });
await mkdir('dist/artifact', { recursive: true });

const worker = await build({ ...common, entryPoints: ['src/server/worker/main.ts'], format: 'iife', platform: 'browser', write: false });
const workerSrc = worker.outputFiles[0].text;

async function client(mode) {
  const r = await build({
    ...common, entryPoints: ['src/client/main.ts'], format: 'iife', platform: 'browser', write: false,
    define: { __BUILD_MODE__: JSON.stringify(mode), __WORKER_SRC__: JSON.stringify(workerSrc) },
  });
  return r.outputFiles[0].text;
}

await build({ ...common, entryPoints: ['src/server/node/main.ts'], outfile: 'dist/server.mjs', format: 'esm', platform: 'node', packages: 'external' });

const css = await readFile('src/client/styles.css', 'utf8');
const fonts = '<link rel="preconnect" href="https://fonts.googleapis.com"><link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>'
  + '<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Noto+Sans+Thai:wght@400;600&family=Pixelify+Sans:wght@400;600&display=swap">';
const safeInline = (js) => js.replace(/<\/script/gi, '<\\/script');

const online = await client('online');
await writeFile('dist/public/app.js', online);
await writeFile('dist/public/index.html', `<!doctype html>
<html lang="th"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<title>THE POWER: ETERNAL WAR</title>${fonts}<style>${css}</style></head>
<body><div id="app"></div><script src="app.js"></script></body></html>
`);

const local = await client('artifact');
// Artifact pages are wrapped in a document skeleton at publish time: write content only.
await writeFile('dist/artifact/the-power.html', `<title>The Power: Eternal War</title>
${fonts}
<style>${css}</style>
<div id="app"></div>
<script>${safeInline(local)}</script>
`);

const kb = (s) => `${(Buffer.byteLength(s) / 1024).toFixed(0)} KB`;
console.log(`built: server.mjs, public/app.js (${kb(online)}), artifact/the-power.html (${kb(local)}), worker ${kb(workerSrc)}`);
