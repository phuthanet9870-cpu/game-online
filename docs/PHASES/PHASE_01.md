# PHASE 01 — CORE COMBAT PROTOTYPE

**Objective:** พิสูจน์ความสนุกและความถูกต้องของ combat ก่อนทำ MMORPG เต็มโลก

## Acceptance (จาก Master Prompt §24) และหลักฐาน
| เกณฑ์ | หลักฐาน | ผล |
|---|---|---|
| เปิดเล่น offline ได้ | `dist/the-power-eclipse.html` เปิดจาก `file://` ได้ (smoke test โหลดแบบนี้) | ผ่าน |
| ตีโดนตาม hitbox | unit: arc geometry, hit-once-per-swing, facing-away miss, LOS block | ผ่าน |
| มอนสเตอร์ไล่โจมตี/ตาย/เกิด | unit: ALERT→CHASE→ATTACK→damage, death→respawn, leash reset; smoke: ฆ่าได้จริงใน browser | ผ่าน |
| Dash ใช้ stamina | unit + smoke (100 → 70) | ผ่าน |
| Death/Respawn ไม่ค้าง | unit state machine; soak 600s (seed 42): ฆ่า 89 · ตาย 8 ครั้ง · อยู่ในสถานะตายนานสุด 3.80s (= 3s + 0.8s ตามดีไซน์) | ผ่าน |
| ไม่มี crash ระดับ blocker | smoke: 0 console/page errors; soak 36,000 ticks ไม่มี NaN/ทะลุกำแพง | ผ่าน |
| มี run instructions + regression checklist | `README.md` + ด้านล่าง | ผ่าน |

## Scope ที่ส่งมอบ
test map (ไม่ใช่ core map), 8-direction controller, camera follow + clamp + shake, 4-direction sprites + walk cycle, collision (tile AABB + substep), hitbox/hurtbox, basic sword attack, HP/Damage/Death/Respawn + Death Recap, Dash/Stamina + i-frames, 1 monster type (Ashfang Wolf ×3 spawn) พร้อม AI 8 สถานะ + telegraph, Sword 3 skills, debug HUD/overlay (F1), 20-slot hotbar (4 ช่อง + Dodge ใช้งานได้, ที่เหลือล็อกพร้อมระบุ Phase), tests

## Out of scope (ตาม spec)
auth/online, full world, 1,350 items, Powers runtime, GM HUD / `/gmstefanonline`

## Manual regression checklist (ทำก่อนปิดแต่ละ build)
- [ ] เดินครบ 8 ทิศ ความเร็วแนวทแยงเท่าแนวตรง
- [ ] เดินชนกำแพง/หิน/ต้นไม้/บ่อน้ำ แล้วไถลตามขอบ ไม่ทะลุ
- [ ] Dash เข้ากำแพงไม่ทะลุ; Dash ตอน Stamina < 30 ขึ้นข้อความ "Stamina ไม่พอ"
- [ ] หมาป่าเห็น "!" → ไล่ → วงแดงก่อนกัด → Dodge ผ่านวงแดงแล้วขึ้น DODGED
- [ ] ยืนหลังกำแพงแล้วหมาป่าไม่ aggro; ตีข้ามกำแพงไม่โดน
- [ ] Triple Slash ขึ้นเลข 3 ครั้ง; Guard Break ขึ้น STUN + GUARD BREAK และหลอด HP ศัตรูเป็นสีส้ม
- [ ] Counter Slash ตอนหมาป่ากัด → COUNTER! และเลขคริติคอลสีเหลือง
- [ ] ล่อหมาป่าออกไกลจากจุดเกิด → กลับบ้าน, เลือดเต็ม, ตีแล้วขึ้น EVADE
- [ ] ตาย → Death Recap → นับถอยหลัง 3s → เกิดใหม่กระพริบ (Spawn Protection)
- [ ] ฆ่าหมาป่า → หายไป → เกิดใหม่ที่จุดเดิมใน 5s
- [ ] F1 แสดง hitbox/aggro/leash/LOS และ damage trace; P หยุดเวลาจริง
- [ ] หน้าจอกว้าง 390px ไม่มี scroll แนวนอน, Hotbar เห็นครบ 20 ช่อง

## Gate
**หยุดที่ Phase 1 จนกว่าเจ้าของโปรเจกต์จะยอมรับ** — Phase 2 ต้องตัดสินใจภาษา server ก่อน (ดู DECISIONS D-001)
