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
  CsvAutoPlot
  ===========

  Generic Plotly renderer for the CSVs choupoProps produces.  Each
  CSV carries one of four shapes; the component sniffs the header
  to pick the right rendering:

    1. **1-D scan**   --  first column is T / P / x[<comp>] / freq /
                          iter etc., remaining columns are properties.
                          Renders a multi-line plot (one trace per
                          property, shared x axis).

    2. **2-D scan**   --  first two columns are independents (e.g.
                          "T,P,Z,v_molar,..."), remaining columns are
                          properties.  Renders a heatmap of the FIRST
                          property; lets the student pick another from
                          a dropdown.

    3. **Parity**     --  columns include "T_exp" and "T_model" (or
                          generally "<X>_exp" + "<X>_model").  Renders
                          a parity scatter + the identity line + the
                          residuals strip below.

    4. **Fit history**--  first column is "iter", remaining contain
                          "chi2" + parameter trajectories.  Renders
                          chi2 vs iter (log y) with the parameters
                          on a twin axis.

  All four shapes share a tabular CSV: first row is the header, the
  rest are data rows.  Numerical parsing is forgiving --- malformed
  cells render as NaN (Plotly drops them).
\*---------------------------------------------------------------------------*/

import { Box, Group, NativeSelect, SegmentedControl, Text } from "@mantine/core";
import { useMemo, useState } from "react";
import { Plot, PLOT_CONFIG, PLOT_COLORS, PLOT_FONT, darkLayout } from "./plotly.js";
import { TernaryPlot } from "./TernaryPlot.js";
import { useStore } from "../../state/store.js";
import {
  paToDisplay, kToDisplay, sToDisplay, formatSig,
  molalToDisplay, effectiveConcentrationUnit,
  type DisplayPrefs,
} from "../../state/displayUnits.js";
import { detectCategoricalCsv, hasSiColumns, type CategoricalCsv } from "./csvShape.js";

interface ParsedCsv {
  header: string[];
  rows: number[][];
}

/** Drop a sweep CSV's leading `point` index column: it would hijack the x
 *  axis -- the swept parameter (column 2) is the real independent.
 *  Header-driven, so CSVs without a `point` column pass through untouched.
 *  Shared by the Plots workspace's "Sweep / scan" view and the internals
 *  What-if tab (one implementation, two surfaces). */
export function dropPointColumn(csv: string): string {
  const lines = csv.trim().split(/\r?\n/);
  if (lines.length === 0 || !lines[0]!.split(",")[0]?.trim().match(/^point$/i)) return csv;
  return lines.map((l) => l.split(",").slice(1).join(",")).join("\n");
}

export interface ExperimentalOverlay {
  name: string;
  header: string[];
  rows: number[][];
}

function parseCsv(csv: string): ParsedCsv | null {
  const lines = csv.trim().split(/\r?\n/).filter((l) => l.length > 0);
  if (lines.length < 2) return null;
  const header = lines[0]!.split(",").map((s) => s.trim());
  const rows: number[][] = [];
  for (let i = 1; i < lines.length; ++i) {
    const cells = lines[i]!.split(",");
    if (cells.length !== header.length) continue;
    const row = cells.map((c) => {
      const v = parseFloat(c);
      return Number.isFinite(v) ? v : NaN;
    });
    rows.push(row);
  }
  return { header, rows };
}

function column(parsed: ParsedCsv, idx: number): number[] {
  return parsed.rows.map((r) => r[idx]!);
}

/** Parse a harvested CSV into an ExperimentalOverlay (for raw lab-data points
 *  drawn on top of model curves).  Returns null if it doesn't parse. */
export function csvToOverlay(name: string, csv: string): ExperimentalOverlay | null {
  const p = parseCsv(csv);
  if (!p || p.rows.length === 0) return null;
  return { name, header: p.header, rows: p.rows };
}

/** Friendly label for the shape `CsvAutoPlot` would render this CSV as.
 *  Exposed so the PropsView header can show the user what the dropdown's
 *  current pick is going to look like ("1D scan" / "2D grid" / "T-x-y" /
 *  "Parity" / "Fit history") before the plot mounts. */
/** Any ternary diagram: header begins x1,x2,x3 (then either a phase-map's
 *  region/kind columns, or a scalar surface's 4th column like T_bubble).
 *  Unambiguous — cannot collide with the 2-D grid heuristic (whose first column
 *  is T/P/x[...]).  TernaryPlot re-parses the raw csv and dispatches by columns. */
function detectTernary(p: ParsedCsv): boolean {
  return p.header[0] === "x1" && p.header[1] === "x2" && p.header[2] === "x3";
}

export function classifyCsvShape(csv: string): string {
  const p = parseCsv(csv);
  if (!p) return "—";
  if (detectCategoricalCsv(csv)) return "Bar (categorical)";
  if (detectTernary(p)) return "Ternary";
  if (detectFitLog(p))    return "Fit history";
  if (detectParity(p))    return "Parity";
  if (detectTxy(p))       return "T-x-y";
  if (detectGrid2D(p))    return "2D grid";
  return "1D scan";
}

/** Detect a parity CSV by looking for an `_exp` / `_model` column pair. */
function detectParity(p: ParsedCsv): { iExp: number; iModel: number } | null {
  for (let i = 0; i < p.header.length; ++i) {
    const h = p.header[i]!;
    if (!h.endsWith("_exp")) continue;
    const base = h.slice(0, -"_exp".length);
    const j = p.header.indexOf(base + "_model");
    if (j >= 0) return { iExp: i, iModel: j };
  }
  return null;
}

/** Detect a fit-history CSV by `iter` + `chi2` columns. */
function detectFitLog(p: ParsedCsv): boolean {
  return (p.header[0] === "iter" &&
    p.header.includes("chi2")
  );
}

/** Detect a classical T-x-y diagram: header has  x[<comp>], T_bubble
 *  and y_eq_<comp> for the SAME <comp>.  Returns the indices of the
 *  three relevant columns plus the component name; null otherwise. */
function detectTxy(p: ParsedCsv):
  | { iX: number; iTbub: number; iYeq: number; comp: string }
  | null
{
  const m = /^x\[([^\]]+)\]$/.exec(p.header[0] ?? "");
  if (!m) return null;
  const comp = m[1]!;
  const iTbub = p.header.indexOf("T_bubble");
  const iYeq  = p.header.indexOf("y_eq_" + comp);
  if (iTbub < 0 || iYeq < 0) return null;
  return { iX: 0, iTbub, iYeq, comp };
}

/** Detect an Arrhenius fit result: a CSV carrying `invT_1perK` (1/T) and
 *  `ln_k` columns (one row per temperature).  Rendered as the classic
 *  Arrhenius plot -- ln k vs 1/T, whose slope is -Ea/R. */
function detectArrhenius(p: ParsedCsv):
  | { iInvT: number; iLnk: number }
  | null
{
  const iInvT = p.header.findIndex((h) => /^inv_?t/i.test(h));
  const iLnk  = p.header.findIndex((h) => /^ln_?k$/i.test(h));
  if (iInvT < 0 || iLnk < 0) return null;
  return { iInvT, iLnk };
}

/** Detect a VLE thermodynamic-consistency result: `x1, lnGamma1, lnGamma2,
 *  lnRatio, gdResidual` (from the vleConsistency op). */
function detectVleConsistency(p: ParsedCsv):
  | { iX: number; iLnG1: number; iLnG2: number; iRatio: number; iResid: number }
  | null
{
  const iLnG1 = p.header.indexOf("lnGamma1");
  const iLnG2 = p.header.indexOf("lnGamma2");
  const iResid = p.header.indexOf("gdResidual");
  if (iLnG1 < 0 || iLnG2 < 0 || iResid < 0) return null;
  const iRatio = p.header.indexOf("lnRatio");
  return { iX: 0, iLnG1, iLnG2, iRatio, iResid };
}

/** The VLE thermodynamic-consistency picture (test the DATA, not just fit it),
 *  switchable: the data-derived activity coefficients (ln gamma vs x), the
 *  Gibbs-Duhem area (ln(g1/g2) vs x with the signed area shaded -- Herington),
 *  and the pointwise GD residual (should hover at 0 for consistent data). */
function VleConsistencyPlot({ parsed, info, extras }: {
  parsed: ParsedCsv;
  info: { iX: number; iLnG1: number; iLnG2: number; iRatio: number; iResid: number };
  extras?: { [k: string]: number };
}) {
  const [mode, setMode] = useState<"gamma" | "GD-area" | "residual">("gamma");
  const x = column(parsed, info.iX);
  const lnG1 = column(parsed, info.iLnG1);
  const lnG2 = column(parsed, info.iLnG2);
  const ratio = info.iRatio >= 0 ? column(parsed, info.iRatio) : lnG1.map((v, i) => v - lnG2[i]!);
  const resid = column(parsed, info.iResid);

  // Verdict line: prefer the engine's diagnostics; else what the CSV affords.
  const D = extras?.["herington_D"];
  const J = extras?.["herington_J"];
  const pass = extras?.["herington_pass"];
  const g1inf = extras?.["gamma1_inf"];
  const g2inf = extras?.["gamma2_inf"];
  const verdict = (D !== undefined && J !== undefined)
    ? `Herington |D−J| = ${Math.abs(D - J).toFixed(1)} ${pass ? "✓ PASS" : "✗ FAIL"}`
      + (g1inf ? `   ·   γ∞ = ${g1inf.toFixed(2)} / ${(g2inf ?? 0).toFixed(2)}` : "")
    : "Gibbs-Duhem consistency";

  const data: object[] = [];
  let layout: object;
  const baseLayout = {
   ...darkLayout, autosize: true,
    margin: {...darkLayout.margin, t: 48, b: 70 },
    legend: {...darkLayout.legend, orientation: "h", y: -0.2, x: 0.5, xanchor: "center" },
  };
  const compAxis = (title: string) => ({...darkLayout.xaxis, title: { text: title }, range: [0, 1], autorange: false });

  if (mode === "gamma") {
    data.push({ type: "scatter", mode: "lines+markers", name: "ln γ₁", x, y: lnG1, line: { color: PLOT_COLORS.accent } });
    data.push({ type: "scatter", mode: "lines+markers", name: "ln γ₂", x, y: lnG2, line: { color: PLOT_COLORS.warm } });
    layout = {...baseLayout, title: { text: `activity coefficients from the data   ·   ${verdict}`, font: {...darkLayout.font, size: 13 } },
      xaxis: compAxis("liquid mole fraction  x₁"), yaxis: {...darkLayout.yaxis, title: { text: "ln γ" } } };
  } else if (mode === "GD-area") {
    data.push({ type: "scatter", mode: "lines", name: "y = 0", x: [0, 1], y: [0, 0], line: { color: PLOT_COLORS.axis, width: 1, dash: "dash" }, hoverinfo: "skip" });
    data.push({ type: "scatter", mode: "lines+markers", name: "ln(γ₁/γ₂)", x, y: ratio, fill: "tozeroy", fillcolor: "rgba(38,198,218,0.15)", line: { color: PLOT_COLORS.accent } });
    layout = {...baseLayout, title: { text: `Gibbs-Duhem area (Herington)   ·   ${verdict}`, font: {...darkLayout.font, size: 13 } },
      xaxis: compAxis("liquid mole fraction  x₁"), yaxis: {...darkLayout.yaxis, title: { text: "ln(γ₁/γ₂)" } } };
  } else {
    data.push({ type: "scatter", mode: "lines", name: "0", x: [0, 1], y: [0, 0], line: { color: PLOT_COLORS.axis, width: 1, dash: "dash" }, hoverinfo: "skip" });
    data.push({ type: "scatter", mode: "markers", name: "GD residual", x, y: resid, marker: { size: 8, color: PLOT_COLORS.warm2 } });
    layout = {...baseLayout, title: { text: `Gibbs-Duhem residual (≈0 if consistent)   ·   ${verdict}`, font: {...darkLayout.font, size: 13 } },
      xaxis: compAxis("liquid mole fraction  x₁"), yaxis: {...darkLayout.yaxis, title: { text: "x₁ dlnγ₁/dx₁ + x₂ dlnγ₂/dx₂" } } };
  }
  return (
    <Box style={{ width: "100%", height: "100%", display: "flex", flexDirection: "column" }}>
      <Group justify="space-between" px="md" py={6} style={{ flex: "0 0 auto" }}>
        <Text size="xs" c="dimmed">View:</Text>
        <SegmentedControl size="xs" value={mode} onChange={(v) => setMode(v as "gamma" | "GD-area" | "residual")}
          data={[{ value: "gamma", label: "ln γ" }, { value: "GD-area", label: "GD area" }, { value: "residual", label: "GD residual" }]} />
      </Group>
      <Box style={{ flex: 1, minHeight: 0 }}>
        <Plot data={data} layout={layout} config={PLOT_CONFIG} style={{ width: "100%", height: "100%" }} useResizeHandler />
      </Box>
    </Box>
  );
}

