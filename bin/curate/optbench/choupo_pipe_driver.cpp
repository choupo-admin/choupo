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
Tool
    choupo_pipe_driver -- a MEASUREMENT TOOL for the optimizer bench
    (DEV.md 4c C496, docs/audits/2026-11-24-optimizer-bench-protocol.md).
    Not a gate, not in bin/runTests, not part of the engine.

Description
    Runs Choupo's own solver::sqp or solver::nelderMead UNCHANGED (src/solver
    is compiled in, never edited) against a problem that lives in another
    process: every function value is asked of the parent over a pipe, so the
    parent's single counting function counts one evaluation per request for
    every code, finite-difference perturbations included.

    Protocol (text, one line each, stdout flushed):
      argv:    sqp|nelderMead  n  nEq  nIneq
      stdin:   line 1  x0 (n numbers)       line 2  lo       line 3  hi
      driver -> parent:   "X x1 ... xn"                  (a request)
      parent -> driver:   "F f h1..h_nEq g1..g_nIneq"    (nIneq values g <= 0
                          feasible: the parent sends the NEGATED collection
                          value) or "STOP" (budget spent: the driver ends)
      driver -> parent at the end:  "DONE converged iterations reason..."

    Option mapping = OptimizationDriver's (src/outerDriver/OptimizationDriver
    .cpp, runSqp / runNelderMead): the SQP works in x/s with s_i =
    max(|x0_i|, 0.25 (hi_i - lo_i)) (the bench passes the problem's own bounds
    where finite, else max(|x0_i|, 1)), typX = 1, forward differences with
    step 1e-5 (the driver's default), KKT tolerances 1e-6 on feasibility; the
    Nelder-Mead runs in the user's coordinates with tolX 1e-4, tolF 1e-4,
    simplexInit 0.10.  maxIter is set large so the parent's budget ends a run.
\*---------------------------------------------------------------------------*/

#include "solver/NelderMead.H"
#include "solver/SQP.H"

#include <cmath>
#include <cstdlib>
#include <iostream>
#include <limits>
#include <sstream>
#include <string>
#include <vector>

using namespace Choupo;

struct Stop {};

static sVector readLine(std::size_t n)
{
    std::string line;
    std::getline(std::cin, line);
    std::istringstream is(line);
    sVector v(n);
    for (auto& x : v) is >> x;
    return v;
}

static solver::SQPResponse ask(const sVector& x, std::size_t nEq, std::size_t nIneq)
{
    std::cout << "X";
    std::cout.precision(17);
    for (double v : x) std::cout << " " << v;
    std::cout << std::endl;
    std::string line;
    if (!std::getline(std::cin, line)) throw Stop();
    if (line.rfind("STOP", 0) == 0) throw Stop();
    std::istringstream is(line);
    std::string tag;
    is >> tag;
    solver::SQPResponse r;
    is >> r.f;
    r.h.assign(nEq, 0.0);
    r.g.assign(nIneq, 0.0);
    for (auto& v : r.h) is >> v;
    for (auto& v : r.g) is >> v;
    bool finite = std::isfinite(r.f);
    for (double v : r.h) finite = finite && std::isfinite(v);
    for (double v : r.g) finite = finite && std::isfinite(v);
    r.ok = finite;
    return r;
}

int main(int argc, char** argv)
{
    if (argc < 5) { std::cerr << "usage: method n nEq nIneq\n"; return 2; }
    const std::string method = argv[1];
    const std::size_t n = std::stoul(argv[2]);
    const std::size_t nEq = std::stoul(argv[3]);
    const std::size_t nIneq = std::stoul(argv[4]);
    sVector x0 = readLine(n), lo = readLine(n), hi = readLine(n);

    try
    {
        if (method == "sqp")
        {
            sVector s(n);
            for (std::size_t i = 0; i < n; ++i)
            {
                const double span = hi[i] - lo[i];
                s[i] = std::isfinite(span) && span < 1e4
                     ? std::max(std::abs(x0[i]), 0.25 * std::abs(span))
                     : std::max(std::abs(x0[i]), 1.0);
                if (!(s[i] > 0.0)) s[i] = 1.0;
            }
            sVector xs0(n), los(n), his(n), typX(n, 1.0);
            for (std::size_t i = 0; i < n; ++i)
            {
                xs0[i] = x0[i] / s[i]; los[i] = lo[i] / s[i]; his[i] = hi[i] / s[i];
            }
            auto eval = [&](const sVector& xs) {
                sVector x(n);
                for (std::size_t i = 0; i < n; ++i) x[i] = xs[i] * s[i];
                return ask(x, nEq, nIneq);
            };
            solver::SQPOptions o;
            o.maxIter = 100000;
            o.fdStep = 1.0e-5;
            o.central = false;
            o.typX = typX;
            o.tolFeasEq = 1.0e-6;
            //  C496 development: CHOUPO_SQP_OPTS="fdMode=auto " selects the
            //  optional paths of solver::sqp; unset = the shipped defaults.
            if (const char* e = std::getenv("CHOUPO_SQP_OPTS"))
            {
                std::istringstream is(e);
                std::string kv;
                while (is >> kv)
                {
                    const auto eq = kv.find('=');
                    const std::string k = kv.substr(0, eq), v = kv.substr(eq + 1);
                    if (k == "fdMode")
                    {
                        if (v == "auto") o.adaptiveFd = true;
                        else if (v == "central") o.central = true;
                    }
                }
            }
            if (std::getenv("CHOUPO_SQP_TRACE"))
                o.onIter = [](const solver::SQPTrace& t) {
                    std::cerr << "it " << t.iteration << " f " << t.f << " stat " << t.kktStat
                              << " feas " << t.kktFeasEq << "/" << t.kktFeasIneq << " alpha "
                              << t.alpha << " mu " << t.mu << " | " << t.note << "\n    "
                              << t.fdReport << "\n";
                };
            auto R = solver::sqp(eval, xs0, los, his, nEq, nIneq, o);
            std::cout << "DONE " << (R.converged ? 1 : 0) << " " << R.iterations
                      << " " << R.reason << std::endl;
        }
        else
        {
            if (nEq + nIneq > 0)
            {
                std::cout << "DONE 0 0 nelderMead has no constraints (the driver refuses them)"
                          << std::endl;
                return 0;
            }
            auto f = [&](const sVector& x) {
                auto r = ask(x, 0, 0);
                return r.ok ? r.f : std::numeric_limits<double>::infinity();
            };
            solver::NMOptions o;
            o.maxIter = 100000;
            o.tolX = 1.0e-4;
            o.tolF = 1.0e-4;
            o.simplexInitFactor = 0.10;
            auto R = solver::nelderMead(f, x0, lo, hi, o);
            std::cout << "DONE " << (R.converged ? 1 : 0) << " " << R.iterations
                      << " " << R.reason << std::endl;
        }
    }
    catch (const Stop&)
    {
        std::cout << "DONE 0 0 budget" << std::endl;
    }
    catch (const std::exception& e)
    {
        std::cout << "DONE 0 0 exception: " << e.what() << std::endl;
    }
    return 0;
}
