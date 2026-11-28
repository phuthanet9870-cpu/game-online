// Item icons drawn in code: a 16x16 pixel glyph per kind of thing (weapon types, armour pieces, tonics, cards, eggs, materials), tinted by
// grade/material/element, outlined, cached as a data URL and shown with `image-rendering: pixelated`. Replaces the painted icon atlas.
import type { Item } from "../../shared/rules/items.ts";
import { MOB_BY_ID } from "../../shared/rules/data.ts";
import { D, E, L, P, R, darker, hash, lighter, mixc, mk, outline, type Ctx } from "./pix.ts";
import { mobLook } from "./mobs2d.ts";
import { BEHAVIOR } from "../../shared/classx/engine.ts";

const S = 16;
const cache = new Map<string, string>();

const METAL = ["#9aa3b5", "#b9c1cf", "#d6dbe5", "#e8c75a", "#8fd0ff"]; // by weapon/armour level
const WOOD = "#8a5d34", WOOD_L = "#b07d4a", LEATHER = "#9b6b43", CLOTH = "#d9d2c0";
const ELE: Record<string, string> = { Water: "#4f8fd8", Fire: "#e2573c", Earth: "#9a7040", Wind: "#4cc3a0", Poison: "#9b5fc4", Holy: "#f0cf5a", Dark: "#5a4f78", Ghost: "#d8d4ea", Undead: "#a89f84", Neutral: "#9aa3b5" };
const TONIC: Record<string, string> = { Red: "#e2574c", Orange: "#ee8a3a", Yellow: "#f2cf4a", White: "#f0eee6", Blue: "#4f8fd8", Green: "#6bbf4f", Purple: "#9b5fc4" };

/** a blade pointing up-right from the hilt at (hx, hy) */
function blade(g: Ctx, hx: number, hy: number, len: number, col: string, wide = false) {
  const hi = lighter(col, 0.45), lo = darker(col, 0.3);
  for (let i = 0; i < len; i++) { P(g, hx + i, hy - i, col); P(g, hx + i + 1, hy - i, lo); P(g, hx + i, hy - i - 1, hi); if (wide) P(g, hx + i + 1, hy - i - 1, col); }
  P(g, hx + len, hy - len, hi);
}
function grip(g: Ctx, hx: number, hy: number) { // crossguard and handle toward the bottom-left
  L(g, hx - 1, hy + 1, hx - 3, hy + 3, WOOD); P(g, hx - 4, hy + 4, "#e8c75a");
  L(g, hx - 1, hy - 1, hx + 1, hy + 1, "#e8c75a"); P(g, hx - 2, hy, "#e8c75a"); P(g, hx, hy + 2, "#e8c75a");
}

