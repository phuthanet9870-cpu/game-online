// Hearth (player housing): furniture catalogue and placement rules. Furniture is cosmetic or a convenience
// (storage, crafting stations, a training dummy) — never combat power.
export type Utility = 'stash' | 'alchemy' | 'anvil' | 'dummy';
export interface FurnitureDef { id: string; name: string; w: number; h: number; solid: boolean; cost: { gold: number; mats?: Record<string, number> }; utility?: Utility; req?: string; color: string }
export const FURNITURE: Record<string, FurnitureDef> = {
  rug: { id: 'rug', name: 'Eclipse Rug', w: 3, h: 2, solid: false, cost: { gold: 150 }, color: '#7a3a5a' },
  lantern: { id: 'lantern', name: 'Moonglass Lantern', w: 1, h: 1, solid: false, cost: { gold: 120, mats: { moonpetal: 2 } }, color: '#ffe08a' },
  plant: { id: 'plant', name: 'Potted Moonpetal', w: 1, h: 1, solid: true, cost: { gold: 80, mats: { moonpetal: 3 } }, color: '#8fd08a' },
  table: { id: 'table', name: 'Oak Table', w: 2, h: 1, solid: true, cost: { gold: 200 }, color: '#8a5a32' },
  bed: { id: 'bed', name: 'Starthread Bed', w: 2, h: 2, solid: true, cost: { gold: 400 }, color: '#3a5a9a' },
  bookshelf: { id: 'bookshelf', name: 'Codex Bookshelf', w: 2, h: 1, solid: true, cost: { gold: 300 }, color: '#5a3a22' },
  chest: { id: 'chest', name: 'Hearth Chest (vault access)', w: 1, h: 1, solid: true, cost: { gold: 600, mats: { iron_ore: 4 } }, utility: 'stash', color: '#a07a3a' },
  alchemy_table: { id: 'alchemy_table', name: 'Alchemy Table', w: 2, h: 1, solid: true, cost: { gold: 900, mats: { moonpetal: 8, emberbloom: 4 } }, utility: 'alchemy', color: '#4a8a7a' },
  anvil: { id: 'anvil', name: 'Home Anvil', w: 1, h: 1, solid: true, cost: { gold: 1200, mats: { iron_ore: 12 } }, utility: 'anvil', color: '#6a6a78' },
  dummy: { id: 'dummy', name: 'Training Dummy', w: 1, h: 1, solid: false, cost: { gold: 250 }, utility: 'dummy', color: '#c8a46a' },
  trophy_veyra: { id: 'trophy_veyra', name: "Veyra's Broken Crown", w: 1, h: 1, solid: true, cost: { gold: 100 }, req: 'rift_walker', color: '#c58cff' },
  trophy_nyx: { id: 'trophy_nyx', name: 'Shard of the Eclipse Throne', w: 1, h: 1, solid: true, cost: { gold: 100 }, req: 'raid_clear', color: '#f2c46b' },
  trophy_carp: { id: 'trophy_carp', name: 'Mounted Golden Carp', w: 1, h: 1, solid: true, cost: { gold: 100, mats: { golden_carp: 1 } }, color: '#ffd23a' },
};
export const HOUSE = { w: 18, h: 13, maxPlaced: 40, doorX: 9 };
export type HousePerm = 'private' | 'party' | 'guild' | 'public';
export interface HouseState { owned: Record<string, number>; placed: Array<{ id: string; x: number; y: number }>; perm: HousePerm }
export const emptyHouse = (): HouseState => ({ owned: {}, placed: [], perm: 'private' });
