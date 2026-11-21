import { describe, expect, it } from "vitest";
import { GameMap } from "./map";
import { MAPS } from "./maps";
import { findPath } from "./pathfinding";

const grid = (...tiles: string[]) => new GameMap({ id: "t", name: "t", spawn: { x: 0, y: 0 }, tiles });

describe("findPath", () => {
  it("walks diagonally across open ground", () => {
    const map = grid("....", "....", "....", "....");
    expect(findPath(map, { x: 0, y: 0 }, { x: 3, y: 3 })).toEqual([{ x: 1, y: 1 }, { x: 2, y: 2 }, { x: 3, y: 3 }]);
  });

  it("returns an empty path when already at the target", () => {
    expect(findPath(grid(".."), { x: 1, y: 0 }, { x: 1, y: 0 })).toEqual([]);
  });

  it("routes around walls", () => {
    const map = grid(
      ".....",
      ".TTT.",
      ".....",
    );
    const path = findPath(map, { x: 2, y: 0 }, { x: 2, y: 2 })!;
    expect(path.at(-1)).toEqual({ x: 2, y: 2 });
    for (const c of path) expect(map.isWalkable(c.x, c.y)).toBe(true);
  });

  it("does not cut the corner of a blocked cell", () => {
    const map = grid(
      ".T",
      "..",
    );
    expect(findPath(map, { x: 0, y: 0 }, { x: 1, y: 1 })).toEqual([{ x: 0, y: 1 }, { x: 1, y: 1 }]);
  });

  it("returns null for unwalkable or unreachable targets", () => {
    const map = grid(".T.", ".T.", ".T.");
    expect(findPath(map, { x: 0, y: 0 }, { x: 1, y: 1 })).toBeNull();
    expect(findPath(map, { x: 0, y: 0 }, { x: 2, y: 0 })).toBeNull();
  });

  it("returns null when the path is longer than the limit", () => {
    const map = grid("..........");
    expect(findPath(map, { x: 0, y: 0 }, { x: 9, y: 0 }, 5)).toBeNull();
    expect(findPath(map, { x: 0, y: 0 }, { x: 5, y: 0 }, 5)).toHaveLength(5);
  });
});

describe("map data", () => {
  it("loads every map with a walkable spawn", () => {
    for (const map of Object.values(MAPS)) {
      expect(map.isWalkable(map.spawn.x, map.spawn.y)).toBe(true);
    }
  });

  it("rejects malformed maps", () => {
    expect(() => grid("..", ".")).toThrow(/row 1/);
    expect(() => grid("?.")).toThrow(/unknown tile/);
  });
});
