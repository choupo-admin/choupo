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

//  The noise level of a response from its values at m+1 equally spaced
//  points, after More & Wild (2011) ECnoise as used by Shi et al. (2021): the
//  k-th differences of a smooth function fall like h^k, those of noise do
//  not, so the level k where three successive estimates agree and the
//  differences change sign often enough IS the noise.  Of that, the
//  estimates sigma_k (eq. 2.9), the factor gamma_k and the agreement of three
//  successive levels are the paper's; the factor 4 of the agreement and the
//  rule "at least a third of the adjacent differences change sign"
//  (`3 flips >= count - 1`) are OURS (the paper's text was not available to
//  this implementation).  Three outcomes, never two:
//    Level        a noise level was found;
//    Exact        every difference of order >= 1 is exactly zero (a constant
//                 or an exactly linear response): no noise, the machine floor
//                 applies;
//    Undetermined no level shows (the response is not smooth enough at this
//                 spacing, or it jumps): the noise is UNKNOWN, which is not
//                 zero and is never turned into a number.
enum class NoiseKind { Level, Exact, Undetermined };
struct NoiseEst { NoiseKind kind = NoiseKind::Undetermined; scalar level = 0.0; };

NoiseEst ecNoise(const sVector& f)
{
    const int m = static_cast<int>(f.size()) - 1;
    std::vector<sVector> D(m + 1);
    D[0] = f;
    sVector sig(m + 1, 0.0);
    std::vector<int> flips(m + 1, 0);
    scalar gamma = 1.0;                                  // (k!)^2/(2k)!
    bool allZero = true;
    for (int k = 1; k <= m; ++k)
    {
        D[k].resize(m + 1 - k);
        scalar sum2 = 0.0;
        for (int i = 0; i + k <= m; ++i)
        {
            D[k][i] = D[k - 1][i + 1] - D[k - 1][i];
            sum2 += D[k][i] * D[k][i];
        }
        if (sum2 > 0.0) allZero = false;
        gamma *= static_cast<scalar>(k) / (2.0 * (2.0 * k - 1.0));   // g_k = g_{k-1} k^2/((2k)(2k-1))
        sig[k] = std::sqrt(gamma * sum2 / static_cast<scalar>(m + 1 - k));
        for (int i = 0; i + 1 < m + 1 - k; ++i)
            if (D[k][i] * D[k][i + 1] < 0.0) ++flips[k];
    }
    NoiseEst e;
    //  an exactly linear (or constant) response: every difference of order >= 2
    //  is exactly zero.  Nothing noisy was seen, and nothing is claimed.
    //  or lie below the machine-rounding floor (1e-13 of the response's size,
    //  ours): a polynomial of low degree whose differences are round-off.
    scalar fmax = 1.0;
    for (scalar v : f) fmax = std::max(fmax, std::abs(v));
    bool linearExact = true;
    for (int k = 2; k <= m; ++k) if (sig[k] > 1.0e-13 * fmax) linearExact = false;
    if (allZero || linearExact) { e.kind = NoiseKind::Exact; return e; }
    for (int k = 1; k + 2 <= m; ++k)
    {
        const scalar a = std::min({sig[k], sig[k + 1], sig[k + 2]});
        const scalar b = std::max({sig[k], sig[k + 1], sig[k + 2]});
        if (a > 0.0 && b <= 4.0 * a && 3 * flips[k] >= (m + 1 - k) - 1)
        { e.kind = NoiseKind::Level; e.level = sig[k]; return e; }
    }
    return e;
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
    //           which a deterministic engine answers with zero -- and again
    //           on a stencil a quarter as wide: noise does not change with
    //           the spacing, a jump or an oscillation the first stencil
    //           cannot resolve does (our own test).  If either stencil
    //           failed, no level shows, or the two disagree by more than 4,
    //           the noise is UNKNOWN: announced, fixed steps, no error bars.
    //           A floor of 1e-14 max(1,|r|) stands under a level or an exact
    //           response, never under an unknown one.
    //    L_r    curvature bound along e_j, |Delta2(t)|/t^2 with t grown by 8
    //           until |Delta2| >= 100 eps_r FOR THAT RESPONSE (Shi et al.
    //           2021, Procedure I); a response that never clears it up to the
    //           largest probe t carries the bound 100 eps_r/t^2 (its
    //           curvature at that scale is below what the noise could show;
    //           floor 0.1 as in the paper); M_r the third-derivative bound
    //           from f(x +- t), f(x +- 2t) by the same rule.  A response whose
    //           probes could not be taken has NO bound (NaN): the variable
    //           takes the fixed step and its bars are unavailable.
    //    forward  h = 8^(1/4) sqrt(eps/L)   (Shi et al. eq. 2.13), gradient
    //             error bound sqrt(L^2 h^2/4 + 2 eps^2/h^2);
    //    central  h = (3 eps/M)^(1/3)        (eq. 2.14), error bound
    //             sqrt(M^2 h^4/36 + eps^2/(2 h^2)).
    //  One perturbation serves f and every constraint, so h_j is the
    //  largest of the per-response steps.  Central is chosen for variable j
    //  when the forward error bound exceeds a tenth of tolStat (or after a
    //  failed line search).  The step is FITTED TO THE BOX at every gradient
    //  evaluation (gradients(): it shrinks to the room, turns inward, or the
    //  variable is called pinned), so no evaluation leaves the box.  The
    //  reason of every step is printed with the iteration (fdReport).
    //  The bars are first-order and treat truncation (a bias) as if it were
    //  one more random error: a bar, not a confidence interval.
    // ----------------------------------------------------------------------
    const std::size_t nR = 1 + nEq + nIneq;
    const scalar kNaN = std::numeric_limits<scalar>::quiet_NaN();
    auto flat = [&](const SQPResponse& r)
    {
        sVector v; v.reserve(nR);
        v.push_back(r.f);
        for (scalar t : r.h) v.push_back(t);
        for (scalar t : r.g) v.push_back(t);
        return v;
    };
    auto respName = [&](std::size_t r) -> std::string
    {
        if (r == 0) return "f";
        if (r <= nEq) return "h" + std::to_string(r - 1);
        return "g" + std::to_string(r - 1 - nEq);
    };
    sVector epsR(nR, 0.0);
    bool noiseKnown = false;                              // all responses' noise measured
    std::vector<sVector> Lj(n, sVector(nR, kNaN)), Mj(n, sVector(nR, kNaN));
    sVector hFwd(n, 1.0e-6), hCen(n, 0.0);
    std::vector<char> cenWanted(n, 0), fixedJ(n, 1);
    std::vector<sVector> sigG(n, sVector(nR, kNaN));      // [j][r] error bound of the LAST gradients()
    std::string fdReportStr;
    bool forceCentral = false;
    const scalar hMinStep = 4.0e-9, hMaxStep = 0.05;
    auto clampH = [&](scalar h) { return std::min(hMaxStep, std::max(hMinStep, h)); };
    auto sigFwd = [](scalar L, scalar eps, scalar h)
    { return std::sqrt(0.25 * L * L * h * h + 2.0 * eps * eps / (h * h)); };
    auto sigCen = [](scalar M, scalar eps, scalar h)
    { return std::sqrt(M * M * std::pow(h, 4) / 36.0 + eps * eps / (2.0 * h * h)); };

    auto estimate = [&](const sVector& x, const SQPResponse& base)
    {
        const sVector f0 = flat(base);
        std::ostringstream rep;
        rep << std::scientific << std::setprecision(1);

        // ---- noise from points close together (ECnoise, 9 points, two spacings)
        sVector p(n);
        scalar hEn = 1.0e-3;
        for (std::size_t j = 0; j < n; ++j)
        {
            const scalar up = hi[j] - x[j], dn = x[j] - lo[j];
            p[j] = (up >= dn ? 1.0 : -1.0) / std::sqrt(static_cast<scalar>(n));
            const scalar room = std::max(up, dn);
            if (std::isfinite(room)) hEn = std::min(hEn, 0.9 * room / (8.0 * std::abs(p[j])));
        }
        auto stencil = [&](scalar hs, std::vector<sVector>& vals) -> bool
        {
            vals.assign(1, f0);
            for (int i = 1; i <= 8; ++i)
            {
                sVector xi = x;
                for (std::size_t j = 0; j < n; ++j) xi[j] += i * hs * p[j];
                const SQPResponse r = E(xi);
                if (!usable(r)) return false;
                vals.push_back(flat(r));
            }
            return true;
        };
        std::vector<sVector> valsA, valsB;
        std::string unknownWhy;
        if (!(hEn > 1.0e-7))
            unknownWhy = "no room for the noise stencil inside the box";
        else if (!stencil(hEn, valsA) || !stencil(0.25 * hEn, valsB))
            unknownWhy = "a model evaluation of the noise stencil FAILED";
        sVector eps(nR, 0.0);
        if (unknownWhy.empty())
            for (std::size_t r = 0; r < nR && unknownWhy.empty(); ++r)
            {
                sVector ca, cb;
                for (const auto& v : valsA) ca.push_back(v[r]);
                for (const auto& v : valsB) cb.push_back(v[r]);
                const NoiseEst ea = ecNoise(ca), eb = ecNoise(cb);
                const scalar floorR = 1.0e-14 * std::max(1.0, std::abs(f0[r]));
                if (ea.kind == NoiseKind::Undetermined || eb.kind == NoiseKind::Undetermined)
                    unknownWhy = "no noise level shows in response " + respName(r)
                               + " (not smooth at this spacing, or it jumps)";
                else
                {
                    const scalar la = ea.kind == NoiseKind::Level ? ea.level : 0.0;
                    const scalar lb = eb.kind == NoiseKind::Level ? eb.level : 0.0;
                    const scalar big = std::max(la, lb), small = std::min(la, lb);
                    if (big > 4.0 * small && big > 10.0 * floorR)
                        unknownWhy = "the noise level of response " + respName(r)
                                   + " changes with the spacing (" + std::to_string(la) + " against "
                                   + std::to_string(lb) + "): a signal, not noise";
                    else eps[r] = std::max(la, floorR);
                }
            }
        noiseKnown = unknownWhy.empty();
        if (!noiseKnown)
        {
            for (std::size_t j = 0; j < n; ++j)
            {
                fixedJ[j] = 1;
                std::fill(sigG[j].begin(), sigG[j].end(), kNaN);
            }
            rep << "noise unknown (" << unknownWhy << "); fixed steps, no error bars";
            fdReportStr = rep.str();
            return;
        }
        epsR = eps;
        scalar epsC = 0.0;
        for (std::size_t r = 1; r < nR; ++r) epsC = std::max(epsC, epsR[r]);
        rep << "noise f " << epsR[0] << " c " << epsC << " (ECnoise); steps";

        // ---- per variable: curvature, step, forward or central
        for (std::size_t j = 0; j < n; ++j)
        {
            sVector Lr(nR, kNaN), Mr(nR, kNaN);
            std::vector<char> resolved(nR, 0);
            scalar tLast = 0.0;
            bool cenLast = false;
            sVector fpL, fmL;
            scalar t = std::max(1.0e-6, 10.0 * std::sqrt(epsR[0]));
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
                if (span > 0.5 * std::max(1.0, std::abs(f0[0])) && tLast > 0.0) break;
                tLast = t; cenLast = cen; fpL = a; fmL = b;
                bool all = true;
                for (std::size_t r = 0; r < nR; ++r)
                {
                    if (!resolved[r] && std::abs(D[r]) >= 100.0 * epsR[r])
                    { Lr[r] = std::max(0.1, std::abs(D[r]) / (t * t)); resolved[r] = 1; }
                    all = all && resolved[r];
                }
                if (all) break;
                t *= 8.0;
            }
            if (tLast > 0.0)
                for (std::size_t r = 0; r < nR; ++r)
                    if (!resolved[r]) Lr[r] = std::max(0.1, 100.0 * epsR[r] / (tLast * tLast));
            Lj[j] = Lr;
            if (!(tLast > 0.0))
            {
                fixedJ[j] = 1;
                std::fill(sigG[j].begin(), sigG[j].end(), kNaN);
                rep << " x[" << j << "] fixed step (the curvature probes could not be taken)";
                continue;
            }
            fixedJ[j] = 0;

            scalar hF = 0.0;
            for (std::size_t r = 0; r < nR; ++r)
                hF = std::max(hF, 1.6817928 * std::sqrt(epsR[r] / Lr[r]));
            hF = clampH(hF);
            hFwd[j] = hF;
            scalar sgF = 0.0;
            for (std::size_t r = 0; r < nR; ++r) sgF = std::max(sgF, sigFwd(Lr[r], epsR[r], hF));

            const bool wantCentral = forceCentral || sgF > 0.1 * opts.tolStat;
            scalar hC = 0.0;
            bool haveM = false;
            if (wantCentral && cenLast && x[j] - 2.0 * tLast >= lo[j] && x[j] + 2.0 * tLast <= hi[j])
            {
                //  third derivative from f(x +- t), f(x +- 2t)
                sVector xp = x, xm = x; xp[j] += 2.0 * tLast; xm[j] -= 2.0 * tLast;
                const SQPResponse rp = E(xp), rm = E(xm);
                if (usable(rp) && usable(rm))
                {
                    const sVector a2 = flat(rp), b2 = flat(rm);
                    haveM = true;
                    for (std::size_t r = 0; r < nR; ++r)
                    {
                        const scalar D3 = a2[r] - 2.0 * fpL[r] + 2.0 * fmL[r] - b2[r];
                        Mr[r] = (std::abs(D3) >= 100.0 * epsR[r])
                              ? std::max(0.1, std::abs(D3) / (2.0 * tLast * tLast * tLast))
                              : std::max(0.1, 100.0 * epsR[r] / (2.0 * tLast * tLast * tLast));
                    }
                }
            }
            Mj[j] = Mr;
            if (haveM)
            {
                for (std::size_t r = 0; r < nR; ++r)
                    hC = std::max(hC, std::cbrt(3.0 * epsR[r] / Mr[r]));
                hC = clampH(hC);
            }
            hCen[j] = hC;
            cenWanted[j] = (wantCentral && haveM) ? 1 : 0;
            const scalar bar0 = cenWanted[j] ? sigCen(Mr[0], epsR[0], hC) : sgF;
            rep << " x[" << j << "] " << (cenWanted[j] ? "central" : "forward")
                << " h=" << (cenWanted[j] ? hC : hF) << " (L " << Lr[0] << ", bound " << bar0 << ")"
                << (wantCentral && !haveM ? " [central wanted, third derivative not measurable]" : "")
                << (cenWanted[j] ? (forceCentral ? " [after a failed line search]"
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

        //  C496 (adaptiveFd): the column of variable j, step FITTED TO THE BOX
        //  at THIS x.  The step estimated at an earlier point is never used
        //  as it stands: it shrinks to the room, a central difference that
        //  does not fit becomes a one-sided one INSIDE the box, a failed side
        //  falls back only to a side that is inside the box, and a variable
        //  whose box is narrower than the smallest step is PINNED (its column
        //  is zero, announced).  No evaluation leaves [lo, hi].
        auto adaptiveColumn = [&](std::size_t j) -> bool
        {
            const scalar up = hi[j] - x[j], dn = x[j] - lo[j];
            std::fill(sigG[j].begin(), sigG[j].end(), kNaN);
            if (up + dn < 2.0 * hMinStep)
            {
                if (!fdNote.empty()) fdNote += "; ";
                fdNote += "FD x[" + std::to_string(j) + "]: PINNED (the box is narrower than the"
                          " smallest step); its derivative is not taken";
                return true;
            }
            const bool known = noiseKnown && !fixedJ[j];
            const scalar fixedH = opts.fdStep * std::max(std::abs(x[j]), typX[j]);
            auto at = [&](scalar v) { sVector xx = x; xx[j] = std::min(hi[j], std::max(lo[j], v)); return xx; };
            auto bars = [&](bool central, scalar width)
            {
                if (!known) return;
                for (std::size_t r = 0; r < nR; ++r)
                    sigG[j][r] = central ? sigCen(Mj[j][r], epsR[r], 0.5 * width)
                                         : sigFwd(Lj[j][r], epsR[r], width);
            };
            auto shrunkNote = [&](scalar want, scalar got)
            {
                if (got < 0.999 * want)
                {
                    if (!fdNote.empty()) fdNote += "; ";
                    fdNote += "FD x[" + std::to_string(j) + "]: step shrunk to the room inside the box";
                }
            };
            bool central = known && cenWanted[j];
            if (central)
            {
                const scalar hw = hCen[j];
                const scalar hc = std::min({hw, up, dn});
                if (hc >= std::max(hMinStep, 0.25 * hw))
                {
                    shrunkNote(hw, hc);
                    const sVector xp = at(x[j] + hc), xm = at(x[j] - hc);
                    const scalar width = xp[j] - xm[j];
                    const SQPResponse rp = E(xp), rm = E(xm);
                    const bool okp = usable(rp), okm = usable(rm);
                    if (okp && okm) { diff(j, rp, rm, width); bars(true, width); return true; }
                    if (okp) { diff(j, rp, base, xp[j] - x[j]); announce(j, "forward");  bars(false, xp[j] - x[j]); return true; }
                    if (okm) { diff(j, base, rm, x[j] - xm[j]); announce(j, "backward"); bars(false, x[j] - xm[j]); return true; }
                    return refuse(j, hc);
                }
                central = false;                       // no room for both sides: one inside the box
            }
            const scalar hf = known ? hFwd[j] : fixedH;
            const bool fwdFirst = up >= hf || (dn < hf && up >= dn);
            const scalar room1 = fwdFirst ? up : dn, room2 = fwdFirst ? dn : up;
            const scalar h1 = std::min(hf, room1);
            shrunkNote(hf, h1);
            const sVector x1 = at(x[j] + (fwdFirst ? h1 : -h1));
            const scalar w1 = std::abs(x1[j] - x[j]);
            const SQPResponse r1 = E(x1);
            if (usable(r1))
            {
                if (fwdFirst) diff(j, r1, base, w1); else diff(j, base, r1, w1);
                bars(false, w1);
                return true;
            }
            //  the other side, only if it is inside the box
            const scalar h2 = std::min(hf, room2);
            if (h2 >= hMinStep)
            {
                const sVector x2 = at(x[j] + (fwdFirst ? -h2 : h2));
                const scalar w2 = std::abs(x2[j] - x[j]);
                const SQPResponse r2 = E(x2);
                if (usable(r2))
                {
                    if (fwdFirst) diff(j, base, r2, w2); else diff(j, r2, base, w2);
                    announce(j, fwdFirst ? "backward" : "forward");
                    bars(false, w2);
                    return true;
                }
            }
            return refuse(j, h1);
        };

        for (std::size_t j = 0; j < n; ++j)
        {
            if (opts.adaptiveFd)
            {
                if (!adaptiveColumn(j)) return false;
                continue;
            }
            const scalar h = opts.fdStep * std::max(std::abs(x[j]), typX[j]);
            const bool cen = opts.central;
            sVector xp = x; xp[j] = x[j] + h;
            const SQPResponse rp = E(xp);
            const bool okp = usable(rp);

            if (cen)
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
    if (opts.adaptiveFd)                      // C496: nothing is ever evaluated outside the box
        for (std::size_t j = 0; j < n; ++j) R.x[j] = std::min(hi[j], std::max(lo[j], R.x[j]));
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
    //  gradFresh: the gradients in hand were taken with noise, curvature and
    //  steps estimated AT THIS POINT.  A certificate needs it (F2).
    bool gradFresh = false;
    bool gradSavedFresh = false;
    std::vector<bool> lastIneqActive;
    scalar lastStatBar = kNaN, lastStatTol = 0.0;

    int it = 0;
    for (; it < opts.maxIter; ++it)
    {
        // --- linearise ---
        sVector gradF;
        std::vector<sVector> Jh, Jg;
        if (needEstimate) { estimate(R.x, base); needEstimate = false; haveGrad = false; gradFresh = true; }
        if (haveGrad)
        {
            gradF = gradSaved; Jh = JhSaved; Jg = JgSaved; fdNote = fdNoteSaved;
            gradFresh = gradSavedFresh;
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
                      + (opts.adaptiveFd
                         //  the default path keeps its text byte for byte (invariant
                         //  (d)); under fdMode auto the sentence is the true one
                         ? std::string(" the QP solver could not solve even the fully"
                           " relaxed linearisation (theta = 0), which d = 0 satisfies by"
                           " construction: a failure of the QP solver, not a proof of"
                           " infeasibility -- the SQP stops here")
                         : std::string(" even the fully relaxed linearisation (theta = 0) has"
                           " no solution -- the SQP stops here (start from a"
                           " point nearer the feasible region, or relax a"
                           " constraint)")));
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

        //  C496: the error bars the gradient noise puts on the multipliers and
        //  on the stationarity residual (adaptiveFd only), first order,
        //  independent errors; the multiplier bars printed are 2 standard deviations:
        //    e_j^2 = sigma_f,j^2 + sum_k lambda_k^2 sigma_k,j^2
        //  is the error of component j of grad L (bounds are exact).  The
        //  multiplier PRINTED is the QP's, lambda = (A B^-1 A^T)^-1 (b - A B^-1
        //  g) over the active rows A (equalities, active inequalities, active
        //  bounds), so an error of the gradient moves it by P e with
        //  P = (A B^-1 A^T)^-1 A B^-1 -- the B-weighted map, NOT the
        //  least-squares (A A^T)^-1 A the first version used (it was 5 times
        //  too small on a B far from I).  A is normalised by its diagonal and
        //  a pivot below 1e-10 there REFUSES the bar (NaN, "unavailable"):
        //  there is no absolute ridge.  An inactive inequality has
        //  lambda = 0 exactly and no bar (NaN, ineqActive false).  The bar
        //  OMITS: the displacement of x* through H, correlations between the
        //  responses of one run, truncation being a bias, the uncertainty of
        //  the active set, and the age of the noise estimate (gradFresh).
        sVector sigEq(nEq, kNaN), sigIneq(nIneq, kNaN);
        scalar statSigma = kNaN;                 // 1 sd of ||grad L||inf over the free components
        if (opts.adaptiveFd)
        {
            std::vector<sVector> Arows;
            std::vector<int> rowKind, rowIdx;   // 0 eq, 1 user ineq, 2 bound
            for (std::size_t i = 0; i < nEq; ++i) { Arows.push_back(Jh[i]); rowKind.push_back(0); rowIdx.push_back(int(i)); }
            for (std::size_t k = 0; k < mUser; ++k)
                if (k < QP.active.size() && QP.active[k]) { Arows.push_back(Jg[k]); rowKind.push_back(1); rowIdx.push_back(int(k)); }
            std::vector<char> boundActive(n, 0);
            for (std::size_t r = 0; r < boundRow.size(); ++r)
                if (mUser + r < QP.active.size() && QP.active[mUser + r])
                {
                    sVector e(n, 0.0); e[boundRow[r].first] = boundRow[r].second;
                    Arows.push_back(e); rowKind.push_back(2); rowIdx.push_back(int(r));
                    boundActive[boundRow[r].first] = 1;
                }
            const std::size_t ma = Arows.size();
            //  error of each component of grad L (NaN when a contributing bar is unavailable)
            sVector eL2(n, 0.0);
            bool barsOK = true;
            for (std::size_t j = 0; j < n; ++j)
            {
                scalar v = sigG[j][0] * sigG[j][0];
                for (std::size_t i = 0; i < nEq; ++i)
                    if (lamEqNew[i] != 0.0) v += lamEqNew[i] * lamEqNew[i] * sigG[j][1 + i] * sigG[j][1 + i];
                for (std::size_t k = 0; k < nIneq; ++k)
                    if (lamIneqNew[k] != 0.0) v += lamIneqNew[k] * lamIneqNew[k] * sigG[j][1 + nEq + k] * sigG[j][1 + nEq + k];
                if (!std::isfinite(v)) barsOK = false;
                eL2[j] = v;
            }
            if (barsOK)
            {
                scalar m = 0.0;
                for (std::size_t j = 0; j < n; ++j) if (!boundActive[j]) m = std::max(m, std::sqrt(eL2[j]));
                statSigma = m;
            }
            //  B-weighted multiplier map
            bool okSig = barsOK && ma > 0;
            std::vector<sVector> Y(ma);
            for (std::size_t a = 0; a < ma && okSig; ++a)
                if (!smallSolve(B, Arows[a], Y[a])) okSig = false;
            std::vector<sVector> Mn(ma, sVector(ma, 0.0));
            sVector dsc(ma, 1.0);
            if (okSig)
            {
                for (std::size_t a = 0; a < ma; ++a)
                {
                    const scalar maa = dotv(Arows[a], Y[a]);
                    if (!(maa > 0.0)) { okSig = false; break; }
                    dsc[a] = std::sqrt(maa);
                }
                for (std::size_t a = 0; a < ma && okSig; ++a)
                    for (std::size_t b2 = 0; b2 < ma; ++b2)
                        Mn[a][b2] = dotv(Arows[a], Y[b2]) / (dsc[a] * dsc[b2]);
            }
            for (std::size_t a = 0; a < ma && okSig; ++a)
            {
                //  row a of (A B^-1 A^T)^-1, by a relative-pivot elimination
                std::vector<sVector> M = Mn;
                sVector rhs(ma, 0.0), z(ma, 0.0);
                rhs[a] = 1.0;
                bool good = true;
                for (std::size_t c = 0; c < ma && good; ++c)
                {
                    std::size_t pv = c;
                    for (std::size_t i = c + 1; i < ma; ++i)
                        if (std::abs(M[i][c]) > std::abs(M[pv][c])) pv = i;
                    if (std::abs(M[pv][c]) < 1.0e-10) { good = false; break; }
                    std::swap(M[pv], M[c]); std::swap(rhs[pv], rhs[c]);
                    for (std::size_t i = c + 1; i < ma; ++i)
                    {
                        const scalar f = M[i][c] / M[c][c];
                        for (std::size_t jj = c; jj < ma; ++jj) M[i][jj] -= f * M[c][jj];
                        rhs[i] -= f * rhs[c];
                    }
                }
                if (!good) { okSig = false; break; }
                for (std::size_t ii = ma; ii-- > 0;)
                {
                    scalar t2 = rhs[ii];
                    for (std::size_t jj = ii + 1; jj < ma; ++jj) t2 -= M[ii][jj] * z[jj];
                    z[ii] = t2 / M[ii][ii];
                }
                //  P_a. = sum_b (z_b / (dsc_a dsc_b)) Y_b
                scalar var = 0.0;
                for (std::size_t j = 0; j < n; ++j)
                {
                    scalar P = 0.0;
                    for (std::size_t b2 = 0; b2 < ma; ++b2) P += z[b2] / (dsc[a] * dsc[b2]) * Y[b2][j];
                    var += P * P * eL2[j];
                }
                //  the printed bar is TWO standard deviations (about 95 % if the errors were Gaussian)
                if (rowKind[a] == 0) sigEq[rowIdx[a]] = 2.0 * std::sqrt(var);
                else if (rowKind[a] == 1) sigIneq[rowIdx[a]] = 2.0 * std::sqrt(var);
            }
            if (!okSig)
            {
                std::fill(sigEq.begin(), sigEq.end(), kNaN);
                std::fill(sigIneq.begin(), sigIneq.end(), kNaN);
            }
            sigEqLast = sigEq; sigIneqLast = sigIneq;
            lastIneqActive.assign(nIneq, false);
            for (std::size_t k = 0; k < mUser; ++k)
                lastIneqActive[k] = (k < QP.active.size()) ? QP.active[k] : false;
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

        //  C496 F11 (adaptiveFd): the stationarity tolerance is tolStat times the
        //  size of the terms grad L cancels -- see SQPOptions::scaledStationarity.
        scalar tolStatEff = opts.tolStat;
        if (opts.adaptiveFd && opts.scaledStationarity)
        {
            scalar S = std::max(1.0, normInf(gradF));
            for (std::size_t i = 0; i < nEq; ++i)
                S = std::max(S, std::abs(lamEqNew[i]) * normInf(Jh[i]));
            for (std::size_t k = 0; k < nIneq; ++k)
                S = std::max(S, std::abs(lamIneqNew[k]) * normInf(Jg[k]));
            for (std::size_t r = 0; r < boundRow.size(); ++r)
                if (mUser + r < QP.lambdaIneq.size())
                    S = std::max(S, std::abs(QP.lambdaIneq[mUser + r]));
            tolStatEff = opts.tolStat * S;
        }
        const bool kktOK =
               kktStat     <= tolStatEff
            && kktFeasEq   <= opts.tolFeasEq
            && kktFeasIneq <= opts.tolFeasIneq
            && kktCompl    <= opts.tolCompl
            //  Under the scaled tolerance the QP step must be small too: at a QP
            //  solution ||grad L||inf of the QP's own multipliers IS ||B d||inf,
            //  so a tolerance scaled by a gradient of 1e10 would pass a step of
            //  length 1 (measured on K = 2e10).  Ours: ||d||inf <= 1e-4 max(1,|x|).
            && (!(opts.adaptiveFd && opts.scaledStationarity)
                || normInf(d) <= 1.0e-4 * std::max(1.0, normInf(R.x)));

        //  C496 F2: a verdict is taken only on a gradient whose noise, curvature
        //  and steps were estimated AT THIS POINT.  A step chosen at x = 0 and
        //  a bound of 0.19 against a tolerance of 1e-5 certified x = 0.575 on
        //  a function whose gradient there is -0.5.  So: estimate again here,
        //  difference again, and judge that.
        if (opts.adaptiveFd && (kktOK || dnorm < 1.0e-12) && !gradFresh)
        {
            needEstimate = true; haveGrad = false;
            if (opts.onIter)
            {
                SQPTrace t;
                t.iteration = it; t.x = R.x; t.f = base.f; t.h = base.h; t.g = base.g;
                t.lambdaEq = lamEqNew; t.lambdaIneq = lamIneqNew;
                t.gActive.assign(nIneq, false);
                t.kktStat = kktStat; t.kktFeasEq = kktFeasEq;
                t.kktFeasIneq = kktFeasIneq; t.kktCompl = kktCompl;
                t.mu = mu; t.alpha = 0.0;
                t.note = "stationary on an OLD estimate -- noise, curvature and steps estimated again"
                         " at this point before any verdict";
                opts.onIter(t);
            }
            continue;
        }
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
            //  C496 F2: with the adaptive differences the verdict also needs the
            //  error bar (3 sd) of ||grad L|| at this point below the tolerance.
            bool certified = kktOK;
            std::string whyNot;
            if (opts.adaptiveFd)
            {
                lastStatBar = 3.0 * statSigma; lastStatTol = tolStatEff;
                if (kktOK && !(std::isfinite(lastStatBar) && lastStatBar <= tolStatEff))
                {
                    certified = false;
                    R.stationaryUncertified = true;
                    whyNot = std::isfinite(lastStatBar)
                        ? "KKT residuals met (||grad L|| " + std::to_string(kktStat) + ") but NOT CERTIFIED:"
                          " the gradient's error bar (3 sd) " + std::to_string(lastStatBar)
                          + " exceeds the stationarity tolerance " + std::to_string(tolStatEff)
                        : "KKT residuals met (||grad L|| " + std::to_string(kktStat) + ") but NOT CERTIFIED:"
                          " the gradient's error bar is UNAVAILABLE (the noise of a response was not"
                          " measured: " + fdReportStr + ")";
                }
            }
            R.converged = certified;
            R.certified = certified;
            R.reason = certified ? "KKT conditions satisfied"
                     : !whyNot.empty() ? whyNot
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
        //  Armijo test of a shortened step is relaxed by 2 epsMerit, so a step
        //  is not refused for a decrease the noise could have hidden.  This is
        //  OUR SIMPLIFIED form of the relaxed line search of Shi et al. (2021):
        //  their eq. 2.19 has three cases (a condition on g'p against
        //  sigma_g ||p|| and a simple-decrease branch) that are NOT implemented
        //  here, and the slack is not the paper's.
        scalar epsMerit = 0.0;
        if (opts.adaptiveFd)
        {
            epsMerit = epsR[0];
            for (std::size_t r = 1; r < nR; ++r) epsMerit += mu * epsR[r];
        }

        while (alpha >= opts.alphaMin)
        {
            for (std::size_t j = 0; j < n; ++j)
            {
                xTrial[j] = R.x[j] + alpha * d[j];
                if (opts.adaptiveFd) xTrial[j] = std::min(hi[j], std::max(lo[j], xTrial[j]));   // never outside the box
            }
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
        const bool estimatedHere = opts.adaptiveFd && alpha < 0.5;
        if (estimatedHere)
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
            gradSavedFresh = estimatedHere;
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
    R.ineqActive = lastIneqActive;
    R.statBar = lastStatBar; R.statTolUsed = lastStatTol;
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
