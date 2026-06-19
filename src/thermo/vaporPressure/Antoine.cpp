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

#include "Antoine.H"

#include "core/Units.H"

#include <cmath>
#include <stdexcept>

namespace Choupo {

Antoine::Antoine(const DictPtr& dict)
:   name_("Antoine")
{
    auto coeffs = dict->lookupList("coefficients");
    if (coeffs.size() != 3)
        throw std::runtime_error("Antoine: 'coefficients' must hold "
            "(A B C); got " + std::to_string(coeffs.size()) + " values");
    A_ = coeffs[0]; B_ = coeffs[1]; C_ = coeffs[2];

    if (dict->found("Trange"))
    {
        auto r = dict->lookupList("Trange");
        if (r.size() != 2)
            throw std::runtime_error("Antoine: 'Trange' must hold (Tmin Tmax)");
        Tmin_ = r[0]; Tmax_ = r[1];
    }
    else { Tmin_ = 0.0; Tmax_ = 0.0; }
}

scalar Antoine::Psat_Pa(scalar T) const
{
    // Antoine published convention: log10(Psat[bar]) = A − B / (T+C).
    // We multiply by bar→Pa so the rest of the simulator can stay in
    // pure SI (Pa) without scattered conversions.
    const scalar Psat_bar = std::pow(10.0, A_ - B_ / (T + C_));
    return Psat_bar * units::bar_to_Pa;
}

} // namespace Choupo
