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

/** Per-component mass flow of one stream [kg/s]: F·x·MW.
 *
 *  F and composition are the OVERALL stream material INCLUDING any
 *  crystalline solid -- the solver's own streamsNote states this
 *  convention, and `solids`/`F_solid_mass` merely LOCATE part of that same
 *  material.  Adding `solids[c]` on top of F·x·MW therefore counted every
 *  crystal twice, and the Mass Balance plot reported out > in on exactly
 *  the freeze/crystalliser cases whose STREAM table (reading the solver's
 *  F_mass) closed -- found by Vitor on flash21_freeze_concentration,
 *  2026-08-10.  The engine owns the balance; this function only converts
 *  the engine's published material to kg/s, once.
 *  Missing MW falls back to 0 (honest: shows what was emitted). */
export function massPerComponent(
  s: StreamResult,
  components: string[],
  mw?: { [c: string]: number },
): Record<string, number> {
  const out: Record<string, number> = {};
  for (const c of components) {
    const m = mw?.[c] ?? 0;
    const x = s.composition[c] ?? 0;
    out[c] = (s.F ?? 0) * x * m; // kg/s -- overall material, solids included
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

  //  An observed feed (consumed only by observer units -- see StreamResult)
  //  is a state under interrogation, not boundary intake; counting it drew
  //  bubbleT01 as a 100 % violation.
  const feeds = streams.filter((s) => s.role === "feed" && !s.observed);
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

//  THE FIRST LAW IS NOT COMPUTED HERE (2026-09-05).  This file used to carry
//  `energyBalance()` + `unitEnergy()`, a GUI-side sum of boundary-stream
//  enthalpies plus utility-ALLOCATED duties.  It was a second home for a
//  balance the engine's energyBalance report already decides, and the two
//  disagreed on the flagship plant by an order of magnitude (372.5 kW shown
//  against 34.4 kW in the engine's own ledger) because a cooling duty no
//  utility served never entered the GUI's sum.  The engine now stamps its
//  ledger on the result as `globalEnergyBoundary`; the GUI draws it and, when
//  it is absent, says the report did not run.  Nothing here may grow a
//  replacement.
