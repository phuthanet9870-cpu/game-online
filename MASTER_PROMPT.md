# THE POWER: ECLIPSE — MASTER PROMPT (HTML5 WEB MMORPG)

**Filename:** `MASTER_PROMPT.md` (สามารถตั้งชื่อ `prompt.md` ใน repository ได้)  
**Version:** 6.0 — Native HTML5 / Phaser / TypeScript, NO GODOT  
**Status:** ข้อกำหนดการออกแบบและคำสั่งพัฒนา ไม่ใช่การยืนยันว่าเขียนเกมเสร็จ  
**Language:** ภาษาไทยสำหรับเอกสาร, English สำหรับ identifiers และ code  
**Development:** 8 Phases; First Playable MVP จบ Phase 4; Launch Candidate จบ Phase 8

> **คำสั่งสูงสุดสำหรับ Coding Agent:** อ่านเอกสารนี้ทั้งฉบับก่อนทำงาน ตรวจ repository ที่มีอยู่จริงก่อนสร้างหรือแก้ไฟล์ แล้วพัฒนา THE POWER: ECLIPSE เป็นเกม MMORPG เล่นผ่านเว็บ HTML5 โดยตรงด้วย **Phaser + TypeScript** ห้ามใช้ Godot, Unity, Unreal, Java Applet หรือ Web Export จากเอนจินอื่นแทน โดยไม่ได้รับคำสั่งเปลี่ยนจากเจ้าของเกม

---

# 0. EXECUTION CONTRACT — ให้ AI ทำงานอย่างไร

ทำหน้าที่เป็นทีม Game Director, Senior Game Designer, Phaser/TypeScript Engineer, Real-time Multiplayer/Backend Engineer, UI/UX, Database, PvP Balancer, Game Economy, QA Automation, Security, DevOps และ LiveOps ทำเกมตามรายละเอียดนี้จริง ไม่ใช่สร้างเพียงภาพจำลอง

1. เริ่มจากดู `pwd`, โครงสร้างไฟล์, `git status`, `package.json`, เอกสารสถานะ และโค้ดจริงก่อนทุกครั้ง
2. หากพบโปรเจกต์เดิมให้ทำงานต่อ ไม่ล้างโครงสร้างโดยไม่จำเป็น; หากพบโค้ดเอนจินเก่าเสนอ migration โดยไม่ลบข้อมูลเดิม
3. โหลดและใช้ `docs/GAME_RULES.md`, `docs/DECISIONS.md`, `docs/ROADMAP.md`, `docs/DEVELOPMENT_STATUS.md`; หากยังไม่มีให้สร้างจากเอกสารนี้
4. ทำเฉพาะ Phase ปัจจุบันทีละ vertical slice จนผ่าน Acceptance Gate ก่อนขึ้น Phase ถัดไป
5. ทุกงานต้องมีอินพุต เอาต์พุต โครงสร้างข้อมูล คำสั่งรัน ผลทดสอบ และข้อจำกัดตามจริง
6. ห้ามรายงานว่า “เสร็จ” ถ้ามีแค่ UI Mockup, placeholder API, fake account หรือระบบไม่ได้เชื่อม authoritative server
7. ห้าม hardcode เงิน, loot, combat result หรือสิทธิ์ GM ใน browser client
8. เมื่อไม่ทราบตัวเลขบาลานซ์ ให้ระบุ `[TUNING]` และสร้าง config ไม่เดาหรือแต่งเป็นข้อสรุปเดิม
9. ถ้าทำไม่ครบภายในรอบเดียว ให้ทำงานที่ผ่านการตรวจรับได้ก่อน อัปเดตสถานะ และระบุงานที่ค้างชัดเจน
10. ห้ามเปลี่ยน Locked Rules เอง แม้รูปภาพต้นแบบหรือโค้ดเก่าจะขัดกัน

**Priority:** ข้อยืนยันล่าสุดจากเจ้าของเกม > Locked Rules ในไฟล์นี้ > GDD > Proposed Design > ตัวอย่างภาพและ mockup > โค้ดเก่า. สถานะของข้อกำหนดคือ `[LOCKED]`, `[DESIGN]`, `[PROPOSED]`, `[TUNING]`, `[IMPLEMENTED]` (ต้องพิสูจน์ด้วยการรัน/ทดสอบ)

---

# 1. GAME VISION และ WEB-FIRST TECHNOLOGY (LOCKED)

