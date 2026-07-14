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

#include "DirectMin.H"

#include "core/Constants.H"
#include "solver/NelderMead.H"
#include "solver/NewtonND.H"
#include "thermo/Component.H"

#include <algorithm>
#include <cmath>

namespace Choupo {

namespace {

// Basis of the null space {x : A x = 0} by Gauss-Jordan (RREF).  A is M×N;
// returns N−rank vectors of length N (the independent reaction directions).
std::vector<sVector> nullSpaceBasis(std::vector<sVector> A)
{
    const int M = static_cast<int>(A.size());
    const int N = M ? static_cast<int>(A[0].size()) : 0;
    std::vector<int>  pivotCol;
    std::vector<bool> isPivot(N, false);
    int row = 0;
    for (int col = 0; col < N && row < M; ++col)
    {
        int sel = -1; scalar best = 1.0e-9;
        for (int r = row; r < M; ++r)
            if (std::abs(A[r][col]) > best) { best = std::abs(A[r][col]); sel = r; }
        if (sel < 0) continue;
        std::swap(A[row], A[sel]);
        const scalar pv = A[row][col];
        for (int c = 0; c < N; ++c) A[row][c] /= pv;
        for (int r = 0; r < M; ++r) if (r != row)
        {
            const scalar f = A[r][col];
            if (f != 0.0) for (int c = 0; c < N; ++c) A[r][c] -= f * A[row][c];
        }
        pivotCol.push_back(col); isPivot[col] = true; ++row;
    }
    std::vector<sVector> basis;
    for (int col = 0; col < N; ++col)
    {
        if (isPivot[col]) continue;
        sVector v(N, 0.0); v[col] = 1.0;
        for (int r = 0; r < static_cast<int>(pivotCol.size()); ++r)
            v[pivotCol[r]] = -A[r][col];
        basis.push_back(v);
    }
    return basis;
}

} // namespace

GibbsEquilibrium DirectMin::equilibrium(const GibbsProblem& p, scalar T,
                                        const IterHook& /*onIter*/) const
{
    const auto&       thermo = *p.thermo;
    const std::size_t M = p.M(), N = p.N();
    const scalar      RTt  = constant::R * T;
    const scalar      ln_P = std::log(p.P / constant::Pref);  // ln(P/P0), P0 = 1 bar; was log(p.P) treating Pa as bar (QA gibbs02)

    sVector g_over_RT(N), lnPsat(N, 0.0);
    std::vector<bool> cond(N, false);
    for (std::size_t i = 0; i < N; ++i)
    {
        g_over_RT[i] = thermo.comp(p.compIdx[i]).g_pure_ig(T + p.dTapproach)
                     / (constant::R * (T + p.dTapproach));   // chemistry at T+dT (approach); Psat/enthalpy stay at T
        if (p.condensable[i])
        { cond[i] = true; lnPsat[i] = std::log(thermo.comp(p.compIdx[i]).vp().Psat_Pa(T) / constant::Pref); }  // ln(Psat/P0): symmetric with the gas ln(P/P0) so the V-L equilibrium term is consistent (QA gibbs09)
    }

    // Reaction directions (null space of A) + the condensable index list.
    std::vector<sVector> nu = nullSpaceBasis(p.A);
    const std::size_t R = nu.size();
    std::vector<std::size_t> condIdx;
    for (std::size_t i = 0; i < N; ++i) if (cond[i]) condIdx.push_back(i);
    const std::size_t K = condIdx.size();
    const std::size_t D = R + K;                  // variables: extents + liquid fractions

    // Reconstruct (n^tot, n^V, n^L) from x = (ξ_0..ξ_{R-1}, f_0..f_{K-1}).
    auto unpack = [&](const sVector& x, sVector& nV, sVector& nL) -> bool {
        sVector nt = p.nIn;
        for (std::size_t r = 0; r < R; ++r)
            for (std::size_t i = 0; i < N; ++i) nt[i] += x[r] * nu[r][i];
        nV.assign(N, 0.0); nL.assign(N, 0.0);
        for (std::size_t i = 0; i < N; ++i)
            if (nt[i] < -1.0e-12 * std::max<scalar>(1.0, nt[i])) return false;
        for (std::size_t i = 0; i < N; ++i)
        {
            const scalar ni = std::max<scalar>(nt[i], 0.0);
            scalar f = 0.0;
            for (std::size_t a = 0; a < K; ++a) if (condIdx[a] == i) { f = x[R + a]; break; }
            f = std::min<scalar>(std::max<scalar>(f, 0.0), 1.0);
            nL[i] = f * ni; nV[i] = ni - nL[i];
        }
        return true;
    };

    const scalar PENALTY = 1.0e30;
    auto Gobj = [&](const sVector& x) -> scalar {
        sVector nV, nL;
        if (!unpack(x, nV, nL)) return PENALTY;
        scalar NV = 0.0, NL = 0.0;
        for (std::size_t i = 0; i < N; ++i) { NV += nV[i]; NL += nL[i]; }
        if (NV <= 0.0) return PENALTY;
        sVector x_liq(N, 0.0);
        if (NL > 0.0) for (std::size_t i = 0; i < N; ++i) x_liq[i] = nL[i] / NL;
        sVector gam = (NL > 0.0) ? thermo.activity().gamma(T, x_liq) : sVector(N, 1.0);
        scalar G = 0.0;
        for (std::size_t i = 0; i < N; ++i)
        {
            if (nV[i] > 0.0)
            {
                const scalar y = nV[i] / NV;
                G += nV[i] * (g_over_RT[i] + std::log(y) + ln_P);
            }
            if (nL[i] > 0.0)
            {
                const scalar xl = nL[i] / NL;
                G += nL[i] * (g_over_RT[i] + lnPsat[i]
                              + std::log(std::max(gam[i] * xl, 1.0e-300)));
            }
        }
        return G;
    };

    // ---- Seed from the gas-only equilibrium ----------------------------
    GibbsEquilibrium gas = gibbsGasSolve(p, T, g_over_RT, p.b, {});
    // Extent seed: least-squares fit of (n_gas − nIn) onto the ν basis.
    sVector xc(D, 0.0);
    if (R > 0)
    {
        std::vector<sVector> NtN(R, sVector(R, 0.0));
        sVector rhs(R, 0.0);
        for (std::size_t a = 0; a < R; ++a)
        {
            for (std::size_t b2 = 0; b2 < R; ++b2)
                for (std::size_t i = 0; i < N; ++i) NtN[a][b2] += nu[a][i] * nu[b2][i];
            for (std::size_t i = 0; i < N; ++i) rhs[a] += nu[a][i] * (gas.nGas[i] - p.nIn[i]);
        }
        try { sVector xi = solver::gaussSolve(NtN, rhs);
              for (std::size_t a = 0; a < R; ++a) xc[a] = xi[a]; }
        catch (const std::exception&) {}
    }
    // Liquid-fraction seed from supersaturation.
    for (std::size_t a = 0; a < K; ++a)
    {
        const std::size_t c = condIdx[a];
        const scalar Psat = std::exp(lnPsat[c]) * constant::Pref;  // back to Pa (lnPsat is now ln(Psat/P0))
        const scalar y_c  = gas.nGas[c] / gas.Ntotal_gas;
        xc[R + a] = (y_c * p.P > Psat) ? std::min(0.8, 1.0 - Psat / (y_c * p.P)) : 0.0;
    }

    // Bounds: extents box around the feed scale; fractions in [0,1].
    scalar N0 = 0.0; for (auto v : p.nIn) N0 += v;
    sVector lo(D), hi(D);
    for (std::size_t a = 0; a < R; ++a) { lo[a] = -2.0 * N0; hi[a] = 2.0 * N0; }
    for (std::size_t a = 0; a < K; ++a) { lo[R + a] = 0.0; hi[R + a] = 1.0; }

    solver::NMOptions nmo; nmo.tolX = 1.0e-9; nmo.tolF = 1.0e-10; nmo.maxIter = 2000;

    // Multi-start: the seeded point, the gas-only point (f=0), and a
    // half-condensed variant.
    std::vector<sVector> starts;
    starts.push_back(xc);
    { sVector s = xc; for (std::size_t a = 0; a < K; ++a) s[R + a] = 0.0; starts.push_back(s); }
    { sVector s = xc; for (std::size_t a = 0; a < K; ++a) s[R + a] = 0.5; starts.push_back(s); }

    sVector xBest; scalar fBest = PENALTY;
    for (const auto& s : starts)
    {
        auto res = solver::nelderMead(Gobj, s, lo, hi, nmo);
        if (res.f < fBest) { fBest = res.f; xBest = res.x; }
    }

    // ---- Reconstruct the answer ----------------------------------------
    sVector nV, nL;
    if (xBest.empty() || !unpack(xBest, nV, nL) || fBest >= 0.5 * PENALTY)
        return gas;                              // fall back to gas-only

    GibbsEquilibrium eq;
    eq.nGas = nV; eq.nLiq = nL;
    scalar NV = 0.0, NL = 0.0;
    for (std::size_t i = 0; i < N; ++i) { NV += nV[i]; NL += nL[i]; }
    eq.Ntotal_gas = NV; eq.Ntotal_liq = NL;
    eq.pi.assign(M, 0.0);                          // not produced by direct min
    eq.twoPhase  = (NL > 1.0e-10 * (NV + NL));
    eq.converged = true;
    eq.iterations = 0;
    eq.residual   = 0.0;
    return eq;
}

} // namespace Choupo
