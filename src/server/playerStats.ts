import { getItem } from '../shared/config/items.ts';
import { getWeapon } from '../shared/config/weapons.ts';
import { computeStats } from '../shared/stats.ts';
import type { PlayerEntity } from './entities.ts';
import { applyPowerStats, refreshPower } from './powers.ts';

/** Recompute derived stats + active weapon after level or equipment change. */
export function recomputeStats(p: PlayerEntity) {
  p.stats = computeStats(p.rec.level, p.inv.equipped());
  const w = p.inv.equippedIn('weapon');
  p.weapon = w ? getWeapon(getItem(w.defId)?.weaponType) : null;
  refreshPower(p);
  p.stats = applyPowerStats(p, p.stats, p.buffsNow ?? 0);
  if (p.gm && p.gmFlags.speed !== 1) p.stats.moveSpeed *= p.gmFlags.speed; // GM override bypasses caps
  p.hp = Math.min(p.hp, p.stats.hp);
  p.energy = Math.min(p.energy, p.stats.energy);
  p.ms.stamina = Math.min(p.ms.stamina, p.stats.stamina);
}
