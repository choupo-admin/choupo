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

#include "Wegstein.H"

#include <algorithm>
#include <cmath>

namespace Choupo::solver {

Wegstein::Wegstein(std::size_t n, scalar qMin, scalar qMax)
:   n_(n), qMin_(qMin), qMax_(qMax),
    xPrev_(n, 0.0), gPrev_(n, 0.0), qLast_(n, 0.0)
{}

void Wegstein::reset()
{
    ncalls_ = 0;
    std::fill(xPrev_.begin(), xPrev_.end(), 0.0);
    std::fill(gPrev_.begin(), gPrev_.end(), 0.0);
    std::fill(qLast_.begin(), qLast_.end(), 0.0);
}

sVector Wegstein::step(const sVector& x, const sVector& gx)
{
    sVector xNext(n_);

    if (ncalls_ == 0)
    {
        // First call -- no history.  Accept direct substitution.
        xNext  = gx;
        xPrev_ = x;
        gPrev_ = gx;
        std::fill(qLast_.begin(), qLast_.end(), 0.0);
        ++ncalls_;
        return xNext;
    }

    constexpr scalar epsX = 1.0e-14;   // skip if x barely moved
    constexpr scalar epsS = 1.0e-10;   // skip if s ≈ 1

    for (std::size_t i = 0; i < n_; ++i)
    {
        scalar dx = x[i]  - xPrev_[i];
        scalar dg = gx[i] - gPrev_[i];
        scalar q;
        if (std::abs(dx) < epsX)
        {
            q = 0.0;                              // no movement, plain
        }
        else
        {
            scalar s = dg / dx;
            if (std::abs(s - 1.0) < epsS)
                q = 0.0;                          // degenerate (g ~ x + c)
            else
                q = std::clamp(s / (s - 1.0), qMin_, qMax_);
        }
        qLast_[i] = q;
        xNext[i]  = q * x[i] + (1.0 - q) * gx[i];
    }

    xPrev_ = x;
    gPrev_ = gx;
    ++ncalls_;
    return xNext;
}

} // namespace Choupo::solver
