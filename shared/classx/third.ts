// The thirteen third jobs, one per transcendent job (shared/content/f1/jobsx.ts THIRD_OF). Each keeps its whole line's skills and adds about a
// dozen of its own: a few strikes, a few buffs or debuffs, a passive or two. Names, numbers and effects are ours.
import type { Fx, JobSpec, Sk } from "./types.ts";

type O = Partial<Sk>;
const sp = (a: number): readonly [number, number] => [8 + Math.floor(a / 25), 2];
const mk = (t: Sk["t"]) => (k: string, n: string, m: number, a: number, b: number, o: O = {}): Sk => ({ k, n, m, t, r: [a, b], sp: sp(a), ...o });
const W = mk("wpn"), WS = mk("wpnSelf"), WT = mk("wpnTgt"), WG = mk("wpnGnd"), M = mk("mag"), MS = mk("magSelf"), MG = mk("magGnd"), MT = mk("magTgt");
const BF = (k: string, n: string, m: number, fx: Fx, d: number, o: O = {}): Sk => ({ k, n, m, t: "buff", fx, d: [d, 0], sp: [20, 3], ...o });
const AU = (k: string, n: string, m: number, fx: Fx, d: number, o: O = {}): Sk => ({ k, n, m, t: "aura", fx, d: [d, 0], sp: [30, 4], ...o });
const DB = (k: string, n: string, m: number, fx: Fx, st: Sk["st"], o: O = {}): Sk => ({ k, n, m, t: "dbf", fx, st, rg: 9, sp: [20, 3], ...o });
const PS = (k: string, n: string, m: number, fx: Fx, o: O = {}): Sk => ({ k, n, m, t: "pas", fx, ...o });
const HL = (k: string, n: string, m: number, o: O = {}): Sk => ({ k, n, m, t: "heal", sp: [20, 5], ...o });
const rq = (...r: [string, number][]): O => ({ req: r });
const ARROW = ["Arrow"];

