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
    Nocedal & Wright, Numerical Optimization, 2nd ed. (2006),
      Sec. 16.5, Algorithm 16.3 (active-set method for convex QP);
      eq. 16.4 (the equality-constrained KKT system).
\*---------------------------------------------------------------------------*/

#include "ActiveSetQP.H"
#include "NewtonND.H"          // gaussSolve

#include <algorithm>
#include <cmath>
#include <iomanip>
#include <iostream>
#include <numeric>
#include <stdexcept>

namespace Choupo::solver {

namespace {

// row . x
scalar dot(const sVector& row, const sVector& x)
{
    scalar s = 0.0;
    for (std::size_t j = 0; j < row.size(); ++j) s += row[j] * x[j];
    return s;
}

// Solve the equality-constrained KKT system over a working set W
// (all equality rows + the inequality rows flagged active):
//
//     [ B    A_W^T ] [ d      ]   [ -g  ]
//     [ A_W   0    ] [ lambda ] = [ -c_W ]
//
// where c_W are the chosen rows of (A d + b) we hold at zero -- here the
// constants b_W, because we solve for the step d that drives A_W d = -b_W.
// Returns d in `d` and the row multipliers in `lambdaW` (same order as the
// rows were appended: equalities first, then active inequalities).
//
// On a singular KKT matrix gaussSolve throws; we convert that to an honest
// LICQ diagnostic (linearly dependent active constraints).
void solveKKT(const std::vector<sVector>& B,
              const sVector&              g,
              const std::vector<sVector>& Arows,   // the working-set rows
              const sVector&              brows,   // the working-set RHS constants
              sVector&                    d,
              sVector&                    lambdaW)
{
    const std::size_t n = g.size();
    const std::size_t m = Arows.size();
    const std::size_t N = n + m;

    std::vector<sVector> K(N, sVector(N, 0.0));
    sVector rhs(N, 0.0);

    // Top-left B block, top RHS -g.
    for (std::size_t i = 0; i < n; ++i)
    {
        for (std::size_t j = 0; j < n; ++j) K[i][j] = B[i][j];
        rhs[i] = -g[i];
    }
    // A_W^T (top-right) and A_W (bottom-left); bottom RHS -b_W.
    for (std::size_t k = 0; k < m; ++k)
    {
        for (std::size_t j = 0; j < n; ++j)
        {
            K[j][n + k] = Arows[k][j];   // A^T
            K[n + k][j] = Arows[k][j];   // A
        }
        rhs[n + k] = -brows[k];
    }

    sVector sol;
    try
    {
        sol = gaussSolve(K, rhs);
    }
    catch (const std::exception&)
    {
        throw std::runtime_error(
            "activeSetQP: KKT system singular -- active constraints are"
            " linearly dependent (LICQ failure).  Drop a redundant"
            " constraint or check the model.");
    }

    d.assign(sol.begin(), sol.begin() + n);
    lambdaW.assign(sol.begin() + n, sol.end());
}

} // anonymous namespace

QPResult activeSetQP(const QPProblem&         qp,
                     const std::vector<bool>& warmStart,
                     int                      maxIter)
{
    const std::size_t n  = qp.g.size();
    const std::size_t me = qp.Aeq.size();
    const std::size_t mi = qp.Aineq.size();

    if (qp.B.size() != n)
        throw std::runtime_error("activeSetQP: B/g dimension mismatch");
    if (qp.beq.size() != me)
        throw std::runtime_error("activeSetQP: Aeq/beq dimension mismatch");
    if (qp.bineq.size() != mi)
        throw std::runtime_error("activeSetQP: Aineq/bineq dimension mismatch");

    // Active flags for inequality rows.
    std::vector<bool> active(mi, false);
    if (!warmStart.empty())
    {
        if (warmStart.size() != mi)
            throw std::runtime_error("activeSetQP: warmStart size mismatch");
        active = warmStart;
    }

    constexpr scalar feasTol = 1.0e-10;   // inactive-feasibility slack
    constexpr scalar lamTol  = 1.0e-12;   // multiplier-sign deadband

    QPResult R;
    R.lambdaEq.assign(me, 0.0);
    R.lambdaIneq.assign(mi, 0.0);

    // ----------------------------------------------------------------------
    //  Running-point active-set loop (N&W Algorithm 16.3).
    //  We keep a running primal point x (the cumulative step, starting at 0)
    //  and treat constraint values relative to x:
    //      c_k(x) = Aineq[k] . x + bineq[k]
    //  Each iteration the KKT subproblem solves for a sub-step p that keeps
    //  the working-set rows on their bound, using the gradient B x + g.
    //  Equalities are ALWAYS in W, so the first KKT solve drives them to
    //  feasibility (b_eq encodes the linearised constraint residual the SQP
    //  wants removed).
    // ----------------------------------------------------------------------
    sVector x(n, 0.0);

    // Inequalities forbidden from re-entering the working set after a LICQ
    // recovery dropped them (their gradient was linearly dependent on the
    // rest of the working set -- they are IMPLIED by the kept rows, so
    // re-adding them only re-triggers the singular KKT system).  This breaks
    // the drop/re-add cycle that two nearly-parallel constraints would form.
    std::vector<bool> forbidden(mi, false);

    int it = 0;
    for (; it < maxIter; ++it)
    {
        // Working set: equalities (always) + active inequalities.
        std::vector<sVector> Arows;
        sVector              browsZero;   // RHS for the sub-step: hold rows at 0 change
        std::vector<std::size_t> ineqRowOf;
        for (std::size_t k = 0; k < me; ++k)
        {
            Arows.push_back(qp.Aeq[k]);
            // residual of this equality at x: drive it to zero this step
            browsZero.push_back(dot(qp.Aeq[k], x) + qp.beq[k]);
        }
        for (std::size_t k = 0; k < mi; ++k)
            if (active[k])
            {
                Arows.push_back(qp.Aineq[k]);
                // active inequality residual at x (should be ~0); drive to 0
                browsZero.push_back(dot(qp.Aineq[k], x) + qp.bineq[k]);
                ineqRowOf.push_back(k);
            }

        // Gradient of 0.5 x^T B x + g^T x  at x  is  B x + g.
        sVector grad(n, 0.0);
        for (std::size_t i = 0; i < n; ++i)
        {
            scalar s = qp.g[i];
            for (std::size_t j = 0; j < n; ++j) s += qp.B[i][j] * x[j];
            grad[i] = s;
        }

        // Solve KKT for the sub-step p and the multipliers:
        //   [ B  A_W^T ][ p      ] = [ -grad ]
        //   [ A_W  0   ][ lambda ]   [ -res_W ]
        sVector p, lambdaW;
        try
        {
            solveKKT(qp.B, grad, Arows, browsZero, p, lambdaW);
        }
        catch (const std::exception&)
        {
            // Singular KKT.  If the rank deficiency is among the active
            // INEQUALITY rows, recover by dropping the most-recently-added
            // one (a documented LICQ recovery: two active inequalities whose
            // gradients are linearly dependent over n variables -- common
            // when two correlated constraints want to bind at once).  If
            // there is no inequality to drop, the deficiency is in the
            // EQUALITY rows -- a genuine, unrecoverable LICQ failure -- so
            // we let the honest diagnostic propagate.
            if (!ineqRowOf.empty())
            {
                const std::size_t drop = ineqRowOf.back();
                active[drop]    = false;
                forbidden[drop] = true;     // do not let it re-enter this solve
                if (R.reason.empty())
                    R.reason = "LICQ recovery: dropped a linearly-dependent"
                               " active inequality (correlated constraints)";
                continue;
            }
            throw;
        }

        const scalar pnorm =
            std::sqrt(std::inner_product(p.begin(), p.end(), p.begin(), 0.0));

        if (pnorm < 1.0e-12)
        {
            // p == 0: x minimises over the current working set.  Check the
            // inequality multipliers.  Rows are eq first then active ineqs.
            scalar      mostNeg = -lamTol;
            std::size_t dropPos = ineqRowOf.size();   // sentinel
            for (std::size_t r = 0; r < ineqRowOf.size(); ++r)
            {
                const scalar lam = lambdaW[me + r];
                if (lam < mostNeg)
                {
                    mostNeg = lam;
                    dropPos = r;
                }
            }
            if (dropPos == ineqRowOf.size())
            {
                // All active-inequality multipliers >= 0  ->  OPTIMAL.
                R.converged = true;
                R.reason    = "KKT satisfied";
                R.d         = x;
                R.lambdaEq.assign(lambdaW.begin(), lambdaW.begin() + me);
                R.lambdaIneq.assign(mi, 0.0);
                for (std::size_t r = 0; r < ineqRowOf.size(); ++r)
                    R.lambdaIneq[ineqRowOf[r]] = lambdaW[me + r];
                R.active = active;
                R.iterations = it;
                return R;
            }
            // Drop the most-negative-multiplier inequality and continue.
            active[ineqRowOf[dropPos]] = false;
            continue;
        }

        // p != 0: find the max feasible step alpha in (0,1] toward the
        // nearest blocking inactive inequality (N&W eq. 16.41).
        scalar      alpha  = 1.0;
        std::size_t blockK = mi;
        for (std::size_t k = 0; k < mi; ++k)
        {
            if (active[k] || forbidden[k]) continue;   // skip LICQ-dropped rows
            const scalar slope = dot(qp.Aineq[k], p);
            if (slope > feasTol)
            {
                const scalar ck = dot(qp.Aineq[k], x) + qp.bineq[k]; // <= 0
                const scalar a  = -ck / slope;
                if (a < alpha)
                {
                    alpha  = std::max(a, 0.0);
                    blockK = k;
                }
            }
        }

        for (std::size_t i = 0; i < n; ++i) x[i] += alpha * p[i];

        if (blockK != mi)
            active[blockK] = true;   // hit a new constraint; add it to W
    }

    // Fell through the cap -- loud, never silent.
    throw std::runtime_error(
        "activeSetQP: active-set did not settle within " + std::to_string(maxIter)
        + " working-set changes (possible cycling or ill-conditioned QP).");
}

// ---------------------------------------------------------------------------
//  verifyActiveSetQP -- hand-worked QP with a KNOWN active set + multipliers.
// ---------------------------------------------------------------------------
//
//  Test problem (worked by hand, N&W-style):
//      min  f(d) = 0.5(d1^2 + d2^2) - d1 - 2 d2     (B = I, g = (-1,-2))
//      s.t. d1 + d2 <= 1            (row 0)
//           -d1      <= 0           (row 1, i.e. d1 >= 0)
//                -d2 <= 0           (row 2, i.e. d2 >= 0)
//
//  Unconstrained minimiser is (1, 2), infeasible (1+2=3 > 1).
//  With row 0 active: minimise on the line d1+d2=1.  Lagrangian
//      grad f + lam0 * (1,1) = 0  ->  (d1-1, d2-2) = -lam0 (1,1)
//      d1 = 1 - lam0,  d2 = 2 - lam0,  and d1+d2 = 1 -> 3 - 2 lam0 = 1
//      -> lam0 = 1,  d = (0, 1).   Check rows 1,2: -0<=0 ok, -1<=0 ok.
//      lam0 = 1 >= 0  -> KKT satisfied.  Rows 1,2 inactive (lam = 0).
//
//  Known answer:  d* = (0, 1),  active set = {row0},  lambda = (1, 0, 0).
//
scalar verifyActiveSetQP(int verbosity)
{
    QPProblem qp;
    qp.B = {{1.0, 0.0}, {0.0, 1.0}};
    qp.g = {-1.0, -2.0};
    qp.Aineq = {
        { 1.0,  1.0},   // d1 + d2 - 1 <= 0
        {-1.0,  0.0},   // -d1 <= 0
        { 0.0, -1.0},   // -d2 <= 0
    };
    qp.bineq = {-1.0, 0.0, 0.0};

    QPResult R = activeSetQP(qp);

    const sVector dExp   = {0.0, 1.0};
    const sVector lamExp = {1.0, 0.0, 0.0};

    scalar maxErr = 0.0;
    for (std::size_t i = 0; i < dExp.size(); ++i)
        maxErr = std::max(maxErr, std::abs(R.d[i] - dExp[i]));
    for (std::size_t k = 0; k < lamExp.size(); ++k)
        maxErr = std::max(maxErr, std::abs(R.lambdaIneq[k] - lamExp[k]));

    if (verbosity >= 3)
    {
        std::cout << "  [verifyActiveSetQP] d = (" << R.d[0] << ", " << R.d[1]
                  << ")  lambda = (" << R.lambdaIneq[0] << ", "
                  << R.lambdaIneq[1] << ", " << R.lambdaIneq[2] << ")"
                  << "  active{row0}=" << (R.active[0] ? "Y" : "N")
                  << "  maxErr = " << std::scientific << std::setprecision(2)
                  << maxErr << "\n";
    }

    if (!(maxErr < 1.0e-9) || !R.converged)
        throw std::runtime_error(
            "verifyActiveSetQP FAILED: the active-set QP did not reproduce the"
            " hand-worked solution to 1e-9 (maxErr=" + std::to_string(maxErr)
            + ").  ActiveSetQP is BROKEN -- nothing downstream is trustworthy.");

    return maxErr;
}

} // namespace Choupo::solver
