# THE_POWER_SYSTEM

สถานะ: **Tested** (`tests/powers.test.ts` — รวม smoke test ที่ร่ายครบทั้ง 120 active/ultimate ใส่มอนสเตอร์จริง และ e2e ในเบราว์เซอร์)
ข้อมูลอยู่ใน `src/shared/config/powers.ts` และ engine อยู่ใน `src/server/powers.ts` + `src/server/combat.ts`

ยังไม่ทำ: Mastery stage (customization/visual evolution/combo variants), pity counter ของการดรอปจากบอส (รอระบบบอส), PvP balance (DR ของ Freeze ฯลฯ รอ M7)

## กฎหลัก
- สะสมได้หลายผล แต่ติดตั้งได้ครั้งละ 1 ผล
- 1 ผล = Active 15 + Ultimate 5 + Passive 5 = 25 ความสามารถ (6 ผล = 150)
- Loadout: Active 5, Ultimate 1, Passive 3 และ Weapon Skills 3 (มาจากอาวุธ)
- ข้อจำกัดอาวุธ: Shadow of Abyss = Dagger เท่านั้น · Gravity Dominion = Sword/Staff/Gauntlet · ผลอื่นใช้ได้ทุกอาวุธ ถ้าเปลี่ยนอาวุธไม่ตรงเงื่อนไข พลังจะถูกปิดใช้งาน (ไม่ถูกลบ)
- ตายแล้วไม่เสียพลัง และไม่มีการสูญเสียพลังถาวรไม่ว่ากรณีใด
- Ultimate ทุกตัวต้องมี cooldown, energy, cast/เงื่อนไข, animation, counterplay และ PvP multiplier

## การควบคุม
Q E R T G = Active 5 ช่อง, X = Ultimate, P = หน้าต่าง The Power (คลิกปุ่มบน skill bar ได้)

## Engine (effect kinds)
dot (burn/poison), heal (ตัวเอง+พันธมิตรในรัศมี), buff (stats/statsPct ชั่วคราว), zone (พื้นที่ tick ดาเมจ/ฮีล, ติดตามผู้ใช้ได้), pull, frost (5 stack = Freeze 1.5s), charge/consume_charge (Static Charge สูงสุด 10), summon (โคจรรอบผู้ใช้และโจมตีมอนใกล้สุด), stealth (มอนสเตอร์เลิกไล่/หาไม่เจอ, หลุดเมื่อโจมตี), blink, vuln, pierce_def, execute, chain, cheat_death, lifesteal, reflect, cleanse, shatter + ของเดิม (stun/root/slow/knockback/dash/shield/counter/multi/spread/trap/buff_dr/backstab)
Passives: stats, statsPct, mods (lowHpBonus, healOnKill, dotBonus, elementBonus, energyRegenPct, chargeBonus, shatterBonus, ccBonus, regenPct, summonBonus), onHit procs

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
Fragment Exchange (**ทำแล้ว**): เศษพลัง 30 + ทอง 5,000 → เลือกพลังได้ 1 ผล ที่ปราชญ์อิลยา (Aether Capital) · Pity ของ Map/World Boss: ทำพร้อมระบบบอส

## Awakening (PART 7) — ทำแล้ว
II: Mastery 5 + เศษพลัง 20 + แก่นวิญญาณ 60 + ผงรูนโบราณ 10 + ทอง 30,000 · III: Mastery 12 + เศษพลัง 40 + แก่นวิญญาณ 150 + ผงรูน 30 + คริสตัลพิธีกรรม 5 + ทอง 120,000 (config)

I: A5/U1/P2 · II: A10/U3/P3 · III: A15/U5/P5 · Mastery: customization, visual evolution, combo variants (horizontal progression) ใช้วัตถุดิบจากบอส/ดันเจี้ยน และบันทึก Power Mastery ถาวร

## สเปกครบ 150 ความสามารถ (สร้างจาก config: `npx tsx scripts/gen-tables.ts powers`)

### Shadow of Abyss (เงาแห่งห้วงลึก) — dark, อาวุธ: dagger

