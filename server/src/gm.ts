// GM system. A player unlocks it by typing "/gm<passphrase>" in chat: the client sends the text after "/gm" as Msg.gmAuth,
// this file compares it with the GM_PASSPHRASE environment variable (set on the server, never in the code or the client),
// and marks the account GM in the database (accounts.gm), so it stays GM on every later login. With no GM_PASSPHRASE set,
// nobody can unlock (accounts already GM keep working). Wrong answers get the same reply as an unknown command, and an
// account gets 5 tries per 10 minutes.
//
// A GM can act on any online character in any map room (this process holds them all: `online`), on its own map, and on
// the whole server (announcements, EXP / drop rates). Every GM action is logged with the GM's name.
import { timingSafeEqual } from "node:crypto";
import type { Client } from "@colyseus/core";
import { Msg, type GmAuthMsg, type GmOnlineEvent, type GmOp, type GmResultEvent, type GmStateEvent, type ItemGetEvent, type LevelUpEvent } from "../../shared/protocol.ts";
import { isMapName, MAP_INFO, nearestWalkable, WARPS, type MapName } from "../../shared/maps.ts";
import { JOBS, MOB_BY_ID, type JobKey } from "../../shared/rules/data.ts";
import { ITEMS } from "../../shared/rules/items.ts";
import { statPointsAt } from "../../shared/rules/exp.ts";
import { walkable } from "../../shared/map.ts";
import { db } from "./db.ts";
import type { MapRoom } from "./rooms/MapRoom.ts";

type Online = Map<number, { room: MapRoom; client: Client }>;
type Found = { room: MapRoom; client: Client; sid: string; accountId: number };

/** EXP and drop multipliers for the whole server (1 = normal). MapRoom.reward and the drop roll read them. */
export const gmRates = { exp: 1, drop: 1 };

const gmCache = new Map<number, boolean>(); // accountId -> GM
const mutedUntil = new Map<number, number>(); // accountId -> ms epoch
const tries = new Map<number, { n: number; reset: number }>();
let spawnSeq = 0;

async function isGm(accountId: number) {
  if (!gmCache.has(accountId)) {
    const r = await db.query("SELECT gm, muted_until FROM accounts WHERE id = $1", [accountId]);
    gmCache.set(accountId, !!r.rows[0]?.gm);
    const mu = r.rows[0]?.muted_until ? new Date(r.rows[0].muted_until).getTime() : 0;
    if (mu > Date.now()) mutedUntil.set(accountId, mu);
  }
  return gmCache.get(accountId)!;
}

/** May this account chat now? (a GM mute) */
export function isMuted(accountId: number | undefined) {
  if (accountId === undefined) return false;
  const until = mutedUntil.get(accountId) ?? 0;
  if (until && until <= Date.now()) mutedUntil.delete(accountId);
  return until > Date.now();
}
/** Loads the mute state at login (chat checks are synchronous). */
export async function loadModeration(accountId: number) { gmCache.delete(accountId); await isGm(accountId); }

function phraseOk(given: string) {
  const want = process.env.GM_PASSPHRASE ?? "";
  if (!want) return false;
  const a = Buffer.from(given), b = Buffer.from(want);
  return a.length === b.length && timingSafeEqual(a, b);
}

export class GmSystem {
  private room: MapRoom;
  private online: Online;
  constructor(room: MapRoom, online: Online) { this.room = room; this.online = online; }

  register() {
    const room = this.room;
    room.onMessage(Msg.gmAuth, (client: Client, m: GmAuthMsg) => void this.auth(client, String(m?.phrase ?? "")).catch((e) => console.error("[gm] auth", e)));
    room.onMessage(Msg.gm, (client: Client, m: GmOp) => void this.run(client, m).catch((e) => {
      console.error("[gm]", e);
      this.reply(client, false, "That did not work (server error).");
    }));
  }

  private acc(client: Client) { return this.room.accountOf.get(client.sessionId); }
  private reply(client: Client, ok: boolean, text: string) { client.send(Msg.gmResult, { ok, text } satisfies GmResultEvent); }
  private state(client: Client, gm: boolean) { client.send(Msg.gmState, { gm, rates: { ...gmRates } } satisfies GmStateEvent); }

  private async auth(client: Client, phrase: string) {
    const acc = this.acc(client);
    if (acc === undefined) return;
    if (await isGm(acc)) return this.state(client, true); // "/gm" again: open the menu
    const now = Date.now(), t = tries.get(acc) ?? { n: 0, reset: now + 600_000 };
    if (now > t.reset) { t.n = 0; t.reset = now + 600_000; }
    t.n++;
    tries.set(acc, t);
    if (t.n > 5 || !phraseOk(phrase)) return client.send(Msg.notice, { text: "Unknown command." });
    await db.query("UPDATE accounts SET gm = true WHERE id = $1", [acc]);
    gmCache.set(acc, true);
    console.log(`[gm] account ${acc} (${this.room.state.players.get(client.sessionId)?.name}) unlocked GM`);
    this.state(client, true);
  }

