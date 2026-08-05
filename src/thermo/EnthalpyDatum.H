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
    Choupo::missingEnthalpyData

Description
    Which species PRESENT in a stream have no enthalpy datum -- the query
    behind every "the energy balance is REFUSED, and here is why" message.

    WHY IT IS IN `thermo` (debt D7, paid 2026-08-05).  It lived in
    `reporting/BalanceMath.H`, and `unitOperations/flowsheet/Flowsheet.cpp`
    included that header to reach it -- the last upward edge in the whole
    subsystem graph, and the last unaccepted cycle.

    `module-boundaries.md` §3 had already ruled on this exact function:
    *"the calculation is `thermo.hasEnthalpyDatum(i)` over present species -- a
    THERMO QUERY WEARING A REPORTING JACKET.  Extracts downward whole."*  It
    does: two callers, no reporting vocabulary, nothing formatted.

    Worth recording that the debt register named this a DECISION one commit
    before it turned out to be a MOVE.  The measurement said `unitOperations`
    reaches `reporting`, and `BalanceMath.H` as a whole genuinely cannot come
    down -- it needs a flash to price a two-phase enthalpy.  But the edge was
    never about the header; `Flowsheet` used exactly ONE symbol out of it, and
    that symbol was already ruled neutral.  *An edge is a dependency on what is
    USED, not on the file it arrived in.*

    Absent species (z_i = 0 AND s_i = 0) are deliberately NOT listed: their
    skip is legitimate physics.  An empty result means every present species is
    placeable on the elements datum, so the stream's enthalpy is trustworthy.
    This is the no-silent-crutch boundary -- a present species without a datum
    is a refusal, not a quiet drop.
\*---------------------------------------------------------------------------*/

#pragma once

#include "core/Types.H"
#include "thermo/ThermoPackage.H"

#include <string>
#include <vector>

namespace Choupo {

//  It takes the two COMPOSITION VECTORS, not the stream that carries them.
//  The first version took a `ProcessStream&`, which compiled, passed, and
//  created a `thermo` <-> `streams` cycle that had not existed before -- the
//  gate failed on the very next run.  A thermo query has no business knowing
//  what a stream IS; it needs the fluid and solid amounts, and nothing else.
inline std::vector<std::string> missingEnthalpyData(const std::vector<scalar>& z,
                                                    const std::vector<scalar>& s,
                                                    const ThermoPackage& thermo)
{
    std::vector<std::string> miss;
    for (std::size_t i = 0; i < thermo.n(); ++i)
    {
        const scalar zi = (i < z.size()) ? z[i] : 0.0;
        const scalar si = (i < s.size()) ? s[i] : 0.0;
        if (zi <= 0.0 && si <= 0.0) continue;        // absent by composition
        if (!thermo.hasEnthalpyDatum(i)) miss.push_back(thermo.comp(i).name());
    }
    return miss;
}

} // namespace Choupo