/** Detect a multi-isotherm kinetics result: long-format `T_K, time, c_fit,
 *  c_data, k_T`.  Rendered as the c-t isotherm family (fitted curves + raw
 *  points) with a toggle to the Arrhenius plot. */
function detectKineticsMultiT(p: ParsedCsv):
  | { iT: number; iTime: number; iCfit: number; iCdata: number; iKT: number }
  | null
{
  const iT    = p.header.findIndex((h) => /^t_?k$/i.test(h));
  const iTime = p.header.findIndex((h) => /^time$/i.test(h));
  const iCfit = p.header.findIndex((h) => /^c_?fit$/i.test(h));
  const iCdata = p.header.findIndex((h) => /^c_?data$/i.test(h));
  const iKT   = p.header.findIndex((h) => /^k_?t$/i.test(h));
  if (iT < 0 || iTime < 0 || iCfit < 0) return null;
  return { iT, iTime, iCfit, iCdata, iKT };
}

/** Multi-isotherm kinetics: the c-t curves (one fitted curve per temperature +
 *  the raw data points) AND the Arrhenius plot (ln k_T vs 1/T), switchable.
 *  This shows EVERYTHING -- the 24 data points, the 3 fitted curves, and the
 *  Arrhenius line whose slope is the activation energy. */
function KineticsIsothermsPlot({ parsed, info }: {
  parsed: ParsedCsv;
  info: { iT: number; iTime: number; iCfit: number; iCdata: number; iKT: number };
}) {
  const { iT, iTime, iCfit, iCdata, iKT } = info;
  const prefs = useStore((s) => s.displayPrefs);
  const [mode, setMode] = useState<"c-t" | "Arrhenius">("c-t");
  const color = (i: number) => PLOT_COLORS.series[i % PLOT_COLORS.series.length]!;
  const tLab = (T: number) => `${formatSig(kToDisplay(T, prefs.temperature), 4)} ${prefs.temperature === "degC" ? "°C" : "K"}`;

  const byT = new Map<number, { time: number; cfit: number; cdata: number }[]>();
  const kByT = new Map<number, number>();
  for (const r of parsed.rows) {
    const T = r[iT];
    if (T === undefined || !Number.isFinite(T)) continue;
    if (!byT.has(T)) byT.set(T, []);
    byT.get(T)!.push({ time: r[iTime] ?? NaN, cfit: r[iCfit] ?? NaN, cdata: iCdata >= 0 ? (r[iCdata] ?? NaN) : NaN });
    if (iKT >= 0 && Number.isFinite(r[iKT]!)) kByT.set(T, r[iKT]!);
  }
  const temps = [...byT.keys()].sort((a, b) => a - b);

  const data: object[] = [];
  let layout: object;

  if (mode === "c-t") {
    temps.forEach((T, idx) => {
      const rows = byT.get(T)!.slice().sort((a, b) => a.time - b.time);
      data.push({
        type: "scattergl", mode: "lines", name: `${tLab(T)}  fit`,
        x: rows.map((r) => sToDisplay(r.time, prefs.time)), y: rows.map((r) => r.cfit),
        line: { color: color(idx), width: 2 },
      });
      const dp = rows.filter((r) => Number.isFinite(r.cdata));
      data.push({
        type: "scattergl", mode: "markers", name: `${tLab(T)}  data`,
        x: dp.map((r) => sToDisplay(r.time, prefs.time)), y: dp.map((r) => r.cdata),
        marker: { size: 8, color: color(idx), line: { color: "#fff", width: 1 } },
      });
    });
    layout = {
     ...darkLayout, autosize: true,
      title: { text: "kinetics isotherms   ·   c(t) per temperature   (fit + data)", font: {...darkLayout.font, size: 14 } },
      xaxis: {...darkLayout.xaxis, title: { text: `time   t   [${prefs.time}]` } },
      yaxis: {...darkLayout.yaxis, title: { text: "concentration   c   [mol/L]" } },
      legend: {...darkLayout.legend, orientation: "h", y: -0.18, x: 0.5, xanchor: "center" },
      margin: {...darkLayout.margin, t: 48, b: 80 },
    };
  } else {
    const R = 8.314462618;
    const xs = temps.map((T) => 1 / T);
    const ys = temps.map((T) => Math.log(kByT.get(T) ?? NaN));
    const n = xs.length;
    let sx = 0, sy = 0, sxx = 0, sxy = 0;
    for (let i = 0; i < n; i++) { sx += xs[i]!; sy += ys[i]!; sxx += xs[i]! * xs[i]!; sxy += xs[i]! * ys[i]!; }
    const den = n * sxx - sx * sx;
    const b = den !== 0 ? (n * sxy - sx * sy) / den : 0;
    const a = (sy - b * sx) / n;
    const meanY = sy / n; let ssRes = 0, ssTot = 0;
    for (let i = 0; i < n; i++) { const pr = a + b * xs[i]!; ssRes += (ys[i]! - pr) ** 2; ssTot += (ys[i]! - meanY) ** 2; }
    const R2 = ssTot > 0 ? 1 - ssRes / ssTot : 0;
    const Ea = (-b * R) / 1000, k0 = Math.exp(a);
    const xmin = Math.min(...xs), xmax = Math.max(...xs);
    data.push({
      type: "scatter", mode: "lines", name: "fit", x: [xmin, xmax], y: [a + b * xmin, a + b * xmax],
      line: { color: PLOT_COLORS.warm, width: 2, dash: "dash" }, hoverinfo: "skip",
    });
    data.push({
      type: "scatter", mode: "markers", name: "k(T)", x: xs, y: ys,
      customdata: temps,
      marker: { size: 11, color: PLOT_COLORS.accent, line: { color: "#fff", width: 1 } },
      hovertemplate: "T = %{customdata:.0f} K<br>1/T = %{x:.5f}<br>ln k = %{y:.3f}<extra></extra>",
    });
    layout = {
     ...darkLayout, autosize: true,
      // Honesty: these numbers come from a GUI-side least-squares of the
      // plotted points, NOT from the canonical fit engine (choupoProps
      // fitParameters) — the title says so.
      title: { text: `Arrhenius   ·   GUI linear regression of the plotted points:   Ea = ${Ea.toFixed(1)} kJ/mol   ·   k₀ = ${k0.toExponential(2)}   ·   R² = ${R2.toFixed(4)}`, font: {...darkLayout.font, size: 14 } },
      xaxis: {...darkLayout.xaxis, title: { text: "1 / T   [1/K]" } },
      yaxis: {...darkLayout.yaxis, title: { text: "ln k" } },
      legend: {...darkLayout.legend, orientation: "h", y: -0.18, x: 0.5, xanchor: "center" },
      margin: {...darkLayout.margin, t: 48, b: 70 },
    };
  }

  return (
    <Box style={{ width: "100%", height: "100%", display: "flex", flexDirection: "column" }}>
      <Group justify="space-between" px="md" py={6} style={{ flex: "0 0 auto" }}>
        <Text size="xs" c="dimmed">View:</Text>
        <SegmentedControl size="xs" value={mode} onChange={(v) => setMode(v as "c-t" | "Arrhenius")}
          data={[{ value: "c-t", label: "c–t isotherms" }, { value: "Arrhenius", label: "Arrhenius" }]} />
      </Group>
      <Box style={{ flex: 1, minHeight: 0 }}>
        <Plot data={data} layout={layout} config={PLOT_CONFIG} style={{ width: "100%", height: "100%" }} useResizeHandler />
      </Box>
    </Box>
  );
}

/** Detect a 2-D scan by counting unique values in the first column.  If
 *  it has < N/2 unique values (i.e. is roughly constant across many
 *  rows), and there are >= 3 columns, assume it's the X axis of a
 *  rectangular grid with the second column as the Y axis. */
function detectGrid2D(p: ParsedCsv): boolean {
  if (p.header.length < 3) return false;
  const uniq = new Set<number>();
  for (const r of p.rows) uniq.add(r[0]!);
  // A grid has FAR fewer unique X values than rows (each X repeats
  // for every Y).  A 1-D scan has uniq.size === rows.length.
  return uniq.size * 2 < p.rows.length;
}

// ---------------------------------------------------------------------------
//   Rendering paths
// ---------------------------------------------------------------------------

