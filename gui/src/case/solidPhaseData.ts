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
  Solid-phase data for the pure-compound P-T phase diagram — the triple point,
  enthalpies of fusion + sublimation, and the fusion volume change needed to
  draw the sublimation (solid-vapour) and fusion (solid-liquid) lines.

  These are intrinsic, cited pure-compound constants.  They live here (a small
  GUI table fed into the engine op's `solid {}` block) rather than in the frozen
  data/standards/ catalogue, mirroring how unifacGroups.ts supplies group data:
  the GUI provides the constants, the ENGINE (purePhaseDiagram) does the
  Clapeyron physics.  A compound absent here gets the liquid-vapour + critical
  diagram only (graceful).

  ENGINE PRECEDENCE (2026-06-14): the engine now ALSO reads a curated
  `sublimation { tripleT; tripleP; Hfus; Hsub; }` reference-state block off the
  component itself, and that wins over this op-dict `solid{}` block.  The
  fusion-line slope `deltaVfus` is NOT carried on the component (it is a
  sample/measurement quantity), so this GUI table remains the source of
  `deltaVfus` (and the fallback for compounds whose .dat carries no
  `sublimation{}` yet).  When a compound's component data already curates the
  triple point + enthalpies, only `deltaVfus` need be supplied here.

  Provenance (Vítor's to confirm):
    water — Tt, Pt: IAPWS-95 / ITS-90 triple point (273.16 K, 611.657 Pa).
            ΔH_fus 6010 J/mol @ 0 °C, ΔH_sub 51059 J/mol: CRC Handbook / NIST.
            ΔV_fus from ρ_ice 916.7 & ρ_water 999.84 kg/m³, MW 18.0153
            → −1.63e-6 m³/mol (the negative value is water's density anomaly,
            giving the backward-sloping melting line).
\*---------------------------------------------------------------------------*/

export interface SolidPhase {
  tripleT: number;   // K
  tripleP: number;   // Pa
  Hfus: number;      // J/mol
  Hsub: number;      // J/mol
  deltaVfus: number; // m^3/mol  (V_liquid - V_solid; < 0 for water)
}

export const SOLID_PHASE: Record<string, SolidPhase> = {
  water: { tripleT: 273.16, tripleP: 611.657, Hfus: 6010, Hsub: 51059, deltaVfus: -1.63e-6 },
};

export function solidPhaseFor(name: string): SolidPhase | undefined {
  return SOLID_PHASE[name];
}
