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
  Choupo GUI -- plant-boundary balance helpers (single source of truth)

  The in/out/closure arithmetic used to live INSIDE MassBalancePlot.tsx and
  EnergyBalancePlot.tsx.  It is now here so the Streams-workspace summary band
  AND the (demoted) plots read the SAME numbers -- a student can never see the
  closure quoted two different ways.

  Mass basis is kg/s (canonical SI); callers convert to the display unit.
  Energy basis is kW (flow enthalpy).  Only BOUNDARY streams count: feeds
  (role "feed") in, products (role "product") out -- unit-to-unit internals
  cancel at the plant boundary.
\*---------------------------------------------------------------------------*/

import type { StreamResult } from "../adapters/SolverAdapter.js";

// ---- mass balance ----------------------------------------------------------

export interface MassBalance {
  /** Every component seen in any stream's composition / solids. */
  components: string[];
  /** Components with nonzero mass on either side (worth showing). */
  visibleComponents: string[];
  /** kg/s in / out, per component. */
  inPerComp: Record<string, number>;
  outPerComp: Record<string, number>;
  /** kg/s totals. */
  inSum: number;
  outSum: number;
  /** |in - out| / in. */
  closureErr: number;
}

/** Per-component mass flow of one stream [kg/s].  Fluid = F·x·MW; solid is
 *  already kg/s.  Missing MW falls back to 0 (honest: shows what was emitted). */
export function massPerComponent(
  s: StreamResult,
  components: string[],
  mw?: { [c: string]: number },
): Record<string, number> {
  const out: Record<string, number> = {};
  for (const c of components) {
    const m = mw?.[c] ?? 0;
    const x = s.composition[c] ?? 0;
    const fluid = (s.F ?? 0) * x * m; // kg/s
    const solid = s.solids?.[c] ?? 0; // kg/s
    out[c] = fluid + solid;
  }
  return out;
}

export function massBalance(
  streams: StreamResult[],
  mw?: { [c: string]: number },
): MassBalance {
  const set = new Set<string>();
  for (const s of streams) {
    for (const c of Object.keys(s.composition)) set.add(c);
    if (s.solids) for (const c of Object.keys(s.solids)) set.add(c);
  }
  const components = [...set];

  const feeds = streams.filter((s) => s.role === "feed");
  const products = streams.filter((s) => s.role === "product");

  const totals = (group: StreamResult[]): Record<string, number> => {
    const acc: Record<string, number> = {};
    for (const c of components) acc[c] = 0;
    for (const s of group) {
      const m = massPerComponent(s, components, mw);
      for (const c of components) acc[c] = (acc[c] ?? 0) + (m[c] ?? 0);
    }
    return acc;
  };

  const inPerComp = totals(feeds);
  const outPerComp = totals(products);
  const visibleComponents = components.filter(
    (c) => inPerComp[c]! > 1e-15 || outPerComp[c]! > 1e-15,
  );
  const inSum = Object.values(inPerComp).reduce((a, b) => a + b, 0);
  const outSum = Object.values(outPerComp).reduce((a, b) => a + b, 0);
  const closureErr = inSum > 0 ? Math.abs(inSum - outSum) / inSum : 0;

  return { components, visibleComponents, inPerComp, outPerComp, inSum, outSum, closureErr };
}

// ---- energy balance --------------------------------------------------------

export interface EnergyBalance {
  /** Flow enthalpy of boundary streams in / out [kW]. */
  inKw: number;
  outKw: number;
  /** Net energy ADDED to the process by the units [kW], signed (+ into the
   *  process): heat duties (utility heating − cooling) and shaft work
   *  (compressor/pump + ; turbine −).  These are what close the balance:
   *  a flash, heater, column or compressor changes the stream enthalpy by
   *  exactly this much. */
  heatKw: number;
  workKw: number;
  /** Δ = (inKw + heatKw + workKw) − outKw [kW].  ≈ 0 for a converged case —
   *  the FULL first-law closure (streams + duties + work), NOT streams alone. */
  delta: number;
  /** |Δ| / (inKw + heatKw + workKw): the relative energy-closure error. */
  closureErr: number;
  /** Boundary streams skipped because the solver emitted no enthalpy. */
  skipped: number;
}

/** Flow enthalpy of one stream [kW]: F [kmol/s] · H [J/mol] · 1000 / 1000. */
export function enthalpyKw(s: StreamResult): number | null {
  if (s.H === undefined) return null;
  return s.F * s.H;
}

/** First-law balance over the plant boundary: boundary-stream enthalpy PLUS the
 *  energy the units add (heat duties + shaft work).  `added` is summed by the
 *  caller from the run's utilityAllocation (heat) + kpis (W_shaft); omitting it
 *  reproduces the old streams-only Δ. */
export function energyBalance(
  streams: StreamResult[],
  added?: { heatKw?: number; workKw?: number },
): EnergyBalance {
  const feeds = streams.filter((s) => s.role === "feed");
  const products = streams.filter((s) => s.role === "product");
  let inKw = 0, outKw = 0, skipped = 0;
  for (const s of feeds) {
    const h = enthalpyKw(s);
    if (h === null) { if ((s.F_mass ?? 0) > 1e-15) skipped++; } else inKw += h;
  }
  for (const s of products) {
    const h = enthalpyKw(s);
    if (h === null) { if ((s.F_mass ?? 0) > 1e-15) skipped++; } else outKw += h;
  }
  const heatKw = added?.heatKw ?? 0;
  const workKw = added?.workKw ?? 0;
  const delta = (inKw + heatKw + workKw) - outKw;
  const denom = Math.abs(inKw + heatKw + workKw);
  const closureErr = denom > 1e-9 ? Math.abs(delta) / denom : 0;
  return { inKw, outKw, heatKw, workKw, delta, closureErr, skipped };
}

/** Net energy the units ADD to the streams [kW], from a run result.  Heat from
 *  the utility allocation (explicit heating/cooling tier); shaft work from the
 *  rotating-unit kpis (W_shaft_kW is already signed: + compressor/pump, − turbine). */
export function unitEnergy(
  utilityAllocation: { tier: string; duty_kW: number }[] | undefined,
  kpis: { [unit: string]: { [k: string]: number } } | undefined,
): { heatKw: number; workKw: number } {
  let heatKw = 0;
  for (const a of utilityAllocation ?? []) {
    const d = Math.abs(a.duty_kW);
    if (a.tier === "heating") heatKw += d;
    else if (a.tier === "cooling") heatKw -= d;
  }
  let workKw = 0;
  for (const k of Object.values(kpis ?? {})) {
    if (typeof k.W_shaft_kW === "number") workKw += k.W_shaft_kW;
    else if (typeof k.W_shaft === "number") workKw += k.W_shaft / 1000.0;
  }
  return { heatKw, workKw };
}
