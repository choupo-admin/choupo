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

#include "EulerSI.H"
#include "Jacobian.H"
#include "../LU.H"

#include <cmath>

namespace Choupo::solver
{

ODEStats EulerSI::integrate(sVector& y, scalar t0, scalar t1,
                            const DerivFn& f, const ODEControls& ctrl) const
{
    ODEStats st;
    const std::size_t n = y.size();
    const scalar span = t1 - t0;
    if (span <= 0.0) return st;

    scalar h = (ctrl.hInit > 0.0) ? ctrl.hInit : span;
    if (h > span) h = span;
    const std::size_t nsteps =
        static_cast<std::size_t>(std::ceil(span / h - 1.0e-12));
    h = span / static_cast<scalar>(nsteps == 0 ? 1 : nsteps);

    sVector typ(n, 1.0);
    scalar t = t0;
    for (std::size_t s = 0; s < nsteps; ++s)
    {
        const sVector f0 = f(t, y);
        auto J = fdJacobianODE(f, t, y, f0, typ);     // d f / d y
        // W = I - h J
        for (std::size_t i = 0; i < n; ++i)
            for (std::size_t j = 0; j < n; ++j)
                J[i][j] = (i == j ? 1.0 : 0.0) - h * J[i][j];

        sVector rhs(n);
        for (std::size_t i = 0; i < n; ++i) rhs[i] = h * f0[i];

        std::vector<std::size_t> piv;
        luFactor(J, piv);
        const sVector dy = luSolve(J, piv, rhs);
        for (std::size_t i = 0; i < n; ++i) y[i] += dy[i];

        t += h;
        ++st.steps;
        ++st.accepted;
        bool bad = false;
        for (scalar v : y) if (!std::isfinite(v)) { bad = true; break; }
        if (bad) { st.ok = false; break; }
    }
    st.hLast    = h;
    st.hMinUsed = h;
    return st;
}

} // namespace Choupo::solver
