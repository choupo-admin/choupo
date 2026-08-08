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
-------------------------------------------------------------------------------
Module
    streamPhases

Description
    The phase decomposition of one stream, in molar flows [kmol/s], from what
    the engine publishes -- and ONLY from what it publishes.

    The engine stores the ORGANIC side of a liquid-liquid split and nothing
    else: the aqueous side is the fluid minus it.  That is deliberate (the
    stream file does the same), and it is why this module SUBTRACTS instead of
    reading a second vector: two independently-rounded vectors agreeing is not
    the same thing as a decomposition that closes, and the moment both are
    stored they can drift.

    The solid arrives as MASS (kg/s, the basis a particulate stream is
    weighed in) and is converted here with the molar masses the payload
    already carries -- again a conversion, not a second source.

    Absence is absence: a stream with no second liquid has no `organic` entry,
    not an entry of zeros.  A phase of zero and no phase are different claims.
\*---------------------------------------------------------------------------*/

import type { StreamResult } from "../adapters/SolverAdapter.js";

export interface StreamPhase {
  /** aqueous | organic | solid -- the names the stream file uses */
  name: string;
  /** per-component molar flow [kmol/s]; EMPTY when `unavailable` is set */
  flows: { [component: string]: number };
  /** total molar flow [kmol/s]; 0 when `unavailable` is set */
  total: number;
  /** Set when the molar conversion could not be performed.  The phase is
   *  still ACCOUNTED FOR, in its native mass basis below, and this string
   *  says why the molar column cannot be filled.  The rule (Vítor,
   *  2026-08-08): never show the wrong unit -- and never silently hide the
   *  phase either. */
  unavailable?: string;
  /** the phase's native per-component mass flow [kg/s], carried only when
   *  `unavailable` is set so a renderer can still show the material */
  massFlowsKg?: { [component: string]: number };
}

export function streamPhases(
  s: StreamResult,
  molarMass?: { [component: string]: number },
): StreamPhase[] {
  const org = s.organicLiquid;
  const sol = s.solids;
  //  Nothing to decompose: one fluid phase, no crystals.  Say nothing rather
  //  than draw a one-row "decomposition" of the composition already shown.
  if (!org && !sol) return [];

  const out: StreamPhase[] = [];
  const totalOf = (f: { [k: string]: number }) =>
    Object.values(f).reduce((a, b) => a + b, 0);

  //  The FLUID, per component, from the two numbers that describe it.
  const fluid: { [k: string]: number } = {};
  for (const [c, x] of Object.entries(s.composition ?? {})) {
    const n = s.F * x;
    if (n !== 0) fluid[c] = n;
  }

  if (org) {
    const aqueous: { [k: string]: number } = {};
    for (const [c, n] of Object.entries(fluid)) {
      const a = n - (org[c] ?? 0);
      //  Subtraction can leave a rounding crumb below any physical amount;
      //  it is not a component of the aqueous phase, it is the last bit of
      //  the organic one's rounding.
      if (Math.abs(a) > 1e-15 * Math.max(1, n)) aqueous[c] = a;
    }
    out.push({ name: "aqueous", flows: aqueous, total: totalOf(aqueous) });
    const organic = Object.fromEntries(
      Object.entries(org).filter(([, n]) => n !== 0));
    out.push({ name: "organic", flows: organic, total: totalOf(organic) });
  } else if (sol) {
    //  With a solid but one liquid, the fluid IS the aqueous material, and
    //  naming it says which material the solid was subtracted from.
    out.push({ name: "aqueous", flows: fluid, total: totalOf(fluid) });
  }

  if (sol) {
    const solid: { [k: string]: number } = {};
    const missing: string[] = [];
    for (const [c, kg] of Object.entries(sol)) {
      const mw = molarMass?.[c];
      if (!mw || mw <= 0) missing.push(c);
      else solid[c] = kg / mw;       // kg/s / (kg/kmol) = kmol/s
    }
    //  No molar mass, no molar flow -- but the PHASE does not vanish with
    //  the conversion.  Showing kg/s in a kmol/s column is how a table
    //  starts lying; silently dropping the solid is how a stream starts
    //  lying about what it carries.  Neither: the phase stays, in its
    //  native mass basis, with the reason stated.
    if (missing.length === 0)
      out.push({ name: "solid", flows: solid, total: totalOf(solid) });
    else
      out.push({
        name: "solid", flows: {}, total: 0,
        unavailable: "molar flow unavailable -- the result carries no molar "
          + "mass for " + missing.join(", ") + "; shown in kg/s instead",
        massFlowsKg: { ...sol },
      });
  }
  return out;
}
