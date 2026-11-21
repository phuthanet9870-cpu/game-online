# IMPLEMENTATION_STATUS

อัปเดตล่าสุด: 2026-11-21 · เวอร์ชัน 0.1.0 (Milestone 1 + ส่วนแรกของ Vertical Slice + ระบบ GM)

ระดับสถานะ: **Not Started** → **Designed** → **Implementing** → **Prototype** → **Functional** → **Tested** → **Production Ready**

> ยังไม่มีระบบใดอยู่ในระดับ **Production Ready** เพราะยังไม่ได้ทำ load test, security audit จากภายนอก หรือ deploy จริง
> "Tested" = มีเทสต์อัตโนมัติที่รันผ่าน (ดู TEST_PLAN.md) ไม่ได้แปลว่าพร้อมเปิดให้บริการ

## ระบบที่ทำแล้ว

| ระบบ | สถานะ | หลักฐาน / หมายเหตุ |
|---|---|---|
| โครงสร้างโปรเจกต์ (TS, esbuild, shared/server/client) | Tested | `npm run typecheck`, `npm run build` |
| Server-authoritative GameServer (transport-agnostic) | Tested | `tests/server.test.ts` |
| Node WebSocket server + static hosting + /health | Tested | `tests/e2e/online-multiplayer.mjs` (2 เบราว์เซอร์จริง) |
| In-browser server (Web Worker, fallback main thread) | Tested | `tests/e2e/artifact-smoke.mjs` |
| Authentication (register/login, PBKDF2, token resume, rate limit) | Tested | server.test: auth, persistence/reconnect |
| Character creation (ชื่อ เพศ ใบหน้า ทรงผม สีผม สีผิว ชุด อาวุธเริ่มต้น) | Tested | server.test, e2e |
| Character stats 20 ค่า + caps + PvE/PvP multipliers (config) | Tested | shared.test: stats, damage |
| Level 1-100, EXP, level-diff penalty, rested EXP, death EXP loss | Tested | shared.test: progression |
| Weapon Mastery (แยกต่ออาวุธ, ได้จากการตี/ฆ่า, +1% ดาเมจ/เลเวล) | Functional | ทำงานในเกม; unlock traits ยังไม่ทำ |
| Movement + collision + dodge/i-frames + block (shared sim) | Tested | shared.test: determinism, server.test: dodge |
| Client prediction + reconciliation + interpolation | Functional | e2e (corr 0 ใน local); ยังไม่มีเทสต์อัตโนมัติภายใต้ jitter |
| Lag compensation (rewind ≤300ms) | Tested | server.test: attack range/cooldown |
| Combat: normal (คอมโบ 3), heavy, dodge, block, CC (stun/knockback/slow), shields, counter | Tested | server.test: combat |
| อาวุธครบ 6 ชนิด × 3 สกิล (spec ครบตาม 5.7) | Tested | `tests/weapons.test.ts` + e2e ทุกอาวุธ |
| Point-and-click (เดิน/โจมตี/คุย/เก็บ/คลิกสกิล, A* pathfinding) | Tested | `tests/pathfind.test.ts`, e2e |
| Auto Farm (เซิร์ฟเวอร์ควบคุม) | Tested | `tests/auto.test.ts`, e2e |
| Monster AI (idle/patrol/detect/chase/attack windup/cast/retreat-keep-distance/leash/return/death/respawn) | Tested | server.test: AI leash |
| Telegraphed monster attacks (หลบได้) | Tested | server.test: dodge i-frames |
| Dynamic spawn (ตามจำนวนผู้เล่น) + farming soft cap (anti-bot) | Functional | soft cap มี unit test ของ loot multiplier |
| Loot (server-only, ownership 30s, no double claim, overflow) | Tested | server.test: loot |
| Inventory (40 ช่อง, stacking, equip/unequip, integrity check) | Tested | shared.test: inventory |
| Equipment 7 ช่อง + rarity 6 ระดับ + binding | Functional | ยังไม่มี random options / sockets (Milestone 4) |
| NPC shop (ซื้อ/ขาย, ตรวจระยะ, audit) | Tested | server.test: shop |
| Resource gathering nodes | Functional | ทดสอบด้วยมือ |
| Environmental hazards (mud slow, thorns DoT) | Functional | ทดสอบด้วยมือ |
| Zone chat + rate limit + มิวต์ | Functional | e2e online chat |
| Persistence: SQLite + migrations + optimistic version + backup | Tested | sqlite.test (รวม restart) |
| Disconnect grace (15s) + reconnect resume | Tested | server.test: persistence |
| Anti-cheat พื้นฐาน (input budget, replay seq, validation, kick) | Tested | server.test |
| Config validation ตอนบูต (reference/reachability/ราคา) | Tested | shared.test |
| แผนที่: Aether Capital, Greenfall Plains, Whispering Forest | Functional | 3 จาก 32 แมพ |
| Pixel-art isometric renderer (chunk cache, depth sort, VFX) | Functional | screenshots ใน e2e |
| HUD (HP/EN/ST, skill bar + cooldown, minimap, buffs, net status, EXP) | Functional | ไม่มี Quest Tracker/Party (ยังไม่มีระบบ) |
| **ระบบ GM** (ดู GM_SYSTEM.md) | Tested | `tests/gm.test.ts`, e2e |

## ระบบที่ยังไม่ทำ

| ระบบ | สถานะ | Milestone |
|---|---|---|
| The Power (6 ผล, 150 ความสามารถ) | Designed (ชื่อ, schema) — **ยังไม่มีสเปกตัวเลขรายสกิล** | M3 |
| Skill Loadout / Power Mastery / Awakening | Designed | M3 |
| Power Rebirth Ritual | Designed | M3 |
| Power Fragment exchange / pity | Designed (เศษพลังดรอปได้แล้ว แต่ยังใช้ไม่ได้) | M3 |
| Enhancement +20, Option Reforge, Rune Socket/Fusion | Designed | M4 |
| Crafting | Designed | M4 |
| อีก 29 แมพ, Map Boss, World Boss, Dungeon | Designed (รายชื่อ/เงื่อนไข) | M5 |
| Party, Guild, Trading, Marketplace | Designed | M6 |
| Duel/Arena/Battleground/Open PvP/Guild War/Castle Siege | Designed | M7 |
| Quest system | Designed | M5–M6 |
| Load test, horizontal scaling | Not Started | M8 |
