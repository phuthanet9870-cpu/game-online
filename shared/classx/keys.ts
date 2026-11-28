/** The job keys the extended classes add (their rows are built in jobs.ts from the specs in expanded.ts / third.ts). */
export const CLASSX_KEYS = ["Super_Novice", "Gunslinger", "Ninja", "Taekwon", "Star_Gladiator", "Soul_Linker",
  "Rune_Knight", "Royal_Guard", "Warlock", "Sorcerer", "Ranger", "Minstrel", "Wanderer", "Arch_Bishop", "Sura", "Mechanic", "Genetic", "Guillotine_Cross", "Shadow_Chaser"] as const;
export type ClassxKey = (typeof CLASSX_KEYS)[number];
