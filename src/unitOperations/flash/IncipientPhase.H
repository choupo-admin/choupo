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
    Choupo::incipientPhase

Description
    THE INCIPIENT PHASE, ITERATED TO ITS OWN COMPOSITION -- the ONE home of
    the vapour-liquid stability question in K-value form (DEV.md 4c C110,
    G7; the C92 finding).

    "Is this liquid below its bubble pressure?" is the question
        S = sum_i K_i(T, P, x, y) x_i  >  1 ?
    and the K-values depend on the composition of the VAPOUR that would
    form, y.  The flash used to answer it with y = x: the vapour's fugacity
    coefficients evaluated at the LIQUID's composition.  For a liquid-rich
    composition at a pressure far above the solvent's vapour pressure that
    asks an equation of state for the vapour root of a dense liquid, and it
    answers with a liquid-like root -- measured on ammonia02's let-down
    liquid (250 K, NH3 with dissolved H2, N2 and Ar): at 19 bar the y = x
    test gave sum K x = 0.83 and read the liquid as SUBCOOLED, down to
    16.7 bar, while its bubble pressure is the 20 bar of the drum it left.
    The vapour that actually forms is rich in H2, N2 and Ar, and THEIR
    fugacity coefficients in it are near one.

    So the trial phase is ITERATED, y <- K(x, y) x / S, from the package's
    ideal K (Psat/P, or H/P for a Henry solute -- never y = x), which is
    Michelsen's (1982) vapour-liquid stability test written in K-values:
    S > 1 at the converged trial means the liquid is unstable and a vapour
    forms.  The mirror question for a vapour, "is it above its dew
    pressure?", is S = sum_i y_i / K_i(T, P, x, y) with the incipient LIQUID
    x iterated the same way.

    Two readers, one rule: `BubblePoint::pressure` (the bubble pressure, a
    root of S(P) = 1) and `IsothermalFlash::solveCore`'s phase test (the
    sign of S - 1 at one (T, P)), and through the latter every reader of a
    stream's equilibrium (`flashState::equilibriumAt`).  Before this file
    the first had the iteration and the second did not, so the bubble
    pressure and the flash disagreed about the same liquid by 3.3 bar.

    A component with zero amount in the given phase is not a term (the
    flash's rule since C35): it contributes nothing to S and nothing to the
    trial phase, whatever its K.
\*---------------------------------------------------------------------------*/

#pragma once

#include "core/Types.H"
#include "thermo/ThermoPackage.H"

#include <algorithm>
#include <cmath>
#include <cstddef>
#include <limits>

namespace Choupo {
namespace incipientPhase {

struct Result
{
    scalar  S          = 0.0;     // sum K x (vapour test) or sum y / K (liquid test)
    sVector trial;                // the incipient phase's composition
    sVector K;                    // K(T, P, x, y) at the last evaluation
    int     iterations = 0;
    bool    converged  = false;   // the trial composition stopped moving
};

//  The incipient VAPOUR of a liquid `x` at (T, P), seeded from `K0`.
//  `S` is sum K x at the converged vapour; S > 1 means the liquid boils.
//  If the seed gives no vapour at all (every present K0 x = 0), S = 0.
inline Result vapour(const ThermoPackage& thermo, scalar T, scalar P,
                     const sVector& x, const sVector& K0,
                     int maxIter = 200, scalar tol = 1.0e-13)
{
    const std::size_t n = thermo.n();
    Result r;
    r.trial.assign(n, 0.0);
    scalar s = 0.0;
    for (std::size_t i = 0; i < n; ++i)
    {
        if (x[i] == 0.0) continue;
        r.trial[i] = K0[i] * x[i];
        s += r.trial[i];
    }
    if (!(s > 0.0)) { r.S = 0.0; return r; }
    for (auto& v : r.trial) v /= s;
    for (int it = 0; it < maxIter; ++it)
    {
        r.K = thermo.Kvec(T, P, x, r.trial);
        r.iterations = it + 1;
        s = 0.0;
        for (std::size_t i = 0; i < n; ++i)
            if (x[i] != 0.0) s += r.K[i] * x[i];
        r.S = s;
        if (!(s > 0.0) || !std::isfinite(s)) return r;
        scalar dy = 0.0;
        for (std::size_t i = 0; i < n; ++i)
        {
            const scalar yn = (x[i] != 0.0) ? r.K[i] * x[i] / s : 0.0;
            dy = std::max(dy, std::abs(yn - r.trial[i]));
            r.trial[i] = yn;
        }
        if (dy < tol) { r.converged = true; break; }
    }
    return r;
}

//  The incipient LIQUID of a vapour `y` at (T, P), seeded from `K0`.
//  `S` is sum y / K at the converged liquid; S > 1 means the vapour
//  condenses.  A present component whose K is zero (a nonvolatile) cannot be
//  a vapour at all: S = +inf, the vapour is not stable.
inline Result liquid(const ThermoPackage& thermo, scalar T, scalar P,
                     const sVector& y, const sVector& K0,
                     int maxIter = 200, scalar tol = 1.0e-13)
{
    const std::size_t n = thermo.n();
    Result r;
    r.trial.assign(n, 0.0);
    scalar s = 0.0;
    for (std::size_t i = 0; i < n; ++i)
    {
        if (y[i] == 0.0) continue;
        if (!(K0[i] > 0.0) || !std::isfinite(K0[i]))
        { r.S = std::numeric_limits<scalar>::infinity(); return r; }
        r.trial[i] = y[i] / K0[i];
        s += r.trial[i];
    }
    if (!(s > 0.0) || !std::isfinite(s)) { r.S = s; return r; }
    for (auto& v : r.trial) v /= s;
    for (int it = 0; it < maxIter; ++it)
    {
        r.K = thermo.Kvec(T, P, r.trial, y);
        r.iterations = it + 1;
        s = 0.0;
        for (std::size_t i = 0; i < n; ++i)
        {
            if (y[i] == 0.0) continue;
            if (!(r.K[i] > 0.0))
            { r.S = std::numeric_limits<scalar>::infinity(); return r; }
            s += y[i] / r.K[i];
        }
        r.S = s;
        if (!(s > 0.0) || !std::isfinite(s)) return r;
        scalar dx = 0.0;
        for (std::size_t i = 0; i < n; ++i)
        {
            const scalar xn = (y[i] != 0.0) ? y[i] / r.K[i] / s : 0.0;
            dx = std::max(dx, std::abs(xn - r.trial[i]));
            r.trial[i] = xn;
        }
        if (dx < tol) { r.converged = true; break; }
    }
    return r;
}

} // namespace incipientPhase
} // namespace Choupo
