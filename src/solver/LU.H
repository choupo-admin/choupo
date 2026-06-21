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
    LU.H

Description
    Dense LU factorisation with partial (row) pivoting, split out of gaussSolve
    so one factorisation of A can be REUSED across several right-hand sides --
    the Rosenbrock stiff integrator factors the iteration matrix W = I-gamma*h*J
    once per step and back-solves it three times.  Pedagogical, no BLAS/LAPACK.

        luFactor: overwrites A with its L\U factors (unit-diagonal L implied)
                  and fills the pivot permutation piv.  Throws if singular.
        luSolve:  forward/back substitution for one right-hand side b.
\*---------------------------------------------------------------------------*/

#pragma once

#include "core/Types.H"

#include <cstddef>
#include <vector>

namespace Choupo::solver
{

void    luFactor(std::vector<sVector>& A, std::vector<std::size_t>& piv);
sVector luSolve (const std::vector<sVector>& LU,
                 const std::vector<std::size_t>& piv,
                 sVector b);

} // namespace Choupo::solver
