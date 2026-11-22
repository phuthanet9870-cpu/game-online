import { CONTENT_TH } from '@astra/shared';
// UI string table. Content (skill/item names) is English for now; UI chrome is localized EN/TH.
type Dict = Record<string, string>;
const en: Dict = {
  enter: 'Enter', title: 'ASTRA: ECLIPSE CHRONICLES', tagline: 'An online action roguelike RPG beneath a broken sun',
  login: 'Log in', register: 'Create account', username: 'Username', password: 'Password', logout: 'Log out', play: 'Play', create: 'Create', cancel: 'Cancel', close: 'Close', confirm: 'Confirm',
  offlineBanner: 'OFFLINE MODE — the game runs entirely in this browser tab. Not server-authoritative, no other players, saves stay on this device.',
  onlineBanner: 'Online', chooseChar: 'Choose your character', newChar: 'New character', name: 'Name', hardcore: 'Hardcore', hardcoreWarn: 'Hardcore: if this character dies, it is gone forever. Hardcore characters, items and ladders are separate from Normal.',
  deleteChar: 'Delete', deleteConfirm: 'Type the character name to delete it permanently:', level: 'Level', mastery: 'Mastery', fallen: 'Fallen',
  inventory: 'Inventory', equipment: 'Equipment', skills: 'Skills', passives: 'Passive Tree', character: 'Character', quests: 'Quests', codex: 'Codex', social: 'Party & Social', settings: 'Settings', map: 'Map',
  equip: 'Equip', unequip: 'Unequip', salvage: 'Salvage', sell: 'Sell', enchant: 'Enchant', stash: 'Vault', store: 'Store', take: 'Take',
  potion: 'Potion', dodge: 'Dodge', interact: 'Interact', enterRift: 'Enter the Rift', difficulty: 'Difficulty', modifiers: 'Modifiers', leaveRun: 'Leave run',
  accept: 'Accept', claim: 'Claim reward', inProgress: 'In progress', complete: 'Complete', done: 'Done', points: 'Points', respec: 'Reset all passives', presets: 'Presets', save: 'Save', load: 'Load',
  exportBuild: 'Copy build code', importBuild: 'Import build code', search: 'Search…', invite: 'Invite', leaveParty: 'Leave party', kick: 'Kick', block: 'Block', report: 'Report',
  language: 'Language', graphics: 'Graphics', controls: 'Controls', controlStyle: 'Control style', actionMode: 'Action (aim with mouse)', tabMode: 'Tab Target (skills aim at your target)', keybinds: 'Key bindings', pressKey: 'Press a key…',
  uiScale: 'UI scale', dmgNumbers: 'Damage numbers', low: 'Low', medium: 'Medium', high: 'High', on: 'On', off: 'Off', loading: 'Loading…', connecting: 'Connecting…', reconnecting: 'Connection lost — reconnecting…',
  respawn: 'Respawning in', hcDead: 'has fallen forever', runEnd: 'Run complete', runFailed: 'Run ended', retained: 'Kept', lost: 'Lost (temporary run power)', chooseBlessing: 'Choose a blessing', bargain: 'Altar of Bargains', decline: 'Decline',
  chatHint: 'Enter to chat · /p party · /w name whisper', unsupported: 'Your browser does not support Canvas 2D. Please use a current Chrome, Edge, Firefox or Safari.',
  townSafe: 'Lumenhold (safe zone)', trainingGround: 'Training Ground', achievements: 'Achievements', titles: 'Titles', stats: 'Stats', gold: 'Gold', dust: 'Astral Dust',
};
const th: Dict = {
  enter: 'เข้าสู่', title: 'ASTRA: ECLIPSE CHRONICLES', tagline: 'เกม Action Roguelike RPG ออนไลน์ ใต้ดวงอาทิตย์ที่แตกสลาย',
  login: 'เข้าสู่ระบบ', register: 'สร้างบัญชี', username: 'ชื่อผู้ใช้', password: 'รหัสผ่าน', logout: 'ออกจากระบบ', play: 'เล่น', create: 'สร้าง', cancel: 'ยกเลิก', close: 'ปิด', confirm: 'ยืนยัน',
  offlineBanner: 'โหมดออฟไลน์ — เกมทำงานในแท็บเบราว์เซอร์นี้ทั้งหมด ไม่มีเซิร์ฟเวอร์ตรวจสอบ ไม่มีผู้เล่นอื่น และเซฟเก็บไว้ในเครื่องนี้เท่านั้น',
  onlineBanner: 'ออนไลน์', chooseChar: 'เลือกตัวละคร', newChar: 'สร้างตัวละครใหม่', name: 'ชื่อ', hardcore: 'ฮาร์ดคอร์', hardcoreWarn: 'ฮาร์ดคอร์: ถ้าตัวละครตาย จะหายไปถาวร ตัวละคร ไอเทม และอันดับของฮาร์ดคอร์แยกจากโหมดปกติ',
  deleteChar: 'ลบ', deleteConfirm: 'พิมพ์ชื่อตัวละครเพื่อยืนยันการลบถาวร:', level: 'เลเวล', mastery: 'มาสเตอรี', fallen: 'เสียชีวิต',
  inventory: 'กระเป๋า', equipment: 'อุปกรณ์', skills: 'สกิล', passives: 'ต้นไม้พาสซีฟ', character: 'ตัวละคร', quests: 'เควสต์', codex: 'สารานุกรม', social: 'ปาร์ตี้และสังคม', settings: 'ตั้งค่า', map: 'แผนที่',
  equip: 'สวมใส่', unequip: 'ถอด', salvage: 'ย่อยสลาย', sell: 'ขาย', enchant: 'เสริมพลัง', stash: 'คลัง', store: 'ฝาก', take: 'ถอน',
  potion: 'ยา', dodge: 'หลบ', interact: 'โต้ตอบ', enterRift: 'เข้าสู่รอยแยก', difficulty: 'ความยาก', modifiers: 'ตัวปรับ', leaveRun: 'ออกจากรอบ',
  accept: 'รับเควสต์', claim: 'รับรางวัล', inProgress: 'กำลังทำ', complete: 'สำเร็จ', done: 'เสร็จแล้ว', points: 'แต้ม', respec: 'รีเซ็ตพาสซีฟทั้งหมด', presets: 'ชุดบิลด์', save: 'บันทึก', load: 'โหลด',
  exportBuild: 'คัดลอกโค้ดบิลด์', importBuild: 'นำเข้าโค้ดบิลด์', search: 'ค้นหา…', invite: 'เชิญ', leaveParty: 'ออกจากปาร์ตี้', kick: 'เตะออก', block: 'บล็อก', report: 'รายงาน',
  language: 'ภาษา', graphics: 'กราฟิก', controls: 'การควบคุม', controlStyle: 'รูปแบบการควบคุม', actionMode: 'แอ็กชัน (เล็งด้วยเมาส์)', tabMode: 'แท็บทาร์เก็ต (สกิลเล็งเป้าที่เลือก)', keybinds: 'ปุ่มลัด', pressKey: 'กดปุ่ม…',
  uiScale: 'ขนาด UI', dmgNumbers: 'ตัวเลขดาเมจ', low: 'ต่ำ', medium: 'กลาง', high: 'สูง', on: 'เปิด', off: 'ปิด', loading: 'กำลังโหลด…', connecting: 'กำลังเชื่อมต่อ…', reconnecting: 'การเชื่อมต่อหลุด — กำลังเชื่อมต่อใหม่…',
  respawn: 'เกิดใหม่ใน', hcDead: 'ได้จากไปตลอดกาล', runEnd: 'จบรอบสำเร็จ', runFailed: 'จบรอบ', retained: 'ได้เก็บไว้', lost: 'สูญเสีย (พลังชั่วคราวในรอบ)', chooseBlessing: 'เลือกพร', bargain: 'แท่นบูชาแห่งการต่อรอง', decline: 'ปฏิเสธ',
  chatHint: 'Enter เพื่อแชท · /p ปาร์ตี้ · /w ชื่อ กระซิบ', unsupported: 'เบราว์เซอร์นี้ไม่รองรับ Canvas 2D กรุณาใช้ Chrome, Edge, Firefox หรือ Safari เวอร์ชันปัจจุบัน',
  townSafe: 'ลูเมนโฮลด์ (เขตปลอดภัย)', trainingGround: 'ลานฝึก', achievements: 'ความสำเร็จ', titles: 'ฉายา', stats: 'ค่าสถานะ', gold: 'ทอง', dust: 'ผงดารา',
};
const tables: Record<string, Dict> = { en, th };
let lang = 'en';
try { lang = localStorage.getItem('astra.lang') ?? (navigator.language?.startsWith('th') ? 'th' : 'en'); } catch { lang = navigator.language?.startsWith('th') ? 'th' : 'en'; }
export const getLang = () => lang;
export function setLang(l: string) { lang = tables[l] ? l : 'en'; try { localStorage.setItem('astra.lang', lang); } catch { /* storage unavailable */ } document.documentElement.lang = lang; }
export const t = (k: string): string => tables[lang]?.[k] ?? en[k] ?? k;
/** Content translation (skills, quests, enemies…): Thai when selected and available, otherwise the English source text. */
export const ct = (key: string, fallback: string): string => (lang === 'th' ? CONTENT_TH[key] ?? fallback : fallback);
