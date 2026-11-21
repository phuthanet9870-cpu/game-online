# RUNE_SYSTEM

สถานะ: **Designed** (ไอเทม `rune_vitality_basic` ดรอปได้แล้ว แต่ยังฝังไม่ได้)

- ช่องสูงสุด: Weapon 3, Armor 2, Helmet/Gloves/Boots 1, Accessory 1 ต่อชิ้น
- เจาะ: ช่อง 1 100%, ช่อง 2 50%, ช่อง 3 20% ใช้ Rune Drill + Socket Crystal + Gold ถ้าล้มเหลวจะเสียวัตถุดิบแต่อุปกรณ์ไม่เสีย
- ชนิด: Destruction (ATK), Protection (DEF), Vitality (HP/regen), Agility (AS/MS), Precision (Crit/Acc), Resonance (Power)
- Rarity: Basic → Advanced → Rare → Legendary → Ancient · Fusion: รูนชนิดเดียวกันระดับเดียวกัน ×N → ระดับถัดไป
- ชุด (นับรวมทุกชิ้นที่สวม เปิดได้สูงสุด 2 ชุด): Assassin's Oath (Precision×2+Agility×1), Fortress Heart (Protection×2+Vitality×1), Arcane Resonance (Resonance×2+Destruction×1), Eternal Hunter (Agility×2+Destruction×1)
- ถอด: Rune Extractor รูนไม่ลดระดับ ค่าใช้จ่ายตาม rarity
- ตาราง: `item_sockets(item_uid, idx, rune_uid)`, รูนเป็น item instance ปกติ (uid เดียว ไม่ซ้ำ)