- **Game:** THE POWER: ECLIPSE, 2D pixel-art top-down/3⁄4, real-time action, online MMORPG, PvE/PvP/Guild War, Auto Farm
- **Primary platform:** Desktop HTML5 browser (Chrome, Edge, Firefox), เปิดจาก HTTPS URL และเล่นได้ทันทีโดยไม่ลง client
- **Mobile target:** Android/iOS browser แบบ touch UI เมื่อทดสอบความสามารถ ความจำ และความลื่นไหลจริง; ไม่รับรองทุกอุปกรณ์โดยไม่มี QA
- **Browser game:** Phaser + TypeScript; HTML Canvas / WebGL; responsive canvas; pixel-art nearest-neighbor; avoid expensive effects on mobile
- **UI:** React + TypeScript สำหรับ menu/HUD, Phaser สำหรับ world/entities/VFX; บริหาร pointer/keyboard input focus ระหว่าง React กับ canvas
- **Build:** Vite, npm/pnpm workspace, strict TypeScript, ESLint, formatter, Vitest, Playwright browser smoke tests
- **Server:** เลือก **Java (LTS) หรือ Go เพียงหนึ่งตัว** ก่อน Phase 2 หลังตรวจทีมและโค้ดเดิม; authoritative gameplay; ไม่ใช้ Java Applet
- **Transport:** WSS สำหรับ gameplay real-time, HTTPS สำหรับ auth/admin/assets; server-side rate limit + sequence numbers + validated commands
- **Database:** PostgreSQL; Redis เพิ่มเมื่อมี use case ชัดเจน ไม่บังคับตั้งแต่แรก
- **Admin:** GM HUD ที่ฝังในเว็บเกม และ separate secure Admin Web ที่เรียก Admin API ชุดเดียวกัน
- **Production:** HTTPS, CDN/static assets, WSS game gateway, DB migrations, metrics, backups, deployment/rollback
- **Game rules:** No class; 6 weapons; 6 initial Powers; 32 core maps; 20 hotbar; random red World Boss portals on farm maps; NPC-only city dungeon access; 1,350 item catalog; GM command `/gmstefanonline`

**Web constraints:** ต้องทดสอบ browser tab hidden/focus loss, reconnect, resize/fullscreen, devicePixelRatio, audio unlock on user gesture, context-loss restore, asset caching/versioning, graceful WebSocket close, page refresh, input latency, 20-slot hotbar/keyboard conflicts, touch controls และ browser storage ที่ไม่ใช่แหล่งความจริงสำหรับเศรษฐกิจเกม

---

# 2. NON-NEGOTIABLE LOCKED GAME RULES

1. `[LOCKED]` ไม่มี Class; เลือก starter weapon ฟรีหนึ่งชิ้นจาก 6 ประเภท **Staff, Sword, Dagger, Bow, Grimoire, Gauntlet**
2. `[LOCKED]` อาวุธแต่ละชนิดมี **3 active weapon skills** (รวม 18) และ basic attack แยก
3. `[LOCKED]` The Power หาได้จาก drop/craft, 1 ตัวละครผูกพลังได้ครั้งละ 1 ผล
4. `[LOCKED]` ทุกผลมี **15 Active + 5 Ultimate + 5 Passive**; ติดตั้ง **5 Active + 1 Ultimate + 2 Passive**
5. `[LOCKED]` ต้อง Activate ก่อนใช้ Power skill, จำกัดอาวุธบางผล; ไม่มี Awakening, Evolution, Transcendence ที่เปลี่ยนผลพลัง
6. `[LOCKED]` ถอด Power ต้องคุย NPC **The Severer** และยืนยันพิธี; ผลเก่าถูกทำลายอย่างถาวร; ต้องหาผลใหม่หากต้องการใช้ซ้ำ
7. `[LOCKED]` เพิ่ม The Power ใหม่ได้เรื่อย ๆ โดยไม่รื้อ core engine
8. `[LOCKED]` Hotbar มี **20 ช่อง 2×10** และปรับปุ่ม/สกิลเองได้
9. `[LOCKED]` โลกหลัก **32 แมพ = 30 ฟาร์ม + 2 เมือง** ไม่มีบอสหรือดันเจี้ยนนับรวม
10. `[LOCKED]` World Boss ทุกตัวมีแมพเฉพาะ; ทางเข้าเป็น **วงเวทสีแดงสุ่มปรากฏตาม 30 แมพฟาร์ม** ไม่เกิดในเมือง; บอสมีเงื่อนไขพิธีของตัวเอง
11. `[LOCKED]` Dungeon ทุกประเภทมีแมพแยก; ผู้เล่นต้อง **พูดคุยกับ Dungeon Gatekeeper NPC ซึ่งยืนคุมประตูในเมืองหลักเท่านั้น** เพื่อเข้า; ไม่มีทางเข้าดันเจี้ยนสุ่มกลางฟาร์ม
12. `[LOCKED]` Auto Farm/Attack/Skill/Potion/Loot มีจริงใน PvE ธรรมดา; ห้าม Auto ต่อสู้กับผู้เล่น/เล่น Ranked/Guild War หรือทำพิธี World Boss แทน
13. `[LOCKED]` มี PvP, Territory, Guild War เป้าหมาย **30v30**; เริ่ม load test 10v10
14. `[LOCKED]` มี GM HUD เปิดผ่าน chat `/gmstefanonline` พร้อม Quick HUD; เฉพาะบัญชีที่ server ตรวจสิทธิ์แล้ว
15. `[LOCKED]` Owner/Admin สามารถเสกของ มอนสเตอร์ อาวุธ ชุด Max Stats และ GM Exclusive, เปลี่ยน Config ตามสิทธิ์; ต้องมี audit และ isolation ของ Test/Live
16. `[LOCKED/DESIGN TARGET]` มีไอเทมเปิดตัว **1,350 ชนิด** (มากกว่า 1,000) รวม Trade Loot ขาย NPC 360 ชนิด 12 ต่อ farming map
17. `[LOCKED]` เกมต้องเล่นบนเว็บไซต์ **HTML5** โดยตรง และ **ไม่ใช้ Godot** ทั้ง code, project config, engine tooling หรือ roadmap
18. `[DESIGN]` Server authoritative สำหรับ combat, movement validation, inventory, Gold, reward, trade, GM action, rank และ world boss event
19. `[DESIGN]` GM-only / test gear ห้ามเข้า player market, auction, ranked PvP, competitive Guild War
20. `[DESIGN]` no pay-to-win; ใช้ cosmetics/service ที่ไม่เพิ่ม combat power เป็นแนวทาง monetization

