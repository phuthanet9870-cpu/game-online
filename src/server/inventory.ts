/**
 * Server-side item creation and inventory operations. The client never
 * creates items; it only sends requests that reference server-issued uids.
 * Every operation validates before mutating, so a failed call leaves the
 * inventory untouched.
 */
import { EQUIP_SLOTS, INVENTORY_CONFIG, RARITIES, getItem, isEquipment, slotsForCategory, type EquipSlot, type ItemInstance, type Rarity } from '../shared/config/items.ts';

export function createItem(defId: string, qty: number, opts: { rarity?: Rarity; ilvl?: number; bound?: boolean } = {}): ItemInstance {
  const def = getItem(defId);
  if (!def) throw new Error(`unknown item ${defId}`);
  if (!Number.isInteger(qty) || qty < 1) throw new Error(`bad qty ${qty} for ${defId}`);
  const rarity = opts.rarity && RARITIES.includes(opts.rarity) ? opts.rarity : def.rarity;
  return {
    uid: crypto.randomUUID(), defId, qty, rarity, ilvl: opts.ilvl ?? def.levelReq, enhance: 0,
    bound: opts.bound ?? def.bind === 'on_pickup', slot: null, equip: null,
  };
}

export class Inventory {
  constructor(public items: ItemInstance[], public slots = INVENTORY_CONFIG.slots) {}

  get(uid: string) { return this.items.find((i) => i.uid === uid); }
  bagItems() { return this.items.filter((i) => i.slot !== null); }
  equipped() { return this.items.filter((i) => i.equip !== null); }
  equippedIn(slot: EquipSlot) { return this.items.find((i) => i.equip === slot); }
  count(defId: string) { return this.bagItems().filter((i) => i.defId === defId).reduce((a, b) => a + b.qty, 0); }

  freeSlots(): number[] {
    const used = new Set(this.bagItems().map((i) => i.slot as number));
    const out: number[] = [];
    for (let s = 0; s < this.slots; s++) if (!used.has(s)) out.push(s);
    return out;
  }

  private stackable(a: ItemInstance, b: { defId: string; rarity: Rarity; bound: boolean }) {
    return a.defId === b.defId && a.rarity === b.rarity && a.bound === b.bound && a.slot !== null;
  }

  /** How many units of this kind of item fit right now. */
  capacityFor(inst: { defId: string; rarity: Rarity; bound: boolean }): number {
    const def = getItem(inst.defId);
    if (!def) return 0;
    let cap = this.freeSlots().length * def.stackMax;
    if (def.stackMax > 1) for (const i of this.items) if (this.stackable(i, inst)) cap += def.stackMax - i.qty;
    return cap;
  }

  /** Add a server-created instance (merging stacks). All-or-nothing. */
  addInstance(inst: ItemInstance): boolean {
    const def = getItem(inst.defId);
    if (!def || !Number.isInteger(inst.qty) || inst.qty < 1) return false;
    if (this.items.some((i) => i.uid === inst.uid)) return false;
    if (this.capacityFor(inst) < inst.qty) return false;
    let left = inst.qty;
    if (def.stackMax > 1) {
      for (const i of this.items) {
        if (left <= 0) break;
        if (!this.stackable(i, inst)) continue;
        const n = Math.min(def.stackMax - i.qty, left);
        i.qty += n;
        left -= n;
      }
    }
    const free = this.freeSlots();
    let first = true;
    while (left > 0) {
      const n = Math.min(def.stackMax, left);
      const slot = free.shift();
      if (slot === undefined) throw new Error('capacity check failed');
      this.items.push({ ...inst, uid: first ? inst.uid : crypto.randomUUID(), qty: n, slot, equip: null });
      first = false;
      left -= n;
    }
    return true;
  }

  /** Remove qty from one bag stack. Returns removed portion or null. */
  removeUid(uid: string, qty: number): ItemInstance | null {
    const it = this.get(uid);
    if (!it || it.slot === null || !Number.isInteger(qty) || qty < 1 || qty > it.qty) return null;
    if (qty === it.qty) {
      this.items.splice(this.items.indexOf(it), 1);
      return { ...it, slot: null };
    }
    it.qty -= qty;
    return { ...it, uid: crypto.randomUUID(), qty, slot: null };
  }

  /** Remove qty of a definition across stacks. All-or-nothing. */
  removeDef(defId: string, qty: number): boolean {
    if (qty < 1 || this.count(defId) < qty) return false;
    let left = qty;
    const stacks = this.bagItems().filter((x) => x.defId === defId).sort((a, b) => a.qty - b.qty);
    for (const i of stacks) {
      const n = Math.min(i.qty, left);
      this.removeUid(i.uid, n);
      left -= n;
      if (left === 0) break;
    }
    return true;
  }

  equip(uid: string, level: number): { ok: true; slot: EquipSlot; replaced: ItemInstance | null } | { ok: false; code: string } {
    const it = this.get(uid);
    if (!it || it.slot === null) return { ok: false, code: 'not_in_bag' };
    const def = getItem(it.defId);
    if (!def || !isEquipment(def)) return { ok: false, code: 'not_equipment' };
    if (level < def.levelReq) return { ok: false, code: 'level_too_low' };
    const slots = slotsForCategory(def.category);
    const target = slots.find((s) => !this.equippedIn(s)) ?? slots[0];
    const prev = this.equippedIn(target) ?? null;
    const fromSlot = it.slot;
    if (prev) { prev.equip = null; prev.slot = fromSlot; }
    it.slot = null;
    it.equip = target;
    if (def.bind === 'on_equip') it.bound = true;
    return { ok: true, slot: target, replaced: prev };
  }

  unequip(slot: EquipSlot): { ok: true } | { ok: false; code: string } {
    if (!(EQUIP_SLOTS as readonly string[]).includes(slot)) return { ok: false, code: 'bad_slot' };
    const it = this.equippedIn(slot);
    if (!it) return { ok: false, code: 'empty_slot' };
    const free = this.freeSlots();
    if (!free.length) return { ok: false, code: 'inventory_full' };
    it.equip = null;
    it.slot = free[0];
    return { ok: true };
  }

  /** Integrity check used by tests and before every save. */
  validate(): string[] {
    const errs: string[] = [];
    const uids = new Set<string>(), slots = new Set<number>(), eq = new Set<string>();
    for (const i of this.items) {
      const def = getItem(i.defId);
      if (!def) errs.push(`unknown def ${i.defId}`);
      if (uids.has(i.uid)) errs.push(`dup uid ${i.uid}`);
      uids.add(i.uid);
      if ((i.slot === null) === (i.equip === null)) errs.push(`item ${i.uid} must be in exactly one of bag/equip`);
      if (i.slot !== null) {
        if (slots.has(i.slot) || i.slot < 0 || i.slot >= this.slots) errs.push(`bad slot ${i.slot}`);
        slots.add(i.slot);
      }
      if (i.equip !== null) {
        if (eq.has(i.equip)) errs.push(`dup equip ${i.equip}`);
        eq.add(i.equip);
      }
      if (def && (i.qty < 1 || i.qty > def.stackMax)) errs.push(`bad qty ${i.qty} for ${i.defId}`);
    }
    return errs;
  }
}
