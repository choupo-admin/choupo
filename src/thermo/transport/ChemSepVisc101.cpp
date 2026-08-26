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
\*---------------------------------------------------------------------------*/

#include "ChemSepVisc101.H"
#include "core/Advisory.H"
#include "thermo/Component.H"

#include <cmath>
#include <stdexcept>
#include <string>

namespace Choupo {

scalar ChemSepVisc101::viscosityLiquidPure(const Component& c, scalar T) const
{
    if (!c.hasLiquidViscosity())
        throw std::runtime_error("chemsepEq101 viscosity: component '"
            + c.name() + "' has no `liquidViscosity` block in its .dat.");
    auto lv = c.liquidViscosityDict();
    if (!lv->found("chemsepEq101"))
        throw std::runtime_error("chemsepEq101 viscosity: component '"
            + c.name() + "' has a liquidViscosity block but no"
            " `chemsepEq101 { A; B; C; D; E; }` sub-block.");
    auto p = lv->subDict("chemsepEq101");

    if (T <= 0)
        throw std::runtime_error("chemsepEq101 viscosity: T <= 0 K");

    //  THE WINDOW IS ANNOUNCED, NEVER ENFORCED -- the same posture every other
    //  correlation in this tree takes (I4).  Extrapolating a viscosity fit is
    //  a real thing to do; doing it without knowing is not.  Announced ONCE
    //  per component through the AdvisoryLog, which outlives this object:
    //  a latch on the model instance would re-announce for every rebuild,
    //  which is the 102-identical-paragraphs defect of 2026-08-25.
    if (p->found("Tmin") && p->found("Tmax"))
    {
        const scalar lo = p->lookupScalar("Tmin");
        const scalar hi = p->lookupScalar("Tmax");
        if (hi > lo && (T < lo || T > hi))
            AdvisoryLog::instance().add(
                "validity", "warning", "component '" + c.name() + "'",
                "liquid viscosity evaluated at T = " + std::to_string(T)
                + " K, OUTSIDE its declared range (" + std::to_string(lo)
                + " " + std::to_string(hi) + ") -- extrapolated, still"
                " returned");
    }

    const scalar A = p->lookupScalar("A");
    const scalar B = p->lookupScalar("B");
    const scalar C = p->lookupScalarOrDefault("C", 0.0);
    const scalar D = p->lookupScalarOrDefault("D", 0.0);
    const scalar E = p->lookupScalarOrDefault("E", 0.0);
    return std::exp(A + B / T + C * std::log(T)
                    + (D != 0.0 ? D * std::pow(T, E) : 0.0));   // Pa.s
}

} // namespace Choupo
