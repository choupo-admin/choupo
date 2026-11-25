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
    LineSearch.cpp

Description
    Backtracking line search, Algorithm A step A-5.  See LineSearch.H.
\*---------------------------------------------------------------------------*/

#include "solver/ip/LineSearch.H"

#include <cmath>

namespace Choupo::solver
{

namespace { constexpr std::size_t kMaxTrials = 60; }

LineSearchResult backtrackingLineSearch(const FilterGlobalization& filter,
                                        const FilterGlobalization::Current& current,
                                        scalar alphaMax, const TrialFunction& trial)
{
    LineSearchResult r;
    const scalar alphaMin = filter.minimumStep(current);   //- (23)
    scalar alpha = alphaMax;
    //  The paper tests (23) BEFORE the first trial: a step already below alpha_min is not tried.
    if (alpha < alphaMin) { r.alpha = alpha; return r; }
    for (;;)
    {
        r.alpha = alpha;
        ++r.trials;
        scalar thetaT = 0.0, phiT = 0.0;
        if (trial(alpha, thetaT, phiT))      //- a failed evaluation is a rejected trial
        {
            const auto v = filter.test(current, alpha, thetaT, phiT);
            if (v != FilterGlobalization::Verdict::Reject)
            {
                r.accepted = true;
                r.verdict = v;
                return r;
            }
        }
        alpha *= 0.5;
        //  (23): give up, the caller starts the restoration phase.  At theta = 0
        //  alpha_min is 0, so the number of halvings is capped as well (2^-60).
        if (alpha < alphaMin || r.trials >= kMaxTrials) return r;
    }
}

} // namespace Choupo::solver