| ID | ชื่อ | ประเภท | ปลด | Damage | Shape | CD | EN | Cast | Anim | Effects | PvP× | Counterplay |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| shadow_shadow_dash | พุ่งผ่านเงา (Shadow Dash) | active | I | 1.4×weapon+10 | {kind:line,length:5,width:1.2} | 6s | 15 | 0s | 0.35s | {kind:dash,distance:5,duration:0.22} | 0.7 | - |
| shadow_dark_kunai | ดาวกระจายแห่งความมืด (Dark Kunai) | active | I | 0.9×weapon+5 | {kind:projectile,speed:18,range:8,radius:0.25,pierce:false} | 4s | 12 | 0s | 0.35s | {kind:spread,count:3,angleDeg:30} | 0.7 | - |
| shadow_smoke_veil | หมอกบดบัง (Smoke Veil) | active | I | - | {kind:circle,radius:2.5,forward:0} | 14s | 20 | 0s | 0.35s | {kind:slow,mult:0.5,duration:2}<br>{kind:stealth,duration:3} | 0.7 | - |
| shadow_silent_kill | สังหารเงียบ (Silent Kill) | active | I | 2.2×weapon+20 | {kind:arc,range:1.5,arcDeg:80} | 12s | 25 | 0s | 0.35s | {kind:execute,threshold:0.3,mult:2}<br>{kind:backstab,mult:1.5} | 0.7 | - |
| shadow_shadow_clone | ร่างแยกเงา (Shadow Clone) | active | I | - | {kind:self} | 18s | 25 | 0s | 0.35s | {kind:summon,summon:shadow_clone,count:1,duration:8,atkMult:0.5,interval:0.8,range:5} | 0.7 | - |
| shadow_night_fang | เขี้ยวราตรี (Night Fang) | active | II | 0.7×weapon+4 | {kind:arc,range:1.5,arcDeg:90} | 6s | 15 | 0s | 0.35s | {kind:multi,hits:3}<br>{kind:backstab,mult:1.3} | 0.7 | - |
| shadow_dark_trap | กับดักเงา (Dark Trap) | active | II | 1.6×weapon+10 | {kind:circle,radius:1.5,forward:2} | 10s | 15 | 0s | 0.35s | {kind:trap,radius:1.5,armSec:0.5,lifeSec:20,maxActive:2}<br>{kind:root,duration:2.5} | 0.7 | - |
| shadow_abyss_pull | ดึงสู่ห้วงลึก (Abyss Pull) | active | II | 0.8×weapon+5 | {kind:projectile,speed:14,range:7,radius:0.4,pierce:false} | 9s | 15 | 0s | 0.35s | {kind:pull,distance:4} | 0.7 | - |
| shadow_phantom_walk | ย่างภูต (Phantom Walk) | active | II | - | {kind:self} | 15s | 15 | 0s | 0.35s | {kind:buff,duration:5,statsPct:{moveSpeed:0.4}}<br>{kind:stealth,duration:2} | 0.7 | - |
| shadow_shadow_swap | สลับเงา (Shadow Swap) | active | II | - | {kind:self} | 8s | 10 | 0s | 0.35s | {kind:blink,distance:6} | 0.7 | - |
| shadow_dark_mark | ตราแห่งความมืด (Dark Mark) | active | III | 0.5×weapon+0 | {kind:projectile,speed:20,range:9,radius:0.3,pierce:false} | 10s | 10 | 0s | 0.35s | {kind:vuln,amount:0.2,duration:6} | 0.7 | - |
| shadow_black_shuriken | ดาวกระจายดำ (Black Shuriken) | active | III | 1.3×weapon+8 | {kind:circle,radius:3,forward:0} | 8s | 20 | 0s | 0.35s | - | 0.7 | - |
| shadow_nightmare_strike | ฝันร้าย (Nightmare Strike) | active | III | 1.8×weapon+12 | {kind:arc,range:1.6,arcDeg:90} | 9s | 20 | 0s | 0.35s | {kind:pierce_def,amount:0.5} | 0.7 | - |
| shadow_shadow_bind | พันธนาการเงา (Shadow Bind) | active | III | 0.6×weapon+0 | {kind:projectile,speed:16,range:7,radius:0.4,pierce:false} | 12s | 15 | 0s | 0.35s | {kind:root,duration:2.5} | 0.7 | - |
| shadow_vanish | หายตัว (Vanish) | active | III | - | {kind:self} | 20s | 20 | 0s | 0.35s | {kind:stealth,duration:4}<br>{kind:cleanse} | 0.7 | - |
| shadow_domain_of_darkness | อาณาเขตแห่งความมืด (Domain of Darkness) | ultimate | I | 0.5×weapon+4 | {kind:self} | 60s | 50 | 0.3s | 0.6s | {kind:zone,radius:5,forward:0,duration:6,tick:0.5,follow:true}<br>{kind:slow,mult:0.6,duration:1} | 0.5 | เดินออกจากอาณาเขต (ขอบมองเห็นได้) หรือ cleanse |
| shadow_thousand_shadow_cuts | พันคมเงา (Thousand Shadow Cuts) | ultimate | II | 0.6×weapon+4 | {kind:circle,radius:3.5,forward:0} | 50s | 45 | 0.2s | 0.6s | {kind:multi,hits:8} | 0.5 | ร่าย 0.2 วิ — dodge ออกจากรัศมี หรือ stun ขัด |
| shadow_abyss_execution | ประหารห้วงลึก (Abyss Execution) | ultimate | II | 4×weapon+40 | {kind:arc,range:1.6,arcDeg:100} | 45s | 40 | 0s | 0.6s | {kind:blink_behind,range:6,coneDeg:90}<br>{kind:execute,threshold:0.4,mult:2.5}<br>{kind:backstab,mult:1.3} | 0.5 | รักษา HP ไว้เหนือ 40% และหันหลังชิดกำแพง (ไม่มีที่ให้วาร์ป) |
| shadow_night_army | กองทัพราตรี (Night Army) | ultimate | III | - | {kind:self} | 75s | 60 | 0s | 0.6s | {kind:summon,summon:shadow_clone,count:3,duration:10,atkMult:0.6,interval:0.8,range:6} | 0.5 | ใช้ AoE ใส่ผู้ใช้ — ร่างแยกหายเมื่อผู้ใช้ตาย |
| shadow_shadow_monarch | จักรพรรดิเงา (Shadow Monarch) | ultimate | III | - | {kind:self} | 90s | 60 | 0s | 0.6s | {kind:buff,duration:10,statsPct:{patk:0.3,matk:0.3,atkSpd:0.25},stats:{critRate:0.15}}<br>{kind:stealth,duration:1} | 0.5 | ถอยและใช้ CC ประวิงเวลา 10 วินาที |

| Passive ID | ชื่อ | ปลด | ผล |
|---|---|---|---|
| shadow_shadow_predator | นักล่าแห่งเงา (Shadow Predator) | I | ดาเมจ +20% ต่อเป้าหมาย HP ต่ำกว่า 50% |
| shadow_silent_assassin | นักฆ่าเงียบ (Silent Assassin) | I | อัตราคริติคอล +8% |
| shadow_dark_recovery | ฟื้นฟูแห่งความมืด (Dark Recovery) | II | ฟื้น HP 3% เมื่อสังหารศัตรู |
| shadow_evasion_master | ปรมาจารย์การหลบ (Evasion Master) | III | หลบหลีก +6% |
| shadow_night_hunter | นักล่ารัตติกาล (Night Hunter) | III | Physical ATK +8%, ความเร็ว +0.3 |

### Solar Inferno (อัคคีสุริยะ) — fire, อาวุธ: ทุกประเภท

