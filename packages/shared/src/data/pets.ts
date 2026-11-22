// Companions: cosmetic followers with a small convenience bonus (wider gold auto-pickup and item pickup reach).
// They never add combat power.
export const PETS: Record<string, { name: string; desc: string; color: string; cost: { gold: number; mats?: Record<string, number> } }> = {
  lumi_fox: { name: 'Lumi Fox', desc: 'A fox with a lantern tail.', color: '#ffb35a', cost: { gold: 500 } },
  moon_owl: { name: 'Moon Owl', desc: 'Silent, curious, judges your build.', color: '#c9d6ff', cost: { gold: 1500 } },
  ember_sprite: { name: 'Ember Sprite', desc: 'A Cinderkin who decided you were warmer company.', color: '#ff6a2e', cost: { gold: 300, mats: { cinder_core: 15 } } },
};
export const PET_PICKUP = { goldRadius: 200, itemReach: 180 };
