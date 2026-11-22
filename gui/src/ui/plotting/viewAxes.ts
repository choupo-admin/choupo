/*---------------------------------------------------------------------------*\
  viewAxes -- the pure, Plotly-free half of a declared view's layout: axis
  titles and ranges, the right-hand axis and the vertical markers (C477).
\*---------------------------------------------------------------------------*/
import type { PostPlot } from "../../case/postProcessing.js";

/** The range a case declared for an axis (C271), in Plotly's terms: a log axis is
 *  ranged in decades.  Only where BOTH ends are declared; else Plotly autoranges. */
export function axisRange(a: { scale: "linear" | "log"; min?: number; max?: number }): { range?: [number, number] } {
  if (a.min === undefined || a.max === undefined) return {};
  return a.scale === "log" && a.min > 0 && a.max > 0
    ? { range: [Math.log10(a.min), Math.log10(a.max)] }
    : { range: [a.min, a.max] };
}

export function axisTitle(a: { label: string; unit: string }): string {
  return a.unit && a.unit !== "-" ? `${a.label} [${a.unit}]` : a.label;
}

/** The parts of a plot's layout beyond the left axis: the right-hand axis a
 *  series may be read against, and the vertical lines at published x values.
 *  Pure (tested); it draws only what the engine wrote. */
export function viewAxesExtras(item: PostPlot, axisStyle: Record<string, unknown> = {}): Record<string, unknown> {
  /* eslint-disable @typescript-eslint/no-explicit-any */
  const out: any = {};
  if (item.yAxis2) {
    out.yaxis2 = { ...axisStyle, title: { text: axisTitle(item.yAxis2) },
      type: item.yAxis2.scale === "log" ? "log" : "linear", automargin: true,
      overlaying: "y", side: "right", showgrid: false, ...axisRange(item.yAxis2) };
    out.margin = { l: 64, r: 64, t: 8, b: 48 };
  }
  const markers = item.markers ?? [];
  if (markers.length > 0) {
    //  on a log axis a layout line is positioned in log10 units
    const pos = (x: number) => (item.xAxis.scale === "log" ? Math.log10(x) : x);
    out.shapes = markers.map((m) => ({ type: "line", xref: "x", yref: "paper",
      x0: pos(m.x), x1: pos(m.x), y0: 0, y1: 1, line: { color: "#868e96", width: 1.2, dash: "dash" } }));
    out.annotations = markers.map((m) => ({ xref: "x", yref: "paper", x: pos(m.x), y: 1,
      text: m.label, showarrow: false, yanchor: "bottom", xanchor: "left", font: { size: 11 } }));
  }
  return out;
  /* eslint-enable @typescript-eslint/no-explicit-any */
}

