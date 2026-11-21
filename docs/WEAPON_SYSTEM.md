# WEAPON_SYSTEM

ไม่มีระบบคลาส บทบาทในการต่อสู้มาจากอาวุธที่ถืออยู่ เปลี่ยนอาวุธได้เฉพาะใน Safe Zone (เซิร์ฟเวอร์บังคับ GM ข้ามได้)

| อาวุธ | บทบาท | สถานะ |
|---|---|---|
| Sword ดาบ | ประชิด + ป้องกัน | **Tested** |
| Staff คทา | เวทระยะกลาง + สนับสนุน | **Tested** |
| Dagger มีดสั้น | เร็ว ลอบโจมตี (คอมโบ 4, backstab, วาร์ปหลังเป้า) | **Tested** |
| Bow ธนู | ระยะไกล (กระสุนพัด, ทะลุ, ถอยยิง+slow) | **Tested** |
| Grimoire สมุดเวท | กับดัก/ควบคุมพื้นที่ (ระเบิดข้างหน้า 3 ช่อง, trap+root, stun) | **Tested** |
| Gauntlet ถุงมือ | หมัด (คอมโบ 4, หมัดรัว 5 hit, พุ่งกระแทก, กายเหล็ก DR 40% + super armor) | **Tested** |

อาวุธทุกชนิดมี Normal (คอมโบ), Heavy, Dodge, Defensive, 3 Weapon Skills และ Weapon Mastery

## สเปกเชิงเทคนิค (สร้างจาก `src/shared/config/weapons.ts`)
ฟิลด์ตาม PART 5.7: ID, ชื่อ, คำอธิบาย (ใน config), Type, Element, Weapon, Unlock, Damage formula, Target, Range/Area (Shape), Cooldown, Energy, Cast, Animation, Effects/Duration, PvP×, PvE×, VFX/SFX, Server validation (`COMMON_VALIDATION` + เฉพาะสกิล), Upgrade scaling

Effect engine (ใช้ร่วมกับ The Power): damage shapes arc/circle/line/projectile/self, stun, root, slow, knockback, dash, backdash, blink_behind, backstab, multi-hit, spread, trap, shield, buff_dr/super armor, counter

#### Sword (ดาบ)

| Skill ID | ชื่อ | Type | Element | Unlock | Damage | Shape | CD | Energy | Stamina | Cast | Anim | Effects | PvP× | PvE× | VFX/SFX | Upgrade |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| sword_normal | ฟัน (Slash) | normal | none | 1 | 1×patk+0 | {kind:arc,range:1.7,arcDeg:110} | 0.5s | 0 | 0 | 0s | 0.3s | - | 1 | 1 | slash_arc/sword_swing | +0%/lv max 0 |
| sword_heavy | ฟันหนัก (Cleave) | heavy | none | 1 | 2.2×patk+0 | {kind:arc,range:2,arcDeg:150} | 1.4s | 0 | 22 | 0.35s | 0.6s | {kind:knockback,distance:1.2} | 1 | 1 | cleave_arc/sword_heavy | +0%/lv max 0 |
| sword_blade_rush | พุ่งฟัน (Blade Rush) | weapon_skill | none | 1 | 1.6×patk+10 | {kind:line,length:4,width:1.1} | 6s | 15 | 0 | 0s | 0.3s | {kind:dash,distance:4,duration:0.22} | 0.8 | 1 | rush_trail/sword_rush | +5%/lv max 10 |
| sword_rising_slash | ฟันเสยลอย (Rising Slash) | weapon_skill | none | 1 | 1.4×patk+8 | {kind:arc,range:1.9,arcDeg:120} | 8s | 20 | 0 | 0.12s | 0.45s | {kind:stun,duration:0.9} | 0.8 | 1 | rising_arc/sword_rise | +5%/lv max 10 |
| sword_guard_counter | ตั้งรับสวนกลับ (Guard Counter) | weapon_skill | none | 1 | 2.4×patk+15 | {kind:self} | 10s | 15 | 0 | 0s | 0.9s | {kind:counter,window:0.9,damageMult:2.4,range:2.6,stunDuration:0.6} | 0.7 | 1 | guard_flash/sword_parry | +5%/lv max 10 |

#### Staff (คทา)