/** Split a multi-method merged column "<prop>__<model>" (methodCompare.ts):
 *  the PROPERTY drives the axis label / units / log heuristic, the MODEL is
 *  the legend label.  A plain column passes through unchanged. */
function splitMethodCol(name: string): { prop: string; model: string | null } {
  const i = name.indexOf("__");
  return i > 0
    ? { prop: name.slice(0, i), model: name.slice(i + 2) }
    : { prop: name, model: null };
}

/** A horizontal reference line drawn across a 1-D scan, with a label.  `y` is
 *  in the PLOTTED unit of the y axis (for a dimensionless column like SI that
 *  is the raw value).  Rendered as a layout shape + annotation, never a data
 *  trace — it must not join the legend or perturb the log-axis heuristic. */
export interface ReferenceLine {
  y: number;
  label: string;
}

function ScanLinePlot({ parsed, referenceLines, secondaryColumn }: {
  parsed: ParsedCsv;
  referenceLines?: ReferenceLine[];
  /** A column rendered on its OWN right-hand y-axis (dashed) instead of
   *  sharing the primary axis — e.g. the scaling scan's pH (≈7–9), which
   *  would flatten the SI curves if it shared their axis.  The column stays
   *  VISIBLE (see-then-decide), just on its own scale. */
  secondaryColumn?: string;
}) {
  const prefs = useStore((s) => s.displayPrefs);
  const xColName = parsed.header[0]!;
  const secIdx = secondaryColumn ? parsed.header.indexOf(secondaryColumn) : -1;
  const yCols = parsed.header.slice(1).filter((_, i) => i + 1 !== secIdx);
  // Multi-method columns carry "<prop>__<model>": axis follows the prop,
  // legend shows the model.
  const yProps = yCols.map((n) => splitMethodCol(n).prop);

  // Convert each axis to the unit chosen in the global UnitsMenu.
  const xAx = axisDisplay(xColName, prefs);
  const x = column(parsed, 0).map(xAx.conv);
  const yAxes = yProps.map((name) => axisDisplay(name, prefs));
  const yIdx = parsed.header
    .map((_, i) => i)
    .filter((i) => i > 0 && i !== secIdx);

  const data = yCols.map((name, idx) => ({
    type: "scattergl" as const,
    mode: "lines+markers" as const,
    name: splitMethodCol(name).model ?? name,
    x,
    y: column(parsed, yIdx[idx]!).map(yAxes[idx]!.conv),
    line: { color: PLOT_COLORS.series[idx % PLOT_COLORS.series.length] },
    marker: { size: 4 },
  }));
  // The secondary trace: dashed, on yaxis2 (right), named after its column.
  // Excluded from `data` so the log-axis heuristic below sees only the
  // primary-axis traces.
  const secTrace = secIdx >= 0
    ? {
        type: "scattergl" as const,
        mode: "lines" as const,
        name: `${secondaryColumn} (right axis)`,
        x,
        y: column(parsed, secIdx),
        yaxis: "y2" as const,
        line: { color: PLOT_COLORS.warm, width: 2, dash: "dash" as const },
      }
    : null;

  // Auto-detect log scale: every Y positive, spanning > two decades, AND the
  // property is one that physically spans decades (vapour pressure, pressure,
  // diffusivity, viscosity, conductivity).  Other all-positive scalars (e.g. Z,
  // v_molar) keep a linear axis even when their range is wide.
  const logProp = (n: string): boolean => {
    const s = n.toLowerCase();
    return s.includes("psat") || s === "p" || s.includes("pressure")
      || s.includes("diffus") || s.includes("viscos") || s.startsWith("mu") || s.includes("_mu")
      || s.includes("k_liquid") || s === "k_l" || s.includes("thermal_conductivity");
  };
  const allY = data.flatMap((d) => d.y.filter(Number.isFinite));
  const posY = allY.filter((v) => v > 0);
  const useLogY = posY.length === allY.length
               && posY.length > 0
               && Math.max(...posY) / Math.min(...posY) > 100
               && yProps.every((c) => logProp(c));

  // Y-axis title: single column uses its display label; multiple columns sharing
  // a common prefix use that prefix's display label (assume same dimension).
  const yTitle = (yProps.length === 1
    ? yAxes[0]!.label
    : axisDisplay(commonPrefix(yProps) || yProps[0]!, prefs).label)
    + (useLogY ? "   (log)" : "");

  // Reference lines span the full plot width (paper x-coords), dashed, with a
  // small same-colour label sitting just above the line at the left edge.
  const refs = referenceLines ?? [];
  const refShapes = refs.map((r) => ({
    type: "line" as const, xref: "paper" as const,
    x0: 0, x1: 1, y0: r.y, y1: r.y,
    line: { color: PLOT_COLORS.warm2, width: 1.5, dash: "dash" as const },
  }));
  const refAnnotations = refs.map((r) => ({
    xref: "paper" as const, x: 0.01, y: r.y,
    xanchor: "left" as const, yanchor: "bottom" as const,
    text: r.label, showarrow: false,
    font: { ...PLOT_FONT, size: 11, color: PLOT_COLORS.warm2 },
  }));

  return (
    <Plot
      data={secTrace ? [...data, secTrace] : data}
      layout={{
...darkLayout,
        autosize: true,
        xaxis: {
...darkLayout.xaxis,
          title: { text: xAx.label },
        },
        yaxis: {
...darkLayout.yaxis,
          title: { text: yTitle },
          type: useLogY ? ("log" as const) : ("linear" as const),
        },
        ...(secTrace
          ? {
              yaxis2: {
...darkLayout.yaxis,
                title: { text: secondaryColumn },
                overlaying: "y" as const,
                side: "right" as const,
                showgrid: false,
                automargin: true,
              },
            }
          : {}),
        showlegend: yCols.length > 1 || secTrace !== null,
        ...(refShapes.length > 0
          ? { shapes: refShapes, annotations: refAnnotations }
          : {}),
      }}
      config={PLOT_CONFIG}
      style={{ width: "100%", height: "100%" }}
      useResizeHandler
    />
  );
}

/** Longest "_"-separated common prefix of a list of column names.
 *  ["Psat_ethanol", "Psat_water"]   -> "Psat"
 *  ["mu_gas_N2",   "mu_gas_O2"]     -> "mu_gas"
 *  ["a", "b"]                       -> "" */
function commonPrefix(names: string[]): string {
  if (names.length === 0) return "";
  const parts = names.map((n) => n.split("_"));
  const out: string[] = [];
  for (let i = 0; i < parts[0]!.length; ++i) {
    const here = parts[0]![i];
    if (parts.every((p) => p[i] === here)) out.push(here!);
    else break;
  }
  return out.join("_");
}

/** Heuristic unit annotation for plot axis labels.  Walks every
 *  "_"-separated token of the column name (not just the head) and
 *  returns the first one with a known unit, e.g.
 *      viscosity_liquid              -> viscosity_liquid (Pa·s)
 *      thermal_conductivity_liquid   -> thermal_conductivity_liquid (W/(m·K))
 *      Psat_ethanol                  -> Psat_ethanol (Pa)
 *  Falls through to the raw name when no token is known — better to
 *  show no unit than the wrong one. */
function labelWithUnit(colName: string): string {
  for (const tok of colName.toLowerCase().split("_")) {
    if (COL_UNITS[tok]) return `${colName} (${COL_UNITS[tok]})`;
  }
  return colName;
}

// Axis display per the global UnitsMenu (displayPrefs): a pressure column (Pa)
// or temperature column (K) is converted to the chosen unit and relabelled, so
// the Props plots OBEY the same unit control as the streams.  Other axes keep
// their canonical label.  `unit` is the bare unit string ("" when unknown) so
// callers can tag standalone readouts (e.g. the multi-method spread).
export function axisDisplay(colName: string, prefs: DisplayPrefs):
  { conv: (v: number) => number; label: string; unit: string }
{
  let canon = "";
  for (const tok of colName.toLowerCase().split(/[_[\]]/)) {
    if (COL_UNITS[tok]) { canon = COL_UNITS[tok]; break; }
  }
  if (canon === "Pa")
    return { conv: (v) => paToDisplay(v, prefs.pressure),
             label: `${colName} (${prefs.pressure})`, unit: prefs.pressure };
  if (canon === "K") {
    const u = prefs.temperature === "degC" ? "°C" : "K";
    return { conv: (v) => kToDisplay(v, prefs.temperature),
             label: `${colName} (${u})`, unit: u };
  }
  if (canon === "mol/kg") {
    // Concentration (molality) follows the Units menu.  mg/L needs a molar
    // mass per species -- the plot layer has none for arbitrary speciation
    // tables, so it falls back to canonical mol/kg (the label says what is
    // truly plotted; no fake numbers).
    const u = effectiveConcentrationUnit(prefs.concentration, false);
    return { conv: (v) => molalToDisplay(v, u),
             label: `${colName} (${u})`, unit: u };
  }
  for (const tok of colName.toLowerCase().split("_")) {
    if (COL_UNITS[tok])
      return { conv: (v) => v, label: `${colName} (${COL_UNITS[tok]})`, unit: COL_UNITS[tok]! };
  }
  return { conv: (v) => v, label: colName, unit: "" };
}

const COL_UNITS: Record<string, string> = {
  t:            "K",
  temperature:  "K",
  p:            "Pa",
  pressure:     "Pa",
  psat:         "Pa",
  z:            "—",
  mu:           "Pa·s",
  visc:         "Pa·s",
  viscosity:    "Pa·s",
  cond:         "W/(m·K)",
  conductivity: "W/(m·K)",
  k:            "W/(m·K)",
  diff:         "m²/s",
  diffusivity:  "m²/s",
  d:            "m²/s",
  cp:           "J/(mol·K)",
  cv:           "J/(mol·K)",
  h:            "J/mol",
  enthalpy:     "J/mol",
  s:            "J/(mol·K)",
  entropy:      "J/(mol·K)",
  g:            "J/mol",
  gibbs:        "J/mol",
  gamma:        "—",
  molality:     "mol/kg",
  rho:          "kg/m³",
  density:      "kg/m³",
  v:            "m³/mol",
  volume:       "m³/mol",
  x:            "mol frac",
  y:            "mol frac",
  // Steam tables (IF97) are MASS-basis SI: the Explorer renames the op's
  // h_f/h/... columns to these collision-free tokens (h alone would label the
  // MOLAR J/mol above) so the axis states the true basis.
  hf:           "J/kg",
  hg:           "J/kg",
  hfg:          "J/kg",
  sf:           "J/(kg·K)",
  sg:           "J/(kg·K)",
  vf:           "m³/kg",
  vg:           "m³/kg",
  hmass:        "J/kg",
  smass:        "J/(kg·K)",
  vmass:        "m³/kg",
  cpmass:       "J/(kg·K)",
};

