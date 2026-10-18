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
import { fenceSummary } from "../src/case/layoutTables.js";
import {
  crossingsOf, fenceOf, layoutScene, toThree, UNROUTED_STUB, unroutedOf,
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

  it("marks an unrouted stream at the end it reached, and still names one it did not", () => {
    const [split, lost] = unroutedOf(FENCED);
    expect(split!.at).toEqual(toThree(10, 5, 1));
    expect(split!.top).toEqual(toThree(10, 5, 1 + UNROUTED_STUB));
    expect(split!.text).toContain("split: NOT routed");
    expect(split!.tooltip[1]).toBe("why: consumed by 2 units (a, b); a pipe has two ends");
    expect(lost!.at).toBeNull();
    expect(lost!.text).toContain("lost: NOT routed");
    expect(lost!.tooltip.join(" ")).toContain("neither end");
    //  The scene carries them: nothing the engine left unrouted disappears.
    expect(layoutScene(FENCED)!.unrouted.map((u) => u.stream)).toEqual(["split", "lost"]);
  });

  it("the fence table quotes the engine's length, openings and rule", () => {
    const v = fenceSummary(FENCED)!;
    expect(v.headline).toContain("Fence 470 m round");
    expect(v.headline).toContain("2 pipe crossings");
    expect(v.notes.join(" ")).toContain("Gate gate opens it on the south side, 7.0 m wide");
    expect(v.rows.map((r) => r.stream)).toEqual(["feed", "product"]);
  });
});
