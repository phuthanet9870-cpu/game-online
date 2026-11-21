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
}, "Player");
export type Player = SchemaType<typeof Player>;

export const WorldState = schema({
  mapId: t.string(),
  players: t.map(Player),
}, "WorldState");
export type WorldState = SchemaType<typeof WorldState>;
