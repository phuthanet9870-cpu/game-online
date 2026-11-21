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

## ADR-005 — Server language: **Go** — ACCEPTED (เจ้าของเกมเลือก 2026-11-21)
- Go 1.24 (`server/`, module `github.com/phuthanet9870-cpu/game-online/server`) — **ไม่ทำ Java คู่ขนาน**
- Modular monolith: `internal/{auth,content,game,httpapi,ratelimit,rbac,realtime,store}` binary เดียว (`cmd/gameserver`)
- Libraries: `jackc/pgx/v5` (PostgreSQL), `coder/websocket` (WSS), `golang.org/x/crypto/argon2` (password hashing)
- เวอร์ชัน pin ให้เข้ากับ Go 1.24 ใน environment (x/crypto v0.40.0, pgx v5.7.5)

## ADR-006 — Dev map ไม่นับใน 32 แมพ — ACCEPTED
`DEV-TRAINING-01 "Training Ground (PLACEHOLDER)"` เป็นแมพทดสอบ Phase 1 เท่านั้น ไม่ใช่หนึ่งใน 30 ฟาร์ม/2 เมือง

## ADR-007 — QA hook `window.__TPE__` — ACCEPTED (Phase 1 เท่านั้น)
ใช้ให้ Playwright **อ่าน** state; ต้องถอด/จำกัดด้วยสิทธิ์ QA เมื่อมี server ใน Phase 2

## ADR-008 — Authority & protocol (Phase 2) — ACCEPTED
- Client ส่งเฉพาะ **intent**: `{t:"input", seq, mv:[x,y], aim, act:[...]}` — ไม่ส่งตำแหน่ง/ดาเมจ/ไอเทม
- Server: fixed tick **30 Hz**, snapshot **15 Hz** (ทุก 2 tick) พร้อม `ack` = seq ล่าสุดที่รับ; seq ซ้ำ/ย้อนหลังถูกทิ้ง (anti-replay)
- move vector ถูก clamp ≤ 1 และความเร็วอยู่ที่ server → speed hack ไม่มีผล; action ต่อ message ≤ 4, input ≤ 40/s (burst 60), ละเมิดเกิน 200 ครั้ง → kick
- Client: ทำนายเฉพาะการเดินของตัวเอง + แก้ด้วย lag-compensated history; ผู้เล่นอื่น/มอนสเตอร์ interpolate ย้อนหลัง 100 ms
- Event JSON ของ server ใช้รูปแบบเดียวกับ `SimEvent` ของ client → renderer ใช้ร่วมกันได้

## ADR-009 — Economy persistence — ACCEPTED
- In-memory state ของตัวละครที่ออนไลน์เป็น authority ระหว่างเล่น; ทุกการเปลี่ยนแปลงเศรษฐกิจถูกส่งเข้า **Persister** (คิวเดียว ตามลำดับ, retry backoff)
- ทุก write มี `tx_id` unique ใน `transactions` → retry/ซ้ำ = no-op (`kill:<instance>:<monster>:<deathSeq>:<char>`, `use:<random>`, `starter:<char>`)
- Ledger (`item_ledger`, `currency_ledgers`, `xp_ledger`) และ `gm_audit_log` เป็น append-only ด้วย trigger
- Reward แบบ **personal loot** ให้ผู้มีส่วนร่วม ≥ 15% ของดาเมจ `[TUNING]` — ไม่ใช่ last-hit
- ล็อกอินซ้ำตัวละครเดียวกัน → ตัด socket เก่า ใช้ entity เดิม (ไม่มี 2 สำเนา → ไม่มี dupe)

## ADR-010 — Sessions & auth — ACCEPTED
- argon2id (m=19 MiB, t=2, p=1), session token 32 bytes เก็บเฉพาะ SHA-256 ใน DB, cookie `HttpOnly; SameSite=Strict` (+`Secure` เมื่อ `SECURE_COOKIES=true`/TLS), อายุ 7 วัน, revoke ตอน logout
- POST ต้องเป็น `application/json` + Origin ตรง host หรืออยู่ใน `ALLOWED_ORIGINS`; body ≤ 4 KB; unknown fields ถูกปฏิเสธ
- Rate limit auth ต่อ IP `[TUNING]` 20/นาที, ล็อกบัญชี 15 นาทีหลังผิด 10 ครั้ง
- TLS/HTTPS/WSS ทำที่ reverse proxy ใน production (Phase 8) — dev ใช้ HTTP/WS บน localhost

## ADR-011 — GM RBAC แบบ capability — ACCEPTED
- role → capabilities ในโค้ด (`internal/rbac`); ตรวจด้วย capability เสมอ ไม่ใช่เลข rank
- `/gmstefanonline` = toggle GM HUD เฉพาะ `gm.hud.open`; ไม่มีสิทธิ์ → `Permission Denied` + audit `denied` + warn log
- การให้ role ทำได้เฉพาะ CLI ฝั่ง server (`gameserver grant-role`) ซึ่งต้องมีสิทธิ์เข้าเครื่อง/DB; ไม่มีทางยกระดับจากในเกม
- คำสั่งทดสอบ (`/gm god`, `/gm heal`) ใช้ได้เมื่อ `TEST_WORLD=true` เท่านั้น
