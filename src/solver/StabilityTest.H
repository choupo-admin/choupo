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
Namespace
    Choupo::solver

Description
    Michelsen tangent-plane-distance (TPD) stability test, simplified
    for the educational target.  Reference: Michelsen (1982),
    "The Isothermal Flash Problem. Part I. Stability".

    Given a feed composition z at (T, P) and the activity-coefficient
    model of one phase, the test asks:

        "Is there another composition y at which the chemical potential
         of every component lies strictly below the tangent plane drawn
         at z ?"

    If yes (TPD < 0), the feed is unstable and a phase split exists.
    The converged y is then a sound initial guess for the dominant
    incipient phase in a 2-phase Rachford-Rice solve.

    Numerical procedure (successive substitution on Y, where y = Y/ΣY):

        h_i      = ln(z_i  · γ_i(z) )
        Y_i^{0}  = small bias toward a single pure component (one trial
                   per pure component is sufficient for binary; more for
                   higher dimensions)

        Y_i^{m+1}    = exp(h_i - ln γ_i(y^{m}) )
        y^{m+1}      = Y^{m+1} / Σ Y^{m+1}
        tm           = 1 + Σ Y_i (ln Y_i - 1 ) - Σ Y_i · h_i

        converged → check  ΣY > 1  (or tm < 0  for stability decision)

    For multi-component, runs one probe per pure-component starting
    point and keeps the most stable (lowest tm) one.
\*---------------------------------------------------------------------------*/

#pragma once

#include "core/Types.H"
#include "thermo/phase/Phase.H"

namespace Choupo::solver {

struct StabilityResult
{
    bool      unstable   = false;     // true if a phase split was detected
    scalar    tmMin      = 0.0;       // smallest tm found across all probes
    sVector   trialY;                 // converged composition of incipient phase
    int       iterations = 0;
    int       probeIndex = -1;        // which pure-component probe gave tmMin
};

// Run the Michelsen stability test.
//   phase  — the liquid phase whose γ(T,x) is queried
//   T      — temperature [K]
//   P      — pressure [bar]  (unused for liquid γ models but kept uniform)
//   z      — feed composition (Σz = 1)
//   tmTol  — threshold for declaring instability (typical: -1e-3 to 0)
StabilityResult michelsenTPD(const Phase&    phase,
    scalar          T,
    scalar          P,
    const sVector&  z,
    scalar          tmTol     = -1.0e-3,
    int             maxIter   = 100,
    scalar          ssTol     = 1.0e-6);

} // namespace Choupo::solver
