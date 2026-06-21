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

#include "Rosenbrock23.H"
#include "Jacobian.H"
#include "../LU.H"

#include <algorithm>
#include <cmath>
#include <iostream>

namespace Choupo::solver
{

namespace
{
// Per-component absolute tolerance from the (possibly size-1) atol vector.
scalar atolFor(const ODEControls& c, std::size_t i)
{
    if (c.atol.empty()) return 1.0e-12;
    return (i < c.atol.size()) ? c.atol[i] : c.atol.back();
}

// Gershgorin bound on the spectral radius: max_i Σ_j |J_ij| >= |λ|_max.
scalar spectralBound(const std::vector<sVector>& J)
{
    scalar m = 0.0;
    for (const auto& row : J)
    {
        scalar s = 0.0;
        for (scalar v : row) s += std::abs(v);
        m = std::max(m, s);
    }
    return m;
}
} // namespace

ODEStats Rosenbrock23::integrate(sVector& y, scalar t0, scalar t1,
                                 const DerivFn& f, const ODEControls& ctrl) const
{
    ODEStats st;
    const std::size_t n = y.size();
    const scalar span = t1 - t0;
    if (span <= 0.0) return st;

    const scalar d   = 1.0 / (2.0 + std::sqrt(2.0));
    const scalar e32 = 6.0 + std::sqrt(2.0);

    // Typical scales for the FD Jacobian (|y| with an atol floor).
    sVector typ(n, 1.0);
    for (std::size_t i = 0; i < n; ++i)
        typ[i] = std::max(std::abs(y[i]), atolFor(ctrl, i));

    // Initial step (Hairer-style): h0 ~ 0.01 ||y||/||f|| in the scaled norm.
    scalar t = t0;
    sVector f0 = f(t, y);
    scalar h;
    if (ctrl.hInit > 0.0)
        h = ctrl.hInit;
    else
    {
        scalar d0 = 0.0, d1 = 0.0;
        for (std::size_t i = 0; i < n; ++i)
        {
            const scalar sc = atolFor(ctrl, i) + ctrl.rtol * std::abs(y[i]);
            d0 += (y[i] / sc) * (y[i] / sc);
            d1 += (f0[i] / sc) * (f0[i] / sc);
        }
        d0 = std::sqrt(d0 / n); d1 = std::sqrt(d1 / n);
        h  = (d1 < 1.0e-10) ? 1.0e-6 * std::max(span, 1.0) : 0.01 * d0 / d1;
        h  = std::min(h, span);
        if (h <= 0.0) h = 1.0e-8 * std::max(span, 1.0);
    }
    const scalar hMin = (ctrl.hMin > 0.0)
        ? ctrl.hMin
        : 1.0e-13 * std::max(std::abs(t1), 1.0);

    scalar stiffPeak = 0.0;

    while (t < t1 - 1.0e-14 * std::max(std::abs(t1), 1.0))
    {
        if (h > t1 - t) h = t1 - t;
        if (st.steps >= ctrl.maxSteps) { st.ok = false; break; }

        // --- one Jacobian + one factorisation of W = I - h*d*J --------------
        f0 = f(t, y);
        auto J  = fdJacobianODE(f, t, y, f0, typ);
        const sVector Td = fdDfDt(f, t, y, f0, std::max(span, 1.0));
        stiffPeak = std::max(stiffPeak, spectralBound(J));

        std::vector<sVector> W(n, sVector(n, 0.0));
        for (std::size_t i = 0; i < n; ++i)
            for (std::size_t j = 0; j < n; ++j)
                W[i][j] = (i == j ? 1.0 : 0.0) - h * d * J[i][j];

        std::vector<std::size_t> piv;
        try { luFactor(W, piv); }
        catch (...) { h *= 0.5; ++st.rejected; if (h < hMin) { st.ok = false; break; } continue; }

        const scalar hd = h * d;

        // k1 = W^{-1} (f0 + hd*Td)
        sVector r1(n);
        for (std::size_t i = 0; i < n; ++i) r1[i] = f0[i] + hd * Td[i];
        const sVector k1 = luSolve(W, piv, r1);

        // f2 = f(t+h/2, y + h/2 k1)
        sVector y2(n);
        for (std::size_t i = 0; i < n; ++i) y2[i] = y[i] + 0.5 * h * k1[i];
        const sVector f2 = f(t + 0.5 * h, y2);

        // k2 = W^{-1}(f2 - k1) + k1
        sVector r2(n);
        for (std::size_t i = 0; i < n; ++i) r2[i] = f2[i] - k1[i];
        sVector k2 = luSolve(W, piv, r2);
        for (std::size_t i = 0; i < n; ++i) k2[i] += k1[i];

        // candidate y* = y + h k2
        sVector ynew(n);
        for (std::size_t i = 0; i < n; ++i) ynew[i] = y[i] + h * k2[i];

        // f3 = f(t+h, y*)
        const sVector f3 = f(t + h, ynew);

        // k3 = W^{-1}( f3 - e32(k2 - f2) - 2(k1 - f0) + hd*Td )
        sVector r3(n);
        for (std::size_t i = 0; i < n; ++i)
            r3[i] = f3[i] - e32 * (k2[i] - f2[i]) - 2.0 * (k1[i] - f0[i]) + hd * Td[i];
        const sVector k3 = luSolve(W, piv, r3);

        // embedded error err = (h/6)(k1 - 2 k2 + k3)
        scalar errNorm = 0.0;
        for (std::size_t i = 0; i < n; ++i)
        {
            const scalar err = (h / 6.0) * (k1[i] - 2.0 * k2[i] + k3[i]);
            const scalar sc  = atolFor(ctrl, i)
                             + ctrl.rtol * std::max(std::abs(y[i]), std::abs(ynew[i]));
            const scalar e   = err / sc;
            errNorm += e * e;
        }
        errNorm = std::sqrt(errNorm / static_cast<scalar>(n));

        // positivity: a step that drives a species row negative is unphysical
        // and would feed a fractional pow() a negative base -> NaN.  Reject it.
        bool negative = false;
        for (std::size_t i = 0; i < ctrl.nPositive && i < n; ++i)
            if (ynew[i] < 0.0) { negative = true; break; }

        bool finite = true;
        for (scalar v : ynew) if (!std::isfinite(v)) { finite = false; break; }

        ++st.steps;
        if (errNorm <= 1.0 && !negative && finite)
        {
            // accept
            y = ynew;
            t += h;
            ++st.accepted;
            for (std::size_t i = 0; i < n; ++i)
                typ[i] = std::max(std::abs(y[i]), atolFor(ctrl, i));
            // grow the step (order-2 pair -> exponent 1/3)
            const scalar fac = 0.8 * std::pow(std::max(errNorm, 1.0e-10), -1.0 / 3.0);
            h *= std::min(4.0, std::max(0.2, fac));
        }
        else
        {
            // reject + shrink
            ++st.rejected;
            if (negative || !finite) h *= 0.5;
            else
            {
                const scalar fac = 0.8 * std::pow(errNorm, -1.0 / 3.0);
                h *= std::min(1.0, std::max(0.1, fac));
            }
            if (h < hMin) { st.ok = false; break; }
        }
    }

    st.hLast     = h;
    st.hMinUsed  = hMin;
    st.stiffness = stiffPeak;

    if (ctrl.verbosity >= 3)
    {
        // The explicit-method stability bound (RK4 ~ 2.8/|λ|max) vs the step we
        // actually took: the ratio is "how much stiffness bought us".
        const scalar hExpl = (stiffPeak > 0.0) ? 2.8 / stiffPeak : 0.0;
        std::cout << "  [ODE] Rosenbrock23 (L-stable, linearly-implicit 2(3))\n"
                  << "        steps: " << st.accepted << " accepted, "
                  << st.rejected << " rejected\n"
                  << "        |lambda|_max ~ " << stiffPeak << " 1/s"
                  << "   explicit-stable step ~ " << hExpl << " s\n"
                  << "        stiffness ratio ~ "
                  << ((hExpl > 0.0) ? (st.hLast / hExpl) : 0.0)
                  << "x (implicit steps that big would be unstable for RK4)\n";
        if (!st.ok)
            std::cout << "        WARNING: gave up (step below hMin or maxSteps)\n";
    }
    return st;
}

} // namespace Choupo::solver
