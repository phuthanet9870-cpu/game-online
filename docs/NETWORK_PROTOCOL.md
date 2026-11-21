# NETWORK_PROTOCOL (v1)

Transport: WebSocket `/ws` ส่งข้อความเป็น JSON text frame (binary ถูกปิด) payload สูงสุด 4 KB มี heartbeat ping ทุก 15s
ในโหมดเบราว์เซอร์ใช้ `postMessage` กับ Web Worker แต่ส่งข้อความชุดเดียวกัน

## ลำดับการเชื่อมต่อ
`welcome` ← · `hello{v}` → · `register|login|resume` → · `auth_ok{token}` ← · `char_list` ↔ · `char_create` → · `char_select` → · `enter_zone` ← · `snap` ← (20/s)

## Client → Server
| t | ฟิลด์ | หมายเหตุ |
|---|---|---|
| hello | v | ต้องตรงกับ `PROTOCOL_VERSION` |
| register/login | user (3–20 a-z0-9_), pass (6–72) | rate limit 10/นาที/การเชื่อมต่อ |
| resume | token | token อายุ 12 ชม. (เก็บในหน่วยความจำเซิร์ฟเวอร์) |
| char_create | name, app, weapon | ชื่อตาม `NAME_RE` (อนุญาตภาษาไทย) |
| char_select | id | ต้องเป็นตัวละครของบัญชีนี้ |
| in | s (seq), mx,my (≤1.5), ax,ay, b (bitmask), vt (view tick) | ส่งทุก 50ms |
| pickup/gather/talk | id | ตรวจระยะบนเซิร์ฟเวอร์ |
| equip/use | uid · unequip slot · discard uid qty | |
| shop_buy npc item qty · shop_sell npc uid qty | | |
| respawn, chat text (≤200), ping c, logout | | ข้อความแชตที่ขึ้นต้นด้วย `/` คือคำสั่ง |

Bitmask `b`: 1 attack, 2 heavy, 4 dodge, 8 block, 16/32/64 skill1-3

## Server → Client
- `enter_zone {zone, selfId, tick, self, metas[]}`
- `snap {tick, ack, self, ents[], add[], rem[], ev[]}`
  - `ents`: `[id, x*100, y*100, facing*100, hp%, anim, flags]` (เฉพาะผู้เล่นและมอนสเตอร์ในเขตสนใจ)
  - `add`: meta ครั้งแรกเมื่อ entity เข้าเขต (ชื่อ, ลักษณะ, def) และ `rem` เมื่อออกจากเขต
  - `ev`: hit, act, proj, pend, tele (telegraph), die, heal, lvl, node, counter
- `char`, `inv`, `shop`, `dialog`, `chat`, `notice`, `error{code,msg}`, `pong`, `logged_out`, `gm`

## Reliability
WebSocket เป็น TCP จึง reliable ทุกข้อความ snapshot เป็น state ล่าสุดที่แทนที่ของเก่าได้เสมอ (idempotent) จึงย้ายไปช่องทาง unreliable ได้ภายหลังโดยไม่ต้องเปลี่ยน logic ส่วน event สำคัญ (inv, char, error) ต้องอยู่บนช่องทาง reliable ต่อไป

## Prediction / Reconciliation / Interpolation
1. client รัน `stepMove` ทันทีที่ส่ง input แล้วเก็บไว้ใน `pending`
2. เมื่อได้ `snap` จะตั้ง state ตาม `self` ของเซิร์ฟเวอร์ ทิ้ง input ที่ `s ≤ ack` แล้ว replay ส่วนที่เหลือ ความคลาดเคลื่อนจะถูกค่อยๆ ดูดกลืนใน 0.5s (ถ้าเกิน 3 ช่องจะ snap ทันที)
3. entity อื่นแสดงย้อนหลังประมาณ 2.2 tick (≈110ms) ด้วยการ lerp ระหว่าง snapshot
4. Lag compensation: input บอก `vt` (tick ที่ผู้เล่นเห็น) เซิร์ฟเวอร์ rewind ตำแหน่งเป้าหมายได้สูงสุด 6 tick (300ms) สำหรับการโจมตีที่ resolve ทันที การโจมตีที่มี cast time ใช้ตำแหน่งปัจจุบัน

## Anti-abuse
- Input budget: เติม 1 ต่อ tick สะสมได้สูงสุด 3 คิวสูงสุด 12 ถ้าเกินจะถูกนับเป็น violation (กัน speed hack ด้วยการส่ง input ถี่)
- seq ซ้ำหรือย้อนหลังจะถูกทิ้ง (กัน replay)
- เวกเตอร์ทุกตัวผ่าน validator และถูก normalize บนเซิร์ฟเวอร์
- จำกัดข้อความ 60/s (burst 120) และแชต 0.8/s (burst 3)
- violation ถึง 40 ครั้งจะถูก kick และบันทึก audit
- ถ้าเงียบเกิน 6 tick เซิร์ฟเวอร์จะ step ด้วย input ว่าง จึงหลบ knockback โดยหยุดส่ง input ไม่ได้

## Reconnection
เมื่อหลุด ตัวละครค้างอยู่ในโลก 15s (`disconnectGraceSec`) client จะเชื่อมต่อใหม่ด้วย `resume` + `char_select` แล้วได้ entity เดิมกลับมา ถ้าเกินเวลา เซิร์ฟเวอร์จะบันทึกและนำตัวละครออก
