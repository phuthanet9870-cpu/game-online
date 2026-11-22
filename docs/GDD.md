# ASTRA: ECLIPSE CHRONICLES — Game Design Document (v0.1)

Source of truth for content values is the data in `packages/shared/src/data/*`. This document explains intent.

## 1. Pitch
Every hundred years the sun goes dark over Astraea. This time it did not fully return. Players are adventurers carrying fragments of starlight, entering the Rift beneath Lumenhold to stop the Eclipse from hollowing out the world.

Genre: browser action roguelike RPG with MMO social spaces. Camera: top-down 2.5D. Session lengths: one Rift floor (~5-8 min), a full Rift with boss (~10-15 min), long build/grind sessions.

**Core loop:** Lumenhold (prepare, vendors, quests) → Rift Gate or Duskmeadow → fight, pick blessings/bargains → mini-boss + Veyra → loot & XP → refine build (passives, gear, enchanting) → higher difficulty.

## 2. Classes (six, standalone, no evolutions)
| Class | Role | Resource / mechanic | Archetypes |
|---|---|---|---|
| Warrior | Frontline bruiser | Rage (builds on hit dealt/taken, decays out of combat); 3rd basic = Momentum Cleave | Heavy bruiser · Whirling duelist · Iron counter |
| Mage | Elemental artillery | Mana + Spell Weave (switching element grants +8%/stack, max 3) | Pyro burst · Frost warden · Storm weaver |
| Assassin | Mobile executioner | Energy + Combo (max 5); finishers +45%/point | Critical burst · Venom artist · Shadow dancer |
| Ranger | Ranged marksman | Focus (builds on shots) + Hunter's Mark (+15% taken) | Volley · Deadeye · Trapper |
| Paladin | Holy guardian | Conviction + 15% base block (block = half damage + Conviction) | Bastion tank · Radiant crusader · Judgement |
| Necromancer | Minions & curses | Essence + Souls (from nearby deaths, max 10) | Legion · Plaguecaller · Blood bargain |

Each class has 8 Active and 4 Ultimate skills in its launch library (72 total). Loadout is exactly 8 Active + 4 Ultimate. Skills unlock at levels 1-25; ultimates from level 5. Newly unlocked skills auto-fill empty slots.

## 3. Combat
- Server simulation at 30 Hz. Action mode aims at the cursor; Tab Target mode aims at the locked target (range + line of sight validated). Universal dodge roll (3 s, 0.3 s i-frames). Potions: 4 charges, 45% life, 6 s cooldown, refill at vendor / Moonwell / boss kills.
- **Damage** = `power × coef × (1 + Σincreased%) × Πmore`. `power = weaponPower × (1+0.04·(lvl−1)) + primaryAttr × 0.6 + 1.5·lvl`.
  - *More* multipliers: keystones, Weave, finisher points, weapon affinity (+10%), weaken (−).
  - Crit: 5% + DEX×0.05 + mods (cap 95%), crit damage 150% + mods.
- **Mitigation:** armor `DR = armor / (armor + 200 + 20·attackerLevel)` (cap 75%) vs physical; resistances (cap 75%, penetration reduces) vs elemental. Dodge and block for players. Barrier absorbs first.
- **Statuses:** burn/poison/bleed/curse DoTs (poison stacks to 5); chill/slow reduce speed; freeze/stun are hard CC with 1.5 s immunity after; shock/vulnerable/curse/marked increase damage taken.
- **Bosses** are immune to hard CC; CC and damage fill a **Break gauge**. When full the boss is Broken for 4 s (+30% damage taken).
- **Threat:** damage × threat multiplier; taunts force targets.
- Guards against runaway scaling: CDR cap 50%, leech cap 10%, crit cap 95%, resist cap 75%, minion caps per type, no on-hit recursion (DoT ticks and retaliation never trigger on-hit effects).

## 4. Passive tree
Six class trees on an outer ring (start node + 3 branches × 5 nodes, each branch ending in a notable or Keystone) and a shared **Astral Core** (24-node ring, 6 notables, 3 Keystones), bridged from every class start. 135 nodes, 10 Keystones. 1 point per level, +1 per 5 Mastery levels, +quest rewards. Nodes must connect to your own class start; other class trees are not allocatable.

