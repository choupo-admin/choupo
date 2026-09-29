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

/*---------------------------------------------------------------------------*\
  gibbsMapCsv -- the ONE reader of a `gibbsMap` op's CSV, kept free of any
  plotting import.

  WHY IT IS ITS OWN MODULE (2026-09-27).  `parseGibbsMapCsv` lived inside
  GibbsMapPlot.tsx, which reaches Plotly at module scope; the moment a
  second reader arrived (the equilibrium-landscapes EduTool, whose unit tests
  run under node) importing the parser dragged the plotting bundle into the
  test runner and it died on `self is not defined`.  The parser is pure and
  the plot is not, so they are two files -- the registry.ts precedent, one
  band down.  GibbsMapPlot re-exports these names so its existing importers
  do not move.

  The CSV grammar is GibbsMapOp.cpp's (`T_K,P_Pa,deltaT_K,converged,metric,
  x_<species>...[,s_<solid>...]`); an unconverged cell carries `nan` and is
  kept as a cell with `converged: false`, never interpolated over.  An
  `s_<solid>` column (2026-09-29) is the amount of a declared PURE SOLID in
  the feed's mole basis; the solid's own `x_` is its fluid mole fraction,
  zero by construction, so the two are read apart and never summed.
\*---------------------------------------------------------------------------*/

export interface GibbsMapCell {
  T_K: number;
  P_Pa: number;
  deltaT_K: number;
  converged: boolean;
  metric: number;
  x: Record<string, number>;
  /** Pure-solid amounts (feed mole basis), one per `s_` column. */
  solid?: Record<string, number>;
}

export interface GibbsMapData {
  cells: GibbsMapCell[];
  Ts: number[];          // unique sorted T_K
  Ps: number[];          // unique sorted P_Pa
  species: string[];
  /** The declared pure solids, in CSV order; empty when the map has none. */
  solids: string[];
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
  const solids = cols.filter((c) => c.startsWith("s_")).map((c) => c.slice(2));
  const cells: GibbsMapCell[] = [];
  for (const ln of lines.slice(1)) {
    const v = ln.split(",");
    const g = (i: number) => parseFloat(v[i] ?? "nan");
    const x: Record<string, number> = {};
    cols.forEach((c, i) => { if (c.startsWith("x_")) x[c.slice(2)] = g(i); });
    const solid: Record<string, number> = {};
    cols.forEach((c, i) => { if (c.startsWith("s_")) solid[c.slice(2)] = g(i); });
    cells.push({
      T_K: g(iT), P_Pa: g(iP),
      deltaT_K: iD >= 0 ? g(iD) : 0,
      converged: iC >= 0 ? (v[iC] ?? "").trim() === "1" : true,
      metric: g(iM), x, solid,
    });
  }
  const Ts = [...new Set(cells.map((c) => c.T_K))].sort((a, b) => a - b);
  const Ps = [...new Set(cells.map((c) => c.P_Pa))].sort((a, b) => a - b);
  return { cells, Ts, Ps, species, solids, deltaT: cells[0]?.deltaT_K ?? 0 };
}
