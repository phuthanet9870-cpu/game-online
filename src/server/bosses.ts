/**
 * Map Boss runtime (PART 15): server-scheduled random spawn windows with
 * multiple spawn points, spawn hints, phases, mutation, leash/empty resets,
 * contribution-based eligibility and personal loot with a pity counter.
 * Clients never decide or modify spawn times.
 */
import type { BossScheduleDef } from '../shared/config/zones.ts';
import { getItem } from '../shared/config/items.ts';
import { getMonster, monsterStatsAt } from '../shared/config/monsters.ts';
import { levelDiffMult } from '../shared/config/progression.ts';
import type { MonsterEntity, PlayerEntity } from './entities.ts';
import type { Zone } from './zone.ts';
import { rollLoot } from './loot.ts';
import { createItem } from './inventory.ts';
import { grantExp } from './progression.ts';
import { recomputeStats } from './playerStats.ts';

export const BOSS_CONFIG = {
  hintBeforeSec: 300,
  /** Boss resets if no player is within this range for resetAfterSec. */
  resetRange: 25,
  resetAfterSec: 60,
  /** Minimum share of total contribution to be eligible for rewards. */
  minContribution: 0.02,
  tankWeight: 0.6,
  healWeight: 0.8,
  mutated: { hpMult: 1.5, atkMult: 1.25, lootMult: 1.5 },
  /** Kills without a Power Core before one is guaranteed. */
  corePity: 40,
  dropOwnerSec: 90,
};

export interface BossState {
  key: string; // zone:monster
  mutated: boolean;
  phase: number;
  baseAtk: number;
  speedMult: number;
  cdMult: number;
  tanked: Map<number, number>;
  healed: Map<number, number>;
  emptySince: number | null;
  spawnX: number; spawnY: number;
}

export interface BossRuntime {
  key: string;
  def: BossScheduleDef;
  nextSpawnAt: number;
  alive: MonsterEntity | null;
  hinted: boolean;
  hint: string;
}

function windowSec(def: BossScheduleDef, rng: () => number) {
  return (def.minMinutes + rng() * (def.maxMinutes - def.minMinutes)) * 60;
}

export function initBosses(z: Zone): BossRuntime[] {
  return (z.def.bosses ?? []).map((def) => ({
    key: `${z.def.id}:${def.monsterId}`, def, nextSpawnAt: z.time + windowSec(def, () => z.rng()), alive: null, hinted: false, hint: '',
  }));
}

/** Server-only: override the next spawn (persistence restore, GM). */
export function setBossNext(z: Zone, key: string, serverTime: number) {
  const b = z.bosses.find((x) => x.key === key);
  if (b && !b.alive) { b.nextSpawnAt = serverTime; b.hinted = false; }
}

function schedule(z: Zone, b: BossRuntime) {
  b.nextSpawnAt = z.time + windowSec(b.def, () => z.rng());
  b.hinted = false;
  z.host.saveBossNext(b.key, z.host.now() + (b.nextSpawnAt - z.time) * 1000);
}

function spawnBoss(z: Zone, b: BossRuntime) {
  const def = getMonster(b.def.monsterId);
  if (!def) return;
  const pt = b.def.spawnPoints[Math.floor(z.rng() * b.def.spawnPoints.length)];
  const m = z.spawnMonster({ id: `boss_${b.key}`, monsterId: def.id, x: pt.x, y: pt.y, radius: 0, baseCount: 0, perPlayer: 0, maxCount: 0 });
  if (!m) return;
  const mutated = z.rng() < b.def.mutatedChance;
  m.x = pt.x; m.y = pt.y; m.homeX = pt.x; m.homeY = pt.y;
  if (mutated) { m.maxHp = Math.round(m.maxHp * 1.5); m.hp = m.maxHp; m.atk *= 1.25; }
  m.boss = { key: b.key, mutated, phase: 0, baseAtk: m.atk, speedMult: 1, cdMult: 1, tanked: new Map(), healed: new Map(), emptySince: null, spawnX: pt.x, spawnY: pt.y };
  m.respawnAt = Number.MAX_SAFE_INTEGER;
  b.alive = m;
  b.hint = pt.hint;
  z.host.zoneChat(z.def.id, `⚔ ${mutated ? '[กลายพันธุ์] ' : ''}${def.nameTh} ปรากฏตัวที่${pt.hint}!`);
  z.host.audit(null, 'boss_spawn', { boss: b.key, mutated, x: pt.x, y: pt.y });
}

