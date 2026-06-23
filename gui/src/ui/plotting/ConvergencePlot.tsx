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
  Convergence plot.  Residual vs iteration on a semi-log y axis -- one
  curve per loop (e.g. reactor Newton, separator Wegstein).  Classic
  diagnostic that students should read before trusting a result.
\*---------------------------------------------------------------------------*/

import type { ConvergenceCurve } from "../../adapters/SolverAdapter.js";
import { Plot, PLOT_COLORS, PLOT_CONFIG, darkLayout } from "./plotly.js";

// Engine default recycle tolerance (`recycleTol` in the solver).  Drawn as a
// reference line so the global mass/energy curves can be read against it.
const DEFAULT_RECYCLE_TOL = 1e-5;

export function ConvergencePlot({
  curves,
  tolerance = DEFAULT_RECYCLE_TOL,
}: {
  curves: ConvergenceCurve[];
  tolerance?: number;
}) {
  const data = curves.map((c, i) => ({
    type: "scatter" as const,
    mode: "lines+markers" as const,
    name: c.label,
    x: c.residuals.map((_, k) => k + 1),
    y: c.residuals,
    line: { color: PLOT_COLORS.series[i % PLOT_COLORS.series.length], width: 2 },
    marker: { size: 7 },
    hovertemplate: "iter %{x}<br>r = %{y:.2e}<extra>" + c.label + "</extra>",
  }));

  // Longest curve sets the x-extent the tolerance line spans.
  const maxIter = curves.reduce((m, c) => Math.max(m, c.residuals.length), 0);
  const showTol = tolerance > 0 && maxIter > 0;

  return (
    <Plot
      data={data}
      layout={{
...darkLayout,
        title: { text: "Convergence", font: {...darkLayout.font, size: 14 } },
        xaxis: {...darkLayout.xaxis, title: { text: "Iteration" }, dtick: 1 },
        yaxis: {
...darkLayout.yaxis,
          title: { text: "Residual" },
          type: "log",
          exponentformat: "power",
        },
        legend: {...darkLayout.legend, x: 0.98, y: 0.98, xanchor: "right" },
        shapes: showTol
          ? [
              {
                type: "line" as const,
                xref: "x" as const,
                yref: "y" as const,
                x0: 1,
                x1: maxIter,
                y0: tolerance,
                y1: tolerance,
                line: { color: PLOT_COLORS.grid, width: 1, dash: "dash" as const },
              },
            ]
          : [],
        annotations: showTol
          ? [
              {
                xref: "paper" as const,
                yref: "y" as const,
                x: 0.02,
                y: tolerance,
                xanchor: "left" as const,
                yanchor: "bottom" as const,
                text: `tol ${tolerance.toExponential(0)}`,
                showarrow: false,
                font: {...darkLayout.font, size: 10, color: PLOT_COLORS.grid },
              },
            ]
          : [],
      }}
      config={PLOT_CONFIG}
      style={{ width: "100%", height: "100%" }}
      useResizeHandler
    />
  );
}
