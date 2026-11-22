import { CLASSES } from './data/classes.js';
import { PASSIVE_MAP, canAllocate, passivePointsFor, validatePassives } from './data/passives.js';
import { SKILL_MAP, classSkills } from './data/skills.js';
import { ITEM_BASE_MAP, ITEM_BASES, POTION } from './data/items.js';
import { CRAFT_SLOTS, ELIXIRS, MATERIALS, PROFESSIONS, PROF_MAX, RECIPE_MAP, profXpToNext, type ProfId } from './data/crafting.js';
import { generateItem, makeUid, salvageValue, sellValue, enchantCost, rerollAffix, STARTER_WEAPON } from './loot.js';
import { Rng } from './math.js';
import type { CharacterData, ClassId, EquipSlot, Item } from './types.js';
import { ACTIVE_SLOTS, CLASS_IDS, EQUIP_SLOTS, INVENTORY_SIZE, LEVEL_CAP, ULTIMATE_SLOTS } from './types.js';

export const CHARACTER_VERSION = 1;
export const MAX_CHARACTERS = 8;
export const NAME_RE = /^[A-Za-z฀-๿][A-Za-z0-9฀-๿_]{2,15}$/;

export type Result<T = void> = { ok: true; value: T } | { ok: false; reason: string };
const ok = <T>(value: T): Result<T> => ({ ok: true, value });
const fail = (reason: string): Result<never> => ({ ok: false, reason });

export function validateName(name: string): Result<string> {
  const n = name.trim();
  if (!NAME_RE.test(n)) return fail('Name must be 3-16 letters/numbers (Thai or English), starting with a letter.');
  return ok(n);
}

export function xpToNext(level: number): number {
  return Math.round(100 * Math.pow(level, 1.6));
}
export function masteryToNext(level: number): number {
  return Math.round(400 * Math.pow(level, 1.3));
}

export function createCharacter(accountId: string, name: string, cls: ClassId, hardcore: boolean): Result<CharacterData> {
  const vn = validateName(name);
  if (!vn.ok) return vn;
  if (!CLASS_IDS.includes(cls)) return fail('Unknown class');
  const rng = new Rng(Math.floor(Math.random() * 1e9));
  const weapon = generateItem({ rng, ilvl: 1, rarity: 'common', baseId: STARTER_WEAPON[cls], hardcore });
  weapon.bound = true;
  const actives = classSkills(cls, 'active').filter((s) => s.unlockLevel <= 1).map((s) => s.id);
  const ch: CharacterData = {
    id: makeUid(), accountId, name: vn.value, cls, hardcore, dead: false, level: 1, xp: 0,
    mastery: { level: 1, xp: 0 }, gold: 50, dust: 0, potions: 4,
    inventory: Array(INVENTORY_SIZE).fill(null), equipment: { weapon }, passives: [], bonusPoints: 0, respecTokens: 1,
    loadout: { active: padTo(actives, ACTIVE_SLOTS), ultimate: padTo([], ULTIMATE_SLOTS) },
    presets: [], quests: {}, stats: { kills: 0, deaths: 0, bossKills: 0, runsCleared: 0, highestTier: 0 },
    createdAt: Date.now(), version: CHARACTER_VERSION, mats: {}, prof: {}, elixir: null,
  };
  return ok(ch);
}

function padTo<T>(arr: T[], n: number): (T | null)[] {
  const out: (T | null)[] = arr.slice(0, n);
  while (out.length < n) out.push(null);
  return out;
}

/** Migrate/repair persisted data so older saves keep working when the schema grows. */
export function normalizeCharacter(raw: CharacterData): CharacterData {
  const ch = { ...raw };
  ch.inventory = padTo((ch.inventory ?? []).slice(0, INVENTORY_SIZE), INVENTORY_SIZE);
  ch.loadout = { active: padTo(ch.loadout?.active ?? [], ACTIVE_SLOTS), ultimate: padTo(ch.loadout?.ultimate ?? [], ULTIMATE_SLOTS) };
  ch.presets ??= []; ch.quests ??= {}; ch.mastery ??= { level: 1, xp: 0 };
  ch.stats ??= { kills: 0, deaths: 0, bossKills: 0, runsCleared: 0, highestTier: 0 };
  ch.mats ??= {}; ch.prof ??= {}; ch.elixir ??= null;
  ch.version = CHARACTER_VERSION;
  return ch;
}

