/**
 * Server-side Auto Farm. The server drives the character by generating the
 * same controls a player would send, so every action still passes the normal
 * validation (cooldowns, energy, range, collision). Client input while auto is
 * running cancels it.
 */
import { AUTO_CONFIG, type AutoSettings } from '../shared/config/auto.ts';
import { RARITIES, getItem } from '../shared/config/items.ts';
import { findPath, lineClear } from '../shared/pathfind.ts';
import { attackBand } from '../shared/combat.ts';
import { BTN } from '../shared/protocol.ts';
import type { DropEntity, MonsterEntity, PlayerEntity } from './entities.ts';
import type { Zone } from './zone.ts';
import { useItem } from './actions.ts';

export interface AutoState {
  cfg: AutoSettings;
  startedAt: number;
  anchorX: number; anchorY: number;
  kills: number;
  targetId: number | null;
  lootId: number | null;
  path: { x: number; y: number }[];
  repathAt: number;
  pathGoal: { x: number; y: number };
}

export interface Controls { mx: number; my: number; ax: number; ay: number; b: number }

export type AutoStartResult = { ok: true } | { ok: false; code: string; msg: string };

export function canStartAuto(z: Zone, p: PlayerEntity): AutoStartResult {
  if (p.dead) return { ok: false, code: 'dead', msg: 'ตายอยู่ ใช้ออโต้ไม่ได้' };
  if (z.def.safe) return { ok: false, code: 'safe_zone', msg: 'ใช้ออโต้ในเมือง/Safe Zone ไม่ได้ ออกไปที่แมพฟาร์มก่อน' };
  if (z.def.kind !== 'field') return { ok: false, code: 'not_field', msg: 'ออโต้ใช้ได้เฉพาะแมพฟาร์ม' };
  if (!p.weapon) return { ok: false, code: 'no_weapon', msg: 'ต้องถืออาวุธ' };
  const recent = p.autoKillTimes.filter((t) => t > z.time - 3600).length;
  if (recent >= AUTO_CONFIG.hourlyKillCap) return { ok: false, code: 'hour_cap', msg: `ครบโควตาออโต้ ${AUTO_CONFIG.hourlyKillCap} ตัว/ชั่วโมงแล้ว` };
  return { ok: true };
}

export function startAuto(z: Zone, p: PlayerEntity, cfg: AutoSettings) {
  p.auto = {
    cfg, startedAt: z.time, anchorX: p.ms.x, anchorY: p.ms.y, kills: 0, targetId: null, lootId: null,
    path: [], repathAt: 0, pathGoal: { x: NaN, y: NaN },
  };
}

export function stopAuto(p: PlayerEntity, reason: string) {
  if (!p.auto) return;
  const kills = p.auto.kills;
  p.auto = null;
  p.session?.send({ t: 'auto', on: false, kills, reason });
}

function monsterAllowed(m: MonsterEntity, cfg: AutoSettings): boolean {
  if (m.state === 'dead' || m.state === 'return') return false;
  if (!(AUTO_CONFIG.allowedTiers as readonly string[]).includes(m.def.tier)) return false; // bosses are never auto-targetable
  if (m.def.tier === 'elite' && !cfg.allowElite) return false;
  if (cfg.targets.length && !cfg.targets.includes(m.def.id)) return false;
  return true;
}

function lootWanted(d: DropEntity, cfg: AutoSettings): boolean {
  if (!d.item) return cfg.loot.gold;
  const def = getItem(d.item.defId);
  if (!def) return false;
  if (def.category === 'material' || def.category === 'rune') return cfg.loot.materials;
  if (def.category === 'consumable') return cfg.loot.consumables;
  if (cfg.loot.equipmentMinRarity === 'none') return false;
  return RARITIES.indexOf(d.item.rarity) >= RARITIES.indexOf(cfg.loot.equipmentMinRarity);
}

