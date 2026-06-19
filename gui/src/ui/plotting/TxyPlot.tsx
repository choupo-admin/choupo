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
  T-x-y diagram.  Two curves -- bubble (liquid) + dew (vapour) -- at
  constant P, drawn on the same axes.  Standard pedagogical view for a
  binary VLE.  Markers on top so the azeotrope is easy to spot.
\*---------------------------------------------------------------------------*/

import type { TxyData } from "../../adapters/SolverAdapter.js";
import { Plot, PLOT_COLORS, PLOT_CONFIG, darkLayout } from "./plotly.js";
import { useStore } from "../../state/store.js";
import { formatSig, kToDisplay, paToDisplay } from "../../state/displayUnits.js";

export function TxyPlot({ txy }: { txy: TxyData }) {
  const [c1, c2] = txy.components;
  // Axes obey the global Units menu (T in K/°C, P in the chosen unit).
  const prefs = useStore((s) => s.displayPrefs);
  const tUnit = prefs.temperature === "degC" ? "°C" : "K";
  const tConv = (K: number) => kToDisplay(K, prefs.temperature);

  const traces = [
    {
      type: "scatter" as const,
      mode: "lines+markers" as const,
      name: "bubble (liquid)",
      x: txy.xBubble,
      y: txy.Tbubble.map(tConv),
      line: { color: PLOT_COLORS.accent, width: 2 },
      marker: { color: PLOT_COLORS.accent, size: 6 },
      hovertemplate: `x(${c1})=%{x:.3f}<br>T=%{y:.2f} ${tUnit}<extra>bubble</extra>`,
    },
    {
      type: "scatter" as const,
      mode: "lines+markers" as const,
      name: "dew (vapour)",
      x: txy.yDew,
      y: txy.Tdew.map(tConv),
      line: { color: PLOT_COLORS.warm, width: 2, dash: "dash" as const },
      marker: { color: PLOT_COLORS.warm, size: 6, symbol: "diamond" as const },
      hovertemplate: `y(${c1})=%{x:.3f}<br>T=%{y:.2f} ${tUnit}<extra>dew</extra>`,
    },
  ];

  return (
    <Plot
      data={traces}
      layout={{
...darkLayout,
        title: {
          text: `T-x-y  ·  ${c1} / ${c2}  ·  P = ${formatSig(paToDisplay(txy.P, prefs.pressure))} ${prefs.pressure}`,
          font: {...darkLayout.font, size: 14 },
        },
        xaxis: {
...darkLayout.xaxis,
          title: { text: `x, y of ${c1}` },
          range: [0, 1],
        },
        yaxis: {
...darkLayout.yaxis,
          title: { text: `T (${tUnit})` },
        },
        legend: {...darkLayout.legend, x: 0.02, y: 0.98 },
      }}
      config={PLOT_CONFIG}
      style={{ width: "100%", height: "100%" }}
      useResizeHandler
    />
  );
}
