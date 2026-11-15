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
  PxyPlot — the binary boiling envelope at FIXED T (the P-x-y diagram), the
  mirror of the T-x-y.

  Draws the engine's CSV `x[<c1>],P_bubble,y_eqT_<c1>` (case/methodFeeds.ts
  binaryPxySpec): the bubble curve is P_bubble against x, the dew curve the
  SAME pressures against y -- the incipient vapour the engine iterated at each
  bubble pressure.  The two-phase lens between them is shaded.  The liquid
  lies ABOVE the bubble curve here (pressure squeezes the vapour out), the
  opposite of the T-x-y, and the axis title says which side is which.

  NO physics: every point is the engine's (BubblePoint::pressure through
  src/propertyOps/PropertyEvaluator.cpp); the rows are sorted and drawn.
\*---------------------------------------------------------------------------*/

import { Plot, PLOT_COLORS, PLOT_CONFIG, darkLayout } from "./plotly.js";
import { useStore } from "../../state/store.js";
import { kToDisplay, paToDisplay } from "../../state/displayUnits.js";
import { readPxyCsv } from "../../case/methodFeeds.js";

export function PxyPlot({ csv, partner, T }: {
  csv: string;
  /** The second component of the pair (for the title). */
  partner?: string;
  /** The fixed temperature of the sweep [K] (for the title). */
  T: number;
}) {
  const prefs = useStore((s) => s.displayPrefs);
  const pU = prefs.pressure;
  const tU = prefs.temperature === "degC" ? "°C" : "K";
  const pC = (Pa: number) => paToDisplay(Pa, prefs.pressure);
  const read = readPxyCsv(csv);
  if (!read || read.rows.length === 0) return null;
  const { comp, rows } = read;
  const P = rows.map((r) => pC(r.P));
  const bubble = {
    type: "scatter" as const, mode: "lines+markers" as const,
    name: `bubble  (liquid · x_${comp})`,
    x: rows.map((r) => r.x), y: P,
    line: { color: PLOT_COLORS.accent, width: 2.5 }, marker: { size: 5, color: PLOT_COLORS.accent },
    hovertemplate: `x_${comp}: %{x:.4f}<br>P_bubble: %{y:.4g} ${pU}<extra></extra>`,
  };
  const dew = {
    type: "scatter" as const, mode: "lines+markers" as const,
    name: `dew  (vapour · y_${comp})`,
    x: rows.map((r) => r.y), y: P,
    line: { color: PLOT_COLORS.warm, width: 2.5 }, marker: { size: 5, color: PLOT_COLORS.warm },
    fill: "tonexty" as const, fillcolor: "rgba(255, 183, 77, 0.10)",
    hovertemplate: `y_${comp}: %{x:.4f}<br>P_dew: %{y:.4g} ${pU}<extra></extra>`,
  };
  const pair = partner ? `${comp} / ${partner}` : comp;
  return (
    <Plot
      data={[bubble, dew]}
      layout={{
        ...darkLayout,
        autosize: true,
        title: { text: `P-x-y diagram   ·   ${pair}   at ${kToDisplay(T, prefs.temperature).toFixed(1)} ${tU}`,
          font: { ...darkLayout.font, size: 14 } },
        xaxis: { ...darkLayout.xaxis, title: { text: `mole fraction   x_${comp} (liquid), y_${comp} (vapour)` },
          range: [0, 1], autorange: false },
        yaxis: { ...darkLayout.yaxis, title: { text: `pressure   P   [${pU}]   (liquid above, vapour below)` } },
        legend: { ...darkLayout.legend, orientation: "h", y: -0.18, x: 0.5, xanchor: "center" },
        margin: { ...darkLayout.margin, t: 48, b: 80 },
      }}
      config={PLOT_CONFIG}
      style={{ width: "100%", height: "100%" }}
      useResizeHandler
    />
  );
}
