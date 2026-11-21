# THE POWER: ECLIPSE — MASTER PROMPT & COMPLETE GAME SPECIFICATION

> **เอกสารหลักสำหรับ AI Coding Agent / Claude Code / Codex**  
> Document ID: `TPE-MASTER-PROMPT`  
> Version: `5.1` | Language: Thai (identifiers and code in English)  
> Status: **Design specification; not a claim of implementation**  
> Main delivery: **8 development phases; first playable MVP in Phase 4**  
> Last design consolidation: 2026-11-21

---

# 0. คำสั่งหลักสำหรับ AI ผู้รับงาน (EXECUTION CONTRACT)

คุณทำหน้าที่เป็นทีมพัฒนาเกมระดับมืออาชีพ ประกอบด้วย Game Director, Game Designer, MMORPG Technical Director, Network/Backend Engineer, Godot Gameplay Engineer, Pixel-Art Technical Artist, UI/UX Designer, Combat Designer, Economy Designer, Database Architect, QA Engineer, Security Engineer, LiveOps และ DevOps Engineer ให้ร่วมกันออกแบบและลงมือสร้าง **THE POWER: ECLIPSE** เกม MMORPG แบบ 2D Pixel Art มุมมอง Top-down/3⁄4 ที่เน้น Action Combat, The Power, PvE, Auto Farming, PvP และ Guild War

**คำสั่งการทำงาน:** ตรวจสอบ repository และโค้ดปัจจุบันก่อนเสมอ; เทียบกับกฎ LOCKED ในเอกสารนี้; ระบุ Phase ปัจจุบัน; เลือก Task ที่เล็กที่สุดที่สร้างผลลัพธ์ทดสอบได้; ออกแบบข้อมูลและ API; ลงมือแก้โค้ดจริง; รันทดสอบ; แสดงผลที่เกิดขึ้นจริง; อัปเดตเอกสารและสถานะงาน จากนั้นทำงานถัดไปตาม Phase โดยไม่อ้างว่าเสร็จทั้งระบบถ้ายังเป็นเพียง mockup

**ห้าม:** เปลี่ยนกฎล็อกเอง, เอา logic ความเสียหาย/ไอเทมไปตัดสินที่ client, ให้ข้อความ `/gmstefanonline` กลายเป็นรหัสยกระดับสิทธิ์, อ้างว่ารันหรือผ่านทดสอบทั้งที่ไม่ได้รัน, เขียน code ซ้ำโดยไม่ตรวจของเดิม, ออกแบบเพียง UI ที่ไม่มี backend แล้วบอกว่าฟีเจอร์เสร็จ, หรือแก้สถานะเศรษฐกิจแบบไม่มี transaction log

**ลำดับแหล่งความจริง:** (1) ข้อความยืนยันใหม่ที่สุดจากเจ้าของโปรเจกต์ (2) `docs/GAME_RULES.md` ที่บันทึกกฎ LOCKED ตามเอกสารนี้ (3) Master Prompt นี้ (4) รายละเอียดเสนอและ config สำหรับการทดสอบ (5) โค้ดเดิม หากขัดกันต้องระบุ conflict และเสนอ migration ไม่ใช่เปลี่ยนกฎเงียบ ๆ

**สถานะค่าทุกค่า:**
- `[LOCKED]` เป็นกฎที่เจ้าของเกมระบุและยืนยันแล้ว
- `[DESIGN]` เป็นแบบระบบที่ตกผลึกสำหรับใช้ทำงาน แต่ปรับได้เมื่อพบข้อจำกัด
- `[PROPOSED]` เป็นข้อเสนอหรือขอบเขตการผลิตที่ยังไม่ยืนยัน
- `[TUNING]` เป็นค่าทดลอง ต้องผ่าน playtest/telemetry
- `[IMPLEMENTED]` ใช้ได้เมื่อมีโค้ดและผลทดสอบใน repository จริงเท่านั้น

เมื่อข้อมูลยังไม่ครบ ให้เลือกค่าเริ่มต้นที่ปลอดภัย กำหนดใน config พร้อม `TODO: BALANCE` และบันทึกใน `docs/DECISIONS.md`; อย่าสร้างข้ออ้างว่าผู้ใช้เคยยืนยันค่าดังกล่าว

---

# 1. ภาพรวมเกมและเสาหลัก (GAME VISION)

- **ชื่อเกม:** THE POWER: ECLIPSE
- **Genre:** Online MMORPG / Action RPG / Open World PvE / PvP / Guild War / Auto Farm
- **ศิลปะ:** 2D Pixel Art สีและแสงแฟนตาซี มุมมอง top-down หรือ 3/4, animation อ่านง่าย, เอฟเฟกต์โจมตีคมชัด ไม่กลบ hit telegraph
- **การควบคุม:** เคลื่อนที่ 8 ทิศ, real-time action, hotbar 20 ช่องเรียง 2×10, ตั้ง keybind ได้
- **Core differentiation:** ไม่มีคลาส; บิลด์เกิดจากอาวุธ + The Power + ชุดอุปกรณ์; The Power ที่ดรอป/คราฟได้เพิ่มต่อเนื่อง และต้องเปิด Activate เพื่อใช้สกิล
- **วงจรการเล่น:** สร้างตัวละคร → เลือกอาวุธฟรี → เควสต์/ฟาร์ม → ได้ EXP + Gold + Trade Loot + วัตถุดิบ → ซื้อขาย/คราฟ → หา The Power → ผูก/ฝึก/เปิดใช้ → ลงดันเจี้ยนผ่าน NPC → ตามหาวงแดง World Boss ในแมพฟาร์ม → ทำพิธีบอส → พัฒนาบิลด์ → PvP / Guild War → Season → Update
- **หลักออกแบบ:** Combat first, server authoritative, fair competitive play, player-friendly economy, expansion-ready content, no pay-to-win
- **หลักการจัดส่ง:** Prototype ก่อน MMORPG ทั้งโลก; 8 phases โดย First Playable MVP อยู่ Phase 4; เปิดเกมต่อเมื่อมี monitoring, backup, anti-dup และ abuse controls

---

# 2. กฎล็อกสูงสุด (NON-NEGOTIABLE RULES)

1. `[LOCKED]` เกมไม่มีระบบ Class อาชีพต่อสู้; บิลด์มาจากอาวุธ/พลัง/อุปกรณ์
2. `[LOCKED]` อาวุธ 6 ประเภท: **Staff, Sword, Dagger, Bow, Grimoire, Gauntlet**; เริ่มเกมเลือกอาวุธฟรี 1 ชนิด
3. `[LOCKED]` อาวุธแต่ละชนิดมี **3 สกิล Active** เป็นชุดประจำชนิด (รวม 18 สกิลอาวุธ)
4. `[LOCKED]` The Power เป็นไอเทม หาได้จากมอนสเตอร์/บอส หรือการคราฟ; ในตัวละครผูกได้ครั้งละ **1 ผล**
5. `[LOCKED]` Power แต่ละผลมี **15 Active + 5 Ultimate + 5 Passive = 25 สกิล**
6. `[LOCKED]` โหลดเอาต์สวม **5 Active + 1 Ultimate + 2 Passive**; ต้อง `Activate The Power` ก่อนใช้สกิลพลัง
7. `[LOCKED]` บางผลจำกัดชนิดอาวุธ; ต้อง validate ทุกครั้งที่เปลี่ยนอาวุธ/กดใช้สกิล
8. `[LOCKED]` **ห้ามมี Power Awakening หรือ Power Evolution**; Proficiency ปลดการเข้าถึงสกิลเดิมเท่านั้น
9. `[LOCKED]` เปลี่ยนพลังโดยไปหา NPC ทำพิธี Unbind; พลังผลเก่าถูกทำลายและไม่คืน item เดิม; หากต้องการผลเดิมอีกต้องหาผลใหม่
10. `[LOCKED]` เพิ่ม The Power ใหม่ได้อย่างต่อเนื่องผ่านการอัปเดต โดยใช้ข้อมูลแบบขยายได้
11. `[LOCKED]` Hotbar **20 ช่อง** ต้องเห็นครบ และให้ผู้เล่นจัดเรียงได้
12. `[LOCKED]` แผนที่โลกหลัก **32 แมพเท่านั้น = 30 แมพฟาร์ม + 2 เมือง**
13. `[LOCKED]` World Boss **ทุกตัว** มี **แมพเฉพาะตัว** แยกและไม่นับใน 32 แมพ
14. `[LOCKED]` ทางเข้า World Boss เป็น **วงเวทสีแดงแบบสุ่ม** ปรากฏตาม **30 แมพฟาร์ม**; ไม่เกิดในเมือง
15. `[LOCKED]` ต้องมีวัตถุดิบและกลไกพิธีเรียก World Boss เฉพาะแต่ละตัว
16. `[LOCKED]` Dungeon ทุกชนิดมีแมพแยกจาก 32 แมพ และ **เข้าได้โดยคุย Dungeon Gatekeeper NPC ที่ยืนคุมประตูในเมืองหลักเท่านั้น**; ไม่สุ่มประตูดันเจี้ยนตามแมพฟาร์ม
17. `[LOCKED]` มี Auto Farm/Attack/Skill/Loot/Potion; Auto Combat ห้ามเล่น PvP/Guild War แทนผู้เล่น
18. `[LOCKED]` มี PvP, Guild War, Territory Conflict; 30v30 เป็นรูปแบบ Guild War เป้าหมาย
19. `[LOCKED]` Admin/GM HUD เปิดด้วยข้อความแชต **`/gmstefanonline`** แต่ผู้ใช้ต้องมีสิทธิ์ที่ตรวจสอบจาก server ก่อนเสมอ
20. `[LOCKED]` Owner/Admin จัดการระบบเกม เสกไอเทม มอนสเตอร์ ชุด อาวุธ Max Stats และสร้าง Admin-exclusive items ผ่าน HUD ได้ตามสิทธิ์
21. `[LOCKED/DESIGN TARGET]` Item Catalog รุ่นแรก **1,350 ชนิด (มากกว่า 1,000)** ตามผังจำนวนใน §12 โดยแต่ละ Item Template มี ID ไม่ซ้ำ
22. `[LOCKED]` Trade Loot สำหรับขาย NPC หา Gold มีอย่างน้อยตามเป้าหมาย **360 ชนิด / 12 ชนิดต่อแมพฟาร์ม**
23. `[DESIGN]` GM-exclusive/test items ห้ามแลกเปลี่ยนเข้า economy ของผู้เล่นและห้ามใช้ใน Ranked/สงครามจัดอันดับ
24. `[DESIGN]` ทุกสถานะที่มีผลต่อเงิน ของ ดาเมจ และอันดับให้เซิร์ฟเวอร์เป็น authority

