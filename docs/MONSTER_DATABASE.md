# MONSTER_DATABASE

แหล่งข้อมูล: `src/shared/config/monsters.ts` (ตารางนี้สร้างด้วย `npx tsx scripts/gen-tables.ts monsters`)

Tier: normal, elite, champion, map_boss, dungeon_boss, world_boss (ตอนนี้ทำแล้วแค่ normal และ elite)

| ID | ชื่อ | Tier | Lv | HP (min lv) | ATK | DEF | Type/Element | Aggro | Leash | Speed | Attacks | EXP | Respawn | Loot |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| green_slime | สไลม์เขียว | normal | 1-3 | 60 | 8 | 2 | physical/none | 4 (passive) | 14 | 1.8 | melee(windup 0.55s, cd 1.6s, r 1.1, ×1) | 12 | 20s | mat_slime_gel 55.0%<br>mat_soul_essence 8.0%<br>pot_hp_small 5.0%<br>mat_power_fragment 1.0%<br>gold 1-4 |
| meadow_boar | หมูป่าทุ่งหญ้า | normal | 3-5 | 120 | 13 | 5 | physical/none | 5 (passive) | 14 | 2.6 | melee(windup 0.6s, cd 1.8s, r 1.3, ×1.2) | 26 | 20s | mat_boar_hide 50.0%<br>mat_iron_ore 12.0%<br>helm_leather_cap 2.0%<br>mat_power_fragment 1.0%<br>gold 3-8 |
| plains_wolf | หมาป่าทุ่งราบ | normal | 4-7 | 110 | 16 | 4 | physical/none | 6.5 | 14 | 3.4 | melee(windup 0.4s, cd 1.3s, r 1.2, ×1) | 34 | 20s | mat_wolf_pelt 45.0%<br>mat_soul_essence 12.0%<br>bts_leather_boots 2.0%<br>glv_leather_gloves 2.0%<br>mat_power_fragment 1.0%<br>gold 4-10 |
| puffcap | เห็ดพองลม | normal | 2-5 | 90 | 10 | 3 | magic/nature | 4.5 | 14 | 1.5 | aoe(windup 1s, cd 3.2s, r 3, aoe 1.6, ×1.3) | 22 | 20s | mat_spore_cap 50.0%<br>mat_nature_herb 25.0%<br>pot_energy_small 5.0%<br>mat_power_fragment 1.0%<br>gold 2-6 |
| field_wisp | ภูตแสงทุ่งหญ้า | normal | 3-6 | 70 | 12 | 1 | magic/arcane | 7 | 14 | 2.4 | ranged(windup 0.7s, cd 2.2s, r 6, aoe 0.3, ×1) | 28 | 20s | mat_wisp_dust 50.0%<br>mat_soul_essence 15.0%<br>acc_copper_ring 1.5%<br>mat_power_fragment 1.0%<br>gold 3-7 |
| alpha_wolf | หมาป่าจ่าฝูง | elite | 8-8 | 900 | 34 | 12 | physical/none | 7 | 16 | 3.6 | melee(windup 0.45s, cd 1.4s, r 1.6, ×1)<br>aoe(windup 1.1s, cd 7s, r 1.5, aoe 2.6, ×1.8) | 320 | 180s | mat_wolf_pelt 100.0%<br>mat_soul_essence 60.0%<br>wpn_wolfbane_blade 12.0%<br>acc_wolf_fang_necklace 15.0%<br>rune_vitality_basic 10.0%<br>mat_power_fragment 8.0%<br>gold 30-60 |
| moss_slime | สไลม์ตะไคร่ | normal | 6-9 | 160 | 20 | 8 | physical/none | 4.5 | 14 | 2 | melee(windup 0.5s, cd 1.5s, r 1.1, ×1) | 48 | 20s | mat_slime_gel 60.0%<br>mat_nature_herb 30.0%<br>pot_hp_small 6.0%<br>mat_power_fragment 1.0%<br>gold 5-12 |
| thorn_boar | หมูป่าหนาม | normal | 8-11 | 260 | 28 | 12 | physical/none | 5.5 | 14 | 2.8 | melee(windup 0.55s, cd 1.7s, r 1.4, ×1.25) | 70 | 20s | mat_boar_hide 60.0%<br>mat_iron_ore 18.0%<br>arm_leather_vest 2.5%<br>mat_power_fragment 1.0%<br>gold 7-15 |
| shade_wolf | หมาป่าเงาไม้ | normal | 9-12 | 230 | 32 | 9 | physical/none | 7 | 14 | 3.6 | melee(windup 0.38s, cd 1.2s, r 1.2, ×1) | 82 | 20s | mat_wolf_pelt 55.0%<br>mat_soul_essence 18.0%<br>wpn_iron_sword 2.0%<br>mat_power_fragment 1.0%<br>gold 8-16 |
| sporeling | เห็ดสปอร์พิษ | normal | 7-10 | 200 | 22 | 7 | magic/nature | 5 | 14 | 1.6 | aoe(windup 0.95s, cd 3s, r 3.2, aoe 1.8, ×1.35) | 60 | 20s | mat_spore_cap 60.0%<br>mat_nature_herb 35.0%<br>pot_energy_small 6.0%<br>mat_power_fragment 1.0%<br>gold 6-13 |
| forest_wisp | ภูตไพร | normal | 8-12 | 170 | 26 | 5 | magic/nature | 7.5 | 14 | 2.6 | ranged(windup 0.6s, cd 2s, r 6.5, aoe 0.3, ×1) | 74 | 20s | mat_wisp_dust 60.0%<br>mat_soul_essence 20.0%<br>wpn_oak_staff 2.0%<br>mat_power_fragment 1.0%<br>gold 7-14 |
| elder_sapling | ต้นกล้าผู้เฒ่า | elite | 13-13 | 2600 | 55 | 22 | magic/nature | 6 | 14 | 1.9 | melee(windup 0.6s, cd 1.8s, r 1.8, ×1)<br>aoe(windup 1.2s, cd 6s, r 6, aoe 2.2, ×1.6) | 1100 | 240s | mat_nature_herb 100.0%<br>mat_soul_essence 70.0%<br>wpn_sylvan_staff 12.0%<br>rune_vitality_basic 18.0%<br>mat_power_fragment 8.0%<br>gold 60-120 |


## AI (`src/server/ai.ts`)
`idle → patrol(wander) → idle` · aggro (ถ้าไม่ passive) หรือโดนตี → `chase` · อยู่ในระยะ → `windup` (telegraph) → resolve → `chase` · เป้าตายหรือหลุด leash → สลับไปหาเป้าที่มี threat สูงสุด ถ้าไม่มีจะ `return` (อมตะ, ฟื้น HP) → `idle` · HP 0 → `dead` → respawn ตามเวลา ภายใน spawn group
- Retreat/keep-distance: Wisp จะรักษาระยะไว้ที่ 4–4.5 ช่อง
- Dynamic spawn: จำนวน = min(max, base + perPlayer × (ผู้เล่นในโซน − 1)) ตรวจทุก 1s และลดจำนวนเฉพาะตัวที่ตายแล้ว
- Anti-bot: ถ้าฆ่าเกิน 900 ตัวต่อชั่วโมง EXP และดรอปจะเหลือ 25%
- EXP แบ่งตามสัดส่วนดาเมจ: แต่ละคนได้ clamp(share × 1.5, 0.25, 1) × levelDiff ส่วนผู้ทำดาเมจสูงสุดได้สิทธิ์เก็บลูต 30s
