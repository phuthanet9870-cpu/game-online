# PVP_SYSTEM

สถานะ: **Designed** · ส่วนที่ทำแล้ว: ตัวคูณ PvP ใน `STAT_CONFIG.pvp` (damage ×0.55, healing ×0.6, CC ×0.6), สถานะ `pvpDR`, สูตร `rollDamage(ctx='pvp')` (มีเทสต์)

โหมด: Duel 1v1, Arena 2v2/3v3, Team 5v5, Battleground 10v10, Guild Skirmish 20v20, Castle War 50v50, Grand Guild War 100v100, Open World PvP

ทุกโหมด: match rules, victory, death/respawn, ranking, rewards, anti-abuse (win-trading detection: คู่เดิมซ้ำ, ดาเมจผิดปกติ), disconnect (forfeit หลัง 60s), match results ลง DB
Arena: MMR (Glicko-2), season 8 สัปดาห์, leaderboard, **equipment normalization** (ตีบวก→+10, options scale), reconnect, reward eligibility (ขั้นต่ำ N แมตช์)
Balance ที่ต้องทำก่อนเปิด: CC diminishing returns (100% → 50% → 25% → immune 15s), healing reduction, damage caps ต่อ hit, ห้ามเปลี่ยนอาวุธ/พลังระหว่างแมตช์ (กฎเปลี่ยนอาวุธใน Safe Zone มีแล้ว)
