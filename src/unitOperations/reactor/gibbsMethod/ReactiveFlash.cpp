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

#include "ReactiveFlash.H"

#include "core/Constants.H"
#include "solver/NewtonND.H"
#include "thermo/Component.H"

#include <cmath>

namespace Choupo {

GibbsEquilibrium ReactiveFlash::equilibrium(const GibbsProblem& p, scalar T,
                                            const IterHook& onIter) const
{
    const auto&       thermo = *p.thermo;
    const std::size_t M = p.M(), N = p.N();
    const scalar      RTt = constant::R * T;
    const scalar      P   = p.P;

    sVector g_over_RT(N);
    for (std::size_t i = 0; i < N; ++i)
        g_over_RT[i] = thermo.comp(p.compIdx[i]).g_pure_ig(T) / RTt;

    // 1. Gas-only equilibrium.
    GibbsEquilibrium eq = gibbsGasSolve(p, T, g_over_RT, p.b, onIter);
    if (!eq.converged) return eq;

    // 2. Active set: condensables supersaturated in the gas-only result.
    std::vector<std::size_t> act;
    sVector Psat(N, 0.0);
    for (std::size_t i = 0; i < N; ++i)
    {
        if (!p.condensable[i]) continue;
        Psat[i] = thermo.comp(p.compIdx[i]).vp().Psat_Pa(T);
        const scalar y_i = eq.nGas[i] / eq.Ntotal_gas;
        if (y_i * P > Psat[i]) act.push_back(i);
    }
    if (act.empty()) return eq;     // single gas phase is stable
    const std::size_t K = act.size();

    // 3. Newton on x = ln(n_c^L) for the active condensables.  Residual is the
    //    VLE mismatch with the nested gas-only Gibbs at reduced b.
    GibbsEquilibrium gasAt;             // gas solve at the current liquid
    auto fill = [&](const sVector& lnL, GibbsEquilibrium& g) -> sVector {
        sVector nL(N, 0.0);
        scalar  Lsum = 0.0;
        for (std::size_t a = 0; a < K; ++a) { nL[act[a]] = std::exp(lnL[a]); Lsum += nL[act[a]]; }
        sVector b_gas = p.b;
        for (std::size_t j = 0; j < M; ++j)
            for (std::size_t a = 0; a < K; ++a) b_gas[j] -= p.A[j][act[a]] * nL[act[a]];
        g = gibbsGasSolve(p, T, g_over_RT, b_gas, {});
        sVector x(N, 0.0);
        if (Lsum > 0.0) for (std::size_t i = 0; i < N; ++i) x[i] = nL[i] / Lsum;
        sVector gam = thermo.activity().gamma(T, x);
        sVector r(K, 0.0);
        for (std::size_t a = 0; a < K; ++a)
        {
            const std::size_t c = act[a];
            const scalar y_c = g.nGas[c] / g.Ntotal_gas;
            const scalar lhs = std::log(std::max(y_c * P, 1.0e-300));
            const scalar rhs = std::log(std::max(gam[c] * x[c] * Psat[c], 1.0e-300));
            r[a] = lhs - rhs;
        }
        return r;
    };
    auto residual = [&](const sVector& lnL) -> sVector { return fill(lnL, gasAt); };

    // Seed: each condensable's supersaturation excess.
    sVector x0(K, 0.0);
    for (std::size_t a = 0; a < K; ++a)
    {
        const std::size_t c = act[a];
        const scalar y_c = eq.nGas[c] / eq.Ntotal_gas;
        scalar L_guess = eq.nGas[c] * (1.0 - Psat[c] / (y_c * P));
        if (L_guess <= 0.0) L_guess = 1.0e-4 * eq.Ntotal_gas;
        x0[a] = std::log(L_guess);
    }

    solver::NDOptions ndo;
    ndo.tolerance = 1.0e-9;
    ndo.maxIter   = 100;
    auto r = solver::newtonND(residual, x0, ndo);

    // Reconstruct.
    GibbsEquilibrium two;
    fill(r.x, two);                    // refreshes `gasAt` via `two`
    two.nLiq.assign(N, 0.0);
    scalar Lsum = 0.0;
    for (std::size_t a = 0; a < K; ++a) { two.nLiq[act[a]] = std::exp(r.x[a]); Lsum += two.nLiq[act[a]]; }
    two.Ntotal_liq = Lsum;
    two.twoPhase   = (Lsum > 1.0e-10 * (two.Ntotal_gas + Lsum));
    two.converged  = r.converged && two.converged;
    if (!two.twoPhase || !two.converged) return eq;
    return two;
}

} // namespace Choupo
