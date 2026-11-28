// The expanded lines: Wayfarer (Super Novice), Marksman (Gunslinger), Shinobi (Ninja), Striker (Taekwon) and its two second jobs, Starblade
// and Soulbinder. Skills are ours (names, numbers, effects); see types.ts for the row format.
import type { JobSpec, Sk } from "./types.ts";

const GUNS = ["Revolver", "Rifle", "Gatling", "Shotgun", "Grenade"];
const B = ["Bullet"];

const WAYFARER: Sk[] = [
  { k: "SNV_GRIT", n: "Wanderer's Grit", m: 5, t: "pas", fx: { hp: [0, 3], def: [0, 2] }, ico: "shield" },
  { k: "SNV_LUCKYSTRIKE", n: "Lucky Strike", m: 10, t: "wpn", r: [120, 30], sp: [8, 1], ico: "sword" },
  { k: "SNV_SPARK", n: "Spark Bolt", m: 10, t: "mag", r: [100, 35], e: "Wind", h: 1, cast: 600, sp: [10, 2], ico: "bolt" },
  { k: "SNV_MEND", n: "Mend", m: 5, t: "heal", sp: [12, 3], ico: "cross" },
  { k: "SNV_SECONDWIND", n: "Second Wind", m: 5, t: "buff", fx: { red: [10, 5], hpr: [50, 25] }, d: [20000, 5000], cd: 30000, sp: [20, 5], ico: "wing", req: [["SNV_GRIT", 2]] },
  { k: "SNV_GUARDIAN", n: "Guardian Angel", m: 1, t: "aura", fx: { red: 20, atk: 10 }, d: [60000, 0], sp: [60, 0], ico: "wing", req: [["SNV_SECONDWIND", 3]] },
];

