// Behaviour of the skills the imported trees list but that had no code of their own, plus the ones we cut. Numbers are ours (inspired by
// the originals' shape, kept simple); rows for these skills (range, SP, cast, delay) still come from shared/data/skills.json.
import type { Sk } from "./types.ts";

/** Skills left out of the game: shops / cart / homunculus / graffiti / item crafting systems we don't have. Removed from every tree. */
export const DROP: ReadonlySet<string> = new Set([
  "MC_IDENTIFY", "MC_VENDING", "MC_PUSHCART", "MC_DISCOUNT", "MC_OVERCHARGE", "AL_WARP", "AL_HOLYWATER",
  "AM_PHARMACY", "AM_CANNIBALIZE", "AM_SPHEREMINE", "AM_CP_WEAPON", "AM_CP_SHIELD", "AM_CP_ARMOR", "AM_CP_HELM", "AM_CALLHOMUN", "AM_REST",
  "AM_RESURRECTHOMUN", "AM_BERSERKPITCHER", "AM_TWILIGHT1", "AM_TWILIGHT2", "AM_TWILIGHT3", "AM_LEARNINGPOTION",
  "RG_GRAFFITI", "RG_FLAGGRAFFITI", "RG_CLEANER", "RG_GANGSTER", "RG_COMPULSION", "RG_PLAGIARISM", "RG_TUNNELDRIVE", "RG_SNATCHER", "RG_STEALCOIN", "TF_STEAL",
  "CG_MARIONETTE", "CG_SPECIALSINGER", "CG_TAROTCARD", "HW_GANBANTEIN", "SA_ABRACADABRA", "SA_AUTOSPELL", "SA_CASTCANCEL", "SA_FREECAST", "SA_LANDPROTECTOR",
  "HT_REMOVETRAP", "HT_SPRINGTRAP", "HT_TALKIEBOX", "HT_DETECTING", "CR_SLIMPITCHER", "CR_FULLPROTECTION", "WS_CARTBOOST", "WS_CARTTERMINATION", "WS_WEAPONREFINE",
  "PF_SOULCHANGE", "PF_MEMORIZE", "PF_DOUBLECASTING", "BS_REPAIRWEAPON", "BS_FINDINGORE", "BS_ENCHANTEDSTONE", "BS_ORIDEOCON", "BS_IRON", "BS_STEEL",
  "BS_DAGGER", "BS_SWORD", "BS_TWOHANDSWORD", "BS_AXE", "BS_MACE", "BS_KNUCKLE", "BS_SPEAR", "AL_TELEPORT", "KN_RIDING", "KN_CAVALIERMASTERY",
  "MO_BODYRELOCATION", "MO_ABSORBSPIRITS", "SA_DRAGONOLOGY", "ASC_CDP", "CH_SOULCOLLECT", "BD_ENCORE", "BD_ADAPTATION", "PA_GOSPEL", "HW_SOULDRAIN", "SA_SPELLBREAKER", "SA_MAGICROD",
  "AS_LEFT", "AS_RIGHT", "ST_PRESERVE", "WZ_ESTIMATION",
]);

