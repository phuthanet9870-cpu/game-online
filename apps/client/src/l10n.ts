// Thai localization for dynamic game text: stat labels, item names, and a phrase/pattern table applied to
// rendered panels, tooltips, toasts and system chat. English is the source; anything not listed stays English.
import { ITEM_BASE_MAP, LEGENDARY_POWERS, RARITY_DEFS, statLabel, type Item, type Rarity } from '@astra/shared';
import { getLang } from './i18n.js';

const th = () => getLang() === 'th';

const STAT_TH: Record<string, string> = {
  str: 'พลัง', dex: 'ความว่องไว', int: 'สติปัญญา', vit: 'ความอึด', maxHp: 'พลังชีวิตสูงสุด', maxRes: 'ทรัพยากรสูงสุด', armor: 'เกราะ',
  critChance: '% โอกาสคริติคอล', critMult: '% ดาเมจคริติคอล', atkSpeed: '% ความเร็วโจมตี', castSpeed: '% ความเร็วร่าย', cdr: '% ลดคูลดาวน์',
  moveSpeedPct: '% ความเร็วเคลื่อนที่', dodge: '% หลบหลีก', block: '% บล็อก', hpRegen: ' ฟื้นพลังชีวิต/วินาที', lifeOnHitPct: '% ดูดเลือด', maxHpPct: '% พลังชีวิตสูงสุด',
  armorPct: '% เกราะ', dmgPct: '% ดาเมจ', 'res.all': '% ต้านทานทุกธาตุ', minionDmgPct: '% ดาเมจสมุน', minionHpPct: '% พลังชีวิตสมุน', dotDmgPct: '% ดาเมจต่อเนื่อง',
  aoePct: '% ขนาดพื้นที่', projCount: ' กระสุนสกิล', 'basic.proj': ' ครั้ง/กระสุนการโจมตีพื้นฐาน', 'basic.dmgPct': '% ดาเมจการโจมตีพื้นฐาน', 'basic.chain': ' การเด้งของการโจมตีพื้นฐาน',
  'basic.pierce': ' การทะลุของการโจมตีพื้นฐาน', healPct: '% การรักษา', barrierPct: '% ความแข็งแรงเกราะป้องกัน', statusDurPct: '% ระยะเวลาสถานะ', stunDurPct: '% ระยะเวลามึนงง',
  resRegenPct: '% ฟื้นทรัพยากร', costPct: '% ค่าใช้สกิล', finisherPct: '% โบนัสปิดฉากต่อแต้ม', secondaryMax: ' ทรัพยากรรองสูงสุด', weaveMax: ' Weave สูงสุด',
  minionCap: ' สมุนสูงสุด', penetration: '% เจาะต้านทาน', goldFindPct: '% ทองที่ได้', magicFindPct: '% ความหายากไอเทม', markPct: '% ผลของตราพราน', threatPct: '% ความเกลียดชัง',
  ultCdr: '% ฟื้นอัลติเมต', minionSpeedPct: '% ความเร็วสมุน', 'dmgPct.trap': '% ดาเมจกับดัก', highLifeDmgPct: '% ดาเมจเมื่อเลือดเกิน 80%', dmgTakenPct: '% ดาเมจที่ได้รับ', sizePct: '% ขนาด',
};
const ELEM_TH: Record<string, string> = { physical: 'กายภาพ', fire: 'ไฟ', ice: 'น้ำแข็ง', lightning: 'สายฟ้า', holy: 'ศักดิ์สิทธิ์', shadow: 'เงามืด', poison: 'พิษ', melee: 'ระยะประชิด', projectile: 'กระสุน', spell: 'เวท', aoe: 'พื้นที่', trap: 'กับดัก' };

export function statText(key: string, v: number): string {
  if (!th()) return statLabel(key, v);
  const sign = v >= 0 ? '+' : '';
  const val = Number.isInteger(v) ? v : Math.round(v * 100) / 100;
  if (key.startsWith('dmgPct.')) return `${sign}${val}% ดาเมจ${ELEM_TH[key.slice(7)] ?? key.slice(7)}`;
  if (key.startsWith('res.') && key !== 'res.all') return `${sign}${val}% ต้านทาน${ELEM_TH[key.slice(4)] ?? key.slice(4)}`;
  if (key.startsWith('basic.convert.')) return `การโจมตีพื้นฐานเปลี่ยนเป็นธาตุ${ELEM_TH[key.slice(14)] ?? key.slice(14)}`;
  if (key.startsWith('onHit')) return `${Math.round(v * 100)}% โอกาสติด${({ Burn: 'ไหม้', Poison: 'พิษ', Bleed: 'เลือดไหล' } as Record<string, string>)[key.slice(5)] ?? key.slice(5)}เมื่อโจมตี`;
  if (key.startsWith('flag')) return '';
  const lbl = STAT_TH[key];
  if (!lbl) return statLabel(key, v);
  return lbl.startsWith('%') || lbl.startsWith(' ') ? `${sign}${val}${lbl}` : `${sign}${val} ${lbl}`;
}