**หากภาพ Mockup ขัดกันให้ยึดกฎนี้:** ไม่มี Awaken/Transcend, ไม่มี Spear/Greatsword/Axe เป็นชนิดอาวุธหลัก, Power Proficiency สูงสุด Rank 3 ไม่ใช่ 7, hotbar ต้อง 20 ช่อง, dungeon ต้องผ่าน city NPC, Power skill ไม่ได้ติดตั้งเกิน 5/1/2, normal enhancement cap เป็นต้นแบบ +10 ไม่ใช่ +20 ตามภาพ

---

# 3. สถานะค่าออกแบบและตัวเลขเป้าหมาย

- `[DESIGN]` เลเวล 1–100, Main Stats STR/DEX/INT/VIT/AGI/WIS, Weapon Mastery 1–50, Proficiency 1–3
- `[DESIGN]` Aetheria Capital และ Nocturne Citadel เป็น 2 เมืองปลอดภัย; farm maps 01–05 Safe, 06–25 Contested, 26–30 War
- `[DESIGN]` Beginner inventory 40 slots, character slots 3, no PvP item-loss
- `[PROPOSED]` 8 launch dungeons: Normal 3, Abyss 2, Hidden 2, Guild Raid 1; ทุกแห่งเข้า Gatekeeper NPC
- `[PROPOSED]` Equipment เพิ่ม Leg Armor และ Earrings 2 ช่อง; ต้องตรวจ total stat budget
- `[TUNING]` boss portal lifespan 30 min, spawn anchors 10–20 per farm map, boss players 10–30, Guild War 30 min, Season 8 weeks, Auto radius 5–25 tiles, enhancement +0..+10
- `[TUNING]` XP curve, drop rates, boss ritual costs, damage/defense/CC values, item prices, minimum supported FPS, memory budget และ server concurrency ตั้งค่าจากผลทดสอบเท่านั้น

---

# 4–19. GAMEPLAY SYSTEM SPECIFICATIONS (FULL CONSOLIDATION)

ส่วนต่อไปนี้เป็นรายละเอียด Gameplay ทั้งหมดที่สรุปจากข้อกำหนดก่อนหน้า ปรับถ้อยคำให้เข้ากับ Native HTML5 Browser Client แล้ว

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


---

# 20. NATIVE WEB CLIENT / REAL-TIME BACKEND ARCHITECTURE

## 20.1 Client structure
- Phaser manages world scenes, tiled/atlas map layers, entities, animation, camera, spatial queries, input mapping, VFX, audio and local prediction.
- React manages login, character select, inventory, equipment, skills, the 20-slot hotbar, quests, party, chat, guild, crafting, boss trackers, dungeon selection, Auto Settings, GM HUD.
- A typed event bridge connects Phaser to React; never import React state into authoritative combat simulation.
- TypeScript strict type checking, error boundaries, asset manifests, responsive resize, fullscreen, pause when backgrounded, pixel-art camera configuration.
- Hotbar must remain 2×10 at desktop baseline; mobile rearranges layout without reducing the 20 available slots; ergonomic touch pages are allowed but must expose all slots through accessible UI.
- Use Tiled/JSON or equivalent data-driven map format, atlas-based spritesheets, sprite sheets for eight-direction movement, fixed logical tile size, object layers for collision/spawn/portals/waypoints; batch rendering and cull offscreen objects.
- Authentication with HTTPS, gameplay WSS; local browser data may store UI preference but cannot hold authoritative Gold/items.

## 20.2 Multiplayer boundary
- Client sends input intention (`move`, `useSkill`, `interact`, `toggleAuto`, `enterDungeonRequest`) with sequence/time metadata.
- Server validates identity, state, range, inventory ownership, cooldown, resource, map permissions, rate and anti-cheat; broadcasts accepted state/events.
- Network interpolation/correction and interest-management spatial buckets; maintain smooth visible combat under simulated latency; never let client choose target damage or loot quantity.
- Instance coordinator handles dungeon, world boss, PvP/Guild war maps; shared world state maintains unique boss portal lifecycle across channels.
- Browser tab suspension/disconnect stops Auto Farming and starts reconnect/grace policies; duplicated replayed commands are idempotent where needed.