---

# 3. สถานะสิ่งที่ยังเป็นการตัดสินใจเชิงออกแบบ

- `[DESIGN]` Level cap 100; 6 base stats; Weapon Mastery 1–50; Power Proficiency 1–3
- `[DESIGN]` เมืองชื่อ Aetheria Capital และ Nocturne Citadel
- `[DESIGN]` ช่วงแมพ 01–05 Safe Farm; 06–25 Contested; 26–30 War Zone และเมือง Safe Zone (มีป้ายเตือน)
- `[PROPOSED]` เปิดตัว 8 dungeon maps: Normal 3, Abyss 2, Hidden 2, Guild Raid 1; ทั้งหมดเข้า NPC ในเมืองหลัก
- `[PROPOSED]` Inventory เริ่มต้น 40 ช่อง; 3 character slots ต่อบัญชี; enhancement +0 ถึง +10
- `[TUNING]` วงแดงเปิด 30 นาที; 10–20 spawn anchors ต่อแมพ; 10–30 คนใน World Boss instance; Guild War 30 นาที; Season 8 สัปดาห์
- `[PROPOSED]` เพิ่ม Leg Armor และ Earrings 2 ช่องจากการออกแบบ item catalog ล่าสุด; ต้องทบทวน stat budgets รวม
- `[PROPOSED]` 8 Phases, First Playable MVP ที่ Phase 4, Closed Beta Phase 7, Launch Phase 8

---

# 4. ระบบบัญชีและตัวละคร (ACCOUNT / CHARACTER)

## 4.1 บัญชี
- สมัคร/เข้าสู่ระบบ/ออกจากระบบ; secure password hashing หรือ provider auth, session revocation, rate limit, credential recovery
- แยก Account ID, Character ID, Session ID, GM Role; ตั้งสิทธิ์บน server เท่านั้น
- สร้าง/เลือก/ลบตัวละครโดยมีขั้นตอนป้องกันเผลอลบและระยะกู้คืนตามนโยบาย
- บันทึก login history, device/session metadata ตามหลักความเป็นส่วนตัวและนโยบายการเก็บข้อมูล

## 4.2 สร้างตัวละคร
- ชื่อ/รูปลักษณ์/ผม/ใบหน้า/สี/ชุดเริ่มต้น; ไม่ล็อกคลาสหรือเผ่าที่ได้โบนัสแข่งขัน
- เลือก Starter Weapon ฟรี 1 ชนิดจาก 6
- จุดเกิด Aetheria Capital; เริ่ม Level 1; tutorial สอนเดิน โจมตี หลบ Hotbar, Loot, Auto, Power Trial และ Dungeon Gatekeeper

## 4.3 เลเวลและค่าสถานะ
- `[DESIGN]` Level 1–100; EXP จากเควสต์ PvE และกิจกรรม; curve แยก config
- Main Stats: STR, DEX, INT, VIT, AGI, WIS
- Secondary Stats: HP, Physical/Magic Attack, Physical/Magic Defense, Accuracy, Evasion (ถ้าทดสอบผ่าน), Crit Chance/Damage, Attack Speed, Movement Speed, Stamina/Recovery, Power Energy/Recovery, Cooldown Reduction, Resistances, CC Resistance
- สร้างสูตร `StatCalculationService` deterministic, server-side, แยก primary/secondary; มี caps/soft caps ที่ปรับได้; UI อธิบายทุกค่า
- Level Up แจก stat points ตาม curve; NPC Stat Reset และ preset ไม่ยอมเปลี่ยน power bound โดยพลการ
- Weapon Mastery แยก 6 ชนิดสูงสุด 50 `[DESIGN]`; เน้นความชำนาญ/ท้าทาย/appearance มากกว่าโบนัสสะสมข้ามอาวุธ
- Respawn/PvE death penalties ระบุใน config; **PvP death ไม่ทำไอเทม/The Power หล่น**
- ออกจากเกมแล้วข้อมูล progression/ตำแหน่ง/ไอเทมต้องคงอยู่; reconnect และการหลุดระหว่างต่อสู้มี grace rules ป้องกัน combat logout

## 4.4 Character State Machine
`CREATED → IN_WORLD → IN_COMBAT → DEAD → RESPAWNING → IN_WORLD` และ `DISCONNECTING/RECONNECTING`; ไม่นับ status animation เป็น authority ของชีวิตตัวละคร

---

# 5. การเคลื่อนไหว กล้อง ภาพ และระบบต่อสู้

## 5.1 Character Controller
- เดิน 8 ทิศ; spritesheet `Idle/Walk/Attack/Hit/Death` และทิศที่ต้องรองรับทั้งหมด; animation blending ตามความสามารถของ asset
- กล้องตามตัว; pixel snap/nearest filtering ตาม style; collision layers, walls, NPC, triggers, interactables
- Dodge/Dash ใช้ Stamina, มี cooldown และระยะทางที่ปรับได้; ตรวจ wall collision และ abuse
- Input Remapping; gamepad support เป็นส่วนขยาย; keyboard/mouse เป้าหมายต้นแบบ

## 5.2 Combat Engine
- Basic Attack, 3 weapon skills, 5 equipped Power active, 1 Power ultimate, 2 equipped Power passive
- Combat state: idle, windup, active, recovery, casting, moving, CC, disabled, death
- Hitbox/Hurtbox, melee arcs, projectiles, AoE, cone, line, ground-target, self-buff, friendly-target
- Damage pipeline: base damage → weapon coefficient → stat scaling → skill modifier → target defense/resistance → critical → PvE/PvP modifier → mitigation/absorb → final clamped damage
- Status: Burn, Poison, Slow, Root, Stun, Freeze, Silence, Knockback, Mark, Shield, Heal, Reveal, Stealth; stacking priority and CC diminishing returns
- Buff/Debuff definitions: category, max stacks, duration, dispel rules, source, stacking restrictions
- Cooldown/Global Cooldown (if configured), Cast Time, Animation Lock, Cancel Windows, interrupts, energy checks
- Dodge/guard/counter behavior; threat/aggro in PvE; line-of-sight and range validation
- `DamageEvent`/`CombatLogEvent` from server; Death Recap with attacker, hit source, damage, mitigation, healing and timestamp
- **Anti-exploit:** server checks cooldown, animation timing, stamina, move speed, target range, line of sight, spell authorization; user client may predict cosmetic feedback but server confirms results

## 5.3 Combat Readability
- แยก VFX ตัวเอง/พวกเดียวกัน/ศัตรู; ปรับลดเอฟเฟกต์จำนวนมาก; วงเตือน AoE; ป้ายแสดงการถูก CC
- GM/QA debug overlays สำหรับ hitbox, navmesh, damage trace (เฉพาะสิทธิ์)
- Arena PvP stat normalization และ PvP tuning table เพื่อไม่ให้ของ Mythic ทำให้ผู้เล่นใหม่สู้ไม่ได้

---

# 6. ระบบอาวุธ 6 ชนิดและสกิล 18 ท่า

| Weapon | Role | Skill 1 | Skill 2 | Skill 3 |
|---|---|---|---|---|
| Staff | เวทระยะกลาง | Arcane Bolt | Magic Pulse | Mana Channel |
| Sword | ระยะประชิด/Counter | Triple Slash | Guard Break | Counter Slash |
| Dagger | ลอบโจมตี/เคลื่อนที่ | Shadow Step | Backstab | Blade Flurry |
| Bow | ยิงไกล/เว้นระยะ | Piercing Arrow | Rapid Shot | Evasive Shot |
| Grimoire | เวทสถานะ/สนับสนุน | Rune Burst | Magic Seal | Mystic Ward |
| Gauntlet | คอมโบ/ประชิด | Rising Fist | Iron Combo | Impact Smash |