| Skill ID | ชื่อ | Type | Element | Unlock | Damage | Shape | CD | Energy | Stamina | Cast | Anim | Effects | PvP× | PvE× | VFX/SFX | Upgrade |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| staff_normal | ลูกแก้วมานา (Mana Orb) | normal | arcane | 1 | 0.9×matk+0 | {kind:projectile,speed:11,range:7,radius:0.35,pierce:false} | 0.6s | 0 | 0 | 0s | 0.3s | - | 1 | 1 | orb_small/staff_cast | +0%/lv max 0 |
| staff_heavy | ลูกแก้วชาร์จ (Charged Orb) | heavy | arcane | 1 | 1.9×matk+0 | {kind:projectile,speed:9,range:8,radius:0.55,pierce:true} | 1.6s | 0 | 20 | 0.4s | 0.6s | - | 1 | 1 | orb_large/staff_heavy | +0%/lv max 0 |
| staff_arcane_bolt | กระสุนเวท (Arcane Bolt) | weapon_skill | arcane | 1 | 1.7×matk+10 | {kind:projectile,speed:16,range:9,radius:0.4,pierce:false} | 2.5s | 10 | 0 | 0s | 0.3s | - | 0.85 | 1 | arcane_bolt/staff_bolt | +5%/lv max 10 |
| staff_mana_wave | คลื่นมานา (Mana Wave) | weapon_skill | arcane | 1 | 1.1×matk+6 | {kind:circle,radius:2.6,forward:0} | 9s | 25 | 0 | 0.15s | 0.45s | {kind:knockback,distance:2.2} | 0.8 | 1 | mana_wave/staff_wave | +5%/lv max 10 |
| staff_mystic_barrier | เกราะเวท (Mystic Barrier) | weapon_skill | arcane | 1 | - | {kind:self} | 15s | 30 | 0 | 0s | 0.3s | {kind:shield,hpFraction:0.15,stat:matk,statMult:1.5,duration:5} | 0.7 | 1 | barrier/staff_barrier | +5%/lv max 10 |

#### Dagger (มีดสั้น)

| Skill ID | ชื่อ | Type | Element | Unlock | Damage | Shape | CD | Energy | Stamina | Cast | Anim | Effects | PvP× | PvE× | VFX/SFX | Upgrade |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| dagger_normal | แทง (Stab) | normal | none | 1 | 0.72×patk+0 | {kind:arc,range:1.35,arcDeg:80} | 0.32s | 0 | 0 | 0s | 0.2s | {kind:backstab,mult:1.3} | 1 | 1 | stab/dagger_stab | +0%/lv max 0 |
| dagger_heavy | ปาดลึก (Gut Slice) | heavy | none | 1 | 1.7×patk+0 | {kind:arc,range:1.5,arcDeg:100} | 1.1s | 0 | 18 | 0.2s | 0.4s | {kind:backstab,mult:1.5} | 1 | 1 | slash_arc/dagger_heavy | +0%/lv max 0 |
| dagger_shadow_step | ก้าวเงา (Shadow Step) | weapon_skill | none | 1 | 1.3×patk+8 | {kind:arc,range:1.5,arcDeg:120} | 7s | 15 | 0 | 0s | 0.25s | {kind:blink_behind,range:5,coneDeg:70}<br>{kind:backstab,mult:1.3} | 0.75 | 1 | shadow_step/dagger_blink | +5%/lv max 10 |
| dagger_double_fang | เขี้ยวคู่ (Double Fang) | weapon_skill | none | 1 | 1.05×patk+5 | {kind:arc,range:1.5,arcDeg:90} | 4s | 12 | 0 | 0s | 0.3s | {kind:multi,hits:2}<br>{kind:backstab,mult:1.3} | 0.8 | 1 | double_fang/dagger_double | +5%/lv max 10 |
| dagger_backstab | แทงข้างหลัง (Backstab) | weapon_skill | none | 1 | 1.6×patk+10 | {kind:arc,range:1.4,arcDeg:70} | 9s | 20 | 0 | 0.1s | 0.35s | {kind:backstab,mult:2.2} | 0.7 | 1 | backstab/dagger_backstab | +5%/lv max 10 |

#### Bow (ธนู)

| Skill ID | ชื่อ | Type | Element | Unlock | Damage | Shape | CD | Energy | Stamina | Cast | Anim | Effects | PvP× | PvE× | VFX/SFX | Upgrade |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| bow_normal | ยิงธนู (Arrow) | normal | none | 1 | 0.85×patk+0 | {kind:projectile,speed:17,range:9,radius:0.25,pierce:false} | 0.62s | 0 | 0 | 0s | 0.3s | - | 1 | 1 | arrow/bow_shot | +0%/lv max 0 |
| bow_heavy | ยิงเต็มแรง (Power Shot) | heavy | none | 1 | 1.9×patk+0 | {kind:projectile,speed:22,range:11,radius:0.3,pierce:true} | 1.6s | 0 | 20 | 0.45s | 0.6s | {kind:knockback,distance:0.8} | 1 | 1 | arrow_heavy/bow_heavy | +0%/lv max 0 |
| bow_triple_shot | ยิงสามดอก (Triple Shot) | weapon_skill | none | 1 | 1×patk+6 | {kind:projectile,speed:17,range:8,radius:0.25,pierce:false} | 5s | 15 | 0 | 0s | 0.35s | {kind:spread,count:3,angleDeg:30} | 0.75 | 1 | arrow/bow_triple | +5%/lv max 10 |
| bow_piercing_arrow | ศรทะลวง (Piercing Arrow) | weapon_skill | none | 1 | 1.8×patk+12 | {kind:projectile,speed:26,range:12,radius:0.35,pierce:true} | 8s | 20 | 0 | 0.25s | 0.45s | - | 0.8 | 1 | arrow_pierce/bow_pierce | +5%/lv max 10 |
| bow_evasive_shot | ถอยยิง (Evasive Shot) | weapon_skill | none | 1 | 1.2×patk+8 | {kind:projectile,speed:18,range:9,radius:0.3,pierce:false} | 9s | 15 | 0 | 0s | 0.3s | {kind:backdash,distance:3,duration:0.2}<br>{kind:slow,mult:0.55,duration:2.5} | 0.8 | 1 | arrow/bow_evasive | +5%/lv max 10 |

