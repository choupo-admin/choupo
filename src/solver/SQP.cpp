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
#include <functional>
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

//  More & Wild (2011) ECnoise, as used by Shi et al. (2021): the noise level of
//  a response from its values at m+1 equally spaced points.  The k-th
//  differences of a smooth function fall like h^k, those of noise do not, so
//  the level k where three successive estimates agree (within a factor 4) and
//  the differences change sign often enough IS the noise.  Returns 0 when no
//  level shows it (the response is smooth at this spacing: no noise seen).
scalar ecNoise(const sVector& f)
{
    const int m = static_cast<int>(f.size()) - 1;
    std::vector<sVector> D(m + 1);
    D[0] = f;
    sVector sig(m + 1, 0.0);
    std::vector<int> flips(m + 1, 0);
    scalar gamma = 1.0;                                  // (k!)^2/(2k)!
    for (int k = 1; k <= m; ++k)
    {
        D[k].resize(m + 1 - k);
        scalar sum2 = 0.0;
        for (int i = 0; i + k <= m; ++i)
        {
            D[k][i] = D[k - 1][i + 1] - D[k - 1][i];
            sum2 += D[k][i] * D[k][i];
        }
        gamma *= static_cast<scalar>(k) / (2.0 * (2.0 * k - 1.0));   // g_k = g_{k-1} k^2/((2k)(2k-1))
        sig[k] = std::sqrt(gamma * sum2 / static_cast<scalar>(m + 1 - k));
        for (int i = 0; i + 1 < m + 1 - k; ++i)
            if (D[k][i] * D[k][i + 1] < 0.0) ++flips[k];
    }
    for (int k = 1; k + 2 <= m; ++k)
    {
        const scalar a = std::min({sig[k], sig[k + 1], sig[k + 2]});
        const scalar b = std::max({sig[k], sig[k + 1], sig[k + 2]});
        if (a > 0.0 && b <= 4.0 * a && 3 * flips[k] >= (m + 1 - k) - 1)
            return sig[k];
    }
    return 0.0;
}