const MARKSMAN: Sk[] = [
  { k: "GS_SINGLEACTION", n: "Steady Aim", m: 10, t: "pas", fx: { hit: [0, 3], aspd: [0, 1] }, ico: "eye" },
  { k: "GS_SNAKEEYE", n: "Hawk Eye", m: 10, t: "pas", fx: { hit: [0, 2], flee: [0, 1] }, ico: "eye" },
  { k: "GS_CHAINACTION", n: "Double Tap", m: 10, t: "pas", fx: { cri: [0, 1], atk: [0, 1] }, ico: "arrow", req: [["GS_SINGLEACTION", 3]] },
  { k: "GS_INCREASING", n: "Sharpen Senses", m: 10, t: "buff", fx: { agi: [1, 0.4], dex: [1, 0.4], hit: [5, 2] }, d: [60000, 15000], sp: [15, 2], ico: "up" },
  { k: "GS_ADJUSTMENT", n: "Dodge Roll", m: 5, t: "buff", fx: { flee: [10, 6], hit: -20 }, d: [30000, 5000], sp: [20, 3], ico: "wing", req: [["GS_INCREASING", 2]] },
  { k: "GS_PIERCINGSHOT", n: "Piercing Shot", m: 10, t: "wpn", r: [130, 35], rg: 9, w: GUNS, ammo: B, st: ["Bleeding", 8, 3, 30000], sp: [10, 1], ico: "arrow", req: [["GS_SNAKEEYE", 3]] },
  { k: "GS_MAGICALBULLET", n: "Arcane Bullet", m: 10, t: "mag", r: [110, 25], rg: 9, w: ["Revolver", "Rifle"], ammo: B, e: "Neutral", cast: 400, sp: [12, 2], ico: "orb", req: [["GS_SNAKEEYE", 5]] },
  { k: "GS_TRACKING", n: "Tracking Shot", m: 10, t: "wpn", r: [220, 120], rg: 11, w: ["Rifle"], ammo: B, cast: 1500, sp: [30, 3], cd: 2000, ico: "arrow", req: [["GS_PIERCINGSHOT", 5]] },
  { k: "GS_RAPIDSHOWER", n: "Rapid Shower", m: 10, t: "wpn", r: [90, 25], h: 5, rg: 9, w: ["Revolver"], ammo: B, sp: [18, 2], ico: "rain", req: [["GS_CHAINACTION", 3]] },
  { k: "GS_DESPERADO", n: "Desperado", m: 10, t: "wpnSelf", r: [100, 40], h: 3, spl: 3, w: ["Revolver"], ammo: B, sp: [30, 3], cd: 1500, ico: "rain", req: [["GS_RAPIDSHOWER", 5]] },
  { k: "GS_SPREADATTACK", n: "Scatter Blast", m: 10, t: "wpnTgt", r: [100, 20], spl: 2, rg: 7, w: ["Shotgun", "Grenade"], ammo: B, sp: [15, 2], ico: "rain", req: [["GS_PIERCINGSHOT", 3]] },
  { k: "GS_DUST", n: "Dust Blast", m: 10, t: "wpn", r: [250, 40], rg: 5, w: ["Shotgun"], ammo: B, st: ["Stun", 15, 4, 3000], sp: [20, 2], ico: "fist", req: [["GS_SPREADATTACK", 3]] },
  { k: "GS_FULLBUSTER", n: "Full Blast", m: 10, t: "wpn", r: [300, 100], h: 2, rg: 9, w: ["Gatling"], ammo: B, sp: [35, 3], cd: 2000, ico: "rain", req: [["GS_PIERCINGSHOT", 5]] },
  { k: "GS_GATLINGFEVER", n: "Gatling Fever", m: 10, t: "buff", fx: { atk: [10, 3], aspd: [4, 1], flee: -20, ms: -15 }, d: [180000, 0], w: ["Gatling"], sp: [40, 3], ico: "up", req: [["GS_FULLBUSTER", 3]] },
  { k: "GS_GROUNDDRIFT", n: "Mine Toss", m: 5, t: "wpnGnd", r: [180, 70], spl: 3, rg: 7, w: ["Grenade"], ammo: B, e: "Earth", sp: [25, 4], cd: 2500, ico: "trap", req: [["GS_SPREADATTACK", 5]] },
  { k: "GS_DISARM", n: "Disarm", m: 5, t: "dbf", fx: { atk: -25 }, rg: 9, st: ["G_GS_DISARM", 40, 8, 20000], sp: [20, 3], ico: "hammer", req: [["GS_DUST", 2]] },
  { k: "GS_CRACKER", n: "Firecracker", m: 5, t: "dbf", rg: 9, st: ["Stun", 35, 6, 3000], sp: [15, 2], ico: "flame", req: [["GS_DISARM", 2]] },
];