export interface LevelResult { levels: number; masteryLevels: number }
export function grantXp(ch: CharacterData, amount: number): LevelResult {
  let levels = 0, masteryLevels = 0;
  if (ch.level < LEVEL_CAP) {
    ch.xp += Math.max(0, Math.round(amount));
    while (ch.level < LEVEL_CAP && ch.xp >= xpToNext(ch.level)) {
      ch.xp -= xpToNext(ch.level);
      ch.level++;
      levels++;
    }
    if (ch.level >= LEVEL_CAP) ch.xp = 0;
  }
  // Mastery gains 40% of XP (100% at level cap) — rewards continued play on this class.
  ch.mastery.xp += Math.round(amount * (ch.level >= LEVEL_CAP ? 1 : 0.4));
  while (ch.mastery.xp >= masteryToNext(ch.mastery.level)) {
    ch.mastery.xp -= masteryToNext(ch.mastery.level);
    ch.mastery.level++;
    masteryLevels++;
    if (ch.mastery.level % 5 === 0) ch.bonusPoints++; // every 5 mastery levels: +1 passive point
  }
  return { levels, masteryLevels };
}

export function masteryTitle(cls: ClassId, level: number): string | null {
  const titles: Record<ClassId, string[]> = {
    warrior: ['Shieldbreaker', 'Warlord of Ironvale', 'Eclipse Titan'], mage: ['Spellwright', 'Archmagus', 'Starweaver'],
    assassin: ['Nightblade', 'Veil Master', 'Moonless One'], ranger: ['Pathfinder', 'Windseeker', 'Horizon Warden'],
    paladin: ['Lightbearer', 'Dawn Champion', 'Saint of the Spire'], necromancer: ['Bonecaller', 'Grave Sovereign', 'Pale Monarch'],
  };
  const idx = level >= 30 ? 2 : level >= 15 ? 1 : level >= 5 ? 0 : -1;
  return idx >= 0 ? titles[cls][idx]! : null;
}

// ─────────── Loadout ───────────
export function setLoadout(ch: CharacterData, active: (string | null)[], ultimate: (string | null)[]): Result<void> {
  if (active.length !== ACTIVE_SLOTS || ultimate.length !== ULTIMATE_SLOTS) return fail(`Loadout must have ${ACTIVE_SLOTS} active and ${ULTIMATE_SLOTS} ultimate slots`);
  const seen = new Set<string>();
  const check = (id: string | null, kind: 'active' | 'ultimate'): string | null => {
    if (id === null) return null;
    const s = SKILL_MAP[id];
    if (!s) return `Unknown skill ${id}`;
    if (s.cls !== ch.cls) return `${s.name} belongs to another class`;
    if (s.kind !== kind) return `${s.name} cannot go in a ${kind} slot`;
    if (s.unlockLevel > ch.level) return `${s.name} unlocks at level ${s.unlockLevel}`;
    if (seen.has(id)) return `${s.name} is equipped twice`;
    seen.add(id);
    return null;
  };
  for (const id of active) { const e = check(id, 'active'); if (e) return fail(e); }
  for (const id of ultimate) { const e = check(id, 'ultimate'); if (e) return fail(e); }
  ch.loadout = { active: active.slice(), ultimate: ultimate.slice() };
  return ok(undefined);
}

// ─────────── Passives ───────────
export function allocatePassive(ch: CharacterData, nodeId: string): Result<void> {
  if (ch.passives.length >= passivePointsFor(ch.level, ch.bonusPoints)) return fail('No passive points available');
  if (!canAllocate(ch.cls, ch.passives, nodeId)) return fail('Node is not connected or not available to your class');
  ch.passives.push(nodeId);
  return ok(undefined);
}

export const FREE_RESPEC_LEVEL = 15;
export function respecCost(ch: CharacterData): number {
  return ch.level < FREE_RESPEC_LEVEL ? 0 : 50 * ch.level;
}
export function refundCost(ch: CharacterData): number {
  return ch.level < FREE_RESPEC_LEVEL ? 0 : 10 * ch.level;
}

export function refundPassive(ch: CharacterData, nodeId: string): Result<void> {
  if (!ch.passives.includes(nodeId)) return fail('Node not allocated');
  const next = ch.passives.filter((p) => p !== nodeId);
  const v = validatePassives(ch.cls, next, ch.level, ch.bonusPoints);
  if (!v.ok) return fail('Refunding this node would disconnect other nodes');
  const cost = refundCost(ch);
  if (ch.gold < cost) return fail(`Need ${cost} gold`);
  ch.gold -= cost;
  ch.passives = next;
  return ok(undefined);
}