function weapon(g: Ctx, it: Item, col: string) {
  const sub = it.subType ?? "";
  if (/Dagger/.test(sub)) { blade(g, 7, 9, 5, col); grip(g, 6, 10); }
  else if (/Sword/.test(sub)) { blade(g, 6, 10, sub === "2hSword" ? 9 : 7, col, sub === "2hSword"); grip(g, 5, 11); }
  else if (/Spear/.test(sub)) { L(g, 3, 13, 12, 4, WOOD_L); L(g, 4, 13, 13, 4, WOOD); L(g, 12, 4, 14, 2, col); L(g, 11, 3, 14, 3, col); L(g, 11, 5, 13, 3, lighter(col, 0.4)); }
  else if (/Axe/.test(sub)) { L(g, 3, 13, 11, 5, WOOD_L); L(g, 4, 13, 12, 5, WOOD); E(g, 10, 5, 3, 3, col); E(g, 9, 4, 2, 2, lighter(col, 0.4)); R(g, 12, 3, 1, 5, darker(col, 0.3)); }
  else if (/Mace/.test(sub)) { L(g, 3, 13, 10, 6, WOOD_L); L(g, 4, 13, 11, 6, WOOD); D(g, 11, 5, 3, col); D(g, 10, 4, 1, lighter(col, 0.5)); for (const [x, y] of [[11, 1], [14, 5], [11, 9], [8, 5]]) P(g, x, y, darker(col, 0.2)); }
  else if (/Staff/.test(sub)) { L(g, 3, 13, 11, 5, WOOD_L); L(g, 4, 13, 12, 5, WOOD); D(g, 12, 4, 2, ELE[(it.element as string) ?? "Neutral"] ?? "#7ec8ff"); P(g, 11, 3, "#fff"); }
  else if (/Bow/.test(sub)) { for (let i = 0; i < 12; i++) { const x = 4 + Math.round(Math.sin(i / 11 * Math.PI) * 6); P(g, x, 2 + i, WOOD_L); P(g, x + 1, 2 + i, WOOD); } L(g, 4, 2, 4, 13, "#e8e0c8"); L(g, 5, 8, 12, 8, "#c0c6d2"); P(g, 13, 8, "#e0e4ec"); P(g, 12, 7, "#d86a5a"); P(g, 12, 9, "#d86a5a"); }
  else if (/Katar/.test(sub)) { blade(g, 5, 11, 7, col, true); L(g, 4, 12, 4, 7, "#e8c75a"); L(g, 4, 8, 8, 8, "#e8c75a"); }
  else if (/Knuckle/.test(sub)) { R(g, 3, 7, 10, 5, LEATHER); R(g, 3, 7, 10, 1, lighter(LEATHER, 0.3)); for (let i = 0; i < 4; i++) { R(g, 4 + i * 2 + (i > 1 ? 0 : 0), 5, 2, 3, col); P(g, 4 + i * 2, 5, lighter(col, 0.5)); } R(g, 5, 12, 6, 2, darker(LEATHER, 0.2)); }
  else if (/Book/.test(sub)) { R(g, 3, 3, 10, 11, "#8a3a3a"); R(g, 3, 3, 10, 1, "#b85a5a"); R(g, 3, 3, 2, 11, "#6a2a2a"); R(g, 5, 4, 7, 9, "#efe6cf"); R(g, 7, 6, 3, 3, "#e8c75a"); L(g, 6, 11, 11, 11, "#b6a87c"); }
  else if (/Whip/.test(sub)) { for (let i = 0; i < 14; i++) P(g, 2 + i, 12 - Math.round(Math.sin(i / 3) * 3 + i * 0.5), i < 3 ? WOOD : "#b8864f"); P(g, 15, 5, "#e8c75a"); R(g, 1, 12, 3, 3, WOOD); }
  else if (/Musical/.test(sub)) { E(g, 6, 11, 4, 3, WOOD_L); E(g, 6, 11, 3, 2, WOOD); D(g, 6, 11, 1, "#2a1a10"); L(g, 8, 9, 13, 3, WOOD); L(g, 9, 9, 14, 3, WOOD_L); P(g, 14, 2, "#e8c75a"); for (let i = 0; i < 3; i++) L(g, 4 + i, 9, 13, 3 + i * 0, "#efe6cf"); }
  else { blade(g, 6, 10, 6, col); grip(g, 5, 11); }
}

