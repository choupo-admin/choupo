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

    SPDX-License-Identifier: GPL-3.0-or-later

    Credit and attribution: see AUTHORS
    Required legal notices:  see NOTICE
\*---------------------------------------------------------------------------*/

/*---------------------------------------------------------------------------*\
  The two-knob CONTOUR for the What-if: a filled heatmap + iso-lines of the
  watched KPI over the two swept knobs (e.g. the flash V/F envelope over T x P).
  Non-finite cells (a non-converged grid point) render as honest GAPS --
  `connectgaps:false` so Plotly never interpolates across a hole.  A "you are
  here" ring marks the case's current operating point.
\*---------------------------------------------------------------------------*/

import { Plot, PLOT_CONFIG, PLOT_COLORS, darkLayout } from "./plotly.js";
import type { GridData } from "../../case/sweepSynth.js";

export function GridContourPlot({
  grid,
  here,
}: {
  grid: GridData;
  here?: { a: number; b: number };
}) {
  const data: unknown[] = [
    {
      type: "contour",
      x: grid.aVals,
      y: grid.bVals,
      z: grid.z,
      connectgaps: false,            // honest holes -- never interpolate over NaN
      colorscale: "Viridis",
      contours: { coloring: "heatmap", showlines: true },
      line: { color: "rgba(255,255,255,0.4)", width: 1 },
      colorbar: { title: { text: grid.zLabel, side: "right" }, thickness: 12 },
      hovertemplate: `${grid.aLabel}=%{x:.4g}<br>${grid.bLabel}=%{y:.4g}<br>${grid.zLabel}=%{z:.4g}<extra></extra>`,
    },
  ];
  if (here && Number.isFinite(here.a) && Number.isFinite(here.b)) {
    data.push({
      type: "scatter",
      mode: "markers",
      x: [here.a],
      y: [here.b],
      marker: { size: 14, color: "#ffffff", symbol: "circle-open", line: { width: 2.5, color: "#ffffff" } },
      name: "you are here",
      hovertemplate: `you are here<br>${grid.aLabel}=%{x:.4g}<br>${grid.bLabel}=%{y:.4g}<extra></extra>`,
    });
  }
  const layout = {
    ...darkLayout,
    xaxis: { title: { text: grid.aLabel }, gridcolor: PLOT_COLORS.grid },
    yaxis: { title: { text: grid.bLabel }, gridcolor: PLOT_COLORS.grid },
    showlegend: false,
  };
  return (
    <Plot
      data={data}
      layout={layout}
      config={PLOT_CONFIG}
      style={{ width: "100%", height: "100%" }}
      useResizeHandler
    />
  );
}
