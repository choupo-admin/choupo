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

#include "ChemSepCond16.H"
#include "core/Advisory.H"
#include "thermo/Component.H"

#include <cmath>
#include <stdexcept>
#include <string>

namespace Choupo {

scalar ChemSepCond16::conductivityLiquidPure(const Component& c, scalar T) const
{
    if (!c.hasLiquidConductivity())
        throw std::runtime_error("chemsepEq16 conductivity: component '"
            + c.name() + "' has no `liquidThermalConductivity` block in its"
            " .dat.  SatoRiedel needs none (it is predictive from MW, Tb and"
            " Tc) -- select that instead, and know it is a prediction.");
    auto lc = c.liquidConductivityDict();
    if (!lc->found("chemsepEq16"))
    {
        //  Same rule as the viscosity twin: enumerate what the record has
        //  rather than guessing a remedy it may not carry.
        std::string have;
        for (const auto& k : lc->keys())
            have += (have.empty() ? "" : ", ") + k;
        throw std::runtime_error("chemsepEq16 conductivity: component '"
            + c.name() + "' has a liquidThermalConductivity block but no"
            " `chemsepEq16 { A; B; C; D; E; }` sub-block."
            + (have.empty()
                 ? std::string("  The block declares nothing at all.")
                 : "  It declares: " + have + " -- select one of those, or"
                   " SatoRiedel, which is predictive from MW, Tb and Tc and"
                   " needs no record at all."));
    }
    auto p = lc->subDict("chemsepEq16");

    if (T <= 0)
        throw std::runtime_error("chemsepEq16 conductivity: T <= 0 K");

    //  ANNOUNCED, NEVER ENFORCED (I4), and through AdvisoryLog rather than an
    //  instance latch: the log outlives every package rebuild, and a latch on
    //  this object would re-announce once per rebuild.
    if (p->found("Tmin") && p->found("Tmax"))
    {
        const scalar lo = p->lookupScalar("Tmin");
        const scalar hi = p->lookupScalar("Tmax");
        if (hi > lo && (T < lo || T > hi))
            AdvisoryLog::instance().add(
                "validity", "warning", "component '" + c.name() + "'",
                "liquid thermal conductivity evaluated at T = "
                + std::to_string(T) + " K, OUTSIDE its declared range ("
                + std::to_string(lo) + " " + std::to_string(hi)
                + ") -- extrapolated, still returned");
    }

    const scalar A = p->lookupScalar("A");
    const scalar B = p->lookupScalar("B");
    const scalar C = p->lookupScalar("C");
    const scalar D = p->lookupScalarOrDefault("D", 0.0);
    const scalar E = p->lookupScalarOrDefault("E", 0.0);
    return A + std::exp(B / T + C + D * T + E * T * T);      // W/(m.K)
}

} // namespace Choupo