| ID | ชื่อ | ประเภท | ปลด | Damage | Shape | CD | EN | Cast | Anim | Effects | PvP× | Counterplay |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| solar_fire_bullet | กระสุนไฟ (Fire Bullet) | active | I | 1.2×weapon+6 | {kind:projectile,speed:16,range:8,radius:0.35,pierce:false} | 2.5s | 10 | 0s | 0.35s | {kind:dot,dpsMult:0.15,duration:3,label:burn} | 0.7 | - |
| solar_flame_dash | พุ่งเปลวไฟ (Flame Dash) | active | I | 1.1×weapon+6 | {kind:line,length:4,width:1.2} | 7s | 15 | 0s | 0.35s | {kind:dash,distance:4,duration:0.2}<br>{kind:dot,dpsMult:0.15,duration:3,label:burn} | 0.7 | - |
| solar_burning_ground | พื้นลุกไหม้ (Burning Ground) | active | I | 0.3×weapon+2 | {kind:self} | 10s | 20 | 0s | 0.35s | {kind:zone,radius:2.2,forward:3,duration:5,tick:0.5,follow:false}<br>{kind:dot,dpsMult:0.1,duration:2,label:burn} | 0.7 | - |
| solar_fire_wall | กำแพงไฟ (Fire Wall) | active | I | 0.35×weapon+2 | {kind:self} | 12s | 25 | 0s | 0.35s | {kind:zone,radius:1.6,forward:2.5,duration:6,tick:0.5,follow:false}<br>{kind:knockback,distance:0.6} | 0.7 | - |
| solar_inferno_punch | หมัดนรก (Inferno Punch) | active | I | 1.8×weapon+10 | {kind:arc,range:1.6,arcDeg:100} | 7s | 15 | 0s | 0.35s | {kind:knockback,distance:1.5}<br>{kind:dot,dpsMult:0.15,duration:3,label:burn} | 0.7 | - |
| solar_flame_spear | หอกเพลิง (Flame Spear) | active | II | 1.6×weapon+12 | {kind:projectile,speed:20,range:10,radius:0.4,pierce:true} | 6s | 18 | 0s | 0.35s | {kind:dot,dpsMult:0.1,duration:2,label:burn} | 0.7 | - |
| solar_heat_wave | คลื่นความร้อน (Heat Wave) | active | II | 1×weapon+8 | {kind:circle,radius:3,forward:0} | 9s | 20 | 0s | 0.35s | {kind:knockback,distance:1.8} | 0.7 | - |
| solar_ember_rain | ฝนถ่านเพลิง (Ember Rain) | active | II | 0.45×weapon+3 | {kind:self} | 12s | 25 | 0.3s | 0.35s | {kind:zone,radius:2.5,forward:4,duration:3,tick:0.5,follow:false} | 0.7 | - |
| solar_fire_shield | โล่เพลิง (Fire Shield) | active | II | 0.2×weapon+0 | {kind:self} | 15s | 20 | 0s | 0.35s | {kind:shield,hpFraction:0.12,stat:matk,statMult:1,duration:4}<br>{kind:zone,radius:1.5,forward:0,duration:4,tick:0.5,follow:true} | 0.7 | - |
| solar_flame_tornado | ทอร์นาโดเพลิง (Flame Tornado) | active | II | 1.4×weapon+8 | {kind:projectile,speed:6,range:8,radius:0.8,pierce:true} | 11s | 25 | 0s | 0.35s | {kind:dot,dpsMult:0.15,duration:3,label:burn} | 0.7 | - |
| solar_solar_mark | ตราสุริยะ (Solar Mark) | active | III | 0.5×weapon+0 | {kind:projectile,speed:20,range:9,radius:0.3,pierce:false} | 10s | 10 | 0s | 0.35s | {kind:vuln,amount:0.2,duration:6} | 0.7 | - |
| solar_explosive_flame | เปลวระเบิด (Explosive Flame) | active | III | 2.4×weapon+16 | {kind:circle,radius:2,forward:3.5} | 10s | 25 | 0.5s | 0.35s | {kind:dot,dpsMult:0.15,duration:3,label:burn} | 0.7 | - |
| solar_phoenix_step | ก้าวหงส์ไฟ (Phoenix Step) | active | III | - | {kind:self} | 9s | 15 | 0s | 0.35s | {kind:blink,distance:5}<br>{kind:heal,pct:0.05,statMult:0,radius:0} | 0.7 | - |
| solar_lava_burst | ลาวาปะทุ (Lava Burst) | active | III | 2×weapon+14 | {kind:circle,radius:2.6,forward:0} | 12s | 30 | 0.4s | 0.35s | {kind:stun,duration:0.5}<br>{kind:dot,dpsMult:0.15,duration:3,label:burn} | 0.7 | - |
| solar_flame_chain | โซ่เพลิง (Flame Chain) | active | III | 1.2×weapon+6 | {kind:projectile,speed:18,range:8,radius:0.35,pierce:false} | 8s | 18 | 0s | 0.35s | {kind:chain,jumps:3,range:4}<br>{kind:dot,dpsMult:0.15,duration:3,label:burn} | 0.7 | - |
| solar_miniature_sun | ดวงอาทิตย์จิ๋ว (Miniature Sun) | ultimate | I | 0.7×weapon+6 | {kind:self} | 60s | 55 | 0.5s | 0.6s | {kind:zone,radius:4,forward:4,duration:6,tick:0.5,follow:false}<br>{kind:dot,dpsMult:0.15,duration:2,label:burn} | 0.5 | ร่าย 0.5 วิ — ออกจากรัศมีหรือขัดด้วย stun |
| solar_phoenix_rebirth | หงส์คืนชีพ (Phoenix Rebirth) | ultimate | II | - | {kind:self} | 120s | 40 | 0s | 0.6s | {kind:cheat_death,duration:20,hpPct:0.5} | 0.5 | บีบให้ใช้ก่อน แล้วรอ 20 วินาทีหรือใช้ burst สองระลอก |
| solar_hellfire_domain | อาณาเขตนรก (Hellfire Domain) | ultimate | II | 0.5×weapon+4 | {kind:self} | 75s | 60 | 0.3s | 0.6s | {kind:zone,radius:6,forward:0,duration:8,tick:0.5,follow:true}<br>{kind:dot,dpsMult:0.1,duration:2,label:burn}<br>{kind:slow,mult:0.7,duration:1} | 0.5 | ตัดระยะออกจากผู้ใช้ — อาณาเขตตามตัวผู้ใช้ |
| solar_solar_dragon | มังกรสุริยะ (Solar Dragon) | ultimate | III | 4×weapon+40 | {kind:projectile,speed:12,range:14,radius:1.2,pierce:true} | 50s | 50 | 0.5s | 0.6s | {kind:dot,dpsMult:0.2,duration:4,label:burn} | 0.5 | ร่าย 0.5 วิ และพุ่งเป็นเส้นตรง — dodge ด้านข้าง |
| solar_inferno_awakening | ปลุกนรก (Inferno Awakening) | ultimate | III | 0.25×weapon+2 | {kind:self} | 90s | 60 | 0s | 0.6s | {kind:buff,duration:12,statsPct:{patk:0.35,matk:0.35}}<br>{kind:zone,radius:2,forward:0,duration:12,tick:0.5,follow:true} | 0.5 | ประวิงเวลาด้วยระยะห่างและ CC |