function resetBoss(z: Zone, m: MonsterEntity) {
  const bs = m.boss!;
  const s = monsterStatsAt(m.def, m.level);
  m.maxHp = Math.round(s.maxHp * (bs.mutated ? BOSS_CONFIG.mutated.hpMult : 1));
  m.hp = m.maxHp;
  bs.phase = 0; bs.speedMult = 1; bs.cdMult = 1; m.atk = bs.baseAtk;
  bs.tanked.clear(); bs.healed.clear(); m.threat.clear(); m.dots = [];
  m.x = bs.spawnX; m.y = bs.spawnY; m.homeX = bs.spawnX; m.homeY = bs.spawnY;
  m.state = 'idle'; m.targetId = null; m.windup = null;
}

export function tickBosses(z: Zone) {
  const t = z.time;
  for (const b of z.bosses) {
    const m = b.alive;
    if (!m) {
      if (!b.hinted && t >= b.nextSpawnAt - BOSS_CONFIG.hintBeforeSec) {
        b.hinted = true;
        const def = getMonster(b.def.monsterId);
        z.host.zoneChat(z.def.id, `🌫 พื้นดินเริ่มสั่นไหว... ${def?.nameTh ?? 'บอส'} อาจปรากฏภายในไม่กี่นาที`);
      }
      if (t >= b.nextSpawnAt) spawnBoss(z, b);
      continue;
    }
    if (m.state === 'dead') continue;
    const bs = m.boss!;
    // phases
    const phases = m.def.phases ?? [];
    while (bs.phase < phases.length && m.hp / m.maxHp < phases[bs.phase].hpBelow) {
      const ph = phases[bs.phase];
      bs.phase++;
      m.atk = bs.baseAtk * ph.atkMult;
      bs.speedMult = ph.speedMult;
      bs.cdMult = ph.cooldownMult;
      z.host.zoneChat(z.def.id, `⚠ ${m.def.nameTh} เข้าสู่ช่วง "${ph.name}"!`);
      z.emit({ e: 'counter', id: m.id }, m.x, m.y);
      if (ph.summon) {
        for (let i = 0; i < ph.summon.count; i++) {
          const add = z.spawnMonster({ id: `bossadd_${m.id}`, monsterId: ph.summon.monsterId, x: m.x, y: m.y, radius: 3, baseCount: 0, perPlayer: 0, maxCount: 0 });
          if (add) { add.respawnAt = Number.MAX_SAFE_INTEGER; add.state = 'chase'; add.targetId = m.targetId; add.homeX = m.x; add.homeY = m.y; }
        }
      }
    }
    // reset when abandoned
    let near = false;
    for (const p of z.players.values()) if (!p.dead && (p.ms.x - m.x) ** 2 + (p.ms.y - m.y) ** 2 <= BOSS_CONFIG.resetRange ** 2) { near = true; break; }
    if (near) bs.emptySince = null;
    else if (bs.emptySince === null) bs.emptySince = t;
    else if (t - bs.emptySince >= BOSS_CONFIG.resetAfterSec && (m.hp < m.maxHp || bs.phase > 0)) { resetBoss(z, m); bs.emptySince = null; }
  }
}

/** Leash return completed: restore phase multipliers too. */
export function bossReturnedHome(m: MonsterEntity) {
  if (!m.boss) return;
  m.boss.phase = 0; m.boss.speedMult = 1; m.boss.cdMult = 1; m.atk = m.boss.baseAtk;
  m.boss.tanked.clear(); m.boss.healed.clear();
}

/** Record healing done near living bosses (healing contribution). */
export function recordHeal(z: Zone, healer: PlayerEntity, amount: number) {
  for (const b of z.bosses) {
    const m = b.alive;
    if (!m || m.state === 'dead' || !m.boss) continue;
    if ((healer.ms.x - m.x) ** 2 + (healer.ms.y - m.y) ** 2 > BOSS_CONFIG.resetRange ** 2) continue;
    m.boss.healed.set(healer.id, (m.boss.healed.get(healer.id) ?? 0) + amount);
  }
}

