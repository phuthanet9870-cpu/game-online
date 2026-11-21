# TECHNICAL_ARCHITECTURE

## ตัวเลือกที่ใช้ และเหตุผล
| ประเด็น | ทางเลือกที่พิจารณา | ตัวเลือกที่ใช้ | เหตุผล |
|---|---|---|---|
| แพลตฟอร์ม | Unity WebGL, Godot HTML5, Phaser, Canvas เขียนเอง | **HTML5 Canvas 2D + TypeScript** | ผู้ใช้ต้องการเกมบนเบราว์เซอร์และต้องเล่นในอาร์ติแฟกต์ (ไฟล์เดียว, CSP จำกัด) engine ใหญ่ build ไม่ได้ในสภาพนี้ |
| กราฟิก | Three.js 3D, 2D isometric | **2D isometric pixel art** (ผู้ใช้เลือก) | ไม่ต้องใช้ asset ภายนอก วาดจาก template ในโค้ด เบาพอสำหรับมือถือ |
| ภาษา | JS, TS | **TypeScript** | ใช้ type ของโปรโตคอลร่วมกันทั้ง client และ server |
| Networking | Socket.IO, Colyseus, WebRTC, raw WS | **WebSocket (`ws`) + JSON** | ควบคุม tick/snapshot เองได้ ไม่มี framework ซ่อนพฤติกรรม รองรับ binary/unreliable channel ภายหลัง |
| Database | Postgres, SQLite, Mongo | **SQLite (`node:sqlite`)** สำหรับ dev/สเกลเล็ก | ไม่ต้องติดตั้งอะไรเพิ่ม แยก `Storage` interface ไว้แล้ว จึงย้ายไป Postgres ได้โดยไม่แตะ gameplay |
| สถาปัตยกรรม | microservices, modular monolith | **Modular monolith** + zone simulation แยกโมดูล | ตามข้อกำหนด PART 30 ไม่แตก service ก่อนมีเหตุผล |

## ภาพรวม
```
client (browser)                          server (Node or Web Worker)
 ├ input → 'in' cmd @20Hz ───────────────► GameServer.message → validate → queue
 ├ prediction (shared/movement)            Zone.update @20Hz:
 ├ reconciliation (ack seq)                  inputs(budget) → stepMove → tryCast (lag comp)
 ├ interpolation (~110ms)                    scheduled casts → monster AI → projectiles
 └ render (pixel iso) ◄── 'snap' per tick ── drops/nodes → spawns → history → grid → snapshots
                                            persistence: Storage (SQLite | Memory)
```

## โครงสร้างไดเรกทอรี
```
src/shared/            ใช้ร่วม client+server (ห้าม import DOM/Node)
  config/              ข้อมูลเกมทั้งหมด (stats, progression, weapons, skills, items, monsters, zones, server)
  protocol.ts          ข้อความ + validator
  movement.ts          การเคลื่อนที่แบบ deterministic (prediction ใช้ตัวเดียวกับ server)
  mapgen.ts            สร้างแผนที่จาก seed
  combat.ts, stats.ts  สูตรล้วน
src/server/
  GameServer.ts        sessions, auth, characters, routing, persistence, GM hooks
  zone.ts              simulation ต่อแผนที่, interest management, snapshots
  combat.ts, ai.ts, loot.ts, progression.ts, inventory.ts, gm.ts
  storage/             interface + sqlite + memory
  node/main.ts         HTTP + WebSocket transport
  worker/main.ts       in-browser transport (Web Worker / main thread)
src/client/
  main.ts game.ts net.ts render/ ui/
tests/                 node:test + e2e (Playwright)
```

## การตัดสินใจสำคัญ
- **Server authoritative**: client ส่งแค่ intent (ทิศ, เล็ง, ปุ่ม) ส่วนดาเมจ ลูต ทอง cooldown และการสุ่มทั้งหมดเกิดบนเซิร์ฟเวอร์ (`cryptoRng`)
- **Fixed tick 20 Hz** ใช้เวลาเกมจาก tick ไม่ใช้ wall clock จึงทดสอบแบบ deterministic ได้
- **Transport-agnostic**: `GameServer` รู้จักแค่ `Connection.send/close` อาร์ติแฟกต์จึงรันเซิร์ฟเวอร์ตัวเดียวกับ production ใน Worker ได้
- **Data-driven**: ค่าสมดุลอยู่ใน `src/shared/config/*` ทั้งหมด และ `validateConfig()` จะไม่ยอมบูตถ้า config อ้างอิงผิด
- **Interest management**: spatial grid (cell 8 ช่อง) รัศมีมองเห็น 22 ช่อง ส่ง meta ครั้งแรกเมื่อเข้าเขต แล้วส่งเฉพาะ state แบบ compact
- **World streaming (client)**: ground render เป็น chunk 16×16 แบบ lazy-cache และ cull ตามจอ ฝั่ง server แยกแต่ละแผนที่เป็น Zone ของตัวเอง

## แผนขยาย (ยังไม่ทำ)
1. แยก Zone ไปรันบน worker thread/โปรเซสละ zone ส่วน GameServer ทำหน้าที่ gateway ขอบเขต `ZoneHost` ออกแบบไว้รองรับแล้ว
2. ย้าย Storage ไป Postgres + Redis สำหรับ session/presence
3. Instance zones สำหรับดันเจี้ยน/พิธี/Arena ใช้ `Zone` class เดิมแต่สร้างแบบชั่วคราว
4. เปลี่ยน snapshot เป็น binary และ delta compression

## Build/Run
- `npm run build` → `dist/server.mjs`, `dist/public/*`, `dist/artifact/the-power.html`
- `npm start` → http://localhost:8080 (env: `PORT`, `DB_PATH`, `GM_PASSPHRASE`, `SERVER_NAME`)
