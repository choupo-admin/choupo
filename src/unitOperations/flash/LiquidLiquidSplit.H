/*---------------------------------------------------------------------------*\
       \|/       C hemicals     | Open-source, glass-box chemical process simulator
      \\|//      H eat-transfer | https://choupo.org
     \\\|///     O perations    |
      \\|//      U nits         | Copyright (C) 2026 Vítor Geraldes
       \|/       P roperties    | Licence: GPL-3.0-or-later
        |        O ptimization  |
       /|\                      |
-------------------------------------------------------------------------------
    SPDX-License-Identifier: GPL-3.0-or-later
    Credit and attribution: see AUTHORS
    Required legal notices:  see NOTICE
-------------------------------------------------------------------------------
Namespace
    Choupo::llSplit

Description
    THE LIQUID-LIQUID SPLIT, SOLVED -- what the LL flash does AFTER its
    Gibbs minimisation has decided which basin the answer is in (DEV.md 4c
    C123, finding 3).  "Gibbs decides, the Newton solves": the posture the
    reactive second liquid took on 2026-07-27, now on the molecular path.

    The Nelder-Mead minimisation (`IsothermalFlash.cpp`, the LL branch)
    stops at tolX 1e-5 on compositions -- a basin, not an answer.  An
    equilibrium is the state where every component's ACTIVITY is equal in
    the two liquids:

        f_i  = ln(x_alpha_i gamma_alpha_i) - ln(x_beta_i gamma_beta_i) = 0
        f_n  = sum_i x_alpha_i - 1                                   = 0

    with x_beta from the mass balance, x_beta = (z - (1 - beta) x_alpha) /
    beta.  Unknowns: x_alpha (one per PRESENT component) and beta.  Newton
    with a forward-difference Jacobian and a step that is halved until the
    two liquids stay positive, beta stays inside (0, 1) and the residual
    falls.  Accepted only when it CONVERGES (max |f| below `tol`), the two
    liquids stay DISTINCT (the trivial solution x_alpha = x_beta = z
    satisfies the same equations, so a Newton that walks onto it has found
    nothing), and the Gibbs energy does not RISE above the minimisation's
    -- otherwise the caller keeps the minimisation's answer and says so.

    The second function is the LABEL rule.  The two liquids of a split
    are an unordered pair; which one leaves on the alpha port is a
    convention, and it is the author's: `alphaRich <c>;` (and `betaRich`)
    name the component each port is rich in.  It is applied to the ANSWER,
    so the answer itself never depends on the hint -- before this file the
    hints biased three of the four minimisation starts, and a feed that
    split with one hint order returned ONE liquid with the other.

    Header-only, like IncipientPhase.H: two small functions, one reader.
\*---------------------------------------------------------------------------*/

#pragma once

#include "core/Types.H"
#include "solver/NewtonND.H"
#include "thermo/phase/Phase.H"

#include <algorithm>
#include <cmath>
#include <string>
#include <vector>

