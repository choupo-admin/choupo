/*  GibbsMapPlot — the forum-ratified equilibrium-map renderer
 *  (docs/design/gibbs-map-forum-2026-07-02.md).
 *
 *  Input: the gibbsMap op's CSV (T_K, P_Pa, deltaT_K, converged, metric,
 *  x_<species>...).  Renders LABELLED iso-lines (7–10, lines not heatmap)
 *  on T [°C] × log-P [bar]; unconverged cells are marked with grey ✕ and
 *  their metric is NaN (never interpolated over — Plotly's `connectgaps`
 *  stays false).  An auto-caption stamps metric/ΔT/grid into the figure
 *  (screenshots outlive context).  Optional overlays: a ghost contour set
 *  (ΔT = 0 reference under a shifted map), a cited industrial-window box
 *  and a user-declared kinetic band (watermarked "DECLARED, NOT COMPUTED").
 *
 *  THE interaction (3 forum votes): click any cell → the drill-down callback
 *  receives that cell's full equilibrium composition (from the CSV — the
 *  actual solved numbers, not an interpolation) so the host panel can show
 *  the composition table and emit the equivalent gibbsReactor dict.
 */
import { Plot, PLOT_CONFIG, darkLayout } from "./plotly.js";

export interface GibbsMapCell {
  T_K: number;
  P_Pa: number;
  deltaT_K: number;
  converged: boolean;
  metric: number;
  x: Record<string, number>;
}

export interface GibbsMapData {
  cells: GibbsMapCell[];
  Ts: number[];          // unique sorted T_K
  Ps: number[];          // unique sorted P_Pa
  species: string[];
  deltaT: number;
}

export function parseGibbsMapCsv(csv: string): GibbsMapData | null {
  const lines = csv.trim().split(/\r?\n/).filter((l) => l && !l.startsWith("#"));
  if (lines.length < 2 || !lines[0]) return null;
  const cols = lines[0]!.split(",").map((c) => c.trim());
  const iT = cols.indexOf("T_K"), iP = cols.indexOf("P_Pa");
  const iD = cols.indexOf("deltaT_K"), iC = cols.indexOf("converged");
  const iM = cols.indexOf("metric");
  if (iT < 0 || iP < 0 || iM < 0) return null;
  const species = cols.filter((c) => c.startsWith("x_")).map((c) => c.slice(2));
  const cells: GibbsMapCell[] = [];
  for (const ln of lines.slice(1)) {
    const v = ln.split(",");
    const g = (i: number) => parseFloat(v[i] ?? "nan");
    const x: Record<string, number> = {};
    cols.forEach((c, i) => { if (c.startsWith("x_")) x[c.slice(2)] = g(i); });
    cells.push({
      T_K: g(iT), P_Pa: g(iP),
      deltaT_K: iD >= 0 ? g(iD) : 0,
      converged: iC >= 0 ? (v[iC] ?? "").trim() === "1" : true,
      metric: g(iM), x,
    });
  }
  const Ts = [...new Set(cells.map((c) => c.T_K))].sort((a, b) => a - b);
  const Ps = [...new Set(cells.map((c) => c.P_Pa))].sort((a, b) => a - b);
  return { cells, Ts, Ps, species, deltaT: cells[0]?.deltaT_K ?? 0 };
}

export interface WindowBox { Tmin_C: number; Tmax_C: number; Pmin_bar: number; Pmax_bar: number; label: string; }