| Passive ID | ชื่อ | ปลด | ผล |
|---|---|---|---|
| solar_burning_soul | วิญญาณลุกโชน (Burning Soul) | I | ดาเมจ Burn +30% |
| solar_flame_mastery | ปรมาจารย์เพลิง (Flame Mastery) | I | ดาเมจธาตุไฟ +10% |
| solar_heat_resistance | ทนความร้อน (Heat Resistance) | II | ต้านทานธาตุ +10%, HP +5% |
| solar_chain_burn | ไฟลามทุ่ง (Chain Burn) | III | การโจมตีมีโอกาส 15% ติดไฟ |
| solar_solar_energy | พลังสุริยะ (Solar Energy) | III | ฟื้นฟู Energy +30% |

### Thunder Sovereign (จักรพรรดิอสนี) — lightning, อาวุธ: ทุกประเภท

| ID | ชื่อ | ประเภท | ปลด | Damage | Shape | CD | EN | Cast | Anim | Effects | PvP× | Counterplay |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| thunder_lightning_bolt | สายฟ้าฟาด (Lightning Bolt) | active | I | 1.2×weapon+6 | {kind:projectile,speed:24,range:9,radius:0.3,pierce:false} | 2.5s | 8 | 0s | 0.35s | {kind:charge,gain:1} | 0.7 | - |
| thunder_thunder_step | ก้าวอสนี (Thunder Step) | active | I | 0.8×weapon+4 | {kind:circle,radius:1.6,forward:0} | 8s | 15 | 0s | 0.35s | {kind:blink,distance:6}<br>{kind:stun,duration:0.5}<br>{kind:charge,gain:1} | 0.7 | - |
| thunder_electric_chain | โซ่ไฟฟ้า (Electric Chain) | active | I | 1.1×weapon+6 | {kind:projectile,speed:22,range:8,radius:0.3,pierce:false} | 6s | 15 | 0s | 0.35s | {kind:chain,jumps:4,range:4.5}<br>{kind:charge,gain:1} | 0.7 | - |
| thunder_volt_strike | โวลต์สไตรก์ (Volt Strike) | active | I | 1.6×weapon+8 | {kind:arc,range:1.7,arcDeg:110} | 5s | 12 | 0s | 0.35s | {kind:stun,duration:0.4}<br>{kind:charge,gain:1} | 0.7 | - |
| thunder_static_field | สนามไฟฟ้าสถิต (Static Field) | active | I | 0.3×weapon+2 | {kind:self} | 12s | 20 | 0s | 0.35s | {kind:zone,radius:2.5,forward:0,duration:5,tick:0.5,follow:true}<br>{kind:charge,gain:1} | 0.7 | - |
| thunder_thunder_kick | เตะอสนี (Thunder Kick) | active | II | 1.5×weapon+8 | {kind:arc,range:1.6,arcDeg:100} | 6s | 12 | 0s | 0.35s | {kind:knockback,distance:2}<br>{kind:charge,gain:1} | 0.7 | - |
| thunder_flash_counter | สวนกลับแสงวาบ (Flash Counter) | active | II | 2.2×weapon+10 | {kind:self} | 12s | 15 | 0s | 0.8s | {kind:counter,window:0.8,damageMult:2.2,range:2.5,stunDuration:0.6} | 0.7 | - |
| thunder_lightning_spear | หอกสายฟ้า (Lightning Spear) | active | II | 1.7×weapon+12 | {kind:projectile,speed:28,range:11,radius:0.35,pierce:true} | 7s | 18 | 0s | 0.35s | {kind:charge,gain:1} | 0.7 | - |
| thunder_thunder_trap | กับดักอสนี (Thunder Trap) | active | II | 1.5×weapon+8 | {kind:circle,radius:1.6,forward:2} | 10s | 15 | 0s | 0.35s | {kind:trap,radius:1.6,armSec:0.5,lifeSec:20,maxActive:2}<br>{kind:stun,duration:1.5} | 0.7 | - |
| thunder_overcharge | ประจุเกิน (Overcharge) | active | II | - | {kind:self} | 18s | 20 | 0s | 0.35s | {kind:buff,duration:6,statsPct:{atkSpd:0.3}}<br>{kind:charge,gain:3} | 0.7 | - |
| thunder_shock_pulse | คลื่นช็อก (Shock Pulse) | active | III | 1.1×weapon+6 | {kind:circle,radius:2.8,forward:0} | 8s | 18 | 0s | 0.35s | {kind:slow,mult:0.6,duration:2}<br>{kind:charge,gain:1} | 0.7 | - |
| thunder_storm_arrow | ศรพายุ (Storm Arrow) | active | III | 0.9×weapon+5 | {kind:projectile,speed:22,range:9,radius:0.25,pierce:false} | 6s | 15 | 0s | 0.35s | {kind:spread,count:3,angleDeg:20}<br>{kind:charge,gain:1} | 0.7 | - |
| thunder_volt_armor | เกราะโวลต์ (Volt Armor) | active | III | - | {kind:self} | 15s | 20 | 0s | 0.35s | {kind:shield,hpFraction:0.1,stat:matk,statMult:1,duration:5}<br>{kind:buff,duration:5,statsPct:{moveSpeed:0.2}} | 0.7 | - |
| thunder_electric_prison | คุกไฟฟ้า (Electric Prison) | active | III | 0.8×weapon+4 | {kind:circle,radius:2,forward:3.5} | 14s | 25 | 0.3s | 0.35s | {kind:root,duration:2.5}<br>{kind:charge,gain:1} | 0.7 | - |
| thunder_thunder_burst | ระเบิดอสนี (Thunder Burst) | active | III | 1×weapon+8 | {kind:circle,radius:3,forward:0} | 10s | 20 | 0s | 0.35s | {kind:consume_charge,multPer:0.35} | 0.7 | - |
| thunder_thunder_god_form | ร่างเทพอสนี (Thunder God Form) | ultimate | I | - | {kind:self} | 90s | 60 | 0s | 0.6s | {kind:buff,duration:12,statsPct:{patk:0.25,matk:0.25,atkSpd:0.3,moveSpeed:0.3}}<br>{kind:charge,gain:5} | 0.5 | ถอยและใช้ slow/root ทำให้ความเร็วไร้ผล |
| thunder_judgment_lightning | สายฟ้าพิพากษา (Judgment Lightning) | ultimate | II | 4.5×weapon+40 | {kind:circle,radius:3,forward:5} | 55s | 50 | 0.7s | 0.6s | {kind:stun,duration:1} | 0.5 | มีวงเตือน 0.7 วิ — ออกจากวง |
| thunder_storm_domain | อาณาเขตพายุ (Storm Domain) | ultimate | II | 0.5×weapon+4 | {kind:self} | 75s | 60 | 0.3s | 0.6s | {kind:zone,radius:6,forward:0,duration:8,tick:0.5,follow:true}<br>{kind:charge,gain:1} | 0.5 | ออกจากรัศมี — พายุตามตัวผู้ใช้ |
| thunder_one_million_volts | ล้านโวลต์ (One Million Volts) | ultimate | III | 5×weapon+50 | {kind:circle,radius:4.5,forward:0} | 60s | 60 | 0.8s | 0.6s | {kind:consume_charge,multPer:0.4}<br>{kind:stun,duration:0.8} | 0.5 | ร่ายนาน 0.8 วิ — ขัดด้วย stun หรือ dodge ออก |
| thunder_lightning_clone_army | กองทัพร่างอสนี (Lightning Clone Army) | ultimate | III | - | {kind:self} | 75s | 60 | 0s | 0.6s | {kind:summon,summon:lightning_clone,count:3,duration:10,atkMult:0.55,interval:0.7,range:6} | 0.5 | โฟกัสผู้ใช้ — ร่างหายเมื่อผู้ใช้ตาย |

