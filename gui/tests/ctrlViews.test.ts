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

/*  C487: a time-integrated flowsheet run (choupoCtrl) publishes its declared
 *  views in the SAME `postProcessing` block a steady or batch run does, so the
 *  Plots workspace draws them with no new code path.  The block below has the
 *  shape the engine wrote for tutorials/ctrl/ctrl02_disturbance_rejection
 *  (read from its result JSON, points trimmed): the controlled variable against
 *  its set point on the left axis, the manipulated variable and the feed
 *  disturbance on the right, all against time, in kelvin. */
import { describe, expect, it } from "vitest";
import type { RunResult } from "../src/adapters/SolverAdapter.js";
import { defaultPlotKey } from "../src/case/defaultPlot.js";
import { declaredViewsOf, shapePostProcessing, type PostPlot } from "../src/case/postProcessing.js";
import { runSummary } from "../src/case/runSummary.js";
import { viewAxesExtras } from "../src/ui/plotting/viewAxes.js";

const sr = (name: string, label: string, src: string, y: string, axis?: string) => ({
  name, label, role: "computed", style: "lines", group: "",
  source: `unit operation '${src}', table trajectory: t, ${y}`,
  x: { name: "t", unit: "s", unitPublished: true },
  y: { name: y, unit: "K", unitPublished: true }, yError: false, points: 101,
  ...(axis ? { axis } : {}),
});

const view = (name: string, xExtra: object, yExtra: object) => ({
    name, op: "", origin: "declared", type: "series", kind: "plot",
    title: "Does the controller hold the reactor at its set point?",
    note: "The PID TC1 holds the reactor temperature at 350 K.",
    file: `postProcessing/case/${name}.csv`,
    xAxis: { label: "time", unit: "s", scale: "linear", ...xExtra },
    yAxis: { label: "reactor temperature", unit: "K", scale: "linear", ...yExtra },
    yAxis2: { label: "jacket and feed temperature", unit: "K", scale: "linear" },
    series: [
      sr("SP", "set point", "TC1", "SP"),
      sr("PV", "reactor T (controlled)", "TC1", "PV"),
      sr("MV", "jacket T (manipulated)", "TC1", "MV", "right"),
      sr("Tin", "feed T (disturbance)", "FeedDist", "MV", "right"),
    ],
});

//  `response` is the overview; `rejection` the same signals from 600 s on a
//  tight axis read from the run (PV 349.655 .. 350.658 K after 600 s).
const block = shapePostProcessing({
  source: "system/postDict views", directory: "postProcessing", references: [], defaults: [],
  items: [view("response", {}, {}),
          view("rejection", { min: 600, max: 2000 }, { min: 349.5, max: 350.8 })],
});

describe("a choupoCtrl run's declared view (ctrl02, C487)", () => {
  const view = declaredViewsOf(block)[0] as PostPlot;
  const tight = declaredViewsOf(block)[1] as PostPlot;
  it("is shaped as a declared plot with its two axes and four series", () => {
    expect(declaredViewsOf(block).map((v) => v.name)).toEqual(["response", "rejection"]);
    expect(view.xAxis.unit).toBe("s");
    expect(view.yAxis.unit).toBe("K");
    expect(view.yAxis2?.unit).toBe("K");
    expect(view.series.map((s) => s.name)).toEqual(["SP", "PV", "MV", "Tin"]);
    expect(view.series.map((s) => s.axis)).toEqual(["", "", "right", "right"]);
  });
  it("the second view zooms: its axis ranges reach the plot, the overview has none", () => {
    expect(view.xAxis.min).toBeUndefined();
    expect([tight.xAxis.min, tight.xAxis.max]).toEqual([600, 2000]);
    expect([tight.yAxis.min, tight.yAxis.max]).toEqual([349.5, 350.8]);
  });
  it("is laid out with the right-hand axis, and no marker (none declared)", () => {
    const lay = viewAxesExtras(view) as any;
    expect(lay.yaxis2.side).toBe("right");
    expect(lay.shapes ?? []).toHaveLength(0);
  });
  it("is the default figure of the run and is counted by the run strip", () => {
    const r = { status: "done", log: "", convergence: [], streams: [], postProcessing: block,
      trajectory: { t: [0, 1], vars: {} } } as unknown as RunResult;
    expect(defaultPlotKey(r, [])).toBe("views");
    expect(runSummary(r).declaredViews).toBe(2);
  });
});
