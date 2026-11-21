# WEAPON_OPTIONS (Random Options + Reforge)

สถานะ: **Designed** (`RARITY_INFO.optionSlots` 1–6 มีใน config แล้ว)

## Pools
- Offensive: ATK%, Magic ATK%, Crit Rate, Crit Damage, Attack Speed, Armor Pen
- Defensive: Max HP%, PDEF, MDEF, Damage Reduction, CC Resist
- Power: Fire/Dark/Ice/Lightning Damage%, Nature Healing%, Gravity Skill Efficiency
- Special: CDR, Energy Recovery, Skill Range, Boss Damage, Life Steal, PvP DR

แต่ละ option มี `weight`, `min/max` ต่อ tier ของ ilvl, `allowedCategories` และกฎ "ห้ามซ้ำในชิ้นเดียวกัน"

## Reforge
ค่าใช้จ่ายเมื่อล็อก 0/1/2/3/4 ช่อง = 1/3/7/15/30 Reforge Stone และห้ามล็อกครบทุกช่อง
ขั้นตอน: เซิร์ฟเวอร์สุ่มผลลัพธ์ใหม่ (server RNG) แล้วเก็บไว้เป็น *pending* (Preview) → ผู้เล่นกดยืนยันว่าจะรับผลใหม่หรือเก็บผลเดิม → เขียนลง `reforge_history`
stat caps ถูกตรวจซ้ำหลังรวม option ทุกครั้ง