namespace Choupo::llSplit {

struct Polished
{
    bool        accepted   = false;
    int         iterations = 0;
    scalar      residual0  = 0.0;     // max |f| where the minimisation stopped
    scalar      residual   = 0.0;     // max |f| at the last iterate
    scalar      beta       = 0.0;
    sVector     xA, xB;
    std::string reason;               // why it was NOT accepted (empty if it was)
};

//  The Gibbs energy of mixing per mole of feed, /RT -- the same function the
//  minimisation descends (IsothermalFlash.cpp), restated over the present
//  components so the polish can be held to it.
inline scalar gibbsOfSplit(const Phase& pA, const Phase& pB, scalar T,
                           const std::vector<std::size_t>& act, scalar beta,
                           const sVector& xA, const sVector& xB)
{
    const auto gA = pA.activityCoefficients(T, xA);
    const auto gB = pB.activityCoefficients(T, xB);
    scalar G = 0.0;
    for (std::size_t i : act)
        G += (1.0 - beta) * xA[i]
                 * (std::log(xA[i]) + std::log(std::max<scalar>(gA[i], 1.0e-30)))
           +        beta  * xB[i]
                 * (std::log(xB[i]) + std::log(std::max<scalar>(gB[i], 1.0e-30)));
    return G;
}

inline Polished polishEqualActivity(const Phase& pA, const Phase& pB, scalar T,
                                    const sVector& z,
                                    const std::vector<std::size_t>& act,
                                    scalar beta0,
                                    const sVector& xA0, const sVector& xB0,
                                    scalar gMinimised,
                                    scalar tol = 1.0e-12, int maxIter = 60)
{
    const std::size_t n  = z.size();
    const std::size_t nA = act.size();
    const std::size_t m  = nA + 1;            // x_alpha[act...], beta

    Polished out;
    out.beta = beta0; out.xA = xA0; out.xB = xB0;

    //  u -> (x_alpha, x_beta, beta), or false when the state is not one.
    auto unpack = [&](const sVector& u, sVector& xA, sVector& xB,
                      scalar& beta) -> bool
    {
        beta = u[nA];
        if (!(beta > 0.0 && beta < 1.0)) return false;
        xA.assign(n, 0.0); xB.assign(n, 0.0);
        for (std::size_t a = 0; a < nA; ++a)
        {
            const std::size_t i = act[a];
            xA[i] = u[a];
            xB[i] = (z[i] - (1.0 - beta) * xA[i]) / beta;
            if (!(xA[i] > 0.0) || !(xB[i] > 0.0)) return false;
        }
        return true;
    };
    auto residual = [&](const sVector& u, sVector& f) -> bool
    {
        sVector xA, xB; scalar beta;
        if (!unpack(u, xA, xB, beta)) return false;
        const auto gA = pA.activityCoefficients(T, xA);
        const auto gB = pB.activityCoefficients(T, xB);
        f.assign(m, 0.0);
        scalar sA = 0.0;
        for (std::size_t a = 0; a < nA; ++a)
        {
            const std::size_t i = act[a];
            if (!(gA[i] > 0.0) || !(gB[i] > 0.0)) return false;
            f[a] = std::log(xA[i] * gA[i]) - std::log(xB[i] * gB[i]);
            sA  += xA[i];
        }
        f[nA] = sA - 1.0;
        for (auto v : f) if (!std::isfinite(v)) return false;
        return true;
    };
    auto norm = [](const sVector& f) {
        scalar r = 0.0;
        for (auto v : f) r = std::max(r, std::abs(v));
        return r;
    };

    sVector u(m, 0.0);
    for (std::size_t a = 0; a < nA; ++a) u[a] = xA0[act[a]];
    u[nA] = beta0;

    sVector f;
    if (!residual(u, f)) { out.reason = "the starting split is not a state"; return out; }
    scalar r = norm(f);
    out.residual0 = r;

    int it = 0;
    for (; it < maxIter && r > tol; ++it)
    {
        //  Forward-difference Jacobian, the step scaled on each unknown.
        std::vector<sVector> J(m, sVector(m, 0.0));
        bool jacOk = true;
        for (std::size_t k = 0; k < m && jacOk; ++k)
        {
            scalar h = 1.0e-7 * std::max<scalar>(std::abs(u[k]), 1.0e-6);
            sVector up = u, fp;
            up[k] += h;
            if (!residual(up, fp))
            {
                up[k] = u[k] - h; h = -h;
                if (!residual(up, fp)) { jacOk = false; break; }
            }
            for (std::size_t q = 0; q < m; ++q) J[q][k] = (fp[q] - f[q]) / h;
        }
        if (!jacOk) { out.reason = "no admissible finite-difference step"; break; }

        sVector rhs(m);
        for (std::size_t q = 0; q < m; ++q) rhs[q] = -f[q];
        sVector du;
        try { du = solver::gaussSolve(J, rhs); }
        catch (const std::exception&) { out.reason = "singular Jacobian"; break; }

        //  Halve the step until the state is admissible and the residual falls.
        scalar alpha = 1.0;
        bool   moved = false;
        for (int ls = 0; ls < 40; ++ls, alpha *= 0.5)
        {
            sVector ut(m), ft;
            for (std::size_t q = 0; q < m; ++q) ut[q] = u[q] + alpha * du[q];
            if (!residual(ut, ft)) continue;
            const scalar rt = norm(ft);
            if (rt < r) { u = ut; f = ft; r = rt; moved = true; break; }
        }
        if (!moved) { out.reason = "no step reduces the residual"; break; }
    }
    out.iterations = it;
    out.residual   = r;
    if (r > tol)
    {
        if (out.reason.empty()) out.reason = "did not converge";
        return out;
    }

    sVector xA, xB; scalar beta;
    unpack(u, xA, xB, beta);

    //  DISTINCT: the trivial root x_alpha = x_beta = z solves the same
    //  equations and is no split at all.
    scalar gap = 0.0;
    for (std::size_t i : act) gap = std::max(gap, std::abs(xA[i] - xB[i]));
    if (gap < 1.0e-6) { out.reason = "converged onto the trivial root x_alpha = x_beta"; return out; }

    //  NOT UPHILL: an equal-activity root that is not the minimum the
    //  Gibbs energy chose is a different stationary point.
    const scalar g = gibbsOfSplit(pA, pB, T, act, beta, xA, xB);
    if (g > gMinimised + 1.0e-9)
    {
        out.reason = "the root it reached lies above the minimised Gibbs energy";
        return out;
    }

    out.accepted = true;
    out.beta = beta; out.xA = xA; out.xB = xB;
    return out;
}

//  MICHELSEN'S ROUTE FROM THE STABILITY TEST, for the feed a bounded
//  minimisation cannot reach.  The Nelder-Mead box keeps every liquid-alpha
//  mole fraction above 1e-4 (IsothermalFlash.cpp, the LL branch), so a feed
//  carrying a component BELOW that -- a binary water/MIBK stage with 7e-5 of
//  acetone, measured on benchmark C's stage cascade -- has no admissible
//  split near its answer, and the minimisation finds nothing below the feed
//  that the stability test has proved is there.  The textbook route has no
//  box: the incipient phase w gives K_i = gamma_i(z) / gamma_i(w), Rachford-Rice gives
//  beta, successive substitution on K_i = gamma_alpha_i / gamma_beta_i
//  approaches the split, and the equal-activity Newton finishes it.  The
//  answer is held to the same tests as any other: converged, distinct, and
//  strictly below the feed's Gibbs energy `gFeed`.
//
//  Rachford-Rice + successive substitution + the Newton, from K-values
//  K_i = x_beta_i / x_alpha_i.  Shared by the route from the incipient
//  phase below and by a warm start from a previous answer.
inline Polished splitFromK(const Phase& pA, const Phase& pB, scalar T,
                           const sVector& z,
                           const std::vector<std::size_t>& act,
                           sVector K, scalar gFeed)
{
    const std::size_t n = z.size();
    Polished none;
    auto rr = [&](scalar beta) {
        scalar f = 0.0;
        for (std::size_t i : act) f += z[i] * (K[i] - 1.0) / (1.0 + beta * (K[i] - 1.0));
        return f;
    };
    scalar beta = 0.5;
    sVector xA(n, 0.0), xB(n, 0.0);
    for (int it = 0; it < 100; ++it)
    {
        //  Rachford-Rice by bisection on (0, 1): f decreases in beta.
        if (!(rr(1.0e-12) > 0.0 && rr(1.0 - 1.0e-12) < 0.0))
        { none.reason = "no Rachford-Rice root in (0, 1) from these K-values"; return none; }
        scalar lo = 1.0e-12, hi = 1.0 - 1.0e-12;
        for (int b = 0; b < 200 && hi - lo > 1.0e-15; ++b)
        {
            const scalar mid = 0.5 * (lo + hi);
            (rr(mid) > 0.0 ? lo : hi) = mid;
        }
        beta = 0.5 * (lo + hi);
        //  At the root both liquids sum to one and (1 - beta) x_alpha +
        //  beta x_beta = z holds term by term, by construction.
        for (std::size_t i : act)
        {
            xA[i] = z[i] / (1.0 + beta * (K[i] - 1.0));
            xB[i] = K[i] * xA[i];
        }
        const auto gA = pA.activityCoefficients(T, xA);
        const auto gB = pB.activityCoefficients(T, xB);
        scalar dK = 0.0;
        for (std::size_t i : act)
        {
            const scalar Kn = std::max<scalar>(gA[i], 1.0e-300) / std::max<scalar>(gB[i], 1.0e-300);
            dK = std::max(dK, std::abs(std::log(Kn / K[i])));
            K[i] = Kn;
        }
        if (dK < 1.0e-6) break;
    }
    Polished p = polishEqualActivity(pA, pB, T, z, act, beta, xA, xB, gFeed);
    if (p.accepted
        && !(gibbsOfSplit(pA, pB, T, act, p.beta, p.xA, p.xB) < gFeed - 1.0e-10))
    {
        p.accepted = false;
        p.reason   = "the split it reached is not below the feed's Gibbs energy";
    }
    return p;
}

inline Polished splitFromIncipientPhase(const Phase& pA, const Phase& pB,
                                        scalar T, const sVector& z,
                                        const std::vector<std::size_t>& act,
                                        const sVector& w, scalar gFeed)
{
    const std::size_t n = z.size();
    //  The feed as liquid alpha, the incipient phase as liquid beta:
    //  K_i = gamma_i(z) / gamma_i(w), which is Y_i / z_i at the stability
    //  test's stationary point (Y unnormalised) -- and Sum_i z_i K_i = Sum Y
    //  > 1 there exactly when tm < 0, so Rachford-Rice has its root above
    //  beta = 0.  (K = w / z, the normalised trial, puts the root AT zero.)
    sVector K(n, 1.0);
    sVector wn(n, 0.0);
    scalar sw = 0.0;
    for (std::size_t i : act) { wn[i] = std::max<scalar>(w[i], 1.0e-300); sw += wn[i]; }
    for (std::size_t i : act) wn[i] /= sw;
    const auto gZ = pA.activityCoefficients(T, z);
    const auto gW = pB.activityCoefficients(T, wn);
    for (std::size_t i : act)
        K[i] = std::max<scalar>(gZ[i], 1.0e-300) / std::max<scalar>(gW[i], 1.0e-300);
    return splitFromK(pA, pB, T, z, act, K, gFeed);
}

//  THE LABEL RULE.  Liquid alpha is the one richer in `iA` relative to `iB`
//  (the score x[iA] - x[iB] is antisymmetric, so naming the hints the other
//  way round names the SAME two liquids the other way round, and nothing
//  else).  Returns true when it swapped them.  `beta` is the beta-liquid
//  fraction of the feed and follows its liquid.
inline bool labelByHints(std::size_t iA, std::size_t iB,
                         scalar& beta, sVector& xA, sVector& xB)
{
    const std::size_t n = xA.size();
    auto score = [&](const sVector& x) {
        return (iA < n ? x[iA] : 0.0) - (iB < n ? x[iB] : 0.0);
    };
    if (score(xB) > score(xA))
    {
        std::swap(xA, xB);
        beta = 1.0 - beta;
        return true;
    }
    return false;
}

} // namespace Choupo::llSplit
