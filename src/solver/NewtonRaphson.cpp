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

#include "NewtonRaphson.H"

#include <algorithm>
#include <cmath>

namespace Choupo::solver {

NRResult newton1D(const std::function<scalar(scalar)>& f,
    const std::function<scalar(scalar)>& dfdx,
    scalar                               x0,
    const NROptions&                     opts
)
{
    scalar x_lo = opts.lower;
    scalar x_hi = opts.upper;
    scalar x    = std::clamp(x0, x_lo, x_hi);

    scalar residual = 0.0;
    int    it       = 0;

    for (; it < opts.maxIter; ++it)
    {
        scalar fx  = f(x);
        scalar dfx = dfdx(x);
        residual = std::abs(fx);

        // Early break: if we're already at the root, don't take a step.
        // Without this guard, a tiny |fx| combined with a tiny dx and a
        // bracket boundary that has tightened to the current x triggers
        // the bisection fallback below, which catapults x to the middle
        // of [x_lo, x_hi] --- a huge spurious jump after we've already
        // converged.  Reported residual is correct, but the returned x
        // would be the post-bisection one, which is wrong.
        if (residual < opts.tolerance)
        {
            if (opts.onIter)
                opts.onIter(NRTrace{it, x, fx, dfx, 0.0});
            ++it;
            break;
        }

        if (opts.bracket)
        {
            // Decreasing case:  fx>0 means x is below root → tighten lower.
            // Increasing case:  fx>0 means x is above root → tighten upper.
            if (opts.monotoneIncreasing)
                { if (fx > 0.0) x_hi = x; else x_lo = x; }
            else
                { if (fx > 0.0) x_lo = x; else x_hi = x; }
        }

        scalar dx = (std::abs(dfx) > 1e-30) ? -fx / dfx : 0.0;
        if (opts.maxStep > 0.0)
            dx = std::clamp(dx, -opts.maxStep, opts.maxStep);

        scalar x_new = x + dx;
        if (opts.bracket && (x_new <= x_lo || x_new >= x_hi))
            x_new = 0.5 * (x_lo + x_hi);

        if (opts.onIter)
            opts.onIter(NRTrace{it, x, fx, dfx, x_new - x});

        x = x_new;
    }

    return NRResult{x, residual, it, residual < opts.tolerance};
}

} // namespace Choupo::solver
