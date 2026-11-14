// Copyright (C) 2026 Vítor Geraldes
// SPDX-License-Identifier: GPL-3.0-or-later
// Probe for check_rodas4_order.py: Rodas4's convergence order and L-stability.
// Compiled by the gate against the ODE sources alone; prints one line per
// measurement.  Fixed steps (every step accepted, step growth pinned) so the
// error is the method's own.
#include "solver/ODE/ODEIntegrator.H"
#include "solver/ODE/Rosenbrock23.H"
#include <cmath>
#include <cstdio>
#include <string>
#include <vector>

using namespace Choupo;
using namespace Choupo::solver;

namespace Choupo::registryRefusal
{
std::string message(const std::string&, const std::string&,
                    const std::vector<std::string>&, const std::string&)
{
    return "unused";
}
}

static sVector run(Rosenbrock23::Scheme s, const DerivFn& f, sVector y,
                   double t1, int N)
{
    Rosenbrock23 integ(s);
    ODEControls c;
    c.atol = sVector(y.size(), 1e-8);
    c.rtol = 1e30;                       // accept every step
    c.hInit = c.hMax = t1 / N;
    c.maxGrowth = 1.0 + 1e-12;
    c.verbosity = 0;
    integ.integrate(y, 0.0, t1, f, c);
    return y;
}

int main()
{
    const auto R4 = Rosenbrock23::Scheme::Rodas4;
    const auto R23 = Rosenbrock23::Scheme::Rosenbrock23;
    DerivFn f = [](scalar t, const sVector& y) {
        return sVector{-2 * y[0] + y[1] * y[1] + std::sin(t),
                       y[0] * y[1] - 3 * y[1] + std::cos(2 * t)};
    };
    const sVector y0{1.0, 0.5};
    const sVector ref = run(R23, f, y0, 3.0, 200000);   // order 2, ~1e-11
    double prev = 0.0;
    for (int N : {20, 40, 80})
    {
        const sVector y = run(R4, f, y0, 3.0, N);
        const double e = std::hypot(y[0] - ref[0], y[1] - ref[1]);
        std::printf("ORDER %d %.6e %.4f\n", N, e,
                    prev > 0 ? std::log2(prev / e) : 0.0);
        prev = e;
    }
    DerivFn st = [](scalar t, const sVector& y) {
        return sVector{-1000 * (y[0] - std::cos(t)) - std::sin(t)};
    };
    const sVector ys = run(R4, st, {1.0}, 1.0, 10);
    std::printf("STIFF %.6e\n", std::abs(ys[0] - std::cos(1.0)));
}
