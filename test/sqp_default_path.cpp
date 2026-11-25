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
    This file is part of Choupo.  GNU GPL-3.0-or-later, see LICENSE.
    SPDX-License-Identifier: GPL-3.0-or-later

    Credit and attribution: see AUTHORS
    Required legal notices:  see NOTICE
-------------------------------------------------------------------------------
File
    sqp_default_path.cpp

Description
    C496 invariant (d): the DEFAULT path of solver::sqp (no fdMode auto) is
    byte-identical to the base.  The program runs solver::sqp and
    solver::activeSetQP with default options on a fixed set of problems
    (smooth, noisy, constrained, with a failing region, a degenerate QP) and
    prints every number at 17 digits, every iteration.  Built twice -- against
    the base sources and against the branch's -- the two outputs must be
    identical (gate check_sqp_adaptive does the diff).
\*---------------------------------------------------------------------------*/

#include "solver/ActiveSetQP.H"
#include "solver/SQP.H"

#include <cmath>
#include <functional>
#include <iomanip>
#include <iostream>

using namespace Choupo;
using namespace Choupo::solver;

namespace {

struct P
{
    const char* name;
    std::function<scalar(const sVector&)> f;
    std::vector<std::function<scalar(const sVector&)>> h, g;
    sVector lo, hi, x0;
    scalar noise = 0.0;
    std::function<bool(const sVector&)> fails;
};

void runOne(const P& p, bool central, scalar fdStep)
{
    unsigned long long lcg = 88172645463325252ULL;
    auto u = [&]() {
        lcg = lcg * 6364136223846793005ULL + 1442695040888963407ULL;
        return static_cast<scalar>((lcg >> 11) & 0xFFFFFFFFFFFFULL) / 140737488355328.0 - 1.0;
    };
    auto eval = [&](const sVector& x) {
        SQPResponse r;
        if (p.fails && p.fails(x)) { r.ok = false; return r; }
        r.f = p.f(x) + p.noise * u();
        for (auto& hj : p.h) r.h.push_back(hj(x) + p.noise * u());
        for (auto& gk : p.g) r.g.push_back(gk(x) + p.noise * u());
        return r;
    };
    SQPOptions o;
    o.central = central; o.fdStep = fdStep; o.maxIter = 80;
    o.onIter = [&](const SQPTrace& t) {
        std::cout << "  it " << t.iteration << " f " << t.f << " stat " << t.kktStat << " alpha " << t.alpha
                  << " theta " << t.theta << " mu " << t.mu << " x";
        for (scalar v : t.x) std::cout << " " << v;
        std::cout << " | " << t.note << "\n";
    };
    SQPResult R = sqp(eval, p.x0, p.lo, p.hi, p.h.size(), p.g.size(), o);
    std::cout << p.name << (central ? " central" : " forward") << " conv " << R.converged << " it " << R.iterations
              << " ev " << R.evaluations << " f " << R.f << " stat " << R.kktStat << " reason " << R.reason << " x";
    for (scalar v : R.x) std::cout << " " << v;
    std::cout << " lamE";
    for (scalar v : R.lambdaEq) std::cout << " " << v;
    std::cout << " lamI";
    for (scalar v : R.lambdaIneq) std::cout << " " << v;
    std::cout << " relaxed " << R.relaxedSteps << " onesided " << R.fdOneSided << "\n";
}

} // namespace

int main()
{
    std::cout << std::setprecision(17);
    const scalar inf = std::numeric_limits<scalar>::infinity();
    std::vector<P> ps;
    ps.push_back({"HS35",
        [](const sVector& x) { return 9.0 - 8*x[0] - 6*x[1] - 4*x[2] + 2*x[0]*x[0] + 2*x[1]*x[1] + x[2]*x[2] + 2*x[0]*x[1] + 2*x[0]*x[2]; },
        {}, {[](const sVector& x) { return x[0] + x[1] + 2*x[2] - 3.0; }},
        {0, 0, 0}, {inf, inf, inf}, {0.5, 0.5, 0.5}});
    ps.push_back({"HS21",
        [](const sVector& x) { return 0.01*x[0]*x[0] + x[1]*x[1] - 100.0; },
        {}, {[](const sVector& x) { return -(10.0*x[0] - x[1] - 10.0); }},
        {2, -50}, {50, 50}, {2.0, 0.5}});
    ps.push_back({"HS71",
        [](const sVector& x) { return x[0]*x[3]*(x[0]+x[1]+x[2]) + x[2]; },
        {[](const sVector& x) { return x[0]*x[0]+x[1]*x[1]+x[2]*x[2]+x[3]*x[3] - 40.0; }},
        {[](const sVector& x) { return 25.0 - x[0]*x[1]*x[2]*x[3]; }},
        {1, 1, 1, 1}, {5, 5, 5, 5}, {1, 5, 5, 1}});
    ps.push_back({"HS13",
        [](const sVector& x) { return (x[0]-2)*(x[0]-2) + x[1]*x[1]; },
        {}, {[](const sVector& x) { return x[1] - std::pow(1.0 - x[0], 3); }},
        {0, 0}, {5, 5}, {0.0, 0.5}});
    ps.push_back({"noisyquad",
        [](const sVector& x) { return (x[0]-0.3)*(x[0]-0.3) + 2*(x[1]-0.7)*(x[1]-0.7); },
        {}, {}, {0, 0}, {1, 1}, {0.9, 0.1}, 1.0e-7});
    ps.push_back({"nearparallel",
        [](const sVector& x) { return -10.0*x[0] + x[1]*x[1]; },
        {[](const sVector& x) { return x[0] + 5.0e-6*x[1] - 1.00002; }}, {},
        {0, 0}, {1, 5}, {0.5, 1.0}});
    ps.push_back({"failing",
        [](const sVector& x) { return 500.0*(x[0]-0.6)*(x[0]-0.6); },
        {}, {[](const sVector& x) { return x[0] - 0.5; }},
        {0}, {1}, {0.3}, 0.0, [](const sVector& x) { return x[0] > 0.50001; }});
    ps.push_back({"cliff",
        [](const sVector& x) { return 1.0e6*std::pow(std::max(0.0, 0.3 - x[0]), 2) + 10.0*(x[0]-0.6)*(x[0]-0.6); },
        {}, {}, {0}, {1}, {0.0}, 1.0e-9});
    for (const auto& p : ps)
    {
        runOne(p, false, 1.0e-5);
        runOne(p, true, 1.0e-6);
    }
    //  the QP alone, default mode
    {
        QPProblem q; q.B = {{1, 0}, {0, 1}}; q.g = {-10.0, 0.0};
        q.Aeq = {{1.0, 1.0e-6}}; q.beq = {-1.0e-6};
        q.Aineq = {{1, 0}, {-1, 0}, {0, 1}, {0, -1}}; q.bineq = {0.0, -1.0, -5.0, -5.0};
        QPResult R = activeSetQP(q);
        std::cout << "qp conv " << R.converged << " d " << R.d[0] << " " << R.d[1] << " it " << R.iterations
                  << " " << R.reason << "\n";
    }
    return 0;
}
