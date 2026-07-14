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
    Choupo::InfeasibleTrial

Description
    A unit operation reports that a TEMPORARY trial point handed to it by a
    nonlinear solver is physically infeasible (e.g. a distillation column whose
    bottoms B = F - D - draws would be <= 0), WITHOUT declaring the whole case
    invalid.  The distinction (ratified 2026-07-07):

        accepted / base state infeasible  ->  a real model/case error (fatal)
        temporary TRIAL state infeasible  ->  a recoverable domain failure

    A solver that is PROBING (a finite-difference Jacobian column, a Newton
    trial step / line search) catches this and recovers: shrink the step, use a
    one-sided difference, or backtrack.  It is NOT a silent clamp (the solver
    never receives R(x_tilde) when it asked for R(x+h)) and NOT an arbitrary
    penalty residual (which would corrupt the Jacobian scale).  A unit throws
    this only on a genuinely infeasible input; any OTHER exception still
    propagates as a real error.
\*---------------------------------------------------------------------------*/

#pragma once

#include <stdexcept>
#include <string>

namespace Choupo
{

struct InfeasibleTrial : public std::runtime_error
{
    explicit InfeasibleTrial(const std::string& why) : std::runtime_error(why) {}
};

} // namespace Choupo
