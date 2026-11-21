# PHASE 01 — HTML5 COMBAT PROTOTYPE

**Boundary:** Start: สร้างโปรเจกต์และหน้าเบราว์เซอร์แรก → End: single-player combat ที่ทดสอบในเบราว์เซอร์ HTML5 แล้ว
**สถานะ:** Acceptance Gate ผ่าน (อัตโนมัติ + ตรวจด้วยตา) — **รอเจ้าของเกมอนุมัติก่อนเริ่ม Phase 2**

## Checklist (MASTER_PROMPT §24 Phase 01)
| งาน | ผล | หลักฐาน |
|---|---|---|
| Inspect repo; Vite + Phaser + TS strict + lint/test scripts | ✅ | `package.json`, `apps/web-game/*config*` |
| index.html + Phaser boot/main scene + resize/fullscreen | ✅ | `index.html`, `src/main.tsx`, `WorldScene.ts`; Settings → Fullscreen; E2E resize test |
| design resolution, pixelArt, nearest filter, camera, input manager | ✅ | logical 640×360, integer zoom (`computeZoom`), `pixelArt/roundPixels`, `KeyboardInput` |
| placeholder tilemap/assets (มีป้าย) + collision map | ✅ | `game-data/maps/training-ground.json` (Tiled JSON), `textures.ts`, ป้าย PLACEHOLDER |
| Player 8-direction walk/idle + deterministic movement | ✅ | spritesheet 8 แถว × (idle 2, walk 4, hit, dead); `movement.test.ts` |
| Basic Sword attack hitbox/hurtbox + floating damage + feedback | ✅ | arc-vs-circle hitbox, knockback, flash, damage text |
| Monster AI idle/patrol/chase/attack/death/respawn | ✅ | `IDLE→PATROL→ALERT→CHASE→ATTACK→RESET→DEAD→respawn`; Slime + Wolf |
| HP, death/respawn, dash/stamina, sword 3 skills | ✅ | Triple Slash, Guard Break, Counter Slash; Dodge 25 ST + i-frames; Death Recap |
| Minimal React HUD + debug overlays | ✅ | HP/ST, hotbar 20 ช่อง, target, minimap, log/chat, Gate panel; F3 overlay |
| Vitest unit tests + Playwright smoke | ✅ | 45 unit, 3 E2E (ดู test-logs) |

## Acceptance Gate
| เงื่อนไข | ผล |
|---|---|
| โหลดผ่าน localhost HTTP | ✅ `vite preview` 127.0.0.1:4173 (Playwright) |
| เดินด้วยคีย์บอร์ด + collision | ✅ E2E เดินครบ 8 ทิศ, ชนแนวต้นไม้ขอบแมพ |
| ศัตรูโดนตี/ตาย/เกิดใหม่ | ✅ E2E ฆ่า ≥1 ตัว และรอ respawn |
| 3 sword skills | ✅ E2E ใช้ครบ 3 ท่า; unit test ยืนยันผลแต่ละท่า |
| Dodge ใช้ stamina | ✅ unit + E2E |
| ไม่มี blocking runtime error | ✅ E2E ตรวจ `pageerror`/console error = 0 |
| Tests + screenshots/logs | ✅ `docs/test-logs/phase01-*.log`, screenshot `apps/web-game/test-results/phase1-gate.png` (ไม่ commit) |

## Combat numbers (ทั้งหมด `[TUNING]`)
ดู `game-data/weapons/weapons.json`, `player-base.json`, `monsters/phase1-monsters.json`
- Damage pipeline: base → weapon coef → stat scaling (=1 ใน P1) → skill mod → defense `def/(def+50)` → crit → PvE/PvP mod → absorb → clamp [1, 999999]
- Basic: CD 420ms, arc 120° r30 · Triple Slash: 3 hits 0.7/0.7/1.2, CD 4s, 15 ST · Guard Break: 1.6x, DEF ×0.5 4s, interrupt, CD 6s, 20 ST · Counter Slash: stance 0.7s, สวน 2.5x, CD 8s, 10 ST
- Dodge: 25 ST, 58px/170ms, i-frames, CD 450ms · Stamina 100, regen 28/s หลังหยุดใช้ 650ms

## วิธีรัน
```bash
npm install
npm run dev            # http://127.0.0.1:5173
npm run check          # validate:data + typecheck + lint + unit + build
npm run test:e2e       # build ก่อน (npm run build) แล้ว Playwright จะเปิด vite preview เอง
npm run build:single   # ไฟล์ HTML เดียวสำหรับแชร์ทดสอบ (dist-single/)
```

## Known issues / ข้อจำกัดตามจริง
- ทดสอบอัตโนมัติเฉพาะ **Chromium (Playwright 1.63)** — **ยังไม่ได้ทดสอบ Firefox/Edge/Safari จริง** (ไม่มี browser เหล่านั้นใน environment)
- ไม่มี server/บัญชี/ไอเทม/EXP/Gold — เป็นขอบเขต Phase 2; UI ที่เกี่ยวข้องแสดง 🔒 พร้อมเลข Phase
- ไม่มีเสียง; ไม่มี touch controls (มือถือเป็นงานแยกตามสเปก)
- ภาพทั้งหมดเป็น placeholder ที่วาดด้วยโค้ด; animation โจมตีใช้ sprite ดาบหมุน + VFX แทน frame จริง
- WebGL context-loss: มี log แต่ **ยังไม่ได้ทดสอบการกู้คืนจริง**
- FPS/หน่วยความจำ: ยังไม่ได้วัดอย่างเป็นระบบ (headless Chromium แสดง ~47–60 FPS ระหว่างทดสอบ — ไม่ใช่ benchmark)
- Bundle 1.48 MB (gzip ~420 KB) ส่วนใหญ่เป็น Phaser; ยังไม่ได้ทำ code-splitting
- ข้อความ `/gmstefanonline` ถูกปฏิเสธเสมอฝั่ง client (ยังไม่มี server ตรวจสิทธิ์) — ตรงตามกฎ แต่การ log "suspicious attempt" ยังเป็นแค่ log ในเครื่อง
