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
  molarBalance -- the PLANT-BOUNDARY total molar flows, two numbers: molar
  IN and molar OUT (fluid F plus particulate solids converted kg/s -> kmol/s
  by MW).  NO physical lie: total moles are NOT a universal invariant in a
  reacting flowsheet, and whether a case reacts cannot be inferred from the
  presence of a reactions file (reactive columns and yield ops declare
  chemistry elsewhere) -- so the view ALWAYS exposes OUT - IN as a NET
  CHANGE and never claims a closure.  A solid whose MW is missing makes the
  claim PARTIAL naming the component -- never a silent omission.
\*---------------------------------------------------------------------------*/

import type { StreamResult } from "../adapters/SolverAdapter.js";

export interface MolarBalanceView {
  present: boolean;
  inKmolS: number;
  outKmolS: number;
  netKmolS: number;               // OUT - IN: a net change, not a residual
  /** Solid-carrying components whose MW is missing: their solid moles are
   *  NOT included and the claim is PARTIAL naming them. */
  partialMissingMW: string[];
}

export function molarBalanceView(
  streams: StreamResult[],
  componentMolarMass: { [component: string]: number } | undefined,
): MolarBalanceView {
  const view: MolarBalanceView = {
    present: false, inKmolS: 0, outKmolS: 0, netKmolS: 0,
    partialMissingMW: [],
  };
  const missing = new Set<string>();
  const totalOf = (s: StreamResult): number => {
    let n = s.F ?? 0;                              // fluid kmol/s
    if (s.solids) {
      for (const [c, kgps] of Object.entries(s.solids)) {
        if (kgps === 0) continue;
        const mw = componentMolarMass?.[c];
        if (mw === undefined || !(mw > 0)) { missing.add(c); continue; }
        n += kgps / mw;                            // kg/s -> kmol/s
      }
    }
    return n;
  };
  let any = false;
  for (const s of streams) {
    if (s.role === "feed") { view.inKmolS += totalOf(s); any = true; }
    else if (s.role === "product") { view.outKmolS += totalOf(s); any = true; }
  }
  view.netKmolS = view.outKmolS - view.inKmolS;
  view.partialMissingMW = [...missing].sort();
  view.present = any;
  return view;
}