/** Categorical fallback (the speciate ops' species tables:
 *  `species,molality,activity,gamma`).  Every numeric-x renderer drew EMPTY
 *  axes for a species-name first column; render horizontal bars instead --
 *  species as tick labels, ONE value column at a time (molality / activity /
 *  gamma carry different dimensions, so a shared axis would lie), log value
 *  axis when the spread spans decades (trace ions next to majors).  The
 *  molality axis follows the Units menu via axisDisplay. */
function CategoricalBarPlot({ cat }: { cat: CategoricalCsv }) {
  const prefs = useStore((s) => s.displayPrefs);
  const [active, setActive] = useState(cat.valueCols[0]!.name);
  const col = cat.valueCols.find((c) => c.name === active) ?? cat.valueCols[0]!;
  const ax = axisDisplay(col.name, prefs);
  const values = col.values.map(ax.conv);

  // Log value axis: all finite values positive AND spanning > two decades
  // (same heuristic as ScanLinePlot) -- a molality table runs 1e-9..1e-2.
  const finite = values.filter(Number.isFinite);
  const pos = finite.filter((v) => v > 0);
  const useLog = pos.length === finite.length && pos.length > 0
              && Math.max(...pos) / Math.min(...pos) > 100;

  const hoverUnit = ax.unit && ax.unit !== "—" ? ` ${ax.unit}` : "";
  return (
    <Box style={{ width: "100%", height: "100%", display: "flex", flexDirection: "column" }}>
      {cat.valueCols.length > 1 && (
        <Group justify="flex-end" gap="xs" px="md" py={4} style={{ flex: "0 0 auto" }}>
          <Text size="xs" c="dimmed">Column:</Text>
          <NativeSelect
            size="xs"
            value={col.name}
            onChange={(e) => setActive(e.currentTarget.value)}
            data={cat.valueCols.map((c) => c.name)}
            style={{ minWidth: 120 }}
          />
        </Group>
      )}
      <Box style={{ flex: 1, minHeight: 0 }}>
        <Plot
          data={[
            {
              type: "bar",
              orientation: "h",
              x: values,
              y: cat.labels,
              marker: { color: PLOT_COLORS.accent },
              hovertemplate: `%{y}<br>${col.name}: %{x:.4g}${hoverUnit}<extra></extra>`,
            },
          ]}
          layout={{
...darkLayout,
            autosize: true,
            xaxis: {
...darkLayout.xaxis,
              title: { text: ax.label + (useLog ? "   (log)" : "") },
              type: useLog ? ("log" as const) : ("linear" as const),
            },
            yaxis: {
...darkLayout.yaxis,
              title: { text: cat.xName },
              // First CSV row at the top, long species names fully visible.
              autorange: "reversed" as const,
              automargin: true,
            },
            showlegend: false,
          }}
          config={PLOT_CONFIG}
          style={{ width: "100%", height: "100%" }}
          useResizeHandler
        />
      </Box>
    </Box>
  );
}

function ScanHeatmap({ parsed }: { parsed: ParsedCsv }) {
  const prefs = useStore((s) => s.displayPrefs);
  // Header: [xName, yName, prop1, prop2,...]
  const [xName, yName,...propNames] = parsed.header as [string, string,...string[]];
  const [activeProp, setActiveProp] = useState(propNames[0] ?? "");

  // Axes obey the global Units menu (the conversions are monotonic, so the
  // sorted order survives).  The pivot keys on the RAW canonical values.
  const xAx = axisDisplay(xName, prefs);
  const yAx = axisDisplay(yName, prefs);
  const xRaw = Array.from(new Set(column(parsed, 0))).sort((a, b) => a - b);
  const yRaw = Array.from(new Set(column(parsed, 1))).sort((a, b) => a - b);
  const xVals = xRaw.map(xAx.conv);
  const yVals = yRaw.map(yAx.conv);

  // Pivot: z[iy][ix] for the selected property.
  const propIdx = parsed.header.indexOf(activeProp);
  const z: number[][] = Array.from({ length: yVals.length },
                                   () => new Array(xVals.length).fill(NaN));
  if (propIdx >= 2) {
    const xIndex = new Map(xRaw.map((v, i) => [v, i]));
    const yIndex = new Map(yRaw.map((v, i) => [v, i]));
    for (const r of parsed.rows) {
      const ix = xIndex.get(r[0]!);
      const iy = yIndex.get(r[1]!);
      if (ix === undefined || iy === undefined) continue;
      z[iy]![ix] = r[propIdx]!;
    }
  }

  return (
    <Box style={{ width: "100%", height: "100%", display: "flex", flexDirection: "column" }}>
      <Group justify="flex-end" gap="xs" px="md" py={4} style={{ flex: "0 0 auto" }}>
        <Text size="xs" c="dimmed">Property:</Text>
        <NativeSelect
          size="xs"
          value={activeProp}
          onChange={(e) => setActiveProp(e.currentTarget.value)}
          data={propNames}
          style={{ minWidth: 120 }}
        />
      </Group>
      <Box style={{ flex: 1, minHeight: 0 }}>
        <Plot
          data={[
            {
              type: "heatmap",
              x: xVals,
              y: yVals,
              z,
              colorscale: "Viridis",
              colorbar: { title: { text: labelWithUnit(activeProp), side: "right" } },
              hovertemplate:
                `${xAx.label}: %{x}<br>${yAx.label}: %{y}<br>${activeProp}: %{z:.4g}<extra></extra>`,
            },
          ]}
          layout={{
...darkLayout,
            autosize: true,
            xaxis: {...darkLayout.xaxis, title: { text: xAx.label } },
            yaxis: {...darkLayout.yaxis, title: { text: yAx.label } },
            margin: {...darkLayout.margin, r: 100 },
          }}
          config={PLOT_CONFIG}
          style={{ width: "100%", height: "100%" }}
          useResizeHandler
        />
      </Box>
    </Box>
  );
}

function ParityPlot({ parsed, iExp, iModel }: {
  parsed: ParsedCsv;
  iExp: number;
  iModel: number;
}) {
  const expName = parsed.header[iExp]!;
  const modelName = parsed.header[iModel]!;
  const xExp = column(parsed, iExp);
  const yModel = column(parsed, iModel);

  const lo = Math.min(...xExp,...yModel);
  const hi = Math.max(...xExp,...yModel);

  // Residuals strip (model - exp).  Plotted against the INDEPENDENT variable
  // (the first column, e.g. x_1) when present -- structure there means the
  // model is wrong in a way the parity scatter hides; flat noise about zero
  // means a good fit.  Falls back to the experiment value.
  const residXIdx = (iExp !== 0 && iModel !== 0) ? 0 : iExp;
  const residXName = parsed.header[residXIdx]!;
  const residX = column(parsed, residXIdx);
  const resid = yModel.map((m, i) => m - (xExp[i] ?? NaN));
  const finite = resid.filter((r) => Number.isFinite(r));
  const sigma = finite.length
    ? Math.sqrt(finite.reduce((s, r) => s + r * r, 0) / finite.length) : 0;
  const rxLo = Math.min(...residX), rxHo = Math.max(...residX);
  const band = (y: number, dash: boolean) => ({
    type: "scatter" as const, mode: "lines" as const,
    x: [rxLo, rxHo], y: [y, y],
    line: { color: dash ? PLOT_COLORS.warm : "#64748b", dash: dash ? ("dot" as const) : ("solid" as const), width: 1 },
    xaxis: "x2", yaxis: "y2", hoverinfo: "skip" as const, showlegend: false,
  });

  return (
    <Plot
      data={[
        // --- parity (top panel) ---
        {
          type: "scatter", mode: "markers", name: "data",
          x: xExp, y: yModel,
          marker: { color: PLOT_COLORS.accent, size: 8 },
          hovertemplate: `${expName}: %{x:.3f}<br>${modelName}: %{y:.3f}<extra></extra>`,
        },
        {
          type: "scatter", mode: "lines", name: "identity",
          x: [lo, hi], y: [lo, hi],
          line: { color: PLOT_COLORS.warm, dash: "dash" }, hoverinfo: "skip",
        },
        // --- residuals (bottom panel) ---
        band(0, false),
       ...(sigma > 0 ? [band(sigma, true), band(-sigma, true)] : []),
        {
          type: "scatter", mode: "markers", name: "residual",
          x: residX, y: resid,
          marker: { color: PLOT_COLORS.accent, size: 6 },
          xaxis: "x2", yaxis: "y2",
          hovertemplate: `${residXName}: %{x:.3f}<br>resid: %{y:.3g}<extra></extra>`,
        },
      ]}
      layout={{
...darkLayout,
        autosize: true,
        xaxis: {...darkLayout.xaxis, title: { text: `experiment  ${expName}` }, domain: [0, 1], anchor: "y" },
        yaxis: {...darkLayout.yaxis, title: { text: `model  ${modelName}` }, domain: [0.42, 1] },
        xaxis2: {...darkLayout.xaxis, title: { text: residXName }, domain: [0, 1], anchor: "y2" },
        yaxis2: {...darkLayout.yaxis, title: { text: `resid (±σ=${sigma.toPrecision(2)})` }, domain: [0, 0.26], zeroline: true },
        showlegend: false,
        title: { text: "Parity + residuals  (model vs experiment)", font: {...darkLayout.font, size: 14 } },
      }}
      config={PLOT_CONFIG}
      style={{ width: "100%", height: "100%" }}
      useResizeHandler
    />
  );
}

export type TxyMode = "T-x-y" | "x-y" | "T-x" | "T-y";

/**
 * Classical binary-VLE diagram with switchable representations:
 *
 *   T-x-y  --  bubble (x) + dew (y) vs T  with shaded 2-φ envelope
 *   x-y    --  McCabe-Thiele:  y_eq(x) curve + y = x diagonal
 *   T-x    --  bubble curve only (liquid side)
 *   T-y    --  dew curve only    (vapour side)
 *
 * Azeotrope auto-annotation in every mode where it is geometrically
 * meaningful (T-x-y and x-y).
 */
