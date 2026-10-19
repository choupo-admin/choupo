/*---------------------------------------------------------------------------*\
       \|/       C hemicals     | Open-source, glass-box chemical process simulator
      \\|//      H eat-transfer | https://choupo.org
     \\\|///     O perations    |
      \\|//      U nits         | Copyright (C) 2026 Vítor Geraldes
       \|/       P roperties    | Licence: GPL-3.0-or-later
        |        O ptimization  |
       /|\                      |
-------------------------------------------------------------------------------
    SPDX-License-Identifier: GPL-3.0-or-later
    Credit and attribution: see AUTHORS
    Required legal notices:  see NOTICE
\*---------------------------------------------------------------------------*/

/*  THE FENCE, ITS CROSSINGS AND THE UNROUTED MARK (DEV.md 4c C93), held
    without a browser:
      * the scene draws the engine's fence rectangle cut at each gate opening
        the engine published, never computing where the fence is;
      * a crossing carries the engine's point and the case's label onto a
        sign, and an unlabelled crossing says so on the sign;
      * a stream the engine could not route is MARKED at the end it reached,
        its reason in the tooltip -- and one with no reachable end is still
        in the scene, in words: a missing pipe must never look like a
        finished drawing;
      * the fence table quotes the engine's length, openings and rule. */

import { describe, expect, it } from "vitest";

import type { PlantLayout } from "../src/adapters/SolverAdapter.js";
import { fenceSummary, itemRows, pipeRegister } from "../src/case/layoutTables.js";
import {
  crossingsOf, fenceOf, layoutScene, toThree, UNROUTED_STUB, unroutedLegend,
  unroutedListedOf, unroutedOf,
} from "../src/case/plantLayout.js";
import { PIPED } from "./plantLayoutFixture.js";

const FENCED: PlantLayout = {
  ...PIPED,
  fence: { inset: 0, insetDeclared: true, xMin: -20, xMax: 120, yMin: -70, yMax: 25,
           length: 470, source: "author-set", reason: "the site boundary",
           rule: "the plot's rectangle moved inward by the inset" },
  fenceOpenings: [{ gate: "gate", side: "south", x: -12, y: -70, width: 7, road: "entrance",
                    gateDistance: 5 }],
  fenceCrossings: [
    { stream: "feed", direction: "in", side: "west", x: -20, y: -3, z: 6,
      positionFrom: "statedDefault", labelDeclared: true, label: "adjacent industrial park" },
    { stream: "product", direction: "out", side: "north", x: 50, y: 25, z: 7.5,
      positionFrom: "declared", labelDeclared: false, label: "" },
  ],
  notRouted: [
    { stream: "split", reason: "consumed by 2 units (a, b); a pipe has two ends",
      fromUnit: "s1", toUnit: "a, b", anchor: [10, 5, 1] },
    { stream: "lost", reason: "unit `X` has no sized item", fromUnit: "", toUnit: "X" },
    { stream: "powder", reason: "solids only (no fluid phase): moved in containers or by conveyor, not piped",
      fromUnit: "dryer", toUnit: "blender", solids: true },
  ],
};

