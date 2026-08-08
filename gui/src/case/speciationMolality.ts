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
    speciationMolality

Description
    The molality basis for displaying an aqueous speciation (ruled
    2026-08-08): equilibrium constants are ACTIVITY-based, and molality is
    the composition scale underlying the molal standard state and the
    electrolyte activity models (Davies, Pitzer, eNRTL) -- so mol/kg of
    the DECLARED solvent is the primary display basis, beside the pH that
    is already intensive.  The species FLOWS stay the canonical transport
    and closure representation underneath (an intensive number cannot
    close a ledger); normalized species fractions are BANNED -- a
    stoichiometric set excludes H/OH as mediators and does not close to 1,
    so a fraction of it reads like a composition without being one.

    The denominator comes from the case's DECLARED aqueous solvent
    (thermoPhysPropDict: equilibrium { aqueous { solvent ...; } }), never
    from a GUI-side assumption that the solvent is named water; when the
    key is absent, "water" is the ENGINE's own documented default
    (SystemClassifier contract), so quoting it is quoting the engine.
    The solvent mass is the AQUEOUS PHASE's share of the solvent --
    overall minus organic minus solid -- on the same subtraction closure
    as streamPhases.  When the basis cannot be built (no molar mass for
    the solvent, or no solvent in the aqueous phase) the display falls
    back to flows WITH THE REASON: never a wrong number, never a silent
    omission.
\*---------------------------------------------------------------------------*/

import type { StreamResult } from "../adapters/SolverAdapter.js";
import type { JsonDict } from "../dict/index.js";

/** The case's declared aqueous solvent name.  Absent declaration =
 *  "water", the engine's own default -- quoted, not assumed. */
export function declaredAqueousSolvent(
  thermoPackage: JsonDict | undefined,
): string {
  const eq = thermoPackage?.["equilibrium"] as JsonDict | undefined;
  const aq = eq?.["aqueous"] as JsonDict | undefined;
  const s = aq?.["solvent"];
  return typeof s === "string" && s.length > 0 ? s : "water";
}

export interface MolalityBasis {
  /** the declared solvent the label names ("mol/kg <solvent>") */
  solvent: string;
  /** aqueous-phase solvent mass flow [kg/s]; set iff the basis exists */
  kgPerS?: number;
  /** why molality cannot be shown; the display falls back to flows */
  unavailable?: string;
}

export function aqueousMolalityBasis(
  s: StreamResult,
  solvent: string,
  molarMass?: { [component: string]: number },
): MolalityBasis {
  const mw = molarMass?.[solvent];
  if (!mw || mw <= 0)
    return {
      solvent,
      unavailable: `molality unavailable -- the result carries no molar `
        + `mass for the declared solvent '${solvent}'; species shown as `
        + `flows instead`,
    };
  const overall = s.F * (s.composition?.[solvent] ?? 0);
  const organic = s.organicLiquid?.[solvent] ?? 0;
  const solidKg = s.solids?.[solvent] ?? 0;
  const aqueousMol = overall - organic - solidKg / mw;
  if (!(aqueousMol > 0))
    return {
      solvent,
      unavailable: `molality unavailable -- the aqueous phase holds no `
        + `'${solvent}' to define mol/kg against; species shown as flows `
        + `instead`,
    };
  return { solvent, kgPerS: aqueousMol * mw };
}

/** Molality [mol/kg solvent] of one species flow [kmol/s] on a built
 *  basis.  kmol/s over kg/s is kmol/kg; x1000 is mol/kg. */
export function molality(flowKmolS: number, basis: MolalityBasis): number {
  return (flowKmolS / basis.kgPerS!) * 1000.0;
}
