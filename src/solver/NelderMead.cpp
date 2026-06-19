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

#include "NelderMead.H"

#include <algorithm>
#include <cmath>
#include <limits>
#include <numeric>
#include <stdexcept>

namespace Choupo::solver {

namespace {

// Element-wise clip x to [lo, hi].  If either bound vector is empty,
// that side is unbounded.
void clipInPlace(sVector& x, const sVector& lo, const sVector& hi)
{
    const std::size_t n = x.size();
    if (!lo.empty())
        for (std::size_t i = 0; i < n; ++i) if (x[i] < lo[i]) x[i] = lo[i];
    if (!hi.empty())
        for (std::size_t i = 0; i < n; ++i) if (x[i] > hi[i]) x[i] = hi[i];
}

scalar norm2(const sVector& v)
{
    scalar s = 0;
    for (auto x : v) s += x * x;
    return std::sqrt(s);
}

sVector vadd(const sVector& a, const sVector& b, scalar bw = 1.0)
{
    sVector r(a.size());
    for (std::size_t i = 0; i < a.size(); ++i) r[i] = a[i] + bw * b[i];
    return r;
}

sVector vsub(const sVector& a, const sVector& b)
{
    sVector r(a.size());
    for (std::size_t i = 0; i < a.size(); ++i) r[i] = a[i] - b[i];
    return r;
}

} // anonymous namespace

NMResult nelderMead(const std::function<scalar(const sVector&)>& f,
    const sVector&                               x0,
    const sVector&                               lo,
    const sVector&                               hi,
    const NMOptions&                             opts)
{
    const std::size_t n = x0.size();
    if (n == 0)
        throw std::runtime_error("nelderMead: x0 has zero dimension");
    if (!lo.empty() && lo.size() != n)
        throw std::runtime_error("nelderMead: lo bound has wrong dimension");
    if (!hi.empty() && hi.size() != n)
        throw std::runtime_error("nelderMead: hi bound has wrong dimension");

    // ------------------------------------------------------------------
    // 1.  Build initial simplex: n+1 vertices.
    //     Vertex 0 is x0 itself (clipped); vertices 1..n perturb one
    //     coordinate at a time.
    // ------------------------------------------------------------------
    std::vector<sVector> X(n + 1, sVector(n));
    sVector              F(n + 1);

    X[0] = x0;
    clipInPlace(X[0], lo, hi);

    for (std::size_t k = 0; k < n; ++k)
    {
        sVector v = X[0];
        const scalar step =
            (std::abs(v[k]) > 1.0e-12)
            ? opts.simplexInitFactor * std::abs(v[k])
          : opts.absStep;
        v[k] += step;
        clipInPlace(v, lo, hi);
        // If clipping killed the step (e.g. x0 sat at upper bound), try downward.
        if (v[k] == X[0][k])
        {
            v[k] -= 2 * step;
            clipInPlace(v, lo, hi);
        }
        X[k + 1] = v;
    }

    int evaluations = 0;
    for (std::size_t k = 0; k <= n; ++k) { F[k] = f(X[k]); ++evaluations; }

    // Per-variable bound widths used to normalise the simplex-diameter
    // test.  Without bounds we fall back to |x0_i| (or 1 if x0_i == 0)
    // so that the test stays dimensionless and treats every coordinate
    // on equal footing -- a 1 m^3 reactor and a 400 K temperature are
    // both "fine to 0.1 %" when their bound widths are used as scales.
    sVector scale(n);
    for (std::size_t i = 0; i < n; ++i)
    {
        if (!lo.empty() && !hi.empty())
            scale[i] = std::max<scalar>(1.0e-12, hi[i] - lo[i]);
        else
            scale[i] = std::max<scalar>(1.0e-12, std::abs(x0[i]));
    }

    // Helper: sort indices best -> worst by current F values.
    auto sortIdx = [&]() {
        std::vector<std::size_t> idx(n + 1);
        std::iota(idx.begin(), idx.end(), 0);
        std::sort(idx.begin(), idx.end(),
                  [&](std::size_t a, std::size_t b) { return F[a] < F[b]; });
        return idx;
    };

    auto trace = [&](int it, const std::vector<std::size_t>& idx, const std::string& move) {
        if (!opts.onIter) return;
        scalar sz = 0;
        for (std::size_t k = 0; k <= n; ++k)
            sz = std::max(sz, norm2(vsub(X[k], X[idx.front()])));
        NMTrace t{it, X[idx.front()], F[idx.front()], F[idx.back()], sz, move};
        opts.onIter(t);
    };

    auto idx = sortIdx();
    trace(0, idx, "init");

    // ------------------------------------------------------------------
    // 2.  Main loop.
    // ------------------------------------------------------------------
    NMResult R;
    R.iterations = 0;
    R.evaluations = evaluations;
    R.converged = false;
    R.reason = "maxIter reached";

    for (int it = 1; it <= opts.maxIter; ++it)
    {
        idx = sortIdx();
        const std::size_t iBest   = idx.front();
        const std::size_t iWorst  = idx.back();
        const std::size_t iSecond = idx[idx.size() - 2];

        // --- centroid of all but the worst -----------------------------
        sVector xc(n, 0.0);
        for (std::size_t k = 0; k <= n; ++k)
            if (k != iWorst)
                for (std::size_t i = 0; i < n; ++i) xc[i] += X[k][i];
        for (auto& v : xc) v /= static_cast<scalar>(n);

        // --- reflection ----------------------------------------------
        sVector xr = vadd(xc, vsub(xc, X[iWorst]), opts.alpha);
        clipInPlace(xr, lo, hi);
        scalar fr = f(xr); ++evaluations;
        std::string move = "reflect";

        if (fr < F[iBest])
        {
            // --- expansion -------------------------------------------
            sVector xe = vadd(xc, vsub(xr, xc), opts.gamma);
            clipInPlace(xe, lo, hi);
            const scalar fe = f(xe); ++evaluations;
            if (fe < fr) { X[iWorst] = xe; F[iWorst] = fe; move = "expand"; }
            else         { X[iWorst] = xr; F[iWorst] = fr; }
        }
        else if (fr < F[iSecond])
        {
            X[iWorst] = xr; F[iWorst] = fr;  // reflection accepted
        }
        else
        {
            // --- contraction -----------------------------------------
            // Outside contraction if fr < F[worst], else inside contraction.
            sVector xo;
            if (fr < F[iWorst])
                xo = vadd(xc, vsub(xr,        xc), opts.rho);
            else
                xo = vadd(xc, vsub(X[iWorst], xc), opts.rho);
            clipInPlace(xo, lo, hi);
            const scalar fo = f(xo); ++evaluations;
            if (fo < F[iWorst]) { X[iWorst] = xo; F[iWorst] = fo; move = "contract"; }
            else
            {
                // --- shrink toward best ------------------------------
                for (std::size_t k = 0; k <= n; ++k)
                    if (k != iBest)
                    {
                        X[k] = vadd(X[iBest], vsub(X[k], X[iBest]), opts.sigma);
                        clipInPlace(X[k], lo, hi);
                        F[k] = f(X[k]); ++evaluations;
                    }
                move = "shrink";
            }
        }

        idx = sortIdx();
        trace(it, idx, move);

        // --- convergence tests ---------------------------------------
        // tolX: simplex diameter, normalised PER variable by its bound
        // width.  Stop only when the simplex is small in EVERY
        // coordinate (max of per-axis normalised spans).
        scalar relDiameter = 0;
        for (std::size_t i = 0; i < n; ++i)
        {
            scalar axisSpan = 0;
            for (std::size_t k = 0; k <= n; ++k)
            {
                const scalar d = std::abs(X[k][i] - X[idx.front()][i]);
                if (d > axisSpan) axisSpan = d;
            }
            relDiameter = std::max(relDiameter, axisSpan / scale[i]);
        }

        // tolF: range of f over the simplex (relative to |best|)
        const scalar fRange = F[idx.back()] - F[idx.front()];
        const scalar fScale = std::max<scalar>(1.0, std::abs(F[idx.front()]));

        if (relDiameter < opts.tolX)
        {
            R.converged = true; R.reason = "tolX (simplex diameter)";
            R.iterations = it; break;
        }
        if (fRange / fScale < opts.tolF)
        {
            R.converged = true; R.reason = "tolF (f range)";
            R.iterations = it; break;
        }
        R.iterations = it;
    }

    idx = sortIdx();
    R.x = X[idx.front()];
    R.f = F[idx.front()];
    R.evaluations = evaluations;
    return R;
}

} // namespace Choupo::solver
