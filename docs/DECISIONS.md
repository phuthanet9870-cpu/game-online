# DECISIONS (ADR log)

## ADR-001 — Client stack (Phase 1) — ACCEPTED
- **Phaser 3.90.0** (ไม่ใช่ Phaser 4.x ล่าสุด): API v3 เสถียรและเอกสารครบ ลดความเสี่ยงใน Phase ต้นแบบ; อัปเกรดเป็น v4 ได้ภายหลังเพราะ logic เกมอยู่ใน `src/core` ที่ไม่ import Phaser
- **React 19** สำหรับ HUD, **Vite 7.3** (ไม่ใช่ Vite 8 เพราะ `vite-plugin-singlefile` ยังต้องการ rollup), **TypeScript 5.9 strict** (+`noUncheckedIndexedAccess`)
- **Vitest 5** unit tests, **Playwright 1.63** browser smoke/E2E, **ESLint 9 + typescript-eslint**, **Prettier**
- npm workspaces (`apps/*`) — ไม่บังคับ pnpm

## ADR-002 — Simulation แยกจาก rendering — ACCEPTED
`apps/web-game/src/core/*` เป็น TypeScript ล้วน (ไม่ import Phaser/React) deterministic ด้วย seeded RNG และ fixed timestep 60 Hz
- Phaser scene เป็นแค่ renderer + input; React รับ snapshot ผ่าน typed bridge (`src/game/bridge.ts`)
- ใน Phase 2 กฎเดียวกันจะถูก **port ไปที่ server (Java หรือ Go)** เป็น authority; ฝั่ง client ใช้เป็น prediction เท่านั้น

## ADR-003 — Placeholder art แบบ procedural — ACCEPTED (ชั่วคราว)
ยังไม่มี asset จริง จึงวาด pixel-art ด้วยโค้ด (`src/game/textures.ts`) และติดป้าย PLACEHOLDER ใน UI; ภาพ mockup ใน zip **ไม่ใช้เป็น sprite**

## ADR-004 — Default keybinds ของ hotbar 20 ช่อง — PROPOSED
- แถว 1 (ช่อง 1–10): `1 2 3 4 5 6 7 8 9 0`
- แถว 2 (ช่อง 11–20): `Q E R T F G Z X C V` (หลีกเลี่ยง WASD และปุ่ม F1–F12 ที่ชนกับเบราว์เซอร์ เช่น F5/F11/F12)
- Alias: `Space`/`Shift` = Dodge (ช่อง 12), `J`/คลิกซ้าย = Basic Attack, `F3` = Debug, `Enter` = แชท
- Remap + presets บันทึกผ่าน server ใน Phase 3

## ADR-005 — Server language (Java vs Go) — **PENDING (ต้องให้เจ้าของเกมเลือกก่อน Phase 2)**
ยังไม่มีโค้ด/ทีมเดิมใน repo ให้ใช้ตัดสิน ข้อเสนอเบื้องต้น: **Go** (goroutine ต่อ zone/instance, binary เดียว deploy ง่าย, WebSocket lib เสถียร) — แต่ถ้าทีมถนัด JVM ให้เลือก Java 21 LTS

## ADR-006 — Dev map ไม่นับใน 32 แมพ — ACCEPTED
`DEV-TRAINING-01 "Training Ground (PLACEHOLDER)"` เป็นแมพทดสอบ Phase 1 เท่านั้น ไม่ใช่หนึ่งใน 30 ฟาร์ม/2 เมือง

## ADR-007 — QA hook `window.__TPE__` — ACCEPTED (Phase 1 เท่านั้น)
ใช้ให้ Playwright **อ่าน** state; ต้องถอด/จำกัดด้วยสิทธิ์ QA เมื่อมี server ใน Phase 2