- ทุกชนิดมี Basic Attack ตามชนิดอาวุธ (ไม่นับใน 3 active)
- Equipment tier เปลี่ยน Damage/Affix/รูปลักษณ์ ไม่เพิ่มสกิลพื้นฐานโดยอัตโนมัติ
- เปลี่ยนอาวุธได้ตามกฎนอก combat หรือเงื่อนไขที่กำหนด; cooldown ไม่ reset เมื่อเปลี่ยน
- ถ้า power ไม่รองรับอาวุธใหม่ ให้ deactivate Power Stance และปิดสกิลพลังที่ไม่รองรับทันทีตาม transition rules
- Data-driven: `WeaponDefinition`, `WeaponSkillDefinition`, `MasteryState`; content integrity checks

---

# 7. THE POWER — ระบบศูนย์กลาง

## 7.1 กฎและโหลดเอาต์
- 6 ผลเริ่มต้น, เพิ่มผลใหม่ได้ต่อเนื่อง
- ผลหนึ่งมี 15 Active, 5 Ultimate, 5 Passive รวม **25** สกิล
- ฝึกและเลือกใส่ **5 Active + 1 Ultimate + 2 Passive**
- Active/Ultimate ต้อง Activate Power ก่อน; Passive ใช้ตามกฎ stance ที่กำหนด (default ทำงานเมื่อผูกและเงื่อนไขการใช้งานถูกต้อง)
- **ไม่มีระบบ Power Awakening/Evolution/Transcendence ที่เปลี่ยนชนิดผล**
- Power Energy แยกจาก Stamina และใช้ในสกิลพลัง; regeneration/cooldown ต้องกำหนดเป็น config

## 7.2 อาวุธที่รองรับ
| Power | ประเภท | อาวุธที่ใช้ได้ |
|---|---|---|
| Inferno | Fire / Burn / AoE | ทั้ง 6 |
| Tempest | Lightning / Mobility / Burst | ทั้ง 6 |
| Abyss Shadow | Shadow / Stealth / Assassin | **Dagger เท่านั้น** |
| Eternal Frost | Ice / Control / Defense | Staff, Sword, Grimoire |
| Genesis | Nature / Heal / Support | ทั้ง 6 |
| Void Dominion | Void / Gravity / Space | Staff, Grimoire, Gauntlet |

## 7.3 รายชื่อสกิล 150 รายการ (OFFICIAL CONTENT INVENTORY)
> ชื่อเหล่านี้คือรายการสกิลที่ออกแบบแล้ว แต่ค่า Damage, Cooldown, อนิเมชันและเงื่อนไขยังเป็นงานแยกที่ต้องสร้าง/ทดสอบ ไม่อ้างว่าค่าบาลานซ์สมบูรณ์

### Inferno
**Active 15:** Flame Shot; Burning Slash; Fire Step; Flame Ring; Heat Wave; Lava Burst; Blazing Chain; Fire Mine; Flame Spear; Ember Rain; Magma Wall; Combustion; Phoenix Dash; Hellfire Field; Infernal Eruption.  
**Ultimate 5:** Meteor Fall; Phoenix Rebirth; Hellfire Dragon; Volcanic Cataclysm; World Ignition.  
**Passive 5:** Pyromancer; Heat Mastery; Burning Soul; Ash Guard; Last Ember.

### Tempest
**Active 15:** Lightning Bolt; Thunder Kick; Volt Dash; Static Field; Chain Lightning; Thunder Spear; Flash Strike; Overcharge; Storm Pull; Lightning Trap; Volt Counter; Thunder Crash; Arc Step; Storm Barrage; Discharge.  
**Ultimate 5:** Thunder God Descent; Heaven's Judgment; Storm Apocalypse; Lightning Overdrive; Thousand Bolts.  
**Passive 5:** Static Charge; Lightning Reflex; Volt Recovery; Chain Mastery; Storm Hunter.

### Abyss Shadow
**Active 15:** Shadow Cut; Dark Shuriken; Smoke Veil; Shadow Blink; Night Fang; Dark Clone; Silent Mark; Shadow Bind; Assassin Rush; Nightfall; Backstab Curse; Shadow Swap; Dark Needle; Execution Mark; Phantom Dance.  
**Ultimate 5:** Eternal Night; Shadow Execution; Thousand Shadows; Void Assassination; Demon Ninja.  
**Passive 5:** Silent Killer; Back Attack; Shadow Escape; Dark Instinct; Executioner.

### Eternal Frost
**Active 15:** Ice Shard; Frost Slash; Snow Step; Ice Wall; Frost Nova; Glacial Spear; Frozen Trap; Crystal Shield; Blizzard; Winter Chains; Ice Prison; Frost Wave; Crystal Lance; Permafrost; Shatter.  
**Ultimate 5:** Absolute Zero; Frozen Kingdom; Glacier Fall; Winter Guardian; Eternal Blizzard.  
**Passive 5:** Cold Blood; Frostbite; Crystal Armor; Winter's Gift; Shatter Expert.

### Genesis
**Active 15:** Vine Whip; Healing Seed; Root Trap; Thorn Shot; Nature Pulse; Bloom Shield; Poison Thorn; Vine Pull; Life Spring; Forest Step; Seed Bomb; Ancient Roots; Nature Cleanse; Thorn Barrage; Guardian Sapling.  
**Ultimate 5:** World Tree; Nature's Wrath; Forest Guardian; Rebirth Bloom; Garden of Eternity.  
**Passive 5:** Life Bloom; Regeneration; Nature's Bond; Thorn Armor; Forest Wisdom.

### Void Dominion
**Active 15:** Void Orb; Gravity Push; Void Step; Dimensional Cut; Gravity Well; Rift Trap; Spatial Swap; Abyss Spike; Null Pulse; Void Shield; Rift Walk; Gravity Crush; Void Chains; Distortion Field; Rift Collapse.  
**Ultimate 5:** Black Hole; Dimensional Prison; Reality Break; Void Catastrophe; Dominion Collapse.  
**Passive 5:** Void Affinity; Spatial Sense; Gravity Master; Rift Recovery; Null Resistance.

## 7.4 Proficiency และการปลดสกิล
| Rank | สกิล Active ที่เรียนได้ | Ultimate | Passive |
|---|---:|---:|---:|
| 1 | 5 | 1 | 1 |
| 2 | 10 | 3 | 3 |
| 3 | 15 | 5 | 5 |

- `[DESIGN]` Rank 3 คาดหวังการเล่นอย่างมีส่วนร่วมราว 6–10 ชั่วโมง เป็นค่าทดลอง ไม่ใช่คำมั่นของบาลานซ์
- Proficiency ไม่เพิ่มร่าง/สายพลัง/คุณภาพผล; การ reacquire ผลเดิมอาจเรียกคืน proficiency สูงสุดจาก Archive ตาม design rule
- Power Archive บันทึก acquired/discovered/history/mastery, Power Trial Chamber ทดลองโดยไม่สร้างไอเทมจริงและไม่มี loot

## 7.5 การผูก/ถอด Power แบบ transaction
1. ตรวจ item ผลพลังใน inventory, level/weapon restriction และ bound power slot
2. Atomic bind: consume item instance, save bound template/proficiency/loadout, audit event
3. Activate เปิด stance เมื่ออาวุธรองรับและ resource/states ถูกต้อง
4. ไปหา `NPC The Severer` ในเมืองเพื่อ Unbind; UI แสดงผลเดิมและคำเตือน **ผลพลังสูญสลายถาวร**
5. Atomic unbind: deactivate, clear bound record/loadout as appropriate, destroy previous fruit binding permanently, save audit log
6. Reacquire power ต้องใช้ fruit item ใหม่; ไม่ refund ผลเก่า
7. ห้ามสลับผลผ่าน preset โดยไม่ผ่าน NPC; ห้าม equip 2 powers

## 7.6 Power Acquisition
- ผลเต็มจาก drop table ของมอนสเตอร์/บอสที่กำหนด
- Fragment/Material crafting เป็นเส้นทางสะสมความคืบหน้า; ไม่ใช้ระบบสุ่มที่ทำให้ผู้เล่นไม่มีทางก้าวหน้า
- The Power หายาก ≠ แรงกว่าเสมอ; Power ใหม่เพิ่ม playstyle ไม่ใช่เพิ่มตัวคูณ damage เหนือของเดิม
- ให้ `PowerDefinition` เป็น data-driven เพื่อเพิ่มผลหลังเปิดเกมโดยไม่แก้ core engine

---

# 8. HOTBAR 20 ช่องและ HUD ผู้เล่น

**แสดง 2 แถว × 10 ช่อง โดยปรับตำแหน่งได้**

| ช่อง | Action เริ่มต้น | ช่อง | Action เริ่มต้น |
|---:|---|---:|---|
| 1 | Basic Attack | 11 | Activate/Deactivate The Power |
| 2 | Weapon Skill 1 | 12 | Dodge |
| 3 | Weapon Skill 2 | 13 | Guard |
| 4 | Weapon Skill 3 | 14 | HP Potion |
| 5 | Power Active 1 | 15 | Buff Item |
| 6 | Power Active 2 | 16 | Consumable |
| 7 | Power Active 3 | 17 | Utility |
| 8 | Power Active 4 | 18 | Target Mark |
| 9 | Power Active 5 | 19 | Tactical Ping |
| 10 | Power Ultimate | 20 | Emote/Quick Action |

- Passives 2 ช่อง equip แยก; hotbar item ที่เปลี่ยนต้อง validate บน server
- แสดง HP, Stamina, Power Energy, minimap, quests, buffs, target frame, combat log (ปรับแสดงได้)
- Hotbar cooldown radial, cost, keybind labels, error feedback, lock/unlock/reorder, saved presets
- รองรับ UI scale และ high-contrast; mobile layout เป็นงานแยกหากภายหลังมีเป้าหมายมือถือ; ห้ามสรุปว่าออกแบบ UI มือถือเสร็จจาก mockup PC

