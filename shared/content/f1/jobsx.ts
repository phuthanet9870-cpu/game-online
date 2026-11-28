// The two guild NPCs of the extended classes: the Master of Paths (a Fledgling becomes a Wayfarer, Marksman, Shinobi or Striker; a Striker at
// Job Lv 40 becomes a Starblade or Soulbinder) and the Keeper of the Third Dawn (a transcendent second job at Base 99 / Job 50 takes its
// third job). Same rules as the other masters: Basic Training 9, skill points spent, a starter gift.
import type { NpcScript, Script } from "../api.ts";
import type { JobKey } from "../../rules/data.ts";
import { JOBS } from "../../rules/data.ts";
import { MAPID, jobOfMapid } from "../../rules/status.ts";
import { ET } from "../../rules/script.ts";

const title = (job: JobKey) => JOBS[job].name;
export const PATHMASTER = { npc: "npc_job_paths", name: "Pathfinder Ines", sprite: "npc_ranger" } as const;
export const THIRDDAWN = { npc: "npc_third_dawn", name: "Keeper of the Third Dawn", sprite: "npc_guide" } as const;

type Path = { job: JobKey; about: string; kit: { item: string; count: number }[] };
export const NOVICE_PATHS: Path[] = [
  { job: "Super_Novice", about: "Wayfarers learn a little of every guild's craft, and have the luck to survive it. Their own skills: Lucky Strike, Spark Bolt, Mend, Second Wind.", kit: [{ item: "Knife", count: 1 }] },
  { job: "Gunslinger", about: "Marksmen fight with powder: revolvers, rifles, shotguns and gatlings. Every shot spends a bullet, so carry plenty.", kit: [{ item: "Six-Shooter", count: 1 }, { item: "Iron Bullet", count: 300 }] },
  { job: "Ninja", about: "Shinobi throw kunai and stars and throw fire, ice and wind besides. Quick, clever, and gone before the dust settles.", kit: [{ item: "Windmill Star", count: 1 }, { item: "Kunai", count: 300 }] },
  { job: "Taekwon", about: "Strikers need no weapon: kicks, leaps, and stances that turn into combos. Two further roads open at Job Lv 40.", kit: [] },
];
export const STRIKER_PATHS: Path[] = [
  { job: "Star_Gladiator", about: "Starblades borrow strength from the sun, moon and stars, and spend it in heavy blows.", kit: [] },
  { job: "Soul_Linker", about: "Soulbinders speak to spirits: curses, wards and links that lift a whole party.", kit: [{ item: "Rod", count: 1 }] },
];

export const pathMaster: NpcScript = async (s: Script) => {
  const N = `[${PATHMASTER.name}]`;
  s.mes(N, "Not every road runs through the six guilds. I know four more, and a Striker's two.");
  await s.next();
  const cls = s.get("Class");
  const novice = cls === MAPID.Novice;
  const paths = novice ? NOVICE_PATHS : cls === MAPID.Taekwon ? STRIKER_PATHS : [];
  if (!paths.length) {
    s.mes(N, cls === MAPID.Novice_High ? "A High Fledgling returns to the road of its past life. Seek that guild's master." : "You already walk a road of your own. Go well.");
    return s.close();
  }
  const pick = await s.select(...paths.map((p) => `Tell me about the ${title(p.job)}.`), ...paths.map((p) => `I want to become a ${title(p.job)}.`), "Nothing, thanks.");
  if (pick >= 1 && pick <= paths.length) { s.mes(N, paths[pick - 1].about); return s.close(); }
  const path = paths[pick - paths.length - 1];
  if (!path) return s.close();
  if (novice ? s.basicskillcheck() && s.getskilllv("NV_BASIC") <= 8 : s.get("JobLevel") < 40) {
    s.emotion(ET.SWEAT);
    s.mes(N, novice ? "Not yet. Finish the Fledgling's training first: ^4d4dffBasic Training Lv 9^000000." : "Not yet. A Striker must reach ^4d4dffJob Lv 40^000000 first.");
    return s.close();
  }
  if (!novice && s.get("SkillPoint") > 0) { s.mes(N, "Spend your skill points first (^4d4dffAlt+S^000000)."); return s.close(); }
  s.mes(N, `Do you want to become a ^4d4dff${title(path.job)}^000000? There is no going back.`);
  await s.next();
  if (await s.select("Yes, I'm ready.", "Let me think again.") !== 1) return s.close();
  if (path.kit.length) {
    const [g, ...more] = path.kit;
    if (!s.checkweight(g.item, g.count, ...more.flatMap((k) => [k.item, k.count]))) { s.mes(N, "Your bag is too full for my gift. Make some room first."); return s.close(); }
  }
  if (!s.jobchange(path.job)) return s.close();
  for (const g of path.kit) s.getitem(g.item, g.count);
  s.emotion(ET.BEST);
  s.mes(N, `From today you are a ^4d4dff${title(path.job)}^000000. Your skills are in the Skill window (^4d4dffAlt+S^000000).`);
  return s.close();
};

/** transcendent second job -> third job */
export const THIRD_OF: Record<string, JobKey> = {
  Lord_Knight: "Rune_Knight", Paladin: "Royal_Guard", High_Wizard: "Warlock", Professor: "Sorcerer", Sniper: "Ranger", Clown: "Minstrel", Gypsy: "Wanderer",
  High_Priest: "Arch_Bishop", Champion: "Sura", Whitesmith: "Mechanic", Creator: "Genetic", Assassin_Cross: "Guillotine_Cross", Stalker: "Shadow_Chaser",
};
export const thirdDawn: NpcScript = async (s: Script) => {
  const N = `[${THIRDDAWN.name}]`;
  const cls = s.get("Class"), job = jobOfMapid(cls, s.get("Sex") === 0);
  s.mes(N, "A transcendent road has one more door: the Third Dawn. Few reach it.");
  await s.next();
  const third = job ? THIRD_OF[job] : undefined;
  if (!job || !third) {
    s.mes(N, job && Object.values(THIRD_OF).includes(job) ? "You have already passed through the Third Dawn." : "Come back as a transcendent second job: Base Lv 99 and Job Lv 50.");
    return s.close();
  }
  if (s.get("BaseLevel") < 99 || s.get("JobLevel") < 50) { s.mes(N, `A ${title(job)} must reach ^4d4dffBase Lv 99^000000 and ^4d4dffJob Lv 50^000000 first.`); return s.close(); }
  if (s.get("SkillPoint") > 0) { s.mes(N, "Spend every skill point first."); return s.close(); }
  s.mes(N, `Your road leads to the ^4d4dff${title(third)}^000000. Your skills stay with you, your job level starts again at 1.`);
  await s.next();
  if (await s.select("Yes, I'm ready.", "Not yet.") !== 1) return s.close();
  if (!s.jobchange(third)) return s.close();
  s.emotion(ET.BEST);
  s.mes(N, `From today you are a ^4d4dff${title(third)}^000000. New skills wait in the Skill window.`);
  return s.close();
};
