# BOSS_SYSTEM

สถานะ: Map Boss **Tested** (2 ตัว สำหรับ 2 แมพฟาร์มที่มีอยู่) · World Boss **Designed**

## Map Boss ที่ทำแล้ว (`tests/boss.test.ts`, e2e)
| บอส | แมพ | Lv | หน้าต่างเกิด | จุดเกิด |
|---|---|---|---|---|
| Thunderhoof, the Meadow King (กีบอัสนี ราชาแห่งทุ่ง) | Greenfall Plains | 10 | 45–90 นาที | 3 จุด |
| Whisperwood Matriarch (มารดาแห่งป่ากระซิบ) | Whispering Forest | 16 | 60–120 นาที | 3 จุด |
- เวลาเกิดสุ่มบนเซิร์ฟเวอร์ และบันทึกลง `server_kv` (migration 4) จึงไม่รีเซ็ตเมื่อรีสตาร์ต · ประกาศใบ้ล่วงหน้า 5 นาที (ไม่บอกตำแหน่ง) · ประกาศเมื่อเกิดพร้อมชื่อพื้นที่
- 3 ช่วง (100% → 70% → 35%): ATK/ความเร็ว/คูลดาวน์เปลี่ยน และอัญเชิญลูกน้อง · Telegraph ทุกท่า · โอกาสกลายพันธุ์ 10% (HP ×1.5, ATK ×1.25, ลูต ×1.5)
- Contribution = ดาเมจ + 0.6×ดาเมจที่รับแทน + 0.8×ฮีลที่ทำใกล้บอส ต้อง ≥2% จึงได้รางวัล · **ลูตส่วนตัว** ทุกคนที่มีสิทธิ์ (เก็บได้เฉพาะเจ้าของ 90 วินาที) · EXP เต็มตาม level diff
- Complete Power Core (0.5%) + **pity**: ถ้าไม่ได้ 40 ครั้งติดจะการันตี · ใช้แกนแล้วได้พลังสุ่มที่ยังไม่มี (ถ้ามีครบ → เศษพลัง 30)
- Reset: ถ้าไม่มีผู้เล่นในระยะ 25 ช่องเกิน 60 วินาที หรือดึงเกิน leash → HP เต็ม ช่วงกลับเป็น 1 · ออโต้โจมตีบอสไม่ได้ และถ้าบอสโจมตี ออโต้จะหยุด
- กันซ้ำ: มีได้ตัวเดียวต่อ schedule, เกิดได้จาก scheduler (หรือ GM) เท่านั้น, ลูตสร้างครั้งเดียวต่อการตาย
- GM: `/gm boss`, `/gm boss spawn`, `/gm boss next <นาที>`
- ยังไม่ทำ: Map Boss อีก 28 ตัวของแมพที่ยังไม่สร้าง

## Map Boss (ต้องมีครบ 30 แมพ)
ตัวอย่างจาก brief: Ancient Treant (Ancient Root Valley 45–90m), Sand Reaper (Scorpion Canyon 60–120m), Frost Wyvern (Frozen Lake 90–150m), Phantom Assassin (Assassin Valley 90–180m), Thunder Behemoth (Thunder Ridge 120–180m), Void Golem (Gravity Ruins 150–240m) อีก 24 ตัวต้องออกแบบเพิ่ม

กลไก (บนเซิร์ฟเวอร์ทั้งหมด):
- `boss_state(boss_id, zone, next_spawn_at, alive, spawn_point, mutated)` เก็บใน DB จึงอยู่รอดเมื่อรีสตาร์ต
- next_spawn = death + uniform(min, max) จาก server RNG; client ได้เพียง "hint" (เช่น ช่วงเวลาโดยประมาณ, ภูมิภาค)
- หลายจุดเกิด, phases ตาม HP%, mutated chance (config) มีกลไกเพิ่ม 1 อย่าง
- Contribution = damage + healing + tanking (damage taken while targeted) + mechanic actions ถ้าผ่านเกณฑ์จะได้สิทธิ์ลูต
- Auto combat ห้ามใช้กับบอส (ตรวจบนเซิร์ฟเวอร์)

## World Boss (6 ตัว)
| บอส | พื้นที่ | อัญเชิญ | เงื่อนไข | รางวัล |
|---|---|---|---|---|
| Yggdrasil | Emerald Sanctuary | Ancient Seeds ×100 | ≥10 คน, ปลูก 4 แท่นใน 5 นาที, ป้องกัน 3 ระลอก | Genesis Bloom |
| Solarius | Solar Wasteland | Sun Fragments ×50 + Flame Core ×5 | กลางวัน, เปิดวิหาร, ปริศนากระจก | Solar Inferno |
| Glacior | Eternal Glacier | Frozen Heart ×30 + Ice Sigil ×3 | พายุหิมะระดับสูง, ทำลายเสา 4 ต้นใน 10 นาที | Eternal Frost |
| Nocthar | Abyss Gate | Shadow Relic ×7 | กลางคืน, ถือ Dagger ≥3 คน, กดสัญลักษณ์ตามลำดับสุ่ม | Shadow of Abyss |
| Raijinor | Thunder God's Peak | Thunder Crystal ×80 + Storm Orb ×5 | ชาร์จเสา 5 จุด, ป้องกันจนเต็ม | Thunder Sovereign |
| Astrax | Gravity Ruins | Gravity Core ×3 + Void Fragment ×100 | เปิดประตูมิติ, ปริศนาหินลอย | Gravity Dominion |

Summon state machine: `IDLE → RITUAL(objectives, timer) → SPAWNED(phase 1..N) → DEFEATED | RESET`
- หักวัตถุดิบเมื่อเข้า RITUAL ใน transaction เดียว ถ้าพิธีล้มเหลวจะคืนตาม config
- กันบอสซ้ำด้วย lock ต่อบอสต่อ shard · กันรางวัลซ้ำด้วย `boss_kill_id` + UNIQUE(kill_id, character_id) ในตาราง reward claims
- Reset rules: ไม่มีผู้เล่นในระยะ 60s หรือทุกคนตาย → reset · คนที่หลุดยังคง contribution ไว้ได้ 120s
