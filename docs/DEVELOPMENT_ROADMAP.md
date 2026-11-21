# DEVELOPMENT_ROADMAP

| Milestone | เนื้อหา | สถานะ |
|---|---|---|
| **M1 Foundation** | โครงสร้าง, client/server, auth, สร้างตัวละคร, เดิน, กล้อง, ต่อสู้พื้นฐาน, DB | ✅ เสร็จ (Tested) |
| M1.5 Vertical slice ส่วนแรก | เมือง 1, แมพฟาร์ม 2, ดาบ+คทา, มอนสเตอร์+AI, loot, inventory, equipment, shop, GM | ✅ เสร็จ |
| Vertical slice ส่วนที่เหลือ | The Power 1 ผล (แนะนำ Solar Inferno), Map Boss 1 ตัว (Greenfall), Dungeon 1 แห่ง (Ancient Tree Labyrinth), Duel 1v1 | ⏭ ถัดไป |
| M2 Core Gameplay | อาวุธที่เหลือ 4 ชนิด, mastery traits, quest พื้นฐาน | Designed |
| M3 The Power | 6 ผล + สเปก 150 สกิล, loadout, mastery, awakening, ritual, pity/exchange | Designed |
| M4 Equipment Progression | +20, options/reforge, sockets/runes/fusion, crafting | Designed |
| M5 World Content | Warhaven, แมพที่เหลือ 27, map bosses 30, world bosses 6, dungeons 6, auto farm | Designed |
| M6 Social | party, guild, chat channels/PM/friends/block/report, trade, marketplace, matchmaking | Designed |
| M7 PvP | duel, arena (MMR/season), battleground, open PvP, guild war, castle siege | Designed |
| M8 Optimization | load test, binary protocol, zone sharding, Postgres, monitoring, security review | Not Started |

ลำดับ dependency: The Power ต้องใช้ loadout UI และ instance zone → Ritual · Boss/Dungeon ต้องใช้ instance + contribution · Guild War ต้องใช้ Guild + PvP + load test