//  Solve the small SPD-ish system M x = r (Gaussian elimination, partial
//  pivoting).  Returns false when singular.
bool smallSolve(std::vector<sVector> M, sVector r, sVector& x)
{
    const std::size_t m = r.size();
    for (std::size_t c = 0; c < m; ++c)
    {
        std::size_t p = c;
        for (std::size_t i = c + 1; i < m; ++i)
            if (std::abs(M[i][c]) > std::abs(M[p][c])) p = i;
        if (std::abs(M[p][c]) < 1.0e-13) return false;
        std::swap(M[p], M[c]); std::swap(r[p], r[c]);
        for (std::size_t i = c + 1; i < m; ++i)
        {
            const scalar f = M[i][c] / M[c][c];
            for (std::size_t j = c; j < m; ++j) M[i][j] -= f * M[c][j];
            r[i] -= f * r[c];
        }
    }
    x.assign(m, 0.0);
    for (std::size_t ii = m; ii-- > 0;)
    {
        scalar t = r[ii];
        for (std::size_t j = ii + 1; j < m; ++j) t -= M[ii][j] * x[j];
        x[ii] = t / M[ii][ii];
    }
    return true;
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

    //  A response is USABLE only if the model evaluated (ok), the objective
    //  is finite, and it carries exactly the residuals the solver will read.
    //  A failed evaluation's f/h/g are placeholders (OptimizationDriver
    //  returns whatever they held when the simulator threw), and a response
    //  whose h/g are not sized would be read out of bounds (C178).
    auto usable = [&](const SQPResponse& r) -> bool
    {
        if (!r.ok || !std::isfinite(r.f)) return false;
        if (r.h.size() != nEq || r.g.size() != nIneq) return false;
        for (scalar v : r.h) if (!std::isfinite(v)) return false;
        for (scalar v : r.g) if (!std::isfinite(v)) return false;
        return true;
    };

    // ----------------------------------------------------------------------
    //  C496 -- ADAPTIVE DIFFERENCES (opts.adaptiveFd; off by default).
    //
    //  The step of variable j comes from the response's own noise and
    //  curvature, not from one fixed fraction.  Per response r (the
    //  objective and every constraint):
    //    eps_r  noise level, ECnoise (More & Wild 2011) on 9 points a few
    //           1e-3 apart along a diagonal -- NOT the same point twice,
    //           which a deterministic engine answers with zero.  A floor of
    //           1e-14 max(1,|r|) stands when no noise is seen.
    //    L_r    curvature bound along e_j, |Delta2(t)|/t^2 with t grown by 8
    //           until |Delta2 f| >= 100 eps (Shi et al. 2021, Procedure I,
    //           floor 0.1 as there); M_r the third-derivative bound from
    //           f(x +- t), f(x +- 2t) when a central step is wanted.
    //    forward  h = 8^(1/4) sqrt(eps/L)   (Shi et al. eq. 2.13), gradient
    //             error bound sqrt(L^2 h^2/4 + 2 eps^2/h^2);
    //    central  h = (3 eps/M)^(1/3)        (eq. 2.14), error bound
    //             sqrt(M^2 h^4/36 + eps^2/(2 h^2)).
    //  One perturbation serves f and every constraint, so h_j is the
    //  largest of the per-response steps.  Central is chosen for variable j
    //  when the forward error bound exceeds a tenth of tolStat (or after a
    //  failed line search).  A step never leaves the box: it turns inward.
    //  The reason of every step is printed with the iteration (fdReport).
    // ----------------------------------------------------------------------
    const std::size_t nR = 1 + nEq + nIneq;
    auto flat = [&](const SQPResponse& r)
    {
        sVector v; v.reserve(nR);
        v.push_back(r.f);
        for (scalar t : r.h) v.push_back(t);
        for (scalar t : r.g) v.push_back(t);
        return v;
    };
    sVector epsR(nR, 0.0), hAuto(n, 1.0e-6), sgnAuto(n, 1.0);
    std::vector<char> cenAuto(n, 0);
    std::vector<sVector> sigG(n, sVector(nR, 0.0));      // [j][r] gradient error bound
    std::string fdReportStr;
    bool forceCentral = false;

    auto estimate = [&](const sVector& x, const SQPResponse& base)
    {
        const sVector f0 = flat(base);
        std::ostringstream rep;
        rep << std::scientific << std::setprecision(1);

        // ---- noise from points close together (ECnoise, 9 points)
        sVector p(n);
        scalar hEn = 1.0e-3;
        for (std::size_t j = 0; j < n; ++j)
        {
            const scalar up = hi[j] - x[j], dn = x[j] - lo[j];
            p[j] = (up >= dn ? 1.0 : -1.0) / std::sqrt(static_cast<scalar>(n));
            const scalar room = std::max(up, dn);
            if (std::isfinite(room)) hEn = std::min(hEn, 0.9 * room / (8.0 * std::abs(p[j])));
        }
        std::vector<sVector> vals{f0};
        bool okAll = hEn > 1.0e-7;
        for (int i = 1; i <= 8 && okAll; ++i)
        {
            sVector xi = x;
            for (std::size_t j = 0; j < n; ++j) xi[j] += i * hEn * p[j];
            const SQPResponse r = E(xi);
            if (!usable(r)) okAll = false; else vals.push_back(flat(r));
        }
        for (std::size_t r = 0; r < nR; ++r)
        {
            scalar e = 0.0;
            if (okAll)
            {
                sVector col; for (const auto& v : vals) col.push_back(v[r]);
                e = ecNoise(col);
            }
            epsR[r] = std::max(e, 1.0e-14 * std::max(1.0, std::abs(f0[r])));
        }
        scalar epsC = 0.0;
        for (std::size_t r = 1; r < nR; ++r) epsC = std::max(epsC, epsR[r]);
        rep << "noise f " << epsR[0] << " c " << epsC
            << (okAll ? " (ECnoise)" : " (floor)") << "; steps";

        // ---- per variable: curvature, step, forward or central
        for (std::size_t j = 0; j < n; ++j)
        {
            sVector Lr(nR, 0.1), Mr(nR, 0.1);
            scalar t = std::max(1.0e-6, 10.0 * std::sqrt(epsR[0]));
            sVector D2, fp, fm; bool cenProbe = false;
            scalar tUse = 0.0;
            for (int trial = 0; trial < 5; ++trial)
            {
                const bool cen = (x[j] - t >= lo[j]) && (x[j] + t <= hi[j]);
                sVector D, a, b; scalar span = 0.0;
                if (cen)
                {
                    sVector xp = x, xm = x; xp[j] += t; xm[j] -= t;
                    const SQPResponse rp = E(xp), rm = E(xm);
                    if (!usable(rp) || !usable(rm)) break;
                    a = flat(rp); b = flat(rm);
                    D.resize(nR);
                    for (std::size_t r = 0; r < nR; ++r) D[r] = a[r] - 2.0 * f0[r] + b[r];
                    span = std::max(std::abs(a[0] - f0[0]), std::abs(b[0] - f0[0]));
                }
                else
                {
                    const scalar sg = (x[j] + 2.0 * t <= hi[j]) ? 1.0 : -1.0;
                    if (sg < 0.0 && x[j] - 2.0 * t < lo[j]) break;
                    sVector x1 = x, x2 = x; x1[j] += sg * t; x2[j] += sg * 2.0 * t;
                    const SQPResponse r1 = E(x1), r2 = E(x2);
                    if (!usable(r1) || !usable(r2)) break;
                    a = flat(r1); b = flat(r2);
                    D.resize(nR);
                    for (std::size_t r = 0; r < nR; ++r) D[r] = b[r] - 2.0 * a[r] + f0[r];
                    span = std::max(std::abs(a[0] - f0[0]), std::abs(b[0] - f0[0]));
                }
                if (span > 0.5 * std::max(1.0, std::abs(f0[0])) && tUse > 0.0) break;
                D2 = D; tUse = t; cenProbe = cen; fp = a; fm = b;
                if (std::abs(D[0]) >= 100.0 * epsR[0]) break;
                t *= 8.0;
            }
            if (tUse > 0.0)
                for (std::size_t r = 0; r < nR; ++r)
                    if (std::abs(D2[r]) >= 100.0 * epsR[r])
                        Lr[r] = std::max(0.1, std::abs(D2[r]) / (tUse * tUse));

            auto clampH = [&](scalar h) { return std::min(0.05, std::max(4.0e-9, h)); };
            scalar hF = 0.0;
            for (std::size_t r = 0; r < nR; ++r)
                hF = std::max(hF, 1.6817928 * std::sqrt(epsR[r] / Lr[r]));
            hF = clampH(hF);
            scalar sgF = 0.0;
            for (std::size_t r = 0; r < nR; ++r)
                sgF = std::max(sgF, std::sqrt(0.25 * Lr[r] * Lr[r] * hF * hF
                                              + 2.0 * epsR[r] * epsR[r] / (hF * hF)));

            const bool wantCentral = forceCentral || sgF > 0.1 * opts.tolStat;
            bool central = false;
            scalar hC = 0.0;
            if (wantCentral)
            {
                // third derivative from f(x +- t), f(x +- 2t) when the box allows
                if (cenProbe && tUse > 0.0 && x[j] - 2.0 * tUse >= lo[j] && x[j] + 2.0 * tUse <= hi[j])
                {
                    sVector xp = x, xm = x; xp[j] += 2.0 * tUse; xm[j] -= 2.0 * tUse;
                    const SQPResponse rp = E(xp), rm = E(xm);
                    if (usable(rp) && usable(rm))
                    {
                        const sVector a2 = flat(rp), b2 = flat(rm);
                        for (std::size_t r = 0; r < nR; ++r)
                        {
                            const scalar D3 = (a2[r] - 2.0 * fp[r] + 2.0 * fm[r] - b2[r])
                                            / (2.0 * tUse * tUse * tUse);
                            Mr[r] = (std::abs(D3) >= 100.0 * epsR[r] / (tUse * tUse * tUse))
                                  ? std::max(0.1, std::abs(D3)) : 0.1;
                        }
                    }
                }
                else
                    for (std::size_t r = 0; r < nR; ++r) Mr[r] = std::max(0.1, Lr[r]);
                for (std::size_t r = 0; r < nR; ++r)
                    hC = std::max(hC, std::cbrt(3.0 * epsR[r] / Mr[r]));
                hC = clampH(hC);
                central = (x[j] - hC >= lo[j]) && (x[j] + hC <= hi[j]);
            }
            if (central)
            {
                hAuto[j] = hC; sgnAuto[j] = 1.0; cenAuto[j] = 1;
                for (std::size_t r = 0; r < nR; ++r)
                    sigG[j][r] = std::sqrt(Mr[r] * Mr[r] * std::pow(hC, 4) / 36.0
                                           + epsR[r] * epsR[r] / (2.0 * hC * hC));
            }
            else
            {
                hAuto[j] = hF; cenAuto[j] = 0;
                sgnAuto[j] = (x[j] + hF <= hi[j]) ? 1.0 : ((x[j] - hF >= lo[j]) ? -1.0 : 1.0);
                for (std::size_t r = 0; r < nR; ++r)
                    sigG[j][r] = std::sqrt(0.25 * Lr[r] * Lr[r] * hF * hF
                                           + 2.0 * epsR[r] * epsR[r] / (hF * hF));
            }
            rep << " x[" << j << "] "
                << (cenAuto[j] ? "central" : (sgnAuto[j] > 0 ? "forward" : "backward"))
                << " h=" << hAuto[j] << " (L " << Lr[0] << ", bound " << sigG[j][0] << ")"
                << (cenAuto[j] ? (forceCentral ? " [after a failed line search]"
                                               : " [forward too rough]") : "");
        }
        fdReportStr = rep.str();
    };

    // ----------------------------------------------------------------------
    //  FD gradients of f AND every constraint from ONE perturbation per var.
    //    forward  : n+1 evaluations (base + n)
    //    central  : 2n evaluations
    //  Returns gradF (n), Jh (nEq x n), Jg (nIneq x n), and the base response.
    //
    //  A DERIVATIVE IS NEVER BUILT FROM A FAILED EVALUATION (C178,
    //  2026-10-27).  Until then the perturbed responses were differenced
    //  without reading `ok`, so a model that could not be evaluated at
    //  x + h contributed its placeholder value and the SQP certified a wrong
    //  point (min x on [-1, 1], evaluable only for x <= 0, from x = 0
    //  returned x = 0, "KKT conditions satisfied"; the answer is -1).  Now:
    //  forward fails -> the BACKWARD difference (x - h); under central
    //  differences one side failing -> the one-sided difference on the
    //  other side against the base point; each such fallback is ANNOUNCED
    //  in `fdNote` (the iteration trace) and counted.  Both sides failing ->
    //  no derivative exists, the function returns false with `fdFailure`
    //  naming the variable, the point and the step, and the SQP stops
    //  unconverged.
    // ----------------------------------------------------------------------
    std::string fdNote;
    std::string fdFailure;
    auto gradients = [&](const sVector& x, const SQPResponse& base,
                         sVector& gradF,
                         std::vector<sVector>& Jh,
                         std::vector<sVector>& Jg) -> bool
    {
        gradF.assign(n, 0.0);
        Jh.assign(nEq,   sVector(n, 0.0));
        Jg.assign(nIneq, sVector(n, 0.0));
        fdNote.clear();

        auto diff = [&](std::size_t j, const SQPResponse& a,
                        const SQPResponse& b, scalar width)
        {
            gradF[j] = (a.f - b.f) / width;
            for (std::size_t i = 0; i < nEq;   ++i)
                Jh[i][j] = (a.h[i] - b.h[i]) / width;
            for (std::size_t i = 0; i < nIneq; ++i)
                Jg[i][j] = (a.g[i] - b.g[i]) / width;
        };
        auto announce = [&](std::size_t j, const char* side)
        {
            ++R.fdOneSided;
            if (!fdNote.empty()) fdNote += "; ";
            fdNote += "FD x[" + std::to_string(j) + "]: " + side
                    + " difference (the other side's evaluation failed)";
        };
        auto refuse = [&](std::size_t j, scalar h)
        {
            fdFailure = "no finite difference exists for variable x["
                + std::to_string(j) + "] at x = " + std::to_string(x[j])
                + ": the model failed at BOTH x + h and x - h (h = "
                + std::to_string(h) + ")";
            return false;
        };

        for (std::size_t j = 0; j < n; ++j)
        {
            const bool autoStep = opts.adaptiveFd;
            const scalar h = autoStep ? hAuto[j]
                           : opts.fdStep * std::max(std::abs(x[j]), typX[j]);
            const scalar sgn = autoStep ? sgnAuto[j] : 1.0;
            const bool cen = autoStep ? (cenAuto[j] != 0) : opts.central;
            sVector xp = x; xp[j] = x[j] + sgn * h;
            const SQPResponse rp = E(xp);
            const bool okp = usable(rp);

            if (autoStep && !cen && sgn < 0.0)
            {
                //  a backward step: the forward one would leave the box
                if (okp) diff(j, base, rp, h);
                else
                {
                    sVector xm = x; xm[j] = x[j] + h;
                    const SQPResponse rm = E(xm);
                    if (usable(rm)) { diff(j, rm, base, h); announce(j, "forward"); }
                    else            return refuse(j, h);
                }
            }
            else if (cen)
            {
                sVector xm = x; xm[j] = x[j] - h;
                const SQPResponse rm = E(xm);
                const bool okm = usable(rm);
                if (okp && okm)  diff(j, rp,   rm,   2.0 * h);
                else if (okp)  { diff(j, rp,   base, h); announce(j, "forward");  }
                else if (okm)  { diff(j, base, rm,   h); announce(j, "backward"); }
                else           return refuse(j, h);
            }
            else if (okp)
                diff(j, rp, base, h);
            else
            {
                sVector xm = x; xm[j] = x[j] - h;
                const SQPResponse rm = E(xm);
                if (usable(rm)) { diff(j, base, rm, h); announce(j, "backward"); }
                else            return refuse(j, h);
            }
        }
        return true;
    };

    //  The stopping record of a failed iterate: stationarity cannot be
    //  measured, the primal feasibility of the point we stop at can.
    auto stopUnmeasured = [&](const SQPResponse& at, const std::string& why)
    {
        R.reason    = why;
        R.converged = false;
        R.kktStat = std::numeric_limits<scalar>::quiet_NaN();
        R.kktFeasEq = 0.0;
        for (scalar hv : at.h) R.kktFeasEq = std::max(R.kktFeasEq, std::abs(hv));
        R.kktFeasIneq = 0.0;
        for (scalar gv : at.g) R.kktFeasIneq = std::max(R.kktFeasIneq, std::max(0.0, gv));
        R.kktCompl    = std::numeric_limits<scalar>::quiet_NaN();
        R.kktDualFeas = std::numeric_limits<scalar>::quiet_NaN();
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
    if (!usable(base))
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

    //  C496 (adaptiveFd): gradients taken at the accepted point for the BFGS
    //  update are kept for the next iteration (the point is the same, the
    //  steps are the same: the numbers are identical, one pass is saved).
    bool haveGrad = false;
    sVector gradSaved;
    std::vector<sVector> JhSaved, JgSaved;
    std::string fdNoteSaved;
    bool needEstimate = opts.adaptiveFd;
    int  failStreak = 0;
    sVector sigEqLast, sigIneqLast;

    int it = 0;
    for (; it < opts.maxIter; ++it)
    {
        // --- linearise ---
        sVector gradF;
        std::vector<sVector> Jh, Jg;
        if (needEstimate) { estimate(R.x, base); needEstimate = false; haveGrad = false; }
        if (haveGrad)
        {
            gradF = gradSaved; Jh = JhSaved; Jg = JgSaved; fdNote = fdNoteSaved;
        }
        else if (!gradients(R.x, base, gradF, Jh, Jg))
        {
            stopUnmeasured(base, "finite-difference gradient FAILED -- "
                + fdFailure + " (the SQP stops: a derivative is never built"
                  " from a failed evaluation)");
            break;
        }
        const std::string fdNoteHere = fdNote;
        std::string relaxNote;

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
        if (opts.adaptiveFd) qp.robust = true;   // C496: near-parallel rows are dependent

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
        //  AN INCONSISTENT LINEARISATION IS RELAXED, NEVER IGNORED (C178,
        //  2026-10-27).  activeSetQP now reports a QP whose constraints
        //  cannot all hold inside the box (converged = false, infeasible =
        //  true) instead of certifying a point that violates one.  Before
        //  C178 that point was a silent out-of-box step: the solver dropped
        //  the binding box row and stepped past it.  An inconsistent
        //  linearisation is an ordinary SQP event (an iterate far from the
        //  feasible region, a constraint whose slope is small), and the
        //  remedy is Powell's (1978, the reference this file already cites
        //  for the damped BFGS): scale the residuals the QP is asked to
        //  REMOVE -- every equality and every inequality violated at x --
        //  by the largest theta in [0, 1] for which the QP is consistent.
        //  The set of such theta is an interval containing 0 (theta = 0 is
        //  satisfied by d = 0, since x lies in the box and the other rows
        //  hold there), so it is found by bisection, each probe a QP solve
        //  (tiny beside one simulator call).  The step then removes theta of
        //  the violation instead of all of it, the merit's directional
        //  derivative says so, and the trace ANNOUNCES theta.  theta = 0
        //  with a vanishing step is a local infeasibility, and the SQP stops
        //  unconverged naming it.
        scalar relaxTheta = 1.0;
        if (!QP.converged)
        {
            const QPResult firstVerdict = QP;
            auto relaxed = [&](scalar th, QPResult& out) -> bool
            {
                QPProblem q = qp;
                for (auto& b : q.beq) b *= th;
                for (std::size_t k = 0; k < mUser; ++k)
                    if (q.bineq[k] > 0.0) q.bineq[k] *= th;
                try { out = activeSetQP(q); }
                catch (const std::exception&) { return false; }
                return out.converged;
            };
            QPResult atLo;
            if (!relaxed(0.0, atLo))
            {
                stopUnmeasured(base, std::string("QP subproblem ")
                    + (firstVerdict.infeasible ? "INFEASIBLE" : "not solved")
                    + " at this iterate (" + firstVerdict.reason + "), and"
                      " even the fully relaxed linearisation (theta = 0) has"
                      " no solution -- the SQP stops here (start from a"
                      " point nearer the feasible region, or relax a"
                      " constraint)");
                break;
            }
            scalar lo = 0.0, hi = 1.0;
            for (int b = 0; b < 40 && hi - lo > 1.0e-8; ++b)
            {
                const scalar mid = 0.5 * (lo + hi);
                QPResult atMid;
                if (relaxed(mid, atMid)) { lo = mid; atLo = atMid; }
                else                     hi = mid;
            }
            relaxTheta = lo;
            QP    = atLo;
            relaxNote = "Powell relaxation: the linearised constraints cannot"
                " all hold inside the box; the QP removes theta = "
                + std::to_string(relaxTheta) + " of the violation";
            ++R.relaxedSteps;
        }

        const sVector& d = QP.d;
        // QP multipliers: equalities + the USER inequalities (drop the bound
        // rows for the Lagrangian/merit -- box bounds are not response cons).
        sVector lamEqNew = QP.lambdaEq;
        sVector lamIneqNew(nIneq, 0.0);
        for (std::size_t k = 0; k < mUser; ++k) lamIneqNew[k] = QP.lambdaIneq[k];

        //  C496: the error bar the gradient noise puts on each multiplier.
        //  At the active set A (equalities, active inequalities, active
        //  bounds) lambda = -(A A^T)^-1 A grad f, so an error e_j in the
        //  Lagrangian's gradient moves lambda_i by P_ij e_j, P = (A A^T)^-1 A,
        //  with e_j^2 = sigma_f,j^2 + sum_k lambda_k^2 sigma_k,j^2 (the bounds
        //  are exact).  Printed as "not resolved" when the bar exceeds the value.
        sVector sigEq(nEq, 0.0), sigIneq(nIneq, 0.0);
        if (opts.adaptiveFd)
        {
            std::vector<sVector> Arows;
            std::vector<int> rowKind, rowIdx;   // 0 eq, 1 user ineq, 2 bound
            for (std::size_t i = 0; i < nEq; ++i) { Arows.push_back(Jh[i]); rowKind.push_back(0); rowIdx.push_back(int(i)); }
            for (std::size_t k = 0; k < mUser; ++k)
                if (k < QP.active.size() && QP.active[k]) { Arows.push_back(Jg[k]); rowKind.push_back(1); rowIdx.push_back(int(k)); }
            for (std::size_t r = 0; r < boundRow.size(); ++r)
                if (mUser + r < QP.active.size() && QP.active[mUser + r])
                {
                    sVector e(n, 0.0); e[boundRow[r].first] = boundRow[r].second;
                    Arows.push_back(e); rowKind.push_back(2); rowIdx.push_back(int(r));
                }
            const std::size_t ma = Arows.size();
            bool okSig = ma > 0;
            std::vector<sVector> G(ma, sVector(ma, 0.0));
            for (std::size_t a = 0; a < ma; ++a)
                for (std::size_t b = 0; b < ma; ++b)
                    G[a][b] = dotv(Arows[a], Arows[b]) + (a == b ? 1.0e-12 : 0.0);
            sVector eL2(n, 0.0);
            for (std::size_t j = 0; j < n; ++j)
            {
                scalar v = sigG[j][0] * sigG[j][0];
                for (std::size_t i = 0; i < nEq; ++i)
                    v += lamEqNew[i] * lamEqNew[i] * sigG[j][1 + i] * sigG[j][1 + i];
                for (std::size_t k = 0; k < nIneq; ++k)
                    v += lamIneqNew[k] * lamIneqNew[k] * sigG[j][1 + nEq + k] * sigG[j][1 + nEq + k];
                eL2[j] = v;
            }
            for (std::size_t a = 0; a < ma && okSig; ++a)
            {
                sVector ea(ma, 0.0), w; ea[a] = 1.0;
                if (!smallSolve(G, ea, w)) { okSig = false; break; }
                scalar var = 0.0;
                for (std::size_t j = 0; j < n; ++j)
                {
                    scalar P = 0.0;
                    for (std::size_t b = 0; b < ma; ++b) P += w[b] * Arows[b][j];
                    var += P * P * eL2[j];
                }
                if (rowKind[a] == 0) sigEq[rowIdx[a]] = std::sqrt(var);
                else if (rowKind[a] == 1) sigIneq[rowIdx[a]] = std::sqrt(var);
            }
            if (!okSig)
            {
                for (auto& v : sigEq) v = std::numeric_limits<scalar>::quiet_NaN();
                for (auto& v : sigIneq) v = std::numeric_limits<scalar>::quiet_NaN();
            }
            sigEqLast = sigEq; sigIneqLast = sigIneq;
        }

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
                if (opts.adaptiveFd) { t.fdReport = fdReportStr; t.sigmaLamEq = sigEq; t.sigmaLamIneq = sigIneq; }
                t.note = kktOK ? "KKT satisfied" : "QP step ~ 0";
                if (!fdNoteHere.empty()) t.note += " [" + fdNoteHere + "]";
                if (!relaxNote.empty())  t.note += " [" + relaxNote + "]";
                opts.onIter(t);
            }
            R.converged = kktOK;
            R.reason = kktOK ? "KKT conditions satisfied"
                     : !relaxNote.empty()
                         ? "QP step vanished under a Powell relaxation"
                           " (theta = " + std::to_string(relaxTheta) + ") -- a"
                           " LOCAL INFEASIBILITY: no step inside the box"
                           " reduces the linearised violation"
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
        //  Under a Powell relaxation the linearised violation falls by
        //  theta * penNow, not by all of it (C178).
        const scalar Dphi = dotv(gradF, d) - mu * relaxTheta * penNow;

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
        //  C496: under noise the merit is only known to +- epsMerit; the
        //  Armijo test of a shortened step is relaxed by 2 epsMerit (Shi et
        //  al. 2021, eq. 2.19), so a step is not refused for a decrease the
        //  noise could have hidden.
        scalar epsMerit = 0.0;
        if (opts.adaptiveFd)
        {
            epsMerit = epsR[0];
            for (std::size_t r = 1; r < nR; ++r) epsMerit += mu * epsR[r];
        }

        while (alpha >= opts.alphaMin)
        {
            for (std::size_t j = 0; j < n; ++j) xTrial[j] = R.x[j] + alpha * d[j];
            rTrial = E(xTrial);
            if (!usable(rTrial)) { alpha *= 0.5; continue; }

            const scalar phiT = merit(rTrial, mu);

            if (watchdog && alpha == 1.0)
            {
                accepted = true; break;       // forced full step
            }
            if (phiT <= phi0 + opts.armijoC1 * alpha * Dphi
                         + (alpha < 1.0 ? 2.0 * epsMerit : 0.0))
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

        if (!accepted && opts.adaptiveFd && failStreak == 0)
        {
            //  C496: the first failed line search is treated as a bad model,
            //  not as the end: forget the BFGS matrix, difference centrally
            //  with fresh noise/curvature estimates, and try once more.  A
            //  second failure in a row stops, as before.
            ++failStreak; ++R.restarts;
            for (std::size_t i = 0; i < n; ++i)
                for (std::size_t j = 0; j < n; ++j) B[i][j] = (i == j) ? 1.0 : 0.0;
            forceCentral = true; needEstimate = true; haveGrad = false;
            if (opts.onIter)
            {
                SQPTrace t;
                t.iteration = it; t.x = R.x; t.f = base.f; t.h = base.h; t.g = base.g;
                t.lambdaEq = lamEqNew; t.lambdaIneq = lamIneqNew;
                t.gActive.assign(nIneq, false);
                for (std::size_t k = 0; k < nIneq; ++k)
                    t.gActive[k] = (k < QP.active.size()) ? QP.active[k] : false;
                t.kktStat = kktStat; t.kktFeasEq = kktFeasEq;
                t.kktFeasIneq = kktFeasIneq; t.kktCompl = kktCompl;
                t.mu = mu; t.alpha = 0.0;
                t.fdReport = fdReportStr; t.sigmaLamEq = sigEq; t.sigmaLamIneq = sigIneq;
                t.note = "line search failed -- RESTART: B reset to I, central differences,"
                         " fresh noise estimate";
                opts.onIter(t);
            }
            continue;
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
        failStreak = 0;
        if (opts.adaptiveFd && alpha < 0.5)
            estimate(xTrial, rTrial);       // the model changed: re-estimate (Procedure I, step 2)
        sVector gradFnew;
        std::vector<sVector> JhNew, JgNew;
        if (!gradients(xTrial, rTrial, gradFnew, JhNew, JgNew))
        {
            //  The merit accepted xTrial, but no derivative exists there: the
            //  point is kept (it is better than the last one) and the SQP
            //  stops UNCONVERGED, naming why.
            R.x  = xTrial;
            base = rTrial;
            stopUnmeasured(base, "finite-difference gradient FAILED at the"
                " accepted step -- " + fdFailure + " (the SQP stops: a"
                " derivative is never built from a failed evaluation)");
            ++it;
            break;
        }
        if (opts.adaptiveFd)
        {
            haveGrad = true; gradSaved = gradFnew; JhSaved = JhNew; JgSaved = JgNew;
            fdNoteSaved = fdNote;
        }
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
            if (opts.adaptiveFd) { t.fdReport = fdReportStr; t.sigmaLamEq = sigEq; t.sigmaLamIneq = sigIneq; }
            if (skipped)
                t.note = "BFGS skipped -- curvature condition violated,"
                         " likely gradient noise";
            else if (fullRejectedThoughFeasImproved)
                t.note = "Maratos: full step improved feasibility but the"
                         " merit rejected it (watchdog is the only v1 relief)";
            if (!fdNoteHere.empty())
                t.note += (t.note.empty() ? "" : " ") + ("[" + fdNoteHere + "]");
            if (!relaxNote.empty())
                t.note += (t.note.empty() ? "" : " ") + ("[" + relaxNote + "]");
            opts.onIter(t);
        }

        // --- accept the step ---
        R.x   = xTrial;
        base  = rTrial;
        lamEq = lamEqNew; lamIneq = lamIneqNew;
    }

    R.sigmaLamEq = sigEqLast; R.sigmaLamIneq = sigIneqLast;
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

//  noise > 0 adds a deterministic pseudo-random perturbation of that size to
//  every returned value (a fixed LCG, so the check is reproducible).
scalar solveHS(const HSProblem& p, int verbosity, bool adaptive = false,
               scalar noise = 0.0, scalar fTol = 1.0e-4)
{
    unsigned long long lcg = 88172645463325252ULL;
    auto xi = [&]() -> scalar {
        lcg = lcg * 6364136223846793005ULL + 1442695040888963407ULL;
        return noise * (static_cast<scalar>((lcg >> 11) & 0xFFFFFFFFFFFFULL)
                        / 140737488355328.0 - 1.0);       // uniform in [-noise, noise]
    };
    auto eval = [&](const sVector& x) -> SQPResponse {
        SQPResponse r;
        r.f = p.f(x) + (noise > 0.0 ? xi() : 0.0);
        r.h.reserve(p.h.size());
        for (const auto& hj : p.h) r.h.push_back(hj(x) + (noise > 0.0 ? xi() : 0.0));
        r.g.reserve(p.g.size());
        for (const auto& gk : p.g) r.g.push_back(gk(x) + (noise > 0.0 ? xi() : 0.0));
        r.ok = std::isfinite(r.f);
        return r;
    };

    SQPOptions o;
    o.maxIter = 100;
    o.central = true;          // tight analytic FD for the self-check
    o.fdStep  = 1.0e-6;
    o.adaptiveFd = adaptive;   // C496: the noise-aware differences (fdMode auto)
    if (adaptive) o.maxIter = 300;

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

    if (!(fErr < fTol))
        throw std::runtime_error(
            "verifySQP FAILED on " + p.name + (adaptive ? " (fdMode auto)" : "")
            + ": optimum f=" + std::to_string(R.f)
            + " vs published " + std::to_string(p.fStar) + " (|df|="
            + std::to_string(fErr) + " > " + std::to_string(fTol) + ").  The SQP (BFGS/merit/"
            "active-set) has a bug -- FIX it, do NOT loosen the tolerance.");

    return fErr;
}

} // anonymous namespace

namespace {
scalar runHS3(int verbosity, bool adaptive, scalar noise, scalar fTol)
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
        worst = std::max(worst, solveHS(p, verbosity, adaptive, noise, fTol));
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
        worst = std::max(worst, solveHS(p, verbosity, adaptive, noise, fTol));
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
        worst = std::max(worst, solveHS(p, verbosity, adaptive, noise, fTol));
    }

    return worst;
}
} // anonymous namespace

scalar verifySQP(int verbosity)
{
    return runHS3(verbosity, false, 0.0, 1.0e-4);
}

//  C496: the same three problems under fdMode auto, clean to 1e-4 as the
//  shipped check, then with 1e-7 uniform noise on every response (the
//  noise-aware differences must still land within 1e-3 of the published
//  optimum).  Called only when a case asks for fdMode auto.
scalar verifySQPAdaptive(int verbosity)
{
    const scalar clean = runHS3(verbosity, true, 0.0, 1.0e-4);
    const scalar noisy = runHS3(verbosity, true, 1.0e-7, 1.0e-3);
    return std::max(clean, noisy);
}

} // namespace Choupo::solver
