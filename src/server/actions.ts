/** Player actions shared by message handlers and server-driven systems (auto farm). */
import { getItem } from '../shared/config/items.ts';
import type { PlayerEntity } from './entities.ts';
import type { Zone } from './zone.ts';

export const USE_ERRORS: Record<string, string> = { dead: 'คุณตายอยู่', not_usable: 'ใช้ไอเทมนี้ไม่ได้', cooldown: 'ยาอยู่ในคูลดาวน์' };

/** Use a consumable from the bag. Returns an error code, or null on success. */
export function useItem(z: Zone, p: PlayerEntity, uid: string): string | null {
  if (p.dead) return 'dead';
  const it = p.inv.get(uid);
  const def = it ? getItem(it.defId) : undefined;
  if (!it || it.slot === null || !def?.use) return 'not_usable';
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
