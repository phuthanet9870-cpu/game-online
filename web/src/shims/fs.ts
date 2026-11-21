// node:fs for the in-page server: the only files it reads are two data files, bundled here as text.
import pets from "../../../shared/data/pets.json?raw";
import spawns from "../../../shared/data/spawns.txt?raw";

const FILES: Record<string, string> = { "pets.json": pets, "spawns.txt": spawns };
// the build turns new URL("…/spawns.txt", import.meta.url) into a hashed asset URL (spawns-<hash>.txt): match on the stem
const lookup = (p: string | URL) => {
  const base = String(p).replace(/[?#].*$/, "").replace(/^.*\//, "");
  if (FILES[base] !== undefined) return FILES[base];
  const key = Object.keys(FILES).find((k) => { const dot = k.lastIndexOf("."); return base.startsWith(k.slice(0, dot) + "-") && base.endsWith(k.slice(dot)); });
  return key ? FILES[key] : undefined;
};

export function existsSync(p: string | URL) { return lookup(p) !== undefined; }
export function readFileSync(p: string | URL) {
  const v = lookup(p);
  if (v === undefined) throw new Error(`ENOENT: ${p} is not bundled in the browser build`);
  return v;
}
export async function readFile(p: string | URL) { return readFileSync(p); }
export async function readdir() { return [] as string[]; }
export default { existsSync, readFileSync };
