// Packs client/public (and PGlite's file-system bundle, as /__pglite.data) into dist/packs/game-N.txt plus a manifest; see
// src/assets.ts for the format. Packs are base64 text: the Artifact host serves only standard web types (a .txt is one,
// an arbitrary binary is not) and caps a text file at 16 MB, so each pack holds at most 11 MB before encoding.
import { mkdirSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from "node:fs";
import { join, relative } from "node:path";

const ROOT = new URL("../../client/public/", import.meta.url).pathname;
const OUT = new URL("../dist/packs/", import.meta.url).pathname;
const ASSETS = new URL("../dist/assets/", import.meta.url).pathname;
const LIMIT = 11 * 1000 * 1000; // base64 adds a third: ~14.7 MB of text, under a 16 MB cap however it is counted
const MIME = { png: "image/png", jpg: "image/jpeg", jpeg: "image/jpeg", webp: "image/webp", svg: "image/svg+xml", json: "application/json",
  mp3: "audio/mpeg", ogg: "audio/ogg", wav: "audio/wav", glb: "model/gltf-binary", gltf: "model/gltf+json", bin: "application/octet-stream", txt: "text/plain" };

const files = [];
(function walk(d) {
  for (const n of readdirSync(d).sort()) {
    const p = join(d, n);
    if (statSync(p).isDirectory()) walk(p); else files.push(p);
  }
})(ROOT);
// PGlite's bundle: src/db.ts hands it over as `fsBundle`, so the loose .data file is not needed next to the page
const pgData = readdirSync(ASSETS).find((f) => /^pglite-.*\.data$/.test(f));
if (!pgData) throw new Error("no pglite-*.data in dist/assets");
const extra = [[ASSETS + pgData, "/__pglite.data"]];

mkdirSync(OUT, { recursive: true });
const packs = [];
let cur = [], size = 0;
const flush = () => {
  if (!cur.length) return;
  const head = [], bufs = [];
  let off = 0;
  for (const f of cur) {
    const b = readFileSync(f), ext = f.split(".").pop().toLowerCase();
    const path = extra.find(([src]) => src === f)?.[1] ?? "/" + relative(ROOT, f).split("\\").join("/");
    head.push([path, off, b.length, MIME[ext] ?? "application/octet-stream"]);
    bufs.push(b); off += b.length;
  }
  const h = Buffer.from(JSON.stringify(head)), len = Buffer.alloc(4);
  len.writeUInt32LE(h.length);
  const out = Buffer.concat([len, h, ...bufs]).toString("base64"), file = `game-${packs.length}.txt`;
  writeFileSync(OUT + file, out);
  packs.push({ file, size: out.length, files: cur.length });
  cur = []; size = 0;
};
for (const f of [...files, ...extra.map(([src]) => src)]) {
  const s = statSync(f).size;
  if (size + s > LIMIT) flush();
  cur.push(f); size += s;
}
flush();
rmSync(ASSETS + pgData);
writeFileSync(OUT + "manifest.json", JSON.stringify({ packs: packs.map(({ file, size }) => ({ file, size })) }));
console.log(`packed ${files.length + extra.length} files into ${packs.length} packs:`, packs.map((p) => `${p.file} ${(p.size / 1048576).toFixed(1)}MB/${p.files}`).join(", "));