## 20.3 Server modules (begin modular monolith)
- Auth/Accounts/Sessions; Characters/Progression; Combat/Skill/Status; Inventory/Items/Gold Ledger; Monster/Spawns; World/Portal State; Party/Dungeon Instance; PvP/Rating; Guild/War/Territory; Auction/Crafting; Events/Live Config; Admin/RBAC/Audit.
- Begin as one deployable server with modular boundaries, not a fleet of microservices. Split only after profiling bottlenecks.
- Choose Java LTS (e.g., JVM + typed service) OR Go once before Phase 2 and record the selection in `docs/DECISIONS.md`; no obligation to implement both.
- Database PostgreSQL with migrations and transaction-aware services; use Redis only for ephemeral coordination when justified; backing persistent logs in DB.

## 20.4 Web deployment
- Browser entry: landing → login → character selection → load Phaser world → join world over WSS → interact with NPC.
- `https://game.example/` is a proposed deployment placeholder, NOT an existing site. No hardcoded live URL claims.
- Vite build outputs hashed static assets; deploy static shell via HTTPS; run WSS and API behind secure reverse proxy; enforce CORS/CSP, secure cookies/session, HTTPS, WSS, content versioning.
- Asset streaming by biome, shared atlas, lazy load audio/VFX, browser cache invalidation, content manifest integrity; avoid downloading all 32 maps and 150 skills on first visit.
- Test keyboard, touch, audio permission, responsive resolution, loss of network, page refresh, browser cache stale, WebGL context lost, low-memory mobile, slow connection.

---

# 21. DATABASE / CONTENT PIPELINE / SPECIFICATION SCHEMAS

## 21.1 Core identifiers
Use immutable IDs (`account_id`, `character_id`, `item_template_id`, `item_instance_id`, `power_id`, `skill_id`, `map_id`, `instance_id`, `portal_event_id`, `transaction_id`, `gm_action_id`). Do not rely on localized names as keys.

## 21.2 Required entities
`accounts`, `sessions`, `characters`, `character_stats`, `weapon_masteries`, `power_templates`, `power_owned_history`, `power_bindings`, `power_proficiencies`, `skills`, `skill_loadouts`, `hotbar_layouts`, `item_templates`, `item_instances`, `equipment`, `item_affixes`, `rune_sockets`, `inventory_slots`, `currency_ledgers`, `transactions`, `monsters`, `monster_spawns`, `loot_tables`, `core_maps`, `map_instances`, `world_bosses`, `world_boss_portals`, `boss_rituals`, `ritual_contributions`, `dungeons`, `dungeon_instances`, `parties`, `quest_progress`, `guilds`, `guild_members`, `guild_wars`, `territories`, `pvp_matches`, `ratings`, `mail`, `auction_listings`, `crafting_recipes`, `season_state`, `event_schedule`, `gm_roles`, `gm_permissions`, `gm_actions`, `gm_audit_log`, `bans`.

## 21.3 Representative data definitions
```ts
export type WeaponType = 'staff'|'sword'|'dagger'|'bow'|'grimoire'|'gauntlet';
export interface SkillDefinition { id: string; powerId?: string; weaponType?: WeaponType; category: 'weapon'|'power-active'|'power-ultimate'|'power-passive'; targeting: 'self'|'point'|'entity'|'cone'|'line'|'area'; cooldownMs: number; resourceCost: number; effects: readonly string[]; pvpModifierId?: string; }
export interface PowerDefinition { id: string; allowedWeapons: readonly WeaponType[]; activeSkillIds: readonly string[]; ultimateSkillIds: readonly string[]; passiveSkillIds: readonly string[]; obtainable: boolean; contentVersion: string; }
export interface ItemTemplate { id: string; name: string; category: string; rarity: string; maxStack: number; sellPriceGold: number; tradable: boolean; gmOnly: boolean; dropTableIds: readonly string[]; }
export interface BossPortalEvent { id: string; bossId: string; farmMapId: string; spawnAnchorId: string; status: 'scheduled'|'open'|'expired'|'entered'|'closed'; openedAt: string; expiresAt: string; bossInstanceId?: string; }
```

## 21.4 Data tests
- Power 6 initial definitions each exactly 15/5/5 unique skill IDs, correct allowedWeapons; 150 Power skills and 18 weapon skills.
- 32 unique core maps exactly 30 farming and 2 cities; boss/dungeon maps flagged `separateInstance` and excluded from count.
- 1,350 unique item template IDs with category counts; 360 trade loots distributed exactly 12 per 30 maps.
- No dangling loot/recipe/skill/icon references, impossible recipe or missing entrance NPC, out-of-range stats, duplicated IDs, invalid NPC talk options.
- Snapshot/contract tests enforce safe GM permissions, destructive Power unbind, item ledger atomicity, World Boss portal unique constraints.

---

# 22. ART, AUDIO, HUD & UX PRODUCTION

