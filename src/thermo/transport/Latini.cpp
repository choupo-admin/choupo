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

#include "Latini.H"
#include "thermo/Component.H"

#include <cmath>
#include <stdexcept>

namespace Choupo {

Latini::Latini(const DictPtr& dict)
:
    // Defaults: saturated-hydrocarbon family.
    Astar_(dict->lookupScalarOrDefault("Astar", 0.00350)),
    alpha_(dict->lookupScalarOrDefault("alpha", 1.2)),
    beta_ (dict->lookupScalarOrDefault("beta",  0.5)),
    gamma_(dict->lookupScalarOrDefault("gamma", 0.167))
{}

scalar Latini::conductivityLiquidPure(const Component& c, scalar T) const
{
    const scalar M  = c.MW();        // g/mol
    const scalar Tc = c.Tc();        // K
    const scalar Tb = c.Tb();        // K
    if (M <= 0.0 || Tc <= 0.0 || Tb <= 0.0)
        throw std::runtime_error("Latini: component '" + c.name()
            + "' needs MW, Tb and Tc in its.dat.");

    const scalar A  = Astar_ * std::pow(Tb, alpha_)
                    / (std::pow(M, beta_) * std::pow(Tc, gamma_));
    const scalar Tr = T / Tc;
    return A * std::pow(1.0 - Tr, 0.38) / std::pow(Tr, 1.0 / 6.0);   // W/(m·K)
}

} // namespace Choupo