---

# 9. AUTO FARM / AUTO COMBAT / AUTO LOOT

## 9.1 โหมด
- `AUTO_LOOT`: เก็บ item ที่ได้รับสิทธิ์และอยู่ในระยะ
- `AUTO_SKILL`: ใช้สกิลที่ equip เมื่อเป้าหมายถูกต้องและมี resource/cooldown
- `AUTO_FARM`: เลือก target, เดินเข้าระยะ, attack/skill, heal, loot, loop ใน anchor radius
- `AUTO_NAVIGATION`: คลิกจุดหรือ NPC ให้เดินตามเส้นทางที่ปลอดภัย (ไม่ initiate dungeon/boss)

## 9.2 Settings
- เปิด/ปิด, radius `[TUNING]` 5–25 tiles, target filters, skill priority per equipped action, auto activate, potion threshold, loot categories/rarity, stop conditions, blacklist monsters
- รายงานหลังหยุด: duration, kills, EXP, Gold, acquired items, consumables used; stats จากเซิร์ฟเวอร์

## 9.3 ข้อจำกัดเด็ดขาด
- อนุญาต Auto PvE Farming ในทั้ง 30 แมพฟาร์มตามข้อจำกัด safety; ไม่เดินข้ามแมพเอง
- ไม่เปิด World Boss Portal, ไม่หา/ใช้วงแดง, ไม่ทำ ritual, ไม่ผ่าน Dungeon Gatekeeper และไม่เข้า Dungeon โดยอัตโนมัติ
- ใน Normal Dungeon อนุญาตเพียง Auto Loot (ตามการออกแบบ); dungeon combat ให้เล่นเอง; Abyss/Hidden/Guild Raid เล่นเอง
- Map Boss Auto อาจช่วย skill rotation เมื่อเจอโดยบังเอิญ แต่ **ห้ามล่าหรือวิ่งหา Map Boss อัตโนมัติ**
- ห้าม target/โจมตีผู้เล่นอัตโนมัติทุกพื้นที่ PvP; Ranked/Guild War/Territory ปิด Auto Combat
- Offline/disconnected หยุดฟาร์มตาม timeout ที่กำหนด; ไม่สร้าง offline rewards
- Server-authoritative action requests; ไม่ใช้ client bot logic เป็น authority; anomaly telemetry + abuse detection
- Auto ต้องไม่แอบลด drop rate หรือทำให้ได้โบนัสพิเศษเฉพาะผู้เติมเงินจริง

---

# 10. โลกหลัก 32 แมพ (WORLD STRUCTURE)

## 10.1 เมืองปลอดภัย 2 แห่ง
1. **Aetheria Capital** — เมืองเริ่มต้น, Quest Board, Merchants, Blacksmith, Storage, The Severer, Dungeon Gatekeeper, Crafting, Power Trial, Training Ground
2. **Nocturne Citadel** — เมืองระดับสูง, Guild Facilities, high-level craft, competitive hubs; หากมี Dungeon Gatekeeper ให้ใช้ข้อมูล Dungeon Service เดียวกัน

## 10.2 ฟาร์ม 30 แมพ แบ่ง 6 Biomes
| Map ID | Region | Map Name |
|---|---|---|
| FARM-01 | Verdant Frontier | Greenfield Plains |
| FARM-02 | Verdant Frontier | Whispering Forest |
| FARM-03 | Verdant Frontier | Wolf Fang Valley |
| FARM-04 | Verdant Frontier | Ancient Ruins |
| FARM-05 | Verdant Frontier | Fallen Temple |
| FARM-06 | Crimson Wasteland | Red Sand Desert |
| FARM-07 | Crimson Wasteland | Scorpion Nest |
| FARM-08 | Crimson Wasteland | Burning Canyon |
| FARM-09 | Crimson Wasteland | Magma Depths |
| FARM-10 | Crimson Wasteland | Ashen Fortress |
| FARM-11 | Storm Dominion | Thunder Plains |
| FARM-12 | Storm Dominion | Skyfall Cliffs |
| FARM-13 | Storm Dominion | Stormwatch Tower |
| FARM-14 | Storm Dominion | Electric Marsh |
| FARM-15 | Storm Dominion | Celestial Arena |
| FARM-16 | Frozen Kingdom | Snowfall Tundra |
| FARM-17 | Frozen Kingdom | Icebound Forest |
| FARM-18 | Frozen Kingdom | Frozen Lake |
| FARM-19 | Frozen Kingdom | Crystal Cavern |
| FARM-20 | Frozen Kingdom | Eternal Palace |
| FARM-21 | Shadowlands | Darkwood Forest |
| FARM-22 | Shadowlands | Forgotten Graveyard |
| FARM-23 | Shadowlands | Phantom Village |
| FARM-24 | Shadowlands | Shadow Shrine |
| FARM-25 | Shadowlands | Assassin's Sanctuary |
| FARM-26 | Abyss Realm | Void Entrance |
| FARM-27 | Abyss Realm | Ruined Dimension |
| FARM-28 | Abyss Realm | Chaos Battlefield |
| FARM-29 | Abyss Realm | Abyssal Citadel |
| FARM-30 | Abyss Realm | Throne of Eternity |

**ห้ามนับชื่อ Celestial Arena, Eternal Palace หรือ Throne of Eternity เป็น World Boss Map/Dungeon Map เพียงเพราะชื่อเหมือนสถานที่บอส**; ทั้งหมดในตารางคือแมพฟาร์ม

## 10.3 เขต PvP
- เมือง: PvP Off
- FARM-01 ถึง 05: Safe Farming; ไม่เปิดโจมตีผู้เล่นโดยไม่ยินยอม
- FARM-06 ถึง 25: Contested/conditional PvP; event/opt-in/พื้นที่ย่อย ตาม config
- FARM-26 ถึง 30: War Zone; แจ้งเตือนก่อนเข้า; anti-camping และ newbie protection

## 10.4 Map Engineering
- `MapDefinition`: map_id, region, level band, world links, spawn anchors, portal anchors, PvP policy, waypoints, quest hooks, streaming chunks
- `[PROPOSED]` ขนาด map tiers 256×256, 512×512, 1024×1024 tiles ตาม performance; ต้อง chunk stream และ AOI/interest management
- Map Server/Zone Server แยก scene/zone instance; load balancing และ channels; central world state คุมเวลาและ events
- Map NPCs, resource nodes, monsters, rare mobs, map bosses, secrets, treasure hunts, weather/day-night, events; Adventure Camps เป็นพักแรม **ไม่เพิ่มเมืองที่สาม**
- ทางเดินเชื่อมโลกต้อง graph-valid; emergency return/safe egress และ reconnect fallback

---

# 11. มอนสเตอร์, AI, MAP BOSS

- ระดับ Normal, Enhanced, Elite, Rare, Map Boss, Event Monster
- AI state `IDLE → PATROL → ALERT → CHASE → ATTACK → RESET → DEAD/RESPAWN`; skill telegraphs, aggro radius, leash, hazard avoidance
- `MonsterDefinition`: Monster ID, stats, level, skills, faction, spawn biome, behavior, loot_table_id, XP, graphics refs
- Monster Spawn Controller กำหนดจำนวนสูงสุดต่อพื้นที่, spawn budget, cooldown, anti-clumping, anti-bot exploit
- Rare/Elite/Map Boss มี respawn windows ที่กำหนด; Map Boss อยู่ใน 30 farming maps เป็นคนละระบบกับ World Boss
- Monster Evolution / Invasion เป็น event modifiers พร้อมป้องกันผู้เล่นใหม่ถูก mob ระดับสูงรุมโดยไม่มีทางหนี
- Loot attribution ใช้ participation/correct rights, ไม่ใช่ผู้ Last Hit ได้ของทั้งหมด

---

# 12. ITEM CATALOG มากกว่า 1,000 ชนิด (TARGET 1,350)

| Category / Prefix | Unique templates | Design |
|---|---:|---|
| `WPN` Weapons | 240 | 6 weapons × 40 templates |
| `ARM` Armor | 200 | Helmet 40, Chest 40, Armguard 40, Leg Armor 40, Boots 40 |
| `ACC` Accessories | 150 | Rings 50, Necklaces 50, Earrings 50 |
| `RUN` Runes | 96 | 12 families × 8 ranks |
| `REL` Relics | 50 | 1 equip slot, tactical build modifiers |
| `MAT` Craft Materials | 120 | biome/monster/profession materials |
| `TRD` NPC Trade Loot | 360 | **30 maps × 12 sellable drops** |
| `CON` Consumables | 50 | Potion/food/buff/utility |
| `RIT` Boss Ritual Items | 36 | 6 bosses × 6 components/related ritual entries; detailed recipe differs by boss |
| `PWR` The Power Items | 6 | starting powers, fruit items |
| `ADM` GM Exclusive Items | 18 | restricted/admin-only |
| `COS` Cosmetics | 24 | appearance items |
| **TOTAL** | **1,350** | **unique Item Templates, not rolled affix permutations** |

