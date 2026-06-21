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

#include "RK4.H"

#include <cmath>

namespace Choupo::solver
{

ODEStats RK4::integrate(sVector& y, scalar t0, scalar t1,
                        const DerivFn& f, const ODEControls& ctrl) const
{
    ODEStats st;
    const scalar span = t1 - t0;
    if (span <= 0.0) return st;

    scalar h = (ctrl.hInit > 0.0) ? ctrl.hInit : span;
    if (h > span) h = span;
    const std::size_t nsteps =
        static_cast<std::size_t>(std::ceil(span / h - 1.0e-12));
    h = span / static_cast<scalar>(nsteps == 0 ? 1 : nsteps);

    auto axpy = [](const sVector& x, scalar a, const sVector& v) {
        sVector r(x.size());
        for (std::size_t i = 0; i < x.size(); ++i) r[i] = x[i] + a * v[i];
        return r;
    };

    scalar t = t0;
    for (std::size_t s = 0; s < nsteps; ++s)
    {
        const sVector k1 = f(t,            y);
        const sVector k2 = f(t + 0.5 * h,  axpy(y, 0.5 * h, k1));
        const sVector k3 = f(t + 0.5 * h,  axpy(y, 0.5 * h, k2));
        const sVector k4 = f(t + h,        axpy(y,       h, k3));
        for (std::size_t i = 0; i < y.size(); ++i)
            y[i] += h / 6.0 * (k1[i] + 2.0 * k2[i] + 2.0 * k3[i] + k4[i]);
        t += h;
        ++st.steps;
        ++st.accepted;
        // Honest failure: an explicit method on a stiff system overflows.
        bool bad = false;
        for (scalar v : y) if (!std::isfinite(v)) { bad = true; break; }
        if (bad) { st.ok = false; break; }
    }
    st.hLast    = h;
    st.hMinUsed = h;
    return st;
}

} // namespace Choupo::solver
