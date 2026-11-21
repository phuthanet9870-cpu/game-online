import { describe, expect, it } from "vitest";
import { advance, directionOf } from "./movement";

describe("advance", () => {
  it("moves part of the way to the next waypoint", () => {
    const w = { x: 0, y: 0, path: [{ x: 1, y: 0 }] };
    expect(advance(w, 0.25)).toBe(directionOf(1, 0));
    expect(w).toEqual({ x: 0.25, y: 0, path: [{ x: 1, y: 0 }] });
  });

  it("carries leftover distance into the following waypoint", () => {
    const w = { x: 0, y: 0, path: [{ x: 1, y: 0 }, { x: 2, y: 0 }] };
    advance(w, 1.5);
    expect(w.x).toBeCloseTo(1.5);
    expect(w.path).toEqual([{ x: 2, y: 0 }]);
  });

  it("stops at the end of the path", () => {
    const w = { x: 0, y: 0, path: [{ x: 0, y: 1 }] };
    advance(w, 10);
    expect(w).toEqual({ x: 0, y: 1, path: [] });
    expect(advance(w, 1)).toBeNull();
  });
});

describe("directionOf", () => {
  it("uses RO's clockwise-from-south order", () => {
    expect([directionOf(0, 1), directionOf(-1, 0), directionOf(0, -1), directionOf(1, 0)]).toEqual([0, 2, 4, 6]);
    expect(directionOf(1, 1)).toBe(7);
  });
});
