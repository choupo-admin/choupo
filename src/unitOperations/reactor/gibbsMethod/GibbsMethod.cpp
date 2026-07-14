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

#include "core/Constants.H"
#include "solver/NewtonND.H"
#include "thermo/Component.H"

#include <cmath>
#include <algorithm>
#include <stdexcept>
#include <iostream>

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
        auto r = solver::newtonND(residual, x0, ndo);

        eq = GibbsEquilibrium{};
        eq.nGas.assign(N, 0.0);
        eq.nLiq.assign(N, 0.0);
        const scalar ln_N = r.x[M];
        for (std::size_t i = 0; i < N; ++i)
        {
            scalar arg = ln_N - ln_P - g_eff[i];
            for (std::size_t k = 0; k < M; ++k) arg += r.x[k] * A[k][i];
            eq.nGas[i] = std::exp(arg);     // NO clamp: keep deep-underflow values
        }
        scalar Nt = 0.0; for (auto v : eq.nGas) Nt += v;
        eq.Ntotal_gas = Nt; eq.Ntotal_liq = 0.0;
        eq.pi.assign(M, 0.0);
        for (std::size_t j = 0; j < M; ++j) eq.pi[j] = r.x[j];
        eq.twoPhase   = false;
        eq.converged  = r.converged;
        eq.iterations = r.iterations;
        eq.residual   = r.residual;

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
        throw std::runtime_error("GibbsMethod: unknown model '" + name
            + "'.  Registered: see GibbsMethod::availableTypes().");
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

} // namespace Choupo
