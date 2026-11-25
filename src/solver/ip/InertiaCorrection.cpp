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
    InertiaCorrection.cpp

Description
    Algorithm IC.  See InertiaCorrection.H.
\*---------------------------------------------------------------------------*/

#include "solver/ip/InertiaCorrection.H"

#include <algorithm>
#include <cmath>
#include <cstdio>

namespace Choupo::solver
{

namespace
{

std::string num(scalar v)
{
    char b[32];
    std::snprintf(b, sizeof b, "%.1e", v);
    return b;
}

std::string triple(const Inertia& in)
{
    return "(" + std::to_string(in.positive) + "," + std::to_string(in.negative) + ","
           + std::to_string(in.zero) + ")";
}

} // namespace

InertiaCorrectionResult InertiaCorrection::correct(const DenseMatrix& K0, std::size_t n, std::size_t m,
                                                   scalar mu, std::size_t iteration, const sVector& rhs)
{
    InertiaCorrectionResult r;
    const Inertia wanted{n, m, 0};

    //  One factor-and-solve at (dw, dc).  Returns true when the inertia is
    //  right, the factorisation completed AND the solve's backward error is
    //  within the limit; reports whether zero eigenvalues (or a breakdown)
    //  are the reason it failed.
    bool zeroEigenvalues = false;
    auto attempt = [&](scalar dw, scalar dc) -> bool
    {
        DenseMatrix K = K0;
        for (std::size_t i = 0; i < n; ++i) K[i][i] += dw;
        for (std::size_t j = 0; j < m; ++j) K[n + j][n + j] -= dc;
        r.inertia = ldlt_.factor(K);
        ++r.factorisations;
        r.dw = dw;  r.dc = dc;
        zeroEigenvalues = !ldlt_.ok() || r.inertia.zero > 0;
        std::string note = "dw " + num(dw) + " dc " + num(dc) + ": ";
        if (!ldlt_.ok())
        {
            r.notes.push_back(note + "factorisation broke down (counted as zero eigenvalues)");
            return false;
        }
        if (r.inertia != wanted)
        {
            r.notes.push_back(note + "inertia " + triple(r.inertia) + " wanted " + triple(wanted));
            return false;
        }
        SolveReport rep;
        r.solution = ldlt_.solve(rhs, rep);
        r.backwardError = rep.backwardError;
        if (!(rep.backwardError <= kBackwardErrorLimit))
        {
            //  Review R4: a wrong factorisation, not a usable step.
            r.notes.push_back(note + "backward error " + num(rep.backwardError) + " above "
                              + num(kBackwardErrorLimit) + " (wrong factorisation)");
            return false;
        }
        return true;
    };

    const scalar dcPositive = p_.dcBar * std::pow(mu, p_.kappaC);

    //  IC-1: no regularisation (dc > 0 already if the first-iterations rule fired).
    if (attempt(0.0, keepDc_ ? dcPositive : 0.0))
    {
        r.ok = true;
        return r;
    }

    //  IC-2: zero eigenvalues (or breakdown) -> dc > 0.
    scalar dc = keepDc_ ? dcPositive : 0.0;
    if (zeroEigenvalues)
    {
        dc = dcPositive;
        if (iteration < 3 && !keepDc_)
        {
            keepDc_ = true;
            r.notes.push_back("K singular in iteration " + std::to_string(iteration)
                              + ": dc stays > 0 in every later iteration (L1 sec. 3.1)");
        }
    }

    //  IC-3: the first dw to try.
    const bool noneBefore = dwLast_ == 0.0;
    scalar dw = noneBefore ? p_.dw0Bar : std::max(p_.dwMin, p_.kappaWMinus * dwLast_);

    for (;;)
    {
        //  IC-4.
        if (attempt(dw, dc))
        {
            dwLast_ = dw;
            r.ok = true;
            return r;
        }
        //  IC-5.
        dw *= noneBefore ? p_.kappaWPlusBar : p_.kappaWPlus;
        //  IC-6.
        if (dw > p_.dwMax)
        {
            r.ok = false;
            r.notes.push_back("dw above " + num(p_.dwMax) + ": the step is abandoned");
            return r;
        }
    }
}

} // namespace Choupo::solver
