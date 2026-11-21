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
Description
    _iterationBudgetProbe -- a curation probe (not a shipped binary) for
    bin/curate/check_iteration_budgets.py (DEV.md 4c C467 R-001/R-002).

\*---------------------------------------------------------------------------*/
// Probe for bin/curate/check_iteration_budgets.py (DEV.md 4c C467 R-001/R-002).
// Compiled against src/solver/NewtonRaphson.cpp alone.  Prints "key value" lines.
#include "solver/NewtonRaphson.H"
#include <cmath>
#include <iostream>
#include <string>

using namespace Choupo;
using namespace Choupo::solver;

static scalar f(scalar x)  { return x * x - 2.0; }
static scalar df(scalar x) { return 2.0 * x; }

static std::string refusal(int maxIter, bool safeguarded)
{
    NROptions o; o.maxIter = maxIter; o.lower = 0.0; o.upper = 10.0; o.monotoneIncreasing = true;
    try
    {
        auto r = safeguarded ? newton1DSafeguarded(f, 1.0, 1e-6, o)
                             : newton1D(f, df, 1.0, o);
        return std::string("RAN converged=") + (r.converged ? "1" : "0");
    }
    catch (const std::exception& e) { return std::string("THREW ") + e.what(); }
}

int main()
{
    for (int mi : {0, -1})
    {
        std::cout << "plain_" << (mi < 0 ? "m1" : "0") << " " << refusal(mi, false) << "\n";
        std::cout << "safe_"  << (mi < 0 ? "m1" : "0") << " " << refusal(mi, true)  << "\n";
    }
    for (int safe = 0; safe < 2; ++safe)
    {
        NROptions o; o.maxIter = 1; o.tolerance = 1e-12; o.lower = 0.0; o.upper = 10.0; o.monotoneIncreasing = true;
        NRResult r = safe ? newton1DSafeguarded(f, 1.0, 1e-6, o) : newton1D(f, df, 1.0, o);
        std::cout << (safe ? "safeOne" : "plainOne") << " x " << r.x
                  << " residual " << r.residual << " fAtX " << std::abs(f(r.x))
                  << " converged " << (r.converged ? 1 : 0) << "\n";
    }
    NROptions o; o.maxIter = 50; o.tolerance = 1e-12; o.lower = 0.0; o.upper = 10.0; o.monotoneIncreasing = true;
    NRResult r = newton1D(f, df, 1.0, o);
    std::cout << "plainFull converged " << (r.converged ? 1 : 0) << " x " << r.x << "\n";
    for (double v : {0.0, -1.0, 0.5, 30.0})
    {
        std::string s;
        try { s = "RAN " + std::to_string(requireIterationBudget(v, "k")); }
        catch (const std::exception& e) { s = std::string("THREW ") + e.what(); }
        std::cout << "budget_" << v << " " << s << "\n";
    }
    std::cout << "probeDone 1\n";
    return 0;
}
