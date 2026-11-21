# WORLD_MAP_DESIGN

32 แผนที่ = 2 เมือง + 30 แมพฟาร์ม ทั้งหมดถูกนิยามด้วยข้อมูลใน `src/shared/config/zones.ts` แล้วสร้าง tile map แบบ deterministic จาก seed (`shared/mapgen.ts`)

## สถานะ
| # | แผนที่ | ภูมิภาค | Lv | สถานะ |
|---|---|---|---|---|
| 1 | Aether Capital | เมือง | – | **Functional** (Safe Zone, ร้านค้า, NPC 4, พอร์ทัล) |
| 2 | Warhaven Citadel | เมือง | – | Designed |
| 3 | Greenfall Plains | Verdant Frontier | 1–8 | **Functional** (มอนสเตอร์ 5 ชนิด + elite 1, spawn 9 จุด, ทรัพยากร 6, hazard 2) |
| 4 | Whispering Forest | Verdant Frontier | 6–14 | **Functional** (5 ชนิด + elite 1, 9 จุด, ทรัพยากร 6, หนาม 3) |
| 5–7 | Moonlit Grove, Ancient Root Valley, Emerald Sanctuary | Verdant Frontier | 1–25 | Designed |
| 8–12 | Golden Dunes, Scorpion Canyon, Forgotten Oasis, Sunken Temple, Solar Wasteland | Sunscar Desert | 20–45 | Designed |
| 13–17 | Snowfall Pass, Frozen Lake, Crystal Cavern, Blizzard Mountain, Eternal Glacier | Frostbound North | 35–60 | Designed |
| 18–22 | Cursed Woodland, Phantom Marsh, Blackmoon Ruins, Assassin Valley, Abyss Gate | Shadowlands | 50–75 | Designed |
| 23–27 | Stormfield, Thunder Ridge, Sky Ruins, Tempest Valley, Thunder God's Peak | Stormreach Highlands | 65–90 | Designed |
| 28–32 | Broken Earth, Floating Abyss, Void Crystal Field, Gravity Ruins, Eternal Battlefield (PvP) | Voidfall Expanse | 80–100+ | Designed |

*หมายเหตุลำดับ: brief นับเมืองเป็น 1–2 แล้วเริ่มนับแมพฟาร์มตั้งแต่ 3 ตารางนี้ใช้ลำดับเดียวกัน แต่สลับ Warhaven เป็นแถวที่ 2*

## ขนาด (ตามจริง)
ปัจจุบัน 1 tile ≈ 2 m: เมือง 56×56 tiles (~0.01 km²) และแมพฟาร์ม 100×100 tiles (~0.04 km²) ซึ่ง**เล็กกว่าเป้า 10–25 km² ต่อแมพมาก** เป้าทั้งโลก 600 km² ต้องอาศัย:
1. Server zone แบ่งเป็น sub-zone/cell ที่ simulate เฉพาะส่วนที่มีผู้เล่น
2. Map chunk streaming ฝั่ง client (มีแล้วสำหรับ ground) + เพิ่ม streaming ข้อมูล tile จากเซิร์ฟเวอร์แทนการ generate ทั้งแมพ
3. วัดผล: ความหนาแน่นของคอนเทนต์ต้องมีจุดฟาร์ม 6–12 จุดและพื้นที่ซ่อนจริง ไม่ทำพื้นที่โล่งเพื่อให้ตัวเลขดูใหญ่

ข้อเสนอที่ต้องตัดสินใจภายหลัง: เริ่มต้นแมพละ ~1–2 km² (500–700 tiles ต่อด้าน) แล้วขยายเมื่อ load test ยืนยันว่ารับได้

## องค์ประกอบที่ทุกแมพฟาร์มต้องมี (template ใน ZoneDef)
spawnGroups (5–10 ชนิด, elite 2–3), map boss ≥1, จุดฟาร์ม 6–12 (= spawn groups), resourceNodes, hazards, routes (safe routes ที่ generator ตัดผ่าน), portals (map transitions ที่มี validator ตรวจว่าไม่ลงในกำแพงหรือพอร์ทัล), npcs, hidden areas (ยังไม่ทำ), local quests (ยังไม่ทำ)
ส่วนที่แมพ Functional ทั้งสองยังขาด: map boss, hidden areas, local quests และ elite อีก 1–2 ชนิด
