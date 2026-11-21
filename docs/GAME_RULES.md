# GAME_RULES — THE POWER: ECLIPSE (LOCKED)

> แหล่งที่มา: `MASTER_PROMPT.md` v6.0 §1–§3. ไฟล์นี้คือกฎที่ **ห้ามเปลี่ยนเอง** โดยไม่มีคำยืนยันจากเจ้าของเกม
> ลำดับความสำคัญ: คำยืนยันล่าสุดจากเจ้าของเกม > Locked Rules > GDD > Proposed > ภาพ mockup > โค้ดเก่า

## เทคโนโลยี (LOCKED)
- เล่นผ่านเว็บ **HTML5** โดยตรง: **Phaser + TypeScript** (world) + **React + TypeScript** (HUD/เมนู), build ด้วย Vite
- **ห้ามใช้ Godot / Unity / Unreal / Java Applet / web export จากเอนจินอื่น** ทั้งโค้ด, config, tooling, roadmap
- Server: **Java (LTS) หรือ Go อย่างใดอย่างหนึ่ง** เลือกก่อน Phase 2; authoritative; PostgreSQL; WSS + HTTPS

## กฎเกม (LOCKED)
1. ไม่มี Class — เลือก starter weapon ฟรี 1 จาก 6: **Staff, Sword, Dagger, Bow, Grimoire, Gauntlet**
2. อาวุธละ **3 active skills** (รวม 18) + basic attack แยก
3. The Power ได้จาก drop/craft, ผูกได้ครั้งละ **1 ผล**
4. ทุกผล **15 Active + 5 Ultimate + 5 Passive**; ติดตั้ง **5 Active + 1 Ultimate + 2 Passive**
5. ต้อง Activate ก่อนใช้ Power skill; บางผลจำกัดอาวุธ; **ไม่มี Awakening / Evolution / Transcendence**
6. ถอด Power ต้องคุย NPC **The Severer** — ผลเก่าถูก **ทำลายถาวร**
7. เพิ่ม Power ใหม่ได้โดยไม่รื้อ core engine (data-driven)
8. Hotbar **20 ช่อง (2×10)** ปรับปุ่ม/สกิลได้
9. โลกหลัก **32 แมพ = 30 ฟาร์ม + 2 เมือง** (บอส/ดันเจี้ยน/อารีน่า/สงครามกิลด์ ไม่นับ)
10. World Boss มีแมพเฉพาะ; ทางเข้า = **วงเวทสีแดงสุ่มบน 30 แมพฟาร์ม** (ไม่เกิดในเมือง)
11. Dungeon ทุกประเภทแมพแยก; เข้าได้ **เฉพาะคุยกับ Dungeon Gatekeeper NPC ในเมืองหลัก**
12. Auto Farm/Attack/Skill/Potion/Loot เฉพาะ PvE ปกติ; **ห้าม Auto PvP / Ranked / Guild War / พิธี World Boss**
13. PvP, Territory, Guild War เป้าหมาย **30v30** (เริ่ม load test 10v10)
14. GM HUD เปิดด้วย chat **`/gmstefanonline`** — เฉพาะบัญชีที่ **server** ยืนยันสิทธิ์ (ไม่ใช่รหัสผ่าน)
15. Owner/Admin เสกของ/มอนสเตอร์/Max Stats/GM Exclusive ได้ตามสิทธิ์ พร้อม audit + แยก Test/Live
16. ไอเทมเปิดตัว **1,350 ชนิด** รวม Trade Loot 360 (12 ต่อแมพฟาร์ม)
17. **ไม่ใช้ Godot**
18. `[DESIGN]` Server authoritative: combat, movement validation, inventory, Gold, reward, trade, GM, rank, world boss
19. `[DESIGN]` ของ GM/test ห้ามเข้า market, auction, ranked, competitive guild war
20. `[DESIGN]` No pay-to-win

## เมื่อภาพ mockup ขัดกับกฎ (ยึดกฎ)
ภาพตัวอย่าง UI (ไฟล์ zip) ใช้เป็นแนวทาง **การจัดวาง HUD/สไตล์** เท่านั้น สิ่งต่อไปนี้ในภาพ **ไม่ถือเป็นกฎ**:
- Lv.99/120/130/150/200 (กฎ: Level 1–100), ค่า HP หลักแสน, "Zeny", "MP/SP" แทน Stamina/Power Energy
- ชื่อแมพ "Map 12 – Forest of Wind/Mist Forest/Crystal Forest", "Lunaris Port" (กฎ: ใช้ตาราง FARM-01..30 + Aetheria Capital/Nocturne Citadel)
- "อัปเกรดพลัง", "Lv.พลัง 10/10", Power ชื่อ "Genesis Void Dominion"/"Inferno Tempest" (กฎ: Proficiency Rank 1–3, 6 ผลตามชื่อในสเปก)
- ชื่อ World Boss ที่ไม่ตรงสเปก (Ifrit, Leviathan, Azael, Valdrak ฯลฯ) — กฎ: Ignivar, Raijorn, Kurogami, Glacieron, Yggdran, Azrath
- ปุ่ม Auto ระหว่าง PvP/Guild War, ตีบวก +20, hotbar F1–F10 แถวเดียว