Keystones (trade-offs): Crimson Tempo, Unbreakable (Warrior) · Spell Echo (Mage) · Thousand Cuts (Assassin) · Lone Arrow (Ranger) · Martyr's Covenant (Paladin) · Hollow Legion (Necromancer) · Glass Constellation, Still Orbit, Twin Moon Echo (Core).

Respec: free below level 15 (learning allowance); then 50 gold × level for a full reset or 10 gold × level per node. Presets (5) and shareable build codes (`ASTRA1.…`).

## 5. Progression
- Level cap 100, `xpToNext = 100 × level^1.6`. XP from kills is reduced when the player is > 5 levels above the enemy. Party kills share XP with a group bonus.
- Mastery: 40% of XP (100% at cap), unlocks class titles at 5/15/30 and +1 passive point every 5 levels. Mastery never changes class identity.
- Account: codex (kills per enemy type), achievements, titles, shared vault (separate Normal / Hardcore). No account-wide combat bonuses.

## 6. Difficulty
| Tier | Life × | Damage × | Rarity + | Min level | Elite affixes | Mechanics |
|---|---|---|---|---|---|---|
| Story | 0.6 | 0.5 | 0 | 1 | 0 | slower telegraphs |
| Normal | 1 | 1 | 10% | 1 | 0 | — |
| Hard | 1.6 | 1.35 | 30% | 8 | 1 | elite affixes |
| Expert | 2.5 | 1.8 | 55% | 18 | 1 | faster telegraphs |
| Nightmare | 4 | 2.5 | 85% | 30 | 2 | boss uses later-phase attacks from the start |
| Abyssal | 6.5 | 3.4 | 120% | 45 | 3 | enemies burst on death |
A tier unlocks once the previous tier's Rift has been cleared (and the level requirement is met). Party life scaling: × (1 + 0.6 × (players − 1)).

## 7. Rifts (roguelike dungeons)
Seeded generator on a 5×5 cell grid: random-walk main path (6-7 rooms: entry → combat/elite → mini-boss → boss) plus 2-4 side rooms (treasure, shrine, rest, event/altar, elite). L-shaped 3-tile corridors. Every layout is validated (all rooms, spawns and interactables reachable) and regenerated deterministically on failure. 1-2 dungeon modifiers per seed.
- Shrine: pick 1 of 3 blessings (run-only). Altar of Bargains: optional curse for higher rarity. Moonwell: party heal + potion refill. Coffer: gold + 2 guaranteed uncommon+ items.
- End of run screen states what is kept (items, gold, XP) and what is lost (blessings/bargains).
- Death in Normal: lose 5% gold, respawn at the Rift entry after 5 s.

## 8. Items
Slots: weapon, helmet, chest, gloves, boots, 2 rings, necklace, relic, rune. Rarities Common → Ancient (0 → 5 affixes, tiers 1-5); Legendary/Ancient add a build-defining power (e.g. *of the Split Moon*: basic attacks strike twice more). Smart loot: 35% of weapon drops match your class. Loot is personal (each player rolls their own drops). Salvage → Astral Dust; enchant rerolls one affix for dust + gold; sell to the Quartermaster. Ancient items are bound.

## 9. Enemies
Hollowborn (eclipse-hollowed dead): Husk (melee), Bowman (ranged), Hexweaver (delayed eruptions + weaken), Juggernaut (slam, elite), Vanguard Captain (mini-boss: cleave, charge, rally adds). Duskmeadow wildlife: Gloomfang Wolf, Thornback Boar (charge), Eclipse Wisp. Elite affixes: Hasted, Shielded, Volatile, Vampiric, Frenzied.

**Veyra, the Umbral Warden:** phase 1 sweeping cleave + umbral orb nova; phase 2 (<60%) shadow eruptions under players + summons; phase 3 (<25%) Eclipse double nova, faster windups. Phase transitions grant 1.2 s invulnerability and fire a nova. Every attack is telegraphed (red zones fill before they hit).

## 10. Narrative
Chapter 1 "Ashes at the Gate" (Commander Aveline): husk cleanup, wolves on the caravan road, moonpetal for healers, elites, and the Umbral Warden. Chapter 2 hook: the Rift is learning. Codex entries give lore for the Hollowborn and Veyra.

## 11. Monetization stance
None implemented. Planned principles: cosmetics and clearly priced optional content only; no stat sales, no paid random boxes without published odds.
