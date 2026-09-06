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

#include "GasMixingRules.H"

#include <cmath>

namespace Choupo {
namespace gasMixing {

scalar wilkePhi(scalar eta_i, scalar eta_j, scalar M_i, scalar M_j)
{
    //  The expression EXACTLY as ThermoPackage carried it (twice), operation
    //  for operation, so moving it here moves no pinned number.
    const scalar t = 1.0 + std::sqrt(eta_i / eta_j) * std::pow(M_j / M_i, 0.25);
    return (t * t) / std::sqrt(8.0 * (1.0 + M_i / M_j));
}

scalar wilkeSum(const sVector& y, const sVector& q,
                const sVector& eta, const sVector& M)
{
    const std::size_t N = y.size();
    scalar out = 0.0;
    for (std::size_t i = 0; i < N; ++i)
    {
        if (y[i] <= 0.0) continue;
        scalar denom = 0.0;
        for (std::size_t j = 0; j < N; ++j)
        {
            if (y[j] <= 0.0) continue;
            denom += y[j] * wilkePhi(eta[i], eta[j], M[i], M[j]);
        }
        if (denom > 0.0) out += y[i] * q[i] / denom;
    }
    return out;
}

const std::string& wilkeCitation()
{
    static const std::string c =
        "Wilke, C. R. (1950), J. Chem. Phys. 18, 517-519";
    return c;
}

const std::string& wassiljewaCitation()
{
    static const std::string c =
        "Wassiljewa, A. (1904), Physik. Z. 5, 737-742; interaction factors "
        "A_ij = phi_ij (Wilke) after Mason, E. A. and Saxena, S. C. (1958), "
        "Phys. Fluids 1, 361-369";
    return c;
}

CorrelationVerify verifyIdentity()
{
    //  Deliberately NOT unity inputs: phi_ii must be 1 for ANY eta and M,
    //  and 1.7e-5 / 28.0 is an ordinary gas rather than a number the
    //  formula could collapse to 1 by accident.
    CorrelationVerify v;
    v.value_choupo = wilkePhi(1.7e-5, 1.7e-5, 28.0, 28.0);
    v.value_published = 1.0;
    v.dev = std::abs(v.value_choupo - v.value_published);
    v.kind = "theory";
    v.anchor = "phi_ii = (1 + 1)^2 / sqrt(8 * 2) = 1 EXACTLY for identical "
               "species, whatever eta and M -- a pure gas must mix to itself; "
               "the exponents 1/2, 1/4 and the factor 8 are what make it hold";
    return v;
}

} // namespace gasMixing
} // namespace Choupo
