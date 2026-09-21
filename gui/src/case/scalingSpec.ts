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
  scalingSpec -- the WATER ANALYSIS the scaling lens opens on.

  THE DEFAULT IS A DECLARED ANALYSIS, and it is declared ONCE.  The lens used
  to open on seven mol/kg literals whose comment said they were the
  representative brackish groundwater of
  tutorials/props/electrolyte/scaling_ro_brackish.  Six of the seven were; the
  chloride was 0.0124 mol/kg -- 440 mg/L against the tutorial's 510 -- and one
  transcribed ion is not a rounding error here, it is the CHARGE BALANCE.  The
  engine's own announcement on that analysis reads

      speciation: feed charge imbalance 8.8 % ... the SOLVED pH is NOT
      trustworthy

  and the pH it then solves is 10.0 where the tutorial's is 7.72.  Since slice 1
  made `scaling` the boot lens for water + a salt, that was the FIRST SCREEN a
  water-and-salt student met: a lens whose engine distrusts its own default.

  So the analysis is stated in the unit a laboratory reports it in -- mg/L, the
  tutorial's own numbers -- and the mol/kg the synthesized dict carries is
  DERIVED.  A derived number cannot be transcribed wrong, and
  tests/scalingAnalysis.test.ts reads the tutorial's propsDict and holds this
  table to it, so the claim "copied from the tutorial" is checked by a machine
  rather than asserted by a comment.

  (The register's seam list also puts SCALING_EQUIL_MINERALS, SI_REFERENCE and
  the scaling spec builder in this file.  They stay in ExploreWorkspace for now:
  this slice extracted the half a defect needed, not the file.)
\*---------------------------------------------------------------------------*/

/** A master ion of the analysis, with the molar mass used ONLY for the
 *  mg/L <-> mol/kg display conversion (at rho ~ 1 kg/L, dilute).  The
 *  synthesized dict always carries mol/kg water; the engine never sees mg/L.
 *  MW [g/mol] from the standards speciation catalogue. */
export interface ScalingIon { ion: string; mw: number; }

export const SCALING_IONS: ScalingIon[] = [
  { ion: "Ca", mw: 40.078 }, { ion: "Mg", mw: 24.305 }, { ion: "Na", mw: 22.99 },
  { ion: "K", mw: 39.098 }, { ion: "Cl", mw: 35.453 }, { ion: "SO4", mw: 96.06 },
  { ion: "HCO3", mw: 61.02 },
];

/** The representative brackish groundwater the lens opens on, AS THE
 *  LABORATORY REPORTS IT (mg/L, ~1500 mg/L TDS).  Source, value for value:
 *  tutorials/props/electrolyte/scaling_ro_brackish/system/propsDict, the
 *  `feed` and `scan` ops' `analyticalTotals`.  Do not edit one of these
 *  without the other -- the test reads that file. */
export const BRACKISH_MG_PER_L: { readonly [ion: string]: number } = {
  Ca: 84, Mg: 27, Na: 363, K: 12, Cl: 510, SO4: 250, HCO3: 183,
};

/** mg/L -> mol/kg at rho ~ 1 kg/L. */
export function molalFromMgPerL(mgPerL: number, mw: number): number {
  return mgPerL / (mw * 1000);
}

/** mol/kg -> mg/L at rho ~ 1 kg/L. */
export function mgPerLFromMolal(molal: number, mw: number): number {
  return molal * mw * 1000;
}

/** The lens's opening analysis in the unit the dict carries (mol/kg),
 *  DERIVED from the declared mg/L -- never a second list of literals. */
export function brackishDefaultMolal(): { [ion: string]: number } {
  const out: { [ion: string]: number } = {};
  for (const { ion, mw } of SCALING_IONS)
    out[ion] = molalFromMgPerL(BRACKISH_MG_PER_L[ion] ?? 0, mw);
  return out;
}
