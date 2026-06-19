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
Reference (public-domain method, primary source -- NOT a port of any code):
    Nocedal & Wright, Numerical Optimization, 2nd ed. (2006), Ch. 18
      (line-search SQP, damped-BFGS, L1 merit; merit directional
       derivative eq. 18.29).
    Powell (1978), LNM 630 (the damped-BFGS modification rule, eq. for
      theta and r).
\*---------------------------------------------------------------------------*/

#include "SQP.H"
#include "ActiveSetQP.H"

#include <algorithm>
#include <cmath>
#include <iomanip>
#include <iostream>
#include <limits>
#include <sstream>
#include <stdexcept>

namespace Choupo::solver {

namespace {

constexpr scalar kInf = std::numeric_limits<scalar>::infinity();

scalar normInf(const sVector& v)
{
    scalar m = 0.0;
    for (scalar x : v) m = std::max(m, std::abs(x));
    return m;
}

scalar dotv(const sVector& a, const sVector& b)
{
    scalar s = 0.0;
    for (std::size_t i = 0; i < a.size(); ++i) s += a[i] * b[i];
    return s;
}

// B x  for symmetric B stored row-major.
sVector matVec(const std::vector<sVector>& B, const sVector& x)
{
    const std::size_t n = x.size();
    sVector y(n, 0.0);
    for (std::size_t i = 0; i < n; ++i)
    {
        scalar s = 0.0;
        for (std::size_t j = 0; j < n; ++j) s += B[i][j] * x[j];
        y[i] = s;
    }
    return y;
}

} // anonymous namespace

SQPResult sqp(const SQPEvaluator& eval,
              const sVector&      x0,
              const sVector&      lo,
              const sVector&      hi,
              std::size_t         nEq,
              std::size_t         nIneq,
              const SQPOptions&   opts)
{
    const std::size_t n = x0.size();

    SQPResult R;
    R.x = x0;

    int evalCount = 0;
    auto E = [&](const sVector& x) -> SQPResponse {
        ++evalCount;
        return eval(x);
    };

    // typical-magnitude vector for FD steps
    sVector typX = opts.typX;
    if (typX.size() != n) typX.assign(n, 1.0);

    // ----------------------------------------------------------------------
    //  FD gradients of f AND every constraint from ONE perturbation per var.
    //    forward  : n+1 evaluations (base + n)
    //    central  : 2n evaluations
    //  Returns gradF (n), Jh (nEq x n), Jg (nIneq x n), and the base response.
    // ----------------------------------------------------------------------
    auto gradients = [&](const sVector& x, const SQPResponse& base,
                         sVector& gradF,
                         std::vector<sVector>& Jh,
                         std::vector<sVector>& Jg)
    {
        gradF.assign(n, 0.0);
        Jh.assign(nEq,   sVector(n, 0.0));
        Jg.assign(nIneq, sVector(n, 0.0));

        for (std::size_t j = 0; j < n; ++j)
        {
            const scalar h = opts.fdStep * std::max(std::abs(x[j]), typX[j]);
            sVector xp = x; xp[j] = x[j] + h;
            SQPResponse rp = E(xp);

            if (opts.central)
            {
                sVector xm = x; xm[j] = x[j] - h;
                SQPResponse rm = E(xm);
                gradF[j] = (rp.f - rm.f) / (2.0 * h);
                for (std::size_t i = 0; i < nEq;   ++i)
                    Jh[i][j] = (rp.h[i] - rm.h[i]) / (2.0 * h);
                for (std::size_t i = 0; i < nIneq; ++i)
                    Jg[i][j] = (rp.g[i] - rm.g[i]) / (2.0 * h);
            }
            else
            {
                gradF[j] = (rp.f - base.f) / h;
                for (std::size_t i = 0; i < nEq;   ++i)
                    Jh[i][j] = (rp.h[i] - base.h[i]) / h;
                for (std::size_t i = 0; i < nIneq; ++i)
                    Jg[i][j] = (rp.g[i] - base.g[i]) / h;
            }
        }
    };

    // Gradient of the Lagrangian:
    //   grad L = grad f + sum_j lamEq_j grad h_j + sum_k lamIneq_k grad g_k
    auto gradLagr = [&](const sVector& gradF,
                        const std::vector<sVector>& Jh,
                        const std::vector<sVector>& Jg,
                        const sVector& lamEq, const sVector& lamIneq) -> sVector
    {
        sVector gL = gradF;
        for (std::size_t i = 0; i < nEq; ++i)
            for (std::size_t j = 0; j < n; ++j) gL[j] += lamEq[i]  * Jh[i][j];
        for (std::size_t i = 0; i < nIneq; ++i)
            for (std::size_t j = 0; j < n; ++j) gL[j] += lamIneq[i] * Jg[i][j];
        return gL;
    };

    // L1 merit  phi = f + mu (sum|h| + sum max(0,g)).
    auto merit = [&](const SQPResponse& r, scalar mu) -> scalar {
        scalar pen = 0.0;
        for (scalar hv : r.h) pen += std::abs(hv);
        for (scalar gv : r.g) pen += std::max(0.0, gv);
        return r.f + mu * pen;
    };

    // ----------------------------------------------------------------------
    //  Damped-BFGS Hessian of the LAGRANGIAN (NOT of the objective).
    //
    //  STUDENT-ERROR ALERT: a frequent mistake is to BFGS-update the
    //  objective Hessian (y = grad f(x+) - grad f(x)).  That is WRONG for a
    //  constrained problem -- the SQP Hessian is the Hessian of the
    //  LAGRANGIAN, so y uses grad L with the SAME multipliers lambda+ at
    //  both points (N&W eq. 18.13).  Using grad f instead silently solves
    //  the wrong QP and stalls on active constraints.
    // ----------------------------------------------------------------------
    std::vector<sVector> B(n, sVector(n, 0.0));
    for (std::size_t i = 0; i < n; ++i) B[i][i] = 1.0;   // B0 = I

    // Initial point + checks.
    SQPResponse base = E(R.x);
    if (!base.ok)
    {
        R.reason   = "infeasible/failed start -- the model could not be"
                     " evaluated at x0 (SQP v1 refuses to guess a feasible"
                     " start; fix the initial point)";
        R.converged = false;
        R.evaluations = evalCount;
        return R;
    }

    sVector lamEq(nEq, 0.0), lamIneq(nIneq, 0.0);
    scalar  mu = 0.0;

    int it = 0;
    for (; it < opts.maxIter; ++it)
    {
        // --- linearise ---
        sVector gradF;
        std::vector<sVector> Jh, Jg;
        gradients(R.x, base, gradF, Jh, Jg);

        // --- build + solve the QP step ---
        //   min 0.5 d^T B d + gradF^T d
        //   s.t. Jh d + h = 0,   Jg d + g <= 0,   lo-x <= d <= hi-x
        QPProblem qp;
        qp.B = B;
        qp.g = gradF;
        qp.Aeq = Jh;
        qp.beq = base.h;                 // Jh d + h = 0
        qp.Aineq = Jg;
        qp.bineq = base.g;               // Jg d + g <= 0

        // Box bounds on the step folded in as inequality rows.  Remember,
        // per bound row, the variable index and the sign of e_j it carries
        // (+1 for an upper bound, -1 for a lower bound) so the stationarity
        // test can add the bound multiplier into grad L (an active box bound
        // is a genuine active constraint, not a free direction).
        const std::size_t mUser = nIneq;
        std::vector<std::pair<std::size_t, scalar>> boundRow;   // (j, sign)
        for (std::size_t j = 0; j < n; ++j)
        {
            if (hi[j] < kInf)
            {
                sVector row(n, 0.0); row[j] = 1.0;
                qp.Aineq.push_back(row);
                qp.bineq.push_back(R.x[j] - hi[j]);   // d_j <= hi - x
                boundRow.emplace_back(j, 1.0);
            }
            if (lo[j] > -kInf)
            {
                sVector row(n, 0.0); row[j] = -1.0;
                qp.Aineq.push_back(row);
                qp.bineq.push_back(lo[j] - R.x[j]);   // -d_j <= x - lo
                boundRow.emplace_back(j, -1.0);
            }
        }

        QPResult QP;
        try
        {
            QP = activeSetQP(qp);
        }
        catch (const std::exception& ex)
        {
            R.reason   = std::string("QP subproblem failed: ") + ex.what();
            R.converged = false;
            // Populate the KKT/feasibility fields at the CURRENT (failed)
            // iterate so the caller never prints a stale all-zeros
            // "certificate".  Stationarity cannot be measured (no valid QP
            // multipliers), so flag it as unavailable; the primal feasibility
            // of the point we are stuck at IS measurable and must be shown.
            R.kktStat = std::numeric_limits<scalar>::quiet_NaN();
            R.kktFeasEq = 0.0;
            for (scalar hv : base.h) R.kktFeasEq = std::max(R.kktFeasEq, std::abs(hv));
            R.kktFeasIneq = 0.0;
            for (scalar gv : base.g) R.kktFeasIneq = std::max(R.kktFeasIneq, std::max(0.0, gv));
            R.kktCompl = std::numeric_limits<scalar>::quiet_NaN();
            R.kktDualFeas = std::numeric_limits<scalar>::quiet_NaN();
            break;
        }

        const sVector& d = QP.d;
        // QP multipliers: equalities + the USER inequalities (drop the bound
        // rows for the Lagrangian/merit -- box bounds are not response cons).
        sVector lamEqNew = QP.lambdaEq;
        sVector lamIneqNew(nIneq, 0.0);
        for (std::size_t k = 0; k < mUser; ++k) lamIneqNew[k] = QP.lambdaIneq[k];

        // --- KKT test at the current point (using the NEW multipliers) ---
        sVector gL = gradLagr(gradF, Jh, Jg, lamEqNew, lamIneqNew);
        // Add the active box-bound multipliers: row r (r>=mUser) carries
        // sign*e_j, so it contributes lambda_r * sign to grad L component j.
        for (std::size_t r = 0; r < boundRow.size(); ++r)
        {
            const std::size_t row = mUser + r;
            if (row < QP.lambdaIneq.size())
                gL[boundRow[r].first] += QP.lambdaIneq[row] * boundRow[r].second;
        }
        const scalar kktStat   = normInf(gL);
        scalar kktFeasEq = 0.0;
        for (scalar hv : base.h) kktFeasEq = std::max(kktFeasEq, std::abs(hv));
        scalar kktFeasIneq = 0.0;
        for (scalar gv : base.g) kktFeasIneq = std::max(kktFeasIneq, std::max(0.0, gv));
        scalar kktCompl = 0.0;
        for (std::size_t k = 0; k < nIneq; ++k)
            kktCompl = std::max(kktCompl, std::abs(lamIneqNew[k] * base.g[k]));
        scalar kktDual = 0.0;
        for (std::size_t k = 0; k < nIneq; ++k)
            kktDual = std::max(kktDual, std::max(0.0, -lamIneqNew[k]));

        const scalar dnorm = std::sqrt(dotv(d, d));

        const bool kktOK =
               kktStat     <= opts.tolStat
            && kktFeasEq   <= opts.tolFeasEq
            && kktFeasIneq <= opts.tolFeasIneq
            && kktCompl    <= opts.tolCompl;

        if (kktOK || dnorm < 1.0e-12)
        {
            lamEq = lamEqNew; lamIneq = lamIneqNew;
            R.kktStat = kktStat; R.kktFeasEq = kktFeasEq;
            R.kktFeasIneq = kktFeasIneq; R.kktCompl = kktCompl;
            R.kktDualFeas = kktDual;
            if (opts.onIter)
            {
                SQPTrace t;
                t.iteration = it; t.x = R.x; t.f = base.f;
                t.h = base.h; t.g = base.g;
                t.lambdaEq = lamEqNew; t.lambdaIneq = lamIneqNew;
                t.gActive.assign(nIneq, false);
                for (std::size_t k = 0; k < nIneq; ++k)
                    t.gActive[k] = (k < QP.active.size()) ? QP.active[k] : false;
                t.kktStat = kktStat; t.kktFeasEq = kktFeasEq;
                t.kktFeasIneq = kktFeasIneq; t.kktCompl = kktCompl;
                t.mu = mu; t.alpha = 0.0; t.theta = 1.0;
                t.note = kktOK ? "KKT satisfied" : "QP step ~ 0";
                opts.onIter(t);
            }
            R.converged = kktOK;
            R.reason = kktOK ? "KKT conditions satisfied"
                             : "QP step vanished before KKT met"
                               " (likely FD-gradient noise floor)";
            break;
        }

        // --- raise the merit penalty mu monotonically (N&W 18.36) ---
        const scalar lamInf = std::max(normInf(lamEqNew), normInf(lamIneqNew));
        const scalar muNeeded = opts.muSafety * lamInf;
        if (muNeeded > mu) mu = muNeeded;
        if (mu < 1.0e-8) mu = 1.0e-8;     // floor so the merit penalises at all

        // --- merit directional derivative D(phi; d)  (N&W eq. 18.29) ---
        //   D = gradF^T d - mu (sum|h| + sum max(0,g))
        scalar penNow = 0.0;
        for (scalar hv : base.h) penNow += std::abs(hv);
        for (scalar gv : base.g) penNow += std::max(0.0, gv);
        const scalar Dphi = dotv(gradF, d) - mu * penNow;

        // --- watchdog: every K iters force the full step (Maratos relief) ---
        const bool watchdog = (opts.watchdogEvery > 0)
                            && (it > 0) && (it % opts.watchdogEvery == 0);

        // --- Armijo backtracking on the L1 merit ---
        const scalar phi0 = merit(base, mu);
        scalar alpha = 1.0;
        sVector xTrial(n);
        SQPResponse rTrial;
        bool accepted = false;
        bool fullRejectedThoughFeasImproved = false;

        while (alpha >= opts.alphaMin)
        {
            for (std::size_t j = 0; j < n; ++j) xTrial[j] = R.x[j] + alpha * d[j];
            rTrial = E(xTrial);
            if (!rTrial.ok) { alpha *= 0.5; continue; }

            const scalar phiT = merit(rTrial, mu);

            if (watchdog && alpha == 1.0)
            {
                accepted = true; break;       // forced full step
            }
            if (phiT <= phi0 + opts.armijoC1 * alpha * Dphi)
            {
                accepted = true; break;
            }
            // Track the Maratos symptom: the full step improved feasibility
            // yet the merit rejected it (the classic Maratos effect).
            if (alpha == 1.0)
            {
                scalar feasNow = 0.0, feasTrial = 0.0;
                for (scalar hv : base.h)   feasNow   += std::abs(hv);
                for (scalar gv : base.g)   feasNow   += std::max(0.0, gv);
                for (scalar hv : rTrial.h) feasTrial += std::abs(hv);
                for (scalar gv : rTrial.g) feasTrial += std::max(0.0, gv);
                if (feasTrial < feasNow) fullRejectedThoughFeasImproved = true;
            }
            alpha *= 0.5;
        }

        if (!accepted)
        {
            // No decrease found.  Honest stop.
            R.reason = "line search failed -- no merit decrease above"
                       " alphaMin (FD-gradient noise or a too-flat merit)";
            R.converged = false;
            // keep current iterate
            R.kktStat = kktStat; R.kktFeasEq = kktFeasEq;
            R.kktFeasIneq = kktFeasIneq; R.kktCompl = kktCompl;
            R.kktDualFeas = kktDual;
            break;
        }

        // --- damped-BFGS update of the LAGRANGIAN Hessian (Powell 1978) ---
        // s = x+ - x ;  y = gradL(x+, lambda+) - gradL(x, lambda+)
        // (SAME lambda+ at both points -- the Powell/N&W rule).
        sVector s(n);
        for (std::size_t j = 0; j < n; ++j) s[j] = xTrial[j] - R.x[j];

        // gradL at the new point uses the new gradients there.
        sVector gradFnew;
        std::vector<sVector> JhNew, JgNew;
        gradients(xTrial, rTrial, gradFnew, JhNew, JgNew);
        sVector gLnew = gradLagr(gradFnew, JhNew, JgNew, lamEqNew, lamIneqNew);
        sVector gLold = gradLagr(gradF,    Jh,    Jg,    lamEqNew, lamIneqNew);
        sVector y(n);
        for (std::size_t j = 0; j < n; ++j) y[j] = gLnew[j] - gLold[j];

        const sVector Bs  = matVec(B, s);
        const scalar  sBs = dotv(s, Bs);
        const scalar  sy  = dotv(s, y);

        scalar theta = 1.0;
        bool   skipped = false;
        if (sBs > 1.0e-14)
        {
            theta = (sy >= 0.2 * sBs) ? 1.0
                                      : (0.8 * sBs) / (sBs - sy);
            sVector r(n);
            for (std::size_t j = 0; j < n; ++j)
                r[j] = theta * y[j] + (1.0 - theta) * Bs[j];
            const scalar sr = dotv(s, r);
            if (sr > 1.0e-14)
            {
                // B += -(Bs Bs^T)/(s^T B s) + (r r^T)/(s^T r)
                for (std::size_t i = 0; i < n; ++i)
                    for (std::size_t j = 0; j < n; ++j)
                        B[i][j] += -(Bs[i] * Bs[j]) / sBs
                                 +  (r[i]  * r[j])  / sr;
            }
            else
            {
                skipped = true;
            }
        }
        else
        {
            skipped = true;
        }

        // --- trace ---
        if (opts.onIter)
        {
            SQPTrace t;
            t.iteration = it; t.x = R.x; t.f = base.f;
            t.h = base.h; t.g = base.g;
            t.lambdaEq = lamEqNew; t.lambdaIneq = lamIneqNew;
            t.gActive.assign(nIneq, false);
            for (std::size_t k = 0; k < nIneq; ++k)
                t.gActive[k] = (k < QP.active.size()) ? QP.active[k] : false;
            t.kktStat = kktStat; t.kktFeasEq = kktFeasEq;
            t.kktFeasIneq = kktFeasIneq; t.kktCompl = kktCompl;
            t.theta = theta; t.bfgsSkipped = skipped;
            t.mu = mu; t.alpha = alpha; t.watchdog = watchdog;
            if (skipped)
                t.note = "BFGS skipped -- curvature condition violated,"
                         " likely gradient noise";
            else if (fullRejectedThoughFeasImproved)
                t.note = "Maratos: full step improved feasibility but the"
                         " merit rejected it (watchdog is the only v1 relief)";
            opts.onIter(t);
        }

        // --- accept the step ---
        R.x   = xTrial;
        base  = rTrial;
        lamEq = lamEqNew; lamIneq = lamIneqNew;
    }

    R.f = base.f;
    R.lambdaEq = lamEq;
    R.lambdaIneq = lamIneq;
    R.iterations = it;
    R.evaluations = evalCount;
    if (it >= opts.maxIter && R.reason.empty())
        R.reason = "maxIter reached without KKT satisfaction";
    // feasibility flag at the returned point
    scalar fe = 0.0, fi = 0.0;
    for (scalar hv : base.h) fe = std::max(fe, std::abs(hv));
    for (scalar gv : base.g) fi = std::max(fi, std::max(0.0, gv));
    R.feasible = (fe <= 1.0e-4 && fi <= 1.0e-4);
    return R;
}

// ===========================================================================
//  verifySQP -- Hock-Schittkowski analytic self-checks (merge-blocking).
// ===========================================================================
namespace {

// Wrap an analytic NLP (objective + constraints) into an SQPEvaluator.
// Gradients are taken by FD-of-analytic inside sqp(), so we only need the
// scalar response here -- this isolates the SQP ALGORITHM from any simulator.
struct HSProblem
{
    std::string                                   name;
    std::function<scalar(const sVector&)>         f;
    std::vector<std::function<scalar(const sVector&)>> h;   // equalities = 0
    std::vector<std::function<scalar(const sVector&)>> g;   // inequalities <= 0
    sVector lo, hi, x0;
    scalar  fStar;        // published optimum objective
    sVector xStar;        // published optimum point (for reporting)
};

scalar solveHS(const HSProblem& p, int verbosity)
{
    auto eval = [&](const sVector& x) -> SQPResponse {
        SQPResponse r;
        r.f = p.f(x);
        r.h.reserve(p.h.size());
        for (const auto& hj : p.h) r.h.push_back(hj(x));
        r.g.reserve(p.g.size());
        for (const auto& gk : p.g) r.g.push_back(gk(x));
        r.ok = std::isfinite(r.f);
        return r;
    };

    SQPOptions o;
    o.maxIter = 100;
    o.central = true;          // tight analytic FD for the self-check
    o.fdStep  = 1.0e-6;

    SQPResult R = sqp(eval, p.x0, p.lo, p.hi, p.h.size(), p.g.size(), o);

    const scalar fErr = std::abs(R.f - p.fStar);

    if (verbosity >= 3)
    {
        std::cout << "  [verifySQP] " << std::left << std::setw(6) << p.name
                  << std::right
                  << "  f* = " << std::setprecision(8) << std::fixed << R.f
                  << "  (published " << p.fStar << ")"
                  << "  |df| = " << std::scientific << std::setprecision(2)
                  << fErr
                  << "  it=" << R.iterations << "  eval=" << R.evaluations
                  << "  " << (R.converged ? "CONVERGED" : "stopped:" + R.reason)
                  << "\n";
    }

    if (!(fErr < 1.0e-4))
        throw std::runtime_error(
            "verifySQP FAILED on " + p.name + ": optimum f=" + std::to_string(R.f)
            + " vs published " + std::to_string(p.fStar) + " (|df|="
            + std::to_string(fErr) + " > 1e-4).  The SQP (BFGS/merit/"
            "active-set) has a bug -- FIX it, do NOT loosen the tolerance.");

    return fErr;
}

} // anonymous namespace

scalar verifySQP(int verbosity)
{
    scalar worst = 0.0;

    // ---- HS35 (Beale): min  9 - 8x1 - 6x2 - 4x3
    //                         + 2x1^2 + 2x2^2 + x3^2
    //                         + 2x1x2 + 2x1x3
    //      s.t.  x1 + x2 + 2x3 <= 3,   x>=0.
    //      Optimum f* = 1/9 = 0.111111 at (4/3, 7/9, 4/9).
    {
        HSProblem p;
        p.name = "HS35";
        p.f = [](const sVector& x) {
            return 9.0 - 8*x[0] - 6*x[1] - 4*x[2]
                 + 2*x[0]*x[0] + 2*x[1]*x[1] + x[2]*x[2]
                 + 2*x[0]*x[1] + 2*x[0]*x[2];
        };
        p.g = {
            [](const sVector& x){ return x[0] + x[1] + 2*x[2] - 3.0; }, // <=0
        };
        p.lo = {0.0, 0.0, 0.0};
        p.hi = {kInf, kInf, kInf};
        p.x0 = {0.5, 0.5, 0.5};
        p.fStar = 1.0/9.0;
        p.xStar = {4.0/3.0, 7.0/9.0, 4.0/9.0};
        worst = std::max(worst, solveHS(p, verbosity));
    }

    // ---- HS21: min  0.01 x1^2 + x2^2 - 100
    //      s.t.  10 x1 - x2 >= 10   (i.e. -(10x1 - x2 - 10) <= 0)
    //            2 <= x1 <= 50,  -50 <= x2 <= 50.
    //      Optimum f* = -99.96 at (2, 0).
    {
        HSProblem p;
        p.name = "HS21";
        p.f = [](const sVector& x){ return 0.01*x[0]*x[0] + x[1]*x[1] - 100.0; };
        p.g = {
            [](const sVector& x){ return -(10.0*x[0] - x[1] - 10.0); }, // <=0
        };
        p.lo = {2.0, -50.0};
        p.hi = {50.0, 50.0};
        p.x0 = {-1.0, -1.0};        // clipped into bounds by the box rows
        // HS21 standard start is (-1,-1); but lo clips x1 to >=2 in the QP.
        p.x0 = {2.0, 0.5};          // a benign in-bounds start
        p.fStar = -99.96;
        p.xStar = {2.0, 0.0};
        worst = std::max(worst, solveHS(p, verbosity));
    }

    // ---- HS71: min  x1 x4 (x1 + x2 + x3) + x3
    //      s.t.  x1 x2 x3 x4 >= 25            (-(prod-25) <= 0)
    //            x1^2 + x2^2 + x3^2 + x4^2 = 40   (equality)
    //            1 <= xi <= 5.
    //      Optimum f* = 17.0140173 at (1, 4.743, 3.821, 1.379).
    {
        HSProblem p;
        p.name = "HS71";
        p.f = [](const sVector& x){
            return x[0]*x[3]*(x[0]+x[1]+x[2]) + x[2];
        };
        p.h = {
            [](const sVector& x){
                return x[0]*x[0]+x[1]*x[1]+x[2]*x[2]+x[3]*x[3] - 40.0;
            },
        };
        p.g = {
            [](const sVector& x){ return 25.0 - x[0]*x[1]*x[2]*x[3]; }, // <=0
        };
        p.lo = {1.0, 1.0, 1.0, 1.0};
        p.hi = {5.0, 5.0, 5.0, 5.0};
        p.x0 = {1.0, 5.0, 5.0, 1.0};   // the classic HS71 start
        p.fStar = 17.0140173;
        p.xStar = {1.0, 4.743, 3.821, 1.379};
        worst = std::max(worst, solveHS(p, verbosity));
    }

    return worst;
}

} // namespace Choupo::solver
