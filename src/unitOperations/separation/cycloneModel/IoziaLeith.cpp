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

#include "IoziaLeith.H"

#include <cmath>

namespace Choupo {

void IoziaLeith::readParameters(const DictPtr& oper)
{
    beta_ = oper->lookupScalarOrDefault("beta", 3.5);
}

scalar IoziaLeith::cutDiameter(const CycloneContext& c) const
{
    constexpr scalar PI = 3.14159265358979;
    const scalar b = c.Dc / 4.0;
    return std::sqrt(9.0 * c.mu * b
                     / (2.0 * PI * c.Ne * c.vi * (c.rho_p - c.rho_g)));
}

scalar IoziaLeith::gradeEfficiency(scalar d, const CycloneContext& c) const
{
    const scalar d50 = cutDiameter(c);
    return 1.0 / (1.0 + std::pow(d50 / d, beta_));
}

} // namespace Choupo
