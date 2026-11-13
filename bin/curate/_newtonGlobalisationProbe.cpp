// Copyright (C) 2026 Vítor Geraldes
// SPDX-License-Identifier: GPL-3.0-or-later
// Probe for bin/curate/check_newton_globalisation.py (DEV.md 4c C245 slice 1).
//
// Compiled by the gate against the solver sources alone (no engine build is
// touched), with -D_GLIBCXX_ASSERTIONS.  Prints one `<key> <value...>` line
// per measurement; the gate judges them.  Four synthetic problems, each run
// on the LEGACY path (the default every caller still gets) and on the
// declared contract (Globalisation::armijo, typX, lower/upper):
//
//   (1) uphill:  F = (x0^2 + x1^2 - 4, x0 - x1^3 + 1) from (1e-6, 1e-6),
//                where J is singular to first order.  The legacy search
//                exhausts and steps UPHILL until its allowance is spent;
//                the Armijo search with its Levenberg-Marquardt fallback
//                must converge with a monotone ||F||.
//   (2) bound:   F = ln(x) - ln(2e-3) from x = 10.  The full Newton step
//                lands at x = -75; the legacy search EVALUATES the residual
//                there (NaN), trial after trial, before it backs into the
//                domain (13 evaluations at x <= 0 on 2026-11-08).
//                With lower = 0 no trial and no probe may evaluate x <= 0.
//   (3) NaN:     F = (x0 - 1, x1 - 0.2 + 0 * sqrt(0.5 - x1)) from (0, 0.5):
//                the forward probe of x1 returns NaN.  The solve must stop
//                naming "non-finite Jacobian column 1" (a default), and
//                luFactor must refuse a NaN pivot and a row dependent on the
//                one above to working precision ((1, 2), (2, 4 + 1e-15)),
//                while factoring a merely badly scaled diag(1, 1e-20), a
//                matrix whose second COLUMN is 1e15 times its first
//                ((1e-2, 1e13), (2e-2, 1e13): an unknown in other units) and a
//                matrix whose entries are all ~1e-31.
//   (4) scale:   F = ln(x / 1e-10) - 0.5 from x = 1e-10.  The legacy step
//                1e-7 * max(|x|, 1) probes x - 1e-7 < 0 (a NaN column); with
//                typX = 1e-10 and lower = 0 it must converge to 1e-10 e^0.5.

#include "solver/NewtonND.H"
#include "solver/LU.H"
#include "solver/NewtonRaphson.H"
#include "core/InfeasibleTrial.H"

#include <algorithm>
#include <cmath>
#include <iostream>
#include <limits>
#include <stdexcept>
#include <string>
#include <vector>

using namespace Choupo;
using namespace Choupo::solver;

