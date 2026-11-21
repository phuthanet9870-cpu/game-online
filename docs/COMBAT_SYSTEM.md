# COMBAT_SYSTEM

สถานะ: **Tested** (PvE) · PvP ยังไม่ทำ แต่ตัวคูณ PvP มีอยู่ใน config และสูตรแล้ว

## Action ของผู้เล่น
| Action | ปุ่ม | กติกา (เซิร์ฟเวอร์ตรวจ) |
|---|---|---|
| Normal | LMB (กดค้าง) | cooldown = base / attackSpeed, คอมโบ 3 จังหวะ ตีที่ 3 ได้ ×finisher (ดาบ 1.5, คทา 1.4) |
| Heavy | RMB | ใช้ stamina, มี cast time (โดน stun ระหว่างร่ายจะถูกขัด) |
| Dodge | Space | stamina 30–32, i-frame 0.20–0.22s, cooldown 0.5s, ต้องมีทิศทาง |
| Block / Mana Guard | Shift | ดาบ: ลด 60% เฉพาะด้านหน้า 140° ใช้ stamina/s · คทา: ลด 45% รอบทิศ ใช้ energy/s |
| Weapon skills | 1–3 | ดู WEAPON_SYSTEM.md |

ลำดับการตรวจ: ยังมีชีวิต → ไม่ติด root/force/dodge → action lock หมดแล้ว → อาวุธตรง → เลเวลถึง → cooldown → energy/stamina → aim ไม่เป็นศูนย์

## สูตรดาเมจ (`shared/combat.ts`)
```
hit   = rng < clamp(accuracy - evasion, minHitChance 0.6, 1)
raw   = atk × mult + flat, × U(0.92, 1.08)
crit  = rng < critRate → × critDmg
mitig = K / (K + max(0, def × (1 - armorPen)))      K = 120
elem  = × (1 - clamp(resist[element], -1, 0.9))
pvp   = × 0.55 และ DR += pvpDR
final = × (1 - min(0.75, damageReduction))          shield ดูดซับก่อนหัก HP
```
caps: critRate 60%, critDmg 300%, cdr 40%, evasion 35%, armorPen 50%, ccRes 60%, pvpDR 40%, atkSpd 1.8, moveSpeed 6.5

## Hit detection
- รูปทรง `arc`, `circle`, `line`, `projectile`, `self` ตรวจด้วยตำแหน่งบนเซิร์ฟเวอร์ ถ้า resolve ทันทีจะ rewind ตาม `vt`
- Projectile จำลองบนเซิร์ฟเวอร์ แบ่ง sub-step ทุก 0.3 ช่อง ชนกำแพงแล้วหาย ตั้งค่า pierce ได้
- Dash (Blade Rush) ตรวจการชนก่อน แล้วเส้นโจมตียาวเท่าระยะที่เคลื่อนได้จริง

## Status effects
Stun (มอนสเตอร์ elite รับ 40%), Knockback (elite รับ 30%), Slow, Shield, Counter window, i-frames ส่วน Freeze/Root/Silence/Pull/Super Armor ใช้ schema เดียวกันแต่ยังไม่ได้ทำ (มากับ The Power)
ระยะเวลา CC ต่อผู้เล่นคูณด้วย `(1 - ccRes)` ส่วน diminishing returns ใน PvP: **ยังไม่ทำ** (ต้องทำก่อน M7)

## มอนสเตอร์
ทุกการโจมตีมี windup + telegraph (วงสีแดงบนพื้น) และ resolve ตอนสิ้นสุด windup ด้วยตำแหน่ง ณ ตอนนั้น ผู้เล่นจึงหลบได้ด้วยการเดินออกหรือ dodge
