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

#include "Vogel.H"
#include "thermo/Component.H"

#include <cmath>
#include <stdexcept>

namespace Choupo {

scalar Vogel::viscosityLiquidPure(const Component& c, scalar T) const
{
    if (!c.hasLiquidViscosity())
        throw std::runtime_error("Vogel viscosity: component '" + c.name()
            + "' has no `liquidViscosity` block in its.dat.");
    auto lv = c.liquidViscosityDict();
    if (!lv->found("vogel"))
        throw std::runtime_error("Vogel viscosity: component '" + c.name()
            + "' has a liquidViscosity block but no `vogel { A; B; C; }`"
            " sub-block.");
    auto v = lv->subDict("vogel");
    const scalar A = v->lookupScalar("A");
    const scalar B = v->lookupScalar("B");
    const scalar C = v->lookupScalarOrDefault("C", 0.0);
    return std::exp(A + B / (T - C));    // Pa·s
}

} // namespace Choupo