| Passive ID | ชื่อ | ปลด | ผล |
|---|---|---|---|
| thunder_lightning_reflex | ปฏิกิริยาสายฟ้า (Lightning Reflex) | I | ความเร็วโจมตี +8% |
| thunder_static_charge | ประจุสถิต (Static Charge) | I | ได้ประจุเพิ่ม +1 ทุกครั้งที่สะสม |
| thunder_thunder_blood | โลหิตอสนี (Thunder Blood) | II | HP +6%, ความเร็ว +0.2 |
| thunder_electric_critical | คริติคอลไฟฟ้า (Electric Critical) | III | ดาเมจคริติคอล +20% |
| thunder_storm_runner | นักวิ่งพายุ (Storm Runner) | III | ความเร็ว +0.4, หลบหลีก +3% |

### Eternal Frost (น้ำแข็งนิรันดร์) — ice, อาวุธ: ทุกประเภท

| ID | ชื่อ | ประเภท | ปลด | Damage | Shape | CD | EN | Cast | Anim | Effects | PvP× | Counterplay |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| frost_ice_shard | เกล็ดน้ำแข็ง (Ice Shard) | active | I | 1.1×weapon+6 | {kind:projectile,speed:18,range:9,radius:0.3,pierce:false} | 2.5s | 8 | 0s | 0.35s | {kind:frost,stacks:1} | 0.7 | - |
| frost_frost_nova | โนวาน้ำแข็ง (Frost Nova) | active | I | 1×weapon+6 | {kind:circle,radius:2.8,forward:0} | 9s | 20 | 0s | 0.35s | {kind:frost,stacks:2}<br>{kind:slow,mult:0.6,duration:2} | 0.7 | - |
| frost_ice_wall | กำแพงน้ำแข็ง (Ice Wall) | active | I | 0.1×weapon+0 | {kind:self} | 14s | 20 | 0s | 0.35s | {kind:zone,radius:1.8,forward:2.5,duration:6,tick:0.5,follow:false}<br>{kind:slow,mult:0.3,duration:1} | 0.7 | - |
| frost_frozen_spear | หอกเยือกแข็ง (Frozen Spear) | active | I | 1.5×weapon+10 | {kind:projectile,speed:20,range:10,radius:0.4,pierce:true} | 7s | 18 | 0s | 0.35s | {kind:frost,stacks:2} | 0.7 | - |
| frost_snow_dash | พุ่งหิมะ (Snow Dash) | active | I | 0.8×weapon+4 | {kind:line,length:4,width:1.2} | 7s | 12 | 0s | 0.35s | {kind:dash,distance:4,duration:0.2}<br>{kind:frost,stacks:1} | 0.7 | - |
| frost_crystal_shield | โล่ผลึก (Crystal Shield) | active | II | - | {kind:self} | 14s | 20 | 0s | 0.35s | {kind:shield,hpFraction:0.18,stat:matk,statMult:1.2,duration:6} | 0.7 | - |
| frost_ice_prison | คุกน้ำแข็ง (Ice Prison) | active | II | 0.6×weapon+0 | {kind:projectile,speed:16,range:8,radius:0.4,pierce:false} | 14s | 20 | 0s | 0.35s | {kind:root,duration:3}<br>{kind:frost,stacks:2} | 0.7 | - |
| frost_blizzard | พายุหิมะ (Blizzard) | active | II | 0.35×weapon+2 | {kind:self} | 14s | 30 | 0.4s | 0.35s | {kind:zone,radius:3,forward:4,duration:6,tick:0.5,follow:false}<br>{kind:frost,stacks:1}<br>{kind:slow,mult:0.6,duration:1} | 0.7 | - |
| frost_frozen_ground | พื้นเยือกแข็ง (Frozen Ground) | active | II | 0.15×weapon+0 | {kind:self} | 12s | 15 | 0s | 0.35s | {kind:zone,radius:2.5,forward:0,duration:5,tick:0.5,follow:false}<br>{kind:slow,mult:0.5,duration:1}<br>{kind:frost,stacks:1} | 0.7 | - |
| frost_frost_blade | ใบมีดเยือกแข็ง (Frost Blade) | active | II | 1.7×weapon+10 | {kind:arc,range:1.8,arcDeg:120} | 6s | 15 | 0s | 0.35s | {kind:frost,stacks:2} | 0.7 | - |
| frost_ice_mirror | กระจกน้ำแข็ง (Ice Mirror) | active | III | - | {kind:self} | 18s | 20 | 0s | 0.35s | {kind:summon,summon:ice_mirror,count:1,duration:6,atkMult:0.4,interval:1,range:5}<br>{kind:stealth,duration:2} | 0.7 | - |
| frost_crystal_spike | หนามผลึก (Crystal Spike) | active | III | 1.6×weapon+10 | {kind:line,length:6,width:1} | 9s | 20 | 0s | 0.35s | {kind:stun,duration:0.5}<br>{kind:frost,stacks:1} | 0.7 | - |
| frost_cold_snap | เยือกฉับพลัน (Cold Snap) | active | III | 0.8×weapon+6 | {kind:circle,radius:3,forward:0} | 8s | 15 | 0s | 0.35s | {kind:shatter,mult:2} | 0.7 | - |
| frost_snowfall | หิมะโปรย (Snowfall) | active | III | 0.2×weapon+0 | {kind:self} | 12s | 20 | 0s | 0.35s | {kind:zone,radius:3.5,forward:3,duration:4,tick:1,follow:false}<br>{kind:slow,mult:0.5,duration:1.5}<br>{kind:frost,stacks:1} | 0.7 | - |
| frost_frozen_pulse | ชีพจรน้ำแข็ง (Frozen Pulse) | active | III | 1.3×weapon+8 | {kind:circle,radius:2.2,forward:0} | 8s | 15 | 0s | 0.35s | {kind:frost,stacks:2} | 0.7 | - |
| frost_absolute_zero | ศูนย์สัมบูรณ์ (Absolute Zero) | ultimate | I | 3.5×weapon+30 | {kind:circle,radius:5,forward:0} | 70s | 60 | 0.8s | 0.6s | {kind:frost,stacks:5} | 0.5 | ร่าย 0.8 วิ — ออกจากรัศมี; PvP มี DR ของ Freeze |
| frost_ice_kingdom | อาณาจักรน้ำแข็ง (Ice Kingdom) | ultimate | II | 0.3×weapon+2 | {kind:self} | 75s | 60 | 0.3s | 0.6s | {kind:zone,radius:6,forward:0,duration:8,tick:0.5,follow:true}<br>{kind:frost,stacks:1}<br>{kind:slow,mult:0.6,duration:1} | 0.5 | ออกจากอาณาเขตก่อน stack ครบ 5 |
| frost_frost_titan | ไททันน้ำแข็ง (Frost Titan) | ultimate | II | - | {kind:self} | 90s | 60 | 0s | 0.6s | {kind:buff,duration:12,statsPct:{pdef:0.5,mdef:0.5,patk:0.2,matk:0.2}}<br>{kind:buff_dr,amount:0.15,duration:12,superArmor:true} | 0.5 | ไม่ต้องปะทะตรงๆ ใช้ระยะและ kite |
| frost_eternal_blizzard | พายุหิมะนิรันดร์ (Eternal Blizzard) | ultimate | III | 0.55×weapon+4 | {kind:self} | 70s | 60 | 0.6s | 0.6s | {kind:zone,radius:5,forward:4,duration:8,tick:0.5,follow:false}<br>{kind:frost,stacks:1}<br>{kind:slow,mult:0.5,duration:1} | 0.5 | ร่าย 0.6 วิ ตำแหน่งตายตัว — ออกจากพื้นที่ |
| frost_crystal_awakening | ปลุกผลึก (Crystal Awakening) | ultimate | III | - | {kind:self} | 90s | 60 | 0s | 0.6s | {kind:buff,duration:12,statsPct:{patk:0.3,matk:0.3}}<br>{kind:shield,hpFraction:0.15,stat:matk,statMult:1,duration:12} | 0.5 | ทำลายโล่ก่อนแล้วจึง burst |

