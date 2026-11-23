/*---------------------------------------------------------------------------*\
  viewsSecondAxis -- a view's RIGHT-HAND y axis and its vertical MARKERS
  (DEV.md 4c C477).  The engine writes `yAxis2`, a series' `axis: "right"` and
  `markers` (an x a run published, e.g. an ignition delay); the GUI draws them
  and computes nothing.  A view without them shapes and lays out exactly as
  before.
\*---------------------------------------------------------------------------*/
import { describe, expect, it } from "vitest";
import { declaredViewsOf, shapePostProcessing, type PostPlot } from "../src/case/postProcessing.js";
import { viewAxesExtras } from "../src/ui/plotting/viewAxes.js";

const base = (extra: Record<string, unknown>, series: unknown[]) => ({
  items: [{ name: "ignite", op: "unit_vessel", origin: "declared", type: "series", kind: "plot",
    title: "When does it ignite?", file: "postProcessing/unit_vessel/ignite.csv",
    xAxis: { label: "time", unit: "s", scale: "log" },
    yAxis: { label: "T", unit: "K", scale: "linear" }, series, ...extra }],
});
const sr = (name: string, axis?: string) => ({ name, label: name, role: "computed", style: "lines",
  group: "", source: "s", x: { unit: "s" }, y: { unit: "K" }, yError: false, points: 3,
  ...(axis ? { axis } : {}) });

describe("a view's second axis and markers", () => {
  it("shapes yAxis2, the series' side and the markers; draws both", () => {
    const block = shapePostProcessing(base(
      { yAxis2: { label: "NO", unit: "ppm", scale: "linear" },
        markers: [{ label: "ignition delay", x: 2.4e-3, source: "unit operation 'vessel': tauIgnition" }] },
      [sr("T"), sr("NO", "right")]));
    const it = declaredViewsOf(block)[0] as PostPlot;
    expect(it.yAxis2?.unit).toBe("ppm");
    expect(it.series.map((s) => s.axis)).toEqual(["", "right"]);
    const lay = viewAxesExtras(it) as any;
    expect(lay.yaxis2.side).toBe("right");
    expect(lay.yaxis2.overlaying).toBe("y");
    expect(lay.shapes).toHaveLength(1);
    expect(lay.shapes[0].x0).toBeCloseTo(Math.log10(2.4e-3), 12);   // log x axis: log10 units
    expect(lay.annotations[0].text).toBe("ignition delay");
  });
  it("a view declaring neither lays out as before", () => {
    const it = declaredViewsOf(shapePostProcessing(base({}, [sr("T")])))[0] as PostPlot;
    expect(it.yAxis2).toBeUndefined();
    expect(it.markers ?? []).toEqual([]);
    expect(viewAxesExtras(it)).toEqual({});
  });
  it("a marker whose x is not a number is dropped, never guessed", () => {
    const it = declaredViewsOf(shapePostProcessing(base(
      { markers: [{ label: "x", x: null, source: "" }] }, [sr("T")])))[0] as PostPlot;
    expect(it.markers ?? []).toEqual([]);
  });
});