export function respecAll(ch: CharacterData, useToken: boolean): Result<void> {
  if (useToken) {
    if (ch.respecTokens <= 0) return fail('No respec tokens');
    ch.respecTokens--;
  } else {
    const cost = respecCost(ch);
    if (ch.gold < cost) return fail(`Need ${cost} gold`);
    ch.gold -= cost;
  }
  ch.passives = [];
  return ok(undefined);
}

export function applyBuild(ch: CharacterData, passives: string[]): Result<void> {
  const v = validatePassives(ch.cls, passives, ch.level, ch.bonusPoints);
  if (!v.ok) return fail(v.reason);
  // Applying a preset counts as a respec when it removes nodes.
  const removes = ch.passives.some((p) => !passives.includes(p));
  if (removes) {
    const cost = respecCost(ch);
    if (ch.gold < cost) return fail(`Changing preset needs ${cost} gold (respec)`);
    ch.gold -= cost;
  }
  ch.passives = passives.slice();
  return ok(undefined);
}

// ─────────── Inventory & equipment ───────────
export function addItem(ch: CharacterData, it: Item): Result<number> {
  const idx = ch.inventory.findIndex((s) => s === null);
  if (idx < 0) return fail('Inventory full');
  ch.inventory[idx] = it;
  return ok(idx);
}

export function slotFor(it: Item, ch: CharacterData): EquipSlot | null {
  if (it.slot === 'ring') return ch.equipment.ring1 ? (ch.equipment.ring2 ? 'ring1' : 'ring2') : 'ring1';
  return (EQUIP_SLOTS as string[]).includes(it.slot) ? (it.slot as EquipSlot) : null;
}

export function equipFromInventory(ch: CharacterData, invIndex: number, target?: EquipSlot): Result<void> {
  const it = ch.inventory[invIndex];
  if (!it) return fail('Empty slot');
  if (it.reqLevel > ch.level) return fail(`Requires level ${it.reqLevel}`);
  if (it.hardcore !== ch.hardcore) return fail(it.hardcore ? 'Hardcore item cannot be used by Normal characters' : 'Normal item cannot be used by Hardcore characters');
  let slot = target ?? slotFor(it, ch);
  if (!slot) return fail('Cannot equip');
  if (it.slot === 'ring' && slot !== 'ring1' && slot !== 'ring2') return fail('Wrong slot');
  if (it.slot !== 'ring' && slot !== it.slot) return fail('Wrong slot');
  const prev = ch.equipment[slot] ?? null;
  ch.inventory[invIndex] = prev;
  ch.equipment[slot] = it;
  return ok(undefined);
}

export function unequip(ch: CharacterData, slot: EquipSlot): Result<void> {
  const it = ch.equipment[slot];
  if (!it) return fail('Nothing equipped');
  const r = addItem(ch, it);
  if (!r.ok) return r;
  delete ch.equipment[slot];
  return ok(undefined);
}

export function salvageItem(ch: CharacterData, invIndex: number): Result<number> {
  const it = ch.inventory[invIndex];
  if (!it) return fail('Empty slot');
  const v = salvageValue(it);
  ch.inventory[invIndex] = null;
  ch.dust += v;
  return ok(v);
}

export function sellItem(ch: CharacterData, invIndex: number): Result<number> {
  const it = ch.inventory[invIndex];
  if (!it) return fail('Empty slot');
  const v = sellValue(it);
  ch.inventory[invIndex] = null;
  ch.gold += v;
  return ok(v);
}

export function enchantItem(ch: CharacterData, loc: { inv?: number; slot?: EquipSlot }, affixIndex: number, rng: Rng): Result<Item> {
  const it = loc.inv !== undefined ? ch.inventory[loc.inv] : loc.slot ? ch.equipment[loc.slot] : undefined;
  if (!it) return fail('No item');
  if (affixIndex < 0 || affixIndex >= it.affixes.length) return fail('Invalid affix');
  const cost = enchantCost(it);
  if (ch.dust < cost.dust || ch.gold < cost.gold) return fail(`Need ${cost.dust} Astral Dust and ${cost.gold} gold`);
  ch.dust -= cost.dust;
  ch.gold -= cost.gold;
  const next = rerollAffix(it, affixIndex, rng);
  if (loc.inv !== undefined) ch.inventory[loc.inv] = next;
  else if (loc.slot) ch.equipment[loc.slot] = next;
  return ok(next);
}

