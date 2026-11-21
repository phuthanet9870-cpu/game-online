# TEST_PLAN

## วิธีรัน
```
npm install
npm run typecheck
npm test                                   # unit + integration (node:test)
npm run build
node tests/e2e/artifact-smoke.mjs          # เบราว์เซอร์จริง, เซิร์ฟเวอร์ใน Web Worker
node tests/e2e/online-multiplayer.mjs      # 2 เบราว์เซอร์จริง + Node WebSocket server + SQLite
```

## ผลล่าสุด (2026-11-21)
- `npm test`: **30 pass / 0 fail**
- `artifact-smoke`: ผ่าน (register → create → เข้าเมือง → เดิน → inventory → ปลดล็อก GM → วาร์ปเข้าทุ่ง) และ console error = 0
- `online-multiplayer`: ผ่าน (ผู้เล่นสองคนเห็นกันผ่านเซิร์ฟเวอร์, แชตข้ามคน, รหัส GM ผิดถูกปฏิเสธ, GM ให้ทองผู้เล่นอื่นได้, /health ปกติ, tick สูงสุด ~2ms)

## ความครอบคลุม
| หมวด | เทสต์ |
|---|---|
| Config | อ้างอิงข้ามไฟล์ครบ, จุดเกิด/พอร์ทัล/spawn เดินถึงได้, ราคาซื้อ > ราคาขาย (กันเงินงอก) |
| Movement | client replay = server ทุกบิต (300 input สุ่ม), ชนกำแพง, stamina/cooldown ของ dodge |
| Combat | สูตร mitigation/crit/PvP/DR cap, hit shapes, ระยะเกิน = ไม่โดน, cooldown กันสแปม, i-frame ของ dodge |
| AI | aggro → chase → leash → กลับบ้าน + ฟื้น HP |
| Loot | อัตราดรอปตามสถิติ (20k rolls), เศษพลังอยู่ในช่วง 0.5–2%, ownership, ไม่เก็บซ้ำ, กระเป๋าเต็ม |
| Inventory | stack, all-or-nothing, level req, bind on equip, integrity |
| Economy | ซื้อ/ขาย, gold ไม่พอ, ระยะ NPC, audit |
| Security | malformed → kick, input flood ถูกจำกัด, replay seq ถูกทิ้ง, ก่อน hello ถูกปฏิเสธ, GM ต้องใช้รหัส |
| Persistence | migrations idempotent, version กัน save ซ้ำ, rollback เมื่อ uid ซ้ำ, ข้อมูลอยู่รอดหลัง restart, backup อ่านได้ |
| Session | reconnect ภายใน grace ได้ entity เดิม, หลุดเกิน 15s ถูกบันทึกและนำออก |
| GM | ทุกคำสั่งหลัก + ban/unban + audit |

## ยังไม่ได้ทดสอบ (ต้องทำก่อน production)
- Load test (จำนวนผู้เล่นพร้อมกัน, 50v50/100v100)
- Network jitter/packet loss บน WebSocket จริงข้ามภูมิภาค
- Fuzzing protocol อัตโนมัติ
- Security review จากภายนอก
