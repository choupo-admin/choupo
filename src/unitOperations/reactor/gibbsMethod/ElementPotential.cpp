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

#include "ElementPotential.H"

#include "core/Constants.H"
#include "thermo/Component.H"

#include <cmath>

namespace Choupo {

GibbsEquilibrium ElementPotential::equilibrium(const GibbsProblem& p, scalar T,
                                               const IterHook& onIter) const
{
    const auto&       thermo = *p.thermo;
    const std::size_t N = p.N();
    const scalar      RTt = constant::R * T;

    sVector g_over_RT(N);
    for (std::size_t i = 0; i < N; ++i)
        g_over_RT[i] = thermo.comp(p.compIdx[i]).g_pure_ig(T) / RTt;

    // 1. Gas-only equilibrium (the path).
    GibbsEquilibrium eq = gibbsGasSolve(p, T, g_over_RT, p.b, onIter);
    if (!eq.converged) return eq;

    // 2. Is any condensable species supersaturated in the gas?
    const scalar P = p.P;
    int  cond = -1, nSuper = 0;
    scalar PsatC = 0.0;
    for (std::size_t i = 0; i < N; ++i)
    {
        if (!p.condensable[i]) continue;
        const scalar Psat = thermo.comp(p.compIdx[i]).vp().Psat_Pa(T);
        const scalar y_i  = eq.nGas[i] / eq.Ntotal_gas;
        if (y_i * P > Psat) { ++nSuper; cond = static_cast<int>(i); PsatC = Psat; }
    }
    if (nSuper == 0) return eq;     // single gas phase is stable

    // 3. Two-phase (V + L) for ONE condensable species (a pure liquid --- the
    //    common reformer / WGS-with-steam case).  A multi-component condensed
    //    liquid (several condensables, possibly non-ideal) is handled by the
    //    reactiveFlash / directMin methods.
    if (nSuper > 1) return eq;

    // Robust 1-D solve: find L (moles of the condensable in the liquid) such
    // that the gas leaves exactly saturated, y_c P = Psat_c.  The gas element
    // totals are b minus the liquid's atoms; the inner gas-only Gibbs (the
    // proven Newton) has no spurious-root attraction.  r(L) is monotone -> bisect.
    const std::size_t M = p.M();
    const std::size_t c = static_cast<std::size_t>(cond);
    const scalar sat_y = PsatC / P;

    auto resid = [&](scalar L, GibbsEquilibrium& g) -> scalar
    {
        sVector b_gas = p.b;
        for (std::size_t j = 0; j < M; ++j) b_gas[j] -= p.A[j][c] * L;
        g = gibbsGasSolve(p, T, g_over_RT, b_gas, {});
        return g.nGas[c] - sat_y * g.Ntotal_gas;   // >0 supersaturated, <0 over-condensed
    };

    GibbsEquilibrium gLo, gHi, gMid;
    scalar rLo = resid(0.0, gLo);
    if (rLo <= 0.0) return eq;
    scalar L_max = eq.nGas[c];
    scalar rHi = resid(L_max, gHi);
    int it = 0;
    while (rHi > 0.0 && it < 40) { L_max *= 1.5; rHi = resid(L_max, gHi); ++it; }

    scalar Llo = 0.0, Lhi = L_max, L = 0.5 * L_max;
    for (it = 0; it < 80; ++it)
    {
        L = 0.5 * (Llo + Lhi);
        scalar r = resid(L, gMid);
        if (std::abs(r) < 1.0e-12 * std::max(eq.Ntotal_gas, 1.0)) break;
        if (r > 0.0) Llo = L; else Lhi = L;
    }

    GibbsEquilibrium two = gMid;
    two.nLiq.assign(N, 0.0);
    two.nLiq[c] = L;
    two.Ntotal_liq = L;
    two.twoPhase = (L > 1.0e-10 * (two.Ntotal_gas + L));
    if (!two.twoPhase || !two.converged) return eq;
    return two;
}

} // namespace Choupo
