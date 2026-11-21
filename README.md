# THE POWER: ETERNAL WAR

Online open-world MMORPG × ARPG สำหรับเบราว์เซอร์ (HTML5 Canvas, TypeScript) ใช้สถาปัตยกรรม server-authoritative

## เริ่มต้น
```bash
npm install
npm test            # unit + integration
npm start           # build แล้วรันเซิร์ฟเวอร์ที่ http://localhost:8080
```
ตัวแปรสภาพแวดล้อม: `PORT` (8080), `DB_PATH` (data/game.db), `GM_PASSPHRASE` (ถ้าไม่ตั้ง GM จะปิด), `SERVER_NAME`

เล่นหลายคน: เปิดหลายแท็บ/หลายเครื่องที่ชี้มาที่เซิร์ฟเวอร์เดียวกัน
ไฟล์เดียวเล่นออฟไลน์: `dist/artifact/the-power.html` (เซิร์ฟเวอร์รันใน Web Worker, เซฟลง localStorage)

## ปุ่ม
WASD เดิน · เมาส์เล็ง · LMB โจมตี · RMB โจมตีหนัก · Space หลบ · Shift ป้องกัน · 1-3 สกิล · 4/5 ยา · F เก็บ/คุย · I กระเป๋า · C ตัวละคร · H ช่วยเหลือ · Enter แชต

## เอกสาร
`docs/` เริ่มที่ [IMPLEMENTATION_STATUS](docs/IMPLEMENTATION_STATUS.md), [TECHNICAL_ARCHITECTURE](docs/TECHNICAL_ARCHITECTURE.md), [GM_SYSTEM](docs/GM_SYSTEM.md)
