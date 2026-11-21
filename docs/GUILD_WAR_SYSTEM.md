# GUILD_WAR_SYSTEM

สถานะ: **Designed**

## Guild
สมาชิกสูงสุด 60 คน (config) · ตำแหน่ง Master/Vice/Officer/Member/Recruit ใช้ permission bitmask ต่อตำแหน่ง (invite, kick, promote, storage_deposit, storage_withdraw, war_register, edit_notice) และสร้างตำแหน่งเพิ่มได้ · Guild Storage แบบ transaction + audit · การบริจาค · Guild Quests · Guild Hall upgrade
ทุกคำสั่งตรวจ permission บนเซิร์ฟเวอร์

## Castle War 50v50 (สูงสุด 40 นาที)
P1 Outer Fortress 10m: ทำลายประตู, ยึดหอคอย → P2 Inner Citadel 15m: ยึด 3 จุด, ปลดเกราะ Eternal Core → P3 Eternal Core 15m: capture progress ถ้าหมดเวลา ฝ่ายรับชนะ
Mechanics: siege weapons, gates, towers, capture points, respawn points, secret routes, commander + battle orders, contribution score, rewards, castle ownership, weekly reset

## Grand Guild War 100v100
มีพันธมิตร **ต้องผ่าน load test ก่อนเปิดใช้** ถ้าวัดแล้วไม่ไหวให้ลดจำนวนผู้เล่นตามที่วัดได้ ห้ามใช้ NPC มาแทนแล้วบอกว่าเป็นผู้เล่นจริง

## Territory
Eternal Ore Mine, Ancient Power Shrine, Mana Well, Monster Nest, Fortress Outpost มีผลประโยชน์ตามเวลาที่ครอง กันการผูกขาดด้วยการจำกัดจำนวนพื้นที่ต่อกิลด์/พันธมิตร และ upkeep ที่เพิ่มขึ้น ส่วนการฟาร์มพื้นฐานยังเปิดให้ทุกคน