  /** an online character by name (any map); "" or undefined = the GM itself */
  private find(gm: Client, name?: string): Found | undefined {
    if (!name) { const accountId = this.acc(gm)!; return { room: this.room, client: gm, sid: gm.sessionId, accountId }; }
    const want = name.trim().toLowerCase();
    for (const [accountId, { room, client }] of this.online) {
      const p = room.state.players.get(client.sessionId);
      if (p && p.name.toLowerCase() === want) return { room, client, sid: client.sessionId, accountId };
    }
    return undefined;
  }

  private async run(client: Client, m: GmOp) {
    const acc = this.acc(client);
    if (acc === undefined || !(await isGm(acc)) || !m || typeof m !== "object") return; // not a GM: ignored, like an unknown packet
    const me = this.room.state.players.get(client.sessionId);
    const say = (ok: boolean, text: string) => {
      this.reply(client, ok, text);
      if (ok) console.log(`[gm] ${me?.name}: ${m.op} — ${text}`);
    };
    const target = "target" in m ? m.target : undefined;
    const needTarget = (): Found | undefined => {
      const f = this.find(client, target);
      if (!f) say(false, `${target} is not online.`);
      return f;
    };
    const num = (v: unknown, lo: number, hi: number) => { const n = Math.round(Number(v)); return Number.isFinite(n) ? Math.min(hi, Math.max(lo, n)) : undefined; };

    switch (m.op) {
      case "online": {
        const players: GmOnlineEvent["players"] = [];
        for (const [accountId, { room, client: c }] of this.online) {
          const p = room.state.players.get(c.sessionId);
          if (!p) continue;
          players.push({ name: p.name, map: room.mapName, x: Math.round(p.x), y: Math.round(p.y), level: p.level, jobLevel: p.jobLevel, job: p.job,
            hp: p.hp, maxHp: p.maxHp, dead: p.dead, gm: gmCache.get(accountId) ?? false, muted: isMuted(accountId) });
        }
        players.sort((a, b) => a.name.localeCompare(b.name));
        return client.send(Msg.gmOnline, { players } satisfies GmOnlineEvent);
      }
      case "announce": {
        const text = String(m.text ?? "").trim().slice(0, 160);
        if (!text) return say(false, "Type a message to announce.");
        this.room.announce(`[GM] ${text}`);
        return say(true, "Announced to everyone online.");
      }
      case "rates": {
        const exp = num(m.exp ?? gmRates.exp * 100, 0, 10000), drop = num(m.drop ?? gmRates.drop * 100, 0, 10000);
        if (exp !== undefined) gmRates.exp = exp / 100;
        if (drop !== undefined) gmRates.drop = drop / 100;
        this.state(client, true);
        return say(true, `Rates: EXP ${Math.round(gmRates.exp * 100)}%, drops ${Math.round(gmRates.drop * 100)}%.`);
      }
      case "warp": {
        const f = needTarget(); if (!f) return;
        if (!isMapName(m.map)) return say(false, `No map called ${m.map}.`);
        const to = this.spotOn(m.map, m.x, m.y);
        this.moveTo(f, to);
        return say(true, `${this.nameOf(f)} → ${MAP_INFO[m.map].title} (${to.x}, ${to.y}).`);
      }
      case "goto": case "summon": {
        const f = needTarget(); if (!f) return;
        const self = this.find(client)!;
        const [mover, anchor] = m.op === "goto" ? [self, f] : [f, self];
        const ap = anchor.room.state.players.get(anchor.sid)!;
        this.moveTo(mover, { map: anchor.room.mapName as MapName, x: Math.round(ap.x), y: Math.round(ap.y) });
        return say(true, m.op === "goto" ? `Went to ${this.nameOf(f)}.` : `Summoned ${this.nameOf(f)}.`);
      }
      case "level": {
        const f = needTarget(); if (!f) return;
        const { room, sid } = f, p = room.state.players.get(sid)!, def = JOBS[p.job as JobKey];
        const base = m.base === undefined ? p.level : num(m.base, 1, def.maxBaseLevel)!, job = m.job === undefined ? p.jobLevel : num(m.job, 1, def.maxJobLevel)!;
        if (base > p.level) p.statPoints += statPointsAt(base) - statPointsAt(p.level);
        if (job > p.jobLevel) p.skillPoints += job - p.jobLevel;
        const up = base > p.level || job > p.jobLevel;
        p.level = base; p.jobLevel = job; p.exp = 0; p.jobExp = 0;
        this.refresh(f, true);
        if (up) room.sendArea("AREA", sid, Msg.levelUp, { id: sid, kind: "base" } satisfies LevelUpEvent);
        return say(true, `${p.name}: Base Lv ${base}, Job Lv ${job}.`);
      }
      case "job": {
        const f = needTarget(); if (!f) return;
        if (!(m.job in JOBS)) return say(false, `No job called ${m.job}.`);
        const ok = f.room.skills.jobChange(f.sid, m.job as JobKey);
        return say(ok, ok ? `${this.nameOf(f)} is now ${JOBS[m.job as JobKey].name}.` : `${this.nameOf(f)} already has that job.`);
      }
      case "stat": {
        const f = needTarget(); if (!f) return;
        if (!["str", "agi", "vit", "int", "dex", "luk"].includes(m.stat)) return say(false, "Pick STR, AGI, VIT, INT, DEX or LUK.");
        const p = f.room.state.players.get(f.sid)!, v = num(m.value, 1, 999);
        if (v === undefined) return say(false, "Type a number.");
        p[m.stat] = v;
        this.refresh(f, false);
        return say(true, `${p.name}: ${m.stat.toUpperCase()} ${v}.`);
      }
      case "points": {
        const f = needTarget(); if (!f) return;
        const p = f.room.state.players.get(f.sid)!;
        if (m.status !== undefined) p.statPoints = num(m.status, 0, 99999) ?? p.statPoints;
        if (m.skill !== undefined) p.skillPoints = num(m.skill, 0, 9999) ?? p.skillPoints;
        this.refresh(f, false);
        return say(true, `${p.name}: ${p.statPoints} status points, ${p.skillPoints} skill points.`);
      }
      case "zeny": {
        const f = needTarget(); if (!f) return;
        const b = f.room.brains.get(f.sid), p = f.room.state.players.get(f.sid)!, n = num(m.amount, -1e9, 1e9);
        if (!b?.inv || !n) return say(false, "Type an amount (negative takes zeny away).");
        if (n > 0) b.inv.gainZeny(n); else b.inv.payZeny(Math.min(b.inv.zeny, -n));
        f.room.sendInv(f.client, p);
        return say(true, `${p.name} now has ${b.inv.zeny.toLocaleString("en-US")} zeny.`);
      }
      case "item": {
        const f = needTarget(); if (!f) return;
        const item = ITEMS.get(Number(m.itemId)), amount = num(m.amount ?? 1, 1, 30000)!;
        const b = f.room.brains.get(f.sid), p = f.room.state.players.get(f.sid)!;
        if (!item) return say(false, `No item with id ${m.itemId}.`);
        if (!b?.inv) return say(false, "That character's bag is not loaded yet.");
        b.inv.add(item.id, amount);
        f.client.send(Msg.itemGet, { itemId: item.id, amount } satisfies ItemGetEvent);
        f.room.sendInv(f.client, p);
        f.room.flushStatus(f.sid);
        return say(true, `Gave ${amount} × ${item.name} to ${p.name}.`);
      }
      case "heal": case "revive": {
        const f = needTarget(); if (!f) return;
        const p = f.room.state.players.get(f.sid)!;
        if (m.op === "revive" && !p.dead) return say(false, `${p.name} is not dead.`);
        p.dead = false;
        p.hp = p.maxHp; p.sp = p.maxSp;
        f.room.flushStatus(f.sid);
        return say(true, m.op === "revive" ? `${p.name} is back on their feet.` : `${p.name} is fully healed.`);
      }
      case "kill": {
        const f = needTarget(); if (!f) return;
        const p = f.room.state.players.get(f.sid)!, b = f.room.brains.get(f.sid);
        if (p.dead || !b) return say(false, `${p.name} is already down.`);
        p.hp = 0;
        f.room.unitDied(f.sid, p, b, undefined);
        return say(true, `${p.name} was struck down.`);
      }
      case "kick": {
        const f = needTarget(); if (!f) return;
        const name = this.nameOf(f);
        f.client.send(Msg.notice, { text: "You were disconnected by a GM." });
        f.client.leave(4000);
        return say(true, `Kicked ${name}.`);
      }
      case "ban": case "unban": case "mute": case "unmute": case "setgm": {
        const accountId = await this.accountByName(target ?? "");
        if (accountId === undefined) return say(false, `No character called ${target}.`);
        if (m.op === "ban") {
          const hours = num(m.hours, 1, 24 * 365 * 10)!;
          await db.query("UPDATE accounts SET banned_until = now() + make_interval(hours => $2) WHERE id = $1", [accountId, hours]);
          const on = this.online.get(accountId);
          if (on) { on.client.send(Msg.notice, { text: "This account was banned by a GM." }); on.client.leave(4000); }
          return say(true, `Banned ${target} for ${hours} h.`);
        }
        if (m.op === "unban") { await db.query("UPDATE accounts SET banned_until = NULL WHERE id = $1", [accountId]); return say(true, `Unbanned ${target}.`); }
        if (m.op === "mute") {
          const minutes = num(m.minutes, 1, 60 * 24 * 30)!;
          const until = Date.now() + minutes * 60_000;
          mutedUntil.set(accountId, until);
          await db.query("UPDATE accounts SET muted_until = to_timestamp($2 / 1000.0) WHERE id = $1", [accountId, until]);
          this.online.get(accountId)?.client.send(Msg.notice, { text: `A GM muted your chat for ${minutes} min.` });
          return say(true, `Muted ${target} for ${minutes} min.`);
        }
        if (m.op === "unmute") {
          mutedUntil.delete(accountId);
          await db.query("UPDATE accounts SET muted_until = NULL WHERE id = $1", [accountId]);
          return say(true, `Unmuted ${target}.`);
        }
        if (accountId === acc && !m.on) return say(false, "You cannot remove your own GM rights here.");
        await db.query("UPDATE accounts SET gm = $2 WHERE id = $1", [accountId, !!m.on]);
        gmCache.set(accountId, !!m.on);
        const on = this.online.get(accountId);
        if (on) on.client.send(Msg.gmState, { gm: !!m.on, rates: { ...gmRates } } satisfies GmStateEvent);
        return say(true, m.on ? `${target} is now a GM.` : `${target} is no longer a GM.`);
      }
      case "spawn": {
        const def = MOB_BY_ID.get(Number(m.mobId)), count = num(m.count ?? 1, 1, 50)!;
        if (!def) return say(false, `No monster with id ${m.mobId}.`);
        if (!me) return;
        const room = this.room;
        for (let i = 0; i < count; i++) {
          const a = (i / count) * Math.PI * 2, r = count === 1 ? 2 : 2 + (i % 3);
          let x = Math.round(me.x + Math.cos(a) * r), y = Math.round(me.y + Math.sin(a) * r);
          if (!walkable(room.map, x, y)) ({ x, y } = nearestWalkable(room.map, x, y));
          room.addMonster(`gm${++spawnSeq}`, def.id, x, y); // no spawn line: it does not respawn
        }
        return say(true, `Spawned ${count} × ${def.name}.`);
      }
      case "killmobs": {
        let n = 0;
        for (const [id, mon] of [...this.room.state.monsters]) {
          const b = this.room.brains.get(id);
          if (mon.dead || !b) continue;
          mon.hp = 0;
          this.room.unitDied(id, mon, b, undefined);
          n++;
        }
        return say(true, `Defeated ${n} monster${n === 1 ? "" : "s"} on this map.`);
      }
      default:
        return say(false, "Unknown GM command.");
    }
  }

