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

#include "Jacobian.H"

#include <algorithm>
#include <cmath>

namespace Choupo::solver
{

namespace
{
// sqrt of double machine epsilon -- the classic forward-difference step scale.
const scalar kSqrtEps = std::sqrt(2.220446049250313e-16);
}

std::vector<sVector> fdJacobianODE(const DerivFn& f,
                                   scalar         t,
                                   const sVector& y,
                                   const sVector& f0,
                                   const sVector& typ)
{
    const std::size_t n = y.size();
    std::vector<sVector> J(n, sVector(n, 0.0));
    sVector yp = y;
    for (std::size_t j = 0; j < n; ++j)
    {
        const scalar scale = std::max(std::abs(y[j]),
                                      (j < typ.size() ? std::abs(typ[j]) : 1.0));
        scalar eps = kSqrtEps * std::max(scale, 1.0e-30);
        // Keep the perturbation off an exact zero.
        if (eps == 0.0) eps = kSqrtEps;
        yp[j] = y[j] + eps;
        const sVector fp = f(t, yp);
        yp[j] = y[j];
        const scalar inv = 1.0 / eps;
        for (std::size_t i = 0; i < n; ++i)
            J[i][j] = (fp[i] - f0[i]) * inv;
    }
    return J;
}

sVector fdDfDt(const DerivFn& f, scalar t, const sVector& y,
               const sVector& f0, scalar tScale)
{
    const std::size_t n = y.size();
    const scalar dt = kSqrtEps * std::max(std::abs(t), std::max(tScale, 1.0e-30));
    if (dt == 0.0) return sVector(n, 0.0);
    const sVector fp = f(t + dt, y);
    sVector d(n);
    const scalar inv = 1.0 / dt;
    for (std::size_t i = 0; i < n; ++i) d[i] = (fp[i] - f0[i]) * inv;
    return d;
}

} // namespace Choupo::solver