| Passive ID | ชื่อ | ปลด | ผล |
|---|---|---|---|
| frost_frost_mastery | ปรมาจารย์น้ำแข็ง (Frost Mastery) | I | ดาเมจธาตุน้ำแข็ง +10% |
| frost_ice_armor | เกราะน้ำแข็ง (Ice Armor) | I | PDEF/MDEF +12% |
| frost_frozen_heart | หัวใจน้ำแข็ง (Frozen Heart) | II | ต้านทาน CC +10%, HP +5% |
| frost_cold_blood | เลือดเย็น (Cold Blood) | III | อัตราคริติคอล +5% |
| frost_shatter | แตกละเอียด (Shatter) | III | ดาเมจ +30% ต่อศัตรูที่แข็ง/ถูกตรึง/มึน |

### Gravity Dominion (ผู้ครองแรงโน้มถ่วง) — gravity, อาวุธ: sword/staff/gauntlet

| ID | ชื่อ | ประเภท | ปลด | Damage | Shape | CD | EN | Cast | Anim | Effects | PvP× | Counterplay |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| gravity_gravity_pull | ดึงโน้มถ่วง (Gravity Pull) | active | I | 0.8×weapon+4 | {kind:circle,radius:4,forward:0} | 8s | 15 | 0s | 0.35s | {kind:pull,distance:3} | 0.7 | - |
| gravity_gravity_push | ผลักโน้มถ่วง (Gravity Push) | active | I | 1×weapon+6 | {kind:circle,radius:2.5,forward:0} | 8s | 15 | 0s | 0.35s | {kind:knockback,distance:3} | 0.7 | - |
| gravity_heavy_strike | ฟาดหนัก (Heavy Strike) | active | I | 2×weapon+12 | {kind:arc,range:1.8,arcDeg:120} | 7s | 15 | 0s | 0.35s | {kind:stun,duration:0.6}<br>{kind:slow,mult:0.6,duration:2} | 0.7 | - |
| gravity_gravity_field | สนามโน้มถ่วง (Gravity Field) | active | I | 0.25×weapon+2 | {kind:self} | 12s | 20 | 0s | 0.35s | {kind:zone,radius:2.5,forward:3,duration:5,tick:0.5,follow:false}<br>{kind:slow,mult:0.4,duration:1} | 0.7 | - |
| gravity_floating_step | ก้าวลอย (Floating Step) | active | I | - | {kind:self} | 8s | 10 | 0s | 0.35s | {kind:blink,distance:4} | 0.7 | - |
| gravity_crush_zone | เขตบดขยี้ (Crush Zone) | active | II | 2.2×weapon+14 | {kind:circle,radius:2.2,forward:3} | 11s | 25 | 0.5s | 0.35s | {kind:stun,duration:0.8} | 0.7 | - |
| gravity_orbit_shield | โล่วงโคจร (Orbit Shield) | active | II | - | {kind:self} | 15s | 20 | 0s | 0.35s | {kind:shield,hpFraction:0.2,stat:matk,statMult:1,duration:6} | 0.7 | - |
| gravity_gravity_chain | โซ่โน้มถ่วง (Gravity Chain) | active | II | 1×weapon+6 | {kind:projectile,speed:16,range:7,radius:0.35,pierce:false} | 10s | 18 | 0s | 0.35s | {kind:chain,jumps:3,range:4}<br>{kind:pull,distance:1.5}<br>{kind:root,duration:1} | 0.7 | - |
| gravity_meteor_rock | หินอุกกาบาต (Meteor Rock) | active | II | 2.6×weapon+18 | {kind:circle,radius:2,forward:4.5} | 10s | 25 | 0.7s | 0.35s | {kind:knockback,distance:1} | 0.7 | - |
| gravity_anti_gravity | ไร้แรงโน้มถ่วง (Anti-Gravity) | active | II | 0.6×weapon+4 | {kind:circle,radius:2.5,forward:0} | 14s | 20 | 0s | 0.35s | {kind:stun,duration:1.2} | 0.7 | - |
| gravity_pressure_wave | คลื่นแรงกดดัน (Pressure Wave) | active | III | 1.4×weapon+8 | {kind:line,length:6,width:2} | 9s | 20 | 0s | 0.35s | {kind:knockback,distance:2} | 0.7 | - |
| gravity_gravity_prison | คุกโน้มถ่วง (Gravity Prison) | active | III | 0.5×weapon+0 | {kind:projectile,speed:14,range:7,radius:0.4,pierce:false} | 14s | 20 | 0s | 0.35s | {kind:root,duration:3} | 0.7 | - |
| gravity_ground_slam | ทุบพื้น (Ground Slam) | active | III | 1.6×weapon+10 | {kind:circle,radius:2.6,forward:0} | 9s | 20 | 0s | 0.35s | {kind:stun,duration:0.5} | 0.7 | - |
| gravity_mass_shift | เปลี่ยนมวล (Mass Shift) | active | III | - | {kind:self} | 16s | 20 | 0s | 0.35s | {kind:buff_dr,amount:0.25,duration:5,superArmor:true} | 0.7 | - |
| gravity_singularity_seed | เมล็ดเอกฐาน (Singularity Seed) | active | III | 1.8×weapon+10 | {kind:circle,radius:2,forward:2} | 12s | 20 | 0s | 0.35s | {kind:trap,radius:2,armSec:0.5,lifeSec:20,maxActive:2}<br>{kind:pull,distance:3}<br>{kind:stun,duration:0.8} | 0.7 | - |
| gravity_black_hole | หลุมดำ (Black Hole) | ultimate | I | 0.45×weapon+4 | {kind:self} | 70s | 55 | 0.5s | 0.6s | {kind:zone,radius:4,forward:4,duration:5,tick:0.4,follow:false}<br>{kind:pull,distance:1.2} | 0.5 | dodge ออกนอกขอบทันทีที่เริ่ม — แรงดึงต่อ tick มีจำกัด |
| gravity_meteor_judgment | อุกกาบาตพิพากษา (Meteor Judgment) | ultimate | II | 5×weapon+50 | {kind:circle,radius:4,forward:5} | 65s | 60 | 1s | 0.6s | {kind:stun,duration:1.5} | 0.5 | ร่าย 1 วินาที — ออกจากวงหรือขัด |
| gravity_gravity_emperor | จักรพรรดิโน้มถ่วง (Gravity Emperor) | ultimate | II | 0.2×weapon+0 | {kind:self} | 90s | 60 | 0s | 0.6s | {kind:buff_dr,amount:0.35,duration:10,superArmor:true}<br>{kind:buff,duration:10,statsPct:{pdef:0.4,mdef:0.4}}<br>{kind:zone,radius:3,forward:0,duration:10,tick:0.5,follow:true}<br>{kind:slow,mult:0.6,duration:1} | 0.5 | อย่าปะทะ 10 วินาทีนี้ เปลี่ยนเป้าหมาย |
| gravity_world_collapse | โลกถล่ม (World Collapse) | ultimate | III | 3.5×weapon+30 | {kind:circle,radius:6,forward:0} | 75s | 60 | 0.8s | 0.6s | {kind:pull,distance:4}<br>{kind:stun,duration:1.2} | 0.5 | ร่าย 0.8 วิ — ขัดหรือ dodge ออกนอก 6 ช่อง |
| gravity_zero_gravity_domain | อาณาเขตไร้น้ำหนัก (Zero Gravity Domain) | ultimate | III | 0.2×weapon+2 | {kind:self} | 80s | 60 | 0.3s | 0.6s | {kind:zone,radius:6,forward:0,duration:8,tick:0.5,follow:true}<br>{kind:root,duration:0.6} | 0.5 | ออกจากอาณาเขต; มี CC resist จะหลุดเร็วขึ้น |