function TxyPlot({ parsed, info, overlays, defaultMode, partner, P }: {
  parsed: ParsedCsv;
  info: { iX: number; iTbub: number; iYeq: number; comp: string };
  overlays: ExperimentalOverlay[];
  defaultMode?: TxyMode;
  /** Second component of the pair (for the title); omitted -> comp alone. */
  partner?: string;
  /** Fixed pressure of the sweep [Pa] (for the title); omitted -> "constant P". */
  P?: number;
}) {
  const { iX, iTbub, iYeq, comp } = info;
  const prefs = useStore((s) => s.displayPrefs);
  const [mode, setMode] = useState<TxyMode>(defaultMode ?? "T-x-y");

  // Sort by x so the curves go left-to-right and any envelope fill works.
  const rows = useMemo(
    () => parsed.rows
.map((r) => ({ x: r[iX]!, T: r[iTbub]!, y: r[iYeq]! }))
.filter((r) => Number.isFinite(r.x)
                  && Number.isFinite(r.T)
                  && Number.isFinite(r.y))
.sort((a, b) => a.x - b.x),
    [parsed.rows, iX, iTbub, iYeq],
  );

  // Azeotrope detection: interior rows where |x - y| < 0.01 (relaxed from 0.005
  // per the forum — some azeotropes, e.g. ethanol-water, only close to ~0.002
  // on a coarse grid and were being missed).
  type AzeoPt = { x: number; T: number };
  const azeo: AzeoPt[] = useMemo(() => {
    const out: AzeoPt[] = [];
    for (const r of rows) {
      if (r.x > 0.05 && r.x < 0.95 && Math.abs(r.x - r.y) < 0.01)
        out.push({ x: r.x, T: r.T });
    }
    return out;
  }, [rows]);

  // Display bundle: temperature axis obeys the global Units menu; the title
  // names the real pair + the swept pressure when the caller supplies them.
  const disp = useMemo<TxyDisplay>(() => ({
    tConv: (K: number) => kToDisplay(K, prefs.temperature),
    tUnit: prefs.temperature === "degC" ? "°C" : "K",
    pair: partner ? `${comp} / ${partner}` : comp,
    pLabel: P !== undefined
      ? `at ${formatSig(paToDisplay(P, prefs.pressure))} ${prefs.pressure}`
      : "at constant P",
  }), [prefs, comp, partner, P]);

  const { data, layout } = useMemo(
    () => buildPlot(mode, rows, azeo, comp, overlays, disp),
    [mode, rows, azeo, comp, overlays, disp],
  );

  return (
    <Box style={{ width: "100%", height: "100%",
                  display: "flex", flexDirection: "column" }}>
      <Group justify="space-between" px="md" py={6}
             style={{ flex: "0 0 auto" }}>
        <Text size="xs" c="dimmed">View:</Text>
        <SegmentedControl
          size="xs"
          value={mode}
          onChange={(v) => setMode(v as TxyMode)}
          data={[
            { value: "T-x-y", label: "T-x-y" },
            { value: "x-y",   label: "x-y"   },
            { value: "T-x",   label: "T-x"   },
            { value: "T-y",   label: "T-y"   },
          ]}
        />
      </Group>
      <Box style={{ flex: 1, minHeight: 0 }}>
        <Plot
          data={data}
          layout={layout}
          config={PLOT_CONFIG}
          style={{ width: "100%", height: "100%" }}
          useResizeHandler
        />
      </Box>
    </Box>
  );
}

interface TxyRow { x: number; T: number; y: number }

/** How the binary-VLE plot renders units + identity: tConv/tUnit obey the
 *  global Units menu (rows stay canonical K internally); pair/pLabel carry the
 *  component pair + fixed pressure into the title. */
interface TxyDisplay {
  tConv: (K: number) => number;
  tUnit: string;
  pair: string;
  pLabel: string;
}

/**
 * Resolve which two columns of an experimental overlay map to the
 * (horizontal, vertical) axes of the current TxyPlot mode.  Returns
 * null when no usable pair is found.  Matching is by column name
 * (case-insensitive), allowing the canonical aliases below.
 *
 *   horizontal axis            accepted column names
 *   -----------------          -----------------------------------
 *   "x"  (liquid mole frac.)   x, x1, x_<comp>, x[<comp>]
 *   "y"  (vapour mole frac.)   y, y1, y_<comp>, y[<comp>]
 *   "T"  (temperature)         t, t_bubble, t_dew, tb, tboil, t/k, t_k
 *
 *   For T-x-y mode we accept both (x,T) and (y,T) pairs from the
 *   SAME overlay -- the renderer plots both as separate markers
 *   (open circles for the dew side, filled for the bubble side).
 */
function findColumn(header: string[], comp: string, kind: "x" | "y" | "T"):
  number {
  const lh = header.map((h) => h.trim().toLowerCase());
  const cl = comp.toLowerCase();
  const xAliases = [`x`, `x1`, `x_${cl}`, `x[${cl}]`];
  const yAliases = [`y`, `y1`, `y_${cl}`, `y[${cl}]`, `y_eq_${cl}`];
  const tAliases = [
    `t`, `t_bubble`, `t_dew`, `tb`, `tbub`, `tboil`, `t/k`, `t_k`,
    `temp`, `temperature`,
  ];
  const aliases = kind === "x" ? xAliases : kind === "y" ? yAliases : tAliases;
  for (const a of aliases) {
    const i = lh.indexOf(a);
    if (i >= 0) return i;
  }
  return -1;
}

interface OverlayMatch {
  name: string;
  /** xs for the horizontal axis */
  xs: number[];
  /** ys for the vertical axis */
  ys: number[];
}

function matchOverlay(ov: ExperimentalOverlay,
  comp: string,
  horiz: "x" | "y",
  vert: "x" | "y" | "T",
): OverlayMatch | null {
  const ih = findColumn(ov.header, comp, horiz);
  const iv = findColumn(ov.header, comp, vert);
  if (ih < 0 || iv < 0) return null;
  const xs: number[] = [];
  const ys: number[] = [];
  for (const r of ov.rows) {
    const h = r[ih];
    const v = r[iv];
    if (h === undefined || v === undefined) continue;
    if (!Number.isFinite(h) || !Number.isFinite(v)) continue;
    xs.push(h);
    ys.push(v);
  }
  return xs.length > 0 ? { name: ov.name, xs, ys } : null;
}

function overlayTrace(m: OverlayMatch,
  color: string,
  symbol: "circle" | "circle-open" | "diamond" = "circle",
  legendLabel?: string,
): object {
  return {
    type: "scatter",
    mode: "markers",
    name: legendLabel ?? `exp · ${m.name}`,
    x: m.xs,
    y: m.ys,
    marker: {
      size: 8,
      color,
      symbol,
      line: { color: "#fff", width: 0.5 },
    },
    hovertemplate: `%{x:.4f}, %{y:.3f}<br><i>${m.name}</i><extra></extra>`,
  };
}

function buildPlot(mode: TxyMode,
  rows: TxyRow[],
  azeo: { x: number; T: number }[],
  comp: string,
  overlays: ExperimentalOverlay[],
  disp: TxyDisplay,
): { data: object[]; layout: object } {
  const { tConv, tUnit, pair, pLabel } = disp;
  const xLiq    = rows.map((r) => r.x);
  const Tbubble = rows.map((r) => tConv(r.T));
  const yVap    = rows.map((r) => r.y);

  const bubbleTrace = {
    type: "scatter",
    mode: "lines+markers",
    name: `bubble  (liquid · x_${comp})`,
    x: xLiq,
    y: Tbubble,
    line: { color: PLOT_COLORS.accent, width: 2.5 },
    marker: { size: 5, color: PLOT_COLORS.accent },
    hovertemplate:
      `x_${comp}: %{x:.4f}<br>T_bubble: %{y:.2f} ${tUnit}<extra></extra>`,
  };
  const dewTrace = {
    type: "scatter",
    mode: "lines+markers",
    name: `dew  (vapour · y_${comp})`,
    x: yVap,
    y: Tbubble,
    line: { color: PLOT_COLORS.warm, width: 2.5 },
    marker: { size: 5, color: PLOT_COLORS.warm },
    hovertemplate:
      `y_${comp}: %{x:.4f}<br>T_dew: %{y:.2f} ${tUnit}<extra></extra>`,
  };

  const baseLayout = {
...darkLayout,
    autosize: true,
    legend: {
...darkLayout.legend,
      orientation: "h",
      y: -0.18,
      x: 0.5,
      xanchor: "center",
    },
    margin: {...darkLayout.margin, t: 48, b: 80 },
  };

  // Composition axes are always in [0, 1].  `autorange: false` is
  // required for the range to stick --- otherwise Plotly recomputes
  // the range to include annotations / text labels and ends up
  // showing -0.05.. 1.05 or worse.
  const compAxis = (title: string) => ({
...darkLayout.xaxis,
    title: { text: title },
    range: [0, 1],
    autorange: false,
    constrain: "range" as const,
  });

  // Experimental T columns arrive in canonical K — convert them the same way
  // as the model curves so the overlay stays aligned in °C mode.
  const convT = (m: OverlayMatch | null): OverlayMatch | null =>
    m ? { ...m, ys: m.ys.map(tConv) } : null;

  if (mode === "T-x-y") {
    const data: object[] = [
      bubbleTrace,
      {...dewTrace, fill: "tonexty", fillcolor: "rgba(255, 183, 77, 0.10)" },
    ];
    if (azeo.length > 0) {
      data.push(azeotropeMarker(azeo, "T", tConv, tUnit));
    }
    // Overlay each experimental dataset twice: once for the bubble
    // side (x_exp, T_exp) and once for the dew side (y_exp, T_exp)
    // if the data supplies both.
    for (const ov of overlays) {
      const bub = convT(matchOverlay(ov, comp, "x", "T"));
      if (bub) data.push(overlayTrace(bub, "#ff5252", "circle",
                                       `exp bubble · ${ov.name}`));
      const dew = convT(matchOverlay(ov, comp, "y", "T"));
      if (dew) data.push(overlayTrace(dew, "#ff5252", "circle-open",
                                       `exp dew · ${ov.name}`));
    }
    return {
      data,
      layout: {
...baseLayout,
        title: {
          text: `T-x-y diagram   ·   ${pair}   ${pLabel}`,
          font: {...darkLayout.font, size: 14 },
        },
        xaxis: compAxis(`mole fraction   x_${comp} (liquid), y_${comp} (vapour)`),
        yaxis: {
...darkLayout.yaxis,
          title: { text: `temperature   T   [${tUnit}]` },
        },
      },
    };
  }

  if (mode === "T-x") {
    const data: object[] = [bubbleTrace];
    for (const ov of overlays) {
      const m = convT(matchOverlay(ov, comp, "x", "T"));
      if (m) data.push(overlayTrace(m, "#ff5252", "circle"));
    }
    return {
      data,
      layout: {
...baseLayout,
        title: {
          text: `T-x  (bubble curve)   ·   ${pair}`,
          font: {...darkLayout.font, size: 14 },
        },
        xaxis: compAxis(`liquid mole fraction   x_${comp}`),
        yaxis: {
...darkLayout.yaxis,
          title: { text: `bubble temperature   T   [${tUnit}]` },
        },
      },
    };
  }

  if (mode === "T-y") {
    const data: object[] = [dewTrace];
    for (const ov of overlays) {
      const m = convT(matchOverlay(ov, comp, "y", "T"));
      if (m) data.push(overlayTrace(m, "#ff5252", "circle-open"));
    }
    return {
      data,
      layout: {
...baseLayout,
        title: {
          text: `T-y  (dew curve)   ·   ${pair}`,
          font: {...darkLayout.font, size: 14 },
        },
        xaxis: compAxis(`vapour mole fraction   y_${comp}`),
        yaxis: {
...darkLayout.yaxis,
          title: { text: `dew temperature   T   [${tUnit}]` },
        },
      },
    };
  }

  // mode === "x-y"  (McCabe-Thiele equilibrium diagram)
  // Curve: y_eq vs x.  Diagonal y = x for reference.  Where the curve
  // crosses the diagonal you have an azeotrope (or a pure component).
  const data: object[] = [
    {
      type: "scatter",
      mode: "lines",
      name: "y = x  (reference)",
      x: [0, 1],
      y: [0, 1],
      line: { color: PLOT_COLORS.axis, width: 1, dash: "dash" },
      hoverinfo: "skip",
    },
    {
      type: "scatter",
      mode: "lines+markers",
      name: `equilibrium curve  y_${comp}(x_${comp})`,
      x: xLiq,
      y: yVap,
      line: { color: PLOT_COLORS.accent, width: 2.5 },
      marker: { size: 5, color: PLOT_COLORS.accent },
      hovertemplate:
        `x_${comp}: %{x:.4f}<br>y_${comp}: %{y:.4f}<extra></extra>`,
    },
  ];
  if (azeo.length > 0) {
    data.push(azeotropeMarker(azeo, "xy"));
  }
  for (const ov of overlays) {
    const m = matchOverlay(ov, comp, "x", "y");
    if (m) data.push(overlayTrace(m, "#ff5252", "circle"));
  }
  return {
    data,
    layout: {
...baseLayout,
      title: {
        text: `x-y equilibrium diagram   ·   ${pair}   ${pLabel}`,
        font: {...darkLayout.font, size: 14 },
      },
      xaxis: compAxis(`liquid mole fraction   x_${comp}`),
      yaxis: {
...darkLayout.xaxis,
        title: { text: `vapour mole fraction   y_${comp}` },
        range: [0, 1],
        autorange: false,
        constrain: "range" as const,
      },
    },
  };
}

