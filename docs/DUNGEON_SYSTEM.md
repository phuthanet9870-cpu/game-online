# DUNGEON_SYSTEM

สถานะ: **Designed** (ใช้ `Zone` เดิมเป็น instance แบบชั่วคราว)

| ดันเจี้ยน | ผู้เล่น |
|---|---|
| Ancient Tree Labyrinth | 1–4 |
| Sunken Pharaoh Tomb | 4 |
| Frozen King's Palace | 4–6 |
| Shadow Ninja Temple | 1–4 |
| Thunder Sky Fortress | 4–6 |
| Gravity Void Rift | 6–8 |

- Difficulty: Normal / Hard / Nightmare **Nightmare ต้องเพิ่มกลไกใหม่** (เช่น เพิ่ม telegraph, มีพื้นที่ปิดตาย, add ที่ต้องจัดการก่อน) ไม่ใช่แค่ HP×
- Lifecycle: matchmaking (party/queue) → create instance (seed) → waves → boss → loot (personal loot ต่อคน) → lockout (`dungeon_lockouts(character_id, dungeon, difficulty, reset_at)`) → cleanup เมื่อว่าง 120s
- Disconnect: ที่นั่งถูกจองไว้ 3 นาที กลับเข้ามาได้ด้วย instance id
