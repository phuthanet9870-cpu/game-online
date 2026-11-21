# ECONOMY_SYSTEM

## ทำแล้ว (Functional/Tested)
- Gold บนเซิร์ฟเวอร์เท่านั้น (`characters.gold CHECK >= 0`, เพดาน 2,000,000,000)
- แหล่งที่มาของ gold: ดรอปมอนสเตอร์, ขายไอเทมให้ NPC, GM
- Gold sinks: ซื้อของจาก NPC (ราคาซื้อ > ราคาขายเสมอ ถ้า config ผิดจะไม่บูต จึงกันการวนซื้อขายเพื่อปั๊มเงิน)
- Item sinks: ยา (ใช้แล้วหมด), ทิ้งไอเทม
- Audit ทุกธุรกรรม: shop_buy/sell (ยอดก่อน/หลัง), loot_roll, loot_pickup, discard, gm_command
- Anti-dup: uid จากเซิร์ฟเวอร์, ลบ drop ก่อนเพิ่มของเข้ากระเป๋า (single-threaded tick), addInstance แบบ all-or-nothing, PK uid, inventory integrity ก่อน save, save แบบมี version
- Farming soft cap (900 kill/ชม. → รางวัล 25%) จำกัดเงินที่บอทผลิตได้

## ยังไม่ทำ (Designed)
- Player trade: สองฝั่งกด lock → confirm → swap ใน transaction เดียว
- Marketplace/Auction: listing fee 2%, ภาษีขาย 5% (sink), escrow, price history (median 7 วัน), จำกัดจำนวน listing ต่อคน
- Binding: bound ขายในตลาดไม่ได้ (ตรวจบนเซิร์ฟเวอร์)
- รายได้จริง: cosmetics, mount skins, housing/guild decorations, cosmetic battle pass **ห้ามขายพลังต่อสู้**
- Dashboard ตรวจธุรกรรมผิดปกติ (gold/hr ต่อคนเกิน p99.9 → flag)
