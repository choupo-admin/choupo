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

#include "IsothermalFlash.H"
#include "solver/NelderMead.H"
#include "solver/NewtonND.H"
#include "solver/NewtonRaphson.H"
#include "solver/StabilityTest.H"
#include "solver/Wegstein.H"

#include <cmath>
#include <iomanip>
#include <iostream>
#include <limits>
#include <stdexcept>

namespace Choupo {

namespace {

scalar RR(const sVector& z, const sVector& K, scalar V)
{
    scalar s = 0.0;
    for (std::size_t i = 0; i < z.size(); ++i)
        s += z[i] * (K[i] - 1.0) / (1.0 + V * (K[i] - 1.0));
    return s;
}

scalar dRR_dV(const sVector& z, const sVector& K, scalar V)
{
    scalar s = 0.0;
    for (std::size_t i = 0; i < z.size(); ++i)
    {
        scalar d = 1.0 + V * (K[i] - 1.0);
        s -= z[i] * (K[i] - 1.0) * (K[i] - 1.0) / (d * d);
    }
    return s;
}

} // anonymous namespace

FlashSolution
IsothermalFlash::solveCore(const FlashInput&    in,
                           const ThermoPackage& thermo,
                           const FlashOptions&  opts)
{
    FlashSolution sol;
    const std::size_t n = in.z.size();
    if (n != thermo.n())
        throw std::runtime_error("Flash: feed composition length ("
            + std::to_string(n) + ") differs from thermo components ("
            + std::to_string(thermo.n()) + ")");

    // ----------------------------------------------------------------------
    //  Outer loop on composition.
    //
    //  Direct substitution:
    //      x_{k+1} = g(x_k)        where g(x) = z / (1 + V·(K(x) - 1))
    //  This converges linearly with rate g'(x), which for strongly
    //  non-ideal mixtures is close to 1 (very slow).
    //
    //  Wegstein acceleration (default):
    //      uses a secant approximation of g' to produce a Newton-like
    //      over-relaxation.  Typically cuts the iteration count
    //      from O(20-40) to O(5-10).
    // ----------------------------------------------------------------------
    sVector x = in.z;
    sVector y = in.z;

    // Identify which two phases the flash equilibrates.
    std::size_t phaseAlpha = 0, phaseBeta = 1;
    if (opts.phaseSet == PhaseSet::LL)
    {
        auto liqs = thermo.phasesOfType("liquid");
        if (liqs.size() < 2)
            throw std::runtime_error("LL flash needs >= 2 liquid phases in "
                "the thermoPackage (got " + std::to_string(liqs.size()) + ")");
        phaseAlpha = liqs[0];
        phaseBeta  = liqs[1];

        // -----------------------------------------------------------------
        //  LL flash via direct minimisation of the Gibbs energy of
        //  mixing on the simplex of compositions.  Variables in
        //  Nelder-Mead (length n):
        //
        //      v[0]         =  β                         in (0, 1)
        //      v[1..n-1]    =  x_α[0..n-2]               in (0, 1)
        //
        //  x_α[n-1] is set by Σ x_α = 1 (penalty if any x_α < 0).
        //  x_β is set by overall mass balance:
        //      x_β_i = (z_i − (1−β) x_α_i) / β
        //  (penalty if any x_β < 0).
        //
        //  Objective (per mole of feed, divided by RT):
        //      G(β, x_α) = (1−β) Σ x_α_i [ln x_α_i + ln γ_α_i(x_α)]
        //                +   β   Σ x_β_i [ln x_β_i + ln γ_β_i(x_β)]
        //
        //  Direct minimisation cannot fall into the K=1 saddle of g(Y)
        //  that traps Newton-on-fixed-point methods --- the simplex
        //  algorithm probes g values, not roots of its gradient.
        //  Multi-start gives global-search robustness over symmetric
        //  LLE landscapes.
        // -----------------------------------------------------------------

        // Decision-only Michelsen TPD (cheap pre-check).
        auto stab = solver::michelsenTPD(thermo.phase(phaseAlpha), in.T, in.P, in.z);

        if (opts.verbosity >= 3)
        {
            std::cout << "\nMichelsen TPD stability test on phase '"
                      << thermo.phase(phaseAlpha).name() << "':\n"
                      << "  tm_min   = " << std::scientific << std::setprecision(4)
                      << stab.tmMin
                      << "       unstable = " << (stab.unstable ? "YES" : "no")
                      << "\n\n";
        }
        if (!stab.unstable)
        {
            sol.regime    = "single liquid (no LL split detected by TPD)";
            sol.V_over_F  = 0.0;
            sol.x         = in.z;
            sol.y.assign(n, 0.0);
            sol.K.assign(n, 1.0);
            sol.converged = true;
            return sol;
        }

        const std::size_t iA =
            (opts.llAlphaRichComp == static_cast<std::size_t>(-1))
            ? 0     : opts.llAlphaRichComp;
        const std::size_t iB =
            (opts.llBetaRichComp == static_cast<std::size_t>(-1))
            ? n - 1 : opts.llBetaRichComp;

        // ACTIVE components: restrict the Gibbs minimisation to species actually
        // present in the feed (z > 0).  A stream in a large flowsheet carries
        // many components that are ZERO here; searching the full simplex over
        // them makes the LL split unfindable in high dimension.  Inactive
        // species stay 0 in both phases -> mass is conserved EXACTLY.  When all
        // species are active (nA == n) the search is identical to the full one,
        // so every existing LL case is byte-unchanged.
        std::vector<std::size_t> act;
        for (std::size_t i = 0; i < n; ++i)
            if (in.z[i] > 1.0e-10) act.push_back(i);
        const std::size_t nA = act.size();
        auto posInAct = [&](std::size_t full) -> std::size_t
        {
            for (std::size_t a = 0; a < nA; ++a) if (act[a] == full) return a;
            return 0;
        };

        const scalar INFEASIBLE_PENALTY = 1.0e8;
        const scalar EPS_SIMPLEX        = 1.0e-9;

        // Fewer than two present species cannot split -> single liquid.
        if (nA < 2)
        {
            sol.regime    = "single liquid (one component present)";
            sol.V_over_F  = 0.0;
            sol.x         = in.z;
            sol.y.assign(n, 0.0);
            sol.K.assign(n, 1.0);
            sol.converged = true;
            return sol;
        }

        // Pack (β, x_α[0..n-2]) -> (β, x_α[0..n-1], x_β[0..n-1])  or  fail.
        auto unpack = [&](const sVector& v,
                          scalar& beta, sVector& xA, sVector& xB) -> bool
        {
            beta = v[0];
            if (beta < EPS_SIMPLEX || beta > 1.0 - EPS_SIMPLEX) return false;

            xA.assign(n, 0.0);
            scalar sumA = 0.0;
            for (std::size_t a = 0; a < nA - 1; ++a)
            {
                xA[act[a]] = v[1 + a];
                if (xA[act[a]] < EPS_SIMPLEX) return false;
                sumA += xA[act[a]];
            }
            xA[act[nA - 1]] = 1.0 - sumA;
            if (xA[act[nA - 1]] < EPS_SIMPLEX) return false;

            xB.assign(n, 0.0);
            for (std::size_t a = 0; a < nA; ++a)
            {
                const std::size_t i = act[a];
                xB[i] = (in.z[i] - (1.0 - beta) * xA[i]) / beta;
                if (xB[i] < EPS_SIMPLEX) return false;
            }
            return true;
        };

        auto gibbsObjective = [&](const sVector& v) -> scalar
        {
            scalar beta;
            sVector xA, xB;
            if (!unpack(v, beta, xA, xB)) return INFEASIBLE_PENALTY;

            const auto gA = thermo.phase(phaseAlpha).activityCoefficients(in.T, xA);
            const auto gB = thermo.phase(phaseBeta ).activityCoefficients(in.T, xB);

            scalar G = 0.0;
            for (std::size_t a = 0; a < nA; ++a)
            {
                const std::size_t i = act[a];
                const scalar lnAi = std::log(xA[i])
                                  + std::log(std::max<scalar>(gA[i], 1.0e-30));
                const scalar lnBi = std::log(xB[i])
                                  + std::log(std::max<scalar>(gB[i], 1.0e-30));
                G += (1.0 - beta) * xA[i] * lnAi
                   +        beta  * xB[i] * lnBi;
            }
            return G;
        };

        // Reference: Gibbs of staying in a single phase at the feed.
        // If the multi-start NM cannot find anything below this, we
        // declare the feed stable (TPD said unstable, but the basin
        // it pointed to may have collapsed by direct minimisation).
        scalar gFeed = INFEASIBLE_PENALTY;
        {
            auto gZ = thermo.phase(phaseAlpha).activityCoefficients(in.T, in.z);
            gFeed = 0.0;
            for (std::size_t a = 0; a < nA; ++a)
            {
                const std::size_t i = act[a];
                gFeed += in.z[i] * (std::log(std::max<scalar>(in.z[i], 1.0e-30))
                                  + std::log(std::max<scalar>(gZ[i], 1.0e-30)));
            }
        }

        // Multi-start: 4 simplexes that bracket the symmetric LL
        // landscape from different basins.
        std::vector<sVector> starts;
        auto pushStart = [&](scalar betaG, std::size_t richPos) {
            sVector s(nA, 0.0);
            s[0] = betaG;
            for (std::size_t a = 0; a < nA - 1; ++a)
                s[1 + a] = (a == richPos) ? 0.92 : 0.04;
            // If x_α[last] would come out negative or >1, renormalise.
            scalar sumA = 0.0;
            for (std::size_t a = 0; a < nA - 1; ++a) sumA += s[1 + a];
            if (sumA >= 1.0)
            {
                const scalar scale = 0.95 / sumA;
                for (std::size_t a = 0; a < nA - 1; ++a) s[1 + a] *= scale;
            }
            starts.push_back(s);
        };

        // Pure-iA and pure-iB biased starts at β = 0.5, plus their
        // β = 0.25 and β = 0.75 variants (rich component -> its active slot).
        pushStart(0.50, posInAct(iA));
        pushStart(0.50, posInAct(iB));
        pushStart(0.25, posInAct(iA));
        pushStart(0.75, posInAct(iA));

        // Bounds
        sVector lo(nA, 1.0e-4), hi(nA, 1.0 - 1.0e-4);

        solver::NMOptions nmo;
        nmo.maxIter           = 400;
        nmo.tolX              = 1.0e-5;
        nmo.tolF              = 1.0e-7;
        nmo.simplexInitFactor = 0.10;

        scalar bestG     = std::numeric_limits<scalar>::infinity();
        sVector bestV;
        int     totalEvals  = 0;
        int     bestStart   = -1;
        bool    bestConv    = false;

        for (std::size_t k = 0; k < starts.size(); ++k)
        {
            auto res = solver::nelderMead(gibbsObjective, starts[k], lo, hi, nmo);
            totalEvals += res.evaluations;
            if (res.f < bestG)
            {
                bestG     = res.f;
                bestV     = res.x;
                bestStart = static_cast<int>(k);
                bestConv  = res.converged;
            }
        }

        if (opts.verbosity >= 3)
        {
            std::cout << "LL flash via Gibbs minimisation (Nelder-Mead, "
                      << starts.size() << " multi-starts):\n"
                      << "  evaluations  : " << totalEvals  << "\n"
                      << "  best start   : #" << bestStart  << "\n"
                      << "  G(LL split)  : " << std::scientific
                      << std::setprecision(6) << bestG  << "\n"
                      << "  G(feed only) : " << gFeed << "\n"
                      << "  ΔG = G_LL − G_z: " << (bestG - gFeed) << "\n\n";
        }

        // If the best LL configuration has G higher than feed, the
        // TPD detected a weak instability that the Gibbs landscape
        // does not actually realise (numerical or model artifact);
        // fall back to single-phase.
        if (!(bestG < gFeed - 1.0e-10))
        {
            sol.regime    = "single liquid (Gibbs min finds no improvement over feed)";
            sol.V_over_F  = 0.0;
            sol.x         = in.z;
            sol.y.assign(n, 0.0);
            sol.K.assign(n, 1.0);
            sol.converged = true;
            return sol;
        }

        scalar betaFinal; sVector xA, xB;
        unpack(bestV, betaFinal, xA, xB);

        sol.regime     = "two-phase liquid (LL via Gibbs minimisation)";
        sol.V_over_F   = betaFinal;
        sol.x          = xA;
        sol.y          = xB;
        sol.K          = thermo.Kvec_phases(phaseAlpha, phaseBeta,
                                            in.T, in.P, xA, xB);
        sol.iterations = totalEvals;
        sol.residual   = bestG;
        sol.converged  = bestConv;
        return sol;
    }

    // ============================================================
    //                  VLLE (vapour + 2 liquids)
    // ============================================================
    if (opts.phaseSet == PhaseSet::VLLE)
    {
        auto vaps = thermo.phasesOfType("vapor");
        auto liqs = thermo.phasesOfType("liquid");
        if (vaps.empty())
            throw std::runtime_error("VLLE flash needs >= 1 vapor phase "
                "in the thermoPackage (got 0)");
        if (liqs.size() < 2)
            throw std::runtime_error("VLLE flash needs >= 2 liquid phases "
                "in the thermoPackage (got " + std::to_string(liqs.size()) + ")");
        (void)vaps[0];   // vapor phase index not currently needed (γ unused; we use Psat directly)
        const std::size_t pAlpha = liqs[0];
        const std::size_t pBeta  = liqs[1];

        // -----------------------------------------------------------------
        //  VLLE via direct Gibbs minimisation on the (2n)-dimensional
        //  composition simplex.  Free variables:
        //
        //      v[0]               =  β_V       in (0, 1)
        //      v[1]               =  β_α       in (0, 1-β_V)
        //      v[2..n]            =  y[0..n-2]      (n-1 entries)
        //      v[n+1..2n-1]       =  x_α[0..n-2]    (n-1 entries)
        //
        //  Derived:
        //      β_β  = 1 - β_V - β_α            (penalty if ≤ 0)
        //      y[n-1], x_α[n-1] from Σ x = 1   (penalty if ≤ 0)
        //      x_β  from overall mass balance per component
        //
        //  Objective (per mole feed, ÷ RT, reference = pure liquid):
        //
        //      G = β_V Σ y_i [ln y_i + ln(P / Psat_i(T))]
        //        + β_α Σ x_α_i [ln x_α_i + ln γ_α_i(x_α)]
        //        + β_β Σ x_β_i [ln x_β_i + ln γ_β_i(x_β)]
        //
        //  Same logic as the 2-phase LL branch, with one extra phase
        //  contribution.  Ideal-gas vapour assumed (φ_i = 1); the
        //  ln(P/Psat_i) term encodes the vapour-vs-liquid stability
        //  via Antoine.
        // -----------------------------------------------------------------

        const scalar INFEAS    = 1.0e8;
        const scalar EPS_VLLE  = 1.0e-9;
        const std::size_t nVars = 2 * n;          // (β_V, β_α, y[0..n-2], x_α[0..n-2])

        auto unpackVLLE = [&](const sVector& v,
                              scalar& bV, scalar& bA, scalar& bB,
                              sVector& y, sVector& xA, sVector& xB) -> bool
        {
            bV = v[0]; bA = v[1];
            bB = 1.0 - bV - bA;
            if (bV < EPS_VLLE || bA < EPS_VLLE || bB < EPS_VLLE) return false;
            if (bV > 1.0 - EPS_VLLE || bA > 1.0 - EPS_VLLE
                || bB > 1.0 - EPS_VLLE) return false;

            y.assign(n, 0.0);
            xA.assign(n, 0.0);
            scalar sumY = 0.0, sumA = 0.0;
            for (std::size_t i = 0; i < n - 1; ++i)
            {
                y [i] = v[2 + i];
                xA[i] = v[2 + (n - 1) + i];
                if (y[i] < EPS_VLLE || xA[i] < EPS_VLLE) return false;
                sumY += y [i];
                sumA += xA[i];
            }
            y [n - 1] = 1.0 - sumY;
            xA[n - 1] = 1.0 - sumA;
            if (y[n - 1] < EPS_VLLE || xA[n - 1] < EPS_VLLE) return false;

            xB.assign(n, 0.0);
            for (std::size_t i = 0; i < n; ++i)
            {
                xB[i] = (in.z[i] - bV * y[i] - bA * xA[i]) / bB;
                if (xB[i] < EPS_VLLE) return false;
            }
            // Consistency: Σ xB should equal 1 (auto if mass balance holds).
            scalar sumB = 0.0;
            for (auto v2 : xB) sumB += v2;
            if (std::abs(sumB - 1.0) > 1.0e-4) return false;
            return true;
        };

        auto vlleObjective = [&](const sVector& v) -> scalar
        {
            scalar bV, bA, bB;
            sVector y, xA, xB;
            if (!unpackVLLE(v, bV, bA, bB, y, xA, xB)) return INFEAS;

            const auto gA = thermo.phase(pAlpha).activityCoefficients(in.T, xA);
            const auto gB = thermo.phase(pBeta ).activityCoefficients(in.T, xB);

            scalar G = 0.0;
            for (std::size_t i = 0; i < n; ++i)
            {
                const scalar Psat =
                    std::max<scalar>(thermo.comp(i).vp().Psat_Pa(in.T), 1.0e-30);
                const scalar lnY = std::log(y [i]) + std::log(in.P / Psat);
                const scalar lnA = std::log(xA[i]) + std::log(std::max<scalar>(gA[i], 1.0e-30));
                const scalar lnB = std::log(xB[i]) + std::log(std::max<scalar>(gB[i], 1.0e-30));
                G += bV * y [i] * lnY
                   + bA * xA[i] * lnA
                   + bB * xB[i] * lnB;
            }
            return G;
        };

        // Reference Gibbs of the feed-as-single-liquid.
        scalar gFeed = INFEAS;
        {
            auto gZ = thermo.phase(pAlpha).activityCoefficients(in.T, in.z);
            gFeed = 0.0;
            for (std::size_t i = 0; i < n; ++i)
                gFeed += in.z[i] * (std::log(std::max<scalar>(in.z[i], 1.0e-30))
                                  + std::log(std::max<scalar>(gZ[i], 1.0e-30)));
        }

        // -----------------------------------------------------------------
        //  Multi-start.  Five canonical configurations bracketing the
        //  region where 3-phase coexistence can occur.
        // -----------------------------------------------------------------
        const std::size_t iA =
            (opts.llAlphaRichComp == static_cast<std::size_t>(-1))
            ? 0     : opts.llAlphaRichComp;
        const std::size_t iB =
            (opts.llBetaRichComp == static_cast<std::size_t>(-1))
            ? n - 1 : opts.llBetaRichComp;

        // Mass-balance-derived multi-start.  For each candidate
        // (β_V, β_α, x_α, x_β) we solve for y by overall mass balance:
        //
        //     y_i = (z_i − β_α x_α_i − β_β x_β_i) / β_V
        //
        // If all y_i ∈ (0, 1), the start is admissible AND feasible
        // (no INFEAS penalty on the first evaluation).  This is
        // essential for ternaries: with naive component-by-component
        // bias the projected x_β often comes out negative and every
        // start returns the penalty, leaving Nelder-Mead with no
        // gradient to follow.
        auto packStart = [&](scalar bV, scalar bA, const sVector& yFull,
                             const sVector& xAFull) {
            sVector s(nVars, 0.0);
            s[0] = bV;
            s[1] = bA;
            for (std::size_t i = 0; i < n - 1; ++i)
            {
                s[2 + i]           = yFull[i];
                s[2 + (n - 1) + i] = xAFull[i];
            }
            return s;
        };

        auto compRich = [&](scalar bias, std::size_t richIdx) {
            sVector c(n, (1.0 - bias) / static_cast<scalar>(std::max<std::size_t>(n - 1, 1)));
            c[richIdx] = bias;
            return c;
        };

        std::vector<sVector> starts;
        auto pushDerivedStart = [&](scalar bV, scalar bA,
                                    const sVector& xA, const sVector& xB) {
            const scalar bB = 1.0 - bV - bA;
            if (bV < 0.02 || bA < 0.02 || bB < 0.02) return;
            sVector y(n);
            scalar sumY = 0.0;
            for (std::size_t i = 0; i < n; ++i)
            {
                y[i] = (in.z[i] - bA * xA[i] - bB * xB[i]) / bV;
                if (y[i] < 1.0e-4 || y[i] > 1.0 - 1.0e-4) return;
                sumY += y[i];
            }
            if (std::abs(sumY - 1.0) > 1.0e-3) return;
            starts.push_back(packStart(bV, bA, y, xA));
        };

        // Canonical heteroazeotrope seed: α extremely rich in iA, β
        // extremely rich in iB.  Sweep over a grid of (β_V, β_α) so
        // at least one falls inside the simplex of feasible mass
        // balances for the given feed composition.
        for (scalar bV : { 0.20, 0.35, 0.50, 0.65, 0.80 })
        {
            for (scalar bA : { 0.10, 0.15, 0.25, 0.40 })
            {
                pushDerivedStart(bV, bA,
                                 compRich(0.95, iA), compRich(0.95, iB));
                pushDerivedStart(bV, bA,
                                 compRich(0.99, iA), compRich(0.99, iB));
            }
        }
        // Also seed the *binary* heteroazeotrope pattern (compositions
        // mostly along the iA-iB axis, third component small), which
        // covers binary cases as well.
        if (starts.empty())
        {
            // Last-ditch fallback: rich-iA in one liquid, rich-iB in the
            // other, vapour = feed.  Rarely feasible but better than
            // nothing.
            starts.push_back(packStart(0.20, 0.40, in.z,
                                        compRich(0.90, iA)));
        }

        sVector lo(nVars, 1.0e-4), hi(nVars, 1.0 - 1.0e-4);

        solver::NMOptions nmo;
        nmo.maxIter           = 500;
        nmo.tolX              = 1.0e-5;
        nmo.tolF              = 1.0e-7;
        nmo.simplexInitFactor = 0.10;

        scalar  bestG    = std::numeric_limits<scalar>::infinity();
        sVector bestV;
        int     totalEvals = 0;
        int     bestStart  = -1;
        bool    bestConv   = false;

        for (std::size_t k = 0; k < starts.size(); ++k)
        {
            auto res = solver::nelderMead(vlleObjective, starts[k], lo, hi, nmo);
            totalEvals += res.evaluations;
            if (res.f < bestG)
            {
                bestG     = res.f;
                bestV     = res.x;
                bestStart = static_cast<int>(k);
                bestConv  = res.converged;
            }
        }

        if (opts.verbosity >= 3)
        {
            std::cout << "VLLE flash via Gibbs minimisation (Nelder-Mead, "
                      << starts.size() << " multi-starts):\n"
                      << "  vars          : " << nVars << "  (β_V, β_α, y, x_α)\n"
                      << "  evaluations   : " << totalEvals << "\n"
                      << "  best start    : #" << bestStart << "\n"
                      << "  G(3-phase split): " << std::scientific
                      << std::setprecision(6) << bestG  << "\n"
                      << "  G(feed only)  : " << gFeed << "\n"
                      << "  ΔG = G_split - G_z: " << (bestG - gFeed) << "\n\n";
        }

        if (!(bestG < gFeed - 1.0e-10))
        {
            sol.regime    = "single liquid (Gibbs min finds no 3-phase improvement over feed)";
            sol.V_over_F  = 0.0;
            sol.x         = in.z;
            sol.y.assign(n, 0.0);
            sol.K.assign(n, 1.0);
            sol.converged = true;
            return sol;
        }

        scalar bV, bA, bB;
        sVector y, xA, xB;
        unpackVLLE(bestV, bV, bA, bB, y, xA, xB);

        // If one of the three phases is vanishingly small, demote to
        // 2-phase (V+L or LL).  Threshold: 1 %.
        const scalar PHASE_EPS = 1.0e-2;
        if (bV < PHASE_EPS)
        {
            // 2-phase LL --- emit as the LL branch normally would.
            const scalar denom = 1.0 - bV;
            sol.regime     = "two-phase liquid (LL, VLLE attempt found V β ≈ 0)";
            sol.V_over_F   = bB / denom;
            sol.x          = xA;
            sol.y          = xB;
            sol.K          = thermo.Kvec_phases(pAlpha, pBeta, in.T, in.P, xA, xB);
            sol.iterations = totalEvals;
            sol.residual   = bestG;
            sol.converged  = bestConv;
            return sol;
        }
        if (bA < PHASE_EPS || bB < PHASE_EPS)
        {
            // 2-phase V+L --- pick the larger liquid as the unique L.
            const auto& xL = (bA >= bB) ? xA : xB;
            sol.regime     = "two-phase (VL, VLLE attempt found one L β ≈ 0)";
            sol.V_over_F   = bV;
            sol.x          = xL;
            sol.y          = y;
            sol.K          = thermo.Kvec(in.T, in.P, xL, y);
            sol.iterations = totalEvals;
            sol.residual   = bestG;
            sol.converged  = bestConv;
            return sol;
        }

        // Genuine 3-phase
        sol.threePhase = true;
        sol.regime     = "three-phase (V + Lα + Lβ via Gibbs minimisation)";
        sol.betaVapor  = bV;
        sol.V_over_F   = bA;                  // β_α (alpha liquid fraction)
        sol.xVapor     = y;
        sol.x          = xA;
        sol.y          = xB;
        sol.K          = thermo.Kvec_phases(pAlpha, pBeta, in.T, in.P, xA, xB);
        sol.iterations = totalEvals;
        sol.residual   = bestG;
        sol.converged  = bestConv;
        return sol;
    }

    auto computeK = [&](const sVector& xA, const sVector& xB) -> sVector
    {
        if (opts.phaseSet == PhaseSet::VL)
            return thermo.Kvec(in.T, in.P, xA, xB);
        return thermo.Kvec_phases(phaseAlpha, phaseBeta,
                                  in.T, in.P, xA, xB);
    };

    // Short-circuit on phaseSet first — thermo.eos() may be null for LL.
    const bool isIdeal =
        (opts.phaseSet == PhaseSet::VL)
        && (thermo.activity().modelName() == "ideal")
        && (thermo.eos     ().modelName() == "idealGas");
    const bool useWegstein =
        (opts.accelerator == OuterAccelerator::Wegstein) && !isIdeal;

    solver::Wegstein accel(n, opts.wegsteinQmin, opts.wegsteinQmax);

    bool   phaseTrivial = false;
    int    outerIt      = 0;
    scalar compDelta    = 0.0;

    // The outer-loop table header prints LAZILY, right before its first row:
    // the K-value block, the phase test and the outer-0 Rachford-Rice table
    // all print between here and that row, so an up-front header would sit
    // orphaned from the rows it labels.
    bool outerHeaderPrinted = false;

    for (outerIt = 0; outerIt < opts.maxOuterIter; ++outerIt)
    {
        sol.K = computeK(x, y);

        // TRIVIAL-K SEED (phi-phi near-critical; Stryjek points exposed it).
        // At the UNSPLIT first iteration (x = y = z) a single-root cubic gives
        // K_i = phi_L/phi_V = 1 identically, the Rachford-Rice gate reads
        // g(0) = g(1) = 0 and declares a fake single phase inside a measured
        // two-phase region.  A trivial K is USELESS in any world, so seed the
        // FIRST iteration with the Wilson (1968) estimate
        //     K_i = (Pc_i/P) exp[5.373 (1+omega_i)(1 - Tc_i/T)]
        // to break the symmetry -- the next iteration re-evaluates the REAL
        // K(x,y) on the split.  gamma-phi/Henry K's are never all-1 (Psat/P,
        // H/P), so this fires ONLY on the phi-phi single-root pathology.
        // (The seed lives HERE, in the flash's initialisation -- an earlier
        // attempt inside Kvec corrupted the Gibbs phase comparison.)
        if (outerIt == 0)
        {
            bool trivial = true;
            for (std::size_t i = 0; i < n; ++i)
                if (std::abs(sol.K[i] - 1.0) > 1.0e-9) { trivial = false; break; }
            if (trivial)
            {
                for (std::size_t i = 0; i < n; ++i)
                {
                    const auto& c = thermo.comp(i);
                    if (c.Tc() > 0.0 && c.Pc() > 0.0)
                        sol.K[i] = (c.Pc() * 1.0e5 / in.P)
                                 * std::exp(5.373 * (1.0 + c.omega())
                                            * (1.0 - c.Tc() / in.T));
                }
                if (opts.verbosity >= 2)
                    std::cout << "  trivial K at the unsplit feed "
                                 "(single-root cubic) -- seeding iteration 0 "
                                 "with the Wilson correlation.\n";
            }
        }

        // ---- Phase test on current K's --------------------------------
        scalar g_at_0 = 0.0, g_at_1 = 0.0;
        for (std::size_t i = 0; i < n; ++i)
        {
            g_at_0 += in.z[i] * (sol.K[i] - 1.0);
            g_at_1 += in.z[i] * (sol.K[i] - 1.0) / sol.K[i];
        }

        if (outerIt == 0 && opts.verbosity >= 3)
        {
            // The header prints in the framing the K-value ACTUALLY uses.
            // phi-phi world: K = phi_L/phi_V from the same cubic -- gamma and
            // Psat play NO part, so neither is shown.  gamma-phi world: the
            // classic gamma*Psat/(phi*P) header, except a declared Henry
            // solute whose K comes from H(T), not Psat -- name its pair file.
            const bool phiPhi = (opts.phaseSet == PhaseSet::VL)
                             && (thermo.vleWorld() == "phiPhi");
            if (phiPhi)
            {
                std::cout << "K-values  (K = φ_L/φ_V, "
                          << thermo.eos().modelName()
                          << " both phases,  evaluated at x = y = z initially):\n";
                for (std::size_t i = 0; i < n; ++i)
                    std::cout << "  " << std::left << std::setw(12)
                              << thermo.comp(i).name()
                              << "    K = " << sol.K[i] << "\n";
            }
            else
            {
            const std::string gammaModel = thermo.activity().modelName();
            const std::string phiModel   = (opts.phaseSet == PhaseSet::VL)
                ? thermo.eos().modelName() : std::string("LL-mode");
            std::cout << "K-values  (γ = " << gammaModel
                      << ",  φ = " << phiModel
                      << ",  evaluated at x = z initially):\n";
            for (std::size_t i = 0; i < n; ++i)
            {
                std::cout << "  " << std::left << std::setw(12)
                          << thermo.comp(i).name();
                if (thermo.isHenrySolute(i))
                {
                    std::cout << "  K from Henry pair parameters/Henry/"
                              << thermo.comp(i).name() << "-"
                              << thermo.solventName() << ".dat";
                }
                else if (thermo.comp(i).hasVaporPressure())
                {
                    scalar Psat = thermo.comp(i).vp().Psat_Pa(in.T);
                    std::cout << "  Psat = " << std::fixed << std::setprecision(4)
                              << (Psat * 1.0e-5) << " bar";
                }
                else
                {
                    std::cout << "  Psat = (nonvolatile)         ";
                }
                std::cout << "    K = " << sol.K[i] << "\n";
            }
            }
            std::cout << "\nPhase test:\n"
                      << "  g(V=0) = " << std::scientific
                      << std::setprecision(4) << g_at_0
                      << "    g(V=1) = " << g_at_1 << "\n\n";
        }

        if (g_at_0 <= 0.0)
        {
            sol.regime    = "subcooled liquid";
            sol.V_over_F  = 0.0;
            sol.x         = in.z;
            sol.y.assign(n, 0.0);
            sol.converged = true;
            phaseTrivial  = true;
            break;
        }
        if (g_at_1 >= 0.0)
        {
            sol.regime    = "superheated vapor";
            sol.V_over_F  = 1.0;
            sol.y         = in.z;
            sol.x.assign(n, 0.0);
            sol.converged = true;
            phaseTrivial  = true;
            break;
        }

        sol.regime = "two-phase";

        // ---- Inner Newton-Raphson on Rachford-Rice --------------------
        solver::NROptions nro;
        nro.tolerance = opts.tolerance;
        nro.maxIter   = opts.maxIter;
        nro.lower     = 0.0;
        nro.upper     = 1.0;
        nro.bracket   = true;

        const bool showInner = (opts.verbosity >= 4)
                            || (opts.verbosity >= 3 && outerIt == 0);
        if (showInner)
        {
            std::cout << "  [outer " << outerIt
                      << "] Rachford-Rice Newton (inner):\n"
                      << "    it          V           g(V)         dg/dV"
                      << "         ΔV\n"
                      << "    ----  -----------  -------------  -------------"
                      << "  -------------\n";
            nro.onIter = [&](const solver::NRTrace& tr)
            {
                std::cout << "    " << std::setw(4) << tr.iteration
                          << "  " << std::fixed << std::setprecision(8)
                          << std::setw(11) << tr.x
                          << "  " << std::scientific << std::setprecision(5)
                          << std::setw(13) << tr.f
                          << "  " << std::setw(13) << tr.dfdx
                          << "  " << std::setw(13) << tr.dx << "\n";
            };
        }
        auto fres = [&](scalar V) { return RR    (in.z, sol.K, V); };
        auto dres = [&](scalar V) { return dRR_dV(in.z, sol.K, V); };

        scalar V0 = (outerIt == 0) ? 0.5 : sol.V_over_F;
        auto r = solver::newton1D(fres, dres, V0, nro);

        sol.V_over_F   = r.x;
        sol.iterations += r.iterations;   // CUMULATIVE across outer passes (pass-4: 14-vs-1 confusion)
        sol.residual   = r.residual;
        sol.converged  = r.converged;

        // ---- g(x) = direct-substitution image of current x -------------
        sVector x_subst(n), y_new(n);
        for (std::size_t i = 0; i < n; ++i)
        {
            x_subst[i] = in.z[i] / (1.0 + sol.V_over_F * (sol.K[i] - 1.0));
            y_new[i]   = sol.K[i] * x_subst[i];
        }

        // ---- Wegstein acceleration on x ------------------------------
        sVector x_next = useWegstein
            ? accel.step(x, x_subst)
          : x_subst;

        // Normalise (Wegstein may push slightly off the simplex)
        scalar s = 0.0;
        for (auto v : x_next) s += v;
        if (s > 0.0)
            for (auto& v : x_next) v /= s;

        // |Δx|_2 between iterates (convergence metric)
        scalar dsum = 0.0;
        for (std::size_t i = 0; i < n; ++i)
        {
            scalar d = x_next[i] - x[i];
            dsum += d*d;
        }
        compDelta = std::sqrt(dsum);
        if (opts.residualSink) opts.residualSink(compDelta);

        if (opts.verbosity >= 3 && !isIdeal)
        {
            if (!outerHeaderPrinted)
            {
                std::cout << "Composition outer loop  ["
                          << (useWegstein ? "Wegstein-accelerated"
                                          : "direct substitution")
                          << "]:\n"
                          << "   it     |Δx|2         γ_1         γ_2";
                for (std::size_t i = 2; i < n; ++i)
                    std::cout << "         γ_" << (i+1);
                std::cout << (useWegstein ? "         q_1        q_2" : "")
                          << "\n"
                          << "  ----  -----------  ----------  ----------"
                          << (useWegstein ? "  ----------  ---------" : "")
                          << "\n";
                outerHeaderPrinted = true;
            }
            auto gam = thermo.activity().gamma(in.T, x_next);
            std::cout << "  " << std::setw(4) << outerIt
                      << "  " << std::scientific << std::setprecision(3)
                      << std::setw(11) << compDelta;
            std::cout << std::fixed << std::setprecision(5);
            for (std::size_t i = 0; i < n; ++i)
                std::cout << "  " << std::setw(10) << gam[i];
            if (useWegstein && accel.callCount() >= 2)
            {
                std::cout << std::fixed << std::setprecision(3);
                for (std::size_t i = 0; i < std::min<std::size_t>(n, 2); ++i)
                    std::cout << "  " << std::setw(10) << accel.lastQ()[i];
            }
            std::cout << "\n";
        }

        x = x_next; y = y_new;
        sol.x = x;
        sol.y = y;

        if (compDelta < opts.compositionTol) break;
    }

    if (!phaseTrivial && opts.verbosity >= 3)
        std::cout << "\nComposition outer loop (gamma/K refresh) converged after " << (outerIt + 1)
                  << " composition iteration"
                  << ((outerIt + 1 == 1) ? "" : "s")
                  << "  (|Δx|2 = " << std::scientific << std::setprecision(3)
                  << compDelta << ").\n";

    return sol;
}

int IsothermalFlash::solve(const DictPtr& dict,
                           const ThermoPackage& thermo,
                           int verbosity)
{
    auto feedDict = dict->subDict("feed");
    auto operDict = dict->subDict("operation");
    auto compDict = dict->subDict("composition");

    FlashInput in;
    in.F = feedDict->lookupScalar("F", Dims::molarFlow);
    // T and P fall back to the feed stream values if the user did
    // not set them explicitly under `operation` — natural propagation
    // in a flowsheet, override possible per unit.
    in.T = operDict->found("T")
             ? operDict->lookupScalar("T", Dims::temperature)
           : feedDict->lookupScalar("T", Dims::temperature);
    in.P = operDict->found("P")
             ? operDict->lookupScalar("P", Dims::pressure)
           : feedDict->lookupScalar("P", Dims::pressure);

    in.z.assign(thermo.n(), 0.0);
    scalar zsum = 0.0;
    for (const auto& key : compDict->keys())
    {
        std::size_t i = thermo.indexOf(key);
        in.z[i] = compDict->lookupScalar(key);
        zsum   += in.z[i];
    }
    if (std::abs(zsum - 1.0) > 1.0e-6)
    {
        std::cerr << "Warning: feed composition sums to " << zsum
                  << "; normalising.\n";
        for (auto& v : in.z) v /= zsum;
    }

    FlashOptions opts;
    opts.verbosity = verbosity;

    if (dict->found("outerAccelerator"))
    {
        std::string acc = dict->lookupWord("outerAccelerator");
        if      (acc == "wegstein"            ) opts.accelerator = OuterAccelerator::Wegstein;
        else if (acc == "directSubstitution"  ) opts.accelerator = OuterAccelerator::DirectSubstitution;
        else throw std::runtime_error("Unknown outerAccelerator: '" + acc + "'");
    }
    if (dict->found("compositionTol"))
        opts.compositionTol = dict->lookupScalar("compositionTol");
    if (dict->found("maxOuterIter"))
        opts.maxOuterIter   = static_cast<int>(dict->lookupScalar("maxOuterIter"));

    if (operDict->found("phaseSet"))
    {
        const std::string ps = operDict->lookupWord("phaseSet");
        if      (ps == "VL"  ) opts.phaseSet = PhaseSet::VL;
        else if (ps == "LL"  ) opts.phaseSet = PhaseSet::LL;
        else if (ps == "VLLE") opts.phaseSet = PhaseSet::VLLE;
        else throw std::runtime_error("Unknown phaseSet '" + ps
            + "' (expected 'VL', 'LL' or 'VLLE')");
    }
    if (operDict->found("alphaRich"))
        opts.llAlphaRichComp = thermo.indexOf(operDict->lookupWord("alphaRich"));
    if (operDict->found("betaRich"))
        opts.llBetaRichComp  = thermo.indexOf(operDict->lookupWord("betaRich"));

    // Pipe per-iteration composition residuals into UnitOperation's
    // recordResidual so the GUI's convergence plot can see them.
    opts.residualSink = [this](scalar r) { recordResidual(r); };

    if (opts.verbosity >= 3)
    {
        std::cout << "Feed: F = " << (in.F * 3600.0) << " kmol/h\n"
                  << "Operation: T = " << in.T << " K, P = "
                  << (in.P * 1.0e-5) << " bar\n"
                  << "Feed composition (z):\n";
        for (std::size_t i = 0; i < thermo.n(); ++i)
            std::cout << "  " << thermo.comp(i).name() << "  = " << in.z[i] << "\n";
        std::cout << "\n";
    }

    auto sol = solveCore(in, thermo, opts);
    if (opts.verbosity >= 2) printFlashResult(sol, thermo, in);

    // ---- Duty Q (the heat exchanged) -----------------------------------
    //   Q = F · (H_out - H_in).  H_in is the FEED at its inlet conditions
    //   (T_feed, P_feed, vf_feed); H_out is the equilibrium mixture at the
    //   operating (T, P).  For an isothermal flash with the feed already at
    //   T this is just the latent heat of the vaporised fraction; when the
    //   operation moves T (e.g. a condenser at T < T_feed) it is the full
    //   sensible + latent duty.  Sign: + = heating, - = cooling.  This makes
    //   the heat VISIBLE (a result), so the utility-allocation pass can size
    //   the steam / cooling-water it implies.  Q = 0 (adiabatic) emerges
    //   naturally when the operation does not move the stream's state.
    scalar Q_W = 0.0;
    bool   Q_valid = false;
    try
    {
        const scalar T_feed  = feedDict->lookupScalar("T", Dims::temperature);
        const scalar P_feed  = feedDict->lookupScalarOrDefault("P", in.P, Dims::pressure);
        const scalar vf_feed = feedDict->lookupScalarOrDefault("vf", 0.0);

        // A genuinely two-phase feed (0 < vf < 1) carries the enthalpy of its
        // SPLIT equilibrium phases, not H_stream's blend-by-z (which omits the
        // latent heat of separation).  Flash the feed at its OWN (T_feed,P_feed)
        // to recover x/y, mirroring H_out below; without it a feed already at the
        // drum's conditions reads a phantom duty (the flash01 bug).  A
        // single-phase feed (vf <= 0 or >= 1, incl. a deliberate state override)
        // keeps the cheap pure-phase enthalpy.
        bool feedSplit = (vf_feed > 1.0e-9 && vf_feed < 1.0 - 1.0e-9)
                      && !thermo.phasesOfType("vapor").empty();
        FlashSolution feedSol;
        if (feedSplit)
        {
            FlashInput fin; fin.F = 1.0; fin.T = T_feed; fin.P = P_feed; fin.z = in.z;
            FlashOptions fopts; fopts.verbosity = 0; fopts.phaseSet = opts.phaseSet;
            feedSol = solveCore(fin, thermo, fopts);
            feedSplit = feedSol.converged
                     && feedSol.V_over_F > 1.0e-9
                     && feedSol.V_over_F < 1.0 - 1.0e-9;
        }

        // For an LL flash BOTH product phases are LIQUIDS: the `sol.y` slot
        // carries the second liquid (β-phase), NOT a vapour.  Its vapour
        // fraction is therefore 0, not 1 --- blending it as a vapour would add a
        // phantom latent heat to the β fraction (a large spurious duty for an
        // otherwise isothermal, equal-T liquid split).
        const scalar betaVf = (opts.phaseSet == PhaseSet::LL) ? 0.0 : 1.0;

        bool useForm = true;
        for (std::size_t i = 0; i < thermo.n(); ++i)
            if (!thermo.comp(i).hasGibbsData()) { useForm = false; break; }
        scalar H_in, H_out;
        if (useForm)
        {
            // ONE enthalpy surface everywhere: the duty is computed on the
            // SAME canonical elements-datum form (h_ig − ΔHvap_latent(T)) that
            // the energy-balance report reads (H_stream_formation), NOT the
            // Watson-at-298 + ∫cpLiq variant H_stream.  The two differ by the
            // liquid latent model, which surfaced as a phantom ~24 % gap
            // between this flash's reported Q and its own stream dH.  The
            // SPLIT (V_over_F) is unchanged -- an isothermal flash sets it from
            // the VLE, not from Q -- so this moves only the reported DUTY
            // (an energy KPI), never the material flows.  We still weight by the
            // equilibrium PHASE compositions (x α-phase, y β-phase) so a feed
            // already at the drum's conditions reads Q = 0, not a phantom latent.
            const scalar bV = sol.V_over_F;
            if (feedSplit)
            {
                const scalar bF = feedSol.V_over_F;
                H_in = (1.0 - bF) * thermo.H_stream_formation(T_feed, P_feed, 0.0, feedSol.x)
                     +        bF  * thermo.H_stream_formation(T_feed, P_feed, betaVf, feedSol.y);
            }
            else
                H_in = thermo.H_stream_formation(T_feed, P_feed, vf_feed, in.z);
            H_out = (1.0 - bV) * thermo.H_stream_formation(in.T, in.P, 0.0, sol.x)
                  +        bV  * thermo.H_stream_formation(in.T, in.P, betaVf, sol.y);
        }
        else if (opts.phaseSet == PhaseSet::LL)
        {
            // Both phases liquid: blend two liquid enthalpies (no latent heat).
            H_out = (1.0 - sol.V_over_F) * thermo.Hliquid(in.T, sol.x, T_feed)
                  +        sol.V_over_F  * thermo.Hliquid(in.T, sol.y, T_feed);
            H_in  = thermo.Hliquid(T_feed, in.z, T_feed);   // sensible datum @ T_feed
        }
        else
        {
            H_out = thermo.Hmixture(in.T, sol.V_over_F, sol.x, sol.y, T_feed);
            if (feedSplit)
                H_in = thermo.Hmixture(T_feed, feedSol.V_over_F,
                                       feedSol.x, feedSol.y, T_feed);
            else
                H_in = thermo.Hliquid(T_feed, in.z, T_feed);   // sensible datum @ T_feed
        }
        Q_W = in.F * 1000.0 * (H_out - H_in);                // kmol/s -> mol/s; J/mol -> W
        Q_valid = std::isfinite(Q_W);
    }
    catch (const std::exception&) { Q_valid = false; }

    // ---- Produced streams ----------------------------------------------
    //   VL:    (liquid, vapor)                  — vf = 0, vf = 1
    //   LL:    (liquid_alpha, liquid_beta)      — both vf = 0
    //   VLLE:  (vapor, liquid_alpha, liquid_beta)
    //          when sol.threePhase == true; otherwise demoted to one
    //          of the two-phase forms above by the solver.
    produced_.clear();
    if (opts.phaseSet == PhaseSet::VLLE)
    {
        // VLLE always emits THREE streams (vapor, liquid_alpha,
        // liquid_beta) so that the flowsheet's output names list can
        // remain fixed even when the optimum collapses to a 2-phase
        // configuration --- the absent phase appears with F = 0.
        scalar bV, bA, bB;
        sVector yV, xA, xB;
        if (sol.threePhase)
        {
            bV = sol.betaVapor;
            bA = sol.V_over_F;
            bB = 1.0 - bV - bA;
            yV = sol.xVapor;
            xA = sol.x;
            xB = sol.y;
        }
        else
        {
            // 2-phase fallback from the VLLE branch.  Identify which
            // pair survived from sol.regime and populate the empty one.
            const bool vlFallback =
                sol.regime.find("VL") != std::string::npos;
            if (vlFallback)
            {
                // V+L: sol.x is the liquid, sol.y is the vapor
                bV = sol.V_over_F;
                bA = 1.0 - bV;
                bB = 0.0;
                yV = sol.y;
                xA = sol.x;
                xB.assign(thermo.n(), 0.0);
            }
            else
            {
                // LL: sol.x = α, sol.y = β, sol.V_over_F = β fraction
                bV = 0.0;
                bA = 1.0 - sol.V_over_F;
                bB = sol.V_over_F;
                yV.assign(thermo.n(), 0.0);
                xA = sol.x;
                xB = sol.y;
            }
        }

        ProcessStream vap;
        vap.name = "vapor";
        vap.F    = in.F * bV;
        vap.T    = in.T;
        vap.P    = in.P;
        vap.z    = yV;
        vap.vf   = 1.0;
        produced_.push_back(vap);

        ProcessStream alpha;
        alpha.name = "liquid_alpha";
        alpha.F    = in.F * bA;
        alpha.T    = in.T;
        alpha.P    = in.P;
        alpha.z    = xA;
        alpha.vf   = 0.0;
        produced_.push_back(alpha);

        ProcessStream beta;
        beta.name  = "liquid_beta";
        beta.F     = in.F * bB;
        beta.T     = in.T;
        beta.P     = in.P;
        beta.z     = xB;
        beta.vf    = 0.0;
        produced_.push_back(beta);
    }
    else
    {
        const bool isLL = (opts.phaseSet == PhaseSet::LL);

        ProcessStream alpha;
        alpha.name = isLL ? "liquid_alpha" : "liquid";
        alpha.F    = in.F * (1.0 - sol.V_over_F);
        alpha.T    = in.T;
        alpha.P    = in.P;
        alpha.z    = sol.x;
        alpha.vf   = 0.0;
        produced_.push_back(alpha);

        ProcessStream beta;
        beta.name  = isLL ? "liquid_beta" : "vapor";
        beta.F     = in.F * sol.V_over_F;
        beta.T     = in.T;
        beta.P     = in.P;
        beta.z     = sol.y;
        beta.vf    = isLL ? 0.0 : 1.0;
        produced_.push_back(beta);
    }

    // ---- KPIs ----------------------------------------------------------
    kpis_.clear();
    const bool isLL = (opts.phaseSet == PhaseSet::LL);
    kpis_["T"]         = in.T;
    kpis_["P"]         = in.P;
    kpis_["F_in"]      = in.F;
    // LL vocabulary (Codex tutorial-audit P0.2): the second LIQUID is not a
    // vapour -- V_over_F is reserved for a real vapour fraction; an LL split
    // publishes betaFraction (= L_beta/F).  Same number, honest name.
    if (isLL) kpis_["betaFraction"] = sol.V_over_F;
    else      kpis_["V_over_F"]     = sol.V_over_F;
    if (Q_valid && !isLL)                 // duty: + heating, - cooling [W]
    {
        // LL: two Hliquid calls WITHOUT an excess-enthalpy route coherent
        // with the activity model make Q=0 a non-conclusion -- the duty is
        // UNAVAILABLE for an LL split until that route exists (announced),
        // never a fake zero.
        kpis_["Q"]    = Q_W;
        kpis_["Q_kW"] = Q_W / 1000.0;
    }
    else if (isLL && opts.verbosity >= 2)
        std::cout << "  [duty] LL split: duty UNAVAILABLE -- the liquid"
                     " enthalpy carries no excess-of-mixing term coherent"
                     " with the activity model, so a numeric Q would be a"
                     " non-conclusion (not published).\n";
    kpis_["F_alpha"]   = in.F * (1.0 - sol.V_over_F);
    kpis_["F_beta"]    = in.F * sol.V_over_F;
    if (sol.threePhase)
    {
        kpis_["beta_vapor"] = sol.betaVapor;
        kpis_["F_vapor"]    = in.F * sol.betaVapor;
    }
    kpis_["phaseSet"]  =
          (opts.phaseSet == PhaseSet::VLLE) ? 2.0
      : (opts.phaseSet == PhaseSet::LL  ) ? 1.0
                                          : 0.0;  // 0 VL / 1 LL / 2 VLLE

    return sol.converged ? 0 : 1;
}

void printFlashResult(const FlashSolution& sol,
                      const ThermoPackage& thermo,
                      const FlashInput&    in)
{
    std::cout << "\n=========================  Flash Result  ==========================\n";
    std::cout << "  Regime:        " << sol.regime  << "\n";
    std::cout << "  Converged:     " << (sol.converged ? "yes" : "NO")  << "\n";
    std::cout << "  Iterations:    " << sol.iterations
              << "   (CUMULATIVE Rachford-Rice Newton steps across ALL composition-outer passes; only the [outer 0] table prints at verbosity 3)\n";
    std::cout << "  Final |g(V)|:  " << std::scientific << std::setprecision(3)
              << sol.residual << "\n";
    // LL split: the beta phase is a LIQUID -- never print it as "Vapor"
    // (Codex P0.2: V/F is reserved for a real vapour fraction).
    const bool llSplit = sol.regime.find("liquid (LL") != std::string::npos
                      || sol.regime.find("two-phase liquid") != std::string::npos;
    if (llSplit)
    {
        std::cout << "  beta (Lb/F):   " << std::fixed << std::setprecision(6)
                  << sol.V_over_F << "\n";
        std::cout << "  alpha (La/F):  " << (1.0 - sol.V_over_F) << "\n";
        std::cout << "  L_beta flow:   " << (in.F * sol.V_over_F * 3600.0)
                  << " kmol/h\n";
        std::cout << "  L_alpha flow:  " << (in.F * (1.0 - sol.V_over_F) * 3600.0)
                  << " kmol/h\n";
    }
    else
    {
        std::cout << "  V/F:           " << std::fixed << std::setprecision(6)
                  << sol.V_over_F << "\n";
        std::cout << "  L/F:           " << (1.0 - sol.V_over_F) << "\n";
        std::cout << "  Vapor flow V:  " << (in.F * sol.V_over_F * 3600.0) << " kmol/h\n";
        std::cout << "  Liquid flow L: " << (in.F * (1.0 - sol.V_over_F) * 3600.0)
                  << " kmol/h\n";
    }

    std::cout << "\n  Component         z          x          y          K\n";
    std::cout <<   "  -----------------------------------------------------------\n";
    for (std::size_t i = 0; i < in.z.size(); ++i)
    {
        std::cout << "  " << std::left << std::setw(14)
                  << thermo.comp(i).name()
                  << std::right << std::fixed
                  << "  " << std::setprecision(6) << std::setw(8) << in.z[i]
                  << "  " << std::setprecision(6) << std::setw(8) << sol.x[i]
                  << "  " << std::setprecision(6) << std::setw(8) << sol.y[i]
                  << "  " << std::setprecision(4) << std::setw(8) << sol.K[i]
                  << "\n";
    }
    std::cout << "====================================================================\n\n";
}

} // namespace Choupo