function armorPiece(g: Ctx, it: Item, col: string) {
  const loc = it.locations as string[];
  const has = (s: string) => loc.includes(s);
  const dark = darker(col, 0.3), hi = lighter(col, 0.35);
  if (has("Left_Hand")) { // shield
    g.fillStyle = col; for (let y = 2; y < 14; y++) { const w = y < 8 ? 5 : Math.max(0, 5 - (y - 8)); g.fillRect(8 - w, y, w * 2, 1); }
    R(g, 3, 2, 10, 1, hi); R(g, 7, 3, 2, 9, dark); R(g, 4, 6, 8, 2, dark); R(g, 7, 6, 2, 2, "#e8c75a"); return;
  }
  if (has("Head_Top")) { // hat or hood
    E(g, 8, 10, 6, 2, dark); E(g, 8, 9, 6, 2, col); E(g, 8, 6, 4, 4, col); E(g, 7, 5, 2, 2, hi); R(g, 4, 9, 8, 1, ELE.Neutral === col ? "#c2603c" : "#c2603c"); return;
  }
  if (has("Head_Mid")) { R(g, 2, 7, 12, 3, "#2a2a3a"); R(g, 3, 6, 4, 5, "#3a4a6a"); R(g, 9, 6, 4, 5, "#3a4a6a"); P(g, 4, 7, "#bfe4ff"); P(g, 10, 7, "#bfe4ff"); return; }
  if (has("Head_Low")) { E(g, 8, 9, 5, 4, CLOTH); E(g, 8, 8, 4, 2, "#efe9d8"); R(g, 3, 6, 10, 1, dark); return; }
  if (has("Shoes")) { R(g, 2, 8, 5, 5, col); R(g, 2, 12, 7, 2, dark); R(g, 2, 8, 5, 1, hi); R(g, 9, 6, 5, 7, col); R(g, 9, 12, 6, 2, dark); R(g, 9, 6, 5, 1, hi); return; }
  if (has("Garment")) { g.fillStyle = col; for (let y = 2; y < 14; y++) { const w = 3 + Math.floor((y - 2) / 2); g.fillRect(8 - w, y, w * 2, 1); } R(g, 5, 2, 6, 2, dark); R(g, 6, 6, 1, 7, dark); R(g, 10, 6, 1, 7, dark); P(g, 8, 3, "#e8c75a"); return; }
  if (has("Both_Accessory")) { // ring or necklace
    if (/Ring|Signet|Band/.test(it.name)) { D(g, 8, 10, 4, "#e8c75a"); D(g, 8, 10, 2, "#00000000"); g.clearRect(7, 9, 3, 3); R(g, 6, 3, 4, 4, ELE[(it.element as string) ?? "Neutral"] ?? "#e2574c"); P(g, 7, 4, "#fff"); }
    else { for (let i = 0; i < 11; i++) P(g, 3 + i, 3 + Math.round(Math.sin(i / 10 * Math.PI) * 6), "#e8c75a"); D(g, 8, 11, 2, "#6fb6e0"); P(g, 7, 10, "#fff"); }
    return;
  }
  // armor: a tunic
  R(g, 4, 3, 8, 11, col); R(g, 1, 3, 3, 5, col); R(g, 12, 3, 3, 5, col); R(g, 6, 3, 4, 1, dark); R(g, 4, 3, 2, 11, hi); R(g, 10, 3, 2, 11, dark); R(g, 4, 11, 8, 1, "#3a2c20"); P(g, 8, 11, "#e8c75a");
}

function potion(g: Ctx, name: string) {
  const c = TONIC[name.split(" ")[0]] ?? "#e2574c";
  R(g, 6, 2, 4, 2, "#b08a5a"); R(g, 7, 4, 2, 2, "#e8f4ff");
  E(g, 8, 10, 4, 4, "#e8f4ff"); E(g, 8, 10, 3, 3, c); E(g, 7, 9, 1, 1, lighter(c, 0.6)); R(g, 5, 9, 6, 1, darker(c, 0.2));
}