**Catalog note:** ไฟล์ catalog ที่เคยสร้างไว้ชื่อ `THE_POWER_ECLIPSE_1350_Items_v3_9.xlsx` อาจอยู่ใน working directory หากได้รับไฟล์มาด้วย; ให้ตรวจไฟล์จริงก่อนนำเข้า **ห้ามสมมติว่ามีในเครื่องหรือคัดลอกชื่อจากการเดา**. หากไม่มีไฟล์ให้สร้าง seed definitions ตามจำนวนพร้อม Validation และรายงานส่วนที่ต้องกรอกละเอียดต่อ

## 12.1 Equipment Slots
- Weapon ×1, Helmet ×1, Chest ×1, Armguard ×1, Leg Armor ×1, Boots ×1, Necklace ×1, Ring ×2, Earring ×2, Relic ×1, The Power ×1
- `[PROPOSED]` Leg Armor และ Earrings เป็นอุปกรณ์เพิ่มจากชุดเดิม ต้องปรับ `total_stat_budget` ของตัวละคร; อย่าให้ bonus สูงขึ้นโดยไม่มีการบาลานซ์
- Equipment rarity: Common, Uncommon, Rare, Epic, Legendary, Mythic; GM Exclusive เป็น **permission classification** ไม่ใช่ quality tier ที่ใช้กับผู้เล่นทั่วไป
- ตีบวก `[TUNING]` +0 ถึง +10; ไม่ทำลายอุปกรณ์ถาวรเมื่อพลาด; affix และ rune sockets มี caps

## 12.2 Template vs Instance
**ItemTemplate:** immutable ID, name, category, rarity, level requirement, base stats, sell value, icon, visual asset, eligible affixes, restrictions, stack size, drop sources, flags.  
**ItemInstance:** unique ID, template ID, owner ID, quantity (stack), rolled affixes, enhancement, durability, rune list, binding, created_at, provenance, version.  
**ItemLedger:** event ID, type, source/target, item instance, before/after, reason, GM approval metadata; immutable/auditable.

## 12.3 Trade Loot 360 ชนิด
- `TRD` เป็นของขาย NPC เพื่อหา Gold **แมพละ 12 ชนิด**; ไม่บังคับให้ใช้วัตถุดิบพิธีหรือ rare crafting ให้ตรงกับ Trade Loot
- loot icon, price, stack cap, zone tier, merchant sale flag; มี `Sell All Trade Loot` ที่ NPC merchant และ confirm เฉพาะรายการที่ไม่ถูก lock/favorite
- Auto Loot กรอง Trade Loot ได้; Auto Farm ไม่ควรขาย NPC ข้ามแมพแบบ teleport อัตโนมัติ
- NPC sell price deterministic; economy dashboard ตรวจ gold generated/hour และ sunk/hour

## 12.4 Other Item Systems
- Inventory `[PROPOSED]` 40 ช่องเริ่มต้น, Stack/Sort/Filter/Search, Equipment comparison, Item Lock/Favorite
- Storage/Personal Vault, mail, direct trade, auction house, secure trading, buy/sell tax, market history
- Currency Gold, Gold Sinks (repair, travel, crafting, listing fee, service NPC); หลีกเลี่ยง Pay-to-Win
- Runes 12 families × 8 ranks; Relics 50; enhancements, affixes, material quality, cosmetic transmog (ถ้าเพิ่มภายหลัง)
- Crafting specialization: Weaponsmith, Armorsmith, Runecrafter, Alchemist, Siege Engineer
- Recipe engine input list → cost → validation → output → atomic commit; power crafting มี fragment progression
- Power fruit quality ไม่ควรมีระดับ Mythic/Legendary ที่ทำให้ผลเดียวกันแรงต่างกันโดยตรงตามคำจำกัดความด้านพลัง

---

# 13. WORLD BOSS: วงแดงสุ่มและแมพบอสแยก

## 13.1 กฎทางเข้าและวัฏจักร
**ทุก World Boss มีแมพเฉพาะตัวนอก 32 Core Maps**. `GlobalPortalController` เลือก anchor จากพูลของ **30 แมพฟาร์ม** แล้วสร้าง **วงเวทสีแดง** พร้อมตราบอส/ข้อมูลระดับแนะนำ/ระยะเวลาหมดอายุ

State machine ตัวอย่าง: `DORMANT → PORTAL_ACTIVE → BOSS_MAP_OPEN → RITUAL_IN_PROGRESS → BOSS_ACTIVE → DEFEATED/FAILED → COOLDOWN → DORMANT`

- Portal ไม่จำเป็นต้องตรง biome ของบอส; สามารถสุ่มจากทุก 30 แมพ
- `[TUNING]` portal lifetime 30 นาที; target anchors 10–20/map; เปิด portals ตาม global availability ไม่ spawn ซ้ำอิสระทุก channel
- ผู้เล่นแตะวงแดงแล้วเข้าสู่ boss map; พิธี summon ดำเนินการ **ภายในแมพบอส**
- เมื่อ portal ปิด บอส instance ที่เริ่มแล้วไม่ถูกยุบฉับพลัน; มี instance TTL/rejoin rules
- ตรวจ lock การบริจาค ingredient และ leader/contribution attribution; loot เป็น personal contribution-based; anti-AFK
- ผู้เล่นเริ่มต้นที่เจอวงแดงบอสระดับสูงได้รับคำเตือน; ห้าม warp อัตโนมัติ

## 13.2 บอสเริ่มต้น 6 ตัวและพิธี (ตัวเลขวัตถุดิบยัง TUNING)
| Boss | Dedicated map | Suggested ritual |
|---|---|---|
| **Ignivar, Flame Tyrant** | Ignivar's Infernal Arena | Flame Core ×100, Infernal Heart ×3, เปิดแท่นไฟ 5 จุดภายใน 60 วินาที |
| **Raijorn, Storm Sovereign** | Raijorn's Sky Temple | Storm Feather ×50, ต้องมีพายุและเปิดเสาสายฟ้า 4 จุด |
| **Kurogami, Shadow Emperor** | Kurogami's Shadow Domain | Shadow Seal ×7, ลำดับผนึก/ปริศนาและช่วงกลางคืน |
| **Glacieron, Frozen King** | Glacieron's Frozen Throne | Frozen Heart ×30, ทำลายโซ่ 4 จุด, คุ้มครองไฟศักดิ์สิทธิ์ |
| **Yggdran, Ancient Guardian** | Yggdran's Sacred Grove | Ancient Seed ×5, ปกป้องต้นอ่อน 5 ต้น 10 นาที |
| **Azrath, Void Devourer** | Azrath's Void Throne | Abyss Fragment ×99, Void Key ×1 และผ่าน dungeon 3 แห่งที่กำหนด |

- Boss AI multi-phase, attack telegraphs, threat system, group roles, AoE, mechanics, phase transitions, enrages
- `[TUNING]` 10–30 participants per instance; scale by initial player count not exploitable disconnect
- Boss Personal Loot + Contribution Ledger, achievements, Power Drops/Fragments, rare crafting materials
- Ceremony recoverable after instance server failure; material restoration must be ledger-backed and idempotent
- GM can observe/reset/test boss, but live item generation requires controls and logs

---

# 14. DUNGEON: ทางเข้า NPC ที่เมืองหลักเท่านั้น

## 14.1 Entry Contract — ห้ามผิด
- ทุก Dungeon มี map instance แยก ไม่นับใน 32
- เมืองหลักมีประตู + NPC ชื่อ **Dungeon Gatekeeper** ยืนคุม; ผู้เล่นต้อง **คุย NPC เท่านั้น** เพื่อเข้าสู่ dungeon
- ไม่มี portal dungeon ที่สุ่มในฟาร์ม, ไม่มี auto-warp จาก Party Finder, ไม่มี hidden dungeon entrance ข้างนอก
- Party Finder จับทีมได้ แต่หัวหน้าทีมหรือสมาชิกต้องใช้ interaction ที่ NPC ตาม UX policy; server สร้าง instance หลัง ready check
- Hidden Dungeon: ไปหา Secret Key/เบาะแสในฟาร์ม แต่กลับมาคุย Dungeon Gatekeeper ก่อนเข้า

## 14.2 ประเภท
| Type | Group | Purpose |
|---|---|---|
| Normal | 1–4 | EXP, core equipment, introductory boss |
| Abyss | 4 | tough mechanics, rare materials, mutations |
| Hidden | 1–4 | discovery keys, secrets, special rewards |
| Guild Raid | 8–20 | coordination, boss phases, guild objectives |

`DungeonDefinition`: entry level, party size, key requirements, difficulty, boss list, objectives, instance time limit, reward table, lockouts.  
`DungeonInstance`: members, owner, lifecycle, checkpoints, enemy state, rewards, timer, reconnect tokens.  
`DungeonGatekeeper` handles menu → validate → ready check → transaction for key costs → create instance → transfer players; on disconnect, safe rejoin; end-of-instance safe exit to city.

`[PROPOSED]` Full launch dungeon maps = 8 (Normal 3, Abyss 2, Hidden 2, Guild Raid 1); must allow adding new maps without increasing core world count.

---

# 15. PvP / ARENA / OPEN WORLD

