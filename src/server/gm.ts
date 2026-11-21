/**
 * Game Master commands. Executed only on the server, only for sessions that
 * unlocked GM with the server-configured passphrase. Every command (and every
 * failed unlock attempt) is written to the audit log.
 */
import { ITEMS, RARITIES, getItem, type Rarity } from '../shared/config/items.ts';
import { MONSTERS, getMonster } from '../shared/config/monsters.ts';
import { ZONES, getZone } from '../shared/config/zones.ts';
import { WEAPON_TYPES, getWeapon, type WeaponType } from '../shared/config/weapons.ts';
import { PROGRESSION } from '../shared/config/progression.ts';
import { isBlocked } from '../shared/mapgen.ts';
import { ANIM } from '../shared/protocol.ts';
import type { PlayerEntity } from './entities.ts';
import type { GameServer } from './GameServer.ts';
import { createItem } from './inventory.ts';
import { killMonster, killPlayer } from './combat.ts';
import { recomputeStats } from './playerStats.ts';
import { ALL_POWER_IDS, grantPower } from './powers.ts';
import { bossStatus, setBossNext } from './bosses.ts';
import { getPower } from '../shared/config/powers.ts';

export interface GmFlags { god: boolean; invis: boolean; nocd: boolean; speed: number }
export const defaultGmFlags = (): GmFlags => ({ god: false, invis: false, nocd: false, speed: 1 });

export const GM_HELP = [
  '/gm help — รายการคำสั่ง',
  '/gm status — สถานะเซิร์ฟเวอร์',
  '/gm players — ผู้เล่นออนไลน์',
  '/gm god | invis | nocd — สลับ อมตะ / ล่องหน / ไม่มีคูลดาวน์และไม่ใช้พลังงาน',
  '/gm speed <0.5-5> — ตัวคูณความเร็ว',
  '/gm tp <x> <y> [zone] — วาร์ป (zones: ' + Object.keys(ZONES).join(', ') + ')',
  '/gm goto <ชื่อ> | /gm summon <ชื่อ> — ไปหา / ดึงผู้เล่นมา',
  '/gm item <itemId> [qty] [rarity] [ชื่อ] — เสกไอเทม',
  '/gm itemall <category|all> [qty] [rarity|-] [ชื่อ] — เสกทุกไอเทมในหมวด (weapon armor helmet gloves boots accessory consumable material rune)',
  '/gm gold <amount> [ชื่อ] — เสก/หักทอง (ติดลบได้)',
  '/gm level <1-100> [ชื่อ] | /gm exp <n> [ชื่อ] | /gm mastery <weapon> <lv> [ชื่อ]',
  '/gm heal [ชื่อ] | /gm revive [ชื่อ] | /gm kill <ชื่อ>',
  '/gm weapon <sword|staff> — สวมอาวุธทันที (ข้ามกฎ Safe Zone)',
  '/gm spawn <monsterId> [count] | /gm killmobs [radius] | /gm clearmobs [radius] | /gm respawn',
  '/gm rates [exp drop gold] — ตัวคูณ event ทั้งเซิร์ฟ เช่น /gm rates 2 1.5 1',
  '/gm kick <ชื่อ> | /gm mute <ชื่อ> <นาที> | /gm ban <ชื่อ> <ชั่วโมง> | /gm unban <username>',
  '/gm power <id|all> [awakening 1-3] [ชื่อ] — ให้ The Power (shadow solar thunder frost gravity genesis)',
  '/gm setpower <id> — เปลี่ยนพลังที่ใช้ทันที (ข้ามพิธี) · /gm mastery_power <lv>',
  '/gm boss [spawn|next <นาที>] — Map Boss ของแมพนี้ (spawn = เกิดทันที)',
  '/gm announce <ข้อความ>',
  '/gm items [ค้นหา] | /gm monsters — รายการ id',
  '/gm off — ปิดสิทธิ์ GM ของเซสชันนี้',
];

const num = (s: string | undefined, def: number) => (s === undefined || s === '' || !Number.isFinite(Number(s)) ? def : Number(s));

