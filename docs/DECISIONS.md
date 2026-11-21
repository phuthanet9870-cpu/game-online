# DECISIONS LOG

## D-001 · 2026-11-21 · Client technology: Web (HTML5 Canvas + JavaScript) แทน Godot 4.x
- **สถานะ:** ยืนยันโดยเจ้าของโปรเจกต์ (เลือกตัวเลือก "Web-native JS" ในแชต 2026-11-21)
- **Conflict:** Master Prompt §20/§26 ระบุ client เป็น Godot 4.x/GDScript (ไม่ใช่กฎ LOCKED) แต่เจ้าของต้องการเกมที่เล่นบนเว็บและส่งเป็น artifact ได้ — Godot 4 web export ต้องใช้ไฟล์ `.wasm` ราว 37 MB ซึ่งเกินขีดจำกัดไฟล์ของ artifact (15 MB ต่อไฟล์ binary)
- **การตัดสินใจ:** Phase 1 ใช้ JavaScript (ES2022) + Canvas 2D, bundle เป็น HTML ไฟล์เดียวด้วย esbuild
- **ผลกระทบ:** `client/` เป็นโปรเจกต์เว็บแทน `project.godot`; logic เกมแยกไว้ใน `client/src/core/` แบบ pure JS (ไม่มี DOM) เพื่อนำไปรันฝั่ง server ได้ใน Phase 2 — ทำให้ตัวเลือก server เป็น Node/TypeScript น่าพิจารณาด้วย (spec เสนอ Go หรือ C#) → **ต้องตัดสินใจก่อนเริ่ม Phase 2 (D-pending)**

## D-002 · 2026-11-21 · Phase 1 รัน simulation ใน browser (offline)
- Phase 1 acceptance กำหนด "เปิดเล่น offline ได้" จึงยังไม่มี server
- เพื่อไม่ขัดกฎ #24 (server authority) client ส่งเพียง *intent* (`setMoveInput`, `requestAction`) ให้ `Simulation` ซึ่งตรวจ cooldown/stamina/range/LOS/damage ทั้งหมด; renderer/HUD อ่านค่าอย่างเดียว
- `window.__TPE` เปิดให้ smoke test อ่าน/ตั้งค่าได้ — ใช้ได้เฉพาะ build offline; Phase 2 client จะไม่มี authority อีก

## D-003 · 2026-11-21 · ค่าตัวเลขทั้งหมดเป็น [TUNING]
- HP, ดาเมจ, cooldown, stamina, ระยะ hitbox, ระยะ aggro/leash อยู่ใน `game-data/config/phase1_combat.json`, `weapon_skills.json`, `monsters.json` — **TODO: BALANCE** ไม่มีค่าใดผ่านการยืนยันจากเจ้าของ
- สูตร: `final = clamp(((weaponBase × coef) + physAtk × strScaling) × skillMult × (1 − def/(def+50)) × crit × PvE/PvP − absorb)`

## D-004 · 2026-11-21 · การออกแบบ Sword 3 สกิล (ชื่อ LOCKED, กลไก DESIGN)
- **Triple Slash:** 3 ฮิต (0.7/0.7/1.1×) ก้าวไปข้างหน้าเล็กน้อย, CD 5s, Stamina 15
- **Guard Break:** ชาร์จ 0.32s มีวงเตือนสีฟ้า (สีของฝั่งเรา), 1.6×, Stun 0.9s + Guard Broken (DEF ×0.4, 5s), CD 9s, Stamina 20
- **Counter Slash:** ท่ารับ 0.8s; ถ้าโดนตีระหว่างท่า → บล็อกดาเมจ, อมตะ 0.38s, สวน 2.4× คริติคอลแน่นอน, CD 10s, Stamina 10
- Stun มี diminishing returns (1 → 0.5 → 0.25 → immune ภายใน 15s)

## D-005 · 2026-11-21 · Hotbar keybinds เริ่มต้น
- แถว 1: ปุ่ม `1`–`0`; แถว 2: `Shift+1`–`Shift+0`; Dodge (ช่อง 12) = `Space` ด้วย; ปุ่มสำรอง J/K/L/I สำหรับช่อง 1–4
- Keybind เก็บเป็น data (`DEFAULT_KEYBINDS`) — UI สำหรับเปลี่ยนปุ่มและลากจัดเรียงช่องอยู่ใน Phase 3

## D-006 · 2026-11-21 · Placeholder art
- Sprite ทั้งหมดวาดด้วยโค้ด (`client/src/render/sprites.js`) ระบุ PLACEHOLDER ในหน้าเกม; มี 4 ทิศ (ซ้าย = กลับด้านขวา), เดิน 4 เฟรมขาสลับ, outline 1px
- เสียงสังเคราะห์ด้วย WebAudio ณ runtime (ไม่มี asset ที่ต้องมีลิขสิทธิ์)
