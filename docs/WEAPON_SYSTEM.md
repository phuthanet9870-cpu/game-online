# WEAPON_SYSTEM

ไม่มีระบบคลาส บทบาทในการต่อสู้มาจากอาวุธที่ถืออยู่ เปลี่ยนอาวุธได้เฉพาะใน Safe Zone (เซิร์ฟเวอร์บังคับ GM ข้ามได้)

| อาวุธ | บทบาท | สถานะ |
|---|---|---|
| Sword ดาบ | ประชิด + ป้องกัน | **Functional** |
| Staff คทา | เวทระยะกลาง + สนับสนุน | **Functional** |
| Dagger มีดสั้น | เร็ว ลอบโจมตี: Shadow Step, Double Fang, Backstab | Designed |
| Bow ธนู | ระยะไกล: Triple Shot, Piercing Arrow, Evasive Shot | Designed |
| Grimoire สมุดเวท | กับดัก/ควบคุมพื้นที่: Rune Trap, Binding Script, Mana Burst | Designed |
| Gauntlet ถุงมือ | หมัด ทำลายการป้องกัน: Rapid Fist, Meteor Punch, Iron Body | Designed |

อาวุธทุกชนิดมี Normal (คอมโบ), Heavy, Dodge, Defensive, 3 Weapon Skills และ Weapon Mastery

## สเปกเชิงเทคนิค (สร้างจาก `src/shared/config/weapons.ts`)
ฟิลด์ตาม PART 5.7: ID, ชื่อ, คำอธิบาย (ใน config), Type, Element, Weapon, Unlock, Damage formula, Target, Range/Area (Shape), Cooldown, Energy, Cast, Animation, Effects/Duration, PvP×, PvE×, VFX/SFX, Server validation (`COMMON_VALIDATION` + เฉพาะสกิล), Upgrade scaling

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


## Weapon Mastery
- XP: +1 ต่อ hit, +4 ต่อ kill แยกต่อประเภทอาวุธและบันทึกถาวร
- เลเวลสูงสุด 20, XP ต่อเลเวล = round(40 × (lv+1)^1.6)
- โบนัส: +1% ดาเมจต่อเลเวล
- ยังไม่ทำ: Proficiency Traits, combo variants และ visual effects ของ mastery (M2)
