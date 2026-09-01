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
  THE ENTHALPY-CONCENTRATION DIAGRAM, drawn.  Curves and ties come from the
  engine; the difference point and its rays come from case/ponchonSavarit.ts.
  This file draws and computes nothing.
\*---------------------------------------------------------------------------*/

import { Plot, PLOT_CONFIG, PLOT_COLORS, darkLayout } from "./plotly.js";
import { deltaD, leverLV, hAt, vapourEnthalpyAt }
  from "../../case/ponchonSavarit.js";
import type { HxyRow } from "../../case/ponchonSavarit.js";

export function PonchonPlot({ rows, xD, R, showTies }: {
  rows: readonly HxyRow[];
  xD: number;
  R: number;
  showTies: boolean;
}): JSX.Element {
  const kJ = (v: number) => v / 1000;
  const dD = deltaD(rows, xD, R);

  const data: unknown[] = [
    {
      x: rows.map((r) => r.x1), y: rows.map((r) => kJ(r.h)),
      type: "scatter", mode: "lines", name: "saturated liquid  h(x)",
      line: { color: PLOT_COLORS.accent, width: 2 },
    },
    {
      x: rows.map((r) => r.y1), y: rows.map((r) => kJ(r.H)),
      type: "scatter", mode: "lines", name: "saturated vapour  H(y)",
      line: { color: PLOT_COLORS.warm, width: 2 },
    },
  ];

  //  TIE LINES: every row carries BOTH ends, so each is one segment and
  //  nothing is paired by index.  Drawn as a single trace with nulls between
  //  segments -- one legend entry, not sixty.
  if (showTies) {
    const tx: (number | null)[] = [];
    const ty: (number | null)[] = [];
    for (const r of rows) {
      tx.push(r.x1, r.y1, null);
      ty.push(kJ(r.h), kJ(r.H), null);
    }
    data.push({
      x: tx, y: ty, type: "scatter", mode: "lines",
      name: "equilibrium ties", line: { color: PLOT_COLORS.axis, width: 1 },
      hoverinfo: "skip",
    });
  }

  //  THE DIFFERENCE POINT and one ray through the top tray.  The ray is the
  //  construction's whole content: it passes through the difference point,
  //  the distillate liquid at x_D and the top vapour at y_1 = x_D (a TOTAL
  //  condenser condenses it entirely, so it shares the distillate's
  //  composition and is NOT the vapour in equilibrium with it).
  if (dD) {
    const hD = hAt(rows, xD);
    const H1 = vapourEnthalpyAt(rows, xD);
    data.push({
      x: [dD.x], y: [kJ(dD.y)], type: "scatter", mode: "markers+text",
      name: "Δ_D  (difference point)", text: ["Δ_D"], textposition: "top center",
      marker: { color: PLOT_COLORS.series[5], size: 11, symbol: "diamond" },
    });
    if (hD !== null && H1 !== null) {
      data.push({
        x: [dD.x, xD, xD], y: [kJ(dD.y), kJ(H1), kJ(hD)],
        type: "scatter", mode: "lines", name: "ray through the top tray",
        line: { color: PLOT_COLORS.series[5], width: 1.5, dash: "dot" },
      });
    }
  }

  return (
    <Plot
      data={data as never}
      layout={{
        ...darkLayout,
        autosize: true,
        title: { text: "Enthalpy–concentration (Ponchon–Savarit)",
                 font: { size: 13 } },
        showlegend: true,
        legend: { x: 0.02, y: 0.98, xanchor: "left", yanchor: "top",
                  font: { size: 10 } },
        margin: { l: 62, r: 16, t: 34, b: 46 },
        xaxis: { ...darkLayout.xaxis, title: { text: "mole fraction  x, y" },
                 range: [0, 1] },
        yaxis: { ...darkLayout.yaxis,
                 title: { text: "molar enthalpy  [kJ/mol]" } },
      } as never}
      config={PLOT_CONFIG as never}
      style={{ width: "100%", height: "100%" }}
      useResizeHandler
    />
  );
}

export { leverLV };
