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
-------------------------------------------------------------------------------
Reference
    See MADS.H: what was read, what was not, and every place this file
    differs from the published rules.
\*---------------------------------------------------------------------------*/

#include "MADS.H"

#include <algorithm>
#include <cmath>
#include <functional>
#include <iomanip>
#include <iostream>
#include <limits>
#include <map>
#include <stdexcept>

namespace Choupo::solver {

namespace {

constexpr scalar kInf = std::numeric_limits<scalar>::infinity();

//  The first primes: the Halton bases (one per variable; 64 variables is far
//  beyond any case the driver will see).
const int kPrimes[] = {
      2,  3,  5,  7, 11, 13, 17, 19, 23, 29, 31, 37, 41, 43, 47, 53,
     59, 61, 67, 71, 73, 79, 83, 89, 97,101,103,107,109,113,127,131,
    137,139,149,151,157,163,167,173,179,181,191,193,197,199,211,223,
    227,229,233,239,241,251,257,263,269,271,277,281,283,293,307,311};
constexpr std::size_t kNPrimes = sizeof(kPrimes) / sizeof(kPrimes[0]);

scalar radicalInverse(long index, int base)
{
    scalar f = 1.0, r = 0.0;
    while (index > 0)
    {
        f /= base;
        r += f * static_cast<scalar>(index % base);
        index /= base;
    }
    return r;
}

struct Entry
{
    sVector x;
    scalar  f  = kInf;
    scalar  h  = kInf;      // 0 feasible, > 0 infeasible, +inf failed
    sVector c;
    bool    ok = false;
};

using Key = sVector;

//  Are +/- the columns of B (n vectors of length n) a positive spanning set?
//  Yes iff B is nonsingular.  Gaussian elimination with pivoting.
bool nonsingular(std::vector<sVector> cols)
{
    const std::size_t n = cols.size();
    for (std::size_t k = 0; k < n; ++k)
    {
        std::size_t p = k;
        for (std::size_t j = k + 1; j < n; ++j)
            if (std::abs(cols[j][k]) > std::abs(cols[p][k])) p = j;
        if (std::abs(cols[p][k]) < 1.0e-9) return false;
        std::swap(cols[p], cols[k]);
        for (std::size_t j = k + 1; j < n; ++j)
        {
            const scalar m = cols[j][k] / cols[k][k];
            for (std::size_t i = k; i < n; ++i) cols[j][i] -= m * cols[k][i];
        }
    }
    return true;
}

} // anonymous namespace

MADSResult mads(const MADSEvaluator& eval,
                const sVector& x0,
                const sVector& lo,
                const sVector& hi,
                const MADSOptions& opts)
{
    const std::size_t n = x0.size();
    if (lo.size() != n || hi.size() != n || n == 0 || n > kNPrimes)
        throw std::runtime_error("mads: bounds and start must have the same"
                                 " size, between 1 and 64");
    if (!(opts.tau > 0.0 && opts.tau < 1.0))
        throw std::runtime_error("mads: tau must lie in (0,1)");

    std::vector<bool> isInt = opts.isInt;
    isInt.resize(n, false);
    sVector range(n);
    bool allInt = true;
    for (std::size_t i = 0; i < n; ++i)
    {
        range[i] = hi[i] - lo[i];
        if (!(range[i] > 0.0)) throw std::runtime_error("mads: hi must exceed lo");
        if (!isInt[i]) allInt = false;
    }

    MADSResult R;
    std::map<Key, Entry> cache;
    std::vector<const Entry*> all;          // insertion order (stable pointers)

    auto project = [&](sVector x) {
        for (std::size_t i = 0; i < n; ++i)
        {
            if (isInt[i]) x[i] = std::round(x[i]);
            x[i] = std::min(std::max(x[i], lo[i]), hi[i]);
        }
        return x;
    };

    //  Evaluate (or fetch) a point; returns the cache entry.
    auto evaluate = [&](const sVector& xin, bool& fromCache) -> const Entry& {
        sVector x = project(xin);
        auto it = cache.find(x);
        if (it != cache.end()) { fromCache = true; ++R.cacheHits; return it->second; }
        fromCache = false;
        ++R.evaluations;
        Entry e;
        e.x = x;
        const MADSResponse r = eval(x);
        e.ok = r.ok && std::isfinite(r.f);
        for (scalar cj : r.c) if (!std::isfinite(cj)) e.ok = false;
        if (e.ok)
        {
            e.f = r.f; e.c = r.c; e.h = 0.0;
            for (scalar cj : r.c) if (cj > 0.0) e.h += cj * cj;
        }
        else ++R.failures;
        auto ins = cache.emplace(x, std::move(e));
        all.push_back(&ins.first->second);
        return ins.first->second;
    };

    const Entry* xF = nullptr;      // feasible incumbent
    const Entry* xI = nullptr;      // infeasible incumbent
    scalar hMax = kInf;

    //  F^k, U^k, I^k from the whole cache (definitions of G-2019-65 / 2012.10173).
    auto recomputeIncumbents = [&]() {
        xF = nullptr; xI = nullptr;
        for (const Entry* e : all)
            if (e->ok && e->h == 0.0 && (!xF || e->f < xF->f)) xF = e;
        for (const Entry* e : all)
        {
            if (!e->ok || !(e->h > 0.0) || e->h > hMax) continue;
            bool dominated = false;
            for (const Entry* y : all)
            {
                if (!y->ok || !(y->h > 0.0)) continue;
                if ((y->h < e->h && y->f <= e->f) || (y->h <= e->h && y->f < e->f))
                { dominated = true; break; }
            }
            if (!dominated && (!xI || e->f < xI->f)) xI = e;
        }
    };

    auto dominatesInf = [](const Entry& a, const Entry& b) {
        return (a.h < b.h && a.f <= b.f) || (a.h <= b.h && a.f < b.f);
    };

    //  The start.
    bool fc;
    evaluate(x0, fc);
    recomputeIncumbents();

    scalar Delta = opts.pollSize0;
    std::string reason = "iteration cap reached";

    for (int k = 0; k < opts.maxIter; ++k)
    {
        R.iterations = k + 1;
        if (!xF && !xI)
        { reason = "no valid evaluation (every point failed)"; break; }
        if (R.evaluations >= opts.maxEval)
        { reason = "evaluation budget reached"; break; }

        const scalar delta = std::min(Delta, Delta * Delta);
        const scalar DeltaUsed = Delta;

        //  Mesh and frame, variable by variable (integers: floor of 1).
        sVector m(n), e(n);
        bool floorAll = true;
        for (std::size_t i = 0; i < n; ++i)
        {
            m[i] = delta * range[i];
            e[i] = Delta * range[i];
            if (isInt[i])
            {
                m[i] = std::max(1.0, std::round(m[i]));
                e[i] = std::max(e[i], 1.0);
                if (!(m[i] <= 1.0 && e[i] <= 1.0)) floorAll = false;
            }
            else floorAll = false;
        }

        //  Directions: Householder of the Halton vector, scaled to the frame.
        const long t = static_cast<long>(opts.seed) + k + 1;
        sVector u(n);
        scalar nu2 = 0.0;
        for (std::size_t j = 0; j < n; ++j)
        {
            u[j] = 2.0 * radicalInverse(t, kPrimes[j]) - 1.0;
            nu2 += u[j] * u[j];
        }
        if (nu2 < 1.0e-12) { u.assign(n, 0.0); u[0] = 1.0; nu2 = 1.0; }
        std::vector<sVector> cols(n, sVector(n, 0.0));   // displacement vectors
        for (std::size_t j = 0; j < n; ++j)
        {
            scalar mx = 0.0;
            sVector col(n);
            for (std::size_t i = 0; i < n; ++i)
            {
                col[i] = (i == j ? nu2 : 0.0) - 2.0 * u[i] * u[j];
                mx = std::max(mx, std::abs(col[i]));
            }
            for (std::size_t i = 0; i < n; ++i)
                cols[j][i] = m[i] * std::round(e[i] * (col[i] / mx) / m[i]);
        }
        {
            //  Singular after rounding => the coordinate directions.
            std::vector<sVector> unit(n, sVector(n, 0.0));
            for (std::size_t j = 0; j < n; ++j)
                for (std::size_t i = 0; i < n; ++i)
                    unit[j][i] = cols[j][i] / e[i];       // in frame units
            if (!nonsingular(unit))
                for (std::size_t j = 0; j < n; ++j)
                {
                    cols[j].assign(n, 0.0);
                    cols[j][j] = std::max(e[j], m[j]);
                }
        }

        const Entry* fOld = xF;
        const Entry* iOld = xI;
        const scalar hIold = iOld ? iOld->h : kInf;

        //  Primary / secondary poll centres.
        const Entry* primary   = nullptr;
        const Entry* secondary = nullptr;
        if (xF && (!xI || xF->f <= xI->f)) { primary = xF; secondary = xI; }
        else                               { primary = xI; secondary = xF; }

        bool dominating = false, improving = false;
        int nEval = 0, nCache = 0;

        auto classify = [&](const Entry& tr) {
            if (!tr.ok) return;
            if (tr.h == 0.0)
            {
                if (!fOld || tr.f < fOld->f) dominating = true;
                return;
            }
            if (tr.h > hMax) return;                     // beyond the barrier
            if (iOld && dominatesInf(tr, *iOld)) { dominating = true; return; }
            if (tr.h < hIold) improving = true;
        };

        auto pollAround = [&](const Entry* centre, std::size_t nDir) {
            for (std::size_t j = 0; j < nDir && !dominating; ++j)
                for (int sgn = 1; sgn >= -1 && !dominating; sgn -= 2)
                {
                    sVector xt = centre->x;
                    for (std::size_t i = 0; i < n; ++i)
                        xt[i] += sgn * cols[j][i];
                    bool fromCache;
                    const Entry& tr = evaluate(xt, fromCache);
                    if (fromCache) ++nCache; else ++nEval;
                    classify(tr);
                    if (R.evaluations >= opts.maxEval) return;
                }
        };
        pollAround(primary, n);
        if (secondary && !dominating && R.evaluations < opts.maxEval)
            pollAround(secondary, 1);

        std::string outcome;
        if (dominating)
        {
            outcome = "dominating";
            hMax = hIold;                                 // h_I^k
            Delta = std::min(1.0, Delta / opts.tau);
        }
        else if (improving)
        {
            outcome = "improving";
            scalar hm = 0.0;
            for (const Entry* v : all)
                if (v->ok && v->h > 0.0 && v->h < hIold) hm = std::max(hm, v->h);
            hMax = hm;               // max{h(v) : h(v) < h_I^k, v in the cache}
        }
        else
        {
            outcome = "unsuccessful";
            hMax = hIold;
            Delta *= opts.tau;
        }
        recomputeIncumbents();

        MADSTrace tr;
        tr.iteration = k + 1;
        tr.pollSize = DeltaUsed; tr.meshSize = delta;      // the sizes this iteration POLLED with
        tr.nPoll = nEval; tr.nCached = nCache; tr.outcome = outcome;
        tr.fFeasible = xF ? xF->f : kInf;
        tr.fInfeas = xI ? xI->f : kInf;
        tr.hInfeas = xI ? xI->h : kInf;
        tr.hMax = hMax;
        const Entry* best = xF ? xF : xI;
        if (best) { tr.x = best->x; tr.f = best->f; tr.h = best->h; }
        tr.evaluations = R.evaluations;
        if (opts.onIter) opts.onIter(tr);

        if (R.evaluations >= opts.maxEval)
        { reason = "evaluation budget reached"; break; }
        if (Delta < opts.epsStop)
        { reason = "poll size below tolerance"; R.converged = true; break; }
        if (allInt && floorAll && outcome == "unsuccessful")
        { reason = "integer neighbourhood exhausted (mesh at its floor of 1)";
          R.converged = true; break; }
    }

    R.pollSize = Delta;
    R.reason = reason;
    const Entry* best = xF ? xF : xI;
    if (best)
    {
        R.found = true; R.x = best->x; R.f = best->f; R.h = best->h;
        R.c = best->c; R.feasible = (best->h == 0.0);
    }
    return R;
}

// ===========================================================================
//  verifyMADS -- two published problems, every run.
// ===========================================================================
namespace {

struct MadsProblem
{
    std::string name;
    std::function<scalar(const sVector&)> f;
    std::vector<std::function<scalar(const sVector&)>> c;   // <= 0
    sVector lo, hi, x0;
    scalar fStar;
    scalar tol;
};

MADSResult solveMads(const MadsProblem& p, int seed)
{
    auto eval = [&](const sVector& x) {
        MADSResponse r;
        r.f = p.f(x);
        for (const auto& cj : p.c) r.c.push_back(cj(x));
        return r;
    };
    MADSOptions o;
    o.maxEval = 4000;
    o.maxIter = 1000;
    o.epsStop = 1.0e-5;
    o.seed    = seed;
    return mads(eval, p.x0, p.lo, p.hi, o);
}

scalar checkMads(const MadsProblem& p, int verbosity)
{
    const MADSResult R  = solveMads(p, 0);
    const MADSResult R2 = solveMads(p, 0);
    const scalar err = std::abs(R.f - p.fStar);
    if (verbosity >= 3)
        std::cout << "  [verifyMADS] " << std::left << std::setw(5) << p.name
                  << std::right << "  f = " << std::setprecision(8) << std::fixed
                  << R.f << "  (published " << p.fStar << ")  |df| = "
                  << std::scientific << std::setprecision(2) << err
                  << "  evals " << R.evaluations << "  " << R.reason << "\n";
    if (!R.feasible || !(err < p.tol))
        throw std::runtime_error("verifyMADS FAILED on " + p.name + ": f="
            + std::to_string(R.f) + " vs published " + std::to_string(p.fStar)
            + " (|df|=" + std::to_string(err) + " > " + std::to_string(p.tol)
            + (R.feasible ? "" : ", infeasible") + ").  The MADS has a bug --"
            " FIX it, do NOT loosen the tolerance.");
    if (R.f != R2.f || R.evaluations != R2.evaluations)
        throw std::runtime_error("verifyMADS FAILED on " + p.name + ": two"
            " runs with the same seed differ -- the search is not deterministic");
    return err;
}

} // anonymous namespace

scalar verifyMADS(int verbosity)
{
    scalar worst = 0.0;

    //  HS35 (Beale): objective and constraint as in the SQP self-check;
    //  published optimum f* = 0.11111111 (Schittkowski, "An updated set of
    //  306 test problems for nonlinear programming with validated optimal
    //  solutions", table row 35).  The box [0,3]^3 is MADS's (the SQP's upper
    //  bound is +inf); it does not cut the optimum, since x1 + x2 + 2 x3 <= 3
    //  and x >= 0 imply x_i <= 3.
    {
        MadsProblem p;
        p.name = "HS35";
        p.f = [](const sVector& x) {
            return 9.0 - 8*x[0] - 6*x[1] - 4*x[2]
                 + 2*x[0]*x[0] + 2*x[1]*x[1] + x[2]*x[2]
                 + 2*x[0]*x[1] + 2*x[0]*x[2];
        };
        p.c = { [](const sVector& x){ return x[0] + x[1] + 2*x[2] - 3.0; } };
        p.lo = {0, 0, 0};  p.hi = {3, 3, 3};  p.x0 = {0.5, 0.5, 0.5};
        p.fStar = 0.11111111;  p.tol = 5.0e-3;
        worst = std::max(worst, checkMads(p, verbosity));
    }

    //  CB3: f = max{ x1^4 + x2^2, (2-x1)^2 + (2-x2)^2, 2 exp(-x1 + x2) },
    //  non-smooth (three pieces meet at the minimum); published optimum
    //  f* = 2 (HANSO comparison table, arXiv:2009.01037 Table 1; the chained
    //  form with n = 2 in arXiv:2404.16273 gives 2(n-1) = 2).
    {
        MadsProblem p;
        p.name = "CB3";
        p.f = [](const sVector& x) {
            return std::max({ std::pow(x[0], 4) + x[1]*x[1],
                              std::pow(2 - x[0], 2) + std::pow(2 - x[1], 2),
                              2.0 * std::exp(-x[0] + x[1]) });
        };
        p.lo = {-5, -5};  p.hi = {5, 5};  p.x0 = {2.0, 2.0};
        p.fStar = 2.0;  p.tol = 2.0e-3;
        worst = std::max(worst, checkMads(p, verbosity));
    }
    return worst;
}

} // namespace Choupo::solver
