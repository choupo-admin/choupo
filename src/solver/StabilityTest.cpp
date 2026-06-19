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

#include "StabilityTest.H"

#include <algorithm>
#include <cmath>
#include <limits>

namespace Choupo::solver {

namespace {

// One probe of the Michelsen iteration with a single starting bias.
struct ProbeOutcome
{
    sVector  Y;            // final mole-vector (not normalised)
    sVector  y;            // final composition  y = Y / ΣY
    scalar   tm;           // tangent-plane-distance value at convergence
    int      iters;
    bool     ok;
};

// Helper: evaluate tm at a given Y (raw mole-number vector).
scalar evalTm(const sVector& Y, const sVector& h)
{
    scalar tm = 1.0;
    for (std::size_t i = 0; i < Y.size(); ++i)
    {
        const scalar Yi = std::max(Y[i], 1.0e-30);
        tm += Yi * (std::log(Yi) - 1.0) - Yi * h[i];
    }
    return tm;
}

ProbeOutcome runProbe(const Phase&    phase,
    scalar          T,
    const sVector&  h,            // h_i = ln(z_i γ_i(z))
    sVector         Y0,           // initial Y (will be normalised)
    int             maxIter,
    scalar          ssTol)
{
    const std::size_t n = Y0.size();
    sVector Y = Y0;

    // -----------------------------------------------------------------
    //  Symmetric LLE (e.g. water/nButanol with the same NRTL on both
    //  phases) has the feed composition Y = z as a *spurious* trivial
    //  fixed point of the SS iteration: the gradient of TPD vanishes
    //  there and the iteration drifts back to it even from a strongly
    //  biased start.  But the trajectory traverses the non-trivial
    //  minimum on the way; if we record the lowest tm visited along
    //  the path (rather than only the endpoint) we capture the real
    //  incipient-phase composition.  This is a cheap alternative to
    //  the full Michelsen 2nd-order Newton on TPD, sufficient for the
    //  binary and ternary LLE cases the simulator currently targets.
    // -----------------------------------------------------------------
    sVector bestY   = Y0;
    scalar  bestTm  = evalTm(Y0, h);

    sVector y(n);
    int it = 0;
    for (; it < maxIter; ++it)
    {
        scalar sumY = 0.0;
        for (auto v : Y) sumY += v;
        if (sumY <= 0.0) break;
        for (std::size_t i = 0; i < n; ++i) y[i] = Y[i] / sumY;

        auto gamma_y = phase.activityCoefficients(T, y);

        sVector Y_new(n);
        scalar delta = 0.0;
        for (std::size_t i = 0; i < n; ++i)
        {
            const scalar lnGamma = (gamma_y[i] > 0.0) ? std::log(gamma_y[i]) : 0.0;
            Y_new[i] = std::exp(h[i] - lnGamma);
            delta   += std::abs(Y_new[i] - Y[i]);
        }

        // Trajectory minimum of tm.
        const scalar tmNew = evalTm(Y_new, h);
        if (tmNew < bestTm) { bestTm = tmNew; bestY = Y_new; }

        Y = Y_new;
        if (delta < ssTol) { ++it; break; }
    }

    // Final composition + tm taken from the best point seen.
    scalar sumY = 0.0;
    for (auto v : bestY) sumY += v;
    sVector yBest(n);
    for (std::size_t i = 0; i < n; ++i) yBest[i] = bestY[i] / sumY;

    return ProbeOutcome{ bestY, yBest, bestTm, it, sumY > 0.0 };
}

} // anonymous

StabilityResult michelsenTPD(const Phase&   phase,
    scalar         T,
    scalar         /*P*/,
    const sVector& z,
    scalar         tmTol,
    int            maxIter,
    scalar         ssTol)
{
    const std::size_t n = z.size();

    // Reference h_i at the feed.
    auto gamma_z = phase.activityCoefficients(T, z);
    sVector h(n);
    for (std::size_t i = 0; i < n; ++i)
    {
        const scalar zi = std::max(z[i], 1.0e-30);
        const scalar gi = std::max(gamma_z[i], 1.0e-30);
        h[i] = std::log(zi) + std::log(gi);
    }

    StabilityResult best;
    best.tmMin = std::numeric_limits<scalar>::infinity();

    // -----------------------------------------------------------------
    //  Michelsen 1982 recommends a small set of canonical starting
    //  points so that every "well" of the TPD surface is found at
    //  least once.  For an n-component system Choupo uses up to 4
    //  starts:
    //
    //    1, 2... n   one probe per pure component (heavy bias on x_k)
    //    n+1          mildly perturbed feed (small step away from z)
    //
    //  For binary systems this gives 3 starts; for ternary 4; etc.
    //  Each probe is one successive-substitution loop on Y; we keep
    //  the trialY with the lowest (most negative) tm.
    // -----------------------------------------------------------------
    auto tryProbe = [&](sVector Y0, int probeId) {
        auto out = runProbe(phase, T, h, std::move(Y0), maxIter, ssTol);
        if (out.tm < best.tmMin)
        {
            best.tmMin      = out.tm;
            best.trialY     = out.y;
            best.iterations = out.iters;
            best.probeIndex = probeId;
        }
    };

    // Probes 1..n: pure-component biased.
    const scalar bias = 0.99;
    for (std::size_t k = 0; k < n; ++k)
    {
        sVector Y0(n, (1.0 - bias) / static_cast<scalar>(std::max<std::size_t>(n - 1, 1)));
        Y0[k] = bias;
        tryProbe(std::move(Y0), static_cast<int>(k));
    }

    // Probe n+1: mildly perturbed feed (catches "weak" instabilities
    // where pure-component starts overshoot into the wrong basin).
    {
        sVector Y0(n);
        for (std::size_t i = 0; i < n; ++i)
            Y0[i] = std::max<scalar>(1.0e-6, z[i] + (i == 0 ? 0.05 : -0.05));
        // Normalise
        scalar s = 0.0;
        for (auto v : Y0) s += v;
        for (auto& v : Y0) v /= s;
        tryProbe(std::move(Y0), static_cast<int>(n));
    }

    // Discriminate: tm < tmTol  ⇒  feed is unstable, split exists.
    best.unstable = (best.tmMin < tmTol);
    return best;
}

} // namespace Choupo::solver
