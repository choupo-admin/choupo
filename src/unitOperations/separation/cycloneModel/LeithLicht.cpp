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

#include "LeithLicht.H"

#include <cmath>

namespace Choupo {

void LeithLicht::readParameters(const DictPtr& oper)
{
    C_ = oper->lookupScalarOrDefault("C", 402.88);
}

scalar LeithLicht::gradeEfficiency(scalar d, const CycloneContext& c) const
{
    // Vortex exponent (Dc in m, T in K)
    const scalar n = 1.0 - (1.0 - 0.67 * std::pow(c.Dc, 0.14))
                           * std::pow(c.T / 283.0, 0.3);
    // Inertia parameter ψ = ρ_p d^2 Q / (18 μ Dc^3)
    const scalar psi = c.rho_p * d * d * c.Q
                     / (18.0 * c.mu * c.Dc * c.Dc * c.Dc);
    const scalar arg = std::pow(C_ * psi, 1.0 / (2.0 * n + 2.0));
    scalar eta = 1.0 - std::exp(-2.0 * arg);
    if (eta < 0.0) eta = 0.0;
    if (eta > 1.0) eta = 1.0;
    return eta;
}

} // namespace Choupo