export async function runGm(srv: GameServer, gm: PlayerEntity, line: string): Promise<string[]> {
  const parts = line.trim().split(/\s+/);
  const cmd = (parts[0] ?? 'help').toLowerCase();
  const a = parts.slice(1);
  const z = srv.zoneOf(gm);
  const who = (name: string | undefined): PlayerEntity | string => {
    if (!name) return gm;
    const p = srv.findPlayer(name);
    return p ?? `ไม่พบผู้เล่น "${name}" ที่ออนไลน์`;
  };
  const target = (i: number) => who(a[i]);
  const flagChanged = () => { srv.sendGmState(gm); recomputeStats(gm); srv.sendChar(gm); };

  switch (cmd) {
    case 'help': return GM_HELP;
    case 'off': srv.setGm(gm, false); return ['ปิดสิทธิ์ GM แล้ว'];
    case 'status': {
      const s = srv.stats;
      const lines = [`เซิร์ฟเวอร์ ${srv.name} (${srv.mode}) · เวลาเกม ${srv.time.toFixed(0)}s · tick ${s.ticks} · tick ล่าสุด ${s.lastTickMs.toFixed(2)}ms (สูงสุด ${s.maxTickMs.toFixed(2)}ms)`,
        `ออนไลน์ ${srv.onlineCount()} คน · rates EXP×${srv.rates.exp} Drop×${srv.rates.drop} Gold×${srv.rates.gold}`];
      for (const zone of srv.zones.values()) {
        const alive = [...zone.monsters.values()].filter((m) => m.state !== 'dead').length;
        lines.push(`  ${zone.def.id}: ผู้เล่น ${zone.players.size}, มอนสเตอร์ ${alive}/${zone.monsters.size}, ดรอป ${zone.drops.size}, กระสุน ${zone.projectiles.length}`);
      }
      return lines;
    }
    case 'players':
      return [...srv.allPlayers()].map((p) => `${p.rec.name} Lv.${p.rec.level} @ ${p.rec.zoneId} (${p.ms.x.toFixed(1)}, ${p.ms.y.toFixed(1)})${p.session ? '' : ' [หลุด]'}${p.gm ? ' [GM]' : ''}`);
    case 'god': gm.gmFlags.god = !gm.gmFlags.god; flagChanged(); return [`God mode: ${gm.gmFlags.god ? 'ON' : 'OFF'}`];
    case 'invis': gm.gmFlags.invis = !gm.gmFlags.invis; flagChanged(); if (z) for (const p of z.players.values()) if (p !== gm) p.known.delete(gm.id); return [`ล่องหน: ${gm.gmFlags.invis ? 'ON' : 'OFF'}`];
    case 'nocd': gm.gmFlags.nocd = !gm.gmFlags.nocd; gm.cooldowns.clear(); flagChanged(); return [`ไม่มีคูลดาวน์/ไม่ใช้พลังงาน: ${gm.gmFlags.nocd ? 'ON' : 'OFF'}`];
    case 'speed': {
      const v = Math.max(0.5, Math.min(5, num(a[0], 1)));
      gm.gmFlags.speed = v; flagChanged();
      return [`ความเร็ว ×${v}`];
    }
    case 'tp': {
      const zoneId = a[2] ?? gm.rec.zoneId;
      const zone = srv.zones.get(zoneId);
      if (!zone) return [`ไม่รู้จักโซน ${zoneId}`];
      const x = num(a[0], zone.def.spawnPoint.x), y = num(a[1], zone.def.spawnPoint.y);
      if (x < 0 || y < 0 || x >= zone.map.w || y >= zone.map.h || isBlocked(zone.map, x, y)) return ['ตำแหน่งนั้นอยู่นอกแผนที่หรือติดสิ่งกีดขวาง'];
      srv.transfer(gm, zoneId, x, y);
      return [`วาร์ปไป ${zoneId} (${x}, ${y})`];
    }
    case 'goto': {
      const t = target(0);
      if (typeof t === 'string') return [t];
      srv.transfer(gm, t.rec.zoneId, t.ms.x, t.ms.y);
      return [`ไปหา ${t.rec.name}`];
    }
    case 'summon': {
      const t = target(0);
      if (typeof t === 'string') return [t];
      srv.transfer(t, gm.rec.zoneId, gm.ms.x, gm.ms.y);
      t.session?.send({ t: 'notice', kind: 'warn', text: 'คุณถูก GM เรียกตัว' });
      return [`ดึง ${t.rec.name} มาแล้ว`];
    }
    case 'item': {
      const def = getItem(a[0] ?? '');
      if (!def) return [`ไม่พบไอเทม "${a[0]}" (ดู /gm items)`];
      const qty = Math.max(1, Math.min(9999, Math.floor(num(a[1], 1))));
      const rarity = (a[2] && (RARITIES as readonly string[]).includes(a[2]) ? a[2] : def.rarity) as Rarity;
      const t = who(a[3]);
      if (typeof t === 'string') return [t];
      let left = qty, given = 0;
      while (left > 0) {
        const n = Math.min(left, def.stackMax);
        if (!t.inv.addInstance(createItem(def.id, n, { rarity, ilvl: Math.max(def.levelReq, t.rec.level), bound: false }))) break;
        left -= n; given += n;
      }
      t.invDirty = true; t.dirty = true;
      srv.requestSave(t, 'gm_item');
      return [`ให้ ${def.nameTh} ×${given} (${rarity}) แก่ ${t.rec.name}${left ? ` — กระเป๋าเต็ม ขาด ${left}` : ''}`];
    }
    case 'itemall': {
      const cat = (a[0] ?? '').toLowerCase();
      const defs = Object.values(ITEMS).filter((i) => cat === 'all' || i.category === cat);
      if (!defs.length) return ['หมวด: all, ' + [...new Set(Object.values(ITEMS).map((i) => i.category))].join(', ')];
      const qty = Math.max(1, Math.min(999, Math.floor(num(a[1], 1))));
      const rar = a[2] && a[2] !== '-' && (RARITIES as readonly string[]).includes(a[2]) ? (a[2] as Rarity) : null;
      const t = who(a[3]);
      if (typeof t === 'string') return [t];
      let ok = 0;
      const missed: string[] = [];
      for (const def of defs) {
        let left = qty;
        while (left > 0) {
          const n = Math.min(left, def.stackMax);
          if (!t.inv.addInstance(createItem(def.id, n, { rarity: rar ?? def.rarity, ilvl: Math.max(def.levelReq, t.rec.level), bound: false }))) break;
          left -= n;
        }
        if (left === 0) ok++; else missed.push(def.nameTh);
      }
      t.invDirty = true; t.dirty = true;
      srv.requestSave(t, 'gm_itemall');
      return [`เสกหมวด ${cat}: ${ok}/${defs.length} ชนิด ×${qty} ให้ ${t.rec.name}`, ...(missed.length ? [`กระเป๋าเต็ม — ไม่ได้: ${missed.join(', ')}`] : [])];
    }
    case 'power': {
      const ids = a[0] === 'all' ? ALL_POWER_IDS : [a[0] ?? ''];
      const aw = Math.max(1, Math.min(3, Math.floor(num(a[1], 1))));
      const t = who(a[2]);
      if (typeof t === 'string') return [t];
      const out: string[] = [];
      for (const id of ids) {
        const own = t.rec.powers.owned.find((o) => o.id === id);
        if (own) { own.awakening = Math.max(own.awakening, aw); out.push(`${id}: ตั้ง Awakening ${own.awakening}`); continue; }
        const r = grantPower(t, id, aw);
        out.push(r.msg);
      }
      srv.afterPowerChange(t);
      srv.requestSave(t, 'gm_power');
      return out;
    }
    case 'setpower': {
      const def = getPower(a[0]);
      if (!def || !gm.rec.powers.owned.some((o) => o.id === def.id)) return ['ต้องเป็นพลังที่มีอยู่ (ใช้ /gm power ก่อน)'];
      gm.rec.powers.active = def.id;
      srv.afterPowerChange(gm);
      return [`ใช้พลัง ${def.nameTh}${gm.power ? '' : ' (อาวุธปัจจุบันใช้พลังนี้ไม่ได้)'}`];
    }
    case 'mastery_power': {
      const own = gm.rec.powers.owned.find((o) => o.id === gm.rec.powers.active);
      if (!own) return ['ยังไม่มีพลังที่ใช้อยู่'];
      own.masteryLevel = Math.max(0, Math.min(20, Math.floor(num(a[0], 0)))); own.masteryXp = 0;
      srv.afterPowerChange(gm);
      return [`Power Mastery → ${own.masteryLevel}`];
    }
    case 'boss': {
      if (!z || !z.bosses.length) return ['แมพนี้ไม่มี Map Boss'];
      if (a[0] === 'spawn') { for (const b of z.bosses) if (!b.alive) setBossNext(z, b.key, z.time); return ['Map Boss จะเกิดใน tick ถัดไป']; }
      if (a[0] === 'next') { const min = Math.max(0, num(a[1], 1)); for (const b of z.bosses) setBossNext(z, b.key, z.time + min * 60); return [`ตั้งเวลาเกิดอีก ${min} นาที`]; }
      return bossStatus(z).map((b, i) => { const m = z.bosses[i].alive; return `${b.name}: ${b.status}${m ? ` HP ${b.hp}%${b.mutated ? ' (กลายพันธุ์)' : ''} @ ${b.hint} (${m.x.toFixed(0)}, ${m.y.toFixed(0)})` : ` · เกิดอีก ~${Math.max(0, Math.round((z.bosses[i].nextSpawnAt - z.time) / 60))} นาที`} · หน้าต่างเกิด ${b.window}`; });
    }
    case 'gold': {
      const amt = Math.trunc(num(a[0], 0));
      const t = who(a[1]);
      if (typeof t === 'string') return [t];
      t.rec.gold = Math.max(0, Math.min(2_000_000_000, t.rec.gold + amt));
      t.invDirty = true; t.charDirty = true; t.dirty = true;
      srv.requestSave(t, 'gm_gold');
      return [`${t.rec.name}: ทอง ${amt >= 0 ? '+' : ''}${amt} → ${t.rec.gold}`];
    }
    case 'level': {
      const lv = Math.max(1, Math.min(PROGRESSION.maxLevel, Math.floor(num(a[0], gm.rec.level))));
      const t = who(a[1]);
      if (typeof t === 'string') return [t];
      t.rec.level = lv; t.rec.exp = 0;
      recomputeStats(t); t.hp = t.stats.hp; t.energy = t.stats.energy;
      t.charDirty = true; t.dirty = true;
      srv.zoneOf(t)?.invalidateMeta(t.id);
      srv.requestSave(t, 'gm_level');
      return [`${t.rec.name} → Lv.${lv}`];
    }
    case 'exp': {
      const t = who(a[1]);
      if (typeof t === 'string') return [t];
      const before = t.rec.level;
      srv.grantExpTo(t, Math.max(0, num(a[0], 0)));
      return [`${t.rec.name} +${a[0]} EXP (Lv.${before} → Lv.${t.rec.level})`];
    }
    case 'mastery': {
      const w = a[0] as WeaponType;
      if (!(WEAPON_TYPES as readonly string[]).includes(w)) return ['weapon: ' + WEAPON_TYPES.join(', ')];
      const lv = Math.max(0, Math.min(PROGRESSION.weaponMastery.maxLevel, Math.floor(num(a[1], 0))));
      const t = who(a[2]);
      if (typeof t === 'string') return [t];
      t.rec.mastery[w] = { level: lv, xp: 0 };
      t.charDirty = true; t.dirty = true;
      return [`${t.rec.name}: Mastery ${w} → ${lv}`];
    }
    case 'heal': {
      const t = target(0);
      if (typeof t === 'string') return [t];
      t.hp = t.stats.hp; t.energy = t.stats.energy; t.ms.stamina = t.stats.stamina; t.potCdUntil = 0;
      return [`ฟื้นฟู ${t.rec.name}`];
    }
    case 'revive': {
      const t = target(0);
      if (typeof t === 'string') return [t];
      if (!t.dead) return [`${t.rec.name} ยังไม่ตาย`];
      t.dead = false; t.hp = t.stats.hp; t.energy = t.stats.energy; t.anim = ANIM.IDLE;
      t.charDirty = true;
      return [`ชุบชีวิต ${t.rec.name} ณ จุดเดิม`];
    }
    case 'kill': {
      const t = who(a[0]);
      if (typeof t === 'string') return [t];
      if (t === gm && !a[0]) return ['ระบุชื่อผู้เล่น'];
      const tz = srv.zoneOf(t);
      if (tz) killPlayer(tz, t);
      return [`สังหาร ${t.rec.name}`];
    }
    case 'weapon': {
      const w = getWeapon(a[0]);
      if (!w) return ['อาวุธที่ใช้ได้: ' + WEAPON_TYPES.join(', ')];
      let it = gm.inv.bagItems().find((i) => getItem(i.defId)?.weaponType === w.type);
      if (!it) {
        const inst = createItem(w.starterItem, 1, { bound: false });
        if (!gm.inv.addInstance(inst)) return ['กระเป๋าเต็ม'];
        it = inst;
      }
      const r = gm.inv.equip(it.uid, 999);
      if (!r.ok) return [r.code];
      recomputeStats(gm);
      srv.zoneOf(gm)?.invalidateMeta(gm.id);
      gm.invDirty = true; gm.charDirty = true; gm.dirty = true;
      return [`สวม ${getItem(it.defId)?.nameTh}`];
    }
    case 'spawn': {
      if (!z) return ['ไม่ได้อยู่ในโซน'];
      const def = getMonster(a[0] ?? '');
      if (!def) return [`ไม่พบมอนสเตอร์ "${a[0]}" (ดู /gm monsters)`];
      const count = Math.max(1, Math.min(30, Math.floor(num(a[1], 1))));
      const group = { id: `gm_${Date.now()}`, monsterId: def.id, x: gm.ms.x + gm.facingX * 3, y: gm.ms.y + gm.facingY * 3, radius: 2, baseCount: 0, perPlayer: 0, maxCount: 0 };
      // GM spawns are one-off: maxCount 0 means maintainSpawns removes them once dead
      let n = 0;
      for (let i = 0; i < count; i++) { if (z.spawnMonster(group)) n++; }
      return [`เสก ${def.name} ×${n} ใน ${z.def.id}`];
    }
    case 'killmobs':
    case 'clearmobs': {
      if (!z) return ['ไม่ได้อยู่ในโซน'];
      const r = num(a[0], 15);
      let n = 0;
      for (const m of [...z.monsters.values()]) {
        if (m.state === 'dead' || (m.x - gm.ms.x) ** 2 + (m.y - gm.ms.y) ** 2 > r * r) continue;
        if (cmd === 'killmobs') { m.threat.set(gm.id, m.hp); killMonster(z, m); } else { m.state = 'dead'; m.hp = 0; m.respawnAt = srv.time + m.def.respawnSec; }
        n++;
      }
      return [`${cmd === 'killmobs' ? 'สังหาร (ได้ EXP/ดรอป)' : 'ลบ (ไม่มีดรอป)'} ${n} ตัว ในรัศมี ${r}`];
    }
    case 'respawn': {
      if (!z) return ['ไม่ได้อยู่ในโซน'];
      let n = 0;
      for (const m of z.monsters.values()) if (m.state === 'dead') { z.respawnMonster(m); n++; }
      for (const node of z.nodes.values()) node.readyAt = 0;
      return [`รีสปอว์น ${n} ตัว และฟื้นจุดทรัพยากรทั้งหมดใน ${z.def.id}`];
    }
    case 'rates': {
      if (a.length === 0) return [`EXP×${srv.rates.exp} Drop×${srv.rates.drop} Gold×${srv.rates.gold}`];
      const clampR = (v: number) => Math.max(0, Math.min(20, v));
      srv.rates = { exp: clampR(num(a[0], srv.rates.exp)), drop: clampR(num(a[1], srv.rates.drop)), gold: clampR(num(a[2], srv.rates.gold)) };
      srv.broadcast(`📢 Event Rates: EXP×${srv.rates.exp} Drop×${srv.rates.drop} Gold×${srv.rates.gold}`);
      for (const p of srv.allPlayers()) if (p.gm) srv.sendGmState(p);
      return ['ตั้งค่า rates แล้ว'];
    }
    case 'kick': {
      const t = who(a[0]);
      if (typeof t === 'string') return [t];
      if (t === gm) return ['ระบุชื่อผู้เล่น'];
      srv.kickChar(t, 'ถูกเตะออกโดย GM');
      return [`เตะ ${t.rec.name}`];
    }
    case 'mute': {
      const t = who(a[0]);
      if (typeof t === 'string') return [t];
      const min = Math.max(0, num(a[1], 10));
      srv.muteChar(t, min * 60);
      return [`มิวต์ ${t.rec.name} ${min} นาที`];
    }
    case 'ban': {
      const t = who(a[0]);
      if (typeof t === 'string') return [t];
      if (t === gm) return ['ระบุชื่อผู้เล่น'];
      const hours = Math.max(0.01, num(a[1], 24));
      await srv.banAccount(t.rec.accountId, srv.now() + hours * 3600_000);
      srv.kickChar(t, `บัญชีถูกแบน ${hours} ชั่วโมง`);
      return [`แบน ${t.rec.name} ${hours} ชั่วโมง`];
    }
    case 'unban': {
      const ok = await srv.unbanUsername((a[0] ?? '').toLowerCase());
      return [ok ? `ปลดแบน ${a[0]}` : `ไม่พบบัญชี ${a[0]}`];
    }
    case 'announce': {
      const text = a.join(' ').slice(0, 200);
      if (!text) return ['ใส่ข้อความ'];
      srv.broadcast(`📢 [GM] ${text}`);
      return [];
    }
    case 'items': {
      const q = (a[0] ?? '').toLowerCase();
      return Object.values(ITEMS).filter((i) => !q || i.id.includes(q) || i.name.toLowerCase().includes(q)).map((i) => `${i.id} — ${i.nameTh} (${i.category})`);
    }
    case 'monsters':
      return Object.values(MONSTERS).map((m) => `${m.id} — ${m.nameTh} Lv.${m.levelMin}-${m.levelMax} (${m.tier})`);
    case 'zones':
      return Object.values(ZONES).map((zz) => `${zz.id} — ${zz.name} ${zz.width}x${zz.height}`);
    default:
      return [`ไม่รู้จักคำสั่ง "${cmd}" — พิมพ์ /gm help`, getZone(cmd) ? '' : ''].filter(Boolean);
  }
}