describe("the fence (C93)", () => {
  it("draws the engine's rectangle, cut at the gate opening, with posts", () => {
    const f = fenceOf(FENCED)!;
    expect(f).not.toBeNull();
    //  Four sides, the south one cut in two by the 7 m opening at x = -12.
    expect(f.runs).toHaveLength(5);
    const south = f.runs.filter(([a, b]) => a[2] === toThree(0, -70, 0)[2]
                                         && b[2] === toThree(0, -70, 0)[2]);
    expect(south.map(([a, b]) => [a[0], b[0]])).toEqual([[-20, -15.5], [-8.5, 120]]);
    expect(f.openings).toEqual([{ gate: "gate", at: toThree(-12, -70, 0), width: 7 }]);
    expect(f.posts.length).toBeGreaterThan(100);
    expect(f.tooltip[0]).toContain("470");
    expect(fenceOf(PIPED)).toBeNull();
  });

  it("puts the case's label on each crossing's sign, and says when there is none", () => {
    const [feed, product] = crossingsOf(FENCED);
    expect(feed!.at).toEqual(toThree(-20, -3, 6));
    expect(feed!.text).toBe("feed from: adjacent industrial park");
    expect(feed!.labelled).toBe(true);
    //  West side: the pipeline runs on outward, to smaller x.
    expect(feed!.outside[0]).toBeLessThan(feed!.at[0]);
    expect(product!.labelled).toBe(false);
    expect(product!.text).toContain("destination NOT declared");
    expect(product!.tooltip.join(" ")).toContain("where the case placed the crossing");
  });

  it("marks an unrouted stream at the end it reached, and lists, never floats, one it did not", () => {
    //  Only the stream with an anchor is DRAWN (C97: an anchorless marker
    //  had been drawn at an arbitrary point, off the plot).
    const marked = unroutedOf(FENCED);
    expect(marked.map((u) => u.stream)).toEqual(["split"]);
    const split = marked[0]!;
    expect(split.at).toEqual(toThree(10, 5, 1));
    expect(split.top).toEqual(toThree(10, 5, 1 + UNROUTED_STUB));
    expect(split.text).toContain("split: NOT routed");
    expect(split.tooltip[1]).toBe("why: consumed by 2 units (a, b); a pipe has two ends");
    //  The other two are LISTED: nothing the engine left unrouted disappears.
    const scene = layoutScene(FENCED)!;
    expect(scene.unrouted.map((u) => u.stream)).toEqual(["split"]);
    expect(scene.unroutedListed).toEqual(unroutedListedOf(FENCED));
    expect(scene.unroutedListed.map((u) => [u.stream, u.solids]))
      .toEqual([["lost", false], ["powder", true]]);
    const legend = unroutedLegend(scene.unroutedListed);
    expect(legend[0]).toContain("NOT routed and not marked");
    expect(legend[0]).toContain("lost");
    expect(legend[1]).toContain("Moved as solids, not piped");
    expect(legend[1]).toContain("powder");
    expect(unroutedLegend([])).toEqual([]);
    //  No point of the scene belongs to an unmarked stream: the view's box
    //  is the one a layout with the anchored stream alone would give.
    const alone = layoutScene({ ...FENCED, notRouted: FENCED.notRouted!.slice(0, 1) })!;
    expect(scene.min).toEqual(alone.min);
    expect(scene.max).toEqual(alone.max);
  });

  it("the pipe register says which missing pipe is unmarked, and the solids apart", () => {
    const reg = pipeRegister(FENCED)!;
    expect(reg.notRouted.map((n) => [n.stream, n.marked])).toEqual([["split", true], ["lost", false]]);
    expect(reg.solids).toEqual(["powder"]);
    expect(reg.indoor).toEqual([]);
  });

  //  DEV.md 4c C100: piping inside the building is not routed -- not lost.
  //  Both ends indoors: listed apart, never marked; one end in the open: a
  //  missing outdoor leg, marked at that end like any other.
  it("lists indoor piping apart from what is missing, and marks a missing outdoor leg", () => {
    const L = { ...FENCED, notRouted: [
      ...FENCED.notRouted!,
      { stream: "loop", reason: "inside the building: indoor piping is not routed", indoor: true,
        fromUnit: "a", toUnit: "b" },
      { stream: "leg", reason: "one end inside the building", indoor: true,
        fromUnit: "tank", toUnit: "c", anchor: [5, 5, 3] as [number, number, number] },
    ] };
    const scene = layoutScene(L)!;
    expect(scene.unrouted.map((u) => u.stream)).toContain("leg");
    expect(scene.unrouted.map((u) => u.stream)).not.toContain("loop");
    const loop = scene.unroutedListed.find((u) => u.stream === "loop")!;
    expect(loop.indoor).toBe(true);
    const legend = unroutedLegend(scene.unroutedListed);
    expect(legend.find((l) => l.includes("NOT routed and not marked"))).not.toContain("loop");
    expect(legend.find((l) => l.startsWith("Piped inside the building"))).toContain("loop");
    const reg = pipeRegister(L)!;
    expect(reg.indoor.map((n) => n.stream)).toEqual(["loop"]);
    expect(reg.notRouted.map((n) => n.stream)).toContain("leg");
    expect(reg.notRouted.map((n) => n.stream)).not.toContain("loop");
    //  The item table says where an item indoors stands, and nothing more
    //  for an item in the open.
    const first = FENCED.items[0]!;
    const rows = itemRows({ ...FENCED, items: [{ ...first, room: "sprayDrying" }, ...FENCED.items.slice(1)] });
    expect(rows[0]!.kind).toContain("indoors, room sprayDrying");
    expect(itemRows(FENCED)[0]!.kind).not.toContain("indoors");
  });

  it("the fence table quotes the engine's length, openings and rule", () => {
    const v = fenceSummary(FENCED)!;
    expect(v.headline).toContain("Fence 470 m round");
    expect(v.headline).toContain("2 pipe crossings");
    expect(v.notes.join(" ")).toContain("Gate gate opens it on the south side, 7.0 m wide");
    expect(v.rows.map((r) => r.stream)).toEqual(["feed", "product"]);
  });
});
