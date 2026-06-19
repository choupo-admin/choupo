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

#include "SatoRiedel.H"
#include "thermo/Component.H"

#include <cmath>
#include <stdexcept>

namespace Choupo {

scalar SatoRiedel::conductivityLiquidPure(const Component& c, scalar T) const
{
    const scalar M  = c.MW();        // g/mol (= kg/kmol numerically)
    const scalar Tc = c.Tc();        // K
    const scalar Tb = c.Tb();        // K
    if (M <= 0.0 || Tc <= 0.0 || Tb <= 0.0)
        throw std::runtime_error("SatoRiedel: component '" + c.name()
            + "' needs MW, Tb and Tc in its.dat.");

    const scalar Tr  = T  / Tc;
    const scalar Tbr = Tb / Tc;
    const scalar num = 3.0 + 20.0 * std::pow(1.0 - Tr,  2.0 / 3.0);
    const scalar den = 3.0 + 20.0 * std::pow(1.0 - Tbr, 2.0 / 3.0);
    return (1.1053 / std::sqrt(M)) * num / den;       // W/(m·K)
}

} // namespace Choupo
