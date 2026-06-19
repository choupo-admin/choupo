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
  Choupo GUI -- per-stream composition with the SOLID phase folded in
  (single source of truth)

  For each result stream, pre-compute the component fractions AND the total
  flow in BOTH bases (molar + mass), with the solid phase folded into each:

    * a solids-only stream (a cyclone's capturedSolids) would otherwise read
      F = 0 and an all-zero fluid composition --- here it reads its real flow
      and x/w_<solid> = 1.0;
    * the mass basis needs the molar masses (`result.componentMolarMass`) to
      convert the fluid F·z [kmol/s] into kg/s --- ignoring them once made a
      plain fluid stream read F = 0 and every w_ = "—" on a mass basis.

  This used to live duplicated in StreamsTable.tsx and streamsPopOut.ts; it
  is now here so the Streams tab and the pop-out window read the SAME
  numbers and can never drift apart.
\*---------------------------------------------------------------------------*/

import type { StreamResult } from "../adapters/SolverAdapter.js";

export interface StreamComposition {
  /** Component mole fractions, solid phase folded in (solids need MW). */
  molFrac: { [c: string]: number };
  /** Component mass fractions, solid phase folded in (fluid needs MWs). */
  massFrac: { [c: string]: number };
  /** Total molar flow incl. solids-as-moles [kmol/s]. */
  totMol: number;
  /** Total mass flow incl. solids [kg/s]; fluid contributes 0 without MWs
   *  (honest fallback: the caller shows "—" rather than a fabricated 0). */
  totMass: number;
}

export function computePerStream(
  streams: StreamResult[],
  mws: { [c: string]: number } | undefined,
): { [name: string]: StreamComposition } {
  const out: { [name: string]: StreamComposition } = {};
  for (const s of streams) {
    const mol: { [c: string]: number } = {};
    const mass: { [c: string]: number } = {};
    let totMol = 0;
    let totMass = 0;
    // fluid phase: moles n = z*F, mass = n*MW
    for (const [c, z] of Object.entries(s.composition ?? {})) {
      const n = z * s.F;
      mol[c] = (mol[c] ?? 0) + n;
      totMol += n;
      const mw = mws?.[c];
      if (mw !== undefined) {
        mass[c] = (mass[c] ?? 0) + n * mw;
        totMass += n * mw;
      }
    }
    // solid phase: per-component kg/s (already mass); moles = mass/MW
    if (s.solids)
      for (const [c, m] of Object.entries(s.solids)) {
        mass[c] = (mass[c] ?? 0) + m;
        totMass += m;
        const mw = mws?.[c];
        if (mw !== undefined && mw > 0) {
          mol[c] = (mol[c] ?? 0) + m / mw;
          totMol += m / mw;
        }
      }
    const molFrac: { [c: string]: number } = {};
    const massFrac: { [c: string]: number } = {};
    if (totMol > 0) for (const [c, n] of Object.entries(mol)) molFrac[c] = n / totMol;
    if (totMass > 0) for (const [c, m] of Object.entries(mass)) massFrac[c] = m / totMass;
    out[s.name] = { molFrac, massFrac, totMol, totMass };
  }
  return out;
}