export function moveInventory(ch: CharacterData, from: number, to: number): Result<void> {
  if (from < 0 || to < 0 || from >= INVENTORY_SIZE || to >= INVENTORY_SIZE) return fail('Bad index');
  const a = ch.inventory[from] ?? null;
  ch.inventory[from] = ch.inventory[to] ?? null;
  ch.inventory[to] = a;
  return ok(undefined);
}

export function weaponAffinity(ch: CharacterData): boolean {
  const w = ch.equipment.weapon;
  return !!w && !!ITEM_BASE_MAP[w.baseId]?.classes?.includes(ch.cls);
}

export function classInfo(cls: ClassId) {
  return CLASSES[cls];
}

// ─────────── Professions & crafting ───────────
export function profLevel(ch: CharacterData, p: ProfId): number { return ch.prof[p]?.lv ?? 1; }
export function grantProfXp(ch: CharacterData, p: ProfId, xp: number): number {
  const st = (ch.prof[p] ??= { lv: 1, xp: 0 });
  if (st.lv >= PROF_MAX) return 0;
  st.xp += xp;
  let ups = 0;
  while (st.lv < PROF_MAX && st.xp >= profXpToNext(st.lv)) { st.xp -= profXpToNext(st.lv); st.lv++; ups++; }
  return ups;
}
export function addMats(ch: CharacterData, mats: Record<string, number>) { for (const [k, v] of Object.entries(mats)) ch.mats[k] = (ch.mats[k] ?? 0) + v; }

export function craft(ch: CharacterData, recipeId: string, slot: string | undefined, rng: Rng): Result<{ text: string; item?: Item }> {
  const r = RECIPE_MAP[recipeId];
  if (!r) return fail('Unknown recipe');
  if (profLevel(ch, r.prof) < r.level) return fail(`Requires ${PROFESSIONS[r.prof].name} level ${r.level}`);
  for (const [m, n] of Object.entries(r.mats)) if ((ch.mats[m] ?? 0) < n) return fail(`Need ${n} ${MATERIALS[m]?.name ?? m} (have ${ch.mats[m] ?? 0})`);
  if ((r.dust ?? 0) > ch.dust) return fail(`Need ${r.dust} Astral Dust`);
  if ((r.gold ?? 0) > ch.gold) return fail(`Need ${r.gold} gold`);
  let item: Item | undefined;
  let text = '';
  if (r.result.kind === 'potion') { if (ch.potions >= POTION.maxCharges) return fail('Potion belt is full'); ch.potions++; text = '+1 potion charge'; }
  else if (r.result.kind === 'elixir') { const e = ELIXIRS[r.result.id]!; ch.elixir = { id: r.result.id, until: Date.now() + e.minutes * 60_000 }; text = `${e.name} active for ${e.minutes} minutes`; }
  else {
    const sl = (CRAFT_SLOTS as readonly string[]).includes(slot ?? '') ? slot! : 'weapon';
    const bases = ITEM_BASES.filter((b) => b.slot === sl && (sl !== 'weapon' || b.classes?.includes(ch.cls)));
    if (ch.inventory.indexOf(null) < 0) return fail('Inventory full');
    item = generateItem({ rng, ilvl: ch.level, rarity: r.result.rarity, baseId: rng.pick(bases.length ? bases : ITEM_BASES.filter((b) => b.slot === sl)).id, cls: ch.cls, hardcore: ch.hardcore });
    ch.inventory[ch.inventory.indexOf(null)] = item;
    text = `Forged ${item.name}`;
  }
  for (const [m, n] of Object.entries(r.mats)) ch.mats[m]! -= n;
  ch.dust -= r.dust ?? 0;
  ch.gold -= r.gold ?? 0;
  const ups = grantProfXp(ch, r.prof, r.xp);
  if (ups) text += ` · ${PROFESSIONS[r.prof].name} level ${profLevel(ch, r.prof)}!`;
  return ok({ text, item });
}

export function activeElixirMods(ch: CharacterData, now = Date.now()) {
  return ch.elixir && ch.elixir.until > now ? ELIXIRS[ch.elixir.id]?.mods ?? [] : [];
}

export { PASSIVE_MAP };
