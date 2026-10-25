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

#include "core/Advisory.H"
#include "core/InfeasibleTrial.H"
#include "NewtonND.H"
#include "LU.H"
#include "BlockTridiagonal.H"

#include <algorithm>
#include <array>
#include <atomic>
#include <cmath>
#include <cstdio>
#include <cstdlib>
#include <functional>
#include <iostream>
#include <limits>
#include <string>
#include <mutex>
#include <stdexcept>
#include <thread>
#include <utility>

#if defined(__linux__) && !defined(__EMSCRIPTEN__)
#include <sched.h>
#endif

namespace Choupo::solver {

namespace {

#ifndef __EMSCRIPTEN__
//  THE THREAD CAP OF THE PARALLEL JACOBIAN -- ONE home (DEV.md 4c C167).
//
//  The rule it implements was implicit until 2026-10-25: hardware_concurrency()
//  minus two, with no override.  That is right for one run on an idle machine
//  and wrong for the suite, which now runs several cases at once: four column
//  cases each taking ten threads on a ten-core laptop is forty threads fighting
//  for ten cores.  Distributing the cores is the ORCHESTRATOR's job
//  (bin/runTests sets CHOUPO_THREADS so that cases x threads ~ cores), never
//  the solver's -- so this reads a declared cap and the CPUs the process is
//  ALLOWED to use, and does NOT probe "free" cores (a load average is a race
//  between processes and goes stale within the solve).
//
//      threads = min( CHOUPO_THREADS if set,
//                     allowed CPUs > 3 ? allowed CPUs - 2 : 1,   (today's rule)
//                     n columns )
//
//  "Allowed" is sched_getaffinity on Linux, so `taskset` and a cpuset cgroup
//  are honoured; elsewhere it is hardware_concurrency().  With CHOUPO_THREADS
//  unset and no affinity restriction the count is exactly the old one.  The
//  count changes only WHEN columns are computed, never WHICH or HOW: every
//  column is the same pure function of its own perturbation, so J is the same
//  matrix bit for bit at any thread count.
//
//  A cap that BINDS is announced once per process on stderr (it is a choice
//  made from outside the case, so the reader is told); an unusable value is
//  announced and ignored, the default rule applying.
unsigned allowedCpus()
{
#if defined(__linux__)
    cpu_set_t set;
    CPU_ZERO(&set);
    if (sched_getaffinity(0, sizeof(set), &set) == 0)
    {
        const int c = CPU_COUNT(&set);
        if (c > 0) return static_cast<unsigned>(c);
    }
#endif
    return std::thread::hardware_concurrency();
}

std::size_t jacobianThreads(std::size_t n)
{
    struct Cap { std::size_t rule = 1; std::size_t declared = 0; };
    static const Cap cap = []
    {
        Cap c;
        const unsigned cpus = allowedCpus();
        c.rule = (cpus > 3u) ? static_cast<std::size_t>(cpus) - 2u : 1u;   // cores - 2
        if (const char* env = std::getenv("CHOUPO_THREADS"))
        {
            char* end = nullptr;
            const long v = std::strtol(env, &end, 10);
            if (end != env && *end == '\0' && v >= 1)
                c.declared = static_cast<std::size_t>(v);
            else
                std::cerr << "[solver] CHOUPO_THREADS='" << env << "' is not a"
                             " positive integer -- ignored; the parallel"
                             " Jacobian keeps its default rule (allowed CPUs - 2"
                             " = " << c.rule << " thread(s)).\n";
        }
        return c;
    }();
    std::size_t t = cap.rule;
    if (cap.declared > 0 && cap.declared < t)
    {
        t = cap.declared;
        static std::once_flag announced;
        std::call_once(announced, [&]
        {
            std::cerr << "[solver] CHOUPO_THREADS=" << cap.declared << " caps the"
                         " parallel finite-difference Jacobian at " << t
                      << " thread(s) (default rule: allowed CPUs - 2 = "
                      << cap.rule << "); the Jacobian is the same, only its"
                         " wall clock changes.\n";
        });
    }
    return std::min(t, n);
}
#endif

scalar normL2(const sVector& v)
{
    scalar s = 0.0;
    for (auto x : v) s += x * x;
    return std::sqrt(s);
}

// Build Jacobian J[i][j] = ∂F_i/∂x_j via central finite differences.
//  `F0` is the residual at the base point x (used to fall back to a one-sided
//  difference when a perturbation lands on an INFEASIBLE trial point -- a unit
//  throwing InfeasibleTrial, not a real error).  The recovery ladder per column:
//  central -> one-sided (whichever side is feasible) -> shrink h and retry ->
//  a clear probe failure if no feasible perturbation exists.  This is exact
//  finite differencing on feasible points, never a silent clamp or penalty.
std::vector<sVector> fdJacobian(const std::function<sVector(const sVector&)>& F,
    const sVector&                                x,
    const sVector&                                F0,
    scalar                                        h0,
    bool                                          parallel)
{
    const std::size_t n = x.size();
    std::vector<sVector> J(n, sVector(n, 0.0));

    auto column = [&](std::size_t j)
    {
        scalar h = h0 * std::max(std::abs(x[j]), 1.0);
        for (int attempt = 0; attempt < 6; ++attempt)
        {
            sVector xp = x, xm = x;
            xp[j] = x[j] + h;
            xm[j] = x[j] - h;
            bool okP = true, okM = true;
            sVector Fp, Fm;
            try { Fp = F(xp); } catch (const InfeasibleTrial&) { okP = false; }
            try { Fm = F(xm); } catch (const InfeasibleTrial&) { okM = false; }
            if (okP && okM)          // central difference (both feasible)
            {
                for (std::size_t i = 0; i < n; ++i)
                    J[i][j] = (Fp[i] - Fm[i]) / (2.0 * h);
                return;
            }
            if (okP)                 // forward one-sided (x+h feasible, x-h not)
            {
                for (std::size_t i = 0; i < n; ++i)
                    J[i][j] = (Fp[i] - F0[i]) / h;
                return;
            }
            if (okM)                 // backward one-sided (x-h feasible, x+h not)
            {
                for (std::size_t i = 0; i < n; ++i)
                    J[i][j] = (F0[i] - Fm[i]) / h;
                return;
            }
            h *= 0.25;               // both infeasible: shrink toward x and retry
        }
        throw InfeasibleTrial("fdJacobian: no feasible perturbation for variable "
                              + std::to_string(j) + " (probe cornered by unit feasibility)");
    };

#ifndef __EMSCRIPTEN__
    // Parallel ONLY when the caller asserts F is thread-safe (a pure function with
    // no shared mutable state).  The recycle / flowsheet Newton mutates unit state
    // per evaluation and must stay serial -- so this is opt-in (opts.parallel).
    //  The count has ONE home, jacobianThreads() above (CHOUPO_THREADS, the
    //  allowed CPUs, n); asked only where the parallel path is eligible, so a
    //  binding cap is announced by the runs it actually binds.
    const std::size_t nThreads = (parallel && n >= 8) ? jacobianThreads(n) : 1u;
    if (parallel && nThreads > 1 && n >= 8)
    {
        std::atomic<std::size_t> next{0};  // dynamic load balancing (columns vary in cost)
        std::exception_ptr eptr;           // a residual may throw on a perturbed point;
        std::mutex eMutex;                 // surface it (a thread exception would terminate)
        auto worker = [&]()
        {
            try
            { for (std::size_t j = next.fetch_add(1); j < n; j = next.fetch_add(1)) column(j); }
            catch (...)
            { std::lock_guard<std::mutex> lk(eMutex); if (!eptr) eptr = std::current_exception(); }
        };
        std::vector<std::thread> pool;
        pool.reserve(nThreads);
        for (std::size_t t = 0; t < nThreads; ++t) pool.emplace_back(worker);
        for (auto& th : pool) th.join();
        if (eptr) std::rethrow_exception(eptr);
        return J;
    }
#endif
    for (std::size_t j = 0; j < n; ++j) column(j);   // serial (recycle / small / WASM)
    return J;
}


// ---------------------------------------------------------------------------
//  Block-tridiagonal machinery (declared structure; see NewtonND.H).  The
//  bands and the block-Thomas solve live in BlockTridiagonal.{H,cpp}, the
//  one home this Newton shares with the stiff integrator.
// ---------------------------------------------------------------------------

//  The Curtis-Powell-Reid colored Jacobian.  Three colors: perturbing one
//  variable slot in EVERY THIRD block touches disjoint residual rows (a
//  block's residual sees only blocks b-1, b, b+1), so one evaluation pair
//  yields that column for every block of the color at once -- 3*nv
//  evaluation pairs per Jacobian, independent of N.
//
//  Each column keeps ITS OWN step h = h0 * max(|x_col|, 1) -- the same rule
//  as the dense builder, so on a structure that is truly block-tridiagonal
//  the two constructions agree to round-off and the first-iteration check
//  compares like with like.  An InfeasibleTrial on a colored pass cannot
//  name the offending column, so that pass FALLS BACK to per-column dense
//  probing (counted; the caller may announce).
struct ColoredResult { BlockBands bands; long evals = 0; long fallbacks = 0; };

ColoredResult fdJacobianColoredBT(
    const std::function<sVector(const sVector&)>& F,
    const sVector& x, const sVector& F0, scalar h0,
    std::size_t N, std::size_t nv)
{
    const std::size_t n = x.size();
    ColoredResult out{BlockBands(N, nv), 0, 0};

    auto depositColumn = [&](std::size_t col, const sVector& dFdx)
    {
        const std::size_t bcol = col / nv, k = col % nv;
        //  for residual block-row brow, the band holding column-block bcol:
        //  bcol == brow-1 -> sub(0);  == brow -> diag(1);  == brow+1 -> sup(2)
        for (long brow = long(bcol) - 1; brow <= long(bcol) + 1; ++brow)
        {
            if (brow < 0 || brow >= long(N)) continue;
            auto& blk = out.bands.b[std::size_t(brow)]
                            [std::size_t(long(bcol) - brow + 1)];
            for (std::size_t i = 0; i < nv; ++i)
                blk[i][k] = dFdx[std::size_t(brow) * nv + i];
        }
    };

    auto denseColumn = [&](std::size_t col)
    {
        // the dense builder's own ladder, one column
        scalar h = h0 * std::max(std::abs(x[col]), 1.0);
        for (int attempt = 0; attempt < 6; ++attempt)
        {
            sVector xp = x, xm = x;
            xp[col] += h; xm[col] -= h;
            bool okP = true, okM = true; sVector Fp, Fm;
            try { Fp = F(xp); ++out.evals; } catch (const InfeasibleTrial&) { okP = false; }
            try { Fm = F(xm); ++out.evals; } catch (const InfeasibleTrial&) { okM = false; }
            sVector d(n, 0.0);
            if (okP && okM) { for (std::size_t i = 0; i < n; ++i) d[i] = (Fp[i]-Fm[i])/(2*h); depositColumn(col, d); return; }
            if (okP)        { for (std::size_t i = 0; i < n; ++i) d[i] = (Fp[i]-F0[i])/h;     depositColumn(col, d); return; }
            if (okM)        { for (std::size_t i = 0; i < n; ++i) d[i] = (F0[i]-Fm[i])/h;     depositColumn(col, d); return; }
            h *= 0.25;
        }
        throw InfeasibleTrial("fdJacobianColoredBT: no feasible perturbation for column "
                              + std::to_string(col));
    };

    for (std::size_t k = 0; k < nv; ++k)
        for (std::size_t c = 0; c < 3; ++c)
        {
            //  one colored pass: slot k of every block with index % 3 == c
            sVector xp = x, xm = x;
            std::vector<scalar> hcol;
            std::vector<std::size_t> cols;
            for (std::size_t bblk = c; bblk < N; bblk += 3)
            {
                const std::size_t col = bblk * nv + k;
                const scalar h = h0 * std::max(std::abs(x[col]), 1.0);
                xp[col] += h; xm[col] -= h;
                hcol.push_back(h); cols.push_back(col);
            }
            if (cols.empty()) continue;
            bool ok = true; sVector Fp, Fm;
            try { Fp = F(xp); ++out.evals; Fm = F(xm); ++out.evals; }
            catch (const InfeasibleTrial&) { ok = false; }
            if (!ok)
            {
                ++out.fallbacks;
                for (std::size_t col : cols) denseColumn(col);
                continue;
            }
            for (std::size_t m = 0; m < cols.size(); ++m)
            {
                const std::size_t col = cols[m], bcol = col / nv;
                sVector d(n, 0.0);
                //  rows of blocks bcol-1..bcol+1 belong to THIS column; other
                //  rows belong to the other columns of the pass (disjoint).
                for (long brow = long(bcol) - 1; brow <= long(bcol) + 1; ++brow)
                {
                    if (brow < 0 || brow >= long(N)) continue;
                    for (std::size_t i = 0; i < nv; ++i)
                    {
                        const std::size_t r = std::size_t(brow) * nv + i;
                        d[r] = (Fp[r] - Fm[r]) / (2.0 * hcol[m]);
                    }
                }
                depositColumn(col, d);
            }
        }
    return out;
}

} // anonymous namespace

// ---------------------------------------------------------------------------
//  Gauss elimination with partial pivoting.
//
//  Now a thin wrapper over the reusable luFactor / luSolve (src/solver/LU) so
//  a single factorisation can be shared -- the stiff Rosenbrock integrator
//  factors W = I - gamma*h*J once and back-solves it three times.  Same
//  partial-pivot rule, same singular threshold, same U entries and
//  substitution order, so Newton's results are unchanged.
// ---------------------------------------------------------------------------
sVector gaussSolve(std::vector<sVector> A, sVector b)
{
    const std::size_t n = b.size();
    if (A.size() != n)
        throw std::runtime_error("gaussSolve: A.size != b.size");

    std::vector<std::size_t> piv;
    luFactor(A, piv);
    return luSolve(A, piv, std::move(b));
}

// ---------------------------------------------------------------------------
//  Newton n-D with backtracking
// ---------------------------------------------------------------------------
//  A NEWTON THAT STOPS EARLY SAYS WHY (2026-09-27, DEV.md §5 A3).  The
//  no-silent-crutch rule (2026-05-30) asks a solver to announce what it does
//  to converge; the three early exits below -- a block-Thomas solve that
//  threw, a singular dense Jacobian, a line search that found no feasible
//  step -- used to return `converged = false` and DROP the cause, the
//  exception's own message included.  They now carry it in
//  `NDResult::stopReason` and raise it on the AdvisoryLog, which stamps the
//  innermost open frame and its trial/accepted status, so a stop inside a
//  discarded search is filed as the PATH and not as the answer.  The advisory
//  text omits the iteration and |F| so the SAME cause raised on every trial of
//  an outer search is one entry, not a hundred; the console line (printed only
//  when the entry is new) carries them.
namespace
{
std::string announceStop(const std::string& cause, int it, scalar normF)
{
    const std::string msg = "the Newton solve STOPPED NOT converged: " + cause
        + ".  The caller received the last good iterate.";
    if (AdvisoryLog::instance().add("solver", "warning", "newtonND", msg))
        std::cerr << "[solver] newtonND: " << cause << " (iteration " << it
                  << ", |F| = " << normF << ") -- stopped NOT converged,"
                     " last good iterate returned (announced).\n";
    return cause;
}
} // namespace

NDResult newtonND(const std::function<sVector(const sVector&)>& F,
    sVector                                       x0,
    const NDOptions&                              opts)
{
    sVector x = std::move(x0);
    sVector Fx = F(x);
    scalar  normF = normL2(Fx);
    scalar  offBand  = std::numeric_limits<scalar>::quiet_NaN();
    scalar  mismatch = std::numeric_limits<scalar>::quiet_NaN();
    long    jacEvals = 0;

    int it = 0;
    for (; it < opts.maxIter; ++it)
    {
        if (normF < opts.tolerance)
            return {x, Fx, normF, it, true, offBand, jacEvals, {}, mismatch};

        // Build J(x) and solve J · dx = -F
        sVector minusFx(Fx.size());
        for (std::size_t i = 0; i < Fx.size(); ++i) minusFx[i] = -Fx[i];

        sVector dx;
        const bool bt = opts.blockTri.declared()
                     && x.size() == opts.blockTri.nBlocks * opts.blockTri.blockSize;
        if (bt)
        {
            const std::size_t N  = opts.blockTri.nBlocks;
            const std::size_t nv = opts.blockTri.blockSize;
            ColoredResult colored;
            if (opts.blockTri.jacobian)
            {
                //  the caller's ANALYTIC bands (C142); no residual evaluations
                colored.bands = BlockBands(N, nv);
                opts.blockTri.jacobian(x, colored.bands);
            }
            else
            {
                colored = fdJacobianColoredBT(F, x, Fx, opts.fdStep, N, nv);
                jacEvals += colored.evals;
            }

            if (it == 0 && opts.blockTri.audit)
            {
                //  THE DECLARATION IS A CLAIM, AND A CLAIM IS MEASURED.  The
                //  first iteration also builds the dense Jacobian and takes
                //  the largest entry OUTSIDE the three block bands.  A
                //  materially false structure refuses by name -- a wrong
                //  declaration must never become a silently wrong answer.
                auto Jd = fdJacobian(F, x, Fx, opts.fdStep, opts.parallel);
                jacEvals += 2 * long(x.size());
                scalar off = 0.0, inBand = 0.0;
                for (std::size_t i = 0; i < x.size(); ++i)
                    for (std::size_t j = 0; j < x.size(); ++j)
                    {
                        const long d = std::labs(long(i/nv) - long(j/nv));
                        if (d <= 1) inBand = std::max(inBand, std::abs(Jd[i][j]));
                        else        off    = std::max(off,    std::abs(Jd[i][j]));
                    }
                offBand = off;
                if (opts.blockTri.jacobian)
                {
                    //  the derivative claim, measured beside the structure
                    //  claim: each in-band analytic entry against the dense
                    //  FD one, relative to the largest |J| of its row.
                    scalar mis = 0.0;
                    for (std::size_t i = 0; i < x.size(); ++i)
                    {
                        scalar rowMax = 0.0;
                        for (std::size_t j = 0; j < x.size(); ++j)
                            rowMax = std::max(rowMax, std::abs(Jd[i][j]));
                        if (!(rowMax > 0.0)) continue;
                        const std::size_t bi = i / nv;
                        for (long bj = long(bi) - 1; bj <= long(bi) + 1; ++bj)
                        {
                            if (bj < 0 || bj >= long(N)) continue;
                            const auto& blk = colored.bands.b[bi][std::size_t(bj - long(bi) + 1)];
                            for (std::size_t c = 0; c < nv; ++c)
                            {
                                const std::size_t j = std::size_t(bj) * nv + c;
                                mis = std::max(mis, std::abs(blk[i % nv][c] - Jd[i][j]) / rowMax);
                            }
                        }
                    }
                    mismatch = mis;
                }
                if (off > 1.0e-4 * std::max(inBand, scalar(1.0)))
                    throw std::runtime_error(
                        "newtonND: the DECLARED block-tridiagonal structure ("
                        + std::to_string(N) + " blocks of "
                        + std::to_string(nv) + ") is FALSE: max |J| outside"
                        " the bands is " + std::to_string(off)
                        + " against " + std::to_string(inBand)
                        + " inside.  The residual couples non-adjacent"
                        " blocks; solve it dense, or fix the declaration."
                        "  Refusing -- a wrong structure must not become a"
                        " silently wrong answer.");
            }
            try { dx = blockThomasSolve(colored.bands, minusFx); }
            catch (const std::exception& e)
            {
                if (opts.onIter) opts.onIter({it, x, Fx, normF, 0.0});
                return {x, Fx, normF, it, false, offBand, jacEvals,
                        announceStop(std::string("the block-Thomas linear"
                            " solve of the Newton step failed (")
                            + e.what() + ")", it, normF), mismatch};
            }
        }
        else
        {
            auto J = fdJacobian(F, x, Fx, opts.fdStep, opts.parallel);
            jacEvals += 2 * long(x.size());
            try { dx = gaussSolve(J, minusFx); }
            catch (const std::exception& e)
            {
                // Singular Jacobian — bail with last iterate, and SAY so.
                if (opts.onIter) opts.onIter({it, x, Fx, normF, 0.0});
                return {x, Fx, normF, it, false, offBand, jacEvals,
                        announceStop(std::string("the dense linear solve of"
                            " the Newton step failed (") + e.what() + ")",
                            it, normF)};
            }
        }

        // Backtracking line search
        scalar alpha = 1.0;
        sVector xNew(x.size());
        sVector FxNew;
        //  NaN, not garbage.  The backtracking loop below can EXHAUST -- every
        //  trial infeasible, or none reducing the norm before alpha falls under
        //  minAlpha -- and it then falls out having assigned nothing.  The
        //  iteration used to carry that uninitialised value straight into
        //  `normF` and move a possibly-EMPTY FxNew into Fx: from there the
        //  convergence test, the iteration hook and the returned residual are
        //  all reading memory nobody wrote.  Seeded here, detected below.
        scalar  normFNew = std::numeric_limits<scalar>::quiet_NaN();
        if (opts.backtracking)
        {
            while (alpha >= opts.minAlpha)
            {
                for (std::size_t i = 0; i < x.size(); ++i)
                    xNew[i] = x[i] + alpha * dx[i];
                try { FxNew = F(xNew); }
                catch (const InfeasibleTrial&) { alpha *= 0.5; continue; }  // trial infeasible: shorten
                normFNew = normL2(FxNew);
                if (normFNew < normF) break;
                alpha *= 0.5;
            }
        }
        else
        {
            scalar a = 1.0;
            for (;;)
            {
                for (std::size_t i = 0; i < x.size(); ++i)
                    xNew[i] = x[i] + a * dx[i];
                try { FxNew = F(xNew); break; }
                catch (const InfeasibleTrial&) { a *= 0.5; if (a < opts.minAlpha) throw; }
            }
            normFNew = normL2(FxNew);
        }

        //  An EXHAUSTED line search is a failed step, not a step to take.
        //  Bail with the last GOOD iterate and converged = false -- the same
        //  posture as the singular Jacobian above, and the only honest one:
        //  a solver that cannot improve must say so, never advance on a
        //  trial it could not evaluate.
        if (FxNew.empty() || !std::isfinite(normFNew))
        {
            if (opts.onIter) opts.onIter({it, x, Fx, normF, alpha});
            return {x, Fx, normF, it, false, offBand, jacEvals,
                    announceStop("the line search found no evaluable step"
                        " (every trial infeasible or non-finite down to the"
                        " minimum backtracking factor)", it, normF), mismatch};
        }

        if (opts.onIter) opts.onIter({it, x, Fx, normF, alpha});

        x = std::move(xNew);
        Fx = std::move(FxNew);
        normF = normFNew;
    }

    //  maxIter reached: the structure measurement and the Jacobian count
    //  travel with this exit too (they were dropped here, so a column that
    //  hit maxIter lost its `block-tridiagonal structure VERIFIED` line).
    return {x, Fx, normF, it, normF < opts.tolerance, offBand, jacEvals, {}, mismatch};
}

} // namespace Choupo::solver