- Duels 1v1, Ranked Solo 1v1, 3v3, 5v5, Open World PvP, Territory Conflict, tournaments
- PvP Arena เป็น map/instance นอก 32
- Matchmaking: party/solo rules, rating/MMR, queue, match ready, reconnect, timeout, anti-match-fixing, seasonal leaderboard
- Ranked: equipment stat normalization, build identity retained, PvP-specific damage/healing/CC tuning; cooldown and weapon/power loadout locks
- Open World PvP: Safe Cities, Safe Farm 1–5, Contested 6–25, War Zone 26–30; warn before flagged areas, prevent spawn camping, criminal/bounty system for rule-breaking kills
- PvP death ไม่ดรอป equipment หรือ power; win/loss rewards with abuse detection
- Auto cannot attack player or play Arena/Guild War; direct input from human required
- Match event replay/death recap/GM referee spectator; no referee interference with scores

---

# 16. GUILD / GUILD WAR / TERRITORY

## 16.1 Guild
Create/rename/emblem, ranks (Leader/Officer/Member etc.), invite/kick, recruitment, roster, guild EXP/level, missions, contribution, guild storage and treasury with permission/audit, guild hall, chat, alliance/rivalry, leaderboard.

## 16.2 Guild War `[LOCKED TARGET]` 30v30
- Dedicated battle map **not part of 32**; first benchmark 10v10, then 30v30 when performance passes; 50v50 only after profiling/optimization (future)
- `[TUNING]` 30-minute battle: 0–10 resource points A–D; 10–20 Siege gates/objectives; 20–30 capture `Dominion Core`
- Registration, roster lock, substitutes, squads, commander pings, respawns, spawn protection, multiple exits, anti-snowball, overtime/tie break, AFK rules, scoring that rewards objective/support roles
- Siege Engineer profession produces eligible siege items; keep power and equipment scaling fair
- War Match Server authoritative, anti-cheat, effect LOD, combat metrics, replay, referee spectator, post-match report

## 16.3 Territory
- Capture only selected farming zones; up to `[TUNING]` 3 territories per guild; ownership cannot deny public access to farming maps
- Contest schedule, rewards, ownership records, season reset, guild rivalries; objective-focused PvP

## 16.4 Caravan
- Escort vs registered raider, movable cargo objectives, route over eligible maps, contribution rewards, anti-grief and failure/timeout logic

---

# 17. QUEST / EXPLORATION / EVENTS / SEASONS

## 17.1 Quest System
Main story, side quests, hunting contracts, power quests, guild quests, world event quests.  
`QuestDefinition`: prerequisites, steps, NPC, objective counters, turn-in conditions, rewards, repeatability, progress persistence; server validates kill/collection completion.

## 17.2 Exploration
Discovery journal, hidden treasure, treasure maps, secret NPC, Adventure Camps (rest stops, not new cities), map collectibles, lore, dimensional rift events; Hidden Dungeon keys sourced from world but entry city NPC only.

## 17.3 World Events
Eclipse global event, Monster Invasion, Treasure Hunt, special boss-related activities, crafting/material bonuses, new Power discovery, caravan, PvP/Guild tournaments, scheduled calendar; no spontaneous bonus that breaks market without limits.

## 17.4 Season
`[TUNING]` 8-week seasonal schedule; reset competitive rating/territory possession, **never reset character level, owned equipment or bound power**; award titles, cosmetics, guild prestige; record history and logs.

---

# 18. SOCIAL / UI / ACCESSIBILITY

- Friend/Block, Whisper/Party/Guild/World Chat, Party Finder, Guild Recruitment Board, Mailbox, Player Inspect, Profile, Emotes
- HUD: HP/Stamina/Power Energy, target, minimap, quest tracker, notifications, buffs/debuffs, 20-slot hotbar, currency, auto status
- Menus: inventory, equipment, power archive, proficiency, skills, crafting, market, quests, map, dungeon gatekeeper, PvP queue, guild, events, settings
- UX: resizable UI, accessible text, color-blind indicators, reduced flashes and effect-density mode, keybind remap, audio controls, performance mode
- If a user-facing UI is mocked, show clear 'DEMO' state; production data comes from server events and APIs
- Support bug reporting, disconnect messaging, queue readiness, death recap, safe-area warning, item confirmation, destructive unbind warning

---

# 19. GM / ADMIN GOD MODE, HUD และความปลอดภัย

## 19.1 คำสั่งเปิดระบบ `[LOCKED]`
**`/gmstefanonline`** — ใช้ผ่านช่อง chat เปิด/ปิด `GM Control Center` โดยเรียก `AdminAuthorizationService`; ต้องมี authenticated GM permissions; ข้อความนี้ **ไม่ใช่ password**. ถ้าไม่มีสิทธิ์ให้ตอบ `Permission Denied` และ log suspicious attempts ตามนโยบาย.

## 19.2 GM HUD
`GM Main HUD` มี sidebar modules + search + context panel + preview/confirm และ `GM Quick HUD` เป็นแถบเครื่องมือเล็กระหว่างเล่นเกม ไม่บัง hotbar 20 ช่อง.

Modules:
1. Dashboard — server/players/alerts
2. Player Manager — inspect, move to safety, kick, mute, ban, review, restore by evidence
3. Item Spawner — search ItemTemplate ID, quantity, target, binding, destination
4. Equipment Editor — rarity, stats, affixes, sockets, enhancement, restrictions
5. Max Stat Generator — choose legal maxima or GM override test mode
6. Custom Item Creator — create Template drafts, assets, name, item stats, restrictions
7. Admin Exclusive — GM-only set, swords, staff, armor, accessories; no player trading
8. Monster Spawner — type, count, position, AI, stats, drop overrides (test only)
9. World/Map — spawn anchors, weather, day/night, server zone maintenance
10. World Boss Manager — red portals, ritual, dedicated maps, test instances
11. Dungeon Manager — Gatekeeper definitions, entry conditions, instance recovery
12. The Power Editor — definitions, skills, compatibility, trial/release pipeline
13. Auto Farm Monitor — user states, map restrictions, anti-abuse, farming metrics
14. PvP/Guild War — schedule, referee, match inspect, rollback by procedure
15. Economy — gold ledger, auction monitoring, trade flags, reward review
16. Event Manager — schedules/announcements/rewards
17. Server Admin — health, maintenance, restart, instance controls
18. Security & Audit — roles, approvals, sessions, immutable logs

## 19.3 Owner/GM permission levels
Player, Helper, Moderator, GM, Senior GM, Administrator, Owner; use **capability-based RBAC** per operation, not only integer threshold; GM visibility and actions follow server policy.

## 19.4 God Mode Test Functions
Invulnerability, infinite HP/Stamina/Power Energy, no cooldown, super speed, invisible, spectator, teleport, hitbox inspector, monster test spawning, custom damage override; live-ranked and economy contamination blocked.

## 19.5 Spawn Item / Monster Policy
- Spawn item: Item ID, quantity, enhancement, affixes, rune slots, rarity, owner, grant reason, destination; generate preview and audit event
- Spawn max-stat equipment: `MAX_LEGAL_STATS` within item caps or `GM_OVERRIDE` **only in controlled/test instances**
- Custom Admin-only gear: permission-locked, account-bound, non-tradable, non-auctionable, excluded from Ranked/Guild War
- Spawn monster: Monster ID, count, spawn coords/map, level, stats, AI mode, drop mode, TTL; live World Boss **must only be spawned inside its dedicated boss map or test map**, not on farm map; normal Map Boss may be controlled in its farm area
- In production, item/gold grants require justification + logging + risk-based approval; no direct DB edit

## 19.6 Security
- MFA for privileged staff, separate GM account from ordinary character, RBAC, short-lived sessions, server API access control, confirmation on destructive actions, two-person approval for high-risk grants, event-sourcing/audit, backup and recovery playbooks
- `GMActionEvent`: actor, permission, target, action, before/after, reason, approval, timestamp, server response, request id
- Undo only when reversible and ledger supports it; never silently rollback live trades without reconciliation

---

# 20. ONLINE BACKEND / NETWORKING

- Client Godot 4.x/GDScript; authoritative server Go **or** C# (เลือกหนึ่งเทคโนโลยีหลังดูทีมและ environment); PostgreSQL; Redis optional when needed, not mandatory at beginning
- Begin as modular monolith or simple services with clear boundaries; avoid premature microservices
- Server owns authentication, character state, movement validation, combat resolution, monster AI, loot, inventory, power binding, dungeon entry, world portals, GM auth, PvP outcomes
- Protocols: messages typed/versioned, request IDs, server timestamps, actor IDs, validation errors; secure transport, rate limit, reconnect tokens, lag compensation where justified
- AOI/interest management, map channels, persistence, instance lifecycle, global world state control, anti-duplicate scheduled events
- Synchronization: server snapshots, client interpolation/prediction where needed, reconciliation, network profiling; deterministic or carefully audited combat calculations
- Transactions: item grant/trade, auction listing/purchase, gold transfer, power bind/unbind, ritual ingredient consumption, dungeon key usage, boss rewards must be **atomic + idempotent**
- Anti-cheat: speed/teleport exploit detection, cooldown validation, attack range, anti-RMT/bot telemetry, inventory transaction integrity, match-fixing controls
- Infrastructure: backups, verified restores, observability metrics, crash reports, alerts, deployment gating, version migrations, staged rollout, maintenance mode

---

# 21. DATA MODEL, IDs, CONFIG และ VALIDATION