export function GibbsMapPlot({ data, metricLabel, caption, window: win, kineticBand, onCell }: {
  data: GibbsMapData;
  metricLabel: string;
  caption: string;                      // stamped into the figure
  window?: WindowBox | null;            // cited industrial window
  kineticBand?: WindowBox | null;       // user-declared — watermarked
  onCell?: (cell: GibbsMapCell) => void;
}) {
  // The GUI's Plotly is the BASIC bundle (scatter/bar/pie only — no contour,
  // no heatmap trace).  So we render the color map as a grid of COLOURED
  // SQUARE MARKERS: one marker per solved cell, coloured by the metric on a
  // continuous colour scale with a colorbar legend.  This is not a limitation
  // dressed up -- it is MORE honest than a smoothed heatmap: every square is a
  // real Gibbs solve, nothing is interpolated between cells (the forum's rule).
  const okCells = data.cells.filter((c) => c.converged);
  const badCells = data.cells.filter((c) => !c.converged);
  // square size in px so the 25x25 grid tiles with a small gap (heatmap feel).
  const sq = Math.max(10, Math.min(30, Math.round(560 / Math.max(data.Ts.length, data.Ps.length))));

  const traces: any[] = [{
    type: "scatter", mode: "markers", name: "",
    x: okCells.map((c) => c.T_K - 273.15),
    y: okCells.map((c) => c.P_Pa / 1e5),
    marker: {
      symbol: "square", size: sq,
      color: okCells.map((c) => c.metric),
      colorscale: "YlGnBu", reversescale: true,
      showscale: true,
      colorbar: { title: { text: metricLabel, side: "right", font: { size: 10 } },
                  thickness: 12, len: 0.9, tickfont: { size: 9 } },
      line: { width: 0 },
    },
    customdata: okCells.map((c) => c.metric),
    hovertemplate: "T %{x:.0f} °C · P %{y:.3g} bar<br>" + metricLabel
      + " = %{customdata:.4g}<br>click for the full composition<extra></extra>",
  }];
  if (badCells.length > 0) {
    traces.push({
      type: "scatter", mode: "markers",
      x: badCells.map((c) => c.T_K - 273.15), y: badCells.map((c) => c.P_Pa / 1e5),
      marker: { symbol: "x-thin", size: sq * 0.6, color: "rgba(180,180,180,0.8)", line: { width: 1.4 } },
      name: `not converged (${badCells.length})`,
      hovertemplate: "NOT CONVERGED — no value here<extra></extra>",
    });
  }

  const shapes: any[] = [];
  const annotations: any[] = [{
    text: caption, xref: "paper", yref: "paper", x: 0, y: -0.16,
    xanchor: "left", showarrow: false,
    font: { size: 10, color: "#aaa" }, align: "left",
  }];
  const boxShape = (b: WindowBox, color: string, dash: string) => ({
    type: "rect", x0: b.Tmin_C, x1: b.Tmax_C, y0: b.Pmin_bar, y1: b.Pmax_bar,
    line: { color, width: 1.5, dash }, fillcolor: color.replace("1)", "0.08)"),
  });
  if (win) {
    shapes.push(boxShape(win, "rgba(120,190,120,1)", "solid"));
    annotations.push({
      text: win.label, x: (win.Tmin_C + win.Tmax_C) / 2, y: win.Pmax_bar,
      yanchor: "bottom", showarrow: false, font: { size: 10, color: "rgb(120,190,120)" },
    });
  }
  if (kineticBand) {
    shapes.push(boxShape(kineticBand, "rgba(220,150,90,1)", "dash"));
    annotations.push({
      text: kineticBand.label + " — DECLARED, NOT COMPUTED",
      x: (kineticBand.Tmin_C + kineticBand.Tmax_C) / 2, y: kineticBand.Pmin_bar,
      yanchor: "top", showarrow: false, font: { size: 9, color: "rgb(220,150,90)" },
    });
  }

  return (
    <Plot
      data={traces}
      layout={{
        ...darkLayout, autosize: true,
        margin: { ...darkLayout.margin, t: 34, b: 84 },
        xaxis: { ...darkLayout.xaxis, title: { text: "T [°C]" } },
        yaxis: { ...darkLayout.yaxis, title: { text: "P [bar]" }, type: "log" },
        shapes, annotations, showlegend: badCells.length > 0,
        legend: { ...darkLayout.legend, orientation: "h", y: 1.06, x: 0 },
      }}
      config={PLOT_CONFIG}
      style={{ width: "100%", height: "100%" }}
      onClick={(ev: any) => {
        const p = ev?.points?.[0];
        if (!p || !onCell) return;
        const T_K = p.x + 273.15, P_Pa = p.y * 1e5;
        let best: GibbsMapCell | null = null, bd = Infinity;
        for (const c of data.cells) {
          const span = (data.Ts.at(-1) ?? 1) - (data.Ts[0] ?? 0) || 1;
          const d = Math.abs(c.T_K - T_K) / span
                  + Math.abs(Math.log(c.P_Pa / P_Pa));
          if (d < bd) { bd = d; best = c; }
        }
        if (best && best.converged) onCell(best);
      }}
    />
  );
}

/** The click-a-point drill-down payload: the gibbsReactor dict for a cell. */
export function gibbsReactorDictFor(cell: GibbsMapCell, elements: string[],
  speciesAtoms: { name: string; atoms: number[] }[], feed: Record<string, number>): string {
  const feedLines = Object.entries(feed)
    .map(([k, v]) => `            ${k} ${v};`).join("\n");
  const spLines = speciesAtoms
    .map((s) => `                { name  ${s.name};  atoms  ( ${s.atoms.join("  ")} ); }`)
    .join("\n");
  const dT = cell.deltaT_K !== 0 ? `\n            temperatureApproach ${cell.deltaT_K};` : "";
  return `// Generated from the equilibrium map at T = ${(cell.T_K - 273.15).toFixed(0)} °C, P = ${(cell.P_Pa / 1e5).toFixed(2)} bar
units
(
    {
        name        reactor;
        type        gibbsReactor;
        in          feed;
        outputs     ( product );
        operation
        {
            T          ${cell.T_K.toFixed(2)} K;      // initial guess / isothermal T
            P          ${(cell.P_Pa / 1e5).toFixed(4)} bar;
            mode       isothermal;${dT}
            elements   ( ${elements.join("  ")} );
            species
            (
${spLines}
            );
        }
    }
);
// feed stream composition (mole basis):
${feedLines}`;
}
