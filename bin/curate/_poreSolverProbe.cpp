// SPDX-License-Identifier: GPL-3.0-or-later
//
// Probe for bin/curate/check_pore_solver.py -- compiled by the gate against
// src/unitOperations/membrane/transport/PoreNernstPlanck.cpp and
// src/solver/{NewtonND,LU,BlockTridiagonal}.cpp alone (no engine build
// touched).  It hands the pore solver problems whose coefficients are
// written here, so every number the gate checks is computed from inputs the
// gate can see.  It prints `key value ...` lines; the GATE decides.
//
//   ANALYTIC  a single 1:1 salt, X_d = 0, unequal steric partitions and
//             conductances: electroneutrality makes c+ = c- = c in the
//             pore and zero current makes c_perm,+ = c_perm,-, and the two
//             ENP equations collapse to ONE ambipolar equation with the
//             closed-form solution printed beside the FD answer -- at Peclet
//             0.44, 4.4 and 440 (the last a cell Peclet number of 17.6 at
//             25 intervals, where a central difference oscillates).
//   STIFF     a negative X_d of -200 mol/m3 against a divalent co-ion
//             (SO4) and a TRACE monovalent co-ion (Cl), at a water flux
//             that makes the trace ion's Peclet number large: the grid
//             series for Richardson's observed order.
//   SWEEP     water flux x fixed charge, each solved from a CRUDE seed
//             (not the closed form) -- the robustness arm.
//   WARM      a warm start from a neighbouring water flux against a cold
//             solve at the same flux.
//   REFUSED   problems the solver must refuse by name.
#include "unitOperations/membrane/transport/PoreNernstPlanck.H"

#include <cmath>
#include <cstdio>
#include <exception>
#include <string>
#include <vector>

using namespace Choupo;
using namespace Choupo::membrane::pore;

namespace
{

PoreIon ion(int z, scalar P, scalar Kc, scalar phi, scalar gammaCw)
{
    PoreIon i;
    i.z = z; i.P = P; i.Kc = Kc;
    i.feedSide = phi * gammaCw;     // steric x activity x wall conc
    i.permSide = phi;               // steric (no Born here)
    return i;
}

PoreSeed crudeSeed(const PoreProblem& pb)
{
    //  Deliberately NOT the closed form: half the feed-face value for every
    //  ion and no Donnan jump at either face.
    PoreSeed s;
    for (const auto& i : pb.ions) s.cPerm.push_back(0.5 * i.feedSide / i.permSide);
    return s;
}

void printSolution(const char* tag, std::size_t N, const PoreSolution& r)
{
    std::printf("%s %zu conv %d it %d cont %d res %.6e flux %.6e fluxRel %.6e"
                " stiff %.6e current %.6e en %.6e",
                tag, N, r.converged ? 1 : 0, r.iterations, r.continuationSteps,
                r.residual, r.fluxConstancyMax, r.fluxRelativeMax,
                r.stiffnessRatio, r.currentMax, r.electroneutralMax);
    for (scalar c : r.cPerm) std::printf(" %.15e", c);
    std::printf("\n");
}

} // namespace

