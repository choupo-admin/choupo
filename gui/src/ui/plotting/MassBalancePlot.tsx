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
  MassBalancePlot -- plant-wide stacked bar of INPUTS vs OUTPUTS,
  stacked by component.  Mass basis (kg / h by default), because
  that's the basis a chemical engineer cares about at the plant
  boundary --- tonnes per hour, not mole fractions.

  Two bars:
    INPUTS   = sum over feed streams    of (fluid_per_component + solid)
    OUTPUTS  = sum over product streams of (fluid_per_component + solid)
  Intermediate streams (unit-to-unit) are deliberately excluded;
  they cancel out at the plant boundary.

  Per-component fluid mass is derived from the molar flow + mole
  fraction + per-component MW:
       m_dot_fluid[c] = F * x[c] * MW[c]                [kg/s]
  Solid mass per component is already in kg/s:
       m_dot_solid[c] = s.solids[c]                     [kg/s]

  The chart's title shows the closure error |IN - OUT| / IN; a
  well-converged steady-state run closes to << 0.1 %.
\*---------------------------------------------------------------------------*/

import type { StreamResult } from "../../adapters/SolverAdapter.js";
import {
  flowBasis,
  type FlowUnit,
} from "../../state/displayUnits.js";
import { Plot, PLOT_COLORS, PLOT_CONFIG, darkLayout } from "./plotly.js";

interface MassBalancePlotProps {
  streams: StreamResult[];
  componentMolarMass?: { [component: string]: number };
  /** User's preferred flow unit from the TopBar Units menu.  If a
   *  molar unit is picked, we force kg/h for the y-axis because the
   *  plot's whole point is the mass basis -- "venda de toneladas". */
  flowUnit: FlowUnit;
}

export function MassBalancePlot({
  streams, componentMolarMass, flowUnit,
}: MassBalancePlotProps) {
  // Force a mass unit -- the plot is a mass balance.  If the user
  // picked a molar unit (kmol/h, mol/s, ...) we read it as a hint
  // for time scale (h vs s) and pick the matching mass unit.
  const yUnit: FlowUnit = flowBasis(flowUnit) === "mass"
    ? flowUnit
  : flowUnit.endsWith("/h") ? "kg/h" : "kg/s";

  // Collect every component that shows up in any stream's
  // composition or solids block.
  const componentSet = new Set<string>();
  for (const s of streams) {
    for (const c of Object.keys(s.composition)) componentSet.add(c);
    if (s.solids) for (const c of Object.keys(s.solids)) componentSet.add(c);
  }
  const components = [...componentSet];

  // Per-stream per-component mass flow [kg/s].  Fluid uses MW;
  // solid is already in kg/s.  When MW is missing for a component
  // (e.g. an old log without componentMolarMass), the fluid term
  // for that component falls back to zero -- the chart honestly
  // shows what data was emitted, no fudging.
  const massPerComp = (s: StreamResult): { [c: string]: number } => {
    const out: { [c: string]: number } = {};
    for (const c of components) {
      const mw = componentMolarMass?.[c] ?? 0;
      const x = s.composition[c] ?? 0;
      const fluid = (s.F ?? 0) * x * mw;                  // kg/s
      const solid = s.solids?.[c] ?? 0;                   // kg/s
      out[c] = fluid + solid;
    }
    return out;
  };

  const feeds    = streams.filter((s) => s.role === "feed");
  const products = streams.filter((s) => s.role === "product");

  const totals = (group: StreamResult[]): { [c: string]: number } => {
    const acc: { [c: string]: number } = {};
    for (const c of components) acc[c] = 0;
    for (const s of group) {
      const m = massPerComp(s);
      for (const c of components) acc[c] = (acc[c] ?? 0) + (m[c] ?? 0);
    }
    return acc;
  };

  const inTotals  = totals(feeds);
  const outTotals = totals(products);

  // One Plotly bar trace per component.  Each trace contributes its
  // value to the IN bar and the OUT bar; barmode 'stack' assembles
  // them visually.  Skip components that are 0 on both sides --
  // common when only a subset of standards-catalogue species is in
  // the case.
  const visibleComponents = components.filter(
    (c) => inTotals[c]! > 1e-15 || outTotals[c]! > 1e-15,
  );

  // Convert kg/s -> user unit.  formatFlow returns a string, so we
  // compute the numeric factor here for the y values.
  const factor = yUnit === "kg/s" ? 1.0
              : yUnit === "kg/h" ? 3600.0
              : yUnit === "g/s"  ? 1000.0
              : yUnit === "g/h"  ? 3.6e6
              : 1.0;

  // Adaptive number format so a segment label is readable across scales
  // (1200 kg/h vs 0.0086 kg/s).
  const fmt = (v: number) => (v >= 100 ? v.toFixed(0) : v.toPrecision(3));
  const data = visibleComponents.map((c, i) => {
    const yin = inTotals[c]! * factor, yout = outTotals[c]! * factor;
    // Label each segment with the COMPONENT name + its mass flow, so a stack of
    // several components is readable from the bar itself, not only the legend.
    return {
      type: "bar" as const,
      name: c,
      x: ["INPUTS", "OUTPUTS"],
      y: [yin, yout],
      text: [yin > 1e-12 ? `${c}<br>${fmt(yin)} ${yUnit}` : "",
             yout > 1e-12 ? `${c}<br>${fmt(yout)} ${yUnit}` : ""],
      textposition: "inside" as const,
      insidetextanchor: "middle" as const,
      textfont: { size: 11, color: "#10242b" },
      marker: { color: PLOT_COLORS.series[i % PLOT_COLORS.series.length] },
      hovertemplate:
        "<b>%{x}</b><br>"
        + c + " = %{y:.4g} " + yUnit
        + "<extra></extra>",
    };
  });

  // The in/out/closure numbers now live in the Streams-workspace summary
  // band (case/balances.ts is the shared source); this plot's title is just
  // the label so the figure isn't a wall of text.
  const title = `Mass balance — plant boundary (${yUnit})`;

  // Empty state: no boundary streams classified.  Should not happen
  // for a valid flowsheet, but easy to surface.
  if (visibleComponents.length === 0) {
    return (
      <Plot
        data={[]}
        layout={{...darkLayout, title: { text: "No mass-bearing boundary streams in this run" } }}
        config={PLOT_CONFIG}
        style={{ width: "100%", height: "100%" }}
      />
    );
  }

  return (
    <Plot
      data={data}
      layout={{
        ...darkLayout,
        title: { text: title, font: {...darkLayout.font, size: 13 } },
        barmode: "stack",
        bargap: 0.4,
        xaxis: {
...darkLayout.xaxis,
          title: { text: "" },
          tickfont: {...darkLayout.font, size: 13 },
        },
        yaxis: {
...darkLayout.yaxis,
          title: { text: `mass flow (${yUnit})` },
        },
      }}
      config={PLOT_CONFIG}
      style={{ width: "100%", height: "100%" }}
      useResizeHandler
    />
  );
}
