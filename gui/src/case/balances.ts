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
  /** Components with nonzero mass on either side (worth showing) --
   *  in the PROCESS scope, so a declared circuit's water does not put a
   *  component on the axis that no process stream carries. */
  visibleComponents: string[];
  /** kg/s in / out, per component -- the PROCESS scope (see below). */
  inPerComp: Record<string, number>;
  outPerComp: Record<string, number>;
  /** kg/s totals, PROCESS scope. */
  inSum: number;
  outSum: number;
  /** |in - out| / in, PROCESS scope. */
  closureErr: number;
  /** kg/s totals over EVERY boundary stream, declared circuits included --
   *  what this function returned before the two scopes existed. */
  totalInSum: number;
  totalOutSum: number;
  totalClosureErr: number;
  /** The declared circuits present among the boundary streams, and what each
   *  set aside [kg/s], counted on the SUPPLY side only (the return side is
   *  the same matter; the engine refuses a declared pair that does not
   *  conserve component-wise, so adding both would double it). */
  utilityCircuits: string[];
  utilityPerCircuit: Record<string, number>;
  utilitySum: number;
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

  //  TWO SCOPES, AND THE ENGINE DECIDED WHICH STREAM IS WHICH (2026-09-08).
  //  A case may DECLARE that a pair of boundary streams is an auxiliary
  //  circuit; `utilityCircuit` is the engine's own stamp for that, carried
  //  per stream exactly like `aliasOf`.  Nothing here reads the `utilities`
  //  block or matches names -- that would be the second home the first law
  //  was taken out of on 2026-09-05, one balance over.
  //
  //  WHY THE PROCESS SCOPE IS THE ONE DRAWN.  On the ammonia plant the
  //  declared cooling water is 99.2 % of the mass crossing the boundary:
  //  every process component is a sliver against it, and the closure it
  //  yields is a statement about the cooling tower.  THE SEPARATION IS
  //  PRESENTATION, NEVER VALIDATION SCOPE -- the engine's per-unit, element
  //  and energy balances keep counting every stream, utilities included, and
  //  the total scope stays here beside the process one rather than vanishing.
  const isUtility = (s: StreamResult): boolean =>
    s.utilityCircuit !== undefined && s.utilityCircuit !== "";
  const procFeeds = feeds.filter((s) => !isUtility(s));
  const procProducts = products.filter((s) => !isUtility(s));

  const totals = (group: StreamResult[]): Record<string, number> => {
    const acc: Record<string, number> = {};
    for (const c of components) acc[c] = 0;
    for (const s of group) {
      const m = massPerComponent(s, components, mw);
      for (const c of components) acc[c] = (acc[c] ?? 0) + (m[c] ?? 0);
    }
    return acc;
  };

  const sum = (r: Record<string, number>): number =>
    Object.values(r).reduce((a, b) => a + b, 0);
  const closure = (i: number, o: number): number =>
    i > 0 ? Math.abs(i - o) / i : 0;

  const inPerComp = totals(procFeeds);
  const outPerComp = totals(procProducts);
  const visibleComponents = components.filter(
    (c) => inPerComp[c]! > 1e-15 || outPerComp[c]! > 1e-15,
  );
  const inSum = sum(inPerComp);
  const outSum = sum(outPerComp);

  const totalInSum = sum(totals(feeds));
  const totalOutSum = sum(totals(products));

  //  The supply side of each circuit, by the circuit's own name.  A circuit
  //  whose streams are not boundary streams contributes nothing and does not
  //  appear -- an absence that is a fact about the flowsheet, not a gap.
  const utilityPerCircuit: Record<string, number> = {};
  for (const s of feeds) {
    if (!isUtility(s)) continue;
    const k = s.utilityCircuit!;
    utilityPerCircuit[k] =
      (utilityPerCircuit[k] ?? 0) + sum(massPerComponent(s, components, mw));
  }
  const utilityCircuits = Object.keys(utilityPerCircuit).sort();

  return {
    components,
    visibleComponents,
    inPerComp,
    outPerComp,
    inSum,
    outSum,
    closureErr: closure(inSum, outSum),
    totalInSum,
    totalOutSum,
    totalClosureErr: closure(totalInSum, totalOutSum),
    utilityCircuits,
    utilityPerCircuit,
    utilitySum: sum(utilityPerCircuit),
  };
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
