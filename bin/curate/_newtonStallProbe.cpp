// Copyright (C) 2026 Vítor Geraldes
// SPDX-License-Identifier: GPL-3.0-or-later
// Probe for bin/curate/check_distillation_seed.py (DEV.md 4c C184 defect B).
//
// Compiled by the gate against the solver sources alone.  Prints one
// `<key> <value...>` line per measurement; the gate judges them.
//
// A residual with a JUMP: F(x) = x - 1 for x >= 2.9999, F(x) = 50 below it.
// From x0 = 3 (|F| = 2) the Newton step lands at x = 1 (|F| = 50).  Every
// backtracking trial with alpha > 0.005 lands below the jump and is WORSE;
// the line search exhausts at alpha < minAlpha (1e-4) holding a FINITE trial
// that does not reduce the norm.  Before C184 the iteration advanced to it.
#include "solver/NewtonND.H"

#include <cmath>
#include <iostream>

using namespace Choupo;
using namespace Choupo::solver;

int main()
{
    auto F = [](const sVector& x) -> sVector {
        return { x[0] >= 2.9999 ? x[0] - 1.0 : 50.0 };
    };
    NDOptions o;
    o.tolerance = 1.0e-12;
    o.maxIter = 5;
    NDResult r = newtonND(F, {3.0}, o);
    std::cout << "stallX " << r.x[0] << "\n";
    std::cout << "stallResidual " << r.residual << "\n";
    std::cout << "stallConverged " << (r.converged ? 1 : 0) << "\n";
    std::cout << "stallIterations " << r.iterations << "\n";
    std::string s = r.stopReason;
    for (char& c : s) if (c == '\n') c = ' ';
    std::cout << "stallReason " << s << "\n";
    std::cout << "stallCount " << r.stalledSteps << "\n";

    // STRICT (maxStalledSteps 0): the first stalled step stops the solve.
    NDOptions st = o; st.maxStalledSteps = 0;
    NDResult t = newtonND(F, {3.0}, st);
    std::string ts = t.stopReason;
    for (char& c : ts) if (c == '\n') c = ' ';
    std::cout << "strictX " << t.x[0] << "\n";
    std::cout << "strictResidual " << t.residual << "\n";
    std::cout << "strictConverged " << (t.converged ? 1 : 0) << "\n";
    std::cout << "strictCount " << t.stalledSteps << "\n";
    std::cout << "strictReason " << ts << "\n";

    // A well-posed problem is untouched: x^2 - 2 = 0 from 1.
    auto G = [](const sVector& x) -> sVector { return { x[0]*x[0] - 2.0 }; };
    NDOptions p; p.tolerance = 1.0e-12;
    NDResult q = newtonND(G, {1.0}, p);
    std::cout << "sqrtConverged " << (q.converged ? 1 : 0) << "\n";
    std::cout << "sqrtErr " << std::abs(q.x[0] - std::sqrt(2.0)) << "\n";
    std::cout << "probeDone 1\n";
    return 0;
}