function misc(g: Ctx, it: Item) {
  const n = it.name.toLowerCase();
  if (it.type === "Petegg") { const mob = MOB_BY_ID.get(it.mobId ?? 0), c = ELE[mob?.element ?? "Neutral"] ?? "#e8dfc8"; E(g, 8, 9, 5, 6, mixc("#f0e8d4", c, 0.2)); E(g, 7, 7, 2, 3, "#fffaf0"); for (const [x, y] of [[6, 11], [10, 8], [9, 12]]) D(g, x, y, 1, c); return; }
  if (it.type === "Petarmor") { E(g, 8, 8, 5, 4, "#d0627a"); E(g, 5, 6, 2, 3, "#e88aa0"); E(g, 11, 6, 2, 3, "#e88aa0"); R(g, 6, 10, 4, 3, "#a8445a"); return; }
  if (it.type === "Ammo") { L(g, 3, 13, 12, 4, "#c9b48a"); P(g, 13, 3, "#d0d6e0"); P(g, 12, 3, "#d0d6e0"); P(g, 13, 4, "#d0d6e0"); L(g, 3, 13, 2, 11, "#d86a5a"); L(g, 3, 13, 5, 14, "#d86a5a"); return; }
  if (/feather/.test(n)) { L(g, 3, 13, 12, 3, "#e8e0d4"); for (let i = 0; i < 8; i++) { L(g, 4 + i, 12 - i, 6 + i, 12 - i - 3, i % 2 ? "#cfd8e8" : "#fff"); } return; }
  if (/ore|coal|stone|crystal|shard|gem|gold/.test(n)) { const c = /coal/.test(n) ? "#3a3640" : /gold/.test(n) ? "#e8c75a" : /crystal|shard|gem/.test(n) ? "#7ec8ff" : "#8a8a96"; E(g, 8, 10, 5, 4, c); E(g, 6, 8, 2, 2, lighter(c, 0.5)); R(g, 9, 6, 3, 3, darker(c, 0.15)); P(g, 5, 11, darker(c, 0.3)); return; }
  if (/leaf|herb|sprout|grass|clover|moss|fern/.test(n)) { E(g, 6, 8, 4, 2, "#5fb04a"); E(g, 10, 6, 3, 2, "#7ed060"); L(g, 3, 13, 9, 7, "#3f7a30"); return; }
  if (/scroll|folio|note|tome|page|map|letter/.test(n)) { R(g, 3, 4, 10, 9, "#efe6cf"); R(g, 3, 4, 10, 1, "#c9b88a"); R(g, 3, 12, 10, 1, "#c9b88a"); for (const y of [6, 8, 10]) R(g, 5, y, 6, 1, "#8a7a52"); return; }
  if (/apple|fruit|juice|berry|orange|meat|bread|egg|honey|jam|cake|fish|food|stew/.test(n)) { D(g, 8, 9, 5, /apple|berry/.test(n) ? "#d8423a" : "#ee8a3a"); D(g, 6, 7, 1, "#fff6"); L(g, 8, 4, 10, 2, "#4f9a3c"); P(g, 8, 4, "#6a4a2e"); return; }
  if (/crate|box|chest|bag|pouch|sack/.test(n)) { R(g, 2, 5, 12, 9, WOOD_L); R(g, 2, 5, 12, 2, WOOD); R(g, 2, 9, 12, 1, WOOD); R(g, 7, 7, 2, 3, "#e8c75a"); return; }
  if (/thread|silk|cloth|fiber|fur|hide|pelt|wool/.test(n)) { E(g, 8, 9, 5, 4, "#e8e0d0"); for (let i = 0; i < 4; i++) L(g, 4, 7 + i, 12, 8 + i, "#cfc6b0"); return; }
  if (/tooth|fang|claw|horn|bone|shell|spike|tusk|stinger/.test(n)) { for (let i = 0; i < 10; i++) { const w = Math.max(0, 4 - Math.floor(i / 2.5)); R(g, 6 - w / 2 + i * 0.4, 3 + i, w + 2, 1, i < 5 ? "#f4ecd6" : "#e0d4b6"); } return; }
  // generic: a rounded bundle with a knot
  const c = ["#a6b07a", "#c9a56e", "#9db6c9", "#c98fa6", "#8fc9a6"][Math.floor(hash(it.id, 0) * 5)];
  E(g, 8, 10, 5, 4, c); E(g, 7, 8, 2, 1, lighter(c, 0.5)); R(g, 6, 4, 4, 3, darker(c, 0.15)); R(g, 7, 3, 2, 2, darker(c, 0.35));
}