#### Grimoire (สมุดเวท)

| Skill ID | ชื่อ | Type | Element | Unlock | Damage | Shape | CD | Energy | Stamina | Cast | Anim | Effects | PvP× | PvE× | VFX/SFX | Upgrade |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| grimoire_normal | อักขระเวท (Glyph) | normal | arcane | 1 | 0.85×matk+0 | {kind:circle,radius:1,forward:3} | 0.75s | 0 | 0 | 0s | 0.35s | - | 1 | 1 | glyph/grim_cast | +0%/lv max 0 |
| grimoire_heavy | ผนึกระเบิด (Seal Blast) | heavy | arcane | 1 | 1.7×matk+0 | {kind:circle,radius:1.8,forward:3.5} | 1.8s | 0 | 18 | 0.5s | 0.6s | {kind:slow,mult:0.6,duration:2} | 1 | 1 | seal_blast/grim_heavy | +0%/lv max 0 |
| grimoire_rune_trap | กับดักรูน (Rune Trap) | weapon_skill | arcane | 1 | 2×matk+12 | {kind:circle,radius:1.6,forward:2} | 3s | 15 | 0 | 0s | 0.3s | {kind:trap,radius:1.6,armSec:0.6,lifeSec:30,maxActive:3}<br>{kind:root,duration:2} | 0.7 | 1 | rune_trap/grim_trap | +5%/lv max 10 |
| grimoire_binding_script | อักษรผนึก (Binding Script) | weapon_skill | arcane | 1 | 1.2×matk+6 | {kind:projectile,speed:12,range:8,radius:0.4,pierce:false} | 10s | 20 | 0 | 0.2s | 0.4s | {kind:stun,duration:1.5} | 0.7 | 1 | binding/grim_bind | +5%/lv max 10 |
| grimoire_mana_burst | ระเบิดมานา (Mana Burst) | weapon_skill | arcane | 1 | 2.4×matk+15 | {kind:circle,radius:2.6,forward:4.5} | 11s | 30 | 0 | 0.6s | 0.7s | {kind:knockback,distance:1} | 0.75 | 1 | mana_burst/grim_burst | +5%/lv max 10 |

#### Gauntlet (ถุงมือ)

| Skill ID | ชื่อ | Type | Element | Unlock | Damage | Shape | CD | Energy | Stamina | Cast | Anim | Effects | PvP× | PvE× | VFX/SFX | Upgrade |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| gauntlet_normal | หมัดตรง (Jab) | normal | none | 1 | 0.8×patk+0 | {kind:arc,range:1.3,arcDeg:70} | 0.38s | 0 | 0 | 0s | 0.22s | - | 1 | 1 | punch/gauntlet_jab | +0%/lv max 0 |
| gauntlet_heavy | หมัดเหวี่ยง (Haymaker) | heavy | none | 1 | 2.1×patk+0 | {kind:arc,range:1.5,arcDeg:110} | 1.3s | 0 | 22 | 0.3s | 0.55s | {kind:knockback,distance:1.8} | 1 | 1 | cleave_arc/gauntlet_heavy | +0%/lv max 0 |
| gauntlet_rapid_fist | หมัดรัว (Rapid Fist) | weapon_skill | none | 1 | 0.55×patk+3 | {kind:arc,range:1.45,arcDeg:90} | 6s | 15 | 0 | 0s | 0.6s | {kind:multi,hits:5} | 0.75 | 1 | rapid_fist/gauntlet_rapid | +5%/lv max 10 |
| gauntlet_meteor_punch | หมัดอุกกาบาต (Meteor Punch) | weapon_skill | none | 1 | 2×patk+14 | {kind:line,length:3.5,width:1.4} | 9s | 22 | 0 | 0s | 0.35s | {kind:dash,distance:3.5,duration:0.2}<br>{kind:stun,duration:0.8}<br>{kind:knockback,distance:1.5} | 0.75 | 1 | meteor_punch/gauntlet_meteor | +5%/lv max 10 |
| gauntlet_iron_body | กายเหล็ก (Iron Body) | weapon_skill | none | 1 | - | {kind:self} | 16s | 25 | 0 | 0s | 0.3s | {kind:buff_dr,amount:0.4,duration:4,superArmor:true} | 0.7 | 1 | iron_body/gauntlet_iron | +0%/lv max 10 |


## Weapon Mastery
- XP: +1 ต่อ hit, +4 ต่อ kill แยกต่อประเภทอาวุธและบันทึกถาวร
- เลเวลสูงสุด 20, XP ต่อเลเวล = round(40 × (lv+1)^1.6)
- โบนัส: +1% ดาเมจต่อเลเวล
- ยังไม่ทำ: Proficiency Traits, combo variants และ visual effects ของ mastery (M2)
