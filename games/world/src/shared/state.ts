import { schema, t, type SchemaType } from "@colyseus/schema";

/**
 * Synchronised state. Shared by server and client so both decode the same
 * classes. Positions are in cell units: cell (3, 5) has its centre at x=3, y=5.
 */
export const Player = schema({
  name: t.string(),
  x: t.float32(),
  y: t.float32(),
  /** Facing, 0..7 clockwise from south (RO sprite order). */
  dir: t.uint8(),
  moving: t.boolean(),
  /** Index into the client's colour palette, until real sprites exist. */
  color: t.uint8(),
  hp: t.uint16(),
  maxHp: t.uint16(),
}, "Player");
export type Player = SchemaType<typeof Player>;

export const Monster = schema({
  /** Key into MONSTERS (data/monsters.json). */
  def: t.string(),
  x: t.float32(),
  y: t.float32(),
  dir: t.uint8(),
  moving: t.boolean(),
  hp: t.uint32(),
  maxHp: t.uint32(),
}, "Monster");
export type Monster = SchemaType<typeof Monster>;

export const GroundItem = schema({
  /** Key into ITEMS (data/items.json). */
  item: t.string(),
  x: t.uint8(),
  y: t.uint8(),
}, "GroundItem");
export type GroundItem = SchemaType<typeof GroundItem>;

export const WorldState = schema({
  mapId: t.string(),
  players: t.map(Player),
  // Area of interest: each client only receives the monsters and items its StateView holds.
  monsters: t.map(Monster).view(),
  items: t.map(GroundItem).view(),
}, "WorldState");
export type WorldState = SchemaType<typeof WorldState>;