const RACE_C: Record<string, string> = { Plant: "#5fb04a", Brute: "#b98a52", Insect: "#e0b83a", Formless: "#e8a0c0", Fish: "#4fb3c8", Undead: "#9a8fb0", Demihuman: "#d86a5a", Dragon: "#e8883a", Demon: "#a83a52", Angel: "#f0e090" };
function card(g: Ctx, it: Item) {
  const mob = MOB_BY_ID.get(it.mobId ?? 0), c = mob && mob.element === "Neutral" ? (RACE_C[mob.race] ?? "#9aa3b5") : ELE[mob?.element ?? "Neutral"] ?? "#9aa3b5", legendary = (it as { rarity?: string }).rarity === "legendary";
  R(g, 3, 1, 10, 14, legendary ? "#e8c75a" : "#f4eddc"); R(g, 4, 2, 8, 12, darker(c, 0.35)); R(g, 4, 2, 8, 6, c);
  if (mob) { const d = hash(mob.id, 3), r = 2 + Math.floor(d * 2); D(g, 8, 6, r, lighter(c, 0.5)); P(g, 7, 5, "#1d1830"); P(g, 9, 5, "#1d1830"); }
  R(g, 5, 10, 6, 1, lighter(c, 0.4)); R(g, 5, 12, 4, 1, lighter(c, 0.2));
}

/** The icon of an item as a pixelated data URL (16x16 art, one cached image per item). */
export function itemIconUrl(it: Item | undefined): string {
  if (!it) return "";
  const hit = cache.get(`i${it.id}`);
  if (hit) return hit;
  const { c, g } = mk(S, S);
  const lvl = Math.max(0, Math.min(4, (it.weaponLevel || it.armorLevel || 1) - 1 + (it.equipLevel > 40 ? 1 : 0)));
  const hue = METAL[lvl];
  if (it.type === "Weapon") weapon(g, it, hue);
  else if (it.type === "Armor") armorPiece(g, it, ((it.locations as string[]).some((l) => /Shoes|Garment|Head|Armor/.test(l)) ? [LEATHER, "#7a8aa0", "#a8445a", "#5a8a5a", "#8a5fc4"][Math.floor(hash(it.id, 7) * 5)] : hue));
  else if (it.type === "Healing" || /tonic|potion|elixir|juice/i.test(it.name) && it.type !== "Etc") potion(g, it.name);
  else if (it.type === "Card") card(g, it);
  else misc(g, it);
  const url = outline(c).toDataURL();
  cache.set(`i${it.id}`, url);
  return url;
}

/** The card illustration: the monster in its frame (card window). */
export function cardArt(it: Item, cv: HTMLCanvasElement) {
  const mob = MOB_BY_ID.get(it.mobId ?? 0), c = ELE[mob?.element ?? "Neutral"] ?? "#9aa3b5", g = cv.getContext("2d")!;
  g.imageSmoothingEnabled = false;
  cv.width = 120; cv.height = 150;
  const grad = g.createLinearGradient(0, 0, 0, 150); grad.addColorStop(0, lighter(c, 0.35)); grad.addColorStop(1, darker(c, 0.5));
  g.fillStyle = grad; g.fillRect(0, 0, 120, 150);
  g.fillStyle = "rgba(255,255,255,.12)"; for (let i = 0; i < 6; i++) { g.beginPath(); g.arc(20 + i * 18, 30 + (i % 2) * 12, 14, 0, 7); g.fill(); }
  if (mob) {
    const m = mobLook(mob), cell = m.move.meta.cellW, sc = Math.floor(96 / cell * 1.4) || 1;
    g.drawImage(m.move.img, 0, 0, cell, cell, 60 - (cell * sc) / 2, 125 - cell * sc + 6, cell * sc, cell * sc);
  }
  g.fillStyle = "rgba(0,0,0,.28)"; g.beginPath(); g.ellipse(60, 128, 30, 6, 0, 0, 7); g.fill();
}