| Passive ID | ชื่อ | ปลด | ผล |
|---|---|---|---|
| gravity_heavy_body | กายหนัก (Heavy Body) | I | HP +10% แต่ความเร็ว -0.2 |
| gravity_gravity_core | แกนโน้มถ่วง (Gravity Core) | I | ดาเมจธาตุโน้มถ่วง +10% |
| gravity_pressure_master | ปรมาจารย์แรงกด (Pressure Master) | II | ระยะเวลา CC ที่ทำ +20% |
| gravity_unshakable | ไม่สั่นคลอน (Unshakable) | III | ต้านทาน CC +15% |
| gravity_mass_control | ควบคุมมวล (Mass Control) | III | PDEF/MDEF +10% |

### Genesis Bloom (ปฐมบุปผา) — nature, อาวุธ: ทุกประเภท

| ID | ชื่อ | ประเภท | ปลด | Damage | Shape | CD | EN | Cast | Anim | Effects | PvP× | Counterplay |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| genesis_vine_whip | แส้เถาวัลย์ (Vine Whip) | active | I | 1.2×weapon+6 | {kind:line,length:4,width:1} | 3s | 10 | 0s | 0.35s | {kind:slow,mult:0.7,duration:1.5} | 0.7 | - |
| genesis_healing_bloom | บุปผาเยียวยา (Healing Bloom) | active | I | - | {kind:self} | 8s | 20 | 0s | 0.35s | {kind:heal,pct:0.18,statMult:0.8,radius:4} | 0.7 | - |
| genesis_thorn_trap | กับดักหนาม (Thorn Trap) | active | I | 1.4×weapon+8 | {kind:circle,radius:1.6,forward:2} | 10s | 15 | 0s | 0.35s | {kind:trap,radius:1.6,armSec:0.5,lifeSec:20,maxActive:2}<br>{kind:root,duration:2}<br>{kind:dot,dpsMult:0.12,duration:4,label:poison} | 0.7 | - |
| genesis_root_bind | รากพันธนาการ (Root Bind) | active | I | 0.6×weapon+0 | {kind:projectile,speed:14,range:8,radius:0.4,pierce:false} | 12s | 15 | 0s | 0.35s | {kind:root,duration:2.5} | 0.7 | - |
| genesis_nature_shield | โล่ธรรมชาติ (Nature Shield) | active | I | - | {kind:self} | 14s | 20 | 0s | 0.35s | {kind:shield,hpFraction:0.15,stat:matk,statMult:1,duration:6}<br>{kind:heal,pct:0.05,statMult:0,radius:4} | 0.7 | - |
| genesis_poison_flower | บุปผาพิษ (Poison Flower) | active | II | 0.3×weapon+2 | {kind:self} | 10s | 18 | 0s | 0.35s | {kind:zone,radius:2,forward:3,duration:6,tick:1,follow:false}<br>{kind:dot,dpsMult:0.12,duration:4,label:poison} | 0.7 | - |
| genesis_seed_explosion | เมล็ดระเบิด (Seed Explosion) | active | II | 1.8×weapon+12 | {kind:circle,radius:2,forward:3} | 9s | 20 | 0.4s | 0.35s | - | 0.7 | - |
| genesis_forest_dash | พุ่งพงไพร (Forest Dash) | active | II | 0.8×weapon+4 | {kind:line,length:4,width:1.2} | 8s | 15 | 0s | 0.35s | {kind:dash,distance:4,duration:0.2}<br>{kind:heal,pct:0.05,statMult:0,radius:0} | 0.7 | - |
| genesis_life_drain | ดูดชีวิต (Life Drain) | active | II | 1.3×weapon+8 | {kind:projectile,speed:16,range:8,radius:0.35,pierce:false} | 7s | 15 | 0s | 0.35s | {kind:lifesteal,fraction:0.5} | 0.7 | - |
| genesis_healing_rain | ฝนเยียวยา (Healing Rain) | active | II | - | {kind:self} | 16s | 25 | 0s | 0.35s | {kind:zone,radius:3,forward:0,duration:5,tick:1,follow:true,healPct:0.04} | 0.7 | - |
| genesis_thorn_armor | เกราะหนาม (Thorn Armor) | active | III | - | {kind:self} | 15s | 20 | 0s | 0.35s | {kind:reflect,fraction:0.3,duration:6}<br>{kind:buff,duration:6,statsPct:{pdef:0.2}} | 0.7 | - |
| genesis_summon_wolf | อัญเชิญหมาป่า (Summon Wolf) | active | III | - | {kind:self} | 20s | 25 | 0s | 0.35s | {kind:summon,summon:wolf,count:1,duration:15,atkMult:0.6,interval:0.9,range:6} | 0.7 | - |
| genesis_spore_cloud | เมฆสปอร์ (Spore Cloud) | active | III | 0.6×weapon+4 | {kind:circle,radius:2.8,forward:0} | 9s | 18 | 0s | 0.35s | {kind:dot,dpsMult:0.15,duration:4,label:poison}<br>{kind:slow,mult:0.6,duration:2} | 0.7 | - |
| genesis_nature_pulse | ชีพจรธรรมชาติ (Nature Pulse) | active | III | 1×weapon+6 | {kind:circle,radius:3,forward:0} | 9s | 20 | 0s | 0.35s | {kind:heal,pct:0.06,statMult:0.3,radius:3} | 0.7 | - |
| genesis_spirit_flower | บุปผาวิญญาณ (Spirit Flower) | active | III | - | {kind:self} | 18s | 20 | 0s | 0.35s | {kind:zone,radius:2.5,forward:2,duration:8,tick:1,follow:false,healPct:0.03} | 0.7 | - |
| genesis_world_tree | พฤกษาโลก (World Tree) | ultimate | I | - | {kind:self} | 80s | 55 | 0.5s | 0.6s | {kind:zone,radius:5,forward:0,duration:10,tick:1,follow:true,healPct:0.05}<br>{kind:buff_dr,amount:0.15,duration:10,superArmor:false} | 0.5 | ดึงเป้าหมายออกจากรัศมี หรือฆ่าผู้ใช้ |
| genesis_forest_guardian | ผู้พิทักษ์พงไพร (Forest Guardian) | ultimate | II | - | {kind:self} | 75s | 55 | 0s | 0.6s | {kind:summon,summon:treant,count:1,duration:15,atkMult:1.2,interval:1.2,range:4} | 0.5 | โฟกัสผู้ใช้ — ผู้พิทักษ์หายเมื่อผู้ใช้ตาย |
| genesis_genesis_awakening | ปลุกปฐมกาล (Genesis Awakening) | ultimate | II | - | {kind:self} | 90s | 60 | 0s | 0.6s | {kind:heal,pct:0.3,statMult:1,radius:5}<br>{kind:buff,duration:12,statsPct:{patk:0.2,matk:0.2},stats:{healPower:0.5}} | 0.5 | burst ก่อนใช้ หรือรอให้หมดเวลา |
| genesis_thousand_thorn_forest | ป่าพันหนาม (Thousand Thorn Forest) | ultimate | III | 0.45×weapon+4 | {kind:self} | 70s | 55 | 0.5s | 0.6s | {kind:zone,radius:5,forward:3,duration:6,tick:0.5,follow:false}<br>{kind:root,duration:0.5}<br>{kind:dot,dpsMult:0.1,duration:2,label:poison} | 0.5 | ร่าย 0.5 วิ — ออกจากพื้นที่ |
| genesis_life_miracle | ปาฏิหาริย์แห่งชีวิต (Life Miracle) | ultimate | III | - | {kind:self} | 150s | 60 | 0s | 0.6s | {kind:heal,pct:1,statMult:0,radius:5}<br>{kind:cheat_death,duration:30,hpPct:0.4} | 0.5 | บีบให้ใช้ก่อน แล้วโจมตีสองระลอก |

| Passive ID | ชื่อ | ปลด | ผล |
|---|---|---|---|
| genesis_nature_blessing | พรแห่งธรรมชาติ (Nature Blessing) | I | พลังรักษา +15% |
| genesis_regeneration | ฟื้นฟูตนเอง (Regeneration) | I | ฟื้น HP 1% ต่อวินาทีแม้ในการต่อสู้ |
| genesis_poison_mastery | ปรมาจารย์พิษ (Poison Mastery) | II | ดาเมจพิษ +30% |
| genesis_guardian_bond | พันธะผู้พิทักษ์ (Guardian Bond) | III | ดาเมจสัตว์อัญเชิญ +30% |
| genesis_life_energy | พลังชีวิต (Life Energy) | III | HP +8%, Energy +10 |
