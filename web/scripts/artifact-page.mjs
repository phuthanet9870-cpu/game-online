// Writes dist/game-online.html: dist/index.html without its own <!doctype>/<html>/<head>/<body> wrapper, for hosts that
// wrap the page themselves (claude.ai Artifacts). The scripts, stylesheet and packs stay beside it at the same paths.
import { readFileSync, writeFileSync } from "node:fs";

const dist = new URL("../dist/", import.meta.url);
const html = readFileSync(new URL("index.html", dist), "utf8");
const head = html.match(/<head>([\s\S]*?)<\/head>/i)?.[1] ?? "";
const body = html.match(/<body[^>]*>([\s\S]*?)<\/body>/i)?.[1] ?? "";
const keep = head.split("\n").map((l) => l.trim()).filter((l) => /^<(title|script|link)\b/i.test(l));
writeFileSync(new URL("game-online.html", dist), `${keep.join("\n")}\n${body.trim()}\n`);
console.log(`wrote dist/game-online.html (${keep.length} head tags)`);
