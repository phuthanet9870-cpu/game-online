/**
 * Boot-time validation of all data definitions. The server refuses to start
 * with broken references (unknown items in loot tables, portals into walls...).
 */
import { ITEMS, SHOPS, RARITIES, getItem } from '../shared/config/items.ts';
import { MONSTERS } from '../shared/config/monsters.ts';
import { ZONES } from '../shared/config/zones.ts';
import { WEAPONS, WEAPON_TYPES, allWeaponSkills } from '../shared/config/weapons.ts';
import { STAT_CONFIG, STAT_KEYS } from '../shared/config/stats.ts';
import { generateMap, isBlocked, reachable } from '../shared/mapgen.ts';

export function validateConfig(): string[] {
  const errs: string[] = [];
  for (const k of STAT_KEYS) if (typeof STAT_CONFIG.base[k] !== 'number') errs.push(`stat base missing ${k}`);

  for (const it of Object.values(ITEMS)) {
    if (!RARITIES.includes(it.rarity)) errs.push(`item ${it.id} bad rarity`);
    if (it.stackMax < 1) errs.push(`item ${it.id} stackMax < 1`);
    if (it.category === 'weapon' && !it.weaponType) errs.push(`weapon ${it.id} missing weaponType`);
  }
  for (const shop of Object.values(SHOPS)) for (const e of shop.items) {
    if (!getItem(e.itemId)) errs.push(`shop ${shop.id} sells unknown ${e.itemId}`);
    if (e.price <= (getItem(e.itemId)?.sellPrice ?? 0)) errs.push(`shop ${shop.id} ${e.itemId} buy price must exceed sell price (gold dupe)`);
  }

  const skillIds = new Set<string>();
  for (const s of allWeaponSkills()) {
    if (skillIds.has(s.id)) errs.push(`duplicate skill id ${s.id}`);
    skillIds.add(s.id);
    if (s.cooldown <= 0) errs.push(`skill ${s.id} cooldown must be > 0`);
  }
  for (const t of WEAPON_TYPES) {
    const w = WEAPONS[t];
    if (!w) continue;
    if (w.skills.length !== 3) errs.push(`weapon ${t} must have 3 skills`);
    const starter = getItem(w.starterItem);
    if (!starter || starter.weaponType !== t) errs.push(`weapon ${t} starter item invalid`);
  }

  for (const m of Object.values(MONSTERS)) {
    if (m.levelMax < m.levelMin) errs.push(`monster ${m.id} level range`);
    if (!m.attacks.length) errs.push(`monster ${m.id} has no attacks`);
    for (const l of m.loot) {
      if (!getItem(l.itemId)) errs.push(`monster ${m.id} loot unknown item ${l.itemId}`);
      if (l.chance < 0 || l.chance > 1) errs.push(`monster ${m.id} loot chance out of range`);
      if (l.min > l.max || l.min < 1) errs.push(`monster ${m.id} loot qty range`);
    }
  }

  for (const z of Object.values(ZONES)) {
    const map = generateMap(z);
    if (isBlocked(map, z.spawnPoint.x, z.spawnPoint.y)) errs.push(`zone ${z.id} spawn point blocked`);
    const reach = reachable(map, z.spawnPoint.x, z.spawnPoint.y);
    const ok = (x: number, y: number) => reach[Math.floor(y) * map.w + Math.floor(x)] === 1;
    for (const p of z.portals) {
      const target = ZONES[p.to];
      if (!target) { errs.push(`zone ${z.id} portal ${p.id} -> unknown zone ${p.to}`); continue; }
      const tmap = generateMap(target);
      if (isBlocked(tmap, p.toX, p.toY)) errs.push(`zone ${z.id} portal ${p.id} lands in a wall in ${p.to}`);
      // landing must not be inside the target zone's own portal (ping-pong)
      for (const tp of target.portals) {
        if (p.toX >= tp.x && p.toX <= tp.x + tp.w && p.toY >= tp.y && p.toY <= tp.y + tp.h) errs.push(`zone ${z.id} portal ${p.id} lands inside portal ${tp.id}`);
      }
      if (!ok(p.x + p.w / 2, p.y + p.h / 2)) errs.push(`zone ${z.id} portal ${p.id} unreachable from spawn`);
    }
    for (const g of z.spawnGroups) {
      if (!MONSTERS[g.monsterId]) errs.push(`zone ${z.id} group ${g.id} unknown monster ${g.monsterId}`);
      if (!ok(g.x, g.y)) errs.push(`zone ${z.id} group ${g.id} unreachable`);
      if (g.maxCount < g.baseCount) errs.push(`zone ${z.id} group ${g.id} maxCount < baseCount`);
    }
    for (const n of z.npcs) {
      if (n.shopId && !SHOPS[n.shopId]) errs.push(`zone ${z.id} npc ${n.id} unknown shop`);
      if (!ok(n.x, n.y + 1) && !ok(n.x, n.y) && !ok(n.x + 1, n.y)) errs.push(`zone ${z.id} npc ${n.id} unreachable`);
    }
    for (const n of z.resourceNodes) {
      if (!getItem(n.itemId)) errs.push(`zone ${z.id} node ${n.id} unknown item`);
      if (!ok(n.x, n.y)) errs.push(`zone ${z.id} node ${n.id} unreachable`);
    }
  }
  return errs;
}
