// Quests and narrative. Objectives are tracked server-side from world events.

export interface QuestDef {
  id: string;
  name: string;
  giver: string;
  chapter: number;
  text: string;
  objective: { kind: 'kill_family' | 'kill_enemy' | 'boss' | 'gather' | 'elite' | 'clear_tier' | 'tower_floor' | 'arena_wave' | 'clear_mode' | 'craft' | 'treasure' | 'house'; target?: string; count: number };
  reward: { gold?: number; xp?: number; dust?: number; potions?: number; bonusPoints?: number; respecTokens?: number; mats?: Record<string, number> };
  requires?: string;
}

export const QUESTS: QuestDef[] = [
  { id: 'q1_husks', chapter: 1, name: 'Ashes at the Gate', giver: 'Commander Aveline',
    text: 'The last eclipse cracked the Rift Gate north of Lumenhold. Husks of our own fallen crawl out of it every night. Step through, and put fifteen of them to rest.',
    objective: { kind: 'kill_family', target: 'hollowborn', count: 15 }, reward: { gold: 120, xp: 250, potions: 2 } },
  { id: 'q1_wolves', chapter: 1, name: 'Teeth in the Dusk', giver: 'Commander Aveline',
    text: 'Duskmeadow caravans are being dragged off the road by wolves with eyes like dying stars. Thin the Gloomfang packs east of town.',
    objective: { kind: 'kill_enemy', target: 'gloomfang', count: 10 }, reward: { gold: 90, xp: 200 } },
  { id: 'q1_herbs', chapter: 1, name: 'Moonpetal for the Wounded', giver: 'Commander Aveline',
    text: 'Moonpetal blooms only where eclipse light fell. Our healers need five blossoms from the meadow to brew restoratives.',
    objective: { kind: 'gather', target: 'herb', count: 5 }, reward: { dust: 10, potions: 3, xp: 150 } },
  { id: 'q1_elites', chapter: 1, name: 'Marked by the Moon', giver: 'Commander Aveline', requires: 'q1_husks',
    text: 'Some husks carry shards of the eclipse inside them — they hit harder and refuse to fall. Bring down three elites.',
    objective: { kind: 'elite', count: 3 }, reward: { gold: 200, xp: 400, respecTokens: 1 } },
  { id: 'q1_warden', chapter: 1, name: 'The Umbral Warden', giver: 'Commander Aveline', requires: 'q1_husks',
    text: 'Our scouts saw her at the heart of the Rift: Veyra, who once guarded this very gate. Whatever the eclipse made of her, end it.',
    objective: { kind: 'boss', target: 'veyra', count: 1 }, reward: { gold: 400, xp: 900, bonusPoints: 1 } },
  { id: 'q2_hard', chapter: 2, name: 'Deeper Than Dawn', giver: 'Commander Aveline', requires: 'q1_warden',
    text: 'The Rift is not closing — it is learning. Clear it on Hard difficulty or higher so we can map what lies beneath.',
    objective: { kind: 'clear_tier', target: 'hard', count: 1 }, reward: { gold: 600, xp: 1500, bonusPoints: 1 } },
  { id: 'q2_ridge', chapter: 2, name: 'Smoke on the Ridge', giver: 'Commander Aveline', requires: 'q1_warden',
    text: 'Scouts beyond Duskmeadow report fires that never go out. The Cinderkin are hatching in the Ashen Highlands. Thin them out before they reach the meadow.',
    objective: { kind: 'kill_family', target: 'cinderkin', count: 20 }, reward: { gold: 500, xp: 2500 } },
  { id: 'q2_ore', chapter: 2, name: 'Iron for the Wall', giver: 'Commander Aveline', requires: 'q1_warden',
    text: 'Brenna needs iron to reinforce the gate. The Highland veins run thick with it. Bring back eight loads of ore.',
    objective: { kind: 'gather', target: 'ore', count: 8 }, reward: { gold: 300, xp: 1200, dust: 20 } },
  { id: 'q2_forge', chapter: 2, name: "Brenna's Test", giver: 'Commander Aveline', requires: 'q2_ore',
    text: '"Anyone can swing a sword. Make one." Forge a piece of equipment at Brenna\'s anvil.',
    objective: { kind: 'craft', target: 'smithing', count: 1 }, reward: { gold: 200, xp: 800, respecTokens: 1 } },
  { id: 'q2_climb', chapter: 2, name: 'The Endless Climb', giver: 'Commander Aveline', requires: 'q1_warden',
    text: 'The Rift has grown a tower of stairs that leads nowhere we know. Reach its fifth landing and tell me what waits there.',
    objective: { kind: 'tower_floor', count: 5 }, reward: { gold: 600, xp: 2000, bonusPoints: 1 } },
  { id: 'q2_arena', chapter: 2, name: 'Blood and Sand', giver: 'Commander Aveline',
    text: 'The old garrison arena still opens through the Rift Gate. Our recruits train there. Show them how it is done: survive eight waves.',
    objective: { kind: 'arena_wave', count: 8 }, reward: { gold: 400, xp: 1500 } },
  { id: 'q3_coil', chapter: 3, name: 'The Coiled Warden', giver: 'Commander Aveline', requires: 'q2_climb',
    text: 'Beneath the tower lies a maze older than Lumenhold. Something called Oruk guards it, and it remembers the first eclipse.',
    objective: { kind: 'clear_mode', target: 'labyrinth', count: 1 }, reward: { gold: 900, xp: 4000, bonusPoints: 1 } },
  { id: 'q3_nightmare', chapter: 3, name: 'Sleepless Rift', giver: 'Commander Aveline', requires: 'q2_hard',
    text: 'At night the Rift dreams, and its dreams have teeth. Clear a Nightmare Rift.',
    objective: { kind: 'clear_mode', target: 'nightmare', count: 1 }, reward: { gold: 1000, xp: 5000 } },
  { id: 'q3_throne', chapter: 3, name: 'Throne of the Eclipse', giver: 'Commander Aveline', requires: 'q3_coil',
    text: 'Veyra was only a gatekeeper. The one who keeps the sun dark sits on a throne of black glass: Nyx Aurelion. Gather your strongest allies and end this. (The story continues with Season 1.)',
    objective: { kind: 'clear_mode', target: 'raid', count: 1 }, reward: { gold: 3000, xp: 12000, bonusPoints: 2 } },
  { id: 'q4_wastes', chapter: 4, name: 'Where the Stars Fell', giver: 'Commander Aveline', requires: 'q3_throne',
    text: 'With Nyx gone, the sky cracked. Shards of the old sun fell beyond the Highlands and grew into living crystal. Something there is building itself a new body. Push into the Starfall Wastes and break the Shardborn.',
    objective: { kind: 'kill_family', target: 'shardborn', count: 25 }, reward: { gold: 1500, xp: 9000, mats: { treasure_map: 1 } } },
  { id: 'q4_colossi', chapter: 4, name: 'Glass Giants', giver: 'Commander Aveline', requires: 'q4_wastes',
    text: 'The Glass Colossi carry the largest shards. Shatter five of them and bring Brenna the pieces.',
    objective: { kind: 'kill_enemy', target: 'glass_colossus', count: 5 }, reward: { gold: 1200, xp: 7000, mats: { starglass: 6 } } },
  { id: 'q4_treasure', chapter: 4, name: "A Smuggler's Map", giver: 'Commander Aveline',
    text: 'Smugglers buried their hauls all over the frontier before the eclipse. Read a Treasure Map in the open world, follow the circle, and dig up a cache.',
    objective: { kind: 'treasure', count: 1 }, reward: { gold: 400, xp: 1500, mats: { treasure_map: 1 } } },
  { id: 'q4_hearth', chapter: 4, name: 'A Place to Return To', giver: 'Commander Aveline',
    text: 'Heroes need somewhere to rest between eclipses. Visit Carpenter Odo, then place three pieces of furniture in your Hearth.',
    objective: { kind: 'house', count: 3 }, reward: { gold: 500, xp: 1000 } },
];
export const QUEST_MAP = Object.fromEntries(QUESTS.map((q) => [q.id, q]));