/** Build the red azeotrope marker for either a T-axis plot or the x-y
 *  diagram.  In T-y/T-x plots the y coordinate is the temperature (converted
 *  via tConv / labelled tUnit per the Units menu); in x-y the marker sits on
 *  the diagonal at (x_az, y_az = x_az). */
function azeotropeMarker(azeo: { x: number; T: number }[],
  axis: "T" | "xy",
  tConv: (K: number) => number = (K) => K,
  tUnit: string = "K",
): object {
  if (axis === "T") {
    return {
      type: "scatter",
      mode: "markers+text",
      name: "azeotrope",
      x: azeo.map((p) => p.x),
      y: azeo.map((p) => tConv(p.T)),
      text: azeo.map((p) => ` azeotrope T = ${tConv(p.T).toFixed(2)} ${tUnit}`),
      // Below the marker --- keeps the label well inside the [0,1]
      // x-range and below the temperature curve in T-x-y mode.
      textposition: "bottom center",
      marker: {
        size: 12, color: "#ff5252", symbol: "circle",
        line: { color: "#fff", width: 1 },
      },
      textfont: { color: "#ff5252", size: 11 },
      hovertemplate:
        `<b>Azeotrope</b><br>x ≈ y = %{x:.4f}<br>T = %{y:.2f} ${tUnit}<extra></extra>`,
    };
  }
  return {
    type: "scatter",
    mode: "markers+text",
    name: "azeotrope",
    x: azeo.map((p) => p.x),
    y: azeo.map((p) => p.x),
    text: azeo.map((p) => ` azeotrope x = y = ${p.x.toFixed(3)}`),
    // Label below-left of the marker so it stays inside [0,1] for x-y
    // plots where the azeotrope sits near the top-right corner of the
    // unit square.
    textposition: "bottom left",
    marker: {
      size: 12, color: "#ff5252", symbol: "circle",
      line: { color: "#fff", width: 1 },
    },
    textfont: { color: "#ff5252", size: 11 },
    hovertemplate:
      "<b>Azeotrope</b><br>x = y = %{x:.4f}<extra></extra>",
  };
}

function FitHistoryPlot({ parsed }: { parsed: ParsedCsv }) {
  const xIter = column(parsed, 0);
  // chi2 on log y-axis (left); each parameter on the right axis with
  // its own colour.  Drop "lambda" from the params --- it's a Solver
  // internal that confuses the diagnostic.
  const chi2Col = parsed.header.indexOf("chi2");
  const paramCols = parsed.header
.map((h, i) => ({ h, i }))
.filter(({ h, i }) => i > 0 && h !== "chi2" && h !== "lambda");

  const traces: object[] = [
    {
      type: "scatter",
      mode: "lines+markers",
      name: "chi2",
      x: xIter,
      y: column(parsed, chi2Col),
      line: { color: PLOT_COLORS.warm, width: 2 },
      marker: { size: 6 },
      yaxis: "y",
    },
...paramCols.map(({ h, i }, idx) => ({
      type: "scatter",
      mode: "lines+markers",
      name: h,
      x: xIter,
      y: column(parsed, i),
      line: { color: PLOT_COLORS.series[(idx + 1) % PLOT_COLORS.series.length] },
      marker: { size: 4 },
      yaxis: "y2",
    })),
  ];

  return (
    <Plot
      data={traces}
      layout={{
...darkLayout,
        autosize: true,
        xaxis: {...darkLayout.xaxis, title: { text: "iteration" } },
        yaxis: {
...darkLayout.yaxis,
          title: { text: "chi^2" },
          type: "log",
        },
        yaxis2: {
...darkLayout.yaxis,
          title: { text: "parameter value" },
          overlaying: "y",
          side: "right",
          showgrid: false,
        },
        showlegend: true,
        legend: {...darkLayout.legend, orientation: "h", y: -0.18 },
      }}
      config={PLOT_CONFIG}
      style={{ width: "100%", height: "100%" }}
      useResizeHandler
    />
  );
}

// ---------------------------------------------------------------------------
//   Public component
// ---------------------------------------------------------------------------

export function CsvAutoPlot({ csv, filename, overlays, defaultTxyMode, extras, ternaryLabels, txyPartner, txyP, referenceLines, secondaryColumn }: {
  csv: string;
  filename?: string;
  overlays?: ExperimentalOverlay[];
  defaultTxyMode?: TxyMode;
  extras?: { [k: string]: number };
  ternaryLabels?: [string, string, string];
  /** Binary-VLE context the CSV cannot carry: the partner component and the
   *  fixed sweep pressure [Pa] — shown in the T-x-y titles when provided. */
  txyPartner?: string;
  txyP?: number;
  /** Horizontal reference lines for the 1-D scan rendering (e.g. SI = 0
   *  saturation).  Ignored by the other CSV shapes. */
  referenceLines?: ReferenceLine[];
  /** 1-D scan only: render this column on its own right-hand y-axis (dashed)
   *  instead of the shared primary axis — e.g. the scaling scan's pH column,
   *  whose ≈7–9 values would flatten the SI curves.  Ignored elsewhere. */
  secondaryColumn?: string;
}) {
  const parsed = useMemo(() => parseCsv(csv), [csv]);

  // Categorical x (the speciate ops' species tables): every other shape
  // needs a numeric first column -- parseCsv turns species names into NaN,
  // which previously fell through to an EMPTY line plot / heatmap.
  const cat = useMemo(() => detectCategoricalCsv(csv), [csv]);

  const kind = useMemo(() => {
    if (!parsed) return null;
    // Ternary FIRST — its header (x1,x2,x3,region,kind) is unique and would
    // otherwise be swallowed by the generic grid/scan heuristics.
    if (detectTernary(parsed)) return "ternary" as const;
    if (detectFitLog(parsed)) return "fit" as const;
    const vlec = detectVleConsistency(parsed);
    if (vlec) return { tag: "vleConsistency" as const,...vlec };
    const kin = detectKineticsMultiT(parsed);
    if (kin) return { tag: "kineticsMultiT" as const,...kin };
    const arr = detectArrhenius(parsed);
    if (arr) return { tag: "arrhenius" as const,...arr };
    const par = detectParity(parsed);
    if (par) return { tag: "parity" as const,...par };
    // T-x-y must be checked BEFORE the generic 2-D grid heuristic, since
    // a long propertyScan1D with hundreds of rows of (x, T, y) can also
    // satisfy detectGrid2D inadvertently.
    const txy = detectTxy(parsed);
    if (txy) return { tag: "txy" as const,...txy };
    if (detectGrid2D(parsed)) return "grid" as const;
    return "scan" as const;
  }, [parsed]);

  if (!parsed) {
    return (
      <Box p="md">
        <Text c="dimmed">Could not parse '{filename}' as a CSV.</Text>
      </Box>
    );
  }

  if (cat) return <CategoricalBarPlot cat={cat} />;

  if (kind === "ternary") return <TernaryPlot csv={csv} labels={ternaryLabels} />;
  if (kind === "fit") return <FitHistoryPlot parsed={parsed} />;
  if (kind !== null && typeof kind === "object") {
    if (kind.tag === "vleConsistency") {
      return <VleConsistencyPlot parsed={parsed} info={kind} extras={extras} />;
    }
    if (kind.tag === "kineticsMultiT") {
      return <KineticsIsothermsPlot parsed={parsed} info={kind} />;
    }
    if (kind.tag === "arrhenius") {
      return <ArrheniusPlot parsed={parsed} info={kind} />;
    }
    if (kind.tag === "parity") {
      return <ParityPlot parsed={parsed} iExp={kind.iExp} iModel={kind.iModel} />;
    }
    if (kind.tag === "txy") {
      return <TxyPlot parsed={parsed} info={kind} overlays={overlays ?? []} defaultMode={defaultTxyMode}
        partner={txyPartner} P={txyP} />;
    }
  }
  if (kind === "grid") return <ScanHeatmap parsed={parsed} />;
  // SI = log10(IAP/K): the zero line IS the saturation boundary.  The
  // Explorer's scaling kind passes it explicitly (e497a48); case-run plots
  // of the same scalingScan CSVs get it automatically here.
  const refs = referenceLines
    ?? (hasSiColumns(parsed.header) ? SI_SATURATION : undefined);
  // A scalingScan CSV carries a pH column beside the SI columns; same logic
  // as the SI = 0 reference — case-run plots get the right-hand pH axis
  // automatically, the Explorer passes it explicitly.
  const sec = secondaryColumn
    ?? (hasSiColumns(parsed.header) && parsed.header.includes("pH") ? "pH" : undefined);
  return <ScanLinePlot parsed={parsed} referenceLines={refs} secondaryColumn={sec} />;
}

