// SPDX-License-Identifier: GPL-3.0-or-later
//
// Probe for bin/curate/check_pore_solver.py -- compiled by the gate against
// src/unitOperations/membrane/transport/PoreNernstPlanck.cpp,
// src/unitOperations/membrane/massTransfer/InterfaceBalance.cpp and
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
//   GRADED    the same analytic limit on the grid graded toward both faces
//             (tanh, beta 2): the order a smooth map must keep, and the
//             error beside the uniform grid's at the same node count.
//   STIFF     a negative X_d of -200 mol/m3 against a divalent co-ion
//             (SO4) and a TRACE monovalent co-ion (Cl), at a water flux
//             that makes the trace ion's Peclet number large: the grid
//             series for Richardson's observed order.
//   JACOBIAN  (C142) the ANALYTIC Jacobian against a central finite
//             difference of the residual, entry by entry, on RANDOM states
//             around the seed of five problems -- the fixed-face pore, the
//             stiff one, and three STATIONS with the wall and the water flux
//             folded in (porePermeate / coupled film with face activities /
//             solution-diffusion wall) -- and the off-band FD entries.
//   STATION   (C142) the three stations solved: the folded wall, closure and
//             wall electroneutrality printed for the gate to recompute; the
//             analytic Newton against the finite-difference (oracle) Newton.
//   SWEEP     water flux x fixed charge, each solved from a CRUDE seed
//             (not the closed form) -- the robustness arm.
//   WARM      a warm start from a neighbouring water flux against a cold
//             solve at the same flux.
//   REFUSED   problems the solver must refuse by name.
#include "unitOperations/membrane/transport/PoreNernstPlanck.H"
#include "solver/BlockTridiagonal.H"

#include <chrono>
#include <cmath>
#include <cstdio>
#include <exception>
#include <random>
#include <string>
#include <vector>

using namespace Choupo;
using namespace Choupo::membrane;
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
    //  Deliberately NOT a closed form: half the feed-face value for every
    //  ion and no Donnan jump at either face.
    PoreSeed s;
    for (std::size_t m = 0; m < pb.ions.size(); ++m)
    {
        const auto& i = pb.ions[m];
        const scalar cw = pb.wall.active ? pb.wall.cBulk[m] : 1.0;
        s.cPerm.push_back(0.5 * i.feedSide * cw / i.permSide);
    }
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

//  The analytic bands against a central finite difference of the residual,
//  entry by entry, each relative to the largest |dF/dx| of its row; and the
//  largest FD entry OFF the three bands (exactly 0 for a true structure).
void jacobianCheck(const char* tag, const PoreProblem& pb, const PoreSettings& s,
                   const sVector& x, scalar& worst, scalar& offBand)
{
    solver::BlockBands J;
    jacobianAt(pb, s, x, J);
    const std::size_t n = x.size(), nv = blockSize(pb);
    std::vector<std::vector<scalar>> diff(n, std::vector<scalar>(3 * nv, 0.0));
    std::vector<scalar> rowMax(n, 0.0);
    for (std::size_t j = 0; j < n; ++j)
    {
        //  Central differences at h and h/2, Richardson-combined: the
        //  truncation error of the oracle falls to O(h^4), so what is left
        //  of a departure is the analytic derivative's, not the oracle's.
        const scalar h = 1.0e-4 * std::max(std::abs(x[j]), 1.0);
        auto central = [&](scalar hh)
        {
            sVector xp = x, xm = x;
            xp[j] += hh; xm[j] -= hh;
            const sVector Fp = residualAt(pb, s, xp), Fm = residualAt(pb, s, xm);
            sVector d(n);
            for (std::size_t i = 0; i < n; ++i) d[i] = (Fp[i] - Fm[i]) / (2.0 * hh);
            return d;
        };
        const sVector d1 = central(h), d2 = central(0.5 * h);
        for (std::size_t i = 0; i < n; ++i)
        {
            const scalar d = (4.0 * d2[i] - d1[i]) / 3.0;
            const long bi = long(i / nv), bj = long(j / nv);
            if (std::labs(bi - bj) > 1) { offBand = std::max(offBand, std::abs(d)); continue; }
            rowMax[i] = std::max(rowMax[i], std::abs(d));
            diff[i][std::size_t(bj - bi + 1) * nv + j % nv]
                = d - J.b[std::size_t(bi)][std::size_t(bj - bi + 1)][i % nv][j % nv];
        }
    }
    for (std::size_t i = 0; i < n; ++i)
        if (rowMax[i] > 0.0)
            for (scalar e : diff[i]) worst = std::max(worst, std::abs(e) / rowMax[i]);
    (void)tag;
}

