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
  /** Energy the units exchange, SPLIT by direction: heat ADDED (reboilers,
   *  heaters) goes on the INPUTS side, heat REMOVED (condensers, coolers -- the
   *  "cold") on the OUTPUTS side, shaft work by its sign.  Drawn as extra bars so
   *  the balance CLOSES with the hot on the left and the cold on the right. */
  added?: { heatAddedKw: number; heatRemovedKw: number; workKw: number };
}

export function EnergyBalancePlot({ streams, added }: EnergyBalancePlotProps) {
  const feeds    = streams.filter((s) => s.role === "feed");
  const products = streams.filter((s) => s.role === "product");

  // Total flow enthalpy per stream in kW.  Prefer the solver's H_kW, which
  // counts the crystalline phase s[] a solid product (e.g. sucrose Powder)
  // carries -- F*H alone misses it and the boundary balance does not close.
  const hDotKw = (s: StreamResult): number | null => {
    if (s.H_kW !== undefined) return s.H_kW;
    if (s.H === undefined) return null;
    return s.F * s.H;
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
  // Adaptive precision: these are kW and can be single-digit, where rounding to
  // an integer hides the closure -- the rounded segments stop summing to the
  // rounded net and the balance LOOKS broken though it closes.  Show more
  // decimals for small magnitudes.
  const fmtKw = (v: number) => {
    const a = Math.abs(v);
    return a >= 1000 ? v.toFixed(0) : a >= 10 ? v.toFixed(1) : v.toFixed(2);
  };

  const allStreams = [...usedFeeds, ...usedProducts];
  const data = allStreams.map((s, i) => {
    const isFeed = s.role === "feed";
    const y = hDotKw(s) ?? 0;
    // Label each segment with its stream NAME + flow enthalpy, so a stack of
    // same-phase streams (feed/distillate/bottoms are all liquid -> same colour)
    // is readable from the bar itself, not only the legend.  Plotly hides the
    // label automatically on a segment too thin to hold it.
    const seg = `${s.name}<br>${fmtKw(y)} kW`;
    return {
      type: "bar" as const,
      name: s.name,
      x: ["INPUTS", "OUTPUTS"],
      y: [isFeed ? y : 0, isFeed ? 0 : y],
      text: [isFeed ? seg : "", isFeed ? "" : seg],
      textposition: "inside" as const,
      insidetextanchor: "middle" as const,
      textfont: { size: 11, color: "#10242b" },
      marker: { color: PLOT_COLORS.series[i % PLOT_COLORS.series.length] },
      hovertemplate:
        `<b>${s.name}</b><br>`
        + `H = ${(s.H ?? 0 / 1e3).toFixed(2)} kJ/mol<br>`
        + `Ḣ = %{y:.4g} kW<extra></extra>`,
    };
  });

  // The energy the UNITS exchange, SPLIT by direction so the picture is physical:
  // heat ADDED (reboilers/heaters, hot) on the INPUTS side; heat REMOVED
  // (condensers/coolers -- the COLD) on the OUTPUTS side; shaft work by its sign.
  // Each contributes a POSITIVE chunk on its own side, so both columns close at
  // the same level with the hot on the left and the cold on the right.
  const extras: { label: string; kw: number; side: "in" | "out"; color: string }[] = [];
  if (added) {
    if ((added.heatAddedKw ?? 0) > 0.05)
      extras.push({ label: "heat in (reboiler / heaters / endothermic duty)", kw: added.heatAddedKw, side: "in", color: PLOT_COLORS.warm });
    if ((added.heatRemovedKw ?? 0) > 0.05)
      extras.push({ label: "heat out (cooling / exothermic reaction duty)", kw: added.heatRemovedKw, side: "out", color: "#4a90d9" });
    if (Math.abs(added.workKw ?? 0) > 0.05)
      extras.push({ label: "shaft work", kw: Math.abs(added.workKw), side: added.workKw >= 0 ? "in" : "out", color: PLOT_COLORS.accent2 });
  }
  for (const e of extras) {
    const isInput = e.side === "in";
    const seg = `${e.label}<br>${fmtKw(e.kw)} kW`;
    data.push({
      type: "bar" as const,
      name: e.label,
      x: ["INPUTS", "OUTPUTS"],
      y: [isInput ? e.kw : 0, isInput ? 0 : e.kw],
      text: [isInput ? seg : "", isInput ? "" : seg],
      textposition: "inside" as const,
      insidetextanchor: "middle" as const,
      textfont: { size: 11, color: "#ffffff" },
      marker: { color: e.color },
      hovertemplate: `<b>${e.label}</b><br>%{y:.4g} kW<extra></extra>`,
    });
  }

  // Net IN and OUT (each = stream enthalpies + the duties drawn on that side).
  // With formation-datum enthalpies these are large and often negative, so the
  // bars alone do not "look" equal; the title states the closure in numbers and
  // a reference line marks the common level the two columns' cumulatives meet.
  const netIn  = data.reduce((s, t) => s + (t.y[0] as number), 0);
  const netOut = data.reduce((s, t) => s + (t.y[1] as number), 0);
  const scaleE = Math.max(Math.abs(netIn), Math.abs(netOut), 1);
  const gap    = netIn - netOut;
  const pct    = 100 * Math.abs(gap) / scaleE;
  const closes = Math.abs(gap) < 0.01 * scaleE;

  // Honest title: NEVER print "IN = OUT" with two different rounded numbers
  // (that reads as a lie).  Show both nets, the residual gap and its %, and one
  // verdict marker -- the gap IS the closure quality.
  const title =
    `Energy balance — plant boundary (kW)`
    + `  ·  IN ${fmtKw(netIn)} · OUT ${fmtKw(netOut)} · Δ ${fmtKw(gap)} kW (${pct.toFixed(1)}%) `
    + (closes ? "✓ closes" : "⚠ does NOT close")
    + (skipped > 0 ? `  ·  ${skipped} skipped (no H)` : "");

  // EQUAL bars, divided by stream SHARE (the chosen layout).  Both columns are
  // drawn to the same height (100%); each is split into its streams/duties sized
  // by that term's share of the side's total magnitude, and labelled with the
  // absolute signed kW.  Equal-height bars are the right metaphor for "IN balances
  // OUT" once the formation-datum signs -- which make a raw-kW stack impossible to
  // equalise (a positive hot-air input the product side lacks) -- are taken out of
  // the HEIGHT; the actual IN/OUT/gap kW live in the title.
  // A side whose total is physically ~zero (< 1 mW) has NO meaningful shares:
  // dividing by an FP residue paints one stream as "100 %" of nothing (the
  // adiabatic-flame case: feed at 25 C has H = 0 EXACTLY on the formation
  // datum, and the burnt gas H = 0 + rounding).  Treat it as zero-height and
  // say so, instead of a lying full bar.
  const EPS_KW = 1e-6;
  const inRaw  = data.reduce((s, t) => s + Math.abs((t.y as number[])[0] ?? 0), 0);
  const outRaw = data.reduce((s, t) => s + Math.abs((t.y as number[])[1] ?? 0), 0);
  const inTotal  = inRaw  > EPS_KW ? inRaw  : Infinity;   // shares -> 0
  const outTotal = outRaw > EPS_KW ? outRaw : Infinity;
  const bothZero = inRaw <= EPS_KW && outRaw <= EPS_KW;
  const shareData = data.map((t) => {
    const vIn  = (t.y as number[])[0] ?? 0;
    const vOut = (t.y as number[])[1] ?? 0;
    return {
      ...t,
      y: [Math.abs(vIn) / inTotal, Math.abs(vOut) / outTotal],
      customdata: [vIn, vOut] as number[],
      hovertemplate: `<b>${t.name}</b><br>%{customdata:.4g} kW (%{y:.0%} of side)<extra></extra>`,
    };
  });

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
      data={shareData}
      layout={{
        ...darkLayout,
        title: { text: title, font: {...darkLayout.font, size: 12 } },
        barmode: "stack",
        bargap: 0.4,
        annotations: bothZero ? [{
          text: "Both sides are ~0 kW on the formation datum (adiabatic unit, feed at 298.15 K):"
              + "<br>H_in = H_out = 0 exactly -- the first law, not a missing plot."
              + "<br>Nothing to stack; the closure lives in the title above.",
          xref: "paper", yref: "paper", x: 0.5, y: 0.5,
          showarrow: false, font: { ...darkLayout.font, size: 13 },
          align: "center",
        }] : [],
        xaxis: {
...darkLayout.xaxis,
          title: { text: "" },
          tickfont: {...darkLayout.font, size: 13 },
        },
        yaxis: {
...darkLayout.yaxis,
          title: { text: "share of side total  (bars equal by design; IN = OUT in the title)" },
          tickformat: ".0%",
          range: [0, 1],
        },
      }}
      config={PLOT_CONFIG}
      style={{ width: "100%", height: "100%" }}
      useResizeHandler
    />
  );
}