const SI_SATURATION: ReferenceLine[] = [
  { y: 0, label: "saturation — above this line the mineral precipitates" },
];

// ---------------------------------------------------------------------------
//   MultiCsvOverlay: many 1-D scans on one figure
// ---------------------------------------------------------------------------

export interface MultiCsvInput {
  /** Display name for the trace (typically derived from the CSV filename). */
  name: string;
  /** Raw CSV text. */
  text: string;
}

/** Render N compatible 1-D scan CSVs as N coloured traces on one Plot.
 *  "Compatible" means: same first-column header (the X axis), and the
 *  second-column headers either match exactly across files or share a
 *  common prefix.  Use `csvsAreOverlayCompatible` to test before
 *  rendering — otherwise this falls back to plotting just the first CSV
 *  (so it never crashes). */
export function MultiCsvOverlay({ csvs, overlays = [] }: {
  csvs: MultiCsvInput[];
  /** Raw experimental datasets to draw as points ON TOP of the model curves
   *  (the "see, then decide" overlay).  Rendered as red markers on the shared
   *  x-axis; the column matching the model x/y headers is auto-detected. */
  overlays?: ExperimentalOverlay[];
}) {
  const parsed = useMemo(
    () => csvs
      .map((c) => ({ name: c.name, p: parseCsv(c.text) }))
      .filter((q): q is { name: string; p: ParsedCsv } => q.p !== null),
    [csvs],
  );

  if (parsed.length === 0) {
    return <Box p="md"><Text c="dimmed">No CSV data to plot.</Text></Box>;
  }
  if (parsed.length === 1) {
    // Degenerate case: fall back to single-CSV plot
    return <ScanLinePlot parsed={parsed[0]!.p} />;
  }

  return <MultiCsvOverlayInner parsed={parsed} overlays={overlays} />;
}

function MultiCsvOverlayInner({ parsed, overlays }: {
  parsed: { name: string; p: ParsedCsv }[];
  overlays: ExperimentalOverlay[];
}) {
  const [mode, setMode] = useState<"overlay" | "residuals">("overlay");

  const xName = parsed[0]!.p.header[0]!;
  const yNames = parsed.map((q) => q.p.header[1] ?? "value");
  const yAxisName = commonPrefix(yNames) || yNames[0]!;

  // Match each overlay's columns to the model x/y headers (fall back to 0/1).
  const labs = overlays
    .map((ov) => {
      const xi = ov.header.findIndex((h) => h === xName);
      const yi = ov.header.findIndex((h) => h === yAxisName);
      const ax = xi >= 0 ? xi : 0, ay = yi >= 0 ? yi : 1;
      if (ov.rows.length === 0 || ov.header.length <= Math.max(ax, ay)) return null;
      return { name: ov.name, xs: ov.rows.map((r) => r[ax]!), ys: ov.rows.map((r) => r[ay]!) };
    })
    .filter((x): x is { name: string; xs: number[]; ys: number[] } => x !== null);

  const data: object[] = [];
  let yTitle: string;
  let useLogY = false;

  if (mode === "residuals" && labs.length > 0) {
    // residual = lab − model(interpolated at the lab x); zero line for reference.
    const allX = labs.flatMap((l) => l.xs);
    data.push({ type: "scatter", mode: "lines", name: "0", x: [Math.min(...allX), Math.max(...allX)], y: [0, 0],
      line: { color: PLOT_COLORS.axis, width: 1, dash: "dash" }, hoverinfo: "skip" });
    parsed.forEach((q, idx) => {
      const mx = column(q.p, 0), my = column(q.p, 1);
      for (const lab of labs) {
        const resid = lab.xs.map((xq, k) => lab.ys[k]! - interpAt(mx, my, xq));
        data.push({
          type: "scattergl", mode: "markers",
          name: labs.length > 1 ? `${q.name} − ${lab.name}` : q.name,
          x: lab.xs, y: resid,
          marker: { size: 8, color: PLOT_COLORS.series[idx % PLOT_COLORS.series.length] },
          hovertemplate: `${q.name}<br>%{x}<br>residual %{y:.4g}<extra></extra>`,
        });
      }
    });
    yTitle = "residual  (data − model)";
  } else {
    parsed.forEach((q, idx) => {
      data.push({ type: "scattergl", mode: "lines+markers", name: q.name,
        x: column(q.p, 0), y: column(q.p, 1),
        line: { color: PLOT_COLORS.series[idx % PLOT_COLORS.series.length] }, marker: { size: 4 } });
    });
    const allY = parsed.flatMap((q) => column(q.p, 1).filter(Number.isFinite));
    const posY = allY.filter((v) => v > 0);
    useLogY = posY.length === allY.length && posY.length > 0
              && Math.max(...posY) / Math.min(...posY) > 100;
    for (const lab of labs)
      data.push({ type: "scattergl", mode: "markers", name: lab.name + " (lab data)",
        x: lab.xs, y: lab.ys, marker: { size: 9, color: "#ff5252", line: { color: "#7a0c0c", width: 1 } } });
    yTitle = labelWithUnit(yAxisName) + (useLogY ? "   (log)" : "");
  }

  const plot = (
    <Plot
      data={data}
      layout={{
       ...darkLayout, autosize: true,
        xaxis: {...darkLayout.xaxis, title: { text: labelWithUnit(xName) } },
        yaxis: {...darkLayout.yaxis, title: { text: yTitle }, type: useLogY ? ("log" as const) : ("linear" as const) },
        showlegend: true,
      }}
      config={PLOT_CONFIG}
      style={{ width: "100%", height: "100%" }}
      useResizeHandler
    />
  );

  // Only offer the residuals toggle when there is lab data to residual against.
  if (labs.length === 0) return plot;
  return (
    <Box style={{ width: "100%", height: "100%", display: "flex", flexDirection: "column" }}>
      <Group justify="space-between" px="md" py={6} style={{ flex: "0 0 auto" }}>
        <Text size="xs" c="dimmed">View:</Text>
        <SegmentedControl size="xs" value={mode} onChange={(v) => setMode(v as "overlay" | "residuals")}
          data={[{ value: "overlay", label: "overlay" }, { value: "residuals", label: "residuals" }]} />
      </Group>
      <Box style={{ flex: 1, minHeight: 0 }}>{plot}</Box>
    </Box>
  );
}

/** Linear interpolation of (xs, ys) at xq; xs assumed ascending; clamped. */
function interpAt(xs: number[], ys: number[], xq: number): number {
  const n = xs.length;
  if (n === 0) return NaN;
  if (xq <= xs[0]!) return ys[0]!;
  if (xq >= xs[n - 1]!) return ys[n - 1]!;
  for (let i = 1; i < n; i++)
    if (xq <= xs[i]!) {
      const t = (xq - xs[i - 1]!) / (xs[i]! - xs[i - 1]!);
      return ys[i - 1]! + t * (ys[i]! - ys[i - 1]!);
    }
  return ys[n - 1]!;
}

/** The classic ARRHENIUS plot: ln k vs 1/T.  Points = the per-temperature
 *  fitted rate constants; the line is their least-squares fit, whose slope is
 *  -Ea/R.  Ea, k0 and R^2 are recomputed from the points (self-contained) and
 *  annotated -- the student reads the activation energy straight off the slope.
 *  HONESTY: this is a GUI-side linear regression of the plotted points, a
 *  parallel compute path to the canonical fit engine (choupoProps
 *  fitParameters) -- the title labels it as such. */
function ArrheniusPlot({ parsed, info }: {
  parsed: ParsedCsv;
  info: { iInvT: number; iLnk: number };
}) {
  const R = 8.314462618;  // J/(mol·K)
  const xs = column(parsed, info.iInvT).filter(Number.isFinite);
  const ys = column(parsed, info.iLnk).filter(Number.isFinite);
  const n = Math.min(xs.length, ys.length);

  // Least-squares line  ln k = a + b (1/T)   ->  Ea = -b R,  k0 = exp(a).
  let sx = 0, sy = 0, sxx = 0, sxy = 0;
  for (let i = 0; i < n; i++) { sx += xs[i]!; sy += ys[i]!; sxx += xs[i]! * xs[i]!; sxy += xs[i]! * ys[i]!; }
  const den = n * sxx - sx * sx;
  const b = den !== 0 ? (n * sxy - sx * sy) / den : 0;
  const a = (sy - b * sx) / n;
  const meanY = sy / n;
  let ssRes = 0, ssTot = 0;
  for (let i = 0; i < n; i++) { const pred = a + b * xs[i]!; ssRes += (ys[i]! - pred) ** 2; ssTot += (ys[i]! - meanY) ** 2; }
  const R2 = ssTot > 0 ? 1 - ssRes / ssTot : 0;
  const Ea = (-b * R) / 1000;   // kJ/mol
  const k0 = Math.exp(a);

  const xmin = Math.min(...xs), xmax = Math.max(...xs);
  const hasT = parsed.header.findIndex((h) => /^t_?k$/i.test(h));
  const tHover = hasT >= 0 ? column(parsed, hasT) : xs.map((x) => 1 / x);

  const data: object[] = [
    {
      type: "scatter", mode: "lines",
      name: `fit  (slope = -Ea/R)`,
      x: [xmin, xmax], y: [a + b * xmin, a + b * xmax],
      line: { color: PLOT_COLORS.warm, width: 2, dash: "dash" },
      hoverinfo: "skip",
    },
    {
      type: "scatter", mode: "markers",
      name: "fitted k(T)",
      x: xs, y: ys,
      marker: { size: 10, color: PLOT_COLORS.accent, line: { color: "#fff", width: 1 } },
      customdata: tHover,
      hovertemplate: "1/T = %{x:.5f} 1/K<br>ln k = %{y:.3f}<br>T = %{customdata:.1f} K<extra></extra>",
    },
  ];

  return (
    <Plot
      data={data}
      layout={{
       ...darkLayout,
        autosize: true,
        title: {
          text: `Arrhenius plot   ·   GUI linear regression of the plotted points:   Ea = ${Ea.toFixed(1)} kJ/mol   ·   k₀ = ${k0.toExponential(2)}   ·   R² = ${R2.toFixed(4)}`,
          font: {...darkLayout.font, size: 14 },
        },
        xaxis: {...darkLayout.xaxis, title: { text: "1 / T   [1/K]" } },
        yaxis: {...darkLayout.yaxis, title: { text: "ln k" } },
        showlegend: true,
        legend: {...darkLayout.legend, orientation: "h", y: -0.18, x: 0.5, xanchor: "center" },
        margin: {...darkLayout.margin, t: 48, b: 70 },
      }}
      config={PLOT_CONFIG}
      style={{ width: "100%", height: "100%" }}
      useResizeHandler
    />
  );
}

