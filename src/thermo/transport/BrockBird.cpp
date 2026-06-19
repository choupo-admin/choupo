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

#include "BrockBird.H"
#include "thermo/Component.H"

#include <cmath>
#include <stdexcept>

namespace Choupo {

scalar BrockBird::sigmaPure(const Component& c, scalar T) const
{
    const scalar Tc = c.Tc();   // K
    const scalar Pc = c.Pc();   // bar
    const scalar Tb = c.Tb();   // K (normal boiling point)

    if (Tc <= 0.0 || Pc <= 0.0 || Tb <= 0.0)
        throw std::runtime_error(
            "BrockBird: component '" + c.name() + "' needs Tc, Pc and Tb"
            " (normal boiling point) for the corresponding-states surface"
            " tension -- one of them is missing.");

    const scalar Tr  = T  / Tc;
    if (Tr >= 1.0)
        throw std::runtime_error(
            "BrockBird: '" + c.name() + "' is supercritical at this T (Tr >= 1)"
            " -- no liquid surface exists above the critical point.");
    const scalar Tbr = Tb / Tc;

    // Q from the reduced boiling point.  Pc in bar; 1.01325 bar = 1 atm.
    const scalar Q = 0.1196 * (1.0 + Tbr * std::log(Pc / 1.01325) / (1.0 - Tbr))
                   - 0.279;

    // sigma in dyn/cm = mN/m, then -> N/m.
    const scalar sigma_dyn = std::pow(Pc, 2.0 / 3.0) * std::pow(Tc, 1.0 / 3.0)
                           * Q * std::pow(1.0 - Tr, 11.0 / 9.0);
    return sigma_dyn * 1.0e-3;                          // N/m
}

} // namespace Choupo