namespace
{

std::string oneLine(std::string s)
{
    for (char& c : s) if (c == '\n') c = ' ';
    return s;
}

struct Run
{
    NDResult r;
    std::vector<scalar> hist;      // ||F|| at each iteration's start
    int nonMonotone = 0;           // iterations whose ||F|| did not fall
};

Run solve(const std::function<sVector(const sVector&)>& F, sVector x0,
          NDOptions o)
{
    Run out;
    o.onIter = [&](const NDTrace& t) { out.hist.push_back(t.normF); };
    out.r = newtonND(F, std::move(x0), o);
    out.hist.push_back(out.r.residual);
    for (std::size_t i = 1; i < out.hist.size(); ++i)
        if (!(out.hist[i] < out.hist[i - 1])) ++out.nonMonotone;
    return out;
}

void report(const std::string& tag, const Run& u)
{
    std::cout << tag << "Converged " << (u.r.converged ? 1 : 0) << "\n"
              << tag << "Iterations " << u.r.iterations << "\n"
              << tag << "Residual " << u.r.residual << "\n"
              << tag << "Stalled " << u.r.stalledSteps << "\n"
              << tag << "LM " << u.r.lmSteps << "\n"
              << tag << "NonMonotone " << u.nonMonotone << "\n"
              << tag << "Stop " << oneLine(u.r.stopReason) << "\n";
}

void probeUphill()
{
    auto F = [](const sVector& x) {
        return sVector{x[0]*x[0] + x[1]*x[1] - 4.0, x[0] - x[1]*x[1]*x[1] + 1.0};
    };
    NDOptions o; o.maxIter = 200;
    report("uphillLegacy", solve(F, {1e-6, 1e-6}, o));
    o.globalisation = Globalisation::armijo;
    const Run a = solve(F, {1e-6, 1e-6}, o);
    report("uphillArmijo", a);
    const sVector& x = a.r.x;
    std::cout << "uphillArmijoRootErr "
              << std::abs(x[0]*x[0] + x[1]*x[1] - 4.0) + std::abs(x[0] - x[1]*x[1]*x[1] + 1.0)
              << "\n";
}

void probeBound()
{
    int below = 0;
    auto F = [&](const sVector& x) {
        if (x[0] <= 0.0) ++below;
        return sVector{std::log(x[0]) - std::log(2.0e-3)};
    };
    NDOptions o; o.maxIter = 100;
    below = 0;
    report("boundLegacy", solve(F, {10.0}, o));
    std::cout << "boundLegacyBelow " << below << "\n";

    o.lower = {0.0};
    below = 0;
    report("boundBoxLegacy", solve(F, {10.0}, o));
    std::cout << "boundBoxLegacyBelow " << below << "\n";

    o.globalisation = Globalisation::armijo;
    below = 0;
    const Run a = solve(F, {10.0}, o);
    report("boundArmijo", a);
    std::cout << "boundArmijoBelow " << below << "\n"
              << "boundArmijoX " << a.r.x[0] << "\n"
              << "boundArmijoBounded " << a.r.boundedSteps << "\n";
}

void probeNaN()
{
    auto F = [](const sVector& x) {
        return sVector{x[0] - 1.0, (x[1] - 0.2) + 0.0 * std::sqrt(0.5 - x[1])};
    };
    NDOptions o;
    report("nanLegacy", solve(F, {0.0, 0.5}, o));

    auto factorThrows = [](std::vector<sVector> A) {
        std::vector<std::size_t> piv;
        try { luFactor(A, piv); } catch (const std::exception&) { return 1; }
        return 0;
    };
    const scalar nan = std::numeric_limits<scalar>::quiet_NaN();
    std::cout << "luNaNPivotThrows "  << factorThrows({{1.0, 0.0}, {0.0, nan}}) << "\n"
              << "luRelPivotThrows "  << factorThrows({{1.0, 2.0}, {2.0, 4.0 + 1.0e-15}}) << "\n"
              << "luBadScaleThrows "  << factorThrows({{1.0, 0.0}, {0.0, 1.0e-20}}) << "\n"
              << "luColScaleThrows "  << factorThrows({{1.0e-2, 1.0e13}, {2.0e-2, 1.0e13}}) << "\n"
              << "luTinyScaleThrows " << factorThrows({{2.0e-31, 1.0e-31}, {1.0e-31, 3.0e-31}}) << "\n";
}

void probeScale()
{
    auto F = [](const sVector& x) {
        return sVector{std::log(x[0] / 1.0e-10) - 0.5};
    };
    NDOptions o; o.maxIter = 50; o.tolerance = 1.0e-12;
    report("scaleLegacy", solve(F, {1.0e-10}, o));
    o.typX = {1.0e-10};
    o.lower = {0.0};
    o.globalisation = Globalisation::armijo;
    const Run a = solve(F, {1.0e-10}, o);
    report("scaleTyp", a);
    std::cout << "scaleTypRelErr " << std::abs(a.r.x[0] / (1.0e-10 * std::exp(0.5)) - 1.0) << "\n";
}

//  (5) FD Jacobian at a trace mole fraction (C245 slice 2, Rank 2).  The 2x2
//  residual F = (ln(x0/1e-10) + x1 - 1.2, x1 - 3 + 2e10 x0) at (1e-10, 1) has
//  the analytic Jacobian ((1e10, 1), (2e10, 1)), hence the Newton step
//  d = (-2e-11, 0.4).  One Newton iteration is taken under the contract
//  (typX = (1e-10, 1), lower = (0, -inf)); the step it took, divided by the
//  step length alpha it reports, is compared with d: a Jacobian that is wrong
//  by 1e-4 relative moves d by about as much.  Printed: fdStepRelErr.
void probeFdJacobian()
{
    auto F = [](const sVector& x) {
        if (!(x[0] > 0.0)) throw std::runtime_error("x0 <= 0 evaluated");
        return sVector{std::log(x[0] / 1.0e-10) + x[1] - 1.2,
                       x[1] - 3.0 + 2.0e10 * x[0]};
    };
    NDOptions o; o.maxIter = 1; o.tolerance = 1.0e-30;
    o.typX = {1.0e-10, 1.0};
    o.lower = {0.0, -std::numeric_limits<scalar>::infinity()};
    o.upper = {std::numeric_limits<scalar>::infinity(),
               std::numeric_limits<scalar>::infinity()};
    o.globalisation = Globalisation::armijo;
    scalar alpha = 0.0;
    o.onIter = [&](const NDTrace& t) { alpha = t.alpha; };
    const sVector x0 = {1.0e-10, 1.0};
    const NDResult r = newtonND(F, x0, o);
    const sVector d = {-2.0e-11, 0.4};
    scalar err = 0.0;
    if (!(alpha > 0.0) || r.x.size() != 2) err = 1.0e30;
    else
        for (int i = 0; i < 2; ++i)
            err = std::max(err, std::abs((r.x[i] - x0[i]) / alpha - d[i])
                                / std::abs(d[i]));
    std::cout << "fdStepAlpha " << alpha << "\nfdStepRelErr " << err << "\n";
}

} // namespace