//  Three STATIONS: the stiff three-ion pore with the film folded in
//  (C142).  Coefficients written here; wall k, D, B per ion.
PoreProblem station(const char* which)
{
    const scalar AkdX = 5.0e6;
    PoreProblem pb;
    pb.ions = {
        ion(+1, 0.30 * 1.33e-9 * AkdX, 1.25, 0.16, 0.85),  // Na  (x C_m)
        ion(-2, 0.25 * 1.06e-9 * AkdX, 1.30, 0.13, 0.55),  // SO4
        ion(-1, 0.34 * 2.03e-9 * AkdX, 1.22, 0.20, 0.85),  // Cl (trace)
    };
    pb.Xd = -50.0;
    pb.wall.active = true;
    pb.wall.cBulk  = { 20.01, 10.0, 0.01 };
    pb.wall.k      = { 5.0e-5, 4.0e-5, 6.0e-5 };
    pb.wall.D      = { 1.33e-9, 1.06e-9, 2.03e-9 };
    pb.wall.B      = { 1.0e-7, 1.0e-7, 1.0e-7 };
    pb.closure.active = true;
    pb.closure.Aw  = 1.0e-11;
    pb.closure.dP  = 9.0e5;
    pb.closure.RT  = 8.314462618 * 298.15;
    const std::string w = which;
    if (w == "coupledActivity" || w == "solutionDiffusion")
    {
        pb.wall.coupled = true;
        pb.wall.suction = SuctionCorrection::GeraldesAfonso2006;
        pb.activity.active = true;
        pb.activity.Asolution = 0.5101;
        pb.activity.Apore     = 0.7360;
    }
    if (w == "coupledActivity")
    {
        //  the props-bench shape: J_v imposed
        pb.closure.active = false;
        pb.Jv = 5.0e-6;
    }
    if (w == "solutionDiffusion") pb.wall.solutionDiffusion = true;
    return pb;
}

} // namespace

int main()
{
    const std::vector<std::size_t> grid = {25, 50, 100, 200, 400, 800, 1600};

    // ---- ANALYTIC ---------------------------------------------------------
    const scalar Pp = 4.0e-4, Pm = 7.0e-4, Kp = 1.10, Km = 1.15;
    const scalar Fp = 0.16, Fm = 0.20, gcw = 9.0;
    {
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
                                Jv, r.offBandMax, r.jacobianEvals, N + 1, blockSize(pb));
            }
            //  GRADED: the same limit on the tanh grid (beta 2)
            for (std::size_t N : {25, 50, 100, 200, 400})
            {
                PoreSettings s; s.intervals = N; s.grading = 2.0; s.audit = false;
                const PoreSolution r = solve(pb, s, crudeSeed(pb));
                std::printf("graded %.3e N %zu conv %d %.15e\n", Jv, N,
                            r.converged ? 1 : 0, r.cPerm[0]);
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

    // ---- JACOBIAN -----------------------------------------------------------
    {
        std::mt19937 rng(20261024u);
        std::uniform_real_distribution<scalar> U(-1.0, 1.0);
        PoreProblem fixedFace;
        fixedFace.ions = { ion(+1, Pp, Kp, Fp, gcw), ion(-1, Pm, Km, Fm, gcw) };
        fixedFace.Jv = 2.0e-3;
        struct P { const char* tag; PoreProblem pb; };
        std::vector<P> list = { {"fixedFace", fixedFace}, {"stiff", stiff},
                                {"porePermeate", station("porePermeate")},
                                {"coupledActivity", station("coupledActivity")},
                                {"solutionDiffusion", station("solutionDiffusion")} };
        int states = 0;
        for (auto& p : list)
            for (scalar beta : {0.0, 2.0})
            {
                PoreSettings s; s.intervals = 12; s.grading = beta;
                const sVector x0 = seedOf(p.pb, s, crudeSeed(p.pb));
                scalar worst = 0.0, off = 0.0;
                for (int r = 0; r < 5; ++r)
                {
                    sVector x = x0;
                    for (auto& v : x) v += 0.05 * U(rng);
                    jacobianCheck(p.tag, p.pb, s, x, worst, off);
                    ++states;
                }
                std::printf("jacobian %s beta %.1f states 5 worst %.6e offBand %.6e\n",
                            p.tag, beta, worst, off);
            }
        std::printf("jacobianStates %d\n", states);
    }

    // ---- STATION ------------------------------------------------------------
    for (const char* w : {"porePermeate", "coupledActivity", "solutionDiffusion"})
    {
        const PoreProblem pb = station(w);
        PoreSettings s; s.intervals = 100; s.audit = false;
        const auto t0 = std::chrono::steady_clock::now();
        const PoreSolution r = solve(pb, s, crudeSeed(pb));
        const auto t1 = std::chrono::steady_clock::now();
        PoreSettings sf = s; sf.finiteDifferenceJacobian = true;
        const PoreSolution rf = solve(pb, sf, crudeSeed(pb));
        const auto t2 = std::chrono::steady_clock::now();
        scalar dd = std::abs(rf.Jv / r.Jv - 1.0);
        for (std::size_t i = 0; i < r.cPerm.size(); ++i)
            dd = std::max(dd, std::abs(rf.cPerm[i] / r.cPerm[i] - 1.0));
        std::printf("station %s conv %d it %d cont %d res %.6e current %.6e en %.6e"
                    " wallCharge %.6e Jv %.15e xiPrime %.15e fdConv %d fdIt %d"
                    " fdMaxRelDiff %.6e msAnalytic %.3f msFD %.3f",
                    w, r.converged ? 1 : 0, r.iterationsTotal, r.continuationSteps,
                    r.residual, r.currentMax, r.electroneutralMax, r.wallChargeMax,
                    r.Jv, r.xiPrime, rf.converged ? 1 : 0, rf.iterationsTotal, dd,
                    std::chrono::duration<double, std::milli>(t1 - t0).count(),
                    std::chrono::duration<double, std::milli>(t2 - t1).count());
        for (std::size_t i = 0; i < r.cPerm.size(); ++i)
            std::printf(" cp %.15e cm %.15e", r.cPerm[i], r.cWall[i]);
        std::printf("\n");
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