/** A job emblem: its colour disc with a weapon-ish glyph (character creation). */
const JOB_COL: Record<string, string> = { Novice: "#c9b48a", Swordman: "#d8523f", Mage: "#8a5fc4", Archer: "#4fa04a", Acolyte: "#f0cf5a", Merchant: "#c98a3a", Thief: "#4a4458" };
export function jobEmblemUrl(job: string): string {
  const key = `j${job}`;
  const hit = cache.get(key);
  if (hit) return hit;
  const { c, g } = mk(S, S);
  const col = JOB_COL[job] ?? "#7a86a8", sub = job.includes("Knight") || job === "Swordman" || job.includes("Crusader") ? "1hSword"
    : /Mage|Wizard|Sage/.test(job) ? "Staff" : /Archer|Hunter|Bard|Dancer/.test(job) ? "Bow" : /Acolyte|Priest|Monk/.test(job) ? "Mace" : /Merchant|Blacksmith|Alchemist/.test(job) ? "1hAxe" : /Thief|Assassin|Rogue/.test(job) ? "Dagger" : "1hSword";
  D(g, 8, 8, 7, darker(col, 0.35)); D(g, 8, 8, 6, col); D(g, 6, 5, 2, lighter(col, 0.4));
  const { c: w, g: wg } = mk(S, S);
  weapon(wg, { subType: sub, element: "Neutral", name: "", locations: [] } as unknown as Item, "#f4f4fa");
  g.drawImage(w, 0, 0);
  const url = outline(c).toDataURL();
  cache.set(key, url);
  return url;
}