- Establish pixel density, base resolution, tile units, entity sprite height, frame budgets and nearest-neighbor; use tall readable characters and consistent four/eight directional assets as required by animation spec.
- Sprite actions: idle, walk with alternating feet, basic attack, weapon skill, Power skill, hit, death, optional dash; atlas layout with consistent frame spacing; avoid spritesheets that clip into neighboring frames.
- VFX: own/party/enemy intensity settings, AoE clear telegraphs, red world boss portal identifiable at a distance, no excessive flashes.
- Accessible UI: readable text on desktop and mobile, control remap, audio volume, performance mode, color-independent hostile indicators, chat readability.
- UI screens: landing/login, create/select character, 20 hotbar, inventory, Power 5/1/2 loadout, skill book, Auto Settings, merchant, crafting, storage, dungeon NPC, world map, boss ritual, quest, party, guild, ranked, guild war and GM HUD.
- **Correction for previous concept images:** visuals that show Power Awaken/Transcend, Power ranks above 3, weapons beyond six, 20+ enhancements as settled, or auto button during PvP are **not binding rules**; do not implement them.
- Sound/music original or properly licensed; event cues for rare loot, boss ritual, dungeon confirmation, PvP timer; browser audio starts only after user gesture.

---

# 23. MONETIZATION, BALANCE & LIVEOPS

- No pay-to-win; cosmetics, appearance and non-combat account convenience only under transparent policies. GM items must never be purchasable or tradeable into normal player economy.
- Gold sinks: repairs, NPC services, crafting fees, auction fees, enhancement fees; monitor Auto Farm gold/hour and inflation.
- PvP normalization, CC diminishing returns, healing stacking controls, contribution rewards not purely last hit; anti-gank and safe starter maps.
- 8-week seasonal competitive reset `[TUNING]`, retain level/equipment/power, reset ratings/territories per rule.
- New Power must have distinct playstyle with 25 skills and dedicated performance/balance tests, no forced power creep.
- Content updates require migrations, staging, QA smoke, load/stress, patch notes, metrics, release gates and rollback.

---

# 24. DEVELOPMENT ROADMAP — 8 PHASES, WITH EXPLICIT START & FINISH

**Interpretation:** Phase 1–3 are Prototype/Technical Foundation. Phase 4 is the **first real Playable MVP**. Phase 5–6 expand to Alpha. Phase 7 is Full Content Closed Beta. Phase 8 closes at Launch Candidate and controlled live launch after authorization. The long-term live service never truly “ends.”

## PHASE 01 — HTML5 COMBAT PROTOTYPE

**Boundary:** Start: create project and first browser page. End: tested single-player combat directly in HTML5 browser.

**Task checklist:**
- [ ] Inspect repository; create Vite + Phaser + TypeScript strict project with lint/test scripts
- [ ] Build index.html + Phaser boot/main scenes and resize/fullscreen support
- [ ] Set design resolution, pixelArt, nearest filter, camera and input manager
- [ ] Import placeholder tilemap/assets (clearly labeled); create collision map
- [ ] Player sprite with 8-direction walking, idle and deterministic movement
- [ ] Basic Sword attack with hitbox/hurtbox, damage floating text and feedback
- [ ] One monster with idle/patrol/chase/attack/death/respawn AI
- [ ] HP, death/respawn, dash/stamina and sword 3 active skills
- [ ] Minimal React HUD and debug overlays (not yet full MMORPG)
- [ ] Add Vitest unit tests for movement/damage/state; Playwright smoke test browser build

**Acceptance Gate:** Browser game loads via localhost HTTP; keyboard movement/collision, enemy hit/death/respawn, three sword skills, dodge costs stamina, no blocking runtime errors; tests and screenshots/logs available.

**Deliverables:** runnable browser build; tested server/API when phase requires; migration/data when relevant; updated `docs/PHASE_01.md`, `docs/DEVELOPMENT_STATUS.md`; reproducible test logs and known issues.

## PHASE 02 — ONLINE AUTHORITATIVE FOUNDATION

**Boundary:** Start: combat browser prototype accepted. End: multiplayer test with persistence and server validation.

**Task checklist:**
- [ ] Choose Java OR Go; record ADR and create one modular server
- [ ] Implement HTTPS auth, account/character, sessions and character selection
- [ ] Create PostgreSQL schema migrations and safe database connectivity
- [ ] WSS protocol: join, leave, movement intent, snapshots and server corrections
- [ ] Server authoritative combat, monster spawning, loot generation and anti-speed checks
- [ ] Inventory/Gold/XP/level persistence with item/currency ledger and idempotent transactions
- [ ] Reconnect and browser refresh recovery; chat and rate limits
- [ ] Basic GM RBAC, audit foundation and command parser that rejects unauthorized access
- [ ] Unit/integration tests and multi-browser simulation load for 10–20 concurrent test players

**Acceptance Gate:** At least 10–20 test clients can join same test world, move/fight/loot consistently; logout/reconnect preserves all item/currency/character data; no simple duplicate-item exploits.

**Deliverables:** runnable browser build; tested server/API when phase requires; migration/data when relevant; updated `docs/PHASE_02.md`, `docs/DEVELOPMENT_STATUS.md`; reproducible test logs and known issues.

## PHASE 03 — WEAPONS + THE POWER + AUTO + GM HUD

**Boundary:** Start: multiplayer authority passed. End: key game identity works in browser.

