/*---------------------------------------------------------------------------*\
  The exported flowsheet figure (case/flowsheetSvg.ts, DEV.md 4c C114 item 6):
  a self-contained SVG -- no HTML (foreignObject), no external reference --
  carrying the wires as drawn, the boxes and the SAME legend model the
  canvas shows.
\*---------------------------------------------------------------------------*/

import { describe, it, expect } from "vitest";

import { buildFlowsheetSvg, pathPoints, xmlEscape } from "../src/case/flowsheetSvg.js";
import { streamLegend } from "../src/case/colourLegend.js";
import { resolveScale, NO_DATA_COLOUR } from "../src/case/streamColouring.js";
import { DEFAULT_PREFS } from "../src/state/displayUnits.js";

const legend = streamLegend({
  field: "x:NH3", scale: resolveScale([1e-4, 0.9], "log", null), map: "turbo",
  prefs: DEFAULT_PREFS, anyNoData: true, anyBelow: true, threshold: null, follow: "NH3",
});

const svg = buildFlowsheetSvg({
  title: "ammonia02 <plant>",
  subtitle: "Choupo flowsheet · following NH3",
  nodes: [
    { x: 0, y: 0, w: 200, h: 60, kind: "unit", label: "R1", stroke: "#b40426", fill: "#fff",
      symbolPath: "M4 4 L44 44", symbolTag: "EQ", sub: "Q_kW = -120" },
    { x: 400, y: 0, w: 120, h: 40, kind: "terminal", label: "product", stroke: NO_DATA_COLOUR, fill: "#eee" },
  ],
  edges: [
    { d: "M200 30 L300 30 Q305 30 305 35 L400 20", stroke: "rgb(10, 20, 30)", width: 4,
      opacity: 0.14, arrow: true },
  ],
  legends: [legend],
});

describe("buildFlowsheetSvg", () => {
  it("is one plain SVG document, with no HTML inside and nothing fetched", () => {
    expect(svg.startsWith("<svg xmlns=\"http://www.w3.org/2000/svg\"")).toBe(true);
    expect(svg).not.toContain("foreignObject");
    expect(svg).not.toMatch(/href="http/);
  });
  it("escapes text (a case name may carry < >)", () => {
    expect(svg).toContain("ammonia02 &lt;plant&gt;");
    expect(xmlEscape("a&b\"")).toBe("a&amp;b&quot;");
  });
  it("draws each wire with its colour, width, opacity and arrowhead", () => {
    expect(svg).toContain('stroke="rgb(10, 20, 30)"');
    expect(svg).toContain('stroke-width="4"');
    expect(svg).toContain('opacity="0.14"');
    expect(svg).toMatch(/marker-end="url\(#ah0\)"/);
  });
  it("draws the unit's own symbol, its tag and its KPI line", () => {
    expect(svg).toContain('d="M4 4 L44 44"');
    expect(svg).toContain(">EQ<");
    expect(svg).toContain("Q_kW = -120");
  });
  it("carries the legend the canvas shows: title, log qualifier, no-data, floor", () => {
    expect(svg).toContain("NH3 mole fraction");
    expect(svg).toContain("log scale");
    expect(svg).toContain("no data");
    expect(svg).toContain("floor 1.5 px");
    expect(svg).toContain("<linearGradient");
  });
  it("the path bounding box reads every coordinate pair", () => {
    expect(pathPoints("M1 2 L3.5 -4 Q5e1 6 7 8")).toEqual(
      [{ x: 1, y: 2 }, { x: 3.5, y: -4 }, { x: 50, y: 6 }, { x: 7, y: 8 }]);
  });
});