int main()
{
    const std::vector<std::size_t> grid = {25, 50, 100, 200, 400, 800, 1600};

    // ---- ANALYTIC ---------------------------------------------------------
    {
        const scalar Pp = 4.0e-4, Pm = 7.0e-4, Kp = 1.10, Km = 1.15;
        const scalar Fp = 0.16, Fm = 0.20, gcw = 9.0;
        for (scalar Jv : {2.0e-4, 2.0e-3, 2.0e-1})
        {
            PoreProblem pb;
            pb.ions = { ion(+1, Pp, Kp, Fp, gcw), ion(-1, Pm, Km, Fm, gcw) };
            pb.Xd = 0.0; pb.Jv = Jv;
            const scalar Ps  = 2.0 * Pp * Pm / (Pp + Pm);
            const scalar Kcs = (Kp * Pm + Km * Pp) / (Pp + Pm);
            const scalar S   = std::sqrt(Fp * Fm);
            const scalar Pe  = Kcs * Jv / Ps;
            const scalar cpA = S * Kcs * gcw / (1.0 - (1.0 - S * Kcs) * std::exp(-Pe));
            std::printf("analyticExact %.3e %.15e Pe %.6e\n", Jv, cpA, Pe);
            for (std::size_t N : grid)
            {
                PoreSettings s; s.intervals = N; s.audit = (N == grid.front());
                const PoreSolution r = solve(pb, s, crudeSeed(pb));
                std::printf("analyticJv %.3e ", Jv);
                printSolution("N", N, r);
                if (s.audit)
                    std::printf("audit %.3e offBand %.6e evals %ld blocks %zu size %zu\n",
                                Jv, r.offBandMax, r.jacobianEvals, N + 1,
                                2 * pb.ions.size() + 2);
            }
        }
    }

    // ---- STIFF --------------------------------------------------------------
    PoreProblem stiff;
    {
        //  Na2SO4 10 mol/m3 + a trace of NaCl (0.01 mol/m3) against
        //  X_d = -200 mol/m3; hydrated-radius steric partitions of a
        //  0.6 nm pore; P = K_d D A_k/dx with A_k/dx = 5e6 1/m.
        const scalar AkdX = 5.0e6;
        stiff.ions = {
            ion(+1, 0.30 * 1.33e-9 * AkdX, 1.25, 0.16, 20.01 * 0.85),  // Na
            ion(-2, 0.25 * 1.06e-9 * AkdX, 1.30, 0.13, 10.00 * 0.55),  // SO4
            ion(-1, 0.34 * 2.03e-9 * AkdX, 1.22, 0.20,  0.01 * 0.85),  // Cl (trace)
        };
        stiff.Xd = -200.0;
        stiff.Jv = 4.0e-3;
        for (std::size_t N : grid)
        {
            PoreSettings s; s.intervals = N; s.audit = false;
            printSolution("stiff", N, solve(stiff, s, crudeSeed(stiff)));
        }
    }

    // ---- SWEEP --------------------------------------------------------------
    {
        int total = 0, ok = 0;
        scalar worstRes = 0.0, worstFlux = 0.0, worstCur = 0.0, worstEn = 0.0;
        int worstIt = 0, continued = 0;
        for (scalar Jv : {1.0e-7, 1.0e-6, 1.0e-5, 1.0e-4, 1.0e-3, 4.0e-3, 1.0e-2})
            for (scalar Xd : {0.0, -1.0, -10.0, -100.0, -500.0, -2000.0, 100.0, 1000.0})
            {
                PoreProblem pb = stiff;
                pb.Jv = Jv; pb.Xd = Xd;
                PoreSettings s; s.intervals = 200; s.audit = false;
                ++total;
                try
                {
                    const PoreSolution r = solve(pb, s, crudeSeed(pb));
                    if (r.converged) ++ok;
                    else std::printf("sweepFail Jv %.3e Xd %.1f res %.3e reason %s\n",
                                     Jv, Xd, r.residual, r.stopReason.c_str());
                    worstRes  = std::max(worstRes, r.residual);
                    worstFlux = std::max(worstFlux, r.fluxConstancyMax);
                    worstCur  = std::max(worstCur, r.currentMax);
                    worstEn   = std::max(worstEn, r.electroneutralMax);
                    worstIt   = std::max(worstIt, r.iterations);
                    if (r.continuationSteps > 0) ++continued;
                }
                catch (const std::exception& e)
                {
                    std::printf("sweepFail Jv %.3e Xd %.1f threw %s\n", Jv, Xd, e.what());
                }
            }
        std::printf("sweep total %d converged %d continued %d worstRes %.6e"
                    " worstFlux %.6e worstCurrent %.6e worstEn %.6e worstIter %d\n",
                    total, ok, continued, worstRes, worstFlux, worstCur, worstEn,
                    worstIt);
    }

    // ---- WARM ---------------------------------------------------------------
    {
        PoreSettings s; s.intervals = 200; s.audit = false;
        PoreProblem a = stiff; a.Jv = 1.0e-3;
        const PoreSolution ra = solve(a, s, crudeSeed(a));
        PoreProblem b = stiff; b.Jv = 1.05e-3;
        const PoreSolution warm = solve(b, s, ra);
        const PoreSolution cold = solve(b, s, crudeSeed(b));
        scalar d = 0.0;
        for (std::size_t i = 0; i < warm.cPerm.size(); ++i)
            d = std::max(d, std::abs(warm.cPerm[i] - cold.cPerm[i]) / cold.cPerm[i]);
        std::printf("warm itWarm %d contWarm %d itCold %d contCold %d maxRelDiff %.6e\n",
                    warm.iterations, warm.continuationSteps, cold.iterations,
                    cold.continuationSteps, d);
    }

    // ---- REFUSED ------------------------------------------------------------
    {
        PoreProblem pb;
        pb.ions = { ion(+1, 1e-3, 1.1, 0.2, 5.0), ion(+2, 1e-3, 1.1, 0.2, 5.0) };
        pb.Jv = 1e-5;
        PoreSettings s; s.intervals = 50;
        try { solve(pb, s, crudeSeed(pb)); std::printf("ACCEPTED one-sign\n"); }
        catch (const std::exception& e) { std::printf("REFUSED one-sign: %s\n", e.what()); }

        pb.ions = { ion(+1, 1e-3, 1.1, 0.2, 5.0), ion(-1, 1e-3, 1.1, 0.2, 0.0) };
        try { solve(pb, s, crudeSeed(pb)); std::printf("ACCEPTED absent-ion\n"); }
        catch (const std::exception& e) { std::printf("REFUSED absent-ion: %s\n", e.what()); }
    }
    return 0;
}
