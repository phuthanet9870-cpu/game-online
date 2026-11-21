# ROADMAP — 8 Phases (จาก MASTER_PROMPT §24)

| Phase | ชื่อ | ขอบเขตสิ้นสุด | สถานะ |
|---|---|---|---|
| 01 | HTML5 Combat Prototype | single-player combat ทดสอบในเบราว์เซอร์ | **Gate ผ่าน (รอเจ้าของเกมอนุมัติไป Phase 2)** |
| 02 | Online Authoritative Foundation | multiplayer 10–20 clients + persistence + server validation | ยังไม่เริ่ม — ต้องเลือก Java หรือ Go ก่อน |
| 03 | Weapons + The Power + Auto + GM HUD | 6 อาวุธ/18 สกิล, hotbar 20 ช่องครบ, Inferno+Abyss Shadow MVP, Auto, `/gmstefanonline` | ยังไม่เริ่ม |
| 04 | First Playable MVP | Aetheria + 3 farm maps, เมือง/NPC, party, dungeon ผ่าน Gatekeeper, 1v1, trade | ยังไม่เริ่ม |
| 05 | World Boss + Dungeon/PvE Expansion | 8 farm maps, วงแดง, Ignivar/Yggdran | ยังไม่เริ่ม |
| 06 | Guilds + PvP + War Alpha | guild, 3v3/5v5, territory, guild war 10v10 | ยังไม่เริ่ม |
| 07 | Full World + Content Closed Beta | 32 แมพ, 150 power skills, 6 bosses, 8 dungeons, 1,350 items | ยังไม่เริ่ม |
| 08 | Production Hardening + Launch | load/security/backup/deploy/launch | ยังไม่เริ่ม |

Dependency chain: bootstrap → canvas/movement → combat/skills → authoritative networking → persistent items/economy → Power/Auto → city/NPC/party/dungeon → boss portals → PvP/Guild War → full catalog → Launch Ops.

กฎ: ทำทีละ Phase, ขึ้น Phase ถัดไปเมื่อผ่าน Acceptance Gate **และ** เจ้าของเกมอนุมัติ (MASTER_PROMPT §29 ข้อ 7)
