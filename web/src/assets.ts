// Game files (client/public: sprites, art, audio, models...) ship as a few pack files instead of ~650 loose files.
// Each pack is base64 text of [u32 LE header length][header JSON: [[path, offset, length, mime], ...]][bytes] (see
// scripts/pack.mjs for why text). After loading, every path
// gets a blob: URL, and the ways the client reaches a file by its absolute path ("/sprites/x.png") are redirected to it:
// fetch (net.ts), <img>/<audio> .src, new Audio(url), element.style background urls and the url()s in the stylesheets.
const blobs = new Map<string, Blob>();
const urls = new Map<string, string>();

export const assetBlob = (path: string) => blobs.get(path);

function rewrite(raw: string): string {
  if (!raw || raw.startsWith("data:") || raw.startsWith("blob:")) return raw;
  let u: URL;
  try { u = new URL(raw, location.href); } catch { return raw; }
  if (u.host !== location.host) return raw;
  const hit = urls.get(decodeURIComponent(u.pathname));
  return hit ?? raw;
}
const rewriteCss = (v: string) => v.replace(/url\((['"]?)([^'")]+)\1\)/g, (m, q, p) => { const r = rewrite(p); return r === p ? m : `url(${q}${r}${q})`; });

type Progress = (loaded: number, total: number) => void;

function decodeBase64(text: string): ArrayBuffer {
  const from = (Uint8Array as any).fromBase64 as ((s: string) => Uint8Array) | undefined;
  if (from) return from(text).buffer as ArrayBuffer;
  const bin = atob(text), out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out.buffer;
}

export async function loadPacks(onProgress: Progress) {
  const manifest: { packs: { file: string; size: number }[] } = await (await fetch("packs/manifest.json")).json();
  const total = manifest.packs.reduce((a, p) => a + p.size, 0);
  const got = new Array(manifest.packs.length).fill(0);
  const report = () => onProgress(got.reduce((a, b) => a + b, 0), total);
  await Promise.all(manifest.packs.map(async (p, i) => {
    const res = await fetch(`packs/${p.file}`);
    if (!res.ok || !res.body) throw new Error(`could not load ${p.file} (${res.status})`);
    const reader = res.body.getReader();
    const parts: Uint8Array[] = [];
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      parts.push(value); got[i] += value.length; report();
    }
    const buf = decodeBase64(await new Blob(parts as BlobPart[]).text());
    const headLen = new DataView(buf).getUint32(0, true);
    const head: [string, number, number, string][] = JSON.parse(new TextDecoder().decode(new Uint8Array(buf, 4, headLen)));
    const base = 4 + headLen;
    for (const [path, off, len, mime] of head) blobs.set(path, new Blob([new Uint8Array(buf, base + off, len)], { type: mime }));
  }));
  for (const [path, b] of blobs) urls.set(path, URL.createObjectURL(b));
  patchDom();
}

function patchSrc(proto: any) {
  const d = Object.getOwnPropertyDescriptor(proto, "src");
  if (!d?.set) return;
  Object.defineProperty(proto, "src", { ...d, set(v: string) { d.set!.call(this, rewrite(String(v))); } });
}

function patchDom() {
  patchSrc(HTMLImageElement.prototype);
  patchSrc(HTMLMediaElement.prototype);
  patchSrc(HTMLSourceElement.prototype);
  const setAttr = Element.prototype.setAttribute;
  Element.prototype.setAttribute = function (name: string, value: string) {
    const n = name.toLowerCase();
    return setAttr.call(this, name, n === "src" || n === "href" || n === "poster" ? rewrite(String(value)) : n === "style" ? rewriteCss(String(value)) : value);
  };
  const RealAudio = window.Audio;
  const AudioShim = function (src?: string) { const a = new RealAudio(); if (src !== undefined) a.src = src; return a; } as unknown as typeof Audio;
  AudioShim.prototype = RealAudio.prototype;
  window.Audio = AudioShim;

  const css = CSSStyleDeclaration.prototype as any;
  for (const prop of ["backgroundImage", "background", "borderImage", "borderImageSource", "content", "listStyleImage", "maskImage", "cursor"]) {
    const d = Object.getOwnPropertyDescriptor(css, prop);
    if (!d?.set) continue;
    Object.defineProperty(css, prop, { ...d, set(v: string) { d.set!.call(this, rewriteCss(String(v))); } });
  }
  const setProperty = css.setProperty;
  css.setProperty = function (p: string, v: string | null, pr?: string) { return setProperty.call(this, p, v == null ? v : rewriteCss(String(v)), pr); };

  rewriteSheets();
}

/** Rewrites the url()s already parsed from the stylesheets (login backgrounds, ornaments). */
export function rewriteSheets() {
  const setProperty = CSSStyleDeclaration.prototype.setProperty;
  for (const sheet of Array.from(document.styleSheets)) {
    let rules: CSSRuleList;
    try { rules = sheet.cssRules; } catch { continue; }
    const walk = (list: CSSRuleList) => {
      for (const r of Array.from(list)) {
        if ((r as CSSGroupingRule).cssRules) walk((r as CSSGroupingRule).cssRules);
        const st = (r as CSSStyleRule).style;
        if (!st) continue;
        for (let i = 0; i < st.length; i++) {
          const p = st[i], v = st.getPropertyValue(p);
          if (v.includes("url(")) { const nv = rewriteCss(v); if (nv !== v) setProperty.call(st, p, nv, st.getPropertyPriority(p)); }
        }
      }
    };
    walk(rules);
  }
}
