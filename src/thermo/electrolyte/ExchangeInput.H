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
Function
    Choupo::electrolyte::readExchange

Description
    Read the `exchange { resin SAC_Na; resinDose <v> L/kg|kg/kg; }` block off
    an operation dict into a `SpeciationInput`: resolve the resin asset by
    exact name (case-local mirror first, then the standards catalogue), load
    the exchange half-reaction network, DERIVE the solver's X_total [eq / kg
    water] from the asset nameplate times the declared contact dose, and
    announce that arithmetic.  Unknown keys, an unknown resin, a missing dose
    and a network with no present cation are all REFUSED by name.

    WHY IT LIVES IN `thermo` (debt D2, cycle A, paid 2026-08-05).  This reader
    was a free function in `namespace propertyOps`, and `IonExchanger` -- a
    unit operation -- called it.  That single include was one half of the
    `unitOperations` <-> `propertyOps` cycle: a props BENCH and a process UNIT
    both need to turn the same declared block into the same solver input, and
    the shared thing had been filed inside one of the two consumers.

    `module-boundaries.md` §2 already rules where a record reader belongs:
    *record resolution belongs to thermo, through one seam.*  This is a record
    reader.  It reads the resin asset, it fills a `thermo::electrolyte` input
    struct, and it needs nothing from either consumer -- which the extraction
    confirmed rather than assumed: the moved code referenced no `propertyOps`
    symbol at all.

    §3's rule for a shared helper is the same one seen from the other side:
    the lowest NEUTRAL layer that can own the concept.  Neither consumer was
    neutral; `thermo` is.
\*---------------------------------------------------------------------------*/

#pragma once

#include "thermo/electrolyte/SpeciationSolver.H"

namespace Choupo {
namespace electrolyte {

void readExchange(const DictPtr& dict, SpeciationInput& in,
                  const SpeciationSolver& solver, int verbosity);

} // namespace electrolyte
} // namespace Choupo
