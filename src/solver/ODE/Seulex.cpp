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

#include "Seulex.H"
#include "ODEJacobianAudit.H"
#include "Jacobian.H"
#include "../LU.H"
#include "../SparseLU.H"

#include <algorithm>
#include <cmath>
#include <iostream>
#include <memory>
#include <stdexcept>
#include <string>

namespace Choupo::solver
{

namespace
{
//  The step-number sequence n_1, n_2, ... and the number of columns km.
//  Column j is the linearly-implicit Euler method with n_j sub-steps of H/n_j.
//  seulex.f offers NSEQU = 1: 1,2,3,4,6,8,12,...; NSEQU = 2 (ITS DEFAULT):
//  2,3,4,6,8,12,16,...; each term after the second is twice the one two before.
//  SEQUENCE: NSEQU = 1 (measured on nox03 / nox02 / ignition01, README of
//  docs/reviews/2026-11-22-seulex).
constexpr int    kMaxColumns = 12;
constexpr int    kSeq[kMaxColumns + 1] = {0, 1, 2, 3, 4, 6, 8, 12, 16, 24, 32, 48, 64};

//  Controller constants: the DEFAULTS of Hairer's seulex.f (WORK(4)..WORK(9)).
constexpr scalar kFac1  = 0.1;     // lower limit of the step-size factor (power 1/k)
constexpr scalar kFac2  = 4.0;     // upper limit
constexpr scalar kSafe1 = 0.6;     // safety on the error
constexpr scalar kSafe2 = 0.93;    // safety on the step
constexpr scalar kFac3  = 0.7;     // order decrease when W(k-1) < W(k) * fac3
constexpr scalar kFac4  = 0.9;     // order increase when W(k) < W(k-1) * fac4
//  The convergence monitor's threshold THET = min(1e-4, rtol) (seulex.f
//  WORK(3)); ODEControls::jacobianRedo overrides it.

//  ---- the dense output of the extrapolated step (C473 h) ----------------
//  Hairer & Wanner II, IV.9 (after Hairer & Ostermann, "Dense output for
//  extrapolation methods", Numer. Math. 58 (1990) 419-439): the polynomial is
//  built from the SAME sub-steps the step took.  Column j has the sub-step
//  values Y_{j,l} at t0 + l H/n_j, l = 0 .. n_j (Y_{j,0} = y0, Y_{j,n_j} =
//  T_{j,1}).  A finite difference of order mu of these values,
//      (n_j)^mu Delta^mu Y_{j,l0} = H^mu y^(mu)(t0 + l0 h_j) + O(H^(mu+1)),
//  has an EXPANSION IN POWERS OF h_j = H/n_j -- the same expansion the
//  extrapolation of the solution uses -- so the Aitken-Neville recursion of
//  the tableau,
//      D_{j,l} = D_{j,l-1} + (D_{j,l-1} - D_{j-1,l-1}) / (n_j/n_{j-l+1} - 1),
//  applied to the columns that have enough sub-steps, gives the scaled
//  derivative D_mu ~ H^mu y^(mu) at an END of the step.  Two ends are used:
//    * the RIGHT end, backward differences Delta^mu Y_{j,n_j} (D^R_mu), where
//      the sub-steps have tracked the slow manifold;
//    * the LEFT end, forward differences from the sub-step l0 = 1 (D^L_mu),
//      skipping the first sub-step because the accepted state y0 sits off the
//      manifold by the step's tolerance and a fast component decays from that
//      offset in it (taken at l0 = 0 the offset is multiplied by n_j^mu).
//  The polynomial of degree mL + mR + 1 in s,
//      p(s) = y0 + sum_{mu=1..mL} (D^L_mu / mu!) s^mu
//             + s^(mL+1) sum_{k=0..mR} q_k (s-1)^k,
//  has p(0) = y0 and p^(mu)(0) = D^L_mu / H^mu, and the q_k are fixed by
//  p(1) = y1 = T_{kc,kc} and p^(mu)(1) = D^R_mu / H^mu, mu = 1..mR: Hermite
//  data at both ends, taken from sub-steps instead of f(y).  mL = mR = 4
//  (kMaxDeriv, and at most kc - 1).  Higher differences multiply the stiff
//  Euler lag of the sub-steps by n_j^mu, so the order is a measured
//  compromise (nox03, grid error against a tight reference at rtol 1e-8 /
//  1e-10: mu <= 1: 1.6e-3 / 3.4e-3; 2: 2.3e-4 / 1.4e-3; 4: 2.4e-4 / 2.2e-4;
//  6: 2.4e-4 / 1.3e-3; one-sided at the start, mu <= 10: 1.5e-1).  Nothing is
//  multiplied by lambda h, and every coefficient is a combination of sub-step
//  VALUES of the same iteration, so a linear invariant of the system is
//  carried by every sub-step, hence by every difference and by p.
//  The interpolant's own error is NOT fed back into the step size: doing so
//  (tried: tolerance 10 on the scaled |p_m - p_(m-1)| at s = 1/2) took 695
//  accepted steps for nox03 against 95, the cost of Rodas4, and moved every
//  step end.
constexpr int kMaxDeriv = 4;       // the highest derivative order at each end

class SeulexDense final : public ODEDenseOutput
{
public:
    //  head[j] = Y_{j,0..min(n_j, kMaxDeriv + 1)}, tail[j] = the LAST
    //  min(n_j, kMaxDeriv) + 1 sub-step values of column j (tail[j].back() =
    //  Y_{j,n_j}), j = 1 .. kc.
    SeulexDense(scalar t0, scalar h, const sVector& y0, const sVector& y1,
                const std::vector<std::vector<sVector>>& head,
                const std::vector<std::vector<sVector>>& tail, int kc)
    {
        tStart_ = t0; h_ = h;
        n_ = y0.size();
        const std::size_t n = n_;
        //  the left Taylor coefficients a_[mu] = D^L_mu / mu! (mu = 1..mL)
        const int mL = leftOrder(kc), mR = rightOrder(kc);
        mL_ = mL; mR_ = mR;
        y0_ = y0;
        aL_.assign(mL + 1, sVector(n, 0.0));
        scalar fact = 1.0;
        for (int mu = 1; mu <= mL; ++mu)
        {
            fact *= mu;
            const sVector D = extrapolatedDifference(head, kc, mu, /*left*/ true);
            for (std::size_t i = 0; i < n; ++i) aL_[mu][i] = D[i] / fact;
        }
        //  the right Taylor coefficients b_[mu] = D^R_mu / mu!, b_[0] = y1
        std::vector<sVector> bR(mR + 1, sVector(n, 0.0));
        bR[0] = y1;
        fact = 1.0;
        for (int mu = 1; mu <= mR; ++mu)
        {
            fact *= mu;
            const sVector D = extrapolatedDifference(tail, kc, mu, /*left*/ false);
            for (std::size_t i = 0; i < n; ++i) bR[mu][i] = D[i] / fact;
        }
        //  r(s) = Taylor_R(s) - T_L(s) in u = s - 1, to degree mR: the left
        //  polynomial T_L(s) = y0 + sum a_mu s^mu re-expanded about s = 1
        //  (s = 1 + u: s^mu = sum_k C(mu,k) u^k), r_k = b_k - [T_L]_k.
        std::vector<sVector> r(mR + 1, sVector(n, 0.0));
        for (int k = 0; k <= mR; ++k)
        {
            for (std::size_t i = 0; i < n; ++i)
            {
                scalar tl = (k == 0) ? y0[i] : 0.0;
                for (int mu = std::max(k, 1); mu <= mL; ++mu)
                    tl += binom(mu, k) * aL_[mu][i];
                r[k][i] = bR[k][i] - tl;
            }
        }
        //  q(u) = r(u) / (1+u)^(mL+1) truncated at u^mR: coefficients of
        //  (1+u)^(-(mL+1)) are C(-(mL+1), i) = (-1)^i C(mL+i, i).
        q_.assign(mR + 1, sVector(n, 0.0));
        for (int k = 0; k <= mR; ++k)
            for (int i = 0; i <= k; ++i)
            {
                const scalar w = ((i % 2) ? -1.0 : 1.0) * binom(mL + i, i);
                for (std::size_t c = 0; c < n; ++c) q_[k][c] += w * r[k - i][c];
            }
    }
    void eval(scalar s, sVector& y) const override
    {
        y.resize(n_);
        const scalar u = s - 1.0;
        const scalar sp = std::pow(s, mL_ + 1);
        for (std::size_t i = 0; i < n_; ++i)
        {
            scalar pl = 0.0;                                   // sum_{mu>=1} a_mu s^(mu-1)
            for (int mu = mL_; mu >= 1; --mu) pl = pl * s + aL_[mu][i];
            scalar pq = 0.0;                                   // sum_k q_k u^k
            for (int k = mR_; k >= 0; --k) pq = pq * u + q_[k][i];
            y[i] = y0_[i] + s * pl + sp * pq;
        }
    }
private:
    static scalar binom(int a, int k)
    {
        scalar b = 1.0;
        for (int l = 0; l < k; ++l) b = b * (a - l) / (l + 1);
        return b;
    }
    //  The highest order available at an end: mu <= kMaxDeriv and at most the
    //  order of the step (kc), and the columns with enough sub-steps must exist.
    //  A left-end order mu is used only where at least TWO columns support it
    //  (n_j >= mu + 1 for j = kc - 1 and kc): from one column the difference is
    //  a raw one-sided Euler quotient, never extrapolated, and on a non-stiff
    //  step it is 10-90x worse than the cubic Hermite it replaces (review of
    //  2026-11-22: Prothero-Robinson at lambda = -1, kc = 2).  With none the
    //  polynomial is the right-end data and y0 alone, which is what Hairer's
    //  seulex.f (CONTEX) does for every step: derivatives at the right end
    //  from the last sub-steps, plus y0 and y1.
    static int leftOrder(int kc)
    {
        int m = 0;
        while (m < std::min(kc - 1, kMaxDeriv) && kc >= 2 && kSeq[kc - 1] >= m + 2) ++m;
        return m;
    }
    static int rightOrder(int kc) { return std::min(kc - 1, kMaxDeriv); }
    //  D_mu ~ H^mu y^(mu) at the left (forward differences from sub-step 1) or
    //  right (backward from the last) end, extrapolated over the columns j >=
    //  jmin that have n_j >= mu + (left ? 1 : 0) sub-steps.
    sVector extrapolatedDifference(const std::vector<std::vector<sVector>>& win,
                                   int kc, int mu, bool left) const
    {
        const std::size_t n = n_;
        const int need = mu + (left ? 1 : 0);
        int jmin = 1;
        while (jmin < kc && kSeq[jmin] < need) ++jmin;
        std::vector<sVector> prev(kc + 1), cur(kc + 1);
        for (int j = jmin; j <= kc; ++j)
        {
            sVector d(n, 0.0);
            scalar bn = 1.0;                                   // C(mu, l)
            const std::size_t last = win[j].size() - 1;
            for (int l = 0; l <= mu; ++l)
            {
                const std::size_t at = left ? std::size_t(1 + l) : last - l;
                const scalar sgn = left ? (((mu - l) % 2) ? -1.0 : 1.0) : ((l % 2) ? -1.0 : 1.0);
                for (std::size_t i = 0; i < n; ++i) d[i] += sgn * bn * win[j][at][i];
                bn = bn * (mu - l) / (l + 1);
            }
            scalar scale = 1.0;
            for (int e = 0; e < mu; ++e) scale *= kSeq[j];
            for (std::size_t i = 0; i < n; ++i) d[i] *= scale;
            prev[j] = std::move(d);
        }
        for (int l = 2; l <= kc - jmin + 1; ++l)
        {
            for (int j = jmin + l - 1; j <= kc; ++j)
            {
                const scalar ratio = scalar(kSeq[j]) / scalar(kSeq[j - l + 1]);
                sVector d(n);
                for (std::size_t i = 0; i < n; ++i)
                    d[i] = prev[j][i] + (prev[j][i] - prev[j - 1][i]) / (ratio - 1.0);
                cur[j] = std::move(d);
            }
            for (int j = jmin + l - 1; j <= kc; ++j) prev[j] = std::move(cur[j]);
        }
        return prev[kc];
    }
    std::size_t n_ = 0;
    int mL_ = 0, mR_ = 0;
    sVector y0_;
    std::vector<sVector> aL_, q_;
};

scalar atolFor(const ODEControls& c, std::size_t i)
{
    if (c.atol.empty()) return 1.0e-12;
    return (i < c.atol.size()) ? c.atol[i] : c.atol.back();
}

bool allFinite(const sVector& v)
{
    for (scalar x : v) if (!std::isfinite(x)) return false;
    return true;
}
} // namespace

ODEStats Seulex::integrate(sVector& y, scalar t0, scalar t1,
                           const DerivFn& fRaw, const ODEControls& ctrl) const
{
    ODEStats st;
    const std::size_t n = y.size();
    const scalar span = t1 - t0;
    if (span <= 0.0) return st;

    if (ctrl.structure && ctrl.structure->declared())
        throw std::runtime_error("seulex: a declared block structure is read by"
            " Rosenbrock23 / Rodas4 only (the block-Thomas solve and the colored"
            " Jacobian are theirs).  Declare `integrator Rosenbrock23;` (or"
            " Rodas4) for that model, or drop the structure.  Refusing.");

    //  Every right-hand side goes through here so that the work is COUNTED.
    const DerivFn f = [&](scalar t, const sVector& yy)
    { ++st.rhsEvals; return fRaw(t, yy); };

    // ---- the OPT-IN analytic Jacobian, dense or sparse (as Rosenbrock23) ---
    ODEAnalyticJacobian* A = (ctrl.analytic && ctrl.analytic->jacobian)
                           ? ctrl.analytic : nullptr;
    const bool SP = A && A->sparse && A->pattern && A->sparseJacobian;
    const std::string owner = (A && !A->owner.empty()) ? A->owner : std::string("seulex");
    if (SP && A->pattern->n != n)
        throw std::runtime_error(owner + ": the sparse Jacobian's pattern is "
            + std::to_string(A->pattern->n) + " x " + std::to_string(A->pattern->n)
            + " for a state of " + std::to_string(n) + ".  Refusing.");
    std::vector<std::size_t> diagPos;
    if (SP)
    {
        diagPos.resize(n);
        for (std::size_t i = 0; i < n; ++i) diagPos[i] = A->pattern->find(i, i);
        if (!A->lu || A->lu->analysedFor() != A->pattern.get())
        {
            A->lu = std::make_shared<SparseLU>();
            A->lu->analyse(A->pattern);
        }
    }

    sVector typ(n, 1.0);
    for (std::size_t i = 0; i < n; ++i)
        typ[i] = std::max(std::abs(y[i]), atolFor(ctrl, i));

    // ---- initial step (Hairer-style, as Rosenbrock23) ----------------------
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
    const scalar hMin = (ctrl.hMin > 0.0) ? ctrl.hMin
                                          : 1.0e-13 * std::max(std::abs(t1), 1.0);
    const scalar hMax = (ctrl.hMax > 0.0) ? ctrl.hMax : span;
    if (h > hMax) h = hMax;

    // ---- the Jacobian, kept ACROSS steps until the monitor asks for a new one
    std::vector<sVector> Jd;            // dense J (analytic dense or finite difference)
    SparseJacobian       SJ;            // sparse J = S + u v^T on the pattern
    std::vector<sVector> JdFromSparse;  // SJ expanded, built only for a dense fallback
    sVector              Td(n, 0.0);    // df/dt
    bool haveJ = false;
    scalar stiffPeak = 0.0;

    //  Build J at (t, y).  The audit of an analytic J runs on its doubling
    //  schedule at the J's that are BUILT (a reused J is not rebuilt, so it is
    //  not re-audited: the schedule counts Jacobians, not steps).
    auto buildJacobian = [&]()
    {
        JdFromSparse.clear();
        if (SP)
        {
            A->sparseJacobian(t, y, f0, typ, SJ);
            const SparsePattern& P = *A->pattern;
            if (SJ.values.size() != P.nnz())
                throw std::runtime_error(owner + ": the sparse Jacobian has "
                    + std::to_string(SJ.values.size()) + " values for a pattern of "
                    + std::to_string(P.nnz()) + ".  Refusing.");
            ++A->jacobians;
            if (A->jacobians >= A->nextAudit)
            {
                sVector sc(n);
                if (A->auditScale) sc = A->auditScale(y);
                if (sc.size() != n)
                    for (std::size_t i = 0; i < n; ++i)
                        sc[i] = std::max(std::abs(y[i]), typ[i]);
                long evals = 0;
                const auto Jref = detail::auditDifference(f, t, y, f0, sc, ctrl, evals);
                A->auditEvals += evals;
                A->nextAudit *= 2;
                detail::auditAnalytic(SJ.dense(P), Jref, t, y, sc, *A);   // may refuse
            }
            const bool r1 = !SJ.u.empty() && !SJ.v.empty();
            const std::vector<std::size_t> blk =
                SJ.blocks.empty() ? std::vector<std::size_t>{0, n} : SJ.blocks;
            std::vector<scalar> vsum(blk.size() - 1, 0.0);
            if (r1)
                for (std::size_t k = 0; k + 1 < blk.size(); ++k)
                    for (std::size_t i = blk[k]; i < blk[k + 1]; ++i) vsum[k] += std::abs(SJ.v[i]);
            std::size_t gk = 0;
            for (std::size_t i = 0; i < n; ++i)              // Gershgorin
            {
                while (i >= blk[gk + 1]) ++gk;
                scalar rs = r1 ? std::abs(SJ.u[i]) * vsum[gk] : 0.0;
                for (std::size_t q = P.rowPtr[i]; q < P.rowPtr[i + 1]; ++q)
                    rs += std::abs(SJ.values[q]);
                stiffPeak = std::max(stiffPeak, rs);
            }
            Td = A->autonomous ? sVector(n, 0.0)
                               : fdDfDt(f, t, y, f0, std::max(span, 1.0));
        }
        else
        {
            if (A)
            {
                Jd = A->jacobian(t, y, f0, typ);
                if (Jd.size() != n)
                    throw std::runtime_error(owner + ": the analytic Jacobian has "
                        + std::to_string(Jd.size()) + " rows for a state of "
                        + std::to_string(n) + ".  Refusing.");
                ++A->jacobians;
                if (A->jacobians >= A->nextAudit)
                {
                    sVector sc(n);
                    if (A->auditScale) sc = A->auditScale(y);
                    if (sc.size() != n)
                        for (std::size_t i = 0; i < n; ++i)
                            sc[i] = std::max(std::abs(y[i]), typ[i]);
                    long evals = 0;
                    const auto Jref = detail::auditDifference(f, t, y, f0, sc, ctrl, evals);
                    A->auditEvals += evals;
                    A->nextAudit *= 2;
                    detail::auditAnalytic(Jd, Jref, t, y, sc, *A);        // may refuse
                }
            }
            else
                Jd = fdJacobianODE(f, t, y, f0, typ);
            Td = (A && A->autonomous) ? sVector(n, 0.0)
                                      : fdDfDt(f, t, y, f0, std::max(span, 1.0));
            scalar m = 0.0;
            for (const auto& row : Jd)
            {
                scalar s = 0.0;
                for (scalar v : row) s += std::abs(v);
                m = std::max(m, s);
            }
            stiffPeak = std::max(stiffPeak, m);
        }
        haveJ = true;
        ++st.jacobians;
    };

    // ---- W = I - hh J: factor once per column, solve for every sub-step -----
    std::vector<sVector>     W;               // dense factor
    std::vector<std::size_t> piv;
    bool    spUsed = false, spR1 = false;     // sparse factor in use / rank-one part
    sVector spQ, spV;                         // q = Ws^{-1} a, v
    std::vector<std::size_t> spBlk;
    std::vector<scalar> spDen;                // 1 + v.q per block

    auto factorDense = [&](scalar hh, const std::vector<sVector>& J) -> bool
    {
        W.assign(n, sVector(n, 0.0));
        for (std::size_t i = 0; i < n; ++i)
            for (std::size_t j = 0; j < n; ++j)
                W[i][j] = (i == j ? 1.0 : 0.0) - hh * J[i][j];
        try { luFactor(W, piv); }
        catch (...) { return false; }
        return true;
    };

    //  The same acceptance as Rosenbrock23's sparse path: the diagonal-pivot
    //  factor is kept on its BACKWARD ERROR (<= 1e-12), else THIS matrix is
    //  factored dense; the rank-one part enters by Sherman-Morrison.
    auto factorW = [&](scalar hh) -> bool
    {
        ++st.factorisations;
        spUsed = false; spR1 = false;
        if (!SP) return factorDense(hh, Jd);
        const SparsePattern& P = *A->pattern;
        sVector Wv(P.nnz());
        for (std::size_t q = 0; q < P.nnz(); ++q) Wv[q] = -hh * SJ.values[q];
        for (std::size_t i = 0; i < n; ++i) Wv[diagPos[i]] += 1.0;
        spUsed = A->lu->factor(Wv);
        ++A->sparseFactorisations;
        if (spUsed)
        {
            const sVector xp = A->lu->solve(sVector(n, 1.0));
            scalar rmax = 0.0, wnorm = 0.0, xnorm = 0.0;
            for (std::size_t i = 0; i < n; ++i)
            {
                scalar s = 0.0, rs = 0.0;
                for (std::size_t q = P.rowPtr[i]; q < P.rowPtr[i + 1]; ++q)
                { s += Wv[q] * xp[P.col[q]]; rs += std::abs(Wv[q]); }
                rmax  = std::max(rmax, std::abs(1.0 - s));
                wnorm = std::max(wnorm, rs);
                xnorm = std::max(xnorm, std::abs(xp[i]));
            }
            const scalar eta = rmax / (wnorm * xnorm + 1.0);
            if (std::isfinite(eta)) A->sparseBackwardErrorMax = std::max(A->sparseBackwardErrorMax, eta);
            if (!(eta <= 1.0e-12)) spUsed = false;
        }
        spR1 = !SJ.u.empty() && !SJ.v.empty();
        if (spUsed && spR1)
        {
            spBlk = SJ.blocks.empty() ? std::vector<std::size_t>{0, n} : SJ.blocks;
            sVector a(n);
            for (std::size_t i = 0; i < n; ++i) a[i] = -hh * SJ.u[i];
            spQ = A->lu->solve(a);
            spV = SJ.v;
            spDen.assign(spBlk.size() - 1, 1.0);
            for (std::size_t k = 0; k + 1 < spBlk.size(); ++k)
            {
                for (std::size_t i = spBlk[k]; i < spBlk[k + 1]; ++i) spDen[k] += spV[i] * spQ[i];
                if (!std::isfinite(spDen[k]) || !(std::abs(spDen[k]) > 1.0e-12)) spUsed = false;
            }
        }
        if (!spUsed)
        {
            ++A->denseFallbacks;
            if (JdFromSparse.empty()) JdFromSparse = SJ.dense(P);
            return factorDense(hh, JdFromSparse);
        }
        return true;
    };

    auto solveW = [&](const sVector& r) -> sVector
    {
        if (!spUsed) return luSolve(W, piv, r);
        sVector x = A->lu->solve(r);
        if (spR1)
            for (std::size_t k = 0; k + 1 < spBlk.size(); ++k)
            {
                scalar vz = 0.0;
                for (std::size_t i = spBlk[k]; i < spBlk[k + 1]; ++i) vz += spV[i] * x[i];
                const scalar c = vz / spDen[k];
                for (std::size_t i = spBlk[k]; i < spBlk[k + 1]; ++i) x[i] -= c * spQ[i];
            }
        return x;
    };

    // ---- the extrapolation tableau and the controller's records -----------
    std::vector<std::vector<sVector>> T(kMaxColumns + 2,
                                        std::vector<sVector>(kMaxColumns + 2));
    //  Work of the first k columns, in units of one right-hand side
    //  (seulex.f's model, Hairer & Wanner IV.9): a Jacobian costs 5, a
    //  factorisation 1, a sub-step (one f and one back-solve) 2.
    //      A_1 = WKJAC + n_1 WKROW + WKDEC,   A_k = A_{k-1} + (n_k - 1) WKROW + WKDEC
    //  (the first sub-step of a column needs only a back-solve, hence n_k - 1).
    constexpr scalar kWkFcn = 1.0, kWkJac = 5.0, kWkDec = 1.0, kWkSol = 1.0;
    constexpr scalar kWkRow = kWkFcn + kWkSol;
    scalar Awork[kMaxColumns + 2] = {};
    Awork[1] = kWkJac + kSeq[1] * kWkRow + kWkDec;
    for (int k = 2; k <= kMaxColumns; ++k)
        Awork[k] = Awork[k - 1] + (kSeq[k] - 1) * kWkRow + kWkDec;
    scalar hh[kMaxColumns + 2] = {};         // step each column's error would allow
    scalar w[kMaxColumns + 2]  = {};         // work per unit step A_k / hh_k
    w[1] = 1.0e30;

    const scalar rtolEff = (ctrl.rtol > 0.0) ? ctrl.rtol : 1.0e-6;
    //  initial target order  max(2, min(km-2, int(0.6 (-log10(rtol + atol)) + 1.5)))
    int kt = std::max(2, std::min(kMaxColumns - 2,
                 int(-std::log10(rtolEff + atolFor(ctrl, 0)) * 0.6 + 1.5)));
    const scalar thet = (ctrl.jacobianRedo > 0.0) ? ctrl.jacobianRedo
                                                   : std::min(1.0e-4, rtolEff);
    scalar theta = 2.0 * thet;               // the monitor; 2 thet forces the first Jacobian
    bool reject = false, firstStep = true, calJac = false;
    scalar err = 0.0, errOld = 0.0;
    scalar hNext = h;
    int kUsedMax = 0;
    long kSum = 0;

    //  the scale of every tolerance test: atol + rtol |y| at the START of the step
    sVector scal(n);
    const auto rescale = [&](const sVector& base)
    {
        for (std::size_t i = 0; i < n; ++i)
            scal[i] = atolFor(ctrl, i) + ctrl.rtol * std::abs(base[i]);
    };
    rescale(y);
    //  Euclidean norm of v / scal, NOT divided by n (the monitor's norm)
    const auto euclid = [&](const sVector& v) -> scalar
    {
        scalar s = 0.0;
        for (std::size_t i = 0; i < n; ++i) { const scalar e = v[i] / scal[i]; s += e * e; }
        return std::sqrt(s);
    };

    //  The first sub-step values of every column of the attempt in progress,
    //  kept only for the dense output (ctrl.onDense): sub[j][l] = Y_{j,l}.
    std::vector<std::vector<sVector>> sub(kMaxColumns + 2), subHead(kMaxColumns + 2);
    scalar h0step = h;                       // the step of the attempt in progress
    //  ---- column j of the table: n_j linearly-implicit Euler sub-steps, the
    //  extrapolation, the error and the step it allows.  Sets atov when the
    //  attempt must be abandoned (singular W, non-finite state, theta > 1,
    //  diverging errors): seulex.f's label 79 -- the caller halves H.
    const auto column = [&](int j, bool& atov) -> void
    {
        atov = true;
        const int  nj = kSeq[j];
        const scalar hj = h0step / nj;
        if (!factorW(hj)) return;
        sVector yy = y, fy = f0, fy1;
        bool haveFy1 = false;
        std::vector<sVector> subJ, headJ;
        if (ctrl.onDense) headJ.push_back(y);                         // Y_{j,0}
        for (int m = 0; m < nj; ++m)
        {
            const scalar tm = t + m * hj;
            if (m > 0) fy = (m == 1 && haveFy1) ? fy1 : f(tm, yy);
            sVector r(n);
            for (std::size_t i = 0; i < n; ++i) r[i] = hj * (fy[i] + hj * Td[i]);
            const sVector delta = solveW(r);
            if (!allFinite(delta)) return;
            if (m == 0 && nj > 1 && j <= 2)
            {
                //  THE CONVERGENCE MONITOR (Hairer & Wanner IV.9; seulex.f "stability
                //  check"): the Newton correction of the BACKWARD Euler equation
                //  d = h f(y + d), formed from the first increment,
                //      x = W^{-1} ( h f(t+h, y_1) + h^2 df/dt - d_0 ),
                //  theta = |x| / max(1, |d_0|), Euclidean norms on the scale
                //  atol + rtol |y|.  Large when J is stale OR the step outruns the
                //  linearisation; above 1 the step is unstable.
                sVector y1(n);
                for (std::size_t i = 0; i < n; ++i) y1[i] = yy[i] + delta[i];
                fy1 = f(t + hj, y1); haveFy1 = true;
                if (!allFinite(fy1)) return;
                sVector rr(n);
                for (std::size_t i = 0; i < n; ++i)
                    rr[i] = hj * (fy1[i] + hj * Td[i]) - delta[i];
                const sVector xc = solveW(rr);
                theta = euclid(xc) / std::max(1.0, euclid(delta));
                if (!std::isfinite(theta)) { theta = 1.0e30; }
                st.thetaMax = std::max(st.thetaMax, theta);
                if (theta > 1.0) return;
            }
            for (std::size_t i = 0; i < n; ++i) yy[i] += delta[i];
            if (ctrl.onDense)
            {
                if (int(headJ.size()) <= kMaxDeriv + 1) headJ.push_back(yy);
                subJ.push_back(yy);                                  // keep the LAST window
                if (int(subJ.size()) > kMaxDeriv + 1) subJ.erase(subJ.begin());
            }
        }
        if (!allFinite(yy)) return;
        T[j][1] = yy;
        if (ctrl.onDense)
        {
            //  a short column: the tail window reaches back to Y_{j,0}
            if (int(subJ.size()) < nj + 1 && int(subJ.size()) < kMaxDeriv + 1)
                subJ.insert(subJ.begin(), y);
            sub[j] = std::move(subJ);
            subHead[j] = std::move(headJ);
        }
        //  extrapolation in h: T_{j,l} from T_{j,l-1} and T_{j-1,l-1}
        for (int l = 2; l <= j; ++l)
        {
            const scalar ratio = scalar(kSeq[j]) / scalar(kSeq[j - l + 1]);
            T[j][l].resize(n);
            for (std::size_t i = 0; i < n; ++i)
                T[j][l][i] = T[j][l - 1][i]
                           + (T[j][l - 1][i] - T[j - 1][l - 1][i]) / (ratio - 1.0);
        }
        if (j == 1) { atov = false; return; }
        //  error of column j: |T_{j,j} - T_{j,j-1}| on the scale of y at the start
        scalar e2 = 0.0;
        for (std::size_t i = 0; i < n; ++i)
        {
            const scalar e = std::min(std::abs(T[j][j][i] - T[j][j - 1][i]) / scal[i], 1.0e15);
            e2 += e * e;
        }
        if (e2 >= 1.0e30) return;
        err = std::sqrt(e2 / static_cast<scalar>(n));
        if (j > 2 && err >= errOld) return;          // the errors are not decreasing: diverging
        errOld = std::max(4.0 * err, 1.0);
        const scalar expo = 1.0 / j;
        const scalar facmin = std::pow(kFac1, expo);
        scalar fac = std::min(kFac2 / facmin,
                              std::max(facmin, std::pow(err / kSafe1, expo) / kSafe2));
        hh[j] = std::min(h0step / fac, hMax);
        w[j]  = Awork[j] / hh[j];
        atov = false;
    };

    bool f0Valid = true;                     // f0 = f(t, y) is current
    while (t < t1 - 1.0e-14 * std::max(std::abs(t1), 1.0))
    {
        if (reject) theta = 2.0 * thet;
        scalar hTry = std::min(std::min(h, t1 - t), hMax);
        const scalar hWanted = std::min(h, hMax);
        bool last = false;
        if (t + 1.01 * hTry > t1) { hTry = t1 - t; last = true; }
        h0step = hTry;
        if (st.steps >= ctrl.maxSteps)
        {
            st.ok = false;
            st.failure = "maxSteps: " + std::to_string(ctrl.maxSteps)
                       + " steps taken without reaching the interval end";
            break;
        }
        if (!f0Valid) { f0 = f(t, y); f0Valid = true; }
        //  J is rebuilt when the monitor says it has aged, unless one was
        //  built since the last accepted step (a rejection with a fresh J
        //  shortens the step instead)
        if (!haveJ || (theta > thet && !calJac)) { buildJacobian(); calJac = true; }
        ++st.steps;

        // ---- one attempt: the columns of the window ---------------------------
        bool atov = false, rej = false, conv = false;
        int  kcur = 0, kcv = 0;
        const bool allColumns = firstStep || last;     // seulex.f: the first and the last step
        firstStep = false;
        if (allColumns)
        {
            for (int j = 1; j <= kt; ++j)
            {
                kcur = j;
                column(j, atov);
                if (atov) break;
                if (j > 1 && err <= 1.0) { conv = true; kcv = j; break; }
            }
        }
        else
        {
            kcur = kt - 1;
            for (int j = 1; j <= kt - 1; ++j) { column(j, atov); if (atov) break; }
            if (!atov)
            {
                //  convergence window, column k-1 (skipped for k = 2 and after a rejection)
                if (!(kt == 2 || reject))
                {
                    if (err <= 1.0) { conv = true; kcv = kt - 1; }
                    else if (err > 4.0 * scalar(kSeq[kt + 1]) * kSeq[kt]) rej = true;
                }
                if (!conv && !rej)
                {
                    kcur = kt;
                    column(kt, atov);
                    if (!atov && err <= 1.0) { conv = true; kcv = kt; }
                }
            }
        }
        //  hope for convergence in column k + 1
        if (!atov && !conv && !rej)
        {
            if (err > 2.0 * kSeq[kt + 1]) rej = true;
            else
            {
                kcur = kt + 1;
                column(kt + 1, atov);
                if (!atov)
                {
                    if (err > 1.0) rej = true;
                    else { conv = true; kcv = kt + 1; }
                }
            }
        }

        if (atov)
        {
            //  label 79: halve H; theta = 2 thet at the next attempt, so a J that
            //  is not fresh is rebuilt
            ++st.rejected;
            reject = true;
            h = hTry * 0.5;
            if (h < hMin)
            {
                st.ok = false;
                st.failure = std::string("hMin: the step fell below the floor after"
                    " a rejected step (singular W, a non-finite state, the convergence"
                    " monitor theta above 1, or diverging errors)");
                break;
            }
            continue;
        }
        if (rej)
        {
            //  label 100: lower the order at the failed column, step = the one
            //  that column allows
            ++st.rejected;
            int kk = std::min(std::min(kt, kcur), kMaxColumns - 1);
            if (kk > 2 && w[kk - 1] < w[kk] * kFac3) --kk;
            kt = kk;
            h = hh[kt];
            reject = true;
            if (h < hMin)
            {
                st.ok = false;
                st.failure = "hMin: the step fell below the floor after a rejected"
                             " step (local error above tolerance)";
                break;
            }
            continue;
        }

        // ---- positivity, as Rosenbrock23 --------------------------------------
        sVector ynew = T[kcv][kcv];
        bool negative = false;
        if (!ctrl.positiveWithinAtol)
            for (std::size_t i = 0; i < ctrl.positiveRows.size() && i < n; ++i)
                if (ctrl.positiveRows[i] && ynew[i] < 0.0 && ynew[i] > -atolFor(ctrl, i)
                    && (y[i] > 0.0 || f0[i] >= 0.0))  // not an empty row still consumed (as Rosenbrock23)
                    ynew[i] = 0.0;
        for (std::size_t i = 0; i < ctrl.positiveRows.size() && i < n; ++i)
            if (ctrl.positiveRows[i]
                && ynew[i] < (ctrl.positiveWithinAtol ? -atolFor(ctrl, i) : 0.0))
            { negative = true; st.negativeRow = i; break; }
        if (negative)
        {
            ++st.rejected;
            reject = true;
            h = hTry * 0.5;
            if (h < hMin)
            {
                st.ok = false;
                st.failure = "hMin: the step fell below the floor after a rejected"
                             " step (a positive row driven negative)";
                break;
            }
            continue;
        }

        // ---- accept: new state, then the next ORDER and STEP -------------------
        std::shared_ptr<const ODEDenseOutput> dense;
        if (ctrl.onDense)
        {
            auto sd = std::make_shared<SeulexDense>(t, hTry, y, ynew, subHead, sub, kcv);
            sd->setStartSlope(f0);
            dense = sd;
        }
        y = ynew; t += hTry; ++st.accepted;
        f0Valid = false;
        calJac = false;
        rescale(y);
        for (std::size_t i = 0; i < n; ++i)
            typ[i] = std::max(std::abs(y[i]), atolFor(ctrl, i));
        kUsedMax = std::max(kUsedMax, kcv);
        kSum += kcv;
        int kopt;
        if (kcv == 2)
        {
            kopt = std::min(3, kMaxColumns - 1);
            if (reject) kopt = 2;
        }
        else if (kcv <= kt)
        {
            kopt = kcv;
            if (w[kcv - 1] < w[kcv] * kFac3) kopt = kcv - 1;
            if (w[kcv] < w[kcv - 1] * kFac4) kopt = std::min(kcv + 1, kMaxColumns - 1);
        }
        else
        {
            kopt = kcv - 1;
            if (kcv > 3 && w[kcv - 2] < w[kcv - 1] * kFac3) kopt = kcv - 2;
            if (w[kcv] < w[kopt] * kFac4) kopt = std::min(kcv, kMaxColumns - 1);
        }
        scalar hProp;
        if (reject)
        {
            kt = std::min(kopt, kcv);
            hProp = std::min(hTry, hh[kt]);
            reject = false;
        }
        else
        {
            if (kopt <= kcv) hProp = hh[kopt];
            else if (kcv < kt && w[kcv] < w[kcv - 1] * kFac4)
                hProp = hh[kcv] * Awork[kopt + 1] / Awork[kcv];
            else
                hProp = hh[kcv] * Awork[kopt] / Awork[kcv];
            kt = kopt;
        }
        h = std::min(hProp, hMax);
        //  A step SHORTENED to land on t1 says little about the step the
        //  controller wanted: bound the next interval's start by it.
        hNext = (hTry < hWanted) ? std::min(hMax, std::min(hWanted, h)) : h;
        if (dense) ctrl.onDense(dense);
        if (ctrl.onAccept) ctrl.onAccept(t, hTry);
        if (ctrl.onAcceptState) ctrl.onAcceptState(t, hTry, y);
    }

    st.tReached  = t;
    st.hLast     = h;
    st.hNext     = hNext;
    st.hMinUsed  = hMin;
    st.stiffness = stiffPeak;

    if (ctrl.verbosity >= 3)
    {
        const scalar hExpl = (stiffPeak > 0.0) ? 2.8 / stiffPeak : 0.0;
        std::cout << "  [ODE] seulex (extrapolated linearly-implicit Euler, order "
                  << kUsedMax << " at most this interval)\n"
                  << "        steps: " << st.accepted << " accepted, "
                  << st.rejected << " rejected;  Jacobians " << st.jacobians
                  << ", factorisations " << st.factorisations
                  << ", right-hand sides " << st.rhsEvals << "\n"
                  << "        |lambda|_max ~ " << stiffPeak << " 1/s"
                  << "   explicit-stable step ~ " << hExpl << " s;"
                  << "  mean order " << (st.accepted ? double(kSum) / st.accepted : 0.0)
                  << ",  theta max " << st.thetaMax << "\n";
        if (!st.ok)
            std::cout << "        WARNING: gave up (step below hMin or maxSteps)\n";
    }
    return st;
}

} // namespace Choupo::solver
