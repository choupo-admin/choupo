/*---------------------------------------------------------------------------*\
  The 3D layout view refused to start on `plant/swro01_campoDalias` with
  "can't access property \"index\", t[0] is undefined": three.js's
  mergeGeometries reads geometries[0].index, and the pipe rack of that case
  has no portals (a road passes under all of its length, and the drawing never
  stands a post on pavement), so its concrete-footing list was empty.
\*---------------------------------------------------------------------------*/
import { describe, expect, it } from "vitest";
import { rackPortals } from "../src/case/plantLayout.js";
import { mergeNonEmpty } from "../src/ui/plotting/layoutRenderer.js";

describe("an empty part is drawn as absent, not as a crash", () => {
  it("mergeNonEmpty never calls the merge on an empty list", () => {
    let called = 0;
    const merge = (g: { index: unknown }[]) => { called++; return g[0]!.index === undefined ? null : g[0]!; };
    expect(mergeNonEmpty(merge, [])).toBeNull();
    expect(called).toBe(0);
  });
  it("it merges a non-empty list exactly as before", () => {
    const a = { index: null }, b = { index: null };
    const seen: number[] = [];
    const merge = (g: { index: unknown }[]) => { seen.push(g.length); return a; };
    expect(mergeNonEmpty(merge, [a, b])).toBe(a);
    expect(seen).toEqual([2]);
  });
  it("a road under the whole rack leaves no portal -- the case that crashed", () => {
    //  The numbers are the engine's own for swro01_campoDalias: rackCrossing
    //  `middle`, xMin -118, xMax 130, on a rack from -118 to 130.
    expect(rackPortals(-118, 130, [{ xMin: -118, xMax: 130 }])).toEqual([]);
  });
});