function steer(z: Zone, p: PlayerEntity, a: AutoState, gx: number, gy: number): { mx: number; my: number } {
  const t = z.time;
  if (lineClear(z.map, p.ms.x, p.ms.y, gx, gy)) a.path = [{ x: gx, y: gy }];
  else if (t >= a.repathAt || Math.hypot(gx - a.pathGoal.x, gy - a.pathGoal.y) > 1.5) {
    a.repathAt = t + AUTO_CONFIG.repathSec;
    a.pathGoal = { x: gx, y: gy };
    a.path = findPath(z.map, p.ms.x, p.ms.y, gx, gy, 3000) ?? [];
  }
  while (a.path.length && Math.hypot(a.path[0].x - p.ms.x, a.path[0].y - p.ms.y) < 0.2) a.path.shift();
  if (!a.path.length) return { mx: 0, my: 0 };
  const dx = a.path[0].x - p.ms.x, dy = a.path[0].y - p.ms.y, d = Math.hypot(dx, dy) || 1;
  return { mx: dx / d, my: dy / d };
}

function hasPotion(p: PlayerEntity, defId: string) { return p.inv.bagItems().some((i) => i.defId === defId); }

/** One auto tick. Returns the controls to apply, or null when auto stopped. */
export function autoTick(z: Zone, p: PlayerEntity): Controls | null {
  const a = p.auto;
  if (!a) return null;
  const t = z.time, cfg = a.cfg;
  const idle: Controls = { mx: 0, my: 0, ax: p.facingX, ay: p.facingY, b: 0 };

  // ---- stop conditions
  if (p.dead) { stopAuto(p, 'ตัวละครตาย'); return null; }
  if (z.def.safe) { stopAuto(p, 'เข้าเขตปลอดภัย'); return null; }
  if (cfg.stop.minutes > 0 && t - a.startedAt >= cfg.stop.minutes * 60) { stopAuto(p, `ครบเวลา ${cfg.stop.minutes} นาที`); return null; }
  if (t - a.startedAt >= AUTO_CONFIG.maxSessionMinutes * 60) { stopAuto(p, 'ครบเวลาสูงสุดต่อรอบ'); return null; }
  if (cfg.stop.kills > 0 && a.kills >= cfg.stop.kills) { stopAuto(p, `ครบ ${cfg.stop.kills} ตัว`); return null; }
  if (p.autoKillTimes.filter((x) => x > t - 3600).length >= AUTO_CONFIG.hourlyKillCap) { stopAuto(p, `ครบโควตา ${AUTO_CONFIG.hourlyKillCap} ตัว/ชั่วโมง`); return null; }
  if (cfg.stop.whenBagFull && p.inv.freeSlots().length === 0) { stopAuto(p, 'กระเป๋าเต็ม'); return null; }
  if (cfg.stop.whenOutOfPotions && cfg.hpPotionPct > 0 && !hasPotion(p, 'pot_hp_small')) { stopAuto(p, 'ยา HP หมด'); return null; }

  // ---- potions
  if (cfg.hpPotionPct > 0 && p.hp / p.stats.hp * 100 < cfg.hpPotionPct && t >= p.potCdUntil) {
    const pot = p.inv.bagItems().find((i) => i.defId === 'pot_hp_small');
    if (pot) useItem(z, p, pot.uid);
  }
  if (cfg.enPotionPct > 0 && p.energy / p.stats.energy * 100 < cfg.enPotionPct && t >= p.potCdUntil) {
    const pot = p.inv.bagItems().find((i) => i.defId === 'pot_energy_small');
    if (pot) useItem(z, p, pot.uid);
  }

  // ---- loot (only when not fighting)
  const inRadius = (x: number, y: number) => Math.hypot(x - a.anchorX, y - a.anchorY) <= cfg.radius;
  let target = a.targetId !== null ? z.monsters.get(a.targetId) : undefined;
  if (target && (!monsterAllowed(target, cfg) || !inRadius(target.x, target.y) && !target.threat.has(p.id))) { target = undefined; a.targetId = null; }
  // anything already attacking us takes priority
  if (!target) {
    for (const m of z.monsters.values()) {
      if (m.targetId !== p.id || m.state === 'dead' || m.state === 'return') continue;
      if (!(AUTO_CONFIG.allowedTiers as readonly string[]).includes(m.def.tier) || (m.def.tier === 'elite' && !cfg.allowElite)) {
        // never auto-fight bosses (or elites when not allowed): hand control back to the player
        stopAuto(p, `ถูก ${m.def.nameTh} โจมตี — ควบคุมเอง`);
        return null;
      }
      target = m; break;
    }
  }
  if (!target) {
    let drop: DropEntity | undefined = a.lootId !== null ? z.drops.get(a.lootId) : undefined;
    if (!drop) {
      a.lootId = null;
      let bd = Infinity;
      for (const d of z.drops.values()) {
        if (d.ownerCharId && d.ownerCharId !== p.rec.id && t < d.ownerUntil) continue;
        if (!lootWanted(d, cfg) || !inRadius(d.x, d.y)) continue;
        const dd = Math.hypot(d.x - p.ms.x, d.y - p.ms.y);
        if (dd < bd && dd <= AUTO_CONFIG.lootRadius + cfg.radius) { bd = dd; drop = d; }
      }
      a.lootId = drop?.id ?? null;
    }
    if (drop) {
      if (Math.hypot(drop.x - p.ms.x, drop.y - p.ms.y) <= 1.8) {
        const err = z.pickup(p, drop.id);
        if (err) a.lootId = null; // full bag / gone: skip it
        return idle;
      }
      const s = steer(z, p, a, drop.x, drop.y);
      return { ...idle, ...s };
    }
    // ---- pick the nearest allowed monster within the radius
    let bd = Infinity;
    for (const m of z.monsters.values()) {
      if (!monsterAllowed(m, cfg) || !inRadius(m.x, m.y)) continue;
      const d = Math.hypot(m.x - p.ms.x, m.y - p.ms.y);
      if (d < bd) { bd = d; target = m; }
    }
  }
  if (!target) {
    // nothing to do: drift back to the anchor
    if (Math.hypot(a.anchorX - p.ms.x, a.anchorY - p.ms.y) > 1.5) return { ...idle, ...steer(z, p, a, a.anchorX, a.anchorY) };
    return idle;
  }
  a.targetId = target.id;

  // ---- fight
  const w = p.weapon!;
  const d = Math.hypot(target.x - p.ms.x, target.y - p.ms.y);
  const ax = target.x - p.ms.x, ay = target.y - p.ms.y;
  const [minR, maxR] = attackBand(w.normal.shape, target.radius);
  if (d > maxR || !lineClear(z.map, p.ms.x, p.ms.y, target.x, target.y, 0.1)) {
    return { ...steer(z, p, a, target.x, target.y), ax, ay, b: 0 };
  }
  if (d < minR) { a.path = []; return { mx: -ax / (d || 1), my: -ay / (d || 1), ax, ay, b: 0 }; } // step back into the sweet spot
  a.path = [];
  let b: number = BTN.ATTACK;
  const ready = (id: string, cost: number) => (p.cooldowns.get(id) ?? 0) <= t && p.energy >= cost;
  const bits = [BTN.SKILL1, BTN.SKILL2, BTN.SKILL3];
  for (let i = 0; i < 3; i++) {
    const s = w.skills[i];
    if (!cfg.useSkills[i] || !s.damage) continue; // rotation only uses damaging skills
    if (ready(s.id, s.energyCost)) { b = bits[i]; break; }
  }
  if (b === BTN.ATTACK && cfg.useHeavy && ready(w.heavy.id, 0) && p.ms.stamina >= w.heavy.staminaCost + 30) b = BTN.HEAVY; // keep stamina for a dodge
  return { mx: 0, my: 0, ax, ay, b };
}