## 21.1 Identifier conventions
`ACC-`, `CHR-`, `WPN-`, `ARM-`, `ACCITEM-`, `RUN-`, `REL-`, `MAT-`, `TRD-`, `CON-`, `RIT-`, `PWR-`, `ADM-`, `COS-`, `SKL-`, `MON-`, `WBO-`, `DNG-`, `MAP-`, `INS-`, `TXN-`, `EVT-` ตามมาตรฐานที่ทีมกำหนดจริง; **อย่าให้ prefix ACC ของบัญชีชนกับ Accessory**; ระบุใน schema ไม่เดา parsing จากชื่ออย่างเดียว

## 21.2 Tables/Entities ที่ต้องวางแผน
- `accounts`, `sessions`, `characters`, `character_stats`, `character_positions`, `character_quests`, `weapon_masteries`
- `item_templates`, `item_instances`, `inventories`, `equipment_slots`, `item_transactions`, `gold_ledger`, `storage`, `mail`
- `power_definitions`, `power_bindings`, `power_proficiencies`, `power_archives`, `skill_definitions`, `skill_loadouts`, `status_effect_definitions`
- `monster_definitions`, `monster_spawns`, `loot_tables`, `loot_grants`, `world_maps`, `zone_instances`, `world_state`
- `world_boss_definitions`, `world_boss_portals`, `ritual_definitions`, `ritual_sessions`, `boss_fights`, `boss_contributions`
- `dungeon_definitions`, `dungeon_instance_states`, `dungeon_entitlements`, `dungeon_results`
- `parties`, `guilds`, `guild_members`, `guild_storage`, `guild_wars`, `territories`, `caravans`, `pvp_matches`, `pvp_ratings`, `seasons`
- `quests`, `quest_progress`, `events`, `event_schedules`, `auction_listings`, `trade_sessions`, `crafting_recipes`
- `gm_roles`, `gm_permissions`, `gm_sessions`, `gm_actions`, `gm_approvals`, `bans`, `audit_logs`

## 21.3 Validation suite
- Unique IDs and referential integrity; 32 core maps exactly; 30 farms exactly; 2 cities exactly
- Every World Boss has distinct dedicated non-core map; ritual references valid; portal anchors only on farming map IDs
- Every Dungeon has dedicated/non-core instance definition and entry type `CITY_GATEKEEPER_ONLY`
- Weapon type count exactly 6 and unique skill count exactly 3 per type
- Every live Power has exactly 15/5/5 skills and valid weapon compatibility
- Equipped power loadout <=5/1/2; never 2 bound powers; no Awakening/Evolution flag
- Hotbar exactly 20 entries (empty slots allowed) and separate passive slots
- Item catalog target sum 1350; 360 trade loot unique, 12 each FARM-01…30; item IDs unique; no dangling loot/craft asset refs
- GM-exclusive items not tradable/listable/ranked-usable; GM actions require permitted actor/audit record
- PvP auto targeting players rejected; server rejects invalid damage and unsupported power use
- Data migration and save/load round-trip tests

---

# 22. ART / PIXEL SPRITES / AUDIO

- Pixel-art scene style dark fantasy with readable silhouettes, combat telegraphs, biome-specific palette; avoid excessive glow
- Character spritesheet: Idle/Walk/Attack/Death, 4 cardinal views at minimum, 8-direction motion rules to be specified; walk left/right legs clearly alternate, consistent height and frame spacing, transparent backgrounds for actual spritesheets
- Animation system decoupled from combat logic; state and animation callbacks must not grant server-trusted hits unaudited
- 6 weapon families with distinct attack silhouettes; 6 Powers with coherent VFX palettes; boss phase telegraphs and unique arenas
- Tilemap standards, scaling, texture import (nearest), atlases, sprite sheet slicing spec, folder naming and placeholder markers
- Audio: attack/hit/skill cues, ambience by biome, boss music cues, UI sounds, accessibility mix controls; only use licensed/original assets

---

# 23. MONETIZATION, ECONOMY SAFETY, LIVE OPS

- No Pay-to-Win: monetization target cosmetics, appearances, optional conveniences that do not override PvP power/economy fairness
- Monitor Gold generated vs sinks, Trade Loot/hour, Auto Farm/hour, rare Power supply, boss reward supply, market inflation, crafting bottlenecks, unusual transactions
- New The Power must launch with data definitions, balance tests, source drop/craft, Archive, VFX/SFX, item representation, GM test coverage and release note
- LiveOps: season schedule, content release, announcements, compensation policy, server maintenance, incident runbook, abuse report, appeal process, restore drills
- GM overrides during live games must not contaminate ranked standings/market items; test/live environments isolated

---

# 24. DEVELOPMENT PHASES = 8; MVP = PHASE 4

> **คำนิยาม:** มี 8 Development Phases ไม่ใช่ 8 MVP แยกกัน. Phase 1–3 เป็น Prototypes/Technical Alpha; **Phase 4 คือ First Playable MVP**; Phase 5–6 Expansion Alpha; Phase 7 Full Content Closed Beta; Phase 8 Release Candidate / Launch Preparation.

## PHASE 1 — CORE COMBAT PROTOTYPE
**Objective:** พิสูจน์ความสนุกและความถูกต้องของ combat ก่อนทำ MMORPG เต็มโลก

**Scope:** Godot project, Git, pixel import rules, test map, player 8-direction controller, camera, animations, collision/hitbox, basic sword attack, HP/Damage/Death/Respawn, dash/stamina, 1 monster with AI, 3 sword skills, debug HUD, tests.

**Acceptance:** เปิดเล่น offline ได้; ตีโดนตาม hitbox; มอนสเตอร์ไล่โจมตี/ตาย/เกิด; dash ใช้ stamina; death/respawn ไม่ค้าง; ไม่มี crash ระดับ blocker; มี run instructions และ regression checklist.

**Out of scope:** auth, full world, 1350 items, complete powers.

## PHASE 2 — MULTIPLAYER FOUNDATION
**Objective:** ระบบออนไลน์และ persistence เชื่อถือได้

**Scope:** auth/session, character creation, movement sync, authoritative combat, monster sync, item/loot/gold/EXP, inventory, database migrations, save/load, chat, reconnect, GM authentication/RBAC/audit foundation.

**Acceptance:** `[TUNING]` ทดสอบ 10–20 concurrent players in one test map; game state survives reconnect/restart; transaction idempotency tested; invalid client damage/loot rejected; metrics/logging available.

## PHASE 3 — SIX WEAPONS + POWER FOUNDATION + AUTO
**Objective:** พิสูจน์เอกลักษณ์ของเกม

**Scope:** all 6 weapons with 3 skills each, 20-slot hotbar, skill engine, Power binding/activate/energy/weapon restrictions, Inferno and Abyss Shadow MVP loadouts, The Severer unbind destruction, Power Archive/Proficiency foundation, Auto Attack/Skill/Farm/Potion/Loot, GM HUD basic, monster/item test spawner.

**Minimum working skill loadouts per Power:** 5 Active + 1 Ultimate + **2 Passive** ต่อผล เพื่อทดสอบระบบ equip ทั้งหมด; Proficiency rank 1 อนุญาตเพียง 1 passive จึงต้อง implement unlock to rank 2 or a controlled test override. **ห้ามแอบละเมิด rank restriction ใน live mode.** Full 25 skills per Power เป็นงาน Phase 7.

**Acceptance:** obtain/drop or craft trial fruit → bind → activate → use legal skills → auto farm → replace weapon and enforce restriction → unbind at NPC destroys old fruit → persistence correct.

## PHASE 4 — FIRST PLAYABLE MVP
**Objective:** เกม MMORPG ขนาดเล็กที่ผู้เล่นเล่นครบวงจรจริง

**Content:** Aetheria Capital 1 city, 3 farming maps (Greenfield Plains/Whispering Forest/Wolf Fang Valley), 1 Normal Dungeon map, 1 PvP 1v1 Arena, 6 weapons, 2 Powers with working MVP loadouts, Map Boss 1, Hotbar 20, Auto Farm, Party, Basic Crafting, Merchant/Sell Trade Loot, Storage, basic GM HUD.

**Loop Acceptance:** create character → starter weapon → fight/farm → EXP + Gold + loot → obtain Power → bind/activate → party → talk **Dungeon Gatekeeper NPC** → clear dungeon → personal loot → enhance/craft → duel → logout → resume exact state.

**Gate:** Closed playtest results, blocker count, server performance baseline, data consistency, not merely menu screenshot.

## PHASE 5 — WORLD BOSS & PvE EXPANSION
**Objective:** แยก World Boss Map และวงแดงสุ่มพร้อมพิธีใช้งานจริง

**Content target:** 8 cumulative farming maps, 2 boss maps (start Ignivar/Yggdran to validate different rituals), 3 dungeons, 4 map bosses (targets may tune).

**Scope:** global portal state, 30-map-compatible anchors (even if only 8 maps implemented currently), dedicated boss instances, ritual donation locks, phases, contribution/personal loot, cooldown, anti-channel duplication, dungeon variants, fragment guarantee, boss GM tools.

**Acceptance:** red portal on eligible farming map → boss-specific map → ritual ingredients consumed atomically → boss defeated → personal loot exactly once → correct cooldown/rejoin/failure recovery; no World Boss spawning in farm map.

## PHASE 6 — GUILD & COMPETITIVE PvP
**Objective:** multiplayer competition/fair guild systems

**Scope:** guild creation/roles/storage/missions/ranking, 3v3/5v5 matchmaking, territory control, guild war registration/score/capture/siege, first 10v10 load/logic tests, GM referee, anti-match-fixing, PvP stat normalization.