const SHINOBI: Sk[] = [
  { k: "NJ_NEN", n: "Spirit Focus", m: 5, t: "buff", fx: { str: [0, 1], int: [0, 1], atk: [0, 3], matk: [0, 3] }, d: [60000, 15000], sp: [30, 5], ico: "up" },
  { k: "NJ_SYURIKEN", n: "Shuriken Mastery", m: 10, t: "pas", fx: { weapon: [0, 3], hit: [0, 1] }, ico: "sword" },
  { k: "NJ_THROWKUNAI", n: "Kunai Toss", m: 10, t: "wpn", r: [90, 25], h: 3, rg: 9, ammo: ["Kunai"], sp: [12, 1], ico: "arrow", req: [["NJ_SYURIKEN", 3]] },
  { k: "NJ_HUUMA", n: "Windmill Barrage", m: 5, t: "wpnTgt", r: [250, 150], spl: 2, rg: 7, w: ["Huuma"], sp: [30, 5], cd: 2000, ico: "rain", req: [["NJ_SYURIKEN", 5]] },
  { k: "NJ_KOUENKA", n: "Flame Petals", m: 10, t: "mag", r: [90, 12], h: 3, rg: 9, e: "Fire", cast: 700, sp: [12, 2], ico: "flame" },
  { k: "NJ_HYOUSENSOU", n: "Frost Spears", m: 10, t: "mag", r: [90, 12], h: 3, rg: 9, e: "Water", cast: 700, sp: [12, 2], ico: "frost" },
  { k: "NJ_HUUJIN", n: "Wind Blade", m: 10, t: "mag", r: [100, 15], h: 2, rg: 9, e: "Wind", cast: 600, sp: [12, 2], ico: "bolt" },
  { k: "NJ_RAIGEKISAI", n: "Storm Burst", m: 5, t: "magSelf", r: [120, 40], spl: 4, e: "Wind", cast: 1000, sp: [35, 5], cd: 2500, ico: "bolt", req: [["NJ_HUUJIN", 5]] },
  { k: "NJ_BAKUENRYU", n: "Dragon Pyre", m: 5, t: "magGnd", r: [350, 120], spl: 3, rg: 9, e: "Fire", cast: 2500, sp: [60, 10], cd: 4000, ico: "flame", req: [["NJ_KOUENKA", 7]] },
  { k: "NJ_KIRIKAGE", n: "Shadow Strike", m: 5, t: "wpn", r: [300, 100], rg: 2, w: ["Huuma", "Dagger"], sp: [25, 3], cd: 2500, ico: "sword", req: [["NJ_NEN", 2]] },
  { k: "NJ_UTSUSEMI", n: "Cicada Shell", m: 5, t: "buff", fx: { block: [15, 12] }, d: [60000, 0], sp: [24, 4], ico: "eye", req: [["NJ_NEN", 1]] },
  { k: "NJ_TATAMIGAESHI", n: "Mat Flip", m: 5, t: "buff", fx: { red: [15, 5] }, d: [8000, 2000], cd: 15000, sp: [20, 2], ico: "shield" },
  { k: "NJ_SHADOWJUMP", n: "Shadow Leap", m: 5, t: "tp", sp: [15, 3], cd: 4000, ico: "wing", req: [["NJ_UTSUSEMI", 2]] },
];

const STRIKER: Sk[] = [
  { k: "TK_RUN", n: "Sprint", m: 10, t: "buff", fx: { ms: [20, 2], aspd: [0, 0.5] }, d: [15000, 3000], sp: [10, 1], ico: "wing" },
  { k: "TK_DODGE", n: "Tumble", m: 5, t: "buff", fx: { flee: [8, 6], ms: 5 }, d: [30000, 6000], sp: [15, 2], ico: "wing" },
  { k: "TK_HIGHJUMP", n: "Spring Leap", m: 5, t: "tp", sp: [15, 3], cd: 3000, ico: "wing", req: [["TK_DODGE", 2]] },
  { k: "TK_DOWNKICK", n: "Heel Drop", m: 10, t: "wpn", r: [150, 40], w: ["Fist"], rg: 2, sp: [8, 1], ico: "fist" },
  { k: "TK_TURNKICK", n: "Roundhouse", m: 10, t: "wpnSelf", r: [120, 35], spl: 2, w: ["Fist"], st: ["Stun", 10, 2, 2500], sp: [12, 1], ico: "fist", req: [["TK_DOWNKICK", 3]] },
  { k: "TK_STORMKICK", n: "Hurricane Kick", m: 10, t: "wpnSelf", r: [100, 45], spl: 3, w: ["Fist"], sp: [14, 2], cd: 800, ico: "fist", req: [["TK_TURNKICK", 3]] },
  { k: "TK_COUNTER", n: "Counter Kick", m: 10, t: "wpn", r: [180, 50], w: ["Fist"], sp: [10, 2], ico: "fist", req: [["TK_DOWNKICK", 5]] },
  { k: "TK_JUMPKICK", n: "Flying Kick", m: 10, t: "wpn", r: [180, 60], rg: 6, w: ["Fist"], sp: [14, 2], cd: 1200, ico: "wing", req: [["TK_HIGHJUMP", 2]] },
  { k: "TK_READYDOWN", n: "Grounded Stance", m: 1, t: "buff", fx: { atk: 12, def: 10 }, d: [120000, 0], sp: [20, 0], ico: "shield", req: [["TK_DOWNKICK", 3]] },
  { k: "TK_READYSTORM", n: "Storm Stance", m: 1, t: "buff", fx: { cri: 10, aspd: 4 }, d: [120000, 0], sp: [20, 0], ico: "bolt", req: [["TK_STORMKICK", 3]] },
  { k: "TK_HPTIME", n: "Resting Stance", m: 5, t: "pas", fx: { hpr: [0, 20] }, ico: "cross" },
  { k: "TK_SPTIME", n: "Calm Mind", m: 5, t: "pas", fx: { spr: [0, 20] }, ico: "orb" },
];

