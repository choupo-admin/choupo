/*---------------------------------------------------------------------------*\
       \|/       C hemicals     | Open-source, glass-box chemical process simulator
      \\|//      H eat-transfer | https://choupo.org
     \\\|///     O perations    |
      \\|//      U nits         | Copyright (C) 2026 Vítor Geraldes
       \|/       P roperties    | Licence: GPL-3.0-or-later
        |        O ptimization  |
       /|\                      |
-------------------------------------------------------------------------------
License
    This file is part of Choupo.

    Choupo is free software: you can redistribute it and/or modify it
    under the terms of the GNU General Public License as published
    by the Free Software Foundation, either version 3 of the License, or
    (at your option) any later version.

    Choupo is distributed in the hope that it will be useful, but WITHOUT
    ANY WARRANTY; without even the implied warranty of MERCHANTABILITY or
    FITNESS FOR A PARTICULAR PURPOSE.  See the GNU General Public
    License for more details (https://www.gnu.org/licenses/gpl-3.0.html).

    SPDX-License-Identifier: GPL-3.0-or-later

    Credit and attribution: see AUTHORS
    Required legal notices:  see NOTICE
\*---------------------------------------------------------------------------*/

/*---------------------------------------------------------------------------*\
  TernaryPlot — composition-triangle diagrams from the propertyScanTernary CSV.

  Two CSV shapes, dispatched by header (NO physics here — everything comes from
  the engine CSV; we only PROJECT barycentric (x1,x2,x3) onto a 2-D triangle,
  because plotly.js-basic-dist has no `scatterternary`):

    * PHASE MAP (mode lle/vlle):  x1,x2,x3,region,region_id,kind,tieline_id,...
        nodes coloured by region (ONE_PHASE/VL/LL/VLLE) + liquid-liquid tie-lines.
    * SCALAR SURFACE (mode bubbleT, …):  x1,x2,x3,<scalar>
        nodes coloured by the scalar value (e.g. T_bubble) with a colour bar.

  We re-parse the raw CSV string locally (CsvAutoPlot.parseCsv coerces every
  cell to a number, which would turn the region/kind string columns into NaN).
\*---------------------------------------------------------------------------*/

import { Plot, PLOT_COLORS, PLOT_CONFIG, darkLayout } from "./plotly.js";

// Triangle vertices: corner A = pure comp 1 (x1=1), B = pure comp 2, C = pure comp 3.
const VA: [number, number] = [0, 0];
const VB: [number, number] = [1, 0];
const VC: [number, number] = [0.5, Math.sqrt(3) / 2];

/** barycentric (x1,x2,x3), Σ=1, -> cartesian inside the triangle. */
function project(x1: number, x2: number, x3: number): [number, number] {
  return [
    x1 * VA[0] + x2 * VB[0] + x3 * VC[0],
    x1 * VA[1] + x2 * VB[1] + x3 * VC[1],
  ];
}

const REGION_COLOR: Record<string, string> = {
  ONE_PHASE: "#6b7a7d",            // dim graphite-teal (single phase)
  VL: PLOT_COLORS.accent,          // teal
  LL: PLOT_COLORS.warm,            // orange (two liquids)
  VLLE: "#ce93d8",                 // purple (three phases)
};
const REGION_LABEL: Record<string, string> = {
  ONE_PHASE: "1 phase",
  VL: "vapour + liquid",
  LL: "two liquids (LL)",
  VLLE: "three phases (VLLE)",
};
const REGION_ORDER = ["ONE_PHASE", "VL", "LL", "VLLE"];

interface Parsed {
  header: string[];
  rows: Record<string, string>[];
}

function parse(csv: string): Parsed {
  const lines = csv.trim().split(/\r?\n/);
  if (lines.length < 2) return { header: [], rows: [] };
  const header = lines[0]!.split(",").map((s) => s.trim());
  const rows: Record<string, string>[] = [];
  for (let r = 1; r < lines.length; ++r) {
    const c = lines[r]!.split(",");
    if (c.length !== header.length) continue;
    const o: Record<string, string> = {};
    header.forEach((h, k) => { o[h] = (c[k] ?? "").trim(); });
    rows.push(o);
  }
  return { header, rows };
}

const frameTrace = {
  type: "scatter" as const,
  mode: "lines" as const,
  name: "frame",
  x: [VA[0], VB[0], VC[0], VA[0]],
  y: [VA[1], VB[1], VC[1], VA[1]],
  line: { color: PLOT_COLORS.axis, width: 1.5 },
  hoverinfo: "skip" as const,
  showlegend: false,
};

function cornerAnnotations(A: string, B: string, C: string) {
  const mk = (v: [number, number], text: string, dx: number, dy: number) => ({
    x: v[0], y: v[1], text, showarrow: false,
    font: { ...darkLayout.font, size: 13, color: PLOT_COLORS.text },
    xanchor: dx < 0 ? "right" as const : dx > 0 ? "left" as const : "center" as const,
    yanchor: dy < 0 ? "top" as const : "bottom" as const,
    xshift: dx * 6, yshift: dy * 6,
  });
  return [mk(VA, A, 0, -1), mk(VB, B, 1, -1), mk(VC, C, 0, 1)];
}

