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
    SPDX-License-Identifier: GPL-3.0-or-later
-------------------------------------------------------------------------------
Standalone validation of the seulex integrator (src/solver/ODE/Seulex.cpp),
run by bin/curate/check_seulex.py.  Four claims, each with a number:

  1. ROBERTSON to the SUNDIALS reference: y(4e4) = (3.898902e-2, 1.621669e-7,
     9.610108e-1) at rtol 1e-8, and the sum conserved.
  2. A SMOOTH problem y' = -y + sin t (exact solution known): the error falls
     with the tolerance, 1e-6 -> 1e-10.
  3. A WRONG Jacobian (80 % of the true one, supplied as an `analytic`
     Jacobian) gives the SAME answer as the right one to the tolerance: a
     stale J costs the efficiency of the step, not the correctness of the
     extrapolated result.  (Honest limit, measured: at 50 % the stiff
     amplification factor tends to -1 instead of 0, the damping is lost and
     the run REFUSES at hMin -- it does not return a wrong answer.)
  4. The convergence monitor, both ways: on a LINEAR stiff problem the supplied
     Jacobian is exact for ever, theta is zero, and it must be built once or
     twice for dozens of steps (reuse); on Robertson, whose Jacobian ages,
     theta must send it to be rebuilt (never refreshing it -- threshold at
     infinity, the sabotage -- takes over a million steps).
  5. STEP COUNTS are recorded bounds, so an order pinned low (every step then
     takes hundreds of sub-steps) or a controller that never raises it fails:
     Robertson 40..300 accepted steps, the smooth problem under 60 at every
     tolerance.

Build (standalone, no engine link needed):
    g++ -std=c++17 -O2 -Isrc test/seulex_check.cpp src/solver/ODE/ODEIntegrator.cpp \
        src/solver/ODE/RK4.cpp src/solver/ODE/EulerSI.cpp src/solver/ODE/Rosenbrock23.cpp \
        src/solver/ODE/Seulex.cpp src/solver/ODE/Jacobian.cpp src/solver/LU.cpp \
        src/solver/SparseLU.cpp src/solver/BlockTridiagonal.cpp -o /tmp/seulex_check
\*---------------------------------------------------------------------------*/

#include "solver/ODE/ODEIntegrator.H"
#include "solver/ODE/Seulex.H"
#include "solver/ODE/Rosenbrock23.H"

#include <cmath>
#include <cstdio>

//  The factory's unknown-name refusal formats its text with registryRefusal;
//  this test never asks for an unknown name, so a stub keeps it standalone.
namespace Choupo::registryRefusal
{
std::string message(const std::string&, const std::string&,
                    const std::vector<std::string>&, const std::string&)
{ return {}; }
}

using namespace Choupo;
using namespace Choupo::solver;

static sVector robertson(scalar, const sVector& y)
{
    sVector d(3);
    d[0] = -0.04 * y[0] + 1.0e4 * y[1] * y[2];
    d[2] =  3.0e7 * y[1] * y[1];
    d[1] = -d[0] - d[2];
    return d;
}

static std::vector<sVector> robertsonJ(const sVector& y)
{
    return {{-0.04, 1.0e4 * y[2], 1.0e4 * y[1]},
            { 0.04, -1.0e4 * y[2] - 6.0e7 * y[1], -1.0e4 * y[1]},
            { 0.0, 6.0e7 * y[1], 0.0}};
}

static ODEAnalyticJacobian analyticOf(scalar factor)
{
    ODEAnalyticJacobian a;
    a.autonomous = true;
    a.owner = "seulex_check";
    a.tolerance = 1.0e30;     // the audit is not the subject here: a deliberately wrong J
    a.jacobian = [factor](scalar, const sVector& y, const sVector&, const sVector&)
    {
        auto J = robertsonJ(y);
        for (auto& r : J) for (auto& v : r) v *= factor;
        return J;
    };
    return a;
}

