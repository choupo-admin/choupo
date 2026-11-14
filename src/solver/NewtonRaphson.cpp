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

#include "NewtonRaphson.H"

#include "core/InfeasibleTrial.H"

#include <algorithm>
#include <exception>
#include <stdexcept>
#include <cmath>
#include <functional>

namespace Choupo::solver {

NRResult newton1D(const std::function<scalar(scalar)>& f,
    const std::function<scalar(scalar)>& dfdx,
    scalar                               x0,
    const NROptions&                     opts
)
{
    scalar x_lo = opts.lower;
    scalar x_hi = opts.upper;
    scalar x    = std::clamp(x0, x_lo, x_hi);
    const bool seedClamped = (x != x0);
    int stepsLimited = 0, bisections = 0;

    scalar residual = 0.0;
    int    it       = 0;

    //  A TRIAL THE MODEL REFUSES (C398 review, the trial states): an iterate
    //  this search invented that a model refuses with an InfeasibleTrial is
    //  rejected -- the step is halved back toward the last answered point --
    //  and a SEED it refuses is moved inside the window the refusal states,
    //  when it states one.  Nothing is clamped in advance: a law the route
    //  never calls never constrains it.  If the search ends unconverged after
    //  a refusal, the refusal itself is rethrown: the answer lies outside the
    //  law's window, and the law says so, never "did not converge".
    scalar xGood = x;
    bool   haveGood = false;
    std::exception_ptr lastRefusal;
    auto evaluate = [&](scalar& xx, scalar& fx, scalar& dfx)
    {
        for (int k = 0; ; ++k)
        {
            try { fx = f(xx); dfx = dfdx(xx); return; }
            catch (const InfeasibleTrial& e)
            {
                lastRefusal = std::current_exception();
                if (k >= 40) throw;
                if (haveGood) { xx = 0.5 * (xx + xGood); continue; }
                const double lo = std::max<double>(e.windowLo, x_lo), hi = std::min<double>(e.windowHi, x_hi);
                if (!(lo <= hi)) throw;                              // no window stated
                //  Re-seed inside the window; a seed already inside whose slope
                //  probe crossed the edge moves a tenth of the way to the middle.
                if (xx < lo || xx > hi) xx = std::clamp<double>(xx, lo + 0.01 * (hi - lo), hi - 0.01 * (hi - lo));
                else xx += 0.1 * (0.5 * (lo + hi) - xx);
            }
        }
    };

    for (; it < opts.maxIter; ++it)
    {
        scalar fx = 0.0, dfx = 0.0;
        evaluate(x, fx, dfx);
        xGood = x; haveGood = true;
        residual = std::abs(fx);

        // Early break: if we're already at the root, don't take a step.
        // Without this guard, a tiny |fx| combined with a tiny dx and a
        // bracket boundary that has tightened to the current x triggers
        // the bisection fallback below, which catapults x to the middle
        // of [x_lo, x_hi] --- a huge spurious jump after we've already
        // converged.  Reported residual is correct, but the returned x
        // would be the post-bisection one, which is wrong.
        if (residual < opts.tolerance)
        {
            if (opts.onIter)
                opts.onIter(NRTrace{it, x, fx, dfx, 0.0});
            ++it;
            break;
        }

        if (opts.bracket)
        {
            // Decreasing case:  fx>0 means x is below root → tighten lower.
            // Increasing case:  fx>0 means x is above root → tighten upper.
            if (opts.monotoneIncreasing)
                { if (fx > 0.0) x_hi = x; else x_lo = x; }
            else
                { if (fx > 0.0) x_lo = x; else x_hi = x; }
        }

        scalar dx = (std::abs(dfx) > 1e-30) ? -fx / dfx : 0.0;
        if (opts.maxStep > 0.0 && std::abs(dx) > opts.maxStep)
        {
            dx = std::clamp(dx, -opts.maxStep, opts.maxStep);
            ++stepsLimited;
        }

        scalar x_new = x + dx;
        if (opts.bracket && (x_new <= x_lo || x_new >= x_hi))
        {
            x_new = 0.5 * (x_lo + x_hi);
            ++bisections;
        }

        if (opts.onIter)
            opts.onIter(NRTrace{it, x, fx, dfx, x_new - x});

        x = x_new;
    }

    if (!(residual < opts.tolerance) && lastRefusal) std::rethrow_exception(lastRefusal);
    return NRResult{x, residual, it, residual < opts.tolerance,
                    seedClamped, stepsLimited, bisections};
}

NRResult newton1DSafeguarded(const std::function<scalar(scalar)>& f,
    scalar x0,
    scalar fdStep,
    const NROptions& opts,
    std::vector<scalar>* infeasible
)
{
    auto tryF = [&](scalar x, scalar& fx) -> bool
    {
        try { fx = f(x); return true; }
        catch (const InfeasibleTrial&)
        {
            if (infeasible) infeasible->push_back(x);
            return false;
        }
    };
    scalar x = std::clamp(x0, opts.lower, opts.upper);
    NRResult res{x, 0.0, 0, false};
    res.seedClamped = (x != x0);
    scalar lo = 0.0, hi = 0.0;
    bool haveLo = false, haveHi = false;
    int it = 0;
    bool haveNext = false;
    scalar nextF = 0.0;                       // an answered trial, reused
    for (; it < opts.maxIter; ++it)
    {
        scalar fx = 0.0;
        if (haveNext) { fx = nextF; haveNext = false; }
        else if (!tryF(x, fx))
            throw std::runtime_error("newton1DSafeguarded: the residual is"
                " infeasible at the seed x = " + std::to_string(x));
        //  Slope: central difference; one-sided where a probe is infeasible;
        //  a positive unit slope when both are.
        scalar fp = 0.0, fm = 0.0;
        const bool pOk = tryF(x + fdStep, fp);
        const bool mOk = tryF(x - fdStep, fm);
        scalar dfx;
        if (pOk && mOk) dfx = (fp - fm) / (2.0 * fdStep);
        else if (pOk)   dfx = (fp - fx) / fdStep;
        else if (mOk)   dfx = (fx - fm) / fdStep;
        else            dfx = 1.0;
        res.residual = std::abs(fx);
        if (res.residual < opts.tolerance)
        {
            if (opts.onIter) opts.onIter(NRTrace{it, x, fx, dfx, 0.0});
            ++it;
            res.converged = true;
            break;
        }
        if (fx > 0.0) { if (!haveHi || x < hi) { hi = x; haveHi = true; } }
        else          { if (!haveLo || x > lo) { lo = x; haveLo = true; } }
        scalar dx = (std::abs(dfx) > 1e-30) ? -fx / dfx : 0.0;
        if (opts.maxStep > 0.0 && std::abs(dx) > opts.maxStep)
        {
            dx = std::clamp(dx, -opts.maxStep, opts.maxStep);
            ++res.stepsLimited;
        }
        scalar xn = x + dx;
        if (haveLo && haveHi && (xn <= lo || xn >= hi))
        {
            xn = 0.5 * (lo + hi);
            ++res.bisections;
        }
        int halvings = 0;
        for (; halvings < 40; ++halvings)
        {
            if (tryF(xn, nextF)) { haveNext = true; break; }
            xn = x + 0.5 * (xn - x);
        }
        if (halvings >= 40)
            throw std::runtime_error("newton1DSafeguarded: every trial between"
                " x = " + std::to_string(x) + " and the Newton step is"
                " infeasible -- no step exists from here");
        if (opts.onIter) opts.onIter(NRTrace{it, x, fx, dfx, xn - x});
        x = xn;
    }
    res.x = x;
    res.iterations = it;
    return res;
}

} // namespace Choupo::solver