const STARBLADE: Sk[] = [
  { k: "SG_FEEL", n: "Heaven's Feel", m: 3, t: "pas", fx: { hp: [0, 4], sp: [0, 4] }, ico: "star" },
  { k: "SG_HATE", n: "Sworn Foe", m: 3, t: "pas", fx: { atk: [0, 4], hit: [0, 5] }, ico: "skull" },
  { k: "SG_SUN_WARM", n: "Sun's Warmth", m: 3, t: "aura", fx: { atk: [4, 3], def: [0, 3] }, d: [120000, 0], sp: [40, 0], ico: "flame" },
  { k: "SG_MOON_WARM", n: "Moon's Warmth", m: 3, t: "aura", fx: { flee: [6, 4], cri: [0, 2] }, d: [120000, 0], sp: [40, 0], ico: "orb" },
  { k: "SG_STAR_WARM", n: "Star's Warmth", m: 3, t: "aura", fx: { matk: [4, 3], sp: [0, 3] }, d: [120000, 0], sp: [40, 0], ico: "star" },
  { k: "SG_SUN_COMFORT", n: "Sun's Comfort", m: 4, t: "buff", fx: { def: [5, 3], red: [0, 3] }, d: [180000, 0], sp: [30, 5], ico: "shield" },
  { k: "SG_MOON_COMFORT", n: "Moon's Comfort", m: 4, t: "buff", fx: { flee: [10, 8] }, d: [180000, 0], sp: [30, 5], ico: "wing" },
  { k: "SG_STAR_COMFORT", n: "Star's Comfort", m: 4, t: "buff", fx: { aspd: [2, 1], hit: [10, 5] }, d: [180000, 0], sp: [30, 5], ico: "up" },
  { k: "SG_STAR_ANGER", n: "Star's Fury", m: 5, t: "wpn", r: [300, 100], w: ["Fist"], sp: [30, 4], cd: 2500, ico: "star" },
  { k: "SG_METEOR", n: "Falling Star", m: 5, t: "magGnd", r: [200, 80], spl: 3, rg: 9, e: "Fire", cast: 2000, sp: [50, 6], cd: 4000, ico: "flame", req: [["SG_STAR_WARM", 1]] },
  { k: "SG_FUSION", n: "Star Fusion", m: 1, t: "buff", fx: { atk: 100, aspd: 20, def: -50 }, d: [30000, 0], cd: 120000, sp: [100, 0], ico: "star", req: [["SG_SUN_WARM", 2], ["SG_MOON_WARM", 2], ["SG_STAR_WARM", 2]] },
];