function baseLayout(title: string, A: string, B: string, C: string) {
  return {
    ...darkLayout,
    title: { text: title, font: { ...darkLayout.font, size: 14 } },
    margin: { l: 20, r: 20, t: 40, b: 20 },
    xaxis: { visible: false, range: [-0.08, 1.08] },
    yaxis: { visible: false, range: [-0.08, VC[1] + 0.1], scaleanchor: "x" as const, scaleratio: 1 },
    annotations: cornerAnnotations(A, B, C),
  };
}

export function TernaryPlot({ csv, labels }: { csv: string; labels?: [string, string, string] }) {
  const { header, rows } = parse(csv);
  const [A, B, C] = labels ?? ["comp 1", "comp 2", "comp 3"];

  // ---- SCALAR SURFACE (no `region` column): colour nodes by the 4th column ----
  if (!header.includes("region")) {
    const scalarKey = header[3] ?? "value";
    const xy = rows.map((r) => project(Number(r.x1), Number(r.x2), Number(r.x3)));
    const vals = rows.map((r) => Number(r[scalarKey]));
    const surface = {
      type: "scatter" as const,
      mode: "markers" as const,
      name: scalarKey,
      x: xy.map((p) => p[0]),
      y: xy.map((p) => p[1]),
      marker: {
        color: vals,
        colorscale: "Portland",
        size: 9,
        showscale: true,
        colorbar: { title: { text: scalarKey, side: "right" as const }, thickness: 12, len: 0.7 },
      },
      text: rows.map((r, k) =>
        `${A} ${Number(r.x1).toFixed(3)}<br>${B} ${Number(r.x2).toFixed(3)}<br>${C} ${Number(r.x3).toFixed(3)}`
        + `<br>${scalarKey} = ${vals[k]!.toPrecision(5)}`),
      hovertemplate: `%{text}<extra></extra>`,
    };
    return (
      <Plot
        data={[frameTrace, surface]}
        layout={{ ...baseLayout(`${scalarKey} surface (colour = value)  ·  ${A} / ${B} / ${C}`, A, B, C), showlegend: false }}
        config={PLOT_CONFIG}
        style={{ width: "100%", height: "100%" }}
        useResizeHandler
      />
    );
  }

  // ---- PHASE MAP (region/kind/tie-lines) ----
  const nodes = rows.filter((r) => r.kind === "node");
  const ties = rows.filter((r) => r.kind === "tie");

  const nodeTraces = REGION_ORDER
    .map((reg) => {
      const pts = nodes.filter((n) => n.region === reg);
      if (pts.length === 0) return null;
      const xy = pts.map((p) => project(Number(p.x1), Number(p.x2), Number(p.x3)));
      return {
        type: "scatter" as const,
        mode: "markers" as const,
        name: REGION_LABEL[reg] ?? reg,
        x: xy.map((p) => p[0]),
        y: xy.map((p) => p[1]),
        marker: { color: REGION_COLOR[reg] ?? PLOT_COLORS.accent, size: 7 },
        text: pts.map((p) =>
          `${A} ${Number(p.x1).toFixed(3)}<br>${B} ${Number(p.x2).toFixed(3)}<br>${C} ${Number(p.x3).toFixed(3)}`),
        hovertemplate: `%{text}<extra>${REGION_LABEL[reg] ?? reg}</extra>`,
      };
    })
    .filter(Boolean);

  const tieGroups = new Map<number, Record<string, string>[]>();
  ties.forEach((t) => {
    const id = Number(t.tieline_id);
    const g = tieGroups.get(id) ?? [];
    g.push(t);
    tieGroups.set(id, g);
  });
  let tieLegendShown = false;
  const tieTraces = [...tieGroups.values()]
    .filter((g) => g.length === 2)
    .map((g) => {
      const p0 = project(Number(g[0]!.x1), Number(g[0]!.x2), Number(g[0]!.x3));
      const p1 = project(Number(g[1]!.x1), Number(g[1]!.x2), Number(g[1]!.x3));
      const showLegend = !tieLegendShown;
      tieLegendShown = true;
      return {
        type: "scatter" as const,
        mode: "lines" as const,
        name: "tie-line",
        x: [p0[0], p1[0]],
        y: [p0[1], p1[1]],
        line: { color: PLOT_COLORS.text, width: 1 },
        opacity: 0.55,
        showlegend: showLegend,
        hoverinfo: "skip" as const,
      };
    });

  return (
    <Plot
      data={[frameTrace, ...tieTraces, ...nodeTraces]}
      layout={{
        ...baseLayout(`Ternary phase map  ·  ${A} / ${B} / ${C}`, A, B, C),
        showlegend: true,
        legend: { ...darkLayout.legend, x: 0.84, y: 0.98 },
      }}
      config={PLOT_CONFIG}
      style={{ width: "100%", height: "100%" }}
      useResizeHandler
    />
  );
}
