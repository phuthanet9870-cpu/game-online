// New-player tutorial: each step completes when the server observes the real action. Small gold rewards help
// new characters try crafting, potions and their Hearth early. Skippable; progress is saved on the character.
export interface TutorialStep { id: string; en: string; th: string; hintEn: string; hintTh: string; gold: number }
export const TUTORIAL: TutorialStep[] = [
  { id: 'move', en: 'Move around', th: 'ลองเดินไปมา', hintEn: 'Use W A S D (or the joystick on touch screens).', hintTh: 'ใช้ปุ่ม W A S D (หรือจอยสติ๊กบนจอสัมผัส)', gold: 10 },
  { id: 'dummy', en: 'Hit a training dummy', th: 'โจมตีหุ่นฝึก', hintEn: 'The training ground is on the west side of town. Hold the left mouse button to attack.', hintTh: 'ลานฝึกอยู่ฝั่งตะวันตกของเมือง กดเมาส์ซ้ายค้างเพื่อโจมตี', gold: 10 },
  { id: 'skill', en: 'Use a skill', th: 'ใช้สกิล', hintEn: 'Press 1 to cast your first skill at the mouse cursor.', hintTh: 'กด 1 เพื่อใช้สกิลแรกไปทางเคอร์เซอร์', gold: 15 },
  { id: 'dodge', en: 'Dodge roll', th: 'กลิ้งหลบ', hintEn: 'Press Space to roll. You are invulnerable for a moment — use it to escape red danger zones.', hintTh: 'กด Space เพื่อกลิ้ง ช่วงสั้นๆ จะไม่โดนดาเมจ ใช้หนีโซนสีแดง', gold: 15 },
  { id: 'quest', en: 'Accept a quest', th: 'รับเควสต์', hintEn: 'Talk to Commander Aveline (the "!" in the plaza) with E, then accept "Ashes at the Gate".', hintTh: 'คุยกับผู้บัญชาการอเวลีน (เครื่องหมาย ! ในลาน) ด้วย E แล้วรับเควสต์แรก', gold: 25 },
  { id: 'rift', en: 'Enter the Rift', th: 'เข้าสู่รอยแยก', hintEn: 'Walk north to the Rift Gate and press E. Story difficulty is recommended for your first run.', hintTh: 'เดินขึ้นเหนือไปที่ประตูรอยแยกแล้วกด E แนะนำระดับ Story สำหรับรอบแรก', gold: 25 },
  { id: 'loot', en: 'Pick up an item', th: 'เก็บไอเทม', hintEn: 'Defeated enemies drop items. Click an item on the ground (or press Z) to pick it up.', hintTh: 'ศัตรูที่ตายจะดรอปไอเทม คลิกไอเทมบนพื้น (หรือกด Z) เพื่อเก็บ', gold: 25 },
  { id: 'equip', en: 'Equip an item', th: 'สวมใส่ไอเทม', hintEn: 'Open your inventory with I and right-click an item to equip it. Hover to compare.', hintTh: 'เปิดกระเป๋าด้วย I แล้วคลิกขวาที่ไอเทมเพื่อสวม เอาเมาส์ชี้เพื่อเทียบค่า', gold: 25 },
  { id: 'passive', en: 'Spend a passive point', th: 'ใช้แต้มพาสซีฟ', hintEn: 'Each level gives a point. Press P and click a glowing node next to your class start.', hintTh: 'ทุกเลเวลได้ 1 แต้ม กด P แล้วคลิกจุดที่เรืองแสงติดกับจุดเริ่มคลาส', gold: 50 },
  { id: 'clear', en: 'Defeat Veyra and leave the Rift', th: 'โค่นเวย์ราแล้วออกจากรอยแยก', hintEn: 'Clear the rooms, defeat the Umbral Warden, then use the golden Rift Exit.', hintTh: 'เคลียร์ห้อง โค่นผู้คุมแห่งเงามืด แล้วใช้ทางออกสีทอง', gold: 100 },
];
export const TUTORIAL_DONE = -1;
