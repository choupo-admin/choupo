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
  EnergyBalancePlot -- plant-boundary INPUTS vs OUTPUTS, stacked by
  stream, in flow-enthalpy units (kW).

  Counterpart to MassBalancePlot but the y axis is energy.  For each
  feed and each product the bar segment height is
       H_dot = F [kmol/s] * H [J/mol] * 1000 mol/kmol  ->  W
  The closure Δ = Σ H_dot_in − Σ H_dot_out is generally NON-zero in a
  real plant: it equals the net heat injected by utilities (heaters,
  coolers) PLUS the heat of reaction released or consumed inside the
  reactors.  The title spells out the closure delta with units so the
  student reads the gap as physically meaningful, not as a balance
  error.

  Streams that have no `H` value (a nonvolatile in a two-phase mix,
  or a thermo package without the right Cp data) are excluded; a
  badge in the title counts them so the figure honestly says "this
  is partial, N streams skipped".
\*---------------------------------------------------------------------------*/

import type { StreamResult } from "../../adapters/SolverAdapter.js";
import { Plot, PLOT_COLORS, PLOT_CONFIG, darkLayout } from "./plotly.js";

interface EnergyBalancePlotProps {
  streams: StreamResult[];
  /** Net energy the units ADD (heat duties + shaft work, kW, signed: + into the
   *  process).  Drawn as extra INPUT/OUTPUT bars so the balance CLOSES — without
   *  them the duty is missing and the bars look unbalanced. */
  added?: { heatKw: number; workKw: number };
}

export function EnergyBalancePlot({ streams, added }: EnergyBalancePlotProps) {
  const feeds    = streams.filter((s) => s.role === "feed");
  const products = streams.filter((s) => s.role === "product");

  // H_dot per stream in kW (F kmol/s * H J/mol * 1000 mol/kmol / 1000)
  const hDotKw = (s: StreamResult): number | null => {
    if (s.H === undefined) return null;
    return s.F * s.H;        // F * 1000 * H / 1000 = F * H
  };

  // Skip streams with no H, count them for the title badge.
  let skipped = 0;
  const usedFeeds: StreamResult[] = [];
  const usedProducts: StreamResult[] = [];
  for (const s of feeds) {
    if (hDotKw(s) === null && (s.F_mass ?? 0) > 1e-15) skipped++;
    else if (hDotKw(s) !== null) usedFeeds.push(s);
  }
  for (const s of products) {
    if (hDotKw(s) === null && (s.F_mass ?? 0) > 1e-15) skipped++;
    else if (hDotKw(s) !== null) usedProducts.push(s);
  }

  // One trace per stream, contributing its segment to either INPUTS
  // or OUTPUTS.  Same colour palette as the mass-balance plot so the
  // student sees the relationship "RawJuice carries N kg/h and Y kW".
  const allStreams = [...usedFeeds, ...usedProducts];
  const data = allStreams.map((s, i) => {
    const isFeed = s.role === "feed";
    const y = hDotKw(s) ?? 0;
    return {
      type: "bar" as const,
      name: s.name,
      x: ["INPUTS", "OUTPUTS"],
      y: [isFeed ? y : 0, isFeed ? 0 : y],
      marker: { color: PLOT_COLORS.series[i % PLOT_COLORS.series.length] },
      hovertemplate:
        `<b>${s.name}</b><br>`
        + `H = ${(s.H ?? 0 / 1e3).toFixed(2)} kJ/mol<br>`
        + `Ḣ = %{y:.4g} kW<extra></extra>`,
    };
  });

  // The energy the UNITS add (heat duties + shaft work): drawn as extra bars on
  // the INPUTS side (heating / work-in) or OUTPUTS side (cooling / work-out) so
  // the stacked totals match — the balance CLOSES, not "Δ is physical".
  const extras: { label: string; kw: number; color: string }[] = [];
  if (added) {
    if (Math.abs(added.heatKw) > 0.05)
      extras.push({ label: "heat duty (utilities)", kw: added.heatKw, color: PLOT_COLORS.warm });
    if (Math.abs(added.workKw) > 0.05)
      extras.push({ label: "shaft work", kw: added.workKw, color: PLOT_COLORS.accent2 });
  }
  for (const e of extras) {
    const isInput = e.kw >= 0;
    data.push({
      type: "bar" as const,
      name: e.label,
      x: ["INPUTS", "OUTPUTS"],
      y: [isInput ? e.kw : 0, isInput ? 0 : -e.kw],
      marker: { color: e.color },
      hovertemplate: `<b>${e.label}</b><br>${e.kw >= 0 ? "+" : "−"}%{y:.4g} kW<extra></extra>`,
    });
  }

  // The in/out/closure numbers (and the full first-law caption) live in the
  // Streams-workspace summary band (case/balances.ts is the shared source);
  // this plot's title is just the label so the figure isn't a wall of text.
  const title =
    `Energy balance — plant boundary (kW)`
    + (skipped > 0 ? `  ·  ${skipped} stream(s) skipped (no H)` : "");

  if (data.length === 0) {
    return (
      <Plot
        data={[]}
        layout={{...darkLayout, title: { text: "No streams with computable enthalpy in this run" } }}
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
        title: { text: title, font: {...darkLayout.font, size: 12 } },
        barmode: "stack",
        bargap: 0.4,
        xaxis: {
...darkLayout.xaxis,
          title: { text: "" },
          tickfont: {...darkLayout.font, size: 13 },
        },
        yaxis: {
...darkLayout.yaxis,
          title: { text: "enthalpy flow rate (kW)" },
        },
      }}
      config={PLOT_CONFIG}
      style={{ width: "100%", height: "100%" }}
      useResizeHandler
    />
  );
}
