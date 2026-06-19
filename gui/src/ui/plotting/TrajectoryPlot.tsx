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
\*---------------------------------------------------------------------------*/

import type { TrajectoryData } from "../../adapters/SolverAdapter.js";
import { Plot, PLOT_COLORS, PLOT_CONFIG, darkLayout } from "./plotly.js";

type Side = "left" | "right";

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

export function TrajectoryPlot({ data }: { data: TrajectoryData }) {
  const names = Object.keys(data.vars);
  const tracesLeft: ReturnType<typeof makeTrace>[] = [];
  const tracesRight: ReturnType<typeof makeTrace>[] = [];

  names.forEach((name, idx) => {
    const ys = data.vars[name]!;
    const side = classify(name, ys);
    const color = PLOT_COLORS.series[idx % PLOT_COLORS.series.length]!;
    const trace = makeTrace(name, data.t, ys, color, side);
    (side === "left" ? tracesLeft : tracesRight).push(trace);
  });

  const hasRight = tracesRight.length > 0;
  const traces = [...tracesLeft,...tracesRight];

  return (
    <Plot
      data={traces}
      layout={{
...darkLayout,
        title: { text: "Trajectory", font: {...darkLayout.font, size: 14 } },
        xaxis: {...darkLayout.xaxis, title: { text: "t [s]" } },
        yaxis: {
...darkLayout.yaxis,
          title: { text: "moles [kmol]" },
        },
        yaxis2: hasRight
          ? {
              title: {
                text: "T [K]",
                font: { color: "rgba(255,255,255,0.75)" },
              },
              overlaying: "y",
              side: "right",
              gridcolor: "rgba(255,255,255,0.04)",
              zerolinecolor: "rgba(255,255,255,0.10)",
              tickfont: { color: "rgba(255,255,255,0.75)" },
            }
        : undefined,
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
