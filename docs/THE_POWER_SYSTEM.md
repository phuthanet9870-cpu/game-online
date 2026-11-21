# THE_POWER_SYSTEM

สถานะ: **Designed** — รายชื่อความสามารถทั้ง 150 รายการและ schema พร้อมแล้ว **แต่ยังไม่มีสเปกตัวเลขรายสกิล** ตามข้อกำหนด 5.7 ห้ามนับว่าเสร็จจนกว่าจะมีครบ ตอนนี้เกมมีเพียงการดรอป `mat_power_fragment` (อัตรา 1% / elite 8%)

## กฎหลัก
- สะสมได้หลายผล แต่ติดตั้งได้ครั้งละ 1 ผล
- 1 ผล = Active 15 + Ultimate 5 + Passive 5 = 25 ความสามารถ (6 ผล = 150)
- Loadout: Active 5, Ultimate 1, Passive 3 และ Weapon Skills 3 (มาจากอาวุธ)
- ข้อจำกัดอาวุธ: Shadow of Abyss = Dagger เท่านั้น · Gravity Dominion = Sword/Staff/Gauntlet · ผลอื่นใช้ได้ทุกอาวุธ ถ้าเปลี่ยนอาวุธไม่ตรงเงื่อนไข พลังจะถูกปิดใช้งาน (ไม่ถูกลบ)
- ตายแล้วไม่เสียพลัง และไม่มีการสูญเสียพลังถาวรไม่ว่ากรณีใด
- Ultimate ทุกตัวต้องมี cooldown, energy, cast/เงื่อนไข, animation, counterplay และ PvP multiplier

## Schema
ใช้ `SkillDef` ใน `src/shared/config/skills.ts` (type `power_active|power_ultimate|power_passive`) ร่วมกับตารางที่จะสร้าง:
```
PowerDef { id, name, element, weaponRestriction: WeaponType[] | null, actives: SkillDef[15], ultimates: SkillDef[5], passives: PassiveDef[5],
           awakening: { I: {active:5, ult:1, passive:2}, II: {10,3,3}, III: {15,5,5} }, mechanic?: 'static_charge' | 'frost_stack' | ... }
power_collection(character_id, power_id, awakening, obtained_at)   power_mastery(character_id, power_id, xp, level, customizations)
skill_loadouts(character_id, power_id, slot, skill_id)
```

## 6 ผลแรก
| Power | ธาตุ/บทบาท | จุดเด่น | จุดอ่อน / Counterplay | อาวุธ |
|---|---|---|---|---|
| Shadow of Abyss | Dark / Assassin / Burst | ลอบโจมตี ความเร็ว แทงหลัง | HP ต่ำ แพ้สกิลตรวจจับและ AoE ต้องเข้าใกล้ | Dagger |
| Solar Inferno | Fire / AoE / Burn | AoE เคลียร์มอน สงครามพื้นที่ | Energy สูง ต้องจังหวะร่าย แพ้ Fire Resist | ทุกอาวุธ |
| Thunder Sovereign | Lightning / Speed / Combo | คอมโบเร็ว ระเบิดประจุ Static Charge | burst ต้องสะสมก่อน ถูกตัดคอมโบด้วย CC | ทุกอาวุธ |
| Eternal Frost | Ice / Control / Defense | Frost Stack → Freeze, กำแพง | ดาเมจต่ำ, **PvP มี DR ของ Freeze** | ทุกอาวุธ |
| Gravity Dominion | Gravity / Tank / Control | เปิดไฟต์ ดึงรวมกลุ่ม แทงก์ Guild War | คูลดาวน์สูง ระยะไกลจำกัด คล่องตัวต่ำ | Sword/Staff/Gauntlet |
| Genesis Bloom | Nature / Heal / Summon | ฮีล ซัพพอร์ต อัญเชิญ | burst ต่ำ ถูกลอบสังหาร ถูกลดฮีล | ทุกอาวุธ |

