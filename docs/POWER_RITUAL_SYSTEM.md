# POWER_RITUAL_SYSTEM (Power Rebirth Ritual)

สถานะ: **Prototype** — พิธีทำงานจริงที่ NPC นักบวชสูงเซเรน (Power Rebirth Temple, Warhaven Citadel): ตรวจพลังที่ครอบครอง, อาวุธที่รองรับ, วัตถุดิบทั่วไป + เฉพาะผล, ทอง, คูลดาวน์ 12 ชม., ห้ามระหว่างต่อสู้ แล้วหักของและสลับพลังในขั้นเดียวบนเซิร์ฟเวอร์ พลังเดิมและ Mastery ถูกเก็บไว้ (มีเทสต์)
**ยังไม่ทำ:** ด่าน Ritual Instance (ป้องกันแท่น → ปริศนาอักขระ → สู้วิญญาณ) และการคืนวัตถุดิบบางส่วนเมื่อล้มเหลว ต้องรอระบบ instance (ทำพร้อมดันเจี้ยน)
วัตถุดิบบางชนิด (Ritual Crystal, Power Soul Fragment, Rebirth Core, วัตถุดิบเฉพาะผล 5 จาก 6 ชนิด) ยังไม่มีแหล่งดรอป เพราะบอสและแมพภูมิภาคเหล่านั้นยังไม่เปิด ตอนนี้จึงได้มาจาก GM เท่านั้น

## วัตถุดิบ (config)
ทั่วไป: Soul Essence ×100 *(ดรอปได้แล้ว)*, Ancient Rune Dust ×50, Ritual Crystal ×10, Power Soul Fragment ×5, Rebirth Core ×1, Gold ×100,000
เฉพาะผล: Shadow Fang ×10 (ต้องถือ Dagger), Solar Ember ×10 (จุดแท่นไฟ 3 จุด), Thunder Heart ×10 (ป้องกันเสาสายฟ้า), Frozen Tear ×10 (ทำลายผลึกต้องสาป), Gravity Stone ×10 (ปริศนาแรงโน้มถ่วง), Life Seed ×10 (ปกป้องต้นไม้)

## State machine (เซิร์ฟเวอร์)
```
REQUESTED → VALIDATED(power owned, weapon compatible, mats+gold, cooldown 12h, not in PvP/GuildWar)
 → RESERVED (transaction: lock mats+gold in escrow, write ritual_attempts row)
 → INSTANCE (defend altar → rune puzzle → spirit fight)
 → SUCCESS: commit escrow, old power → collection (mastery kept), equip new, cooldown=now+12h
 → FAIL/ABANDON/TIMEOUT: refund (1 - failLossFraction) of escrow, cooldown unchanged
```
- ใช้ escrow ใน DB เดียวกันกับ inventory และ commit ใน transaction เดียว จึงไม่มีสถานะที่หักของแล้วไม่ได้พลัง
- เมื่อหลุดระหว่างพิธี instance จะรอ grace 60s ถ้าไม่กลับมาให้ถือว่า FAIL และคืนของตาม config
- ห้ามสูญเสียผลพลังถาวร และ Power Mastery เดิมจะไม่ถูกลบ
