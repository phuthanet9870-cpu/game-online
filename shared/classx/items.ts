// Gear for the extended classes: guns and bullets for the Marksman, throwing stars and kunai for the Shinobi, plus the job lists of existing
// equipment widened to the classes that wear the same kind of thing (a spec's `gear`).
import type { JobSpec } from "./types.ts";

type Row = Record<string, unknown> & { id: number; jobs: string[]; type: string };
const weapon = (id: number, name: string, sub: string, atk: number, wlv: number, eq: number, buy: number, range: number, loc: string, jobs: string[]): Row => ({
  id, name, type: "Weapon", subType: sub, buy, sell: Math.floor(buy / 2), weight: 500 + wlv * 100, atk, matk: 0, def: 0, range, slots: 2, weaponLevel: wlv, armorLevel: 0,
  equipLevel: eq, equipLevelMax: 0, refineable: true, locations: [loc], jobs, affix: null, mobId: null, element: "Neutral", bonuses: [], unsupported: [], effect: null,
  shop: true, starter: false, grade: wlv >= 3 ? "rare" : wlv === 2 ? "fine" : "common",
});
const ammo = (id: number, name: string, sub: string, atk: number, buy: number, jobs: string[], element = "Neutral"): Row => ({
  id, name, type: "Ammo", subType: sub, buy, sell: 0, weight: 1, atk, matk: 0, def: 0, range: 0, slots: 0, weaponLevel: 0, armorLevel: 0, equipLevel: 1, equipLevelMax: 0,
  refineable: false, locations: ["Ammo"], jobs, affix: null, mobId: null, element, bonuses: [], unsupported: [], effect: null, shop: true, starter: false,
});
const material = (id: number, name: string, sell: number): Row => ({
  id, name, type: "Etc", subType: null, buy: sell * 2, sell, weight: 1, atk: 0, matk: 0, def: 0, range: 0, slots: 0, weaponLevel: 0, armorLevel: 0, equipLevel: 0,
  equipLevelMax: 0, refineable: false, locations: [], jobs: [], affix: null, mobId: null, element: "Neutral", bonuses: [], unsupported: [], effect: null, shop: false, starter: false,
});
const G = ["Gunslinger"], N = ["Ninja"];
export const CLASSX_ITEMS: Row[] = [
  weapon(3101, "Six-Shooter", "Revolver", 40, 1, 1, 3000, 9, "Right_Hand", G), weapon(3102, "Peacemaker", "Revolver", 72, 2, 30, 9000, 9, "Right_Hand", G), weapon(3103, "Grand Revolver", "Revolver", 115, 3, 60, 26000, 9, "Right_Hand", G),
  weapon(3104, "Hunter Rifle", "Rifle", 58, 1, 20, 6000, 11, "Both_Hand", G), weapon(3105, "Long Barrel", "Rifle", 98, 2, 45, 16000, 11, "Both_Hand", G),
  weapon(3106, "Scattergun", "Shotgun", 62, 1, 20, 5500, 7, "Both_Hand", G), weapon(3107, "Boomstick", "Shotgun", 104, 2, 45, 15000, 7, "Both_Hand", G),
  weapon(3108, "Crank Gun", "Gatling", 82, 2, 35, 12000, 9, "Both_Hand", G), weapon(3109, "Storm Gatling", "Gatling", 134, 3, 65, 32000, 9, "Both_Hand", G),
  weapon(3110, "Pipe Launcher", "Grenade", 72, 2, 35, 11000, 7, "Both_Hand", G),
  ammo(3111, "Iron Bullet", "Bullet", 15, 4, G), ammo(3112, "Silver Bullet", "Bullet", 28, 12, G, "Holy"),
  weapon(3113, "Windmill Star", "Huuma", 46, 1, 1, 3500, 5, "Right_Hand", N), weapon(3114, "Great Windmill", "Huuma", 90, 2, 40, 14000, 5, "Right_Hand", N),
  ammo(3115, "Kunai", "Kunai", 30, 5, N),
  // materials of the monster variants (shared/rules/variants.ts), spent on equipment upgrades
  material(3120, "Elite Essence", 120), material(3121, "Cursed Ember", 160), material(3122, "Ancient Fragment", 400),
];

/** `jobs` of every item widened: a class that wears what the listed jobs wear. */
export function widenJobs<T extends { jobs: readonly string[] }>(items: T[], specs: readonly JobSpec[]): T[] {
  return items.map((it) => {
    const extra = specs.filter((j) => j.gear?.some((g) => it.jobs.includes(g))).map((j) => j.key).filter((k) => !it.jobs.includes(k));
    return extra.length ? { ...it, jobs: [...it.jobs, ...extra] } : it;
  });
}
