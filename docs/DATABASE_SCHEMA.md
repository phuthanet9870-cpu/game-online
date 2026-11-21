# DATABASE_SCHEMA

Engine: SQLite (WAL, foreign_keys ON) ผ่าน `src/server/storage/sqlite.ts` ส่วนเกมใช้ผ่าน interface `Storage` เท่านั้น

## Migrations (`schema_migrations`)
| id | name | เนื้อหา |
|---|---|---|
| 1 | initial | accounts, characters, items, audit_log |
| 2 | account_bans | `accounts.banned_until` |

migration ทำงานอัตโนมัติตอนบูต แต่ละอันอยู่ใน transaction และรันซ้ำได้ (idempotent มีเทสต์)

## ตาราง (ปัจจุบัน)
**accounts** `id PK, username UNIQUE, pass_hash ("pbkdf2$iter$hex"), salt, created_at, banned_until`

**characters** `id PK, account_id FK, name, name_lower UNIQUE, appearance JSON, level, exp, rested_exp, gold CHECK>=0, zone_id, x, y, hp, energy, mastery JSON, created_at, last_seen, version`

**items** `uid PK, character_id FK, def_id, qty CHECK>0, rarity, ilvl, enhance, bound, slot, equip, UNIQUE(character_id, slot), UNIQUE(character_id, equip)`

**audit_log** `id, at, account_id, character_id, kind, data JSON` ได้แก่ register, char_create, enter_world, loot_roll, loot_pickup, shop_buy, shop_sell, discard, gm_command, gm_unlock(_failed), kick_violations, integrity_error

## กติกาความถูกต้อง
- `saveCharacter` = UPDATE แถว character โดยมีเงื่อนไข `version = v-1` (optimistic concurrency) แล้วลบและเขียน items ใหม่ทั้งชุด **ภายใน transaction เดียว** ถ้า uid ซ้ำ PK จะล้มทั้งก้อนและ rollback
- เซิร์ฟเวอร์ตรวจ `Inventory.validate()` ก่อน save ถ้าพบความผิดปกติจะไม่บันทึกและเขียน audit แทน
- การ save ของตัวละครเดียวกันถูกต่อคิว (promise chain) จึงไม่มี save ซ้อนกัน
- ช่วงเวลาที่บันทึก: autosave 30s (เมื่อมีการเปลี่ยนแปลง), เปลี่ยนโซน, level up, ซื้อขาย, equip, GM item/gold, หลุด, logout, shutdown

## Backup
- `SqliteStorage.backup(path)` ใช้ `VACUUM INTO` (online, consistent snapshot) มีเทสต์ยืนยันว่าเปิดไฟล์ backup แล้วอ่านได้
- แนะนำสำหรับ production: รัน backup ทุกชั่วโมงไปยัง object storage เก็บย้อนหลัง 7 วัน และทดสอบ restore ทุกสัปดาห์ (ยังไม่ได้ทำ cron นี้)

## ตารางที่วางแผนไว้ (ยังไม่สร้าง)
power_collection, power_mastery, skill_loadouts, item_options, item_sockets, runes, enhancement_history, reforge_history, quests, guilds, guild_members, guild_storage, guild_wars, territories, market_listings, market_transactions, price_history, boss_state, dungeon_lockouts, rankings, seasons, mail