/** Rewards for a boss kill. Returns the eligible players. */
export function bossKilled(z: Zone, m: MonsterEntity): PlayerEntity[] {
  const bs = m.boss!;
  const b = z.bosses.find((x) => x.key === bs.key);
  if (b) { b.alive = null; schedule(z, b); }
  const score = new Map<number, number>();
  const add = (id: number, v: number) => score.set(id, (score.get(id) ?? 0) + v);
  for (const [id, v] of m.threat) add(id, v);
  for (const [id, v] of bs.tanked) add(id, v * BOSS_CONFIG.tankWeight);
  for (const [id, v] of bs.healed) add(id, v * BOSS_CONFIG.healWeight);
  const total = [...score.values()].reduce((a, c) => a + c, 0);
  const eligible: PlayerEntity[] = [];
  for (const [id, v] of score) {
    const p = z.players.get(id);
    if (!p || total <= 0 || v / total < BOSS_CONFIG.minContribution) continue;
    eligible.push(p);
  }
  const lootMult = (bs.mutated ? BOSS_CONFIG.mutated.lootMult : 1) * z.host.rates.drop;
  for (const p of eligible) {
    // EXP: full boss EXP for every eligible participant (level-difference scaled)
    const before = p.rec.level;
    grantExp(p.rec, m.exp * levelDiffMult(p.rec.level, m.level) * z.host.rates.exp);
    if (p.rec.level !== before) { recomputeStats(p); p.hp = p.stats.hp; z.emit({ e: 'lvl', id: p.id, lvl: p.rec.level }, p.ms.x, p.ms.y); z.invalidateMeta(p.id); }
    p.charDirty = true; p.dirty = true;
    // personal loot (only this player can pick it up during the owner window)
    const loot = rollLoot(m.def, m.level, () => z.rng(), lootMult, z.host.rates.gold * (bs.mutated ? BOSS_CONFIG.mutated.lootMult : 1));
    const ps = p.rec.powers;
    const gotCore = loot.items.some((i) => i.defId === 'power_core');
    if (gotCore) ps.corePity = 0;
    else {
      ps.corePity = (ps.corePity ?? 0) + 1;
      if (ps.corePity >= BOSS_CONFIG.corePity) { loot.items.push(createItem('power_core', 1, { bound: false })); ps.corePity = 0; }
    }
    for (const it of loot.items) z.createDrop(m.x, m.y, it, 0, p.rec.id, BOSS_CONFIG.dropOwnerSec);
    if (loot.gold > 0) z.createDrop(m.x, m.y, null, loot.gold, p.rec.id, BOSS_CONFIG.dropOwnerSec);
    z.host.audit(p, 'boss_reward', { boss: bs.key, mutated: bs.mutated, items: loot.items.map((i) => [i.defId, i.qty, i.rarity]), gold: loot.gold, pity: ps.corePity });
    p.session?.send({ t: 'notice', kind: 'level', text: `ปราบ ${m.def.nameTh} สำเร็จ! รับรางวัลส่วนตัว ${loot.items.length} ชิ้น${loot.items.some((i) => getItem(i.defId)?.id === 'power_core') ? ' (รวมแกนพลัง!)' : ''}` });
  }
  z.host.zoneChat(z.def.id, `🏆 ${m.def.nameTh} ถูกปราบแล้ว (ผู้มีส่วนร่วม ${eligible.length} คน)`);
  return eligible;
}

export function bossStatus(z: Zone) {
  return z.bosses.map((b) => {
    const def = getMonster(b.def.monsterId);
    const m = b.alive;
    const soon = !m && z.time >= b.nextSpawnAt - BOSS_CONFIG.hintBeforeSec;
    return {
      id: b.def.monsterId, name: def?.nameTh ?? b.def.monsterId, status: m ? 'alive' as const : soon ? 'soon' as const : 'waiting' as const,
      hint: m ? b.hint : '', mutated: !!m?.boss?.mutated, hp: m ? Math.ceil((m.hp / m.maxHp) * 100) : 0,
      window: `${b.def.minMinutes}-${b.def.maxMinutes} นาที`,
    };
  });
}