**Acceptance:** guild wars have consistent results and rewards; equal conditions tested; disconnect/rescue paths; no Auto Combat in war; scoring independent of last-hit-only.

## PHASE 7 — FULL WORLD CLOSED BETA
**Objective:** เนื้อหาเปิดตัวครบตามเป้าหมาย

**Must complete:** 2 cities + 30 farms = 32 core maps; all 6 full Powers **150 skills** + 18 weapon skills; 6 dedicated World Boss maps/rituals; launch Dungeon catalog `[PROPOSED]` 8 maps; 1,350 item templates and actual icons/stats/sources validated; 360 trade loot map distribution; craft/runes/relic/auction; 30v30 Guild War tested; territory/caravan/Eclipse events; season and live economy dashboards; completed GM capabilities.

**Acceptance:** cross-system end-to-end playtests, item/catalog consistency, no missing boss/dungeon entrance logic, performance and stability for target concurrency; all listed content is playable not placeholder.

## PHASE 8 — LAUNCH READINESS
**Objective:** เกมปลอดภัย เสถียร และดูแลผู้เล่นได้จริง

**Scope:** load/stress testing, security penetration review, anti-cheat, PvP balance, drop/economy balancing, backup restore drill, database migration tests, GM security, transaction audit, disaster recovery, live metrics, patch pipeline, staged releases, support workflows, final optimization and launch decision.

**Acceptance:** documented release checklist, no unresolved release-blocker bugs, recovery tested, economy and account security ready, compatible client/server builds, rollback plan demonstrated.

## POST-LAUNCH LIVE SERVICE
- New The Power (25 skills each), boss with separate map and red portal rules, new dungeons accessible through city NPC, new item catalog/season/event/cosmetics, balance updates
- Never change 32 core map count silently; **new boss/dungeon maps are not part of core 32**; if new core farm maps are ever requested, requires owner approval and rule revision

---

# 25. IMPLEMENTATION DEPENDENCY ORDER และ FIRST SPRINT

**Dependency tree (high level):** Input/Character → Movement/Combat → Skill Engine → Networking/Server Authority → Persistence/Items → Power/Auto → Party/NPC/Instances → Boss Portals/Dungeons → PvP/Guild → Full Content → LiveOps.

**First sprint instructions (start now):**
1. Inspect `pwd`, repo tree, existing Godot files, README, git status; never overwrite user files blindly
2. Create/verify `docs/GAME_RULES.md`, `docs/ROADMAP.md`, `docs/DEVELOPMENT_STATUS.md`, `docs/DECISIONS.md`
3. Set game project structure and pixel import conventions
4. Create a test map and one player character placeholder (clearly marked)
5. Implement 8-direction movement + camera + collisions
6. Implement animation state machine and Basic Sword Attack
7. Create reusable Health and Hurtbox/Hitbox components
8. Create one monster AI and kill/respawn cycle
9. Add Dodge/Stamina and Sword 3 active skills
10. Add smoke tests, reproducible `How to Run`, log screenshots or recordings if possible
11. Update Development Status and stop at Phase 1 gate until accepted

---

# 26. REPOSITORY LAYOUT (PROPOSED)

```text
the-power-eclipse/
├── client/                     # Godot 4.x
│   ├── project.godot
│   ├── scenes/{player,monsters,maps,npc,ui}/
│   ├── scripts/{combat,skills,network,inventory,powers,auto}/
│   ├── assets/{characters,monsters,tiles,vfx,audio}/
│   └── tests/
├── server/
│   ├── auth/                    # Modular authoritative backend
│   ├── characters/
│   ├── combat/
│   ├── powers/
│   ├── items/
│   ├── monsters/
│   ├── world/
│   ├── dungeons/
│   ├── pvp/
│   ├── guild/
│   ├── economy/
│   ├── gm/
│   └── tests/
├── shared/{schemas,protocols}/
├── game-data/{weapons,powers,skills,items,monsters,bosses,maps,dungeons,loot,recipes,events}/
├── database/{migrations,seeds}/
├── admin-panel/
├── tools/{validators,importers,debug}/
├── tests/{integration,load,security}/
├── docs/
│   ├── GAME_RULES.md
│   ├── GDD.md
│   ├── ROADMAP.md
│   ├── DEVELOPMENT_STATUS.md
│   ├── DECISIONS.md
│   ├── ARCHITECTURE.md
│   ├── COMBAT_SPEC.md
│   ├── POWER_SPEC.md
│   ├── ITEM_SPEC.md
│   ├── WORLD_MAP_SPEC.md
│   ├── WORLD_BOSS_SPEC.md
│   ├── DUNGEON_SPEC.md
│   ├── PVP_GUILD_SPEC.md
│   ├── GM_SPEC.md
│   ├── SECURITY_SPEC.md
│   └── PHASES/{PHASE_01.md,...,PHASE_08.md}
├── README.md
└── prompt.md                  # THIS MASTER PROMPT
```

---

# 27. MANDATORY QA / ACCEPTANCE TEST MATRIX

| Feature | Required verification |
|---|---|
| Movement | 8 directions, obstacles, collision, server movement caps |
| Combat | hit range, LOS, cooldown, server damage, simultaneous hits, death cleanup |
| Weapon | exactly 6 types, each 3 skills, switch rules and shared cooldown behavior |
| Power | 15/5/5 definitions per live Power, loadout 5/1/2, Activate gating, restrictions, no awakening |
| Unbind | destructive confirmation, old fruit consumed, no duplication, audit and persistence |
| Hotbar | exactly 20 slots, 2×10, drag/drop, custom keybind, persisted and disabled state |
| Auto | legal PvE only, safety stop, no PvP automation, no offline farming, no boss ritual entry |
| Core Map | 30 farms + 2 cities exactly, correct safe/contested policies |
| World Boss | distinct boss maps, red random portals only in farms, unique global event/cooldowns, ritual and loot once |
| Dungeon | **every entry via city NPC**, separate map, party ready, safe disconnect/rejoin |
| Items | 1,350 unique templates; 360 trade loot map 12×30; template/instance separate; atomic trades |
| Economy | Gold ledger, no negative balance/duplication, balanced farm income, secure auction |
| PvP | normalization, anti-boost, queue outcomes, no auto PvP, no PvP loot drop |
| Guild War | 10v10 prototype then 30v30, correct capture/scoring/respawn, referee non-interference |
| GM | `/gmstefanonline` permission, privileged actions audited, test items cannot enter live ranked economy |
| Data | migration, save/load, backup/restore, idempotency, reconnect, multi-channel event uniqueness |
| Deployment | build versions, load telemetry, rollback and incident runbook |

Do not approve a Phase merely because all boxes are checked manually: keep automated test output, playtest checklist, performance reports, and known issues in repository.

---

# 28. OUTPUT FORMAT ทุกครั้งที่ AI ทำงาน

ตอบเป็นภาษาไทย (ยกเว้น code/identifiers) ตามโครงนี้:

1. **Current Phase / Milestone:** ขั้นตอนปัจจุบันและเหตุผล
2. **Goal / Acceptance Criteria:** จะทำอะไรและถือว่าผ่านเมื่อใด
3. **Repository Inspection:** พบไฟล์/ระบบใดก่อนแก้
4. **Design Decisions:** สิ่งที่เลือก, LOCKED/PROPOSED/TUNING, ผลกระทบต่อระบบอื่น
5. **Implemented Work:** สิ่งที่ลงมือทำและทำงานจริง พร้อมรายการไฟล์
6. **How to Run:** คำสั่งรัน/คอมไพล์/ทดสอบ
7. **Test Results:** ผ่าน/ไม่ผ่าน/ไม่ได้รัน พร้อมเหตุผลที่ตรวจสอบได้
8. **Known Issues & Security Risks:** บั๊ก ข้อจำกัด ความเสี่ยง
9. **Next Tasks:** งานย่อยถัดไปภายใน phase เดิม
10. **Rule Compliance:** ยืนยัน 32 maps, red portals, Dungeon NPC-only, 20 hotbar, Power rules, GM permissions, item counts เมื่อเกี่ยวข้อง

หากไม่มี repository หรือเครื่องมือเขียนโค้ด ให้ระบุว่ากำลังเสนอ Specification เท่านั้น อย่าอ้างว่าระบบถูกสร้างแล้ว

---

# 29. การเริ่มงานทันที (FIRST DIRECTIVE)

**เริ่มจาก PHASE 1 เท่านั้น** ยกเว้นเจ้าของเกมสั่งชัดให้เปลี่ยน Phase

ตรวจ repository → สร้าง/แก้ Godot Project → จัดเอกสารกฎ → ทำการเดิน 8 ทิศ → ดาบโจมตี → มอนสเตอร์ 1 ตัว → HP/Damage/Hitbox → Dash/Stamina → Sword Skills 3 → Death/Respawn → Playtest + Tests → รายงานหลักฐาน

อย่าเขียน 32 แมพ 1,350 ไอเทม 150 Power Skills และ GM God Mode ทั้งหมดพร้อมกันใน Phase 1; **เตรียม data schemas สำหรับรองรับตั้งแต่ต้น แต่ส่งมอบ features ทีละลำดับ**

เมื่อ Phase 1 ผ่านจึงไป Phase 2, ต่อถึง First Playable MVP Phase 4, Full Beta Phase 7 และ Launch Phase 8

**END OF THE POWER: ECLIPSE MASTER PROMPT v5.1**