**Task checklist:**
- [ ] All 6 weapon categories and their 18 weapon skills function
- [ ] 20-slot hotbar in 2 rows of 10, drag/rebind/persist UI and keyboard mapping
- [ ] Data-driven Skill/Power definitions and Power Energy/Stance
- [ ] Inferno + Abyss Shadow MVP playable subset: 5 Active, 1 Ultimate, 2 Passive per power; schema supports 15/5/5
- [ ] Power drop/craft MVP, binding, weapon restriction (Shadow dagger only), Activate, The Severer destructive unbind with transaction test
- [ ] Power Proficiency/Archive foundation and Power Trial sandbox
- [ ] Auto Farm/Attack/Skill/Potion/Loot with radius, safety stop, no offline farm and server validation
- [ ] GM HUD command `/gmstefanonline`, player inspector, spawn test monsters/items in isolated test world
- [ ] Web build regression with keyboard, reconnect and 20-slot layout

**Acceptance Gate:** Six weapons each exactly 3 skills; two Powers equip 5/1/2 subset; weapon restriction, activation, permanent unbind work; Auto farms legal PvE and respects stop; unauthorized GM command always denied.

**Deliverables:** runnable browser build; tested server/API when phase requires; migration/data when relevant; updated `docs/PHASE_03.md`, `docs/DEVELOPMENT_STATUS.md`; reproducible test logs and known issues.

## PHASE 04 — FIRST PLAYABLE MVP — CLOSED PLAYER TEST

**Boundary:** Start: core systems and GM test tools passed. End: complete first playable MMORPG loop.

**Task checklist:**
- [ ] Build Aetheria Capital, 3 farm maps: Greenfield Plains, Whispering Forest, Wolf Fang Valley
- [ ] City services: Merchant, Storage, Blacksmith, The Severer, Dungeon Gatekeeper, Power Trial, Quest Board
- [ ] Main/side quests, farming monsters, one Map Boss, loot, basic equipment/crafting/enhancement and sell 12 trade loot types per available map
- [ ] Party system + Party Finder foundation, NPC talk/interact protocol
- [ ] One separate Normal Dungeon with entry ONLY via Dungeon Gatekeeper NPC; boss, objectives, personal loot, reconnect
- [ ] Separate 1v1 Arena; manual combat only, basic normalized stats and result history
- [ ] Basic player trade under transaction safety, character progression save and GM support tools
- [ ] Closed player test and browser E2E path, security and performance baselines

**Acceptance Gate:** Create → choose weapon → farm/loot → bind/Activate Power → party → talk gatekeeper → enter separate dungeon → defeat boss/claim loot → craft/merchant → 1v1 → logout/rejoin with preserved state. This is the First Playable MVP.

**Deliverables:** runnable browser build; tested server/API when phase requires; migration/data when relevant; updated `docs/PHASE_04.md`, `docs/DEVELOPMENT_STATUS.md`; reproducible test logs and known issues.

## PHASE 05 — WORLD BOSS + DUNGEON/PvE EXPANSION

**Boundary:** Start: Player MVP passed. End: unique World Boss red portals and rituals live in alpha.

**Task checklist:**
- [ ] Expand cumulative 8 farming maps
- [ ] Implement Global Portal Controller, red magic circle random anchors on eligible farm maps, timeout and distinct boss signage
- [ ] Build 2 separate boss maps and two distinct ritual flows (Ignivar, Yggdran)
- [ ] Ritual ingredient validation/locking, contributions, phases, threat, personal loot and failure refunds
- [ ] Cross-channel portal uniqueness and no farm-map World Boss entity
- [ ] Expand to 3 dungeon maps, all gated by city NPC; Hidden Dungeon keys are found in world but entry stays in city
- [ ] Power fragments guarantee and Map Boss controller; GM portal monitor, safe reset/recovery
- [ ] Test 10–30 concurrent boss fighters as tuning target

**Acceptance Gate:** Find red portal on farm map → enter boss-only map → perform ritual → fight → get attributed loot; portal expiry/cooldowns and channel uniqueness correct; no dungeon entry anywhere outside gatekeeper.

**Deliverables:** runnable browser build; tested server/API when phase requires; migration/data when relevant; updated `docs/PHASE_05.md`, `docs/DEVELOPMENT_STATUS.md`; reproducible test logs and known issues.

## PHASE 06 — GUILDS + PvP + WAR ALPHA

**Boundary:** Start: PvE event foundation stable. End: tested organized competitive combat.

**Task checklist:**
- [ ] Guild creation, roles, missions, XP, storage, chat, recruiting, alliances and permissions
- [ ] 3v3/5v5 arena queues, matchmaking, ranking, season preliminaries and anti-boosting
- [ ] Open-world safe/contested/war policy and Territory Capture with max-3 cap tuning
- [ ] Guild War separate battleground registration, rosters, commander pings, capture/siege/core, scoring and rewards
- [ ] 10v10 stress/playtest before allowing 30v30
- [ ] Respawn protection, CC diminishing returns, PvP stats normalized, manual skills only, GM observer/non-interference
- [ ] Caravan objective foundation and guild economy audit

**Acceptance Gate:** Guild creates/registers/plays 10v10, objective scoring is reproducible, no Auto PvP, rewards processed once, reconnect/AFK and tie rules verified.

**Deliverables:** runnable browser build; tested server/API when phase requires; migration/data when relevant; updated `docs/PHASE_06.md`, `docs/DEVELOPMENT_STATUS.md`; reproducible test logs and known issues.

## PHASE 07 — FULL WORLD + CONTENT CLOSED BETA

