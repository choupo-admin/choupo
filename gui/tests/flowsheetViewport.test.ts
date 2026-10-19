/*---------------------------------------------------------------------------*\
  THE CANVAS CAN ZOOM OUT TO THE WHOLE FLOWSHEET (DEV.md 4c C102).

  Vitor, on apalutamide01_tablets: the zoom out did not show the whole
  flowsheet, and a part at the top was hard to reach.  React Flow's default
  minZoom (0.5) clamped both the wheel and every fit (ui/flowsheetViewport.ts
  says the three causes).  What this pins, over EVERY view of EVERY tutorial
  -- each case's root view and each sector view, drawn by the automatic
  layout AND by the case's own .cho where it ships one:

    - the zoom a fit needs, with the canvas's own padding, in a SMALL
      reference pane, stays above FLOWSHEET_MIN_ZOOM with a factor of two in
      hand (the box sizes here are the layout's ESTIMATES; a rendered card
      may be larger) -- so no fit is clamped and the reader can always zoom
      out to the whole plant;
    - the viewport React Flow's OWN fit arithmetic (getViewportForBounds,
      the function fitView calls) returns for the largest view puts every
      box inside the pane, below the top margin the legends need;
    - the witness that the test can fire: with React Flow's default 0.5 the
      largest views do NOT fit.
\*---------------------------------------------------------------------------*/

import { getViewportForBounds } from "@xyflow/react";
import { describe, expect, it } from "vitest";

import { flowsheetToGraph } from "../src/case/toGraph.js";
import type { XY } from "../src/case/flowsheetLayout.js";
import {
  boundsOf, FLOWSHEET_FIT, FLOWSHEET_FIT_MAX_ZOOM, FLOWSHEET_FIT_PADDING, FLOWSHEET_MIN_ZOOM, type Rect,
} from "../src/ui/flowsheetViewport.js";
import { collectViews, curatedPositions } from "./flowsheetCorpusViews.js";

// A small canvas: a 1024 x 640 window less the menu bar and the case
// banner (~70 px) with the assistant console docked below (~150 px).
const PANE_W = 1024;
const PANE_H = 420;
// The rendered cards may outgrow the layout's estimated sizes; the fit zoom
// must clear the minimum by this factor.
const SAFETY = 2;

interface Drawn { id: string; bounds: Rect }

function drawn(): Drawn[] {
  const out: Drawn[] = [];
  for (const v of collectViews()) {
    const g = flowsheetToGraph(v.flowsheet, v.raw);
    const size = (id: string) => g.sizes.get(id) ?? { width: 190, height: 84 };
    const box = (pos: Map<string, XY> | undefined) => boundsOf(g.nodes.map((n) => {
      const p = pos?.get(n.id) ?? n.position;
      return { x: p.x, y: p.y, ...size(n.id) };
    }));
    out.push({ id: v.id, bounds: box(undefined) });
    const cp = v.cho ? curatedPositions(g, v.cho) : null;
    if (cp) out.push({ id: `${v.id} (.cho)`, bounds: box(cp) });
  }
  return out;
}

/** The zoom a fit needs before any clamp (React Flow's own arithmetic). */
const neededZoom = (b: Rect) => getViewportForBounds(b, PANE_W, PANE_H, 0, Infinity, FLOWSHEET_FIT_PADDING).zoom;

const VIEWS = drawn();
const byNeed = [...VIEWS].sort((a, b) => neededZoom(a.bounds) - neededZoom(b.bounds));

describe("the flowsheet canvas zooms out to the whole flowsheet (C102)", () => {
  it("finds the corpus, the C102 witness among it", () => {
    expect(VIEWS.length).toBeGreaterThan(200);
    expect(VIEWS.some((v) => v.id === "plant/apalutamide01_tablets")).toBe(true);
    console.log(`[C102 zoom] ${VIEWS.length} views in a ${PANE_W} x ${PANE_H} pane; the five that need the smallest fit zoom:\n`
      + byNeed.slice(0, 5).map((v) => `    ${v.id}: ${neededZoom(v.bounds).toFixed(4)}`
        + ` (${Math.round(v.bounds.width)} x ${Math.round(v.bounds.height)} px)`).join("\n"));
  });

  it("every view fits above the minimum zoom, with a factor of two in hand", () => {
    const tight = VIEWS
      .filter((v) => neededZoom(v.bounds) < SAFETY * FLOWSHEET_MIN_ZOOM)
      .map((v) => `${v.id}: needs ${neededZoom(v.bounds).toFixed(4)}`);
    expect(tight).toEqual([]);
  });

  it("the fit React Flow computes for the largest view is NOT clamped and puts every box in the pane", () => {
    const worst = byNeed[0]!;
    const { minZoom, maxZoom, padding } = FLOWSHEET_FIT;
    const vp = getViewportForBounds(worst.bounds, PANE_W, PANE_H, minZoom!, maxZoom!, padding!);
    expect(vp.zoom).toBeCloseTo(neededZoom(worst.bounds), 10);
    const top = worst.bounds.y * vp.zoom + vp.y;
    const bottom = (worst.bounds.y + worst.bounds.height) * vp.zoom + vp.y;
    const left = worst.bounds.x * vp.zoom + vp.x;
    const right = (worst.bounds.x + worst.bounds.width) * vp.zoom + vp.x;
    // The top margin clears the legends that float over the canvas.
    expect(top).toBeGreaterThanOrEqual(parseFloat(FLOWSHEET_FIT_PADDING.top) - 1);
    expect(bottom).toBeLessThanOrEqual(PANE_H);
    expect(left).toBeGreaterThanOrEqual(0);
    expect(right).toBeLessThanOrEqual(PANE_W);
  });

  it("a small flowsheet is still not magnified past the fit's maxZoom", () => {
    const smallest = byNeed[byNeed.length - 1]!;
    const { minZoom, maxZoom, padding } = FLOWSHEET_FIT;
    expect(getViewportForBounds(smallest.bounds, PANE_W, PANE_H, minZoom!, maxZoom!, padding!).zoom)
      .toBe(FLOWSHEET_FIT_MAX_ZOOM);
  });

  it("C102b: apalutamide01 is drawn as ONE compact plant, legible at its fit in a 1280 x 720 window", () => {
    //  The automatic layout used to drift its granulation train ~5600 px
    //  below the spray-drying loop (flowsheetLayout.ts, step 6), so the
    //  fit was a map at 0.063.  The canvas below the menu bar and the case
    //  banner of a 1280 x 720 window is 1280 x 653 (measured in Chromium).
    const apa = VIEWS.find((v) => v.id === "plant/apalutamide01_tablets")!;
    expect(apa.bounds.height).toBeLessThan(2000);
    const z = getViewportForBounds(apa.bounds, 1280, 653, 0, Infinity, FLOWSHEET_FIT_PADDING).zoom;
    expect(z).toBeGreaterThan(0.2);
  });

  it("witness: under React Flow's default minZoom (0.5) the largest views would NOT fit", () => {
    const clamped = VIEWS.filter((v) => neededZoom(v.bounds) < 0.5).map((v) => v.id);
    expect(clamped).toContain("plant/apalutamide01_tablets");
  });
});
