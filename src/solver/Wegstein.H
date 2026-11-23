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
-------------------------------------------------------------------------------
Class
    Choupo::solver::Wegstein

Description
    Component-wise Wegstein acceleration for fixed-point iteration

        x_{k+1} = g(x_k)

    For each component i, a secant approximation of the local derivative
    g'_i is built from the two most recent calls:

        s_i = (g_i^k - g_i^{k-1} ) / (x_i^k - x_i^{k-1} )

    The Wegstein step is

        q_i        = s_i / (s_i - 1)            (clamped to [qMin, qMax])
        x_i^{k+1}  = q_i x_i^k + (1 - q_i) g_i(x_i^k)

    With q in (-∞, 0], the update *over-relaxes* toward g(x_k):
        q = 0 → direct substitution (w = 1 - q = 1); q = 0.5 → 50/50 average (w = 0.5)
        q = -1  → a step twice the direct one (w = 2)
        q < -1  → strong acceleration

    Wegstein is equivalent to one Newton step on F(x) = x - g(x), using
    the secant slope as a Jacobian surrogate; see Wegstein (1958).

    A typical clamp range is [-5, 0]: positive q would amplify the slow
    direction (counter-productive), and very negative q risks instability.

    Sequential-modular flowsheet solvers use the
    same scheme on tear-stream variables.
\*---------------------------------------------------------------------------*/

#pragma once

#include "core/Types.H"

#include <cstddef>
#include <vector>

namespace Choupo::solver {

class Wegstein
{
public:
    explicit Wegstein(std::size_t n,
                      scalar qMin = -5.0,
                      scalar qMax =  0.0);

    // Compute the accelerated next iterate.
    //   x       -- current iterate                  (input)
    //   gx      -- result of direct substitution    g(x)
    // Returns x_next.  Internally records (x, gx) for the next call;
    // the very first call has no history and returns gx unchanged.
    sVector step(const sVector& x, const sVector& gx);

    void reset();

    //  THE ENTRIES THAT CANNOT BE NEGATIVE AT A FIXED POINT (a pressure).  For such an entry the
    //  secant model x* = (g - s x)/(1 - s) names where the acceleration is heading; when that
    //  point is not positive the loop has no feasible fixed point (a pressure-inconsistent
    //  recycle drifting by the same dP every pass looks like a slope of 1 - 3e-4 and "converges"
    //  to -160 bar), and the acceleration is withheld for that entry: plain substitution, so the
    //  loop runs its passes and is refused by the tear's name, not by a pipe at 0.0135 bar.
    //  Neither Wegstein (1958) nor Biegler, Grossmann & Westerberg (1997) states a bound of this
    //  kind (the first only classifies q by the slope, the second does not treat the method);
    //  it is this engine's declaration, stated here and in the Theory Guide.
    void setPositiveEntries(const std::vector<char>& mask) { positive_ = mask; }

    int callCount()  const { return ncalls_; }
    // Last vector of per-component q values (clamped) — for logging.
    const sVector& lastQ() const { return qLast_; }
    //  What the LAST step did to each entry's secant coefficient: 0 no secant was formed (first
    //  call, x did not move, s = 1), 1 q taken as the secant gave it, 2 cut UP to qMin, 3 cut
    //  DOWN to qMax.  The recycle report counts these so the clamp is never silent.
    const std::vector<char>& lastStatus() const { return status_; }

private:
    std::size_t n_;
    scalar      qMin_, qMax_;
    sVector     xPrev_;
    sVector     gPrev_;
    sVector     qLast_;
    std::vector<char> status_;
    std::vector<char> positive_;
    int         ncalls_ = 0;
};

} // namespace Choupo::solver