const BASE_TH: Record<string, string> = {
  w_greatsword: 'ดาบใหญ่ไอรอนเวล', w_axe: 'ขวานศึกเครา', w_staff: 'คทาสถาบัน', w_wand: 'ไม้กายสิทธิ์แก้วดารา', w_daggers: 'มีดคู่เวล', w_claw: 'กรงเล็บจันทรา',
  w_bow: 'ธนูยาวกรีนวอตช์', w_crossbow: 'หน้าไม้รีพีตเตอร์', w_mace: 'กระบองดอว์นสไปร์', w_sword_shield: 'ดาบปฏิญาณและโล่', w_scythe: 'เคียวผู้เฝ้าสุสาน', w_tome: 'คัมภีร์นามซีดขาว',
  a_helm_plate: 'หมวกเกราะแผ่น', a_hood: 'ฮู้ดผ้าสนธยา', a_circlet: 'มงกุฎดารา', a_chest_plate: 'เกราะอกป้อมปราการ', a_chest_leather: 'เสื้อหนังเงามืด', a_robe: 'เสื้อคลุมด้ายดาว',
  a_gauntlets: 'ถุงมือเหล็ก', a_wraps: 'ผ้าพันมือไหม', a_greaves: 'สนับแข้งเหล็ก', a_treads: 'รองเท้าก้าวลม', j_ring_gold: 'แหวนปิดทอง', j_ring_moon: 'แหวนมูนสโตน',
  j_ring_ember: 'แหวนถ่านไฟ', j_amulet: 'จี้สุริยคราส', j_choker: 'สร้อยคอผู้คุม', r_relic_star: 'เศษดาวตก', r_relic_bone: 'กระดูกนิ้วนักบุญ', r_rune_fire: 'รูนจุดไฟ',
  r_rune_frost: 'รูนน้ำค้างแข็ง', r_rune_venom: 'รูนหนาม',
};
const POWER_TH: Record<string, [string, string]> = {
  lp_split_basic: ['แห่งจันทร์แยก', 'การโจมตีพื้นฐานยิง/ฟันเพิ่ม 2 ครั้ง แต่ดาเมจลดลง 35%'],
  lp_ember_basic: ['แห่งถ่านไฟมีชีวิต', 'การโจมตีพื้นฐานเป็นดาเมจไฟและติดไหม้เสมอ'],
  lp_chain_basic: ['แห่งด้ายพายุ', 'การโจมตีพื้นฐานเด้งไปยังศัตรูเพิ่ม 3 ตัว'],
  lp_cdr: ['แห่งกาลพับ', 'ลดคูลดาวน์ +15% อัลติเมตฟื้นเร็วขึ้น 20%'],
  lp_minion: ['แห่งราชสำนักซีดขาว', 'สมุนสูงสุด +1 สมุนดาเมจเพิ่ม 40%'],
  lp_leech: ['แห่งจันทร์โลหิต', 'ดูดเลือด 2% และดาเมจ +15% เมื่อเลือดเกิน 80%'],
  lp_proj: ['แห่งร้อยขนนก', 'สกิลยิงกระสุนเพิ่ม 2 ลูก'],
  lp_finisher: ['แห่งชั่วโมงสุดท้าย', 'สกิลปิดฉากและสกิลใช้วิญญาณแรงขึ้น 50% ต่อแต้มที่ใช้'],
};
const RARITY_TH: Record<string, string> = { common: 'ธรรมดา', uncommon: 'ไม่ธรรมดา', rare: 'หายาก', epic: 'มหากาพย์', legendary: 'ตำนาน', ancient: 'โบราณ' };
const SLOT_TH: Record<string, string> = { weapon: 'อาวุธ', helmet: 'หมวก', chest: 'เกราะอก', gloves: 'ถุงมือ', boots: 'รองเท้า', ring: 'แหวน', ring1: 'แหวน 1', ring2: 'แหวน 2', necklace: 'สร้อยคอ', relic: 'วัตถุโบราณ', rune: 'รูน' };