int main()
{
    bool ok = true;
    //  Reference: Rodas4 at rtol 1e-12 (the SUNDIALS table value 3.898902e-2
    //  is quoted to its own 1e-4 accuracy and is printed for information).
    scalar y1ref = 0.0, y3ref = 0.0;
    {
        sVector yr = {1.0, 0.0, 0.0};
        ODEControls cr; cr.atol = {1.0e-14, 1.0e-18, 1.0e-14}; cr.rtol = 1.0e-12;
        Rosenbrock23 rod(Rosenbrock23::Scheme::Rodas4);
        rod.integrate(yr, 0.0, 4.0e4, robertson, cr);
        y1ref = yr[0]; y3ref = yr[2];
        std::printf("reference (Rodas4 rtol 1e-12): y1 %.9e y3 %.9e (SUNDIALS table 3.898902e-02)\n", y1ref, y3ref);
    }
    Seulex sx;
    ODEControls c;
    c.atol = {1.0e-10, 1.0e-14, 1.0e-10};
    c.rtol = 1.0e-8;
    c.positiveRows = {true, true, true};

    // --- 1. Robertson -----------------------------------------------------
    {
        sVector y = {1.0, 0.0, 0.0};
        const ODEStats st = sx.integrate(y, 0.0, 4.0e4, robertson, c);
        const scalar sum = y[0] + y[1] + y[2];
        const bool good = st.ok && std::fabs(y[0] - y1ref) / y1ref < 1.0e-5
                       && std::fabs(y[2] - y3ref) / y3ref < 1.0e-5
                       && std::fabs(sum - 1.0) < 1.0e-9
                       && st.accepted >= 40 && st.accepted <= 300;
        std::printf("robertson y1 %.7e y3 %.7e sum-1 %.2e steps %zu jac %zu fact %zu rhs %zu %s\n",
                    y[0], y[2], sum - 1.0, st.accepted, st.jacobians, st.factorisations,
                    st.rhsEvals, good ? "PASS" : "FAIL");
        ok = ok && good;
    }
    // --- 2. smooth problem, error falls with the tolerance -----------------
    {
        const DerivFn f = [](scalar t, const sVector& y) { return sVector{-y[0] + std::sin(t)}; };
        const auto exact = [](scalar t)
        { return 0.5 * (std::sin(t) - std::cos(t)) + 0.5 * std::exp(-t) + 0.0; };
        scalar prev = 1.0; bool fall = true;
        for (scalar rt : {1.0e-6, 1.0e-8, 1.0e-10})
        {
            ODEControls cs; cs.atol = {1.0e-14}; cs.rtol = rt;
            sVector y = {0.0};
            const ODEStats st = sx.integrate(y, 0.0, 5.0, f, cs);
            const scalar e = std::fabs(y[0] - exact(5.0));
            std::printf("smooth rtol %.0e error %.2e steps %zu\n", rt, e, st.accepted);
            fall = fall && st.ok && e < prev && e < 50.0 * rt && st.accepted >= 3 && st.accepted <= 60;
            prev = e;
        }
        ok = ok && fall;
        std::printf("smooth error falls with the tolerance: %s\n", fall ? "PASS" : "FAIL");
    }
    // --- 3. a wrong Jacobian does not change the answer --------------------
    {
        sVector yR = {1.0, 0.0, 0.0}, yW = {1.0, 0.0, 0.0};
        ODEAnalyticJacobian right = analyticOf(1.0), wrong = analyticOf(0.8);
        ODEControls cr = c, cw = c;
        cr.analytic = &right; cw.analytic = &wrong;
        const ODEStats sr = sx.integrate(yR, 0.0, 4.0e4, robertson, cr);
        const ODEStats sw = sx.integrate(yW, 0.0, 4.0e4, robertson, cw);
        const scalar d = std::fabs(yR[0] - yW[0]) / yR[0];
        const bool good = sr.ok && sw.ok && d < 1.0e-5;
        std::printf("wrongJ(0.8): ok %d tReached %.3e rejected %zu\n", int(sw.ok), sw.tReached, sw.rejected);
        std::printf("wrongJ(0.8): y1 %.7e vs %.7e (rel %.2e), steps %zu vs %zu %s\n",
                    yW[0], yR[0], d, sw.accepted, sr.accepted, good ? "PASS" : "FAIL");
        ok = ok && good;
    }
    // --- 4. the monitor: reuse, and the cost of never refreshing -----------
    {
        ODEAnalyticJacobian a1 = analyticOf(1.0), a2 = analyticOf(1.0);
        sVector y1 = {1.0, 0.0, 0.0}, y2 = {1.0, 0.0, 0.0};
        ODEControls cd = c, cn = c;
        cd.analytic = &a1; cn.analytic = &a2; cn.jacobianRedo = 1.0e30;   // never refresh
        const ODEStats sd = sx.integrate(y1, 0.0, 4.0e4, robertson, cd);
        const ODEStats sn = sx.integrate(y2, 0.0, 4.0e4, robertson, cn);
        std::printf("monitor default: jac %zu of %zu steps, thetaMax %.2e;"
                    " never-refresh: jac %zu, steps %zu rejected %zu ok %d, y1 %.7e\n",
                    sd.jacobians, sd.steps, sd.thetaMax, sn.jacobians, sn.steps,
                    sn.rejected, int(sn.ok), y2[0]);
        //  never-refresh must be visibly worse; the default must refresh at least once
        const bool good = sd.ok && sd.jacobians >= 2 && (!sn.ok || sn.steps > 20 * sd.steps);
        std::printf("monitor: %s\n", good ? "PASS" : "FAIL");
        ok = ok && good;
    }
    // --- 4b. reuse: a linear stiff problem whose Jacobian never ages --------
    {
        const DerivFn f = [](scalar, const sVector& y) { return sVector{-1000.0 * y[0] + y[1], -y[1]}; };
        ODEAnalyticJacobian a;
        a.autonomous = true; a.owner = "seulex_check"; a.tolerance = 1.0e30;
        a.jacobian = [](scalar, const sVector&, const sVector&, const sVector&)
        { return std::vector<sVector>{{-1000.0, 1.0}, {0.0, -1.0}}; };
        ODEControls cl; cl.atol = {1.0e-14, 1.0e-14}; cl.rtol = 1.0e-8; cl.analytic = &a;
        sVector y = {1.0, 1.0};
        const ODEStats st = sx.integrate(y, 0.0, 2.0, f, cl);
        const scalar exact = std::exp(-2.0) / 999.0;
        const bool good = st.ok && std::fabs(y[0] - exact) / exact < 1.0e-5
                       && st.accepted >= 6 && st.jacobians * 4 <= st.accepted;
        std::printf("linear: jac %zu of %zu steps, y1 %.7e vs %.7e, thetaMax %.1e %s\n",
                    st.jacobians, st.accepted, y[0], exact, st.thetaMax, good ? "PASS" : "FAIL");
        ok = ok && good;
    }
    std::printf("SEULEX CHECK: %s\n", ok ? "ALL PASS" : "FAILURE");
    return ok ? 0 : 1;
}
