// Converts dist-single/index.html into a skeleton-less page for the claude.ai test artifact:
// the artifact host supplies <!doctype>/<html>/<head>/<body>, so we keep only their contents,
// with <title> first (hosts scan the first 8KB for it).
import { readFileSync, writeFileSync } from 'node:fs';

const src = readFileSync(new URL('../dist-single/index.html', import.meta.url), 'utf8');
const head = src.match(/<head>([\s\S]*?)<\/head>/i)?.[1] ?? '';
const body = src.match(/<body>([\s\S]*?)<\/body>/i)?.[1] ?? '';
const title = head.match(/<title>[\s\S]*?<\/title>/i)?.[0] ?? '<title>THE POWER: ECLIPSE</title>';
const rest = head
  .replace(/<title>[\s\S]*?<\/title>/i, '')
  .replace(/<meta charset="UTF-8"\s*\/?>/i, '')
  .replace(/<meta name="viewport"[^>]*>/i, '');
const out = `${title}\n<meta name="viewport" content="width=device-width, initial-scale=1.0, viewport-fit=cover">\n${rest.trim()}\n${body.trim()}\n`;
writeFileSync(new URL('../dist-single/artifact.html', import.meta.url), out);
console.log(`dist-single/artifact.html ${(out.length / 1024).toFixed(0)} KB`);
