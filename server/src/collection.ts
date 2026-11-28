// The room side of the Adventure Book (shared/rules/collection.ts): load a character's book at map entry, count kills / variants / cards as
// they happen (written through on the character's write chain, so they land in order with the rest of its saves), and pay milestones once:
// the claim is checked here and recorded with a primary key, so a repeated or concurrent claim can never pay twice.
import type { Client } from "@colyseus/core";
import { Msg, type BookEntryEvent, type BookEvent } from "../../shared/protocol.ts";
import { MILESTONE_BY_ID, bookKey, claimBlock, type Book, type Kind } from "../../shared/rules/collection.ts";
import { itemNamed } from "../../shared/rules/lookup.ts";
import { MOB_BY_ID, type JobKey } from "../../shared/rules/data.ts";
import { ITEMS } from "../../shared/rules/items.ts";
import { db } from "./db.ts";
import type { MapRoom } from "./rooms/MapRoom.ts";

type Entry = { charId: number; book: Book; claimed: Set<string> };

export class CollectionSystem {
  private books = new Map<string, Entry>();
  private room: MapRoom;
  constructor(room: MapRoom) { this.room = room; }

  async load(sid: string, charId: number) {
    const book: Book = new Map(), claimed = new Set<string>();
    for (const r of (await db.query("SELECT kind, ref, count FROM collection WHERE char_id = $1", [charId])).rows) book.set(bookKey(r.kind, Number(r.ref)), Number(r.count));
    for (const r of (await db.query("SELECT milestone FROM collection_claim WHERE char_id = $1", [charId])).rows) claimed.add(String(r.milestone));
    this.books.set(sid, { charId, book, claimed });
  }
  leave(sid: string) { this.books.delete(sid); }

  /** One more of `ref`: a kill of a species / variant, a card found. A first one is announced to the owner. */
  record(sid: string, kind: Kind, ref: number, n = 1) {
    const e = this.books.get(sid), inv = this.room.brains.get(sid)?.inv;
    if (!e || !inv) return;
    const key = bookKey(kind, ref), count = (e.book.get(key) ?? 0) + n;
    e.book.set(key, count);
    inv.persist("INSERT INTO collection (char_id, kind, ref, count) VALUES ($1, $2, $3, $4) ON CONFLICT (char_id, kind, ref) DO UPDATE SET count = collection.count + EXCLUDED.count",
      [e.charId, kind, ref, n]).catch(() => {});
    const c = this.room.clients.getById(sid);
    if (!c) return;
    c.send(Msg.bookEntry, { kind, ref, count } satisfies BookEntryEvent);
    if (count === n) {
      const name = kind === "card" ? ITEMS.get(ref)?.name : kind === "mob" ? MOB_BY_ID.get(ref)?.name : undefined;
      if (name) this.room.notice(c, `New in your Adventure Book: ${name}`);
    }
  }

  send(sid: string) {
    const e = this.books.get(sid), c = this.room.clients.getById(sid);
    if (!e || !c) return;
    c.send(Msg.book, { entries: [...e.book], claimed: [...e.claimed] } satisfies BookEvent);
  }

  /** Claim a milestone: reached, not claimed before, the reward fits the bag; then recorded (primary key) and paid. */
  claim(client: Client, id: string) {
    const sid = client.sessionId, e = this.books.get(sid), b = this.room.brains.get(sid), p = this.room.state.players.get(sid);
    if (!e || !b?.inv || !p) return;
    const why = claimBlock(e.book, e.claimed, String(id));
    if (why) { this.room.notice(client, `Can't claim that: ${why}.`); return; }
    const m = MILESTONE_BY_ID.get(String(id))!;
    for (const r of m.reward.items ?? []) {
      const it = itemNamed(r.item);
      const full = it && b.inv.canAdd(it, r.count, p.job as JobKey, p.str);
      if (!it || full) { this.room.notice(client, `Can't claim that: ${full ?? "reward missing"}.`); return; }
    }
    e.claimed.add(m.id);
    b.inv.persist("INSERT INTO collection_claim (char_id, milestone) VALUES ($1, $2) ON CONFLICT DO NOTHING", [e.charId, m.id]).catch(() => {});
    if (m.reward.zeny) b.inv.gainZeny(m.reward.zeny);
    for (const r of m.reward.items ?? []) b.inv.add(itemNamed(r.item)!.id, r.count);
    this.room.sendInv(client, p);
    this.room.notice(client, `Adventure Book: ${m.title} — reward received.`);
    this.send(sid);
  }
}
