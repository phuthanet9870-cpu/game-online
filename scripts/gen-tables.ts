// Prints markdown tables generated from the live config (used to keep docs in sync).
import { MONSTERS, monsterStatsAt } from '../src/shared/config/monsters.ts';
import { ITEMS } from '../src/shared/config/items.ts';
import { WEAPONS } from '../src/shared/config/weapons.ts';
const which = process.argv[2];
if (which === 'monsters') {
  console.log('| ID | ชื่อ | Tier | Lv | HP (min lv) | ATK | DEF | Type/Element | Aggro | Leash | Speed | Attacks | EXP | Respawn | Loot |');
  console.log('|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|');
  for (const m of Object.values(MONSTERS)) {
    const s = monsterStatsAt(m, m.levelMin);
    const atk = m.attacks.map((a) => `${a.kind}(windup ${a.windup}s, cd ${a.cooldown}s, r ${a.range}${'radius' in a ? `, aoe ${a.radius}` : ''}, ×${a.mult})`).join('<br>');
    const loot = m.loot.map((l) => `${l.itemId} ${(l.chance * 100).toFixed(1)}%`).join('<br>');
    console.log(`| ${m.id} | ${m.nameTh} | ${m.tier} | ${m.levelMin}-${m.levelMax} | ${s.maxHp} | ${s.atk} | ${s.def} | ${m.damageType}/${m.element} | ${m.aggroRange}${m.behavior.passive ? ' (passive)' : ''} | ${m.leashRange} | ${m.moveSpeed} | ${atk} | ${s.exp} | ${m.respawnSec}s | ${loot}<br>gold ${m.gold[0]}-${m.gold[1]} |`);
  }
}
if (which === 'items') {
  console.log('| ID | ชื่อ | หมวด | Rarity | Lv | Stats | Stack | Bind | ขาย |');
  console.log('|---|---|---|---|---|---|---|---|---|');
  for (const i of Object.values(ITEMS)) console.log(`| ${i.id} | ${i.nameTh} | ${i.category} | ${i.rarity} | ${i.levelReq} | ${i.baseStats ? Object.entries(i.baseStats).map(([k, v]) => `${k} ${v}`).join(', ') : i.use ? JSON.stringify(i.use) : '-'} | ${i.stackMax} | ${i.bind} | ${i.sellPrice} |`);
}
if (which === 'skills') {
  for (const w of Object.values(WEAPONS)) {
    if (!w) continue;
    console.log(`\n#### ${w.name} (${w.nameTh})\n`);
    console.log('| Skill ID | ชื่อ | Type | Element | Unlock | Damage | Shape | CD | Energy | Stamina | Cast | Anim | Effects | PvP× | PvE× | VFX/SFX | Upgrade |');
    console.log('|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|');
    for (const s of [w.normal, w.heavy, ...w.skills]) {
      console.log(`| ${s.id} | ${s.nameTh} (${s.name}) | ${s.type} | ${s.element} | ${s.unlockLevel} | ${s.damage ? `${s.damage.mult}×${s.damage.stat}+${s.damage.flat}` : '-'} | ${JSON.stringify(s.shape).replace(/"/g, '').replace(/\|/g, '/')} | ${s.cooldown}s | ${s.energyCost} | ${s.staminaCost} | ${s.castTime}s | ${s.animTime}s | ${s.effects.map((e) => JSON.stringify(e).replace(/"/g, '')).join('<br>') || '-'} | ${s.pvpMult} | ${s.pveMult} | ${s.vfx}/${s.sfx} | +${s.upgradeScaling.damagePerLevel * 100}%/lv max ${s.upgradeScaling.maxLevel} |`);
    }
  }
}