export function itemName(it: Pick<Item, 'baseId' | 'name' | 'power'>): string {
  if (!th()) return it.name;
  const base = BASE_TH[it.baseId] ?? ITEM_BASE_MAP[it.baseId]?.name ?? it.name;
  return it.power && POWER_TH[it.power] ? `${base} ${POWER_TH[it.power]![0]}` : base;
}
export const powerDesc = (id: string) => (th() && POWER_TH[id] ? POWER_TH[id]![1] : LEGENDARY_POWERS[id]?.desc ?? '');
export const rarityName = (r: Rarity | string) => (th() ? RARITY_TH[r] ?? r : RARITY_DEFS[r as Rarity]?.name ?? r);
export const slotName = (s: string) => (th() ? SLOT_TH[s] ?? s : s);

// Exact phrases (UI chrome in panels built from English literals)
const PHRASES: Record<string, string> = {
  'Equipment': 'อุปกรณ์', 'Inventory': 'กระเป๋า', ' — click to unequip': ' — คลิกเพื่อถอด', 'Active skills': 'สกิลทั่วไป', 'Ultimate skills': 'สกิลอัลติเมต',
  'Browse': 'เลือกดู', 'Sell an item': 'ลงขายไอเทม', 'Search': 'ค้นหา', 'Buy': 'ซื้อ', 'List…': 'ลงขาย…', 'Cancel': 'ยกเลิก', 'Take back': 'นำคืน', 'No listings.': 'ไม่มีรายการ',
  'Any slot': 'ทุกช่อง', 'Any rarity': 'ทุกระดับ', ' usable by me': ' ใช้ได้กับฉัน', '‹ Prev': '‹ ก่อนหน้า', 'Next ›': 'ถัดไป ›',
  'You are not in a guild.': 'คุณยังไม่มีกิลด์', 'Found a guild': 'ก่อตั้งกิลด์', 'Found guild': 'ก่อตั้ง', 'Recent activity': 'กิจกรรมล่าสุด', 'Leave guild': 'ออกจากกิลด์',
  'Message of the day: ': 'ข้อความประจำวัน: ', 'Edit': 'แก้ไข', 'Promote': 'เลื่อนยศ', 'Demote': 'ลดยศ', 'Make leader': 'ตั้งเป็นหัวหน้า',
  'Party finder': 'หาปาร์ตี้', 'Post listing': 'ประกาศหาทีม', 'Remove my listing': 'ลบประกาศของฉัน', 'Refresh': 'รีเฟรช', 'Ask to join': 'ขอเข้าร่วม', 'Players nearby': 'ผู้เล่นใกล้เคียง',
  'Trade': 'เทรด', 'Guild invite': 'ชวนเข้ากิลด์', 'No groups listed right now.': 'ยังไม่มีทีมประกาศ', 'Nobody else is in this zone.': 'ไม่มีผู้เล่นอื่นในโซนนี้',
  'Your offer': 'ข้อเสนอของคุณ', 'No items': 'ไม่มีไอเทม', 'Update gold': 'อัปเดตทอง', 'Lock offer': 'ล็อกข้อเสนอ', 'Confirm trade': 'ยืนยันเทรด',
  'Weekly objectives': 'ภารกิจรายสัปดาห์', 'Reward track': 'เส้นทางรางวัล', 'Claim': 'รับ', 'Locked': 'ล็อก', 'claimed': 'รับแล้ว', 'What stays and what resets': 'อะไรคงอยู่ อะไรรีเซ็ต',
  'Permanent': 'ถาวร', 'Resets at season end': 'รีเซ็ตเมื่อจบซีซั่น', 'Rewards are cosmetic or convenience only — no season reward adds combat power.': 'รางวัลเป็นของตกแต่งหรือความสะดวกเท่านั้น ไม่มีรางวัลซีซั่นที่เพิ่มพลังต่อสู้',
  'Aura (cosmetic):': 'ออร่า (ตกแต่ง):', 'None': 'ไม่มี', 'Craft': 'คราฟต์', 'Forge slot:': 'ช่องที่จะตี:', 'Professions': 'อาชีพ', 'Record': 'สถิติ', 'Build modifiers': 'ตัวปรับบิลด์',
  'Party (max 4)': 'ปาร์ตี้ (สูงสุด 4)', 'You are not in a party.': 'คุณยังไม่มีปาร์ตี้', 'Chat': 'แชท', 'Community rules': 'กฎชุมชน',
  'Leaderboards': 'กระดานอันดับ', 'Endless Tower': 'หอคอยไม่รู้จบ', 'Challenge Arena': 'สนามประลอง', 'Level': 'เลเวล', 'No entries yet.': 'ยังไม่มีข้อมูล',
  'Season & weekly': 'ซีซั่นและรายสัปดาห์', 'Guild': 'กิลด์', 'Season': 'ซีซั่น', 'Kept': 'ได้เก็บไว้', 'Locked ': 'ล็อก ',
  'Select a skill, then click a slot (or drag a skill onto a slot). Right-click a slot to clear it.': 'เลือกสกิล แล้วคลิกช่อง (หรือลากสกิลไปวาง) คลิกขวาที่ช่องเพื่อเอาออก',
  'Click an item to select it · right-click to equip quickly.': 'คลิกไอเทมเพื่อเลือก · คลิกขวาเพื่อสวมใส่ทันที',
};
// Patterns for dynamic text (server toasts, counters). Each: [regex, replacer]
const PATTERNS: Array<[RegExp, (...m: string[]) => string]> = [
  [/^Level up! You are now level (\d+)\. \(\+(\d+) passive points?\)$/, (_, l, p) => `เลเวลอัป! ตอนนี้คุณเลเวล ${l} (+${p} แต้มพาสซีฟ)`],
  [/^Picked up (.+)$/, (_, n) => `เก็บ ${n}`],
  [/^Quest complete: (.+)$/, (_, n) => `เควสต์สำเร็จ: ${n}`],
  [/^Objective complete: (.+) — return to (.+)$/, (_, n, g) => `เป้าหมายสำเร็จ: ${n} — กลับไปหา ${g}`],
  [/^New skill: (.+) \(equipped\)$/, (_, n) => `สกิลใหม่: ${n} (ใส่แล้ว)`],
  [/^You have fallen\. (.*)Respawning in 5s\.\.\.$/, (_, g) => `คุณล้มลง ${g.replace(/Lost (\d+) gold\. /, 'เสีย $1 ทอง ')}กำลังเกิดใหม่ใน 5 วินาที…`],
  [/^Entered (.+)\.$/, (_, z) => `เข้าสู่ ${z}`],
  [/^Wave (\d+)( — champion wave!)?$/, (_, w, c) => `ระลอก ${w}${c ? ' — ระลอกแชมเปี้ยน!' : ''}`],
  [/^Trade complete$/, () => 'เทรดสำเร็จ'],
  [/^New personal best \((\w+)\): (\d+)$/, (_, b, v) => `สถิติใหม่ (${b}): ${v}`],
  [/^Weekly objective complete: (.+) \(\+(\d+) Season XP\)$/, (_, n, x) => `ภารกิจรายสัปดาห์สำเร็จ: ${n} (+${x} Season XP)`],
  [/^Not enough (\w+)$/, (_, r) => `${r} ไม่พอ`],
  [/^On cooldown$/, () => 'ติดคูลดาวน์'],
  [/^Inventory full$/, () => 'กระเป๋าเต็ม'],
  [/^Too far away$/, () => 'อยู่ไกลเกินไป'],
  [/^(\d+) listings$/, (_, n) => `${n} รายการ`],
  [/^Unlocks at level (\d+)$/, (_, l) => `ปลดล็อกที่เลเวล ${l}`],
];

export function trText(s: string): string {
  if (!th() || !s) return s;
  const p = PHRASES[s];
  if (p) return p;
  for (const [re, fn] of PATTERNS) { const m = s.match(re); if (m) return fn(...(m as unknown as string[])); }
  return s;
}

/** Translate every text node under `el` in place (exact phrases and patterns only). */
export function translateDom(el: Node) {
  if (!th()) return;
  const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
  const nodes: Text[] = [];
  while (walker.nextNode()) nodes.push(walker.currentNode as Text);
  for (const n of nodes) { const v = n.nodeValue ?? ''; const t2 = trText(v); if (t2 !== v) n.nodeValue = t2; }
  if (el instanceof HTMLElement) for (const inp of Array.from(el.querySelectorAll('input[placeholder]'))) { const ph = (inp as HTMLInputElement).placeholder; const t2 = trText(ph); if (t2 !== ph) (inp as HTMLInputElement).placeholder = t2; }
}
