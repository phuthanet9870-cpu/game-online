# UI_UX_SPECIFICATION

ธีม: dark fantasy pixel art · ฟอนต์ Pixelify Sans (หัวข้อ/ตัวเลข) + Noto Sans Thai · ข้อความทั้งหมดใส่เป็น text node (กัน XSS)

## หน้าจอ
| หน้าจอ | สถานะ |
|---|---|
| Title/เลือกโหมด (+จำลอง latency, ล้างเซฟ) | Functional |
| Login / Register | Functional |
| Server Selection | Not Started (มีเซิร์ฟเวอร์เดียว) |
| Character Creation (preview สด, อาวุธที่ยังไม่เปิดถูกล็อกและแสดงเหตุผล) | Functional |
| Character Selection | Functional |
| Game HUD | Functional |
| Inventory (40 ช่อง, tooltip เทียบกับของที่ใส่อยู่, ใช้/สวม/ขาย/ทิ้ง) | Functional |
| Equipment + Stats 20 ค่า + Weapon Mastery | Functional |
| Shop / NPC Dialog | Functional |
| Death screen | Functional |
| Help (ปุ่มควบคุม) | Functional |
| GM Panel | Functional |
| The Power, Skill Tree, Awakening, Ritual, Enhancement, Reforge, Rune, Crafting, Marketplace, Party, Guild, Guild War, Dungeon Finder, Quest Log, World Map, Boss Tracker, Settings | Not Started (**ไม่มีปุ่มหลอก**: ยังไม่แสดงในเกมจนกว่าจะมีระบบจริง) |

## HUD
HP/Energy/Stamina (+shield), skill bar (LMB/RMB/Space/Shift/1-3/4-5) พร้อม cooldown overlay, energy cost และ tooltip (ระยะ, คูลดาวน์, cast) · สกิลที่ energy ไม่พอจะเป็นสีเทา · buffs/debuffs · minimap (มอนสเตอร์/elite/ผู้เล่น/NPC/พอร์ทัล) · ชื่อโซน + พิกัด · network status (โหมด, ping, tick, snap/s, pending inputs, corrections) · แชต · EXP bar · damage numbers · ชื่อและ HP มอนสเตอร์ (แสดงเมื่อชี้, โดนตี หรือเป็น elite) · telegraph สีแดง
ยังไม่มี: Quest Tracker, Party Status, Ultimate slot (รอระบบจริง)

## Error messages
error ทุกตัวจากเซิร์ฟเวอร์มี `code` + ข้อความภาษาไทยที่บอกวิธีแก้ (เช่น "เปลี่ยนอาวุธได้เฉพาะในเมือง/Safe Zone", "เข้าใกล้ NPC กว่านี้")
ในอาร์ติแฟกต์ `confirm()/alert()` ถูกบล็อก จึงใช้กล่องยืนยันภายในหน้าแทน
