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
\*---------------------------------------------------------------------------*/

#include "GibbsMethod.H"
#include "ElementPotential.H"
#include "ReactiveFlash.H"
#include "DirectMin.H"

#include "core/Advisory.H"
#include "core/Constants.H"
#include "solver/NewtonND.H"
#include "thermo/Component.H"

#include <cmath>
#include <algorithm>
#include <functional>
#include <map>
#include <memory>
#include <stdexcept>
#include <string>
#include <iostream>
#include "thermo/equationOfState/EquationOfState.H"

namespace Choupo {

namespace { inline scalar clampArg(scalar a)
    { return a > 50.0 ? 50.0 : (a < -50.0 ? -50.0 : a); } }

GibbsEquilibrium gibbsGasSolve(const GibbsProblem& p, scalar T,
                               const std::vector<scalar>& g_over_RT,
                               const std::vector<scalar>& b,
                               const std::function<void(int,scalar,scalar)>& onIter)
{
    const std::size_t M = p.M(), N = p.N();
    const auto& A = p.A;
    const scalar ln_P = std::log(p.P / constant::Pref);  // ln(P/P0), P0 = 1 bar; was log(p.P) which treated Pa as bar and broke Dn!=0 equilibria (QA gibbs02)

    scalar N0 = 0.0; for (auto v : p.nIn) N0 += v;
    if (N0 <= 0.0) N0 = 1.0;

    // Effective standard-state Gibbs = g_over_RT PLUS the fugacity correction
    // ln(phi_i), so the equilibrium condition is the REAL-gas one,
    //   mu_i/RT = g_i/RT + ln y_i + ln(P/P0) + ln phi_i.
    // For an ideal-gas package phi = 1 -> g_eff == g_over_RT and the ideal path
    // is byte-identical; for a real EoS (SRK / Peng-Robinson) the outer loop
    // below folds phi in by successive substitution.  This is what makes the
    // high-pressure reaction equilibrium (ammonia synthesis) quantitative.
    sVector g_eff = g_over_RT;
    const bool nonIdeal = (p.thermo != nullptr) && !p.thermo->eos().isIdeal();

    auto residual = [&](const sVector& x) -> sVector
    {
        const scalar ln_N = x[M];
        sVector loc_n(N);
        for (std::size_t i = 0; i < N; ++i)
        {
            scalar arg = ln_N - ln_P - g_eff[i];
            for (std::size_t k = 0; k < M; ++k) arg += x[k] * A[k][i];
            loc_n[i] = std::exp(clampArg(arg));
        }
        sVector r(M + 1, 0.0);
        for (std::size_t j = 0; j < M; ++j)
        {
            scalar s = 0.0;
            for (std::size_t i = 0; i < N; ++i) s += A[j][i] * loc_n[i];
            r[j] = s - b[j];
        }
        scalar Ntot = 0.0; for (auto v : loc_n) Ntot += v;
        r[M] = Ntot - std::exp(ln_N);
        return r;
    };

    // Least-squares seed for π at the feed composition (--- keeps the
    // gas-only Newton trace, and the recorded `iterations` KPI, identical).
    sVector x0(M + 1, 0.0);
    x0[M] = std::log(N0);
    {
        constexpr scalar yFloor = 1.0e-6;
        sVector yFeed(N, 0.0);
        for (std::size_t i = 0; i < N; ++i)
        {
            scalar yi = p.nIn[i] / N0;
            yFeed[i] = (yi < yFloor) ? yFloor : yi;
        }
        sVector rhs(N);
        for (std::size_t i = 0; i < N; ++i)
            rhs[i] = g_eff[i] + std::log(yFeed[i]) + ln_P;
        std::vector<sVector> AAt(M, sVector(M, 0.0));
        sVector Arhs(M, 0.0);
        for (std::size_t j = 0; j < M; ++j)
        {
            for (std::size_t k = 0; k < M; ++k)
                for (std::size_t i = 0; i < N; ++i) AAt[j][k] += A[j][i] * A[k][i];
            for (std::size_t i = 0; i < N; ++i) Arhs[j] += A[j][i] * rhs[i];
        }
        sVector piLstSq;
        try { piLstSq = solver::gaussSolve(AAt, Arhs); }
        catch (const std::exception&) { piLstSq.assign(M, 0.0); }
        for (std::size_t j = 0; j < M; ++j) x0[j] = piLstSq[j];
    }

    solver::NDOptions ndo;
    ndo.tolerance = 1.0e-8;
    ndo.maxIter   = 80;
    if (onIter) ndo.onIter = [&](const solver::NDTrace& tr)
        { onIter(tr.iteration, tr.normF, tr.alpha); };

    // Outer fugacity loop: ONE pass for an ideal package (result identical to
    // before), a few passes for a real EoS as phi settles by successive
    // substitution.
    GibbsEquilibrium eq;
    const int maxOuter = nonIdeal ? 30 : 1;
    for (int outer = 0; outer < maxOuter; ++outer)
    {
        //  THE FIRST ROUTE: the least-squares seed (from the second fugacity
        //  pass on, the previous pass).  Framed as a TRIAL, because if it
        //  stops, what it raised is about a path the solve then discards.
        solver::NDResult r;
        {
            AdvisoryFrame firstRoute("gibbs RAND, least-squares seed", true);
            r = solver::newtonND(residual, x0, ndo);
        }
        //  THE SECOND ROUTE, taken only when the first stopped: the primal
        //  seed (GibbsMethod.H), then the SAME Newton on the SAME residual to
        //  the SAME tolerance.  Announced; and if it too fails, the cause of
        //  BOTH failures travels with the answer instead of a bare "no".
        std::string notConverged;
        if (!r.converged)
        {
            sVector gTilde(N);
            for (std::size_t i = 0; i < N; ++i) gTilde[i] = g_eff[i] + ln_P;
            const GibbsPrimalSeed ps = gibbsPrimalSeed(A, b, gTilde, N0);
            const std::string firstStop = r.stopReason.empty()
                ? "it ended at |F| = " + std::to_string(r.residual) + " after "
                  + std::to_string(r.iterations) + " iterations"
                : r.stopReason;
            if (ps.converged)
            {
                sVector xs(M + 1, 0.0);
                for (std::size_t j = 0; j < M; ++j) xs[j] = ps.pi[j];
                xs[M] = ps.lnN;
                solver::NDResult r2 = solver::newtonND(residual, xs, ndo);
                if (r2.converged)
                {
                    if (AdvisoryLog::instance().add("solver", "info", "gibbs RAND",
                            "the element-potential Newton from its least-squares"
                            " seed at the FEED composition stopped NOT converged"
                            " (a feed far from its equilibrium: the seed inherits"
                            " the whole affinity of the reaction that makes the"
                            " products); it was RE-SEEDED from a primal Gibbs"
                            " iteration on ln n from equal amounts (the reduced"
                            " equations of Gordon & McBride, NASA RP-1311), and"
                            " the SAME Newton then converged on the SAME residual"
                            " to the SAME tolerance.  The seed is a solver aid;"
                            " the answer is the Newton's."))
                        std::cerr << "[solver] gibbs RAND at T = " << T
                                  << " K: least-squares seed stopped (" << firstStop
                                  << "); re-seeded by " << ps.iterations
                                  << " primal Gibbs iterations, then converged in "
                                  << r2.iterations << " Newton iterations,"
                                     " |F| = " << r2.residual
                                  << " (announced once per run).\n";
                    r = std::move(r2);
                }
                else
                    notConverged = "the element-potential Newton stopped from"
                        " its least-squares seed (" + firstStop + ") AND from"
                        " the primal re-seed (" + (r2.stopReason.empty()
                            ? "it ended at |F| = " + std::to_string(r2.residual)
                            : r2.stopReason) + ")";
            }
            else
                notConverged = "the element-potential Newton stopped from its"
                    " least-squares seed (" + firstStop + ") and the primal"
                    " re-seed did not converge either (" + ps.reason + ")";
        }

        eq = GibbsEquilibrium{};
        eq.nGas.assign(N, 0.0);
        eq.nLiq.assign(N, 0.0);
        const scalar ln_N = r.x[M];
        //  THE RESIDUAL CLAMPS ITS EXPONENT; THE ANSWER DOES NOT (2026-09-27,
        //  DEV.md §5 A3).  `clampArg` caps the argument at +/-50 inside the
        //  residual so a wild Newton trial cannot overflow.  Where it BINDS at
        //  the returned point, the equation the Newton solved is not the one
        //  the published moles satisfy.  The LOWER cap is immaterial and is
        //  not announced: it stands in e^-50 ~ 2e-22 for each trace species,
        //  far under the 1e-8 tolerance on the element balance.  The UPPER cap
        //  is announced -- it would mean a species the residual counted at
        //  e^50 is published at more.
        std::string upperBound;
        for (std::size_t i = 0; i < N; ++i)
        {
            scalar arg = ln_N - ln_P - g_eff[i];
            for (std::size_t k = 0; k < M; ++k) arg += r.x[k] * A[k][i];
            if (arg > 50.0)
                upperBound += (upperBound.empty() ? "" : ", ")
                            + (p.thermo ? p.thermo->comp(p.compIdx[i]).name()
                                        : "species #" + std::to_string(i));
            eq.nGas[i] = std::exp(arg);     // NO clamp: keep deep-underflow values
        }
        if (!upperBound.empty()
         && AdvisoryLog::instance().add("solver", "warning", "gibbs RAND",
                "the element-potential residual capped exp(argument) at e^50"
                " for " + upperBound + " AT THE RETURNED POINT: the equation"
                " solved there is not the one the published moles satisfy."))
            std::cerr << "[solver] gibbs RAND: exponent cap bound at the"
                         " answer for " << upperBound << " (announced).\n";
        scalar Nt = 0.0; for (auto v : eq.nGas) Nt += v;
        eq.Ntotal_gas = Nt; eq.Ntotal_liq = 0.0;
        eq.pi.assign(M, 0.0);
        for (std::size_t j = 0; j < M; ++j) eq.pi[j] = r.x[j];
        eq.twoPhase   = false;
        eq.converged  = r.converged;
        eq.iterations = r.iterations;
        eq.residual   = r.residual;
        eq.notConvergedCause = notConverged;

        if (!nonIdeal || Nt <= 0.0) break;   // ideal: single, identical pass

        // Fugacity coefficients at the current gas composition -> next g_eff.
        sVector yFull(p.thermo->n(), 0.0);
        for (std::size_t i = 0; i < N; ++i)
            yFull[p.compIdx[i]] = std::max(0.0, eq.nGas[i] / Nt);
        const sVector phiFull = p.thermo->eos().phi(T, p.P, yFull);
        scalar dMax = 0.0;
        for (std::size_t i = 0; i < N; ++i)
        {
            const scalar lnPhi = std::log(std::max(phiFull[p.compIdx[i]], 1.0e-300));
            const scalar gNew  = g_over_RT[i] + lnPhi;
            dMax = std::max(dMax, std::abs(gNew - g_eff[i]));
            g_eff[i] = gNew;
        }
        x0 = r.x;                            // warm start the next pass
        if (dMax < 1.0e-8) break;            // phi self-consistent
    }
    return eq;
}

std::map<std::string, GibbsMethod::Factory>& GibbsMethod::registry()
{
    static std::map<std::string, Factory> r;
    return r;
}

void GibbsMethod::registerType(const std::string& name, Factory f)
{
    registry()[name] = std::move(f);
}

std::unique_ptr<GibbsMethod> GibbsMethod::New(const std::string& name)
{
    auto it = registry().find(name);
    if (it == registry().end())
    {
        std::string avail;
        for (const auto& kv : registry()) avail += " " + kv.first;
        throw std::runtime_error("GibbsMethod: unknown model '" + name
            + "'.  Registered:" + (avail.empty() ? " (none)" : avail));
    }
    return it->second();
}

void GibbsMethod::registerBuiltins()
{
    registerType("elementPotential", []{ return std::make_unique<ElementPotential>(); });
    registerType("ideal",            []{ return std::make_unique<ElementPotential>(); }); // alias
    registerType("RAND",             []{ return std::make_unique<ElementPotential>(); }); // alias
    registerType("reactiveFlash",    []{ return std::make_unique<ReactiveFlash>(); });
    registerType("nonideal",         []{ return std::make_unique<ReactiveFlash>(); });    // alias
    registerType("NRTL",             []{ return std::make_unique<ReactiveFlash>(); });    // alias
    registerType("directMin",        []{ return std::make_unique<DirectMin>(); });
    registerType("nelderMead",       []{ return std::make_unique<DirectMin>(); });        // alias
}

std::vector<std::string> GibbsMethod::availableTypes()
{
    std::vector<std::string> v;
    for (const auto& [k, _] : registry()) v.push_back(k);
    return v;
}

//  THE PRIMAL SEED (see GibbsMethod.H).  One iteration, at fixed T and P, in
//  the reduced form: with mu_j = gTilde_j + ln(n_j/n) at the current amounts,
//
//    sum_i pi_i sum_j a_kj a_ij n_j + dln n sum_j a_kj n_j
//                               = b_k - sum_j a_kj n_j + sum_j a_kj n_j mu_j
//    sum_i pi_i sum_j a_ij n_j  + dln n (sum_j n_j - n)
//                               = n - sum_j n_j + sum_j n_j mu_j
//
//  then dln n_j = -mu_j + sum_i a_ij pi_i + dln n.  The first rows are the
//  element balances linearised in ln n_j; the last is the definition of the
//  total n linearised the same way.  At convergence every dln n_j is zero,
//  so mu_j = sum_i a_ij pi_i: the pi here ARE the element potentials of the
//  Newton this seeds, and n is its N.
GibbsPrimalSeed gibbsPrimalSeed(const std::vector<std::vector<scalar>>& A,
                                const std::vector<scalar>&              b,
                                const std::vector<scalar>&              gTilde,
                                scalar                                  N0,
                                int                                     maxIter)
{
    const std::size_t M = b.size();
    const std::size_t N = gTilde.size();
    GibbsPrimalSeed out;
    if (!(N0 > 0.0)) N0 = 1.0;

    //  Equal amounts of every species, the feed's total: no species is
    //  favoured before the thermodynamics has been asked.
    sVector lnn(N, std::log(N0 / static_cast<scalar>(N)));
    scalar  lnTot = std::log(N0);
    scalar  bMax  = 0.0;
    for (auto v : b) bMax = std::max(bMax, std::abs(v));

    //  A species below 1e-8 of the total is TRACE (ln 1e-8 = -18.42): it
    //  does not set the step, and a trace species that grows is not carried
    //  past 1e-4 of the total (ln 1e-4 = -9.21) in one step.
    const scalar lnTrace = std::log(1.0e-8);
    const scalar lnCap   = std::log(1.0e-4);

    for (int it = 0; it < maxIter; ++it)
    {
        out.iterations = it + 1;
        sVector n(N), mu(N);
        scalar  sumN = 0.0;
        for (std::size_t j = 0; j < N; ++j)
        {
            n[j]  = std::exp(lnn[j]);        // underflow to 0 is harmless here
            mu[j] = gTilde[j] + lnn[j] - lnTot;
            sumN += n[j];
        }
        const scalar nTot = std::exp(lnTot);

        std::vector<sVector> G(M + 1, sVector(M + 1, 0.0));
        sVector rhs(M + 1, 0.0);
        for (std::size_t k = 0; k < M; ++k)
        {
            scalar bk = 0.0, bmu = 0.0;
            for (std::size_t j = 0; j < N; ++j)
            {
                if (A[k][j] == 0.0) continue;
                for (std::size_t i = 0; i < M; ++i)
                    G[k][i] += A[k][j] * A[i][j] * n[j];
                bk  += A[k][j] * n[j];
                bmu += A[k][j] * n[j] * mu[j];
            }
            G[k][M]  = bk;
            G[M][k]  = bk;
            rhs[k]   = b[k] - bk + bmu;
        }
        scalar nmu = 0.0;
        for (std::size_t j = 0; j < N; ++j) nmu += n[j] * mu[j];
        G[M][M]  = sumN - nTot;
        rhs[M]   = nTot - sumN + nmu;

        sVector sol;
        try { sol = solver::gaussSolve(G, rhs); }
        catch (const std::exception& e)
        {
            out.reason = std::string("its linear system was singular at"
                " iteration ") + std::to_string(it + 1) + " (" + e.what() + ")";
            return out;
        }
        const scalar dlnTot = sol[M];
        sVector dlnn(N);
        for (std::size_t j = 0; j < N; ++j)
        {
            scalar s = -mu[j] + dlnTot;
            for (std::size_t i = 0; i < M; ++i) s += A[i][j] * sol[i];
            dlnn[j] = s;
        }

        //  CONVERGED: every major species and the total moved by less than
        //  5e-6 of the total, and the element balances hold to 1e-6 of the
        //  largest element total.  Loose on purpose -- it is a SEED; the
        //  element-potential Newton owns the 1e-8 answer.
        scalar corr = sumN > 0.0 ? nTot * std::abs(dlnTot) / sumN : 1.0;
        for (std::size_t j = 0; j < N; ++j)
            corr = std::max(corr, sumN > 0.0 ? n[j] * std::abs(dlnn[j]) / sumN : 1.0);
        scalar elem = 0.0;
        for (std::size_t k = 0; k < M; ++k)
        {
            scalar bk = 0.0;
            for (std::size_t j = 0; j < N; ++j) bk += A[k][j] * n[j];
            elem = std::max(elem, std::abs(bk - b[k]));
        }
        if (!std::isfinite(corr) || !std::isfinite(elem))
        {
            out.reason = "a non-finite amount at iteration "
                       + std::to_string(it + 1);
            return out;
        }
        if (corr <= 5.0e-6 && elem <= 1.0e-6 * bMax)
        {
            out.converged = true;
            out.pi.assign(sol.begin(), sol.begin() + static_cast<long>(M));
            out.lnN = lnTot;
            return out;
        }

        //  THE STEP LIMIT, the method's only aid: no major species (nor the
        //  total, weighted 5x) changes by more than a factor e^2, and no
        //  growing trace species is carried past 1e-4 of the total.
        scalar big = 5.0 * std::abs(dlnTot);
        for (std::size_t j = 0; j < N; ++j)
            if (lnn[j] - lnTot > lnTrace) big = std::max(big, std::abs(dlnn[j]));
        scalar lambda = (big > 2.0) ? 2.0 / big : 1.0;
        for (std::size_t j = 0; j < N; ++j)
        {
            const scalar rel = lnn[j] - lnTot;
            const scalar up  = dlnn[j] - dlnTot;
            if (rel <= lnTrace && dlnn[j] >= 0.0 && up > 0.0)
                lambda = std::min(lambda, std::abs((lnCap - rel) / up));
        }
        for (std::size_t j = 0; j < N; ++j) lnn[j] += lambda * dlnn[j];
        lnTot += lambda * dlnTot;
    }
    out.reason = "it did not converge in " + std::to_string(maxIter)
               + " iterations";
    return out;
}

} // namespace Choupo
