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
  Grouped bar chart of mole fractions per stream.  One group per
  component, one bar colour per stream.  Stacked-by-component layout
  reads naturally for low-cardinality cases (binary, ternary).
\*---------------------------------------------------------------------------*/

import type { StreamResult } from "../../adapters/SolverAdapter.js";
import { Plot, PLOT_COLORS, PLOT_CONFIG, darkLayout } from "./plotly.js";

export function CompositionPlot({ streams }: { streams: StreamResult[] }) {
  const componentSet = new Set<string>();
  for (const s of streams) for (const c of Object.keys(s.composition)) componentSet.add(c);
  const components = [...componentSet];

  const data = streams.map((s, i) => ({
    type: "bar" as const,
    name: s.name,
    x: components,
    y: components.map((c) => s.composition[c] ?? 0),
    marker: { color: PLOT_COLORS.series[i % PLOT_COLORS.series.length] },
    hovertemplate: "<b>%{x}</b><br>%{y:.4f}<extra>" + s.name + "</extra>",
  }));

  return (
    <Plot
      data={data}
      layout={{
...darkLayout,
        title: { text: "Stream compositions", font: {...darkLayout.font, size: 14 } },
        barmode: "group",
        bargap: 0.25,
        bargroupgap: 0.08,
        xaxis: {...darkLayout.xaxis, title: { text: "Component" } },
        yaxis: {...darkLayout.yaxis, title: { text: "Mole fraction" }, range: [0, 1] },
      }}
      config={PLOT_CONFIG}
      style={{ width: "100%", height: "100%" }}
      useResizeHandler
    />
  );
}