  private nameOf(f: Found) { return f.room.state.players.get(f.sid)?.name ?? "?"; }

  /** stats / levels changed: status, owner's numbers, skills tree, look, save */
  private refresh(f: Found, full: boolean) {
    const p = f.room.state.players.get(f.sid)!;
    f.room.refreshStatus(f.sid, p);
    if (full) { p.hp = p.maxHp; p.sp = p.maxSp; }
    f.room.flushStatus(f.sid);
    f.room.skills.send(f.sid);
    f.room.save(p).catch((e) => console.error("[save]", e));
  }

  /** a cell on `map`: the one asked for, else where its first entrance puts you */
  private spotOn(map: MapName, x?: number, y?: number) {
    if (x !== undefined && y !== undefined && Number.isFinite(+x) && Number.isFinite(+y)) return { map, x: Math.round(+x), y: Math.round(+y) };
    const arrival = WARPS.find((w) => w.to.map === map)?.to;
    return arrival ? { map, x: arrival.x, y: arrival.y } : { map, x: 50, y: 50 };
  }

  private moveTo(f: Found, to: { map: MapName; x: number; y: number }) {
    const p = f.room.state.players.get(f.sid)!, b = f.room.brains.get(f.sid)!;
    if (p.dead) { p.dead = false; p.hp = p.maxHp; p.sp = p.maxSp; f.room.flushStatus(f.sid); }
    f.room.setPos(f.sid, p, b, to);
  }

  private async accountByName(name: string) {
    const r = await db.query("SELECT account_id FROM characters WHERE lower(name) = lower($1)", [name.trim()]);
    return r.rows[0]?.account_id as number | undefined;
  }
}
