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

#include "Eucken.H"
#include "thermo/Component.H"

namespace Choupo {

scalar Eucken::conductivityGasPure(const Component& c, scalar /*T_K*/,
                                   scalar mu_pure, scalar cp_ig_pure) const
{
    constexpr scalar R = 8.314462618;            // J/(mol·K)
    // Component MW is kg/kmol (= g/mol numerically); Eucken needs kg/mol.
    const scalar M_kg_per_mol = c.MW() / 1000.0;
    if (M_kg_per_mol <= 0.0) return 0.0;

    //  λ = (Cp + 5R/4) · μ / M     [W/(m·K)]
    return (cp_ig_pure + 1.25 * R) * mu_pure / M_kg_per_mol;
}

} // namespace Choupo