export const LORE = {
  intro: 'Every hundred years the sun goes dark over Astraea. This time, it did not fully return. You woke in Lumenhold with a fragment of starlight in your chest — and a voice telling you to walk into the Rift.',
  veyra: 'Veyra Solmere was the last Warden of the Rift Gate. When the eclipse came she held the gate alone for three nights. On the fourth, the gate held her.',
  hollowborn: 'Hollowborn: the eclipse hollows out the dead and fills them with umbral light. They remember fragments of who they were — a stance, a battle-cry, a name.',
};

export const ACHIEVEMENTS: Record<string, { name: string; desc: string; title?: string }> = {
  first_blood: { name: 'First Light', desc: 'Defeat your first enemy.' },
  rift_walker: { name: 'Rift Walker', desc: 'Defeat Veyra, the Umbral Warden.', title: 'Riftwalker' },
  hardcore_warden: { name: 'One Life, One Dawn', desc: 'Defeat Veyra with a Hardcore character.', title: 'the Undying' },
  tier_hard: { name: 'Into the Deep', desc: 'Clear a Rift on Hard or higher.' },
  tier_nightmare: { name: 'Nightmare Walker', desc: 'Clear a Rift on Nightmare or higher.', title: 'Nightmare-Touched' },
  legendary: { name: 'Starfall Treasure', desc: 'Find a Legendary or Ancient item.' },
  world_boss: { name: 'Grove Breaker', desc: 'Help defeat the world boss Gloomheart in Duskmeadow.', title: 'Grovebreaker' },
  eclipse_walker: { name: 'Beyond the Corona', desc: 'Clear the Eclipse Dimension.' },
  eclipse_deep: { name: 'Eye of the Eclipse', desc: 'Clear the Eclipse Dimension at Eclipse Pressure 8 or higher.', title: 'Corona-Born' },
  tower10: { name: 'Tenth Landing', desc: 'Reach floor 10 of the Endless Tower.', title: 'Spire-Climber' },
  arena10: { name: 'Crowd Favourite', desc: 'Survive 10 waves in the Challenge Arena.' },
  labyrinth: { name: 'Out of the Coil', desc: 'Defeat Oruk, Warden of the Coil.' },
  nightmare_timed: { name: 'Against the Clock', desc: 'Clear a Nightmare Rift in under 10 minutes.' },
  raid_clear: { name: 'Sovereign-Slayer', desc: 'Defeat Nyx Aurelion in the Eclipse Throne raid.', title: 'Sunbringer' },
  treasure_hunter: { name: 'X Marks the Spot', desc: 'Dig up a buried treasure cache.' },
  homeowner: { name: 'Hearth and Home', desc: 'Place furniture in your Hearth.' },
  level10: { name: 'Seasoned', desc: 'Reach level 10 with any character.' },
  level25: { name: 'Veteran of the Eclipse', desc: 'Reach level 25 with any character.' },
  codex8: { name: 'Bestiary Scholar', desc: 'Record 8 enemy types in the Codex.' },
};
