/*---------------------------------------------------------------------------*\
  THE AUTOMATIC LAYOUT, MEASURED OVER THE WHOLE CORPUS (DEV.md 4c C59).

  Every tutorial flowsheet the canvas can draw -- each case's root view and
  every sector view below it -- is laid out twice: by the previous layout
  (tests/layoutLegacy.ts, frozen at 14077fb31) and by the current one
  (case/flowsheetLayout.ts via flowsheetToGraph), and both drawings are
  measured with the SAME yardstick (case/layoutMetrics.ts) on the same boxes.

  What it pins:
    - on every view with NO curated `.cho` layout (the ones the automatic
      layout actually draws), the new drawing is not worse than the old one
      by the defect score (overlaps, wires through boxes, crossings), and it
      has no overlapping boxes at all;
    - the corpus totals improve.
  What it REPORTS and does not pin: the views that ship a curated `.cho`
  layout, with that layout's own score beside the automatic one's -- which
  of them is worse is Vítor's call, not this test's (C55: the 45 curated
  layouts travel with their cases).

  Set C59_LAYOUT_REPORT=1 to print the per-view table.
\*---------------------------------------------------------------------------*/

import { describe, expect, it } from "vitest";

import { flowsheetToGraph } from "../src/case/toGraph.js";
import { layoutScore, measureLayout, type LayoutMetrics } from "../src/case/layoutMetrics.js";
import { collectViews, curatedPositions } from "./flowsheetCorpusViews.js";
import { legacyPositions } from "./layoutLegacy.js";

interface Row { id: string; old: LayoutMetrics; neu: LayoutMetrics; curated?: LayoutMetrics; nUnits: number }

const VIEWS = collectViews();
const ROWS: Row[] = VIEWS.map((v) => {
  const g = flowsheetToGraph(v.flowsheet, v.raw);
  const old = measureLayout(g, legacyPositions(g), false);
  const neu = measureLayout(g);
  const cp = v.cho ? curatedPositions(g, v.cho) : null;
  return { id: v.id, old, neu, nUnits: g.view.units.length,
           ...(cp ? { curated: measureLayout(g, cp, false) } : {}) };
});

const fmt = (m: LayoutMetrics) =>
  `x${m.crossings} thru${m.throughNodes} ovl${m.overlaps} bends${m.bends} len${m.length}`;
const sum = (rows: Row[], k: "old" | "neu", f: keyof LayoutMetrics) =>
  rows.reduce((a, r) => a + r[k][f], 0);

// Views where the new drawing scores worse than the old, each with the
// reason it is accepted.  Empty is the goal; an entry needs a sentence.
const ACCEPTED_REGRESSIONS: { [id: string]: string } = {
  //  C60, 2026-10-11: the first witness with MANY recipe transfers between
  //  ONE pair of vessels (sixteen dosing portions dosingTank -> reactor,
  //  plus the interlock's dosingTank -> heldFeed).  The layout draws each
  //  dashed recipe edge as its own route, so seventeen parallel soft edges
  //  cost length (6769 against 2622) and one pass through a box that the
  //  old stacking happened not to pay.  The defect is in how parallel soft
  //  edges are routed (they could share one route), not in this witness;
  //  it is REPORTED to the commander, not fixed in the safety slice.
  "batch/reactor/batch27_semibatch_dosing":
    "seventeen parallel recipe-transfer edges between one pair of vessels;"
    + " parallel soft edges are routed one by one (reported with C60)",
  //  C60 second review, 2026-10-11: batch27's dosing-vessel twin -- sixteen
  //  portions dayTank -> reactor, three refills storage -> dayTank and the
  //  failure's two hold/feed edges.  The same parallel-soft-edge routing
  //  defect, the same reason; it goes when parallel edges are bundled.
  "batch/reactor/batch28_dosing_vessel_limit":
    "sixteen parallel recipe-transfer edges dayTank -> reactor and three"
    + " storage -> dayTank; parallel soft edges are routed one by one"
    + " (reported with C60)",
};

describe("automatic flowsheet layout over the corpus (C59)", () => {
  const auto = ROWS.filter((r) => !r.curated);

  it("finds the corpus", () => {
    expect(ROWS.length).toBeGreaterThan(200);
    expect(auto.length).toBeGreaterThan(150);
  });

  it("prints the before/after totals and the worst views", () => {
    const tot = (k: "old" | "neu") =>
      `crossings ${sum(auto, k, "crossings")}, through boxes ${sum(auto, k, "throughNodes")}, `
      + `overlaps ${sum(auto, k, "overlaps")}, bends ${sum(auto, k, "bends")}, length ${sum(auto, k, "length")}`;
    const lines = [
      `[C59 layout] ${auto.length} automatic views (+ ${ROWS.length - auto.length} with a curated .cho)`,
      `  old: ${tot("old")}`,
      `  new: ${tot("neu")}`,
      "  worst new (score):",
      ...[...auto].sort((a, b) => layoutScore(b.neu) - layoutScore(a.neu)).slice(0, 8)
        .map((r) => `    ${r.id}: ${fmt(r.neu)}  (old ${fmt(r.old)})`),
      "  curated .cho layouts scoring WORSE than the new automatic one:",
      ...ROWS.filter((r) => r.curated && layoutScore(r.curated) > layoutScore(r.neu))
        .map((r) => `    ${r.id}: curated ${fmt(r.curated!)} | auto ${fmt(r.neu)}`),
    ];
    if (process.env.C59_LAYOUT_REPORT)
      for (const r of ROWS)
        lines.push(`  ${r.id}: old ${fmt(r.old)} | new ${fmt(r.neu)}${r.curated ? ` | curated ${fmt(r.curated)}` : ""}`);
    console.log(lines.join("\n"));
    expect(lines.length).toBeGreaterThan(3);
  });

  it("draws no overlapping boxes on any automatic view", () => {
    const bad = auto.filter((r) => r.neu.overlaps > 0).map((r) => `${r.id}: ${fmt(r.neu)}`);
    expect(bad).toEqual([]);
  });

  it("is not worse than the previous layout on any automatic view", () => {
    const worse = auto
      .filter((r) => layoutScore(r.neu) > layoutScore(r.old) && !(r.id in ACCEPTED_REGRESSIONS))
      .map((r) => `${r.id}: new ${fmt(r.neu)} | old ${fmt(r.old)}`);
    expect(worse).toEqual([]);
  });

  it("improves the corpus totals", () => {
    const score = (k: "old" | "neu") => auto.reduce((a, r) => a + layoutScore(r[k]), 0);
    expect(score("neu")).toBeLessThan(score("old"));
    expect(sum(auto, "neu", "crossings")).toBeLessThan(sum(auto, "old", "crossings"));
  });
});