//  (5) infeasible window (C245 slice 3a): g(T) = exp((T - 1100)/20) - 1, root
//  1100, seed 1000.  The Newton step from the seed overshoots (slope e^-5/20)
//  and is capped at 200 K -> T = 1200, where the residual REFUSES (an inner
//  equilibrium that does not converge): every T > 1150 throws InfeasibleTrial.
//  The safeguarded solve must backtrack, never evaluate a value there, never
//  differentiate across it, and reach the root; the count of refusals is
//  reported.
void probeInfeasible()
{
    auto f = [&](double T) -> double
    {
        if (T > 1150.0) throw InfeasibleTrial("window");
        return std::exp((T - 1100.0) / 20.0) - 1.0;
    };
    NROptions o;
    o.tolerance = 1.0e-8; o.maxIter = 60;
    o.lower = 250.0; o.upper = 5000.0; o.maxStep = 200.0;
    std::vector<double> bad;
    NRResult r = newton1DSafeguarded(f, 1000.0, 0.5, o, &bad);
    std::cout << "infeasConverged " << (r.converged ? 1 : 0) << "\n";
    std::cout << "infeasRootErr " << std::abs(r.x - 1100.0) << "\n";
    std::cout << "infeasRefusals " << bad.size() << "\n";
    //  a feasible problem is newton1D's iteration step for step
    auto g = [](double x) { return x * x * x - 8.0; };
    auto dg = [](double x) { return 3.0 * x * x; };
    NROptions o2; o2.tolerance = 1e-12; o2.lower = 0.0; o2.upper = 10.0;
    o2.bracket = false; o2.monotoneIncreasing = true; o2.maxStep = 1.0;
    const NRResult a = newton1D(g, dg, 5.0, o2);
    const NRResult b = newton1DSafeguarded(g, 5.0, 1.0e-6, o2, nullptr);
    std::cout << "infeasFeasibleSameIters "
              << ((a.iterations == b.iterations && b.converged) ? 1 : 0) << "\n";
}

int main()
{
    std::cout.precision(10);
    probeUphill();
    probeBound();
    probeNaN();
    probeScale();
    probeFdJacobian();
    probeInfeasible();
    std::cout << "probeDone 1\n";
    return 0;
}