const RUNE_KNIGHT: Sk[] = [
  PS("RK_DRAGONTRAINING", "Dragon Drill", 5, { atk: [0, 2], hp: [0, 2] }),
  PS("RK_VITALITYACT", "Vitality Surge", 5, { hp: [0, 3], hpr: [0, 6] }),
  BF("RK_ENCHANTBLADE", "Runic Edge", 5, { atk: [10, 5] }, 90000, rq(["RK_DRAGONTRAINING", 2])),
  W("RK_SONICWAVE", "Shockwave", 10, 400, 100, { rg: 6, cast: 600, cd: 1500, ...rq(["RK_DRAGONTRAINING", 3]) }),
  W("RK_HUNDREDSPEAR", "Hundred Spears", 10, 300, 100, { w: ["1hSpear", "2hSpear"], rg: 3, cd: 2000 }),
  WS("RK_WINDCUTTER", "Gale Cutter", 10, 150, 50, { spl: 4, e: "Wind", ...rq(["RK_SONICWAVE", 2]) }),
  WS("RK_IGNITIONBREAK", "Ignition Break", 5, 350, 150, { spl: 5, e: "Fire", cast: 800, cd: 3000, ...rq(["RK_WINDCUTTER", 3]) }),
  WS("RK_STORMBLAST", "Storm Blast", 10, 200, 60, { spl: 3, e: "Wind", cd: 1500, ...rq(["RK_WINDCUTTER", 5]) }),
  W("RK_PHANTOMTHRUST", "Phantom Thrust", 10, 220, 80, { rg: 4, cd: 1200 }),
  BF("RK_MILLENNIUMSHIELD", "Thousand-Year Ward", 5, { red: [10, 6] }, 180000, rq(["RK_VITALITYACT", 2])),
  BF("RK_GIANTGROWTH", "Giant's Growth", 5, { str: [0, 5], atk: [0, 5] }, 90000, { ...rq(["RK_ENCHANTBLADE", 2]), cd: 60000 }),
  BF("RK_DEATHBOUND", "Deathbound", 5, { atk: [20, 10], red: -20 }, 20000, { cd: 30000 }),
];
const ROYAL_GUARD: Sk[] = [
  PS("LG_PRESTIGE", "Prestige", 5, { def: [0, 4], mdef: [0, 4] }),
  W("LG_CANNONSPEAR", "Cannon Spear", 10, 300, 100, { rg: 4, w: ["1hSpear", "2hSpear"], cd: 1500 }),
  W("LG_SHIELDPRESS", "Shield Press", 5, 250, 100, { st: ["Stun", 35, 8, 4000], cd: 1500 }),
  W("LG_PINPOINTATTACK", "Pinpoint Strike", 5, 300, 120, { st: ["Bleeding", 30, 8, 60000], ...rq(["LG_SHIELDPRESS", 2]) }),
  WS("LG_MOONSLASHER", "Moon Slasher", 5, 250, 80, { spl: 3, ...rq(["LG_SHIELDPRESS", 3]) }),
  WS("LG_EARTHDRIVE", "Earth Drive", 5, 300, 100, { spl: 5, e: "Earth", cd: 2500, ...rq(["LG_MOONSLASHER", 3]) }),
  WS("LG_OVERBRAND", "Overbrand", 5, 400, 150, { spl: 3, w: ["1hSpear", "2hSpear"], cd: 2500, ...rq(["LG_CANNONSPEAR", 5]) }),
  W("LG_EXEEDBREAK", "Exceed Break", 5, 1000, 300, { cast: 1500, cd: 5000, ...rq(["LG_PINPOINTATTACK", 3]) }),
  BF("LG_RAGEBURST", "Rage Burst", 5, { atk: [10, 8], aspd: 3 }, 60000, rq(["LG_PRESTIGE", 2])),
  BF("LG_INSPIRATION", "Inspiration", 5, { atk: 15, hp: 20, hit: 30 }, 180000, { cd: 120000, sp: [60, 0] }),
  BF("LG_REFLECTDAMAGE", "Reflecting Ward", 5, { red: [10, 6] }, 30000, rq(["LG_PRESTIGE", 3])),
  BF("LG_FORCEOFVANGUARD", "Vanguard's Resolve", 5, { def: [0, 5], hp: [0, 3] }, 120000, rq(["LG_PRESTIGE", 4])),
];
const WARLOCK: Sk[] = [
  PS("WL_TELEKINESIS", "Telekinesis", 5, { matk: [0, 2] }),
  M("WL_SOULEXPANSION", "Soul Expansion", 10, 300, 100, { e: "Ghost", cast: 700, rg: 9 }),
  M("WL_DRAINLIFE", "Drain Life", 5, 200, 80, { e: "Dark", cast: 800, rg: 9, ...rq(["WL_TELEKINESIS", 2]) }),
  MS("WL_FROSTMISTY", "Frost Mist", 5, 150, 50, { e: "Water", spl: 5, cast: 900, st: ["G_WL_FROSTMISTY", 60, 8, 12000] }),
  MS("WL_JACKFROST", "Jack Frost", 5, 500, 200, { e: "Water", spl: 5, cast: 1800, cd: 3000, ...rq(["WL_FROSTMISTY", 3]) }),
  MT("WL_HELLINFERNO", "Hell Inferno", 5, 300, 120, { e: "Fire", spl: 2, cast: 1500, rg: 9 }),
  MG("WL_CRIMSONROCK", "Crimson Rock", 5, 1000, 300, { e: "Fire", spl: 3, cast: 3500, cd: 5000, ...rq(["WL_HELLINFERNO", 3]) }),
  MG("WL_COMET", "Comet", 5, 2500, 500, { e: "Neutral", spl: 5, cast: 4000, cd: 8000, sp: [200, 10], ...rq(["WL_CRIMSONROCK", 3]) }),
  M("WL_CHAINLIGHTNING", "Chain Lightning", 10, 200, 40, { h: 5, e: "Wind", cast: 1200, rg: 9 }),
  MG("WL_EARTHSTRAIN", "Earth Strain", 5, 300, 100, { e: "Earth", spl: 4, cast: 1500, rg: 9, cd: 2000 }),
  DB("WL_MARSHOFABYSS", "Abyssal March", 5, { ms: -60, flee: [-10, -6] }, ["G_WL_MARSHOFABYSS", 70, 6, 20000], rq(["WL_DRAINLIFE", 2])),
  BF("WL_RECOGNIZEDSPELL", "Recognized Spell", 5, { matk: [10, 5] }, 60000, { cd: 30000, ...rq(["WL_TELEKINESIS", 3]) }),
];
const SORCERER: Sk[] = [
  PS("SO_SPELLFIST", "Spell Fist", 5, { matk: [0, 4] }),
  BF("SO_FIREWALK", "Fire Walk", 5, { ms: 20, matk: [4, 3] }, 30000, { sp: [30, 3] }),
  BF("SO_ELECTRICWALK", "Lightning Walk", 5, { ms: 25, flee: [5, 4] }, 30000, { sp: [30, 3] }),
  MG("SO_EARTHGRAVE", "Earth Grave", 10, 250, 100, { e: "Earth", spl: 3, cast: 1500, rg: 9, cd: 2000 }),
  MG("SO_DIAMONDDUST", "Diamond Dust", 10, 250, 100, { e: "Water", spl: 3, cast: 1500, rg: 9, cd: 2000, st: ["Freeze", 20, 3, 4000] }),
  MS("SO_PSYCHIC_WAVE", "Psychic Wave", 5, 300, 100, { e: "Neutral", spl: 5, cast: 1200, cd: 2500, ...rq(["SO_SPELLFIST", 2]) }),
  MG("SO_CLOUD_KILL", "Poison Cloud", 5, 100, 30, { e: "Poison", spl: 3, cast: 1000, rg: 9, st: ["Poison", 50, 6, 15000] }),
  MG("SO_STORMLASH", "Storm Lash", 5, 220, 80, { e: "Wind", spl: 3, cast: 1200, rg: 9 }),
  AU("SO_WARMER", "Warm Hearth", 5, { hpr: [30, 20] }, 60000),
  AU("SO_ELEMENTAL_SHIELD", "Elemental Shield", 5, { red: [10, 3], mdef: [0, 3] }, 120000, rq(["SO_SPELLFIST", 3])),
  DB("SO_VACUUM_EXTREME", "Vacuum Pull", 5, { ms: -50, flee: -20 }, ["G_SO_VACUUM_EXTREME", 70, 6, 10000]),
  DB("SO_ARRULLO", "Lullaby Spell", 5, {}, ["Sleep", 40, 8, 8000], rq(["SO_VACUUM_EXTREME", 2])),
];
const RANGER: Sk[] = [
  PS("RA_WUGMASTERY", "Wolf Bond", 5, { atk: [0, 3], hit: [0, 2] }),
  W("RA_AIMEDBOLT", "Aimed Bolt", 10, 300, 120, { rg: 11, w: ["Bow"], ammo: ARROW, cast: 900, cd: 1500, h: 1 }),
  WG("RA_ARROWSTORM", "Arrow Storm", 10, 300, 100, { w: ["Bow"], ammo: ARROW, spl: 3, rg: 9, cd: 2500, ...rq(["RA_AIMEDBOLT", 3]) }),
  W("RA_TOOTHOFWUG", "Fang Bite", 5, 200, 100, { rg: 2 }),
  WG("RA_CLUSTERBOMB", "Cluster Bomb", 5, 300, 60, { spl: 2, e: "Fire", rg: 7, cd: 2500 }),
  WG("RA_FIRINGTRAP", "Blazing Snare", 5, 250, 60, { spl: 2, e: "Fire", rg: 7, st: ["Bleeding", 20, 5, 30000] }),
  WG("RA_ICEBOUNDTRAP", "Icebound Snare", 5, 250, 60, { spl: 2, e: "Water", rg: 7, st: ["Freeze", 30, 6, 5000] }),
  DB("RA_ELECTRICSHOCKER", "Shock Trap", 5, {}, ["Stun", 50, 8, 4000], { rg: 7 }),
  DB("RA_VERDURETRAP", "Bramble Snare", 5, { ms: -50 }, ["G_RA_VERDURETRAP", 80, 4, 15000], { rg: 7 }),
  BF("RA_FEARBREEZE", "Fear Breeze", 5, { aspd: [0, 3], atk: [0, 2] }, 90000, rq(["RA_WUGMASTERY", 2])),
  BF("RA_CAMOUFLAGE", "Camouflage", 5, { flee: [20, 5], block: [10, 4], ms: -10 }, 60000),
  BF("RA_UNLIMIT", "Limit Break", 5, { atk: [20, 10], flee: -20 }, 60000, { cd: 60000, ...rq(["RA_FEARBREEZE", 3]) }),
];
const MINSTREL: Sk[] = [
  W("MIN_METALICSOUND", "Metallic Chord", 5, 220, 80, { rg: 9, w: ["Musical"], cast: 500 }),
  WS("MIN_REVERBERATION", "Reverberation", 5, 250, 100, { spl: 4, w: ["Musical"], cd: 2000 }),
  WS("MIN_SEVERE_RAINSTORM", "Arrow Rain Song", 5, 300, 100, { spl: 5, w: ["Musical"], e: "Wind", cd: 2500, ...rq(["MIN_REVERBERATION", 3]) }),
  DB("MIN_LULLABY_DEEPSLEEP", "Deep Lullaby", 5, {}, ["Sleep", 50, 8, 10000], { w: ["Musical"] }),
  DB("MIN_VOICEOFSIREN", "Siren Voice", 5, {}, ["Silence", 50, 8, 12000], { w: ["Musical"] }),
  DB("MIN_GLOOMYDAY", "Gloomy Day", 5, { flee: [-10, -6], def: [-5, -3] }, ["G_MIN_GLOOMYDAY", 70, 6, 20000], { w: ["Musical"] }),
  DB("MIN_SOUND_OF_DESTRUCTION", "Sound of Ruin", 5, { def: [-10, -6], mdef: [-5, -3] }, ["G_MIN_SOUND_OF_DESTRUCTION", 70, 6, 20000], { w: ["Musical"] }),
  AU("MIN_SATURDAY_NIGHT_FEVER", "Fever Night", 5, { atk: [10, 8], aspd: 4, def: -20 }, 60000, { cd: 60000, w: ["Musical"] }),
  AU("MIN_BEYOND_OF_WARCRY", "Beyond the War Cry", 5, { atk: [5, 4], hit: [0, 5] }, 120000, { w: ["Musical"] }),
  AU("MIN_LERADS_DEW", "Dew of Verdance", 5, { hp: [5, 4] }, 120000, { w: ["Musical"] }),
  AU("MIN_UNLIMITED_HUMMING", "Boundless Hum", 5, { matk: [5, 4], flee: [0, 3] }, 120000, { w: ["Musical"] }),
  PS("MIN_LESSON", "Master Lessons", 5, { weapon: [0, 3], sp: [0, 2] }),
];
const WANDERER: Sk[] = [
  W("WAN_METALICSOUND", "Whiplash Chime", 5, 220, 80, { rg: 9, w: ["Whip"], cast: 500 }),
  WS("WAN_REVERBERATION", "Twirling Echo", 5, 250, 100, { spl: 4, w: ["Whip"], cd: 2000 }),
  WS("WAN_SEVERE_RAINSTORM", "Cutting Rain", 5, 300, 100, { spl: 5, w: ["Whip"], e: "Water", cd: 2500, ...rq(["WAN_REVERBERATION", 3]) }),
  DB("WAN_LULLABY_DEEPSLEEP", "Dream Dance", 5, {}, ["Sleep", 50, 8, 10000], { w: ["Whip"] }),
  DB("WAN_SIRCLEOFNATURE", "Wilting Dance", 5, { atk: [-5, -4] }, ["G_WAN_SIRCLEOFNATURE", 70, 6, 20000], { w: ["Whip"] }),
  DB("WAN_SOUND_OF_DESTRUCTION", "Shattering Dance", 5, { def: [-10, -6] }, ["G_WAN_SOUND_OF_DESTRUCTION", 70, 6, 20000], { w: ["Whip"] }),
  AU("WAN_SATURDAY_NIGHT_FEVER", "Frenzied Dance", 5, { atk: [10, 8], cri: 10, def: -20 }, 60000, { cd: 60000, w: ["Whip"] }),
  AU("WAN_BEYOND_OF_WARCRY", "Dance of Courage", 5, { atk: [5, 4], red: [0, 2] }, 120000, { w: ["Whip"] }),
  AU("WAN_LERADS_DEW", "Dew of Springs", 5, { sp: [5, 4] }, 120000, { w: ["Whip"] }),
  AU("WAN_UNLIMITED_HUMMING", "Boundless Sway", 5, { aspd: [2, 1], flee: [0, 3] }, 120000, { w: ["Whip"] }),
  W("WAN_SLINGARROW", "Ribbon Lash", 10, 150, 50, { w: ["Whip"], rg: 5, st: ["Bleeding", 10, 3, 30000] }),
  PS("WAN_LESSON", "Master Steps", 5, { weapon: [0, 3], flee: [0, 3] }),
];
const ARCH_BISHOP: Sk[] = [
  M("AB_JUDEX", "Judgment", 10, 300, 100, { e: "Holy", cast: 800, rg: 9, cd: 1500 }),
  MG("AB_ADORAMUS", "Adoramus", 10, 400, 150, { e: "Holy", spl: 2, cast: 1800, rg: 9, st: ["Blind", 30, 5, 10000], cd: 3000, ...rq(["AB_JUDEX", 3]) }),
  MS("AB_DUPLELIGHT", "Twin Lights", 5, 250, 80, { e: "Holy", spl: 4, cast: 600, cd: 1500 }),
  HL("AB_HIGHNESSHEAL", "Highness Heal", 10, { cast: 500 }),
  HL("AB_LAUDAAGNUS", "Laud Agnus", 4, { cd: 10000 }),
  AU("AB_EPICLESIS", "Epiclesis", 5, { hp: [5, 3], hpr: [0, 20] }, 120000, { sp: [100, 0], cd: 120000 }),
  AU("AB_PRAEFATIO", "Praefatio", 5, { red: [5, 3] }, 60000),
  AU("AB_SECRAMENT", "Sacrament", 5, { red: [10, 3], mdef: [0, 4] }, 120000, rq(["AB_PRAEFATIO", 3])),
  AU("AB_LAUDARAMUS", "Laud Ramus", 4, { cri: [0, 3], atk: [0, 3] }, 120000),
  AU("AB_CANTO", "Canto Candidus", 5, { aspd: [1, 1], ms: [4, 2] }, 90000),
  DB("AB_ORATIO", "Oratio", 5, { hit: [-10, -6] }, ["G_AB_ORATIO", 70, 6, 20000]),
  DB("AB_EXPIATIO", "Expiatio", 5, { def: [-10, -6] }, ["G_AB_EXPIATIO", 70, 6, 20000], rq(["AB_ORATIO", 2])),
];
const SURA: Sk[] = [
  W("SR_DRAGONCOMBO", "Dragon Combo", 10, 300, 120, { h: 2, w: ["Fist", "Knuckle"], cd: 1200 }),
  WS("SR_SKYNETBLOW", "Skynet Blow", 10, 300, 100, { spl: 3, w: ["Fist", "Knuckle"], cd: 1500, ...rq(["SR_DRAGONCOMBO", 3]) }),
  WS("SR_EARTHSHAKER", "Earthshaker", 5, 400, 150, { spl: 4, st: ["Stun", 40, 8, 4000], cd: 2500, ...rq(["SR_SKYNETBLOW", 3]) }),
  W("SR_FALLENEMPIRE", "Empire's Fall", 5, 600, 200, { cd: 2500, cast: 500, ...rq(["SR_DRAGONCOMBO", 5]) }),
  W("SR_TIGERCANNON", "Tiger Cannon", 10, 800, 300, { cast: 600, cd: 3000, rg: 3, ...rq(["SR_FALLENEMPIRE", 3]) }),
  WS("SR_RAMPAGEBLASTER", "Rampage Blaster", 10, 500, 200, { spl: 3, cd: 3000, ...rq(["SR_SKYNETBLOW", 5]) }),
  W("SR_KNUCKLEARROW", "Knuckle Arrow", 5, 600, 200, { rg: 6, cd: 2500 }),
  WS("SR_GATEOFHELL", "Gate of Hell", 5, 1500, 500, { spl: 3, cd: 6000, ...rq(["SR_TIGERCANNON", 5], ["SR_RAMPAGEBLASTER", 5]) }),
  BF("SR_POWERVELOCITY", "Power Surge", 5, { atk: [0, 5], aspd: [2, 1] }, 60000),
  BF("SR_FLASHCOMBO", "Flash Combo", 5, { atk: [10, 6], aspd: 10 }, 60000, { cd: 60000, ...rq(["SR_DRAGONCOMBO", 3]) }),
  DB("SR_CURSEDCIRCLE", "Cursed Circle", 5, {}, ["Stun", 60, 6, 5000], { rg: 3 }),
  PS("SR_GENTLETOUCH", "Gentle Touch", 5, { spr: [0, 15], hpr: [0, 10] }),
];
const MECHANIC: Sk[] = [
  PS("NC_RESEARCHFE", "Alloy Research", 5, { def: [0, 3], weapon: [0, 2] }),
  W("NC_AXEBOOMERANG", "Axe Boomerang", 5, 250, 50, { rg: 5, w: ["1hAxe", "2hAxe"], cd: 1200 }),
  WS("NC_POWERSWING", "Power Swing", 5, 300, 100, { spl: 2, w: ["1hAxe", "2hAxe"], cd: 1500 }),
  WT("NC_ARMSCANNON", "Arm Cannon", 5, 400, 100, { spl: 3, rg: 7, cast: 900, cd: 2500 }),
  W("NC_VULCANARM", "Vulcan Arm", 10, 100, 60, { h: 3, rg: 9 }),
  WS("NC_FLAMELAUNCHER", "Flame Thrower", 5, 300, 100, { spl: 4, e: "Fire", cd: 2000 }),
  DB("NC_COLDSLOWER", "Cold Sprayer", 5, { ms: -30 }, ["Freeze", 30, 6, 5000], { rg: 7 }),
  W("NC_BOOSTKNUCKLE", "Boost Knuckle", 5, 300, 100, { rg: 3, cd: 1500 }),
  W("NC_PILEBUNKER", "Pile Bunker", 5, 1000, 200, { cast: 1000, cd: 4000, ...rq(["NC_BOOSTKNUCKLE", 3]) }),
  WG("NC_MAGMA_ERUPTION", "Magma Eruption", 5, 400, 100, { spl: 3, e: "Fire", rg: 7, cast: 1500, cd: 4000, st: ["Stun", 30, 6, 3000] }),
  WS("NC_SELFDESTRUCTION", "Overload Blast", 3, 1500, 500, { spl: 5, e: "Fire", cd: 10000, sp: [100, 0], ...rq(["NC_PILEBUNKER", 3]) }),
  HL("NC_REPAIR", "Field Repair", 5, { cd: 4000 }),
  DB("NC_ANALYZE", "Analyze", 5, { def: [-5, -4] }, ["G_NC_ANALYZE", 90, 2, 30000]),
];
const GENETIC: Sk[] = [
  PS("GN_RESEARCH", "Bio Research", 5, { atk: [0, 2], hp: [0, 2] }),
  WS("GN_CART_TORNADO", "Whirlwind Crate", 5, 300, 100, { spl: 3, cd: 2000 }),
  W("GN_CARTCANNON", "Crate Cannon", 5, 400, 100, { rg: 7, cast: 800, cd: 2000 }),
  DB("GN_THORNS_TRAP", "Thorn Trap", 5, { ms: -50 }, ["G_GN_THORNS_TRAP", 80, 4, 12000], { rg: 7 }),
  DB("GN_BLOOD_SUCKER", "Blood Sucker", 5, { atk: -10 }, ["Bleeding", 60, 6, 60000]),
  WT("GN_SPORE_EXPLOSION", "Spore Burst", 5, 300, 100, { spl: 3, e: "Poison", rg: 7, cast: 800, cd: 2000 }),
  MG("GN_WALLOFTHORN", "Wall of Thorns", 5, 200, 80, { spl: 3, e: "Earth", cast: 1200, rg: 7, cd: 3000 }),
  MG("GN_DEMONIC_FIRE", "Demonic Fire", 5, 300, 100, { spl: 3, e: "Fire", cast: 1500, rg: 7, cd: 3000 }),
  W("GN_HELLS_PLANT", "Hell's Plant", 5, 500, 150, { rg: 3, cd: 2500 }),
  DB("GN_MANDRAGORA", "Mandragora Howl", 5, {}, ["Silence", 50, 8, 10000], { rg: 5 }),
  W("GN_SLINGITEM", "Sling Item", 5, 250, 80, { rg: 9, cd: 1000 }),
  BF("GN_FIRE_EXPANSION", "Fire Expansion", 5, { matk: [5, 4], atk: [5, 4] }, 60000, { cd: 30000 }),
];
const GUILLOTINE: Sk[] = [
  W("GC_CROSSIMPACT", "Cross Impact", 10, 600, 200, { cd: 1500, w: ["Katar", "Dagger"] }),
  WS("GC_ROLLINGCUTTER", "Rolling Cutter", 5, 150, 50, { spl: 2, cd: 800 }),
  WS("GC_CROSSRIPPERSLASHER", "Cross Ripper", 5, 700, 150, { spl: 2, cd: 2500, ...rq(["GC_ROLLINGCUTTER", 3]) }),
  W("GC_COUNTERSLASH", "Counter Slash", 5, 500, 100, { cd: 1500 }),
  W("GC_DARKILLUSION", "Dark Illusion", 5, 250, 60, { rg: 4, cd: 2000 }),
  DB("GC_VENOMPRESSURE", "Venom Pressure", 5, {}, ["Poison", 70, 6, 30000], { rg: 3 }),
  BF("GC_POISONINGWEAPON", "Toxic Coating", 5, { ele: "Poison", atk: [0, 4] }, 90000),
  BF("GC_WEAPONBLOCKING", "Weapon Block", 5, { block: [20, 6] }, 30000, rq(["GC_COUNTERSLASH", 2])),
  BF("GC_HALLUCINATIONWALK", "Hazy Walk", 5, { flee: [10, 8], ms: 20 }, 30000, { cd: 30000 }),
  BF("GC_CLOAKINGEXCEED", "Deep Cloak", 5, { flee: [15, 6], block: [10, 5] }, 60000),
  PS("GC_FATALWOUND", "Fatal Wound", 5, { cri: [0, 3], atk: [0, 2] }),
  DB("GC_PHANTOMMENACE", "Phantom Menace", 5, { def: [-5, -4] }, ["G_GC_PHANTOMMENACE", 70, 6, 20000]),
];
const SHADOW: Sk[] = [
  W("SC_FATALMENACE", "Fatal Menace", 10, 200, 100, { rg: 4, cd: 1500 }),
  W("SC_TRIANGLESHOT", "Triangle Shot", 10, 300, 50, { h: 3, rg: 9, w: ["Bow"], ammo: ARROW, cd: 1500 }),
  WS("SC_FEINTBOMB", "Feint Bomb", 5, 350, 100, { spl: 3, e: "Fire", cd: 3000 }),
  { k: "SC_DIMENSIONDOOR", n: "Dimension Door", m: 5, t: "tp", sp: [20, 3], cd: 3000 },
  BF("SC_SHADOWFORM", "Shadow Form", 5, { red: [10, 5], flee: [0, 4] }, 30000, { cd: 30000 }),
  BF("SC_INVISIBILITY", "Invisibility", 5, { flee: [20, 6], block: [15, 5], ms: -10 }, 60000),
  DB("SC_ENERVATION", "Enervation", 5, { atk: [-10, -4] }, ["G_SC_ENERVATION", 70, 6, 30000]),
  DB("SC_GROOMY", "Gloom", 5, { def: [-10, -4] }, ["G_SC_GROOMY", 70, 6, 30000]),
  DB("SC_IGNORANCE", "Ignorance", 5, {}, ["Silence", 50, 8, 12000]),
  DB("SC_LAZINESS", "Laziness", 5, { flee: [-10, -5] }, ["G_SC_LAZINESS", 70, 6, 30000]),
  DB("SC_WEAKNESS", "Weakness", 5, { def: [-8, -4], mdef: [-8, -4] }, ["G_SC_WEAKNESS", 70, 6, 30000]),
  BF("SC_MAELSTROM", "Maelstrom", 5, { atk: [10, 6], cri: 10 }, 60000, { cd: 60000 }),
];

