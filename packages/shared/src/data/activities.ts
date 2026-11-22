// Instanced activities offered at the Rift Gate. Unlock rules and party limits are enforced server-side.
export type Activity = 'rift' | 'nightmare' | 'tower' | 'labyrinth' | 'arena' | 'raid';
export interface ActivityDef { id: Activity; name: string; desc: string; minLevel: number; needTier?: number; maxParty: number; chooseDifficulty: boolean; rules: string }
export const ACTIVITIES: Record<Activity, ActivityDef> = {
  rift: { id: 'rift', name: 'Rift', desc: 'Seeded roguelike dungeon: rooms, shrines, bargains, mini-boss and Veyra.', minLevel: 1, maxParty: 4, chooseDifficulty: true, rules: 'Respawn at the entry on death (Normal). Blessings last for the run.' },
  arena: { id: 'arena', name: 'Challenge Arena', desc: 'Survive endless waves. Your best wave goes on the leaderboard.', minLevel: 1, maxParty: 4, chooseDifficulty: false, rules: 'No respawns. Allies can revive a fallen player (stand next to them, press Interact). The run ends when everyone is down.' },
  tower: { id: 'tower', name: 'Endless Tower', desc: 'Short floors that grow 12% stronger each time. A Warden guards every 5th floor.', minLevel: 5, maxParty: 4, chooseDifficulty: false, rules: 'Respawn on death (Normal). Take the stairs after the floor guardian falls. Leave any time; your best floor is recorded.' },
  labyrinth: { id: 'labyrinth', name: 'Ancient Labyrinth', desc: 'A shifting stone maze with hidden caches and Oruk, Warden of the Coil.', minLevel: 8, maxParty: 4, chooseDifficulty: true, rules: 'Respawn at the entrance on death (Normal). Item level +3.' },
  nightmare: { id: 'nightmare', name: 'Nightmare Rift', desc: 'A Rift with three hostile modifiers and a 10-minute clock for a bonus cache.', minLevel: 10, needTier: 2, maxParty: 4, chooseDifficulty: true, rules: 'Requires a cleared Hard Rift. Difficulty is at least Hard. Clear in under 10 minutes for the bonus.' },
  raid: { id: 'raid', name: 'Raid: Eclipse Throne', desc: 'Nyx Aurelion, the Eclipse Sovereign. Built for 4-8 players.', minLevel: 12, maxParty: 8, chooseDifficulty: true, rules: 'No respawns; a full wipe ends the attempt. Gather in the circle of light during Total Eclipse. Enrages after 8 minutes. Item level +5.' },
};
export const ACTIVITY_ORDER: Activity[] = ['rift', 'arena', 'tower', 'labyrinth', 'nightmare', 'raid'];
export const NIGHTMARE_MODS = ['fortified', 'elite_tide', 'withering'];
export const towerScale = (floor: number) => Math.pow(1.12, floor - 1);