const dur = (ms: number) => [ms, 0] as const;
export const EXISTING: Sk[] = [
  // ---- first jobs ----
  { k: "MG_SAFETYWALL", t: "buff", fx: { block: [40, 6] }, d: dur(60000) }, { k: "MG_FIREBALL", t: "magTgt", r: [100, 20], spl: 2 },
  { k: "MG_FIREWALL", t: "magGnd", r: [120, 15], spl: 1 }, { k: "AL_RUWACH", t: "buff", fx: { hit: 15, flee: 10 }, d: dur(60000) },
  { k: "AL_PNEUMA", t: "buff", fx: { red: 35 }, d: dur(10000) }, { k: "AL_CRUCIS", t: "aura", fx: { mdef: [5, 3], def: [3, 2] }, d: dur(90000) },
  { k: "MC_INCCARRY", t: "pas", fx: { hp: [0, 1] } },
  { k: "KN_AUTOCOUNTER", t: "buff", fx: { block: [15, 5], atk: [3, 2] }, d: dur(8000) }, { k: "KN_ONEHAND", t: "buff", fx: { aspd: 5 }, d: dur(90000) },
  { k: "CR_REFLECTSHIELD", t: "buff", fx: { red: [4, 3] }, d: dur(300000) }, { k: "CR_DEVOTION", t: "buff", fx: { red: [8, 4], def: [5, 2] }, d: dur(120000) },
  { k: "CR_PROVIDENCE", t: "buff", fx: { red: [5, 2] }, d: dur(180000) }, { k: "CR_DEFENDER", t: "buff", fx: { red: [15, 5], ms: -10 }, d: dur(180000) },
  { k: "TF_HIDING", t: "buff", fx: { flee: [30, 12], block: [20, 6], ms: -15 }, d: [30000, 30000] },
  { k: "WZ_FIREPILLAR", t: "magGnd", r: [90, 20], spl: 1 }, { k: "WZ_ICEWALL", t: "buff", fx: { red: [10, 2] }, d: dur(20000) },
  { k: "WZ_QUAGMIRE", t: "dbf", fx: { ms: -50, agi: -10 }, st: ["G_WZ_QUAGMIRE", 100, 0, 15000] },
  // ---- Scholar (Sage) ----
  { k: "SA_VOLCANO", t: "aura", fx: { atk: [5, 5] }, d: dur(120000) }, { k: "SA_DELUGE", t: "aura", fx: { hp: [5, 4], flee: [4, 2] }, d: dur(120000) },
  { k: "SA_VIOLENTGALE", t: "aura", fx: { flee: [5, 3], cri: [2, 2] }, d: dur(120000) },
  // ---- Tracker (Hunter) traps ----
  { k: "HT_SKIDTRAP", t: "dbf", st: ["G_KNOCKDOWN", 100, 0, 3000], fx: { ms: -40 } }, { k: "HT_SHOCKWAVE", t: "dbf", fx: { sp: -30 }, st: ["G_HT_SHOCKWAVE", 100, 0, 12000] },
  { k: "HT_SANDMAN", t: "wpnGnd", r: [100, 0], e: "Neutral", spl: 2, st: ["Sleep", 60, 6, 15000] }, { k: "HT_FLASHER", t: "wpnGnd", r: [100, 0], spl: 2, st: ["Blind", 60, 6, 15000] },
  { k: "HT_FREEZINGTRAP", t: "wpnGnd", r: [140, 40], e: "Water", spl: 2, st: ["Freeze", 50, 5, 5000] }, { k: "HT_POWER", t: "wpn", r: [150, 30], h: 2 },
  // ---- Bard / Dancer songs ----
  { k: "BA_DISSONANCE", t: "magSelf", r: [60, 25], spl: 3, e: "Neutral" }, { k: "BA_FROSTJOKER", t: "wpnSelf", r: [50, 20], spl: 5, st: ["Freeze", 25, 5, 4000] },
  { k: "BA_POEMBRAGI", t: "aura", fx: { int: 0, cri: [0, 1], matk: [3, 2] }, d: dur(180000) },
  { k: "BD_LULLABY", t: "wpnSelf", r: [10, 0], spl: 6, st: ["Sleep", 60, 0, 15000] },
  { k: "BD_RICHMANKIM", t: "aura", fx: { hp: [4, 2] }, d: dur(180000) }, { k: "BD_ETERNALCHAOS", t: "dbf", fx: { def: -100 }, st: ["G_BD_ETERNALCHAOS", 100, 0, 30000] },
  { k: "BD_DRUMBATTLEFIELD", t: "aura", fx: { atk: [5, 4], def: [4, 4] }, d: dur(180000) }, { k: "BD_RINGNIBELUNGEN", t: "aura", fx: { atk: [10, 10] }, d: dur(180000) },
  { k: "BD_ROKISWEIL", t: "dbf", st: ["Silence", 100, 0, 30000] }, { k: "BD_INTOABYSS", t: "aura", fx: { spr: 100 }, d: dur(180000) },
  { k: "BD_SIEGFRIED", t: "aura", fx: { red: [3, 1] }, d: dur(180000) },
  { k: "DC_UGLYDANCE", t: "wpnSelf", r: [30, 20], spl: 4, e: "Neutral" }, { k: "DC_SCREAM", t: "wpnSelf", r: [20, 0], spl: 6, st: ["Stun", 60, 0, 5000] },
  { k: "DC_DONTFORGETME", t: "dbf", fx: { ms: [-5, -3], aspd: [-5, -2] }, st: ["G_DC_DONTFORGETME", 100, 0, 30000] }, { k: "DC_SERVICEFORYOU", t: "aura", fx: { sp: [10, 2] }, d: dur(180000) },
  // ---- Cleric / Oracle / Ascetic ----
  { k: "PR_SUFFRAGIUM", t: "buff", fx: { red: [10, 5] }, d: dur(30000) }, { k: "PR_BENEDICTIO", t: "aura", fx: { def: [5, 3] }, d: dur(60000) },
  { k: "PR_SLOWPOISON", t: "buff", fx: { red: 5 }, d: dur(60000) }, { k: "HP_BASILICA", t: "aura", fx: { red: 50, block: 50 }, d: dur(20000) },
  { k: "HP_MEDITATIO", t: "pas", fx: { sp: [0, 2], hpr: [0, 3] } }, { k: "HP_MANARECHARGE", t: "pas", fx: { spr: [0, 5] } },
  { k: "PR_SLOWPOISON", t: "buff", fx: { red: 5 }, d: dur(60000) },
  { k: "MO_SPIRITSRECOVERY", t: "pas", fx: { hpr: [0, 10], spr: [0, 10] } }, { k: "MO_STEELBODY", t: "buff", fx: { def: 90, mdef: 30, ms: -25, aspd: -25 }, d: [60000, 30000] },
  { k: "MO_BLADESTOP", t: "buff", fx: { block: [40, 10] }, d: dur(8000) }, { k: "MO_CHAINCOMBO", t: "wpnSelf", r: [150, 50], h: 4, spl: 1 },
  { k: "MO_COMBOFINISH", t: "wpnSelf", r: [240, 60], spl: 1 }, { k: "CH_TIGERFIST", t: "wpnSelf", r: [200, 60], h: 3, spl: 1, st: ["G_CH_TIGERFIST", 100, 0, 4000] },
  { k: "CH_CHAINCRUSH", t: "wpnSelf", r: [300, 100], h: 4, spl: 2 },
  // ---- Forgewright / Apothecary ----
  { k: "BS_HILTBINDING", t: "pas", fx: { atk: 4, str: 1 } }, { k: "BS_SKINTEMPER", t: "pas", fx: { def: [0, 2], mdef: [0, 2] } },
  { k: "BS_MAXIMIZE", t: "buff", fx: { atk: [5, 5] }, d: [30000, 30000] }, { k: "BS_ADRENALINE2", t: "aura", fx: { aspd: 10 }, d: dur(150000) },
  { k: "WS_MELTDOWN", t: "dbf", fx: { atk: -25, def: -25 }, st: ["G_WS_MELTDOWN", 100, 0, 15000] }, { k: "WS_OVERTHRUSTMAX", t: "buff", fx: { atk: [20, 10], def: -10 }, d: dur(60000) },
  { k: "CR_ACIDDEMONSTRATION", t: "wpn", r: [200, 80], h: 1, e: "Neutral" },
  // ---- Shade / Brigand ----
  { k: "AS_CLOAKING", t: "buff", fx: { flee: [20, 8], block: [15, 5], ms: 15 }, d: [30000, 30000] }, { k: "AS_POISONREACT", t: "buff", fx: { block: [10, 4] }, d: dur(60000) },
  { k: "AS_VENOMDUST", t: "wpnGnd", r: [100, 0], spl: 2, e: "Poison", st: ["Poison", 80, 0, 30000] }, { k: "AS_SPLASHER", t: "wpn", r: [500, 100], e: "Poison", spl: 1, st: ["Poison", 100, 0, 30000] },
  { k: "RG_STRIPSHIELD", t: "dbf", fx: { def: -15 }, st: ["G_RG_STRIPSHIELD", 50, 5, 30000] }, { k: "RG_STRIPHELM", t: "dbf", fx: { int: -20, mdef: -20 }, st: ["G_RG_STRIPHELM", 50, 5, 30000] },
  { k: "RG_INTIMIDATE", t: "wpn", r: [130, 30], st: ["Stun", 25, 5, 3000] },
  // ---- transcendent ----
  { k: "LK_PARRYING", t: "buff", fx: { block: [20, 4] }, d: dur(30000) }, { k: "LK_TENSIONRELAX", t: "buff", fx: { hpr: 300, spr: 300 }, d: dur(600000) },
  { k: "LK_BERSERK", t: "buff", fx: { hp: 200, atk: 60, aspd: 30, def: -50, hpr: -50 }, d: dur(300000) }, { k: "LK_HEADCRUSH", t: "wpn", r: [140, 40], st: ["Bleeding", 40, 6, 60000] },
  { k: "LK_JOINTBEAT", t: "wpn", r: [100, 20], st: ["G_LK_JOINTBEAT", 70, 3, 30000] }, { k: "PA_PRESSURE", t: "mag", r: [250, 100], h: 1, e: "Holy" },
  { k: "PA_SACRIFICE", t: "buff", fx: { atk: 120 }, d: dur(40000) }, { k: "HW_MAGICCRASHER", t: "mag", r: [130, 0], e: "Neutral" },
  { k: "HW_GRAVITATION", t: "magGnd", r: [100, 40], spl: 3, e: "Neutral" }, { k: "PF_HPCONVERSION", t: "heal", r: [0, 0] },
  { k: "PF_SOULBURN", t: "mag", r: [300, 150], e: "Dark" }, { k: "PF_MINDBREAKER", t: "dbf", fx: { matk: -20, mdef: -20 }, st: ["G_PF_MINDBREAKER", 60, 5, 30000] },
  { k: "PF_FOGWALL", t: "magGnd", r: [50, 10], spl: 2, e: "Neutral", st: ["Blind", 20, 0, 10000] }, { k: "PF_SPIDERWEB", t: "dbf", fx: { ms: -90, flee: -50 }, st: ["G_PF_SPIDERWEB", 100, 0, 8000] },
  { k: "SN_SIGHT", t: "buff", fx: { hit: [10, 5], cri: [5, 2] }, d: dur(30000) }, { k: "SN_FALCONASSAULT", t: "wpn", r: [400, 150], h: 1 },
  { k: "CG_MOONLIT", t: "aura", fx: { flee: [10, 5] }, d: dur(30000) }, { k: "CG_HERMODE", t: "aura", fx: { mdef: 99, red: 30 }, d: dur(60000) },
  { k: "ST_CHASEWALK", t: "buff", fx: { flee: 40, block: 30, ms: 10 }, d: dur(60000) }, { k: "ST_REJECTSWORD", t: "buff", fx: { block: [20, 6] }, d: dur(90000) },
  { k: "ST_FULLSTRIP", t: "dbf", fx: { def: -40, atk: -25 }, st: ["G_ST_FULLSTRIP", 60, 5, 30000] },
  { k: "ASC_KATAR", t: "pas", fx: { weapon: [0, 2] } }, { k: "ASC_EDP", t: "buff", fx: { atk: [50, 40], def: -20 }, d: dur(40000) },
];