## รายชื่อความสามารถ (150)
**Shadow of Abyss** — Active: Shadow Dash, Dark Kunai, Smoke Veil, Silent Kill, Shadow Clone, Night Fang, Dark Trap, Abyss Pull, Phantom Walk, Shadow Swap, Dark Mark, Black Shuriken, Nightmare Strike, Shadow Bind, Vanish · Ultimate: Domain of Darkness, Thousand Shadow Cuts, Abyss Execution, Night Army, Shadow Monarch · Passive: Shadow Predator, Silent Assassin, Dark Recovery, Evasion Master, Night Hunter

**Solar Inferno** — Active: Fire Bullet, Flame Dash, Burning Ground, Fire Wall, Inferno Punch, Flame Spear, Heat Wave, Ember Rain, Fire Shield, Flame Tornado, Solar Mark, Explosive Flame, Phoenix Step, Lava Burst, Flame Chain · Ultimate: Miniature Sun, Phoenix Rebirth, Hellfire Domain, Solar Dragon, Inferno Awakening · Passive: Burning Soul, Flame Mastery, Heat Resistance, Chain Burn, Solar Energy

**Thunder Sovereign** — Active: Lightning Bolt, Thunder Step, Electric Chain, Volt Strike, Static Field, Thunder Kick, Flash Counter, Lightning Spear, Thunder Trap, Overcharge, Shock Pulse, Storm Arrow, Volt Armor, Electric Prison, Thunder Burst · Ultimate: Thunder God Form, Judgment Lightning, Storm Domain, One Million Volts, Lightning Clone Army · Passive: Lightning Reflex, Static Charge, Thunder Blood, Electric Critical, Storm Runner

**Eternal Frost** — Active: Ice Shard, Frost Nova, Ice Wall, Frozen Spear, Snow Dash, Crystal Shield, Ice Prison, Blizzard, Frozen Ground, Frost Blade, Ice Mirror, Crystal Spike, Cold Snap, Snowfall, Frozen Pulse · Ultimate: Absolute Zero, Ice Kingdom, Frost Titan, Eternal Blizzard, Crystal Awakening · Passive: Frost Mastery, Ice Armor, Frozen Heart, Cold Blood, Shatter

**Gravity Dominion** — Active: Gravity Pull, Gravity Push, Heavy Strike, Gravity Field, Floating Step, Crush Zone, Orbit Shield, Gravity Chain, Meteor Rock, Anti-Gravity, Pressure Wave, Gravity Prison, Ground Slam, Mass Shift, Singularity Seed · Ultimate: Black Hole, Meteor Judgment, Gravity Emperor, World Collapse, Zero Gravity Domain · Passive: Heavy Body, Gravity Core, Pressure Master, Unshakable, Mass Control

**Genesis Bloom** — Active: Vine Whip, Healing Bloom, Thorn Trap, Root Bind, Nature Shield, Poison Flower, Seed Explosion, Forest Dash, Life Drain, Healing Rain, Thorn Armor, Summon Wolf, Spore Cloud, Nature Pulse, Spirit Flower · Ultimate: World Tree, Forest Guardian, Genesis Awakening, Thousand Thorn Forest, Life Miracle · Passive: Nature Blessing, Regeneration, Poison Mastery, Guardian Bond, Life Energy

## การได้มา (PART 6)
| แหล่ง | สิ่งที่ได้ | อัตราตั้งต้น (config) |
|---|---|---|
| Normal | Power Fragment | 0.5–2% (ตอนนี้ใช้ 1%) **ทำงานแล้ว** |
| Elite | Fragments | 5–12% (ตอนนี้ใช้ 8%) **ทำงานแล้ว** |
| Map Boss | Complete Power Core | 0.1–0.5% |
| World Boss | Complete Power + Awakening Mats | 0.5–2% |
Pity: ทุกครั้งที่ฆ่า Map/World Boss แล้วไม่ได้ Core ให้นับ +1 เมื่อครบเกณฑ์จะการันตี และแลก Fragment → Power ได้ที่ NPC (อัตราอยู่ใน config) **ยังไม่ทำ**

## Awakening (PART 7)
I: A5/U1/P2 · II: A10/U3/P3 · III: A15/U5/P5 · Mastery: customization, visual evolution, combo variants (horizontal progression) ใช้วัตถุดิบจากบอส/ดันเจี้ยน และบันทึก Power Mastery ถาวร
