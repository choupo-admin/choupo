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
Standalone self-check of solver/BayesOpt (C499): runs verifyBayesOpt() --
Branin and a constrained 2-D problem against their published optima -- and
prints "BAYESOPT_OK"; exit 1 on a failure.  With `--demo` it also prints one
full glass-box run (Branin, 14 simulations).
Build (standalone):
    g++ -std=c++17 -O2 -Isrc test/bayes_opt_check.cpp src/solver/BayesOpt.cpp \
        -o /tmp/bayes_opt_check
\*---------------------------------------------------------------------------*/

#include "solver/BayesOpt.H"

#include <cmath>
#include <cstdio>
#include <cstring>
#include <iostream>

using namespace Choupo;
using namespace Choupo::solver;

int main(int argc, char** argv)
{
    bool demo = false;
    for (int i = 1; i < argc; ++i)
        if (!std::strcmp(argv[i], "--demo")) demo = true;
    try
    {
        const scalar e = verifyBayesOpt(1);
        std::printf("worst |df| %.4g\n", e);
    }
    catch (const std::exception& ex)
    {
        std::printf("BAYESOPT_FAIL: %s\n", ex.what());
        return 1;
    }
    if (demo)
    {
        auto branin = [](const sVector& x) {
            BayesResponse r;
            const double pi = 3.14159265358979323846;
            const double q = x[1] - 5.1 / (4 * pi * pi) * x[0] * x[0]
                           + 5.0 / pi * x[0] - 6.0;
            r.f = q * q + 10.0 * (1 - 1.0 / (8 * pi)) * std::cos(x[0]) + 10.0;
            return r;
        };
        BayesOptions o;
        o.budget = 14;
        o.eiTol = 0.0;
        bayesOpt(branin, {-5.0, 0.0}, {10.0, 15.0}, 0, o);
    }
    std::printf("BAYESOPT_OK\n");
    return 0;
}