// ---------- skills ----------
type SkillLike = { id: number; key: string; name: string; type: string | null; target: string; element: string[] };
const SK_ELE: Record<string, [string, string]> = {
  Neutral: ["#8d97b5", "#4d5675"], Water: ["#5aa0e8", "#2c5aa0"], Fire: ["#f08a4a", "#a8381f"], Earth: ["#b98a52", "#6a4527"], Wind: ["#58cfae", "#2a7a68"],
  Poison: ["#a86ad0", "#5a2f80"], Holy: ["#f5d86a", "#a87f1f"], Dark: ["#7a68a8", "#2f2650"], Ghost: ["#c4c0e0", "#68648a"], Undead: ["#b0a888", "#5a5640"],
};
type G = (g: Ctx, c: string) => void;
const GLYPH: Record<string, G> = {
  sword: (g, c) => { blade(g, 5, 11, 7, c, true); L(g, 3, 9, 8, 14, "#e8c75a"); P(g, 3, 13, "#8a5d34"); P(g, 2, 14, "#8a5d34"); },
  flame: (g, c) => { E(g, 8, 10, 3, 4, c); E(g, 8, 6, 2, 3, c); P(g, 8, 2, c); E(g, 8, 11, 1, 2, "#fff3b0"); },
  frost: (g, c) => { for (const [dx, dy] of [[0, 5], [4, 3], [4, -3]]) { L(g, 8 - dx, 8 - dy, 8 + dx, 8 + dy, c); } L(g, 8, 2, 8, 14, c); P(g, 8, 8, "#fff"); },
  bolt: (g, c) => { for (const [x, y, w] of [[9, 2, 3], [8, 4, 3], [7, 6, 4], [8, 8, 3], [6, 10, 3], [5, 12, 2]] as number[][]) R(g, x, y, w, 2, c); },
  orb: (g, c) => { D(g, 8, 8, 5, c); D(g, 8, 9, 3, darker(c, 0.18)); D(g, 6, 6, 1, "#fff"); R(g, 10, 10, 2, 2, darker(c, 0.35)); L(g, 5, 9, 11, 7, lighter(c, 0.5)); },
  cross: (g, c) => { R(g, 6, 2, 4, 12, c); R(g, 2, 6, 12, 4, c); R(g, 7, 3, 1, 10, "#fff6"); },
  coin: (g, c) => { D(g, 8, 8, 6, c); D(g, 8, 8, 4, darker(c, 0.2)); R(g, 7, 5, 2, 6, c); R(g, 6, 6, 4, 1, c); R(g, 6, 9, 4, 1, c); },
  drop: (g, c) => { E(g, 8, 10, 4, 4, c); L(g, 8, 2, 5, 8, c); L(g, 8, 2, 11, 8, c); R(g, 7, 3, 2, 5, c); P(g, 6, 10, "#fff"); },
  arrow: (g, c) => { L(g, 3, 13, 13, 3, c); L(g, 13, 3, 13, 8, c); L(g, 13, 3, 8, 3, c); L(g, 3, 13, 3, 10, "#d86a5a"); L(g, 3, 13, 6, 13, "#d86a5a"); },
  rain: (g, c) => { for (const x of [3, 8, 13]) { L(g, x, 3, x - 2, 9, c); L(g, x, 4, x - 2, 10, c); } },
  book: (g, c) => { R(g, 2, 3, 6, 10, c); R(g, 8, 3, 6, 10, darker(c, 0.2)); R(g, 7, 3, 2, 10, "#fff6"); },
  shield: (g, c) => { g.fillStyle = c; for (let y = 2; y < 14; y++) { const w = y < 8 ? 5 : Math.max(0, 5 - (y - 8)); g.fillRect(8 - w, y, w * 2, 1); } R(g, 7, 3, 2, 9, "#fff8"); R(g, 4, 6, 8, 2, "#fff8"); },
  wing: (g, c) => { for (let i = 0; i < 5; i++) { L(g, 3, 12 - i, 13 - i, 2 + i * 0, c); } E(g, 8, 8, 5, 3, c); L(g, 3, 12, 13, 3, "#fff8"); },
  eye: (g, c) => { E(g, 8, 8, 6, 3, "#f4f4fa"); D(g, 8, 8, 2, c); P(g, 7, 7, "#fff"); },
  fist: (g, c) => { R(g, 3, 5, 10, 7, c); for (let i = 0; i < 4; i++) R(g, 3 + i * 2 + 1, 4, 2, 2, lighter(c, 0.3)); R(g, 4, 12, 8, 2, darker(c, 0.3)); },
  trap: (g, c) => { D(g, 8, 9, 5, "#6a6a7a"); for (let i = 0; i < 8; i++) { const a = i / 8 * 6.283; P(g, 8 + Math.cos(a) * 6, 9 + Math.sin(a) * 6, c); } D(g, 8, 9, 2, c); },
  star: (g, c) => { for (let i = 0; i < 10; i++) { const a = -1.5708 + i * 0.6283, r = i % 2 ? 3 : 7; L(g, 8, 8, 8 + Math.cos(a) * r, 8 + Math.sin(a) * r, c); } D(g, 8, 8, 2, lighter(c, 0.4)); },
  skull: (g, c) => { E(g, 8, 7, 5, 5, c); R(g, 5, 11, 6, 3, c); R(g, 5, 6, 2, 3, "#1d1830"); R(g, 9, 6, 2, 3, "#1d1830"); P(g, 8, 10, "#1d1830"); },
  note: (g, c) => { D(g, 5, 12, 2, c); D(g, 11, 10, 2, c); R(g, 6, 3, 1, 9, c); R(g, 12, 2, 1, 9, c); R(g, 6, 3, 7, 2, c); },
  up: (g, c) => { L(g, 8, 2, 3, 8, c); L(g, 8, 2, 13, 8, c); R(g, 6, 7, 4, 7, c); R(g, 7, 3, 2, 3, c); },
  leaf: (g, c) => { E(g, 7, 8, 5, 3, c); L(g, 2, 13, 11, 5, darker(c, 0.35)); },
  hammer: (g, c) => { R(g, 3, 3, 10, 5, c); R(g, 3, 3, 10, 1, lighter(c, 0.4)); R(g, 7, 8, 2, 6, "#8a5d34"); },
};
function skillGlyph(s: SkillLike): string {
  const hint = BEHAVIOR.get(s.key)?.ico;
  if (hint && GLYPH[hint]) return hint;
  const k = s.key, n = s.name.toLowerCase(), t = `${k} ${n}`;
  if (k === "NV_BASIC") return "book";
  const test = (re: RegExp) => re.test(t);
  if (test(/heal|cure|resurrection|ressurection|blessing|sanctuary|aid|restore|renew/)) return "cross";
  if (test(/mammonite|discount|overcharge|pitch|coin|zeny|vending|cart|loot/)) return "coin";
  if (test(/poison|venom|detox|acid|envenom/)) return "drop";
  if (test(/arrow|shot|shower|charge|blitz|double|strafe|aim/)) return k.includes("SHOWER") || /shower|storm|rain/.test(n) ? "rain" : "arrow";
  if (test(/cold|frost|ice|freez|water|aqua/)) return "frost";
  if (test(/lightning|thunder|bolt|spark|storm/)) return "bolt";
  if (test(/fire|flame|burn|magnum|blaze|meteor|ember|sun/)) return "flame";
  if (test(/napalm|soul|jupitel|bolt|spirit|orb|mind|energy/)) return "orb";
  if (test(/guard|shield|defen|parry|aegis|endure|block|protect/)) return "shield";
  if (test(/hide|steal|cloak|sight|detect|vision|find|ruwach|eye/)) return "eye";
  if (test(/trap|snare|land|ankle|sandman|claymore|shock/)) return "trap";
  if (test(/death|curse|undead|dark|skull|cannibal|blood|bleed/)) return "skull";
  if (test(/song|dance|voice|lullaby|sing|music|whistle|tune/)) return "note";
  if (test(/up|boost|increase|faith|concentrat|power|speed|agi|angelus|haste|attack force/)) return "up";
  if (test(/forge|smith|refine|weapon|repair|hammer|craft|anvil/)) return "hammer";
  if (test(/farm|crop|plant|herb|seed|harvest|tree|leaf|nature/)) return "leaf";
  if (test(/monk|finger|fist|palm|combo|knuckle|raging|kick|punch|body relocation/)) return "fist";
  if (test(/wing|fly|teleport|warp|gale|wind/)) return "wing";
  if (s.type === "Weapon" && s.target !== "Passive") return "sword";
  if (s.type === "Magic") return "orb";
  return "star";
}
export function skillIconUrl(s: SkillLike): string {
  const key = `s${s.id}`, hit = cache.get(key);
  if (hit) return hit;
  const passive = s.target === "Passive", [c1, c2] = SK_ELE[passive ? "Neutral" : s.element[0] ?? "Neutral"] ?? SK_ELE.Neutral;
  const { c, g } = mk(S, S);
  R(g, 1, 1, 14, 14, c2); R(g, 1, 1, 14, 7, mixc(c2, c1, 0.55)); R(g, 1, 1, 14, 1, c1);
  R(g, 0, 2, 1, 12, c2); R(g, 15, 2, 1, 12, c2); R(g, 2, 0, 12, 1, c2); R(g, 2, 15, 12, 1, c2);
  const { c: gc, g: gg } = mk(S, S);
  const gl = skillGlyph(s);
  (GLYPH[gl] ?? GLYPH.star)(gg, passive ? "#e8e4d4" : gl === "orb" || gl === "star" ? lighter(c1, 0.55) : "#ffffff");
  const dark = outline(gc, 0.85); g.drawImage(dark, -1, -1);
  const url = c.toDataURL();
  cache.set(key, url);
  return url;
}
