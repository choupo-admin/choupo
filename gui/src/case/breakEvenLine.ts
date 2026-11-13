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
  The sentence the economics summary prints for one price break-even
  (`economics { breakEven { price ( <stream> ... ); } }`).  Every number is the
  engine's (`economics.breakEvenPrices`); this file only words them.
\*---------------------------------------------------------------------------*/

import type { EconomicBreakEvenPrice } from "../adapters/SolverAdapter.js";

export function breakEvenPriceLine(currency: string, b: EconomicBreakEvenPrice): string {
  const declared = Number.isFinite(b.declared)
    ? ` (declared ${b.declared.toPrecision(4)})` : "";
  const what = b.role === "product"
    ? "the minimum selling price"
    : "the highest purchase price the plant can bear";
  return `NPV = 0 at ${b.breakEven.toPrecision(4)} ${currency}/kg of ${b.stream}`
    + `${declared} -- ${what}, every other price held.`;
}