**Boundary:** Start: competitive alpha passed. End: all launch-content goals playable.

**Task checklist:**
- [ ] Finish exactly 30 farm maps + 2 cities (32 core world total)
- [ ] Ship 6 initial Powers with exact 150 active/ultimate/passive skill definitions and 18 weapon skills, VFX/sounds/QA
- [ ] Finish 6 World Boss unique maps with 6 rituals and red portals random across 30 farm maps
- [ ] Finish launch dungeon content: proposed 8 maps (3 Normal, 2 Abyss, 2 Hidden, 1 Guild Raid), exclusively city gatekeeper
- [ ] Finish 1,350 item template definitions with real icons/stats/sources, 360 trade loot types 12 per farm map
- [ ] Armor/accessories/runes/relic/crafting professions, auction, trade, mail, storage and sink economy
- [ ] Guild War scale to 30v30 only after performance test; territory, caravan, Eclipse, invasions, quests, seasons
- [ ] Complete admin dashboard, GM item creator, test/production boundary and security review
- [ ] Mass balance/browser/QA runs on desktop and selected mobile browsers

**Acceptance Gate:** All 32 core maps, 6 unique boss maps, 6×25 Power skills, 1,350 distinct item templates, 20 hotbar and 30v30 targeted gameplay validated; no dummy UI or untested placeholders in release scope.

**Deliverables:** runnable browser build; tested server/API when phase requires; migration/data when relevant; updated `docs/PHASE_07.md`, `docs/DEVELOPMENT_STATUS.md`; reproducible test logs and known issues.

## PHASE 08 — PRODUCTION HARDENING + LAUNCH

**Boundary:** Start: full content beta accepted. End: production Launch Candidate and approved live deployment.

**Task checklist:**
- [ ] Load/stress/soak tests: browser latency, WSS concurrency, combat 30v30, asset bundle/startup performance
- [ ] Security review: accounts/session, action replay, GM/RBAC/MFA/audit, item dup/trade, economy, PvP exploit
- [ ] Balance tuning: PvE drop, Auto Farm gold/hour, Power PvP winrates, gear normalization, CC, boss rewards
- [ ] Backup/restore drill, failover, DB migration rollback, disaster runbook and incident response
- [ ] HTTPS/WSS production deploy, CDN asset versions, CSP, secure cookies, caching and broken asset recovery
- [ ] Monitoring metrics, alerting, moderation/reporting, ban appeal and player support
- [ ] Browser acceptance matrix desktop/mobile (explicit test devices, FPS/memory and minimum supported versions)
- [ ] Staged release, full patch/rollback practice, production release approval and launch checklist

**Acceptance Gate:** No release-blocker issues; restore/rollback performed, safe permissions audited, player/account data sound, production website works end-to-end, controlled launch approved.

**Deliverables:** runnable browser build; tested server/API when phase requires; migration/data when relevant; updated `docs/PHASE_08.md`, `docs/DEVELOPMENT_STATUS.md`; reproducible test logs and known issues.

---

# 25. DEPENDENCY ORDER, FIRST SPRINT, AND EXACT BEGIN/END

**Dependency chain:** Repository/bootstrap → HTML5 canvas/player movement → combat/skills → authoritative networking → persistent items/economy → Power/Auto → city/NPC/party/dungeon → boss portals/rituals → PvP/Guild War → 32-map/1,350-item/150-skill catalog → Launch Ops.

**Exact first action:** `git status` / inspect repo; initialize Phaser + TypeScript + Vite if missing; serve one map with one character moving 8 directions in a browser. Then basic sword hitbox, enemy AI, dodge/stamina, three sword skills, death/respawn; smoke test in Chrome/Firefox/Edge. **Do not start by creating 32 maps or all item art.**

**Exact MVP endpoint:** Phase 4 is done only when a human tester can complete create character → fight → farm Gold/loot → bind Power → turn on Auto → party → interact with city Dungeon Gatekeeper → enter separate dungeon → clear boss → craft → 1v1 PvP → exit/re-enter with all data intact.

**Exact launch endpoint:** Phase 8 is done only when live website over HTTPS, WSS game server, account data, anti-cheat, GM approvals, audit and backup recovery are operational and verified. After launch continue new powers/bosses/dungeons/seasons; never declare a permanent end to LiveOps.

---

# 26. FILE/FOLDER STRUCTURE — NATIVE WEB ONLY

