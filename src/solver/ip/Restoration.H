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
File
    Restoration.H

Description
    The restoration phase: what the optimizer does when the line search cannot
    find an acceptable step (docs/design/interior-point.md sec. 2.7; Wachter &
    Biegler 2006, sec. 3.3.1; Theory Guide sec:ip-restoration).  Slice A2 has
    the robust route, the MINIMUM-VIOLATION interior-point problem; the cheap
    "KKT error reduction" route of L1 sec. 3.3.2 is slice A3.

    From the point x_R where the regular iteration failed, solve by the SAME
    interior-point algorithm (Algorithm A, without a restoration of its own)

        min   rho sum_j (p_j + n_j)  +  (zeta/2) || D_R (x - x_R) ||^2
        s.t.  c(x) - p + n = 0,    xL <= x <= xU,    p, n >= 0

    rho = 1000, zeta = sqrt(mu), D_R = diag(min(1, 1/|x_R,i|)), the start of
    (p, n) in closed form (L1 (33)), the barrier parameter started at
    max(mu, ||c(x_R)||_inf).  p and n are the positive and negative parts of the
    violation, so the first term is rho ||c||_1 and the problem is the
    smoothed minimisation of the infeasibility that stays close to x_R.

    It ends in one of three ways:
      Recovered          the iterate is acceptable to the filter and its
                         infeasibility theta <= kappa_resto theta(x_R)
                         (the caller's exit test): the regular iteration resumes;
      LocallyInfeasible  the restoration problem CONVERGED, to a point whose
                         infeasibility is still above the tolerance: a LOCAL
                         minimum of ||c||_1 (the problem may be infeasible, or
                         feasible elsewhere from another start), and the rows
                         still violated are named with their residuals;
      Failed             the inner run hit its iteration limit, an evaluation
                         failure or another stop.
\*---------------------------------------------------------------------------*/

#pragma once

#include "solver/ip/IPParameters.H"
#include "solver/ip/NLPProblem.H"

#include <cstddef>
#include <functional>
#include <string>
#include <vector>

namespace Choupo::solver
{

struct RestorationOutcome
{
    enum class Kind { Recovered, LocallyInfeasible, Failed };
    Kind        kind = Kind::Failed;
    sVector     x;                           //- the point reached (Recovered)
    std::string note;                        //- one line for the trace
    std::vector<std::string> violatedRows;   //- "name: residual", worst first (LocallyInfeasible)
    std::size_t innerIterations = 0;
    scalar      theta = 0.0;                 //- ||c(x)||_1 at the point reached
};

//- core        the equality-form problem the optimizer is solving (c(x) = 0)
//  xLower/Upper its (relaxed) bounds
//  xR, mu       the point where the line search failed and the barrier parameter
//  exitTest     the caller's "acceptable to the filter and theta <= kappa_resto theta(x_R)"
//  rowScale     the scaling of the rows (to report unscaled residuals), or nullptr
RestorationOutcome runRestoration(const NLPProblem& core, const sVector& xLower, const sVector& xUpper,
                                  const sVector& xR, scalar mu, const IPParameters& par,
                                  const std::function<bool(const sVector&)>& exitTest,
                                  const sVector* rowScale);

} // namespace Choupo::solver
