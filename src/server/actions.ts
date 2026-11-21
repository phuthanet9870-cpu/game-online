/** Player actions shared by message handlers and server-driven systems (auto farm). */
import { getItem } from '../shared/config/items.ts';
import type { PlayerEntity } from './entities.ts';
import type { Zone } from './zone.ts';
import { ALL_POWER_IDS, grantPower } from './powers.ts';
import { createItem } from './inventory.ts';

export const USE_ERRORS: Record<string, string> = { dead: 'คุณตายอยู่', not_usable: 'ใช้ไอเทมนี้ไม่ได้', cooldown: 'ยาอยู่ในคูลดาวน์', inventory_full: 'กระเป๋าเต็ม' };

/** Use a consumable from the bag. Returns an error code, or null on success. */
export function useItem(z: Zone, p: PlayerEntity, uid: string): string | null {
  if (p.dead) return 'dead';
  const it = p.inv.get(uid);
  const def = it ? getItem(it.defId) : undefined;
  if (!it || it.slot === null || !def?.use) return 'not_usable';
  if (def.use.kind === 'power_core') {
    // Complete Power Core: random power the player does not own yet, else 30 fragments
    const missing = ALL_POWER_IDS.filter((id) => !p.rec.powers.owned.some((o) => o.id === id));
    if (!missing.length && p.inv.capacityFor({ defId: 'mat_power_fragment', rarity: 'rare', bound: false }) < 30) return 'inventory_full';
    if (!p.inv.removeUid(it.uid, 1)) return 'not_usable';
    if (missing.length) {
      const id = missing[Math.floor(z.rng() * missing.length)];
      const r = grantPower(p, id);
      p.session?.send({ t: 'notice', kind: 'level', text: r.msg });
      z.host.afterPowerChange(p);
    } else {
      p.inv.addInstance(createItem('mat_power_fragment', 30, { bound: false }));
      p.session?.send({ t: 'notice', kind: 'loot', text: 'มีพลังครบแล้ว — ได้รับเศษพลัง 30 ชิ้น' });
    }
    z.host.audit(p, 'power_core_used', { result: missing.length ? 'power' : 'fragments' });
    p.invDirty = true; p.dirty = true;
    return null;
  }
  if (z.time < p.potCdUntil && !(p.gm && p.gmFlags.nocd)) return 'cooldown';
  if (!p.inv.removeUid(it.uid, 1)) return 'not_usable';
  p.potCdUntil = z.time + def.use.cooldown;
  if (def.use.kind === 'heal') {
    const v = Math.round(def.use.flat + p.stats.hp * def.use.hpFraction);
    p.hp = Math.min(p.stats.hp, p.hp + v);
    z.emit({ e: 'heal', t: p.id, v }, p.ms.x, p.ms.y);
  } else p.energy = Math.min(p.stats.energy, p.energy + def.use.flat);
  p.invDirty = true; p.dirty = true;
  return null;
}
