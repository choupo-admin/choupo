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
    InertiaCorrection.H

Description
    Algorithm IC: the inertia correction of the primal-dual step
    (docs/design/interior-point.md sec. 2.3; Wachter & Biegler 2006, sec. 3.1,
    Algorithm IC; Theory Guide sec:ip-inertia).

    The step solves K (dx, dlambda) = rhs with
        K = [ W + Sigma + dw I      A    ]
            [      A^T           -dc I   ]
    and is a descent direction for the line search only if K has inertia
    (n, m, 0).  Algorithm IC, as the code runs it:
      IC-1  factor with dw = dc = 0 (dc > 0 from the start once the
            first-iterations rule below has fired); inertia (n,m,0): use it
      IC-2  zero eigenvalues present (or the factorisation BROKE DOWN: DenseLDLT
            reports a singular 2x2 block or an unremovable zero pivot as
            ok() false, which is the same news): dc = dcBar mu^kappaC, else dc = 0
      IC-3  dw = dw0Bar if no dw was needed last time, else max(dwMin, kappaW- dwLast)
      IC-4  factor; inertia right: dwLast = dw, use the step
      IC-5  dw *= kappaW+Bar (nothing was needed last time) or kappaW+
      IC-6  dw > dwMax: abandon the step (the caller starts the restoration phase)
    A factorisation whose solve has a backward error above
    kBackwardErrorLimit (review R4, SymmetricIndefinite.H) is a WRONG
    factorisation: it is treated like a wrong inertia (dw grows) and its step is
    never used.  The deviation of L1 sec. 3.1, implemented and announced: if K
    is singular in the first three iterations, dc stays > 0 in IC-1 of every
    later iteration.
\*---------------------------------------------------------------------------*/

#pragma once

#include "solver/ip/IPParameters.H"
#include "solver/ip/NLPProblem.H"
#include "solver/ip/SymmetricIndefinite.H"

#include <cstddef>
#include <string>
#include <vector>

namespace Choupo::solver
{

struct InertiaCorrectionResult
{
    bool        ok = false;          //- false: IC-6, no usable step
    sVector     solution;            //- (dx, dlambda)
    Inertia     inertia;             //- of the accepted factorisation (or the last tried)
    scalar      dw = 0.0, dc = 0.0;  //- the regularisation that was used
    std::size_t factorisations = 0;
    scalar      backwardError = 0.0; //- of the accepted solve
    std::vector<std::string> notes;  //- one line per trial, for the trace
};

class InertiaCorrection
{
public:
    InertiaCorrection(SymmetricIndefinite& factoriser, const IPParameters& p)
        : ldlt_(factoriser), p_(p) {}

    //- K0 is the (n+m) x (n+m) matrix with dw = dc = 0 (lower triangle read);
    //  rhs the right-hand side; mu the barrier parameter; iteration the
    //  index of the current iteration (the first-iterations rule).
    InertiaCorrectionResult correct(const DenseMatrix& K0, std::size_t n, std::size_t m,
                                    scalar mu, std::size_t iteration, const sVector& rhs);

    scalar lastDw() const { return dwLast_; }
    bool   keepsDc() const { return keepDc_; }

private:
    SymmetricIndefinite& ldlt_;
    const IPParameters&  p_;
    scalar dwLast_ = 0.0;
    bool   keepDc_ = false;
};

} // namespace Choupo::solver