const J = (key: string, name: string, like: string, parent: number, inherit: string[], skills: Sk[], gear: string[]): JobSpec =>
  ({ key, name, like, mapid: parent | 0x4000, inherit: ["Novice", ...inherit], trans: true, hp: 1.12, sp: 1.1, skills, gear });
export const THIRD_JOBS: JobSpec[] = [
  J("Rune_Knight", "Runebearer", "Lord_Knight", 0x100101, ["Swordman", "Knight", "Lord_Knight"], RUNE_KNIGHT, ["Lord_Knight"]),
  J("Royal_Guard", "Bulwark", "Paladin", 0x100201, ["Swordman", "Crusader", "Paladin"], ROYAL_GUARD, ["Paladin"]),
  J("Warlock", "Hexmaster", "High_Wizard", 0x100102, ["Mage", "Wizard", "High_Wizard"], WARLOCK, ["High_Wizard"]),
  J("Sorcerer", "Spellweaver", "Professor", 0x100202, ["Mage", "Sage", "Professor"], SORCERER, ["Professor"]),
  J("Ranger", "Pathfinder", "Sniper", 0x100103, ["Archer", "Hunter", "Sniper"], RANGER, ["Sniper"]),
  J("Minstrel", "Skald", "Clown", 0x100203, ["Archer", "Bard", "Clown"], MINSTREL, ["Clown"]),
  J("Wanderer", "Dervish", "Gypsy", 0x100203 + 0x1000, ["Archer", "Dancer", "Gypsy"], WANDERER, ["Gypsy"]),
  J("Arch_Bishop", "Cardinal", "High_Priest", 0x100104, ["Acolyte", "Priest", "High_Priest"], ARCH_BISHOP, ["High_Priest"]),
  J("Sura", "Wrathmonk", "Champion", 0x100204, ["Acolyte", "Monk", "Champion"], SURA, ["Champion"]),
  J("Mechanic", "Artificer", "Whitesmith", 0x100105, ["Merchant", "Blacksmith", "Whitesmith"], MECHANIC, ["Whitesmith"]),
  J("Genetic", "Biomancer", "Creator", 0x100205, ["Merchant", "Alchemist", "Creator"], GENETIC, ["Creator"]),
  J("Guillotine_Cross", "Reaper", "Assassin_Cross", 0x100106, ["Thief", "Assassin", "Assassin_Cross"], GUILLOTINE, ["Assassin_Cross"]),
  J("Shadow_Chaser", "Wraith", "Stalker", 0x100206, ["Thief", "Rogue", "Stalker"], SHADOW, ["Stalker"]),
];
