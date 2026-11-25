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
    LineSearch.H

Description
    The backtracking line search of Algorithm A, step A-5 (the globalization
    MECHANISM; the acceptance RULES are FilterGlobalization,
    docs/design/interior-point.md sec. 2.5, 2.14; Theory Guide
    sec:ip-filter):

        for l = 0, 1, ...:   alpha = 2^-l alpha_max
            evaluate the trial point x + alpha dx   (a failed evaluation rejects it)
            accept it when FilterGlobalization::test says so
            stop with failure when alpha falls below alpha_min (23)

    The second-order correction of L1 sec. 2.4 is slice A3 and is NOT here: a
    rejected full step is simply halved.  The line search knows nothing about
    the problem: the caller hands it a function that evaluates a trial and
    returns (theta+, phi+).
\*---------------------------------------------------------------------------*/

#pragma once

#include "solver/ip/Globalization.H"

#include <cstddef>
#include <functional>

namespace Choupo::solver
{

struct LineSearchResult
{
    bool        accepted = false;
    scalar      alpha = 0.0;                 //- the accepted step length (the last tried on failure)
    FilterGlobalization::Verdict verdict = FilterGlobalization::Verdict::Reject;
    std::size_t trials = 0;                  //- trial points evaluated or rejected
};

//- trial(alpha, theta, phi): evaluate x + alpha dx; false when the evaluation
//  failed.  When the line search returns accepted, the LAST trial is the
//  accepted one (the caller keeps what it computed there).
using TrialFunction = std::function<bool(scalar alpha, scalar& theta, scalar& phi)>;

LineSearchResult backtrackingLineSearch(const FilterGlobalization& filter,
                                        const FilterGlobalization::Current& current,
                                        scalar alphaMax, const TrialFunction& trial);

} // namespace Choupo::solver