```text
the-power-eclipse/
├── MASTER_PROMPT.md
├── package.json
├── pnpm-workspace.yaml                 # optional; npm workspaces also valid
├── apps/
│   ├── web-game/                        # Phaser + TypeScript + Vite
│   │   ├── index.html
│   │   ├── src/{boot,scenes,entities,combat,skills,network,world,assets,input}/
│   │   ├── public/assets/{sprites,tiles,maps,vfx,sfx,music}/
│   │   ├── tests/
│   │   └── vite.config.ts
│   ├── web-ui/                          # React + TypeScript HUD or shared with web-game
│   │   └── src/{hud,inventory,powers,auto,dungeon,guild,gm,chat}/
│   └── admin-web/                       # Secure privileged UI
│       └── src/{dashboard,players,items,bosses,permissions,audit}/
├── server/                              # Go OR Java, pick one
│   ├── auth/
│   ├── world/
│   ├── combat/
│   ├── items/
│   ├── powers/
│   ├── monsters/
│   ├── dungeon/
│   ├── pvp/
│   ├── guild/
│   ├── gm/
│   └── tests/
├── packages/
│   └── protocol/                        # shared schemas, message contracts
├── game-data/{items,powers,skills,weapons,maps,monsters,bosses,dungeons,drops,recipes}/
├── database/{migrations,seeds}/
├── tools/{content-validation,asset-pipeline,load-testing}/
├── tests/{e2e,integration,security,performance}/
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
│   ├── MAP_SPEC.md
│   ├── WORLD_BOSS_SPEC.md
│   ├── DUNGEON_SPEC.md
│   ├── PVP_GUILD_SPEC.md
│   ├── GM_SPEC.md
│   ├── WEB_CLIENT_SPEC.md
│   ├── DATABASE_SCHEMA.md
│   ├── SECURITY_SPEC.md
│   └── PHASE_01.md ... PHASE_08.md
└── README.md
```

Do not create every directory with empty files as proof of implementation. Create actual files when used, with documented contracts.

---

# 27. QA ACCEPTANCE MATRIX — NON-NEGOTIABLE

| System | Must prove |
|---|---|
| HTML5 Client | Opens from a browser URL; no native install or other engine exporter; Canvas/WebGL responsive |
| Phaser Scene | Correct camera/collision/tilemap/animation; consistent asset loading |
| Multiplayer | Server validates combat/loot/actions; anti-replay and reconnect; never trust client money |
| Weapons | 6 categories × 3 weapon skills; weapons restrict power compatibility |
| The Power | 6×(15/5/5), loadout 5/1/2, Activate gating, destructive NPC unbind; no awakening |
| Hotbar | Exactly 20 slots (2×10), saved keybinds and cooldown visuals |
| World | 30 farm + 2 city exactly; PvP zones as specified |
| World Boss | Each has separate instance; red random portal only on farm maps; ritual and reward once |
| Dungeon | Every player entry via Dungeon Gatekeeper in city; all separate instances |
| Auto | PvE only, no auto PvP/boss ritual/offline reward, respects resources |
| Items | 1,350 unique templates; 360 Trade Loot 12×30; atomic ledger trade, no duplication |
| Economy | Trade/auction secure and audited; auto farm inflation tested |
| Guild | Guild War 10v10 first; 30v30 stress; capture/siege/core scoring verified |
| GM | `/gmstefanonline` authorized server-side; HUD + item/monster spawn audited; GM items isolated |
| Security | MFA roles, no privilege escalation, restore/backup tested, safe admin rollback process |
| Web QA | Chrome/Edge/Firefox desktop; selected Android Chrome/iOS Safari; measure memory/latency/visual readability |

---

# 28. DEFINITION OF DONE / STATUS REPORTING

Every response/work report in Thai, code identifiers in English:
1. **Current Phase:** exact number and current milestone
2. **Goal and acceptance:** what outcome is expected
3. **Repo inspection:** existing files found, conflicts discovered
4. **Tasks delivered:** executable implementation, not vague description
5. **Files changed:** exact paths, concise summary
6. **How to run:** install/start/build/test commands for actual chosen stack
7. **Tests:** commands actually run, observed pass/fail, browser(s) checked
8. **Security:** trust boundaries, auth/access, item ledger and hazards
9. **Known issues:** blocked, missing art/content, performance unknown
10. **Next task:** smallest testable task in the **same phase** until gate passed
11. **Locked-rule compliance:** no Godot, 32 maps, boss red portal, NPC dungeon, power 15/5/5, 20 hotbar, GM perms

Do not fabricate benchmark numbers, screenshots, server capacity, items, URLs or test successes.

---

# 29. FIRST DIRECTIVE — START HERE

**DO THIS NOW, NOT ALL PHASES AT ONCE:**

1. Inspect repository and available tools. If existing source exists, map current state against this document; preserve user work.
2. Prepare `docs/GAME_RULES.md` (locked), `docs/ROADMAP.md` (8 phases), `docs/DEVELOPMENT_STATUS.md` (actual), `docs/DECISIONS.md` (tech choices).
3. Create or upgrade **Phaser + TypeScript + Vite** starter, with `index.html` and browser running in local HTTP development server. No Godot project or engine export.
4. Configure responsive 16:9 logical scene, pixelated sprite rendering, collision map, 8-direction input/animation and camera.
5. Implement basic sword attack + enemy slime/wolf AI + health, damage, dash/stamina, death/respawn; then three weapon active skills.
6. Add unit tests, browser smoke tests, `README` run commands and proof of actual execution. Document Phase 1 results.
7. Stop at Phase 1 gate unless tests pass and project owner explicitly authorizes going further or pre-existing documented workflow already does.

**END STATE:** Phase 8 ends at launch-ready production with browser playable client, stable authoritative MMORPG backend and live admin operations; further updates continue after launch.

**END OF MASTER PROMPT v6.0 — HTML5/PHASER/TYPESCRIPT — NO GODOT**