const SOULBINDER: Sk[] = [
  { k: "SL_KAINA", n: "Kaina", m: 7, t: "pas", fx: { sp: [0, 3], spr: [0, 6] }, ico: "orb" },
  { k: "SL_ESTIN", n: "Estin", m: 7, t: "magTgt", r: [60, 20], spl: 1, rg: 9, e: "Neutral", cast: 400, sp: [10, 2], ico: "orb" },
  { k: "SL_ESTUN", n: "Estun", m: 7, t: "mag", r: [90, 20], rg: 9, e: "Neutral", st: ["Stun", 40, 6, 3000], cast: 600, sp: [14, 2], ico: "bolt", req: [["SL_ESTIN", 3]] },
  { k: "SL_ESMA", n: "Esma", m: 10, t: "magGnd", r: [140, 40], spl: 3, rg: 9, e: "Wind", cast: 1500, sp: [40, 4], cd: 3000, ico: "bolt", req: [["SL_ESTUN", 3]] },
  { k: "SL_ESWOO", n: "Eswoo", m: 7, t: "dbf", fx: { ms: [-10, -4], aspd: [-5, -2], flee: [-5, -3] }, rg: 9, st: ["G_SL_ESWOO", 70, 3, 20000], sp: [20, 3], ico: "frost", req: [["SL_ESTIN", 2]] },
  { k: "SL_ESKA", n: "Eska", m: 7, t: "dbf", fx: { matk: -30 }, rg: 9, st: ["Silence", 40, 6, 12000], sp: [20, 3], ico: "skull", req: [["SL_ESWOO", 2]] },
  { k: "SL_KAAHI", n: "Kaahi", m: 7, t: "buff", fx: { hpr: [100, 80] }, d: [60000, 0], sp: [25, 3], ico: "cross" },
  { k: "SL_KAUPE", n: "Kaupe", m: 3, t: "buff", fx: { block: [40, 20] }, d: [30000, 0], sp: [30, 5], ico: "shield" },
  { k: "SL_KAITE", n: "Kaite", m: 7, t: "buff", fx: { red: [10, 5], mdef: [0, 5] }, d: [60000, 0], sp: [30, 3], ico: "shield", req: [["SL_KAUPE", 1]] },
  { k: "SL_KAIZEL", n: "Kaizel", m: 7, t: "buff", fx: { hp: [10, 4], red: [5, 3] }, d: [120000, 0], sp: [50, 5], ico: "wing", req: [["SL_KAITE", 2]] },
  { k: "SL_SPIRITLINK", n: "Soul Link", m: 5, t: "aura", fx: { atk: [3, 2], matk: [3, 2], hit: [5, 2] }, d: [120000, 0], sp: [60, 5], ico: "star", req: [["SL_KAIZEL", 2]] },
];

export const EXPANDED_JOBS: JobSpec[] = [
  { key: "Super_Novice", name: "Wayfarer", like: "Swordman", mapid: 0x100, inherit: ["Novice", "Swordman", "Mage", "Archer", "Acolyte", "Merchant", "Thief"], hp: 1.0, sp: 1.2, skills: WAYFARER,
    gear: ["Novice", "Swordman", "Mage", "Archer", "Acolyte", "Merchant", "Thief"] },
  { key: "Gunslinger", name: "Marksman", like: "Thief", mapid: 0x7, inherit: ["Novice"], hp: 1.0, sp: 1.1, skills: MARKSMAN, gear: ["Thief"],
    weapons: { Revolver: 58, Rifle: 50, Shotgun: 48, Gatling: 45, Grenade: 45 } },
  { key: "Ninja", name: "Shinobi", like: "Thief", mapid: 0x8, inherit: ["Novice"], hp: 0.95, sp: 1.3, skills: SHINOBI, gear: ["Thief"], weapons: { Huuma: 55, Dagger: 52 } },
  { key: "Taekwon", name: "Striker", like: "Swordman", mapid: 0x9, inherit: ["Novice"], hp: 1.0, sp: 1.0, skills: STRIKER, gear: ["Thief"], weapons: { Fist: 58 } },
  { key: "Star_Gladiator", name: "Starblade", like: "Monk", mapid: 0x109, inherit: ["Novice", "Taekwon"], hp: 1.0, sp: 1.0, skills: STARBLADE, gear: ["Thief"], weapons: { Fist: 60 } },
  { key: "Soul_Linker", name: "Soulbinder", like: "Priest", mapid: 0x209, inherit: ["Novice", "Taekwon"], hp: 1.0, sp: 1.2, skills: SOULBINDER, gear: ["Acolyte", "Mage"] },
];
