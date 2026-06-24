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
  TrajectoryPlot --- time-series for dynamic cases (choupoBatch /
  choupoCtrl).  Reads `result.trajectory` and lays out the traces on
  two y-axes:

      Left axis (y1):    moles n_i   [kmol]
      Right axis (y2):   temperatures (reactor T, controller PV/MV/SP) [K]

  The axis assignment is heuristic: any variable whose name starts
  with "n_" or whose values stay below 10 (kmol-ish range) goes on
  the left; everything else on the right.  Pedagogically this matches
  the common reactor case where one wants to see composition AND
  temperature evolve on the same time axis.

  When the trajectory has no temperature-class variable, the right
  axis is omitted and all traces go on the left.

  Optional ADDITIVE props (all default to empty -> every existing
  caller renders byte-identically) let a richer surface — the Control
  Room's ClosedLoopPlot — compose this same renderer:

      referenceLines  horizontal dashed lines (a setpoint)
      eventMarkers    vertical dotted lines + annotations (disturbances)
      band            a shaded ±half horizontal band (settling envelope)
      ghost           faded previous-run traces drawn UNDER the live ones
      filterVars      keep only these trajectory columns (drop the rest)
      mvVars          force these columns onto the right (T/MV) axis
      title           override the "Trajectory" header
\*---------------------------------------------------------------------------*/

import type { TrajectoryData } from "../../adapters/SolverAdapter.js";
import { Plot, PLOT_COLORS, PLOT_CONFIG, darkLayout } from "./plotly.js";

type Side = "left" | "right";

/** A horizontal reference line (e.g. the controller setpoint). */
export interface ReferenceLine {
  y: number;
  label?: string;
  color?: string;
  dashed?: boolean;
}
/** A vertical event marker (e.g. a disturbance step). */
export interface EventMarker {
  x: number;
  label?: string;
  color?: string;
}
/** A shaded horizontal band centred on `y` of half-width `half` (±band). */
export interface PlotBand {
  y: number;
  half: number;
  label?: string;
  color?: string;
}
/** A faded previous-run trace drawn under the live ones. */
export interface GhostTrace {
  name: string;
  t: number[];
  y: number[];
  side?: Side;
  color?: string;
  opacity?: number;
}

export interface TrajectoryPlotProps {
  data: TrajectoryData;
  referenceLines?: ReferenceLine[];
  eventMarkers?: EventMarker[];
  band?: PlotBand;
  ghost?: GhostTrace[];
  /** Keep only these columns (others dropped).  Empty/undefined => keep all. */
  filterVars?: string[];
  /** Force these columns onto the right (T/MV) axis. */
  mvVars?: string[];
  /** Force these columns onto the LEFT axis (e.g. the jacket MV — kept off the
   *  reactor-T axis so its saturation spike to 420 K doesn't squash the PV into
   *  the lower third).  Pairs with leftTitle to relabel the axis. */
  lvVars?: string[];
  /** Axis-title overrides (defaults: left "moles [kmol]", right "T [K]"). */
  leftTitle?: string;
  rightTitle?: string;
  /** Display-only trace renames (column key -> legend label).  Additive: an
   *  unlisted column keeps its raw name.  Lets the Control Room relabel the
   *  schedule controller's MV column as the inlet-T disturbance it really is. */
  renameVars?: { [col: string]: string };
  title?: string;
}

function classify(name: string, values: number[]): Side {
  // Mole numbers and concentrations stay on the left (small magnitudes).
  if (/^n_|\.n_|n_total/.test(name)) return "left";
  // Anything with "T" or controller-channel suffixes (SP, PV, MV) is K.
  if (/(\.|^)T($|_)/.test(name)) return "right";
  if (/\.(SP|PV|MV)$/.test(name)) return "right";
  // Fallback: large magnitudes → right axis (temperatures, fluxes), else left.
  const m = values.reduce((a, v) => Math.max(a, Math.abs(v)), 0);
  return m > 10 ? "right" : "left";
}