/** True iff every CSV carries the T-x-y trio (x[comp], T_bubble, y_eq_comp)
 *  for the SAME component -- so several models can be overlaid on a binary-VLE
 *  diagram with switchable T-x-y / x-y / T-x / T-y views. */
export function csvsAreTxyCompatible(csvs: MultiCsvInput[]): boolean {
  if (csvs.length < 1) return false;
  let comp: string | null = null;
  for (const c of csvs) {
    const p = parseCsv(c.text);
    if (!p) return false;
    const info = detectTxy(p);
    if (!info) return false;
    if (comp === null) comp = info.comp;
    else if (info.comp !== comp) return false;
  }
  return true;
}

/** Overlay SEVERAL models on one binary-VLE diagram, with the same T-x-y /
 *  x-y / T-x / T-y toggle as the single-model TxyPlot.  In x-y mode this is the
 *  multi-model McCabe-Thiele picture: every model's equilibrium curve y_eq(x)
 *  against the y=x diagonal -- the ideal model has NO azeotrope (its curve
 *  never meets the diagonal in the interior), NRTL / Wilson do.  Each model
 *  must carry the (x[comp], T_bubble, y_eq_comp) trio (csvsAreTxyCompatible). */
export function MultiTxyOverlay({ csvs, overlays = [], defaultMode, partner }: {
  csvs: MultiCsvInput[];
  overlays?: ExperimentalOverlay[];
  defaultMode?: TxyMode;
  partner?: string;
}) {
  const [mode, setMode] = useState<TxyMode>(defaultMode ?? "T-x");
  const models = useMemo(
    () => csvs
      .map((c) => {
        const p = parseCsv(c.text);
        const info = p ? detectTxy(p) : null;
        if (!p || !info) return null;
        const rows: TxyRow[] = p.rows
          .map((r) => ({ x: r[info.iX]!, T: r[info.iTbub]!, y: r[info.iYeq]! }))
          .filter((r) => Number.isFinite(r.x) && Number.isFinite(r.T) && Number.isFinite(r.y))
          .sort((a, b) => a.x - b.x);
        return { name: c.name, comp: info.comp, rows };
      })
      .filter((m): m is { name: string; comp: string; rows: TxyRow[] } => m !== null),
    [csvs],
  );

  const comp = models[0]?.comp ?? "";
  const built = useMemo(
    () => buildMultiTxyPlot(mode, models, comp, overlays, partner),
    [mode, models, comp, overlays, partner],
  );

  if (models.length === 0) {
    return <Box p="md"><Text c="dimmed">No comparable VLE curves to plot.</Text></Box>;
  }
  return (
    <Box style={{ width: "100%", height: "100%", display: "flex", flexDirection: "column" }}>
      <Group justify="space-between" px="md" py={6} style={{ flex: "0 0 auto" }}>
        <Text size="xs" c="dimmed">View:</Text>
        <SegmentedControl
          size="xs" value={mode} onChange={(v) => setMode(v as TxyMode)}
          data={[
            { value: "T-x-y", label: "T-x-y" },
            { value: "x-y",   label: "x-y"   },
            { value: "T-x",   label: "T-x"   },
            { value: "T-y",   label: "T-y"   },
          ]}
        />
      </Group>
      <Box style={{ flex: 1, minHeight: 0 }}>
        <Plot data={built.data} layout={built.layout} config={PLOT_CONFIG}
          style={{ width: "100%", height: "100%" }} useResizeHandler />
      </Box>
    </Box>
  );
}

function buildMultiTxyPlot(
  mode: TxyMode,
  models: { name: string; comp: string; rows: TxyRow[] }[],
  comp: string,
  overlays: ExperimentalOverlay[],
  partner?: string,
): { data: object[]; layout: object } {
  const pair = comp + (partner ? ` / ${partner}` : "");
  const color = (i: number) => PLOT_COLORS.series[i % PLOT_COLORS.series.length]!;
  const baseLayout = {
   ...darkLayout,
    autosize: true,
    legend: {...darkLayout.legend, orientation: "h", y: -0.18, x: 0.5, xanchor: "center" },
    margin: {...darkLayout.margin, t: 48, b: 80 },
  };
  const compAxis = (title: string) => ({
   ...darkLayout.xaxis, title: { text: title }, range: [0, 1],
    autorange: false, constrain: "range" as const,
  });
  const data: object[] = [];

  if (mode === "x-y") {
    // y = x diagonal (shared reference) + each model's equilibrium curve.
    data.push({
      type: "scatter", mode: "lines", name: "y = x  (reference)",
      x: [0, 1], y: [0, 1],
      line: { color: PLOT_COLORS.axis, width: 1, dash: "dash" }, hoverinfo: "skip",
    });
    models.forEach((m, i) => {
      data.push({
        type: "scatter", mode: "lines", name: m.name,
        x: m.rows.map((r) => r.x), y: m.rows.map((r) => r.y),
        line: { color: color(i), width: 2.5 },
        hovertemplate: `${m.name}<br>x_${comp}: %{x:.4f}<br>y_${comp}: %{y:.4f}<extra></extra>`,
      });
      // azeotrope: interior crossing of the diagonal.
      const az = m.rows.find((r) => r.x > 0.05 && r.x < 0.95 && Math.abs(r.x - r.y) < 0.01);
      if (az) data.push({
        type: "scatter", mode: "markers", name: `azeotrope · ${m.name}`,
        x: [az.x], y: [az.y], showlegend: false,
        marker: { size: 9, color: color(i), symbol: "diamond", line: { color: "#fff", width: 1 } },
        hovertemplate: `azeotrope (${m.name})<br>x = y = %{x:.3f}<extra></extra>`,
      });
    });
    // Lab data (x, y) -- shows ONLY when the dataset carries measured y, so the
    // student can judge which model passes through the points in the McCabe view.
    for (const ov of overlays) {
      const m = matchOverlay(ov, comp, "x", "y");
      if (m) data.push(overlayTrace(m, "#ff5252", "circle", `exp · ${ov.name}`) as object);
    }
    return {
      data,
      layout: {
       ...baseLayout,
        title: { text: `x-y equilibrium diagram   ·   ${pair}   at constant P`,
          font: {...darkLayout.font, size: 14 } },
        xaxis: compAxis(`liquid mole fraction   x_${comp}`),
        yaxis: {...darkLayout.xaxis, title: { text: `vapour mole fraction   y_${comp}` },
          range: [0, 1], autorange: false, constrain: "range" as const },
      },
    };
  }

  // Temperature-axis modes: T-x (bubble), T-y (dew), T-x-y (both).
  models.forEach((m, i) => {
    if (mode === "T-x" || mode === "T-x-y")
      data.push({
        type: "scatter", mode: "lines", name: mode === "T-x-y" ? `${m.name} · bubble` : m.name,
        x: m.rows.map((r) => r.x), y: m.rows.map((r) => r.T),
        line: { color: color(i), width: 2.5 },
        hovertemplate: `${m.name}<br>x_${comp}: %{x:.4f}<br>T: %{y:.2f} K<extra></extra>`,
      });
    if (mode === "T-y" || mode === "T-x-y")
      data.push({
        type: "scatter", mode: "lines", name: mode === "T-x-y" ? `${m.name} · dew` : m.name,
        x: m.rows.map((r) => r.y), y: m.rows.map((r) => r.T),
        line: { color: color(i), width: 2.5, dash: mode === "T-x-y" ? "dot" : "solid" },
        hovertemplate: `${m.name}<br>y_${comp}: %{x:.4f}<br>T: %{y:.2f} K<extra></extra>`,
      });
  });
  // Lab data (bubble side has x,T; dew side y,T -- this dataset has only x,T).
  for (const ov of overlays) {
    if (mode === "T-x" || mode === "T-x-y") {
      const b = matchOverlay(ov, comp, "x", "T");
      if (b) data.push(overlayTrace(b, "#ff5252", "circle", `exp · ${ov.name}`) as object);
    }
    if (mode === "T-y" || mode === "T-x-y") {
      const d = matchOverlay(ov, comp, "y", "T");
      // Filled when dew is the only series (T-y); open ONLY in T-x-y, where it
      // must be told apart from the filled bubble points.
      if (d) data.push(overlayTrace(d, "#ff5252", mode === "T-x-y" ? "circle-open" : "circle",
                                    mode === "T-x-y" ? `exp dew · ${ov.name}` : `exp · ${ov.name}`) as object);
    }
  }
  const horiz = mode === "T-y" ? `vapour mole fraction   y_${comp}` : `liquid mole fraction   x_${comp}`;
  return {
    data,
    layout: {
     ...baseLayout,
      title: { text: `${mode}   ·   ${pair}   (models overlaid)`,
        font: {...darkLayout.font, size: 14 } },
      xaxis: compAxis(horiz),
      yaxis: {...darkLayout.yaxis, title: { text: "temperature   T   [K]" } },
    },
  };
}

/** True iff every CSV in `csvs` can be safely overlaid: each parses
 *  cleanly, has at least 2 columns, all share the same first-column
 *  header (the X axis), and each has exactly 2 columns (single Y).
 *  Stricter than necessary on purpose — multi-Y per file is reserved
 *  for the single-CSV ScanLinePlot path. */
export function csvsAreOverlayCompatible(csvs: MultiCsvInput[]): boolean {
  if (csvs.length < 2) return false;
  let xName: string | null = null;
  for (const c of csvs) {
    const p = parseCsv(c.text);
    if (!p || p.header.length !== 2 || p.rows.length === 0) return false;
    if (xName === null) xName = p.header[0]!;
    else if (p.header[0] !== xName) return false;
  }
  return true;
}