export function TrajectoryPlot(props: TrajectoryPlotProps) {
  const { data, referenceLines, eventMarkers, band, ghost, filterVars, mvVars, lvVars,
    leftTitle, rightTitle, renameVars, title } = props;
  const names = Object.keys(data.vars).filter(
    (n) => !filterVars || filterVars.length === 0 || filterVars.includes(n),
  );
  const forceRight = new Set(mvVars ?? []);
  const forceLeft = new Set(lvVars ?? []);
  const tracesLeft: ReturnType<typeof makeTrace>[] = [];
  const tracesRight: ReturnType<typeof makeTrace>[] = [];

  names.forEach((name, idx) => {
    const ys = data.vars[name]!;
    const side: Side = forceLeft.has(name) ? "left"
      : forceRight.has(name) ? "right" : classify(name, ys);
    const color = PLOT_COLORS.series[idx % PLOT_COLORS.series.length]!;
    const label = renameVars?.[name] ?? name;
    const trace = makeTrace(label, data.t, ys, color, side);
    (side === "left" ? tracesLeft : tracesRight).push(trace);
  });

  // Ghost traces (a previous run) ride UNDER the live ones, faded.
  const ghostTraces = (ghost ?? []).map((g) => makeGhost(g));

  const hasRight = tracesRight.length > 0 || (ghost ?? []).some((g) => g.side === "right");
  // The live + ghost traces, ghosts first so they paint underneath.
  const traces = [...ghostTraces, ...tracesLeft, ...tracesRight];

  // ±band as a filled horizontal ribbon on the RIGHT (T) axis when present,
  // else the left — drawn as two stacked traces (lower transparent, upper
  // filled to it).  Origin of x is the data's time span.
  const t0 = data.t[0] ?? 0;
  const t1 = data.t[data.t.length - 1] ?? 1;
  const bandAxis: "y" | "y2" = hasRight ? "y2" : "y";
  const bandTraces = band ? bandRibbon(band, t0, t1, bandAxis) : [];

  // Setpoint / reference lines + disturbance markers as Plotly SHAPES (not data
  // traces) so they never enter the legend or the autoscale of the series.
  const shapes = [
    ...(referenceLines ?? []).map((r) => ({
      type: "line" as const,
      xref: "paper" as const,
      x0: 0, x1: 1,
      yref: hasRight ? ("y2" as const) : ("y" as const),
      y0: r.y, y1: r.y,
      line: { color: r.color ?? PLOT_COLORS.accent2, width: 1.5, dash: r.dashed === false ? "solid" : "dash" },
      layer: "below" as const,
    })),
    ...(eventMarkers ?? []).map((m) => ({
      type: "line" as const,
      yref: "paper" as const,
      y0: 0, y1: 1,
      xref: "x" as const,
      x0: m.x, x1: m.x,
      line: { color: m.color ?? PLOT_COLORS.axis, width: 1, dash: "dot" as const },
      layer: "below" as const,
    })),
  ];

  const annotations = [
    ...(referenceLines ?? [])
      .filter((r) => r.label)
      .map((r) => ({
        xref: "paper" as const, x: 0.99, xanchor: "right" as const,
        yref: hasRight ? ("y2" as const) : ("y" as const), y: r.y, yanchor: "bottom" as const,
        text: r.label!, showarrow: false,
        font: { ...darkLayout.font, size: 10, color: r.color ?? PLOT_COLORS.accent2 },
      })),
    ...(eventMarkers ?? [])
      .filter((m) => m.label)
      .map((m) => ({
        xref: "x" as const, x: m.x, xanchor: "left" as const,
        yref: "paper" as const, y: 0.02, yanchor: "bottom" as const,
        text: m.label!, showarrow: false,
        font: { ...darkLayout.font, size: 10, color: m.color ?? PLOT_COLORS.axis },
      })),
  ];

  return (
    <Plot
      data={[...bandTraces, ...traces]}
      layout={{
...darkLayout,
        title: { text: title ?? "Trajectory", font: {...darkLayout.font, size: 14 } },
        xaxis: {...darkLayout.xaxis, title: { text: "t [s]" } },
        yaxis: {
...darkLayout.yaxis,
          title: { text: leftTitle ?? "moles [kmol]" },
        },
        yaxis2: hasRight
          ? {
              title: {
                text: rightTitle ?? "T [K]",
                font: { color: "rgba(255,255,255,0.75)" },
              },
              overlaying: "y",
              side: "right",
              gridcolor: "rgba(255,255,255,0.04)",
              zerolinecolor: "rgba(255,255,255,0.10)",
              tickfont: { color: "rgba(255,255,255,0.75)" },
            }
        : undefined,
        shapes,
        annotations,
        legend: {...darkLayout.legend, x: 0.02, y: 0.98 },
      }}
      config={PLOT_CONFIG}
      style={{ width: "100%", height: "100%" }}
      useResizeHandler
    />
  );
}

function makeTrace(name: string,
  t: number[],
  y: number[],
  color: string,
  side: Side,
) {
  return {
    type: "scatter" as const,
    mode: "lines" as const,
    name,
    x: t,
    y,
    yaxis: side === "right" ? ("y2" as const) : ("y" as const),
    line: { color, width: 2 },
    hovertemplate: `${name}<br>t = %{x:.1f} s<br>y = %{y:.4g}<extra></extra>`,
  };
}

function makeGhost(g: GhostTrace) {
  return {
    type: "scatter" as const,
    mode: "lines" as const,
    name: g.name,
    x: g.t,
    y: g.y,
    yaxis: g.side === "right" ? ("y2" as const) : ("y" as const),
    line: { color: g.color ?? PLOT_COLORS.axis, width: 1.5, dash: "solid" as const },
    opacity: g.opacity ?? 0.35,
    hoverinfo: "skip" as const,
  };
}

/** A shaded ±half ribbon centred on band.y: a transparent lower trace then an
 *  upper trace that fills down to it (Plotly `fill: "tonexty"`). */
function bandRibbon(band: PlotBand, t0: number, t1: number, axis: "y" | "y2") {
  const x = [t0, t1];
  const lower = band.y - band.half;
  const upper = band.y + band.half;
  const color = band.color ?? "rgba(38,198,218,0.10)";
  return [
    {
      type: "scatter" as const, mode: "lines" as const,
      x, y: [lower, lower], yaxis: axis,
      line: { width: 0 }, hoverinfo: "skip" as const, showlegend: false,
    },
    {
      type: "scatter" as const, mode: "lines" as const,
      name: band.label ?? "band",
      x, y: [upper, upper], yaxis: axis,
      line: { width: 0 }, fill: "tonexty" as const, fillcolor: color,
      hoverinfo: "skip" as const, showlegend: false,
    },
  ];
}
