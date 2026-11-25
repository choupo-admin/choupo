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
Reference (published methods, primary sources -- NOT a port of any code):
    Jones, Schonlau & Welch (1998), J. Global Optim. 13:455-492 (expected
      improvement).
    Rasmussen & Williams (2006), Gaussian Processes for Machine Learning,
      ch. 2 and 5 (Algorithm 2.1, squared-exponential kernel, marginal
      likelihood).
    Schonlau, Welch & Jones (1998) and Gardner et al. (2014) (constraints
      by the probability of feasibility).
    The full statement of choices is in BayesOpt.H.
\*---------------------------------------------------------------------------*/

#include "BayesOpt.H"

#include <algorithm>
#include <cmath>
#include <cstdint>
#include <functional>
#include <iomanip>
#include <iostream>
#include <limits>
#include <random>
#include <sstream>
#include <stdexcept>

namespace Choupo::solver {

namespace {

constexpr double kPi        = 3.14159265358979323846;
constexpr double kFailLen   = 0.10;     // L of the failed-point factor
constexpr double kLogLMin   = -3.912;   // l >= 0.02 (scaled units)
constexpr double kLogLMax   =  2.303;   // l <= 10
constexpr double kLogSfMin  = -2.996;   // sf2 >= 0.05 (outputs standardised)
constexpr double kLogSfMax  =  2.996;   // sf2 <= 20
constexpr double kLogSnMin  = -18.421;  // sn2 >= 1e-8
constexpr double kLogSnMax  = -2.303;   // sn2 <= 0.1

double normPdf(double u) { return std::exp(-0.5 * u * u) / std::sqrt(2.0 * kPi); }
double normCdf(double u) { return 0.5 * std::erfc(-u / std::sqrt(2.0)); }

//  Radical inverse of i in the given prime base (Halton, 1960).
double radicalInverse(unsigned i, unsigned base)
{
    double f = 1.0, r = 0.0;
    while (i > 0)
    {
        f /= base;
        r += f * (i % base);
        i /= base;
    }
    return r;
}

const unsigned kPrimes[] = {2, 3, 5, 7, 11, 13, 17, 19, 23, 29, 31, 37};

//  Coordinate pattern search, MAXIMISING F inside [lo, hi].  Returns the
//  best value; x holds the best point.
double patternMax(const std::function<double(const sVector&)>& F, sVector& x,
                  const sVector& lo, const sVector& hi, double step,
                  double minStep, int maxEval, int& evals)
{
    double f0 = F(x);
    ++evals;
    int local = 1;
    while (step > minStep && local < maxEval)
    {
        bool improved = false;
        for (std::size_t d = 0; d < x.size() && local < maxEval; ++d)
        {
            for (int sgn = -1; sgn <= 1; sgn += 2)
            {
                sVector y = x;
                y[d] = std::min(hi[d], std::max(lo[d], y[d] + sgn * step));
                if (y[d] == x[d]) continue;
                const double fy = F(y);
                ++evals;
                ++local;
                if (fy > f0)
                {
                    f0 = fy;
                    x = y;
                    improved = true;
                    break;
                }
            }
        }
        if (!improved) step *= 0.5;
    }
    return f0;
}

// ---------------------------------------------------------------------------
//  The Gaussian process (R&W ch. 2).  Inputs scaled to [0,1]^n.
// ---------------------------------------------------------------------------
struct GP
{
    std::size_t n = 0, m = 0;
    std::vector<sVector> X;
    sVector theta;          // log l_1..l_n, log sf2, log sn2
    std::vector<double> L;  // lower Cholesky factor, row-major m x m
    sVector alpha;          // (K + sn2 I)^-1 y
    double jitter = 0.0;
    double lml = -std::numeric_limits<double>::infinity();
    double ymean = 0.0, ysd = 1.0;
    int starts = 0, lmlEvals = 0;
};

double kern(const sVector& th, std::size_t n, const sVector& a, const sVector& b)
{
    double s = 0.0;
    for (std::size_t i = 0; i < n; ++i)
    {
        const double d = (a[i] - b[i]) / std::exp(th[i]);
        s += d * d;
    }
    return std::exp(th[n]) * std::exp(-0.5 * s);
}

bool cholesky(std::vector<double>& A, std::size_t m)
{
    for (std::size_t j = 0; j < m; ++j)
    {
        double d = A[j * m + j];
        for (std::size_t k = 0; k < j; ++k) d -= A[j * m + k] * A[j * m + k];
        if (!(d > 0.0) || !std::isfinite(d)) return false;
        const double dj = std::sqrt(d);
        A[j * m + j] = dj;
        for (std::size_t i = j + 1; i < m; ++i)
        {
            double s = A[i * m + j];
            for (std::size_t k = 0; k < j; ++k) s -= A[i * m + k] * A[j * m + k];
            A[i * m + j] = s / dj;
        }
    }
    for (std::size_t i = 0; i < m; ++i)
        for (std::size_t j = i + 1; j < m; ++j) A[i * m + j] = 0.0;
    return true;
}

void forwardSolve(const std::vector<double>& L, std::size_t m, const sVector& b, sVector& x)
{
    x.assign(m, 0.0);
    for (std::size_t i = 0; i < m; ++i)
    {
        double s = b[i];
        for (std::size_t k = 0; k < i; ++k) s -= L[i * m + k] * x[k];
        x[i] = s / L[i * m + i];
    }
}

void backSolve(const std::vector<double>& L, std::size_t m, const sVector& b, sVector& x)
{
    x.assign(m, 0.0);
    for (std::size_t ii = m; ii-- > 0;)
    {
        double s = b[ii];
        for (std::size_t k = ii + 1; k < m; ++k) s -= L[k * m + ii] * x[k];
        x[ii] = s / L[ii * m + ii];
    }
}

//  Log marginal likelihood (R&W eq. 5.8) at theta; fills L, alpha, jitter.
double logMarginal(const sVector& th, const std::vector<sVector>& X,
                   const sVector& y, std::vector<double>& L, sVector& alpha,
                   double& jitterUsed)
{
    const std::size_t m = X.size(), n = X[0].size();
    std::vector<double> K(m * m);
    const double sn2 = std::exp(th[n + 1]);
    for (std::size_t i = 0; i < m; ++i)
        for (std::size_t j = 0; j <= i; ++j)
        {
            double k = kern(th, n, X[i], X[j]);
            if (i == j) k += sn2;
            K[i * m + j] = K[j * m + i] = k;
        }
    const double jit[] = {0.0, 1e-10, 1e-8, 1e-6, 1e-4};
    for (double j : jit)
    {
        L = K;
        for (std::size_t i = 0; i < m; ++i) L[i * m + i] += j;
        if (cholesky(L, m))
        {
            jitterUsed = j;
            sVector t;
            forwardSolve(L, m, y, t);
            backSolve(L, m, t, alpha);
            double quad = 0.0, logdet = 0.0;
            for (std::size_t i = 0; i < m; ++i)
            {
                quad += y[i] * alpha[i];
                logdet += std::log(L[i * m + i]);
            }
            return -0.5 * quad - logdet - 0.5 * m * std::log(2.0 * kPi);
        }
    }
    return -std::numeric_limits<double>::infinity();
}

//  Fit: maximum marginal likelihood over the log-bounds, pattern search from
//  the warm start, the centre and low-discrepancy starts.  Prints one line.
GP fitGP(const std::vector<sVector>& X, const sVector& yRaw, const sVector* warm,
         const std::string& label, std::ostream& os, int verbosity)
{
    GP g;
    g.X = X;
    g.m = X.size();
    g.n = X[0].size();
    const std::size_t n = g.n;
    double mean = 0.0;
    for (double v : yRaw) mean += v;
    mean /= yRaw.size();
    double var = 0.0;
    for (double v : yRaw) var += (v - mean) * (v - mean);
    var /= std::max<std::size_t>(1, yRaw.size() - 1);
    g.ymean = mean;
    g.ysd = (var > 1e-300) ? std::sqrt(var) : 1.0;
    sVector y(yRaw.size());
    for (std::size_t i = 0; i < y.size(); ++i) y[i] = (yRaw[i] - g.ymean) / g.ysd;

    sVector lo(n + 2), hi(n + 2);
    for (std::size_t i = 0; i < n; ++i) { lo[i] = kLogLMin; hi[i] = kLogLMax; }
    lo[n] = kLogSfMin;     hi[n] = kLogSfMax;
    lo[n + 1] = kLogSnMin; hi[n + 1] = kLogSnMax;

    std::vector<sVector> starts;
    if (warm) starts.push_back(*warm);
    {
        sVector c(n + 2);
        for (std::size_t i = 0; i < n; ++i) c[i] = std::log(0.3);
        c[n] = 0.0;
        c[n + 1] = std::log(1e-6);
        starts.push_back(c);
    }
    const int nHalton = warm ? 3 : 5;
    for (int s = 1; s <= nHalton; ++s)
    {
        sVector c(n + 2);
        for (std::size_t d = 0; d < n + 2; ++d)
            c[d] = lo[d] + (hi[d] - lo[d]) * radicalInverse(s, kPrimes[d % 12]);
        starts.push_back(c);
    }

    std::vector<double> L;
    sVector alpha;
    double best = -std::numeric_limits<double>::infinity();
    sVector bestTh;
    int evals = 0;
    for (const auto& s0 : starts)
    {
        sVector th = s0;
        for (std::size_t d = 0; d < n + 2; ++d)
            th[d] = std::min(hi[d], std::max(lo[d], th[d]));
        auto F = [&](const sVector& t) {
            double j2 = 0.0;
            std::vector<double> L2;
            sVector a2;
            const double v = logMarginal(t, X, y, L2, a2, j2);
            return std::isfinite(v) ? v : -1e300;
        };
        const double v = patternMax(F, th, lo, hi, 1.0, 0.02, 200, evals);
        if (v > best) { best = v; bestTh = th; }
    }
    g.theta = bestTh;
    g.lml = logMarginal(bestTh, X, y, g.L, g.alpha, g.jitter);
    if (!std::isfinite(g.lml))
        throw std::runtime_error("bayesOpt: the GP '" + label
            + "' could not be factored even with jitter 1e-4");
    g.starts = static_cast<int>(starts.size());
    g.lmlEvals = evals;
    if (verbosity >= 1)
    {
        os << "    [GP " << label << "]  " << g.m << " points, " << g.starts
           << " starts, " << evals << " likelihood evaluations, log ML = "
           << std::setprecision(5) << g.lml << ";  l =";
        for (std::size_t i = 0; i < n; ++i)
            os << ' ' << std::setprecision(3) << std::exp(g.theta[i]);
        os << ", sf2 = " << std::setprecision(3) << std::exp(g.theta[n])
           << ", sn2 = " << std::scientific << std::setprecision(2)
           << std::exp(g.theta[n + 1]) << ", jitter = " << g.jitter
           << std::defaultfloat << "\n";
    }
    return g;
}

//  Predictive mean and sd of the latent function (R&W Algorithm 2.1), in the
//  units of the data.
void predict(const GP& g, const sVector& u, double& mean, double& sd)
{
    const std::size_t m = g.m, n = g.n;
    sVector k(m), v;
    double mu = 0.0;
    for (std::size_t i = 0; i < m; ++i)
    {
        k[i] = kern(g.theta, n, g.X[i], u);
        mu += k[i] * g.alpha[i];
    }
    forwardSolve(g.L, m, k, v);
    double vv = 0.0;
    for (double t : v) vv += t * t;
    const double var = std::max(0.0, std::exp(g.theta[n]) - vv);
    mean = g.ymean + g.ysd * mu;
    sd = g.ysd * std::sqrt(var);
}

} // namespace

// ===========================================================================
BayesResult bayesOpt(const BayesEvaluator& eval, const sVector& lo,
                     const sVector& hi, std::size_t nIneq,
                     const BayesOptions& opts)
{
    const std::size_t n = lo.size();
    if (n == 0 || hi.size() != n)
        throw std::runtime_error("bayesOpt: lo and hi must have the same,"
                                 " non-zero length");
    for (std::size_t i = 0; i < n; ++i)
        if (!(lo[i] < hi[i]))
            throw std::runtime_error("bayesOpt: every variable needs min < max");
    if (opts.budget < 2)
        throw std::runtime_error("bayesOpt: the budget must be at least 2");

    std::ostream& os = opts.out ? *opts.out : std::cout;
    const int vb = opts.verbosity;
    auto isInt = [&](std::size_t i) {
        return i < opts.isInt.size() && opts.isInt[i];
    };
    const int nInit = std::min(opts.budget,
                               opts.nInit > 0 ? opts.nInit
                                              : static_cast<int>(2 * n + 2));

    std::mt19937_64 rng(opts.seed);
    std::uniform_real_distribution<double> U01(0.0, 1.0);
    sVector shift(n);
    for (auto& s : shift) s = U01(rng);

    // Scaled <-> physical, with integers rounded (and the scaled point
    // moved to the rounded value, so the GP sees what was simulated).
    auto snap = [&](sVector& u, sVector& x) {
        x.assign(n, 0.0);
        for (std::size_t i = 0; i < n; ++i)
        {
            u[i] = std::min(1.0, std::max(0.0, u[i]));
            double xi = lo[i] + u[i] * (hi[i] - lo[i]);
            if (isInt(i))
            {
                xi = std::min(hi[i], std::max(lo[i], std::round(xi)));
                u[i] = (xi - lo[i]) / (hi[i] - lo[i]);
            }
            x[i] = xi;
        }
    };

    if (vb >= 1)
    {
        os << "\n  Bayesian optimisation  (Gaussian process, expected improvement"
              " x probability of feasibility)\n"
           << "    variables " << n << ", inequality constraints " << nIneq
           << ", budget " << opts.budget << " simulations, start design "
           << nInit << ", seed " << opts.seed << ", stop when the acquisition <"
           << opts.eiTol << " x observed range\n"
           << "    no multipliers: no shadow prices and no KKT certificate; "
              "finish with `method sqp` from the best point\n";
        for (std::size_t i = 0; i < n; ++i)
            if (isInt(i))
                os << "    variable " << i << " is integer: rounded before every"
                      " simulation\n";
    }

    BayesResult R;
    std::vector<sVector> U;          // scaled points, every simulation
    std::vector<sVector> gMeanPred, gSdPred;  // per point, constraint predictions
    std::vector<bool> hasGPred;
    sVector warmObj;
    std::vector<sVector> warmCon(nIneq);
    unsigned haltonIndex = 0;

    auto nextHalton = [&]() {
        sVector u(n);
        ++haltonIndex;
        for (std::size_t d = 0; d < n; ++d)
        {
            double h = radicalInverse(haltonIndex, kPrimes[d % 12]) + shift[d];
            u[d] = h - std::floor(h);
        }
        return u;
    };

    auto runPoint = [&](sVector u, bool design, double pm, double ps, double ei,
                        double pf, const sVector& gm, const sVector& gs,
                        bool hasPred) {
        sVector x;
        snap(u, x);
        BayesPoint P;
        P.index = static_cast<int>(R.history.size()) + 1;
        P.x = x;
        P.design = design;
        P.predMean = pm; P.predSd = ps; P.ei = ei; P.pFeas = pf;
        BayesResponse resp;
        try
        {
            resp = eval(x);
        }
        catch (const std::exception& e)
        {
            resp.ok = false;
            resp.failCause = std::string("threw: ") + e.what();
        }
        if (resp.ok && (!std::isfinite(resp.f) || resp.g.size() != nIneq))
        {
            resp.ok = false;
            resp.failCause = "non-finite or mis-sized response";
        }
        if (resp.ok)
            for (double v : resp.g)
                if (!std::isfinite(v))
                {
                    resp.ok = false;
                    resp.failCause = "non-finite constraint";
                }
        P.ok = resp.ok;
        P.f = resp.f;
        P.g = resp.g;
        P.feasible = false;
        if (P.ok)
        {
            P.feasible = true;
            for (double v : P.g)
                if (v > opts.feasTol) P.feasible = false;
        }
        else
            ++R.failed;
        if (P.ok && hasPred)
        {
            P.covered = std::fabs(P.f - pm) <= 1.96 * ps;
            ++R.predicted;
            if (P.covered) ++R.covered;
        }
        // best after
        double bestF = std::numeric_limits<double>::quiet_NaN();
        for (const auto& q : R.history)
            if (q.ok && q.feasible && (std::isnan(bestF) || q.f < bestF)) bestF = q.f;
        if (P.ok && P.feasible && (std::isnan(bestF) || P.f < bestF)) bestF = P.f;
        P.bestAfter = bestF;
        R.history.push_back(P);
        U.push_back(u);
        gMeanPred.push_back(gm);
        gSdPred.push_back(gs);
        hasGPred.push_back(hasPred);
        if (vb >= 1)
        {
            os << "  [sim " << std::setw(3) << P.index << "]  ";
            if (design) os << "start design";
            else
                os << "next: EI " << std::setprecision(4) << ei << ", P(feasible) "
                   << std::setprecision(3) << pf;
            os << "\n      x =";
            for (double v : x) os << ' ' << std::setprecision(6) << v;
            if (hasPred)
            {
                os << "\n      predicted f " << std::setprecision(6) << pm
                   << "  [" << pm - 1.96 * ps << ", " << pm + 1.96 * ps << "]";
                for (std::size_t k = 0; k < gm.size(); ++k)
                    os << "   g" << k << " " << std::setprecision(4) << gm[k]
                       << " +-" << 1.96 * gs[k];
            }
            if (!P.ok)
                os << "\n      FAILED -- " << resp.failCause
                   << "  (not a number for any GP; steers the search away)\n";
            else
            {
                os << "\n      outcome   f " << std::setprecision(6) << P.f;
                for (std::size_t k = 0; k < P.g.size(); ++k)
                    os << "   g" << k << " " << std::setprecision(4) << P.g[k];
                os << (P.feasible ? "   feasible" : "   INFEASIBLE");
                if (hasPred) os << (P.covered ? "   inside band" : "   OUTSIDE band");
                os << "\n";
            }
            if (!std::isnan(bestF))
                os << "      best feasible so far " << std::setprecision(8)
                   << bestF << "\n";
            os << std::defaultfloat;
        }
    };

    const sVector none;
    // --- start design -----------------------------------------------------
    {
        int placed = 0;
        if (opts.x0.size() == n)
        {
            sVector u(n);
            for (std::size_t i = 0; i < n; ++i)
                u[i] = (opts.x0[i] - lo[i]) / (hi[i] - lo[i]);
            runPoint(u, true, 0, 0, 0, 1, none, none, false);
            ++placed;
        }
        while (placed < nInit)
        {
            runPoint(nextHalton(), true, 0, 0, 0, 1, none, none, false);
            ++placed;
        }
    }

    // --- the loop ---------------------------------------------------------
    std::string reason = "budget exhausted";
    while (static_cast<int>(R.history.size()) < opts.budget)
    {
        // observed data
        std::vector<sVector> Xok, Xf;
        sVector yf;
        std::vector<sVector> gcol(nIneq);
        std::vector<sVector> failedU;
        double bestF = std::numeric_limits<double>::infinity();
        bool haveFeas = false;
        double fmin = std::numeric_limits<double>::infinity();
        double fmax = -fmin;
        for (std::size_t i = 0; i < R.history.size(); ++i)
        {
            const auto& P = R.history[i];
            if (!P.ok) { failedU.push_back(U[i]); continue; }
            Xok.push_back(U[i]);
            yf.push_back(P.f);
            for (std::size_t k = 0; k < nIneq; ++k) gcol[k].push_back(P.g[k]);
            fmin = std::min(fmin, P.f);
            fmax = std::max(fmax, P.f);
            if (P.feasible && P.f < bestF) { bestF = P.f; haveFeas = true; }
        }
        if (Xok.size() < 2)
        {
            if (vb >= 1)
                os << "  fewer than two successful simulations: next point from"
                      " the start sequence\n";
            runPoint(nextHalton(), true, 0, 0, 0, 1, none, none, false);
            continue;
        }
        if (vb >= 1)
            os << "  -- fit after " << R.history.size() << " simulations ("
               << Xok.size() << " usable, " << failedU.size() << " failed)\n";
        GP gf = fitGP(Xok, yf, warmObj.empty() ? nullptr : &warmObj,
                      "objective", os, vb);
        warmObj = gf.theta;
        R.maxJitter = std::max(R.maxJitter, gf.jitter);
        std::vector<GP> gc;
        for (std::size_t k = 0; k < nIneq; ++k)
        {
            gc.push_back(fitGP(Xok, gcol[k], warmCon[k].empty() ? nullptr : &warmCon[k],
                               "constraint " + std::to_string(k), os, vb));
            warmCon[k] = gc.back().theta;
            R.maxJitter = std::max(R.maxJitter, gc.back().jitter);
        }

        struct Eval { double alpha, ei, pf, pm, ps; sVector gm, gs; };
        auto acq = [&](const sVector& u0) {
            sVector u = u0, xs;
            snap(u, xs);
            Eval e;
            predict(gf, u, e.pm, e.ps);
            e.ei = 0.0;
            if (haveFeas)
            {
                if (e.ps > 1e-12)
                {
                    const double z = (bestF - e.pm) / e.ps;
                    e.ei = e.ps * (z * normCdf(z) + normPdf(z));
                }
                else
                    e.ei = std::max(0.0, bestF - e.pm);
            }
            e.pf = 1.0;
            e.gm.assign(nIneq, 0.0);
            e.gs.assign(nIneq, 0.0);
            for (std::size_t k = 0; k < nIneq; ++k)
            {
                predict(gc[k], u, e.gm[k], e.gs[k]);
                if (e.gs[k] > 1e-12)
                    e.pf *= normCdf((opts.feasTol - e.gm[k]) / e.gs[k]);
                else
                    e.pf *= (e.gm[k] <= opts.feasTol) ? 1.0 : 0.0;
            }
            double nearest = std::numeric_limits<double>::infinity();
            for (const auto& fu : failedU)
            {
                double d2 = 0.0;
                for (std::size_t i = 0; i < n; ++i)
                    d2 += (u[i] - fu[i]) * (u[i] - fu[i]);
                nearest = std::min(nearest, d2);
            }
            const double ff = failedU.empty()
                ? 1.0 : 1.0 - std::exp(-0.5 * nearest / (kFailLen * kFailLen));
            e.pf *= ff;
            e.alpha = haveFeas ? e.ei * e.pf : e.pf;
            return e;
        };

        // maximise the acquisition: random cloud, then pattern search
        const int nCand = static_cast<int>(400 * n + 400);
        struct Cand { double a; sVector u; };
        std::vector<Cand> cloud;
        cloud.reserve(nCand);
        for (int c = 0; c < nCand; ++c)
        {
            sVector u(n);
            for (auto& v : u) v = U01(rng);
            cloud.push_back({acq(u).alpha, u});
        }
        std::sort(cloud.begin(), cloud.end(),
                  [](const Cand& a, const Cand& b) { return a.a > b.a; });
        const sVector zero(n, 0.0), one(n, 1.0);
        std::vector<Cand> refined;
        for (int c = 0; c < std::min<int>(5, cloud.size()); ++c)
        {
            sVector u = cloud[c].u;
            int ev = 0;
            auto F = [&](const sVector& t) { return acq(t).alpha; };
            const double a = patternMax(F, u, zero, one, 0.05, 1e-4, 300, ev);
            refined.push_back({a, u});
        }
        for (const auto& c : cloud) refined.push_back(c);
        std::stable_sort(refined.begin(), refined.end(),
                         [](const Cand& a, const Cand& b) { return a.a > b.a; });

        auto duplicate = [&](sVector u) {
            sVector xs;
            snap(u, xs);
            for (const auto& q : U)
            {
                double d2 = 0.0;
                for (std::size_t i = 0; i < n; ++i) d2 += (u[i] - q[i]) * (u[i] - q[i]);
                if (d2 < 1e-12) return true;
            }
            return false;
        };
        const Cand* pick = nullptr;
        for (const auto& c : refined)
            if (!duplicate(c.u)) { pick = &c; break; }
        if (!pick) { reason = "no new point left to try"; break; }
        const Eval e = acq(pick->u);
        if (haveFeas && opts.eiTol > 0.0 && fmax > fmin
            && e.alpha < opts.eiTol * (fmax - fmin))
        {
            if (vb >= 1)
                os << "  acquisition " << std::setprecision(3) << e.alpha
                   << " < " << opts.eiTol << " x observed range "
                   << (fmax - fmin) << ": stop\n";
            reason = "expected improvement below the stated fraction of the range";
            break;
        }
        runPoint(pick->u, false, e.pm, e.ps, e.ei, e.pf, e.gm, e.gs, true);
    }

    // --- result -----------------------------------------------------------
    R.evaluations = static_cast<int>(R.history.size());
    R.reason = reason;
    {
        int bi = -1;
        for (std::size_t i = 0; i < R.history.size(); ++i)
        {
            const auto& P = R.history[i];
            if (P.ok && P.feasible && (bi < 0 || P.f < R.history[bi].f)) bi = static_cast<int>(i);
        }
        R.feasible = (bi >= 0);
        if (bi < 0)
        {
            double bv = std::numeric_limits<double>::infinity();
            for (std::size_t i = 0; i < R.history.size(); ++i)
            {
                const auto& P = R.history[i];
                if (!P.ok) continue;
                double v = 0.0;
                for (double gv : P.g) v = std::max(v, gv);
                if (v < bv) { bv = v; bi = static_cast<int>(i); }
            }
        }
        if (bi >= 0)
        {
            R.x = R.history[bi].x;
            R.f = R.history[bi].f;
        }
    }
    if (vb >= 1)
    {
        os << "\n  Prediction against outcome (the surrogate's honesty)\n"
           << "    sim   predicted f [95 % band]            outcome f      z     in band\n";
        for (const auto& P : R.history)
        {
            if (P.design || !P.ok) continue;
            const double z = P.predSd > 0 ? (P.f - P.predMean) / P.predSd : 0.0;
            os << "    " << std::setw(3) << P.index << "   " << std::setw(12)
               << std::setprecision(5) << P.predMean << " [" << std::setw(11)
               << P.predMean - 1.96 * P.predSd << ", " << std::setw(11)
               << P.predMean + 1.96 * P.predSd << "]  " << std::setw(12) << P.f
               << "  " << std::setw(6) << std::setprecision(3) << z
               << (P.covered ? "   yes" : "   NO") << "\n";
        }
        os << "    objective band coverage: " << R.covered << " of " << R.predicted
           << " predicted points inside the 95 % band";
        if (R.predicted > 0)
            os << "  (" << std::fixed << std::setprecision(0)
               << 100.0 * R.covered / R.predicted << " %)" << std::defaultfloat;
        os << "\n";
        for (std::size_t k = 0; k < nIneq; ++k)
        {
            int c = 0, t = 0;
            for (std::size_t i = 0; i < R.history.size(); ++i)
            {
                const auto& P = R.history[i];
                if (!hasGPred[i] || !P.ok) continue;
                ++t;
                if (std::fabs(P.g[k] - gMeanPred[i][k]) <= 1.96 * gSdPred[i][k]) ++c;
            }
            os << "    constraint " << k << " band coverage: " << c << " of " << t << "\n";
        }
        os << "  stopped: " << reason << "; " << R.evaluations << " simulations ("
           << R.failed << " failed), largest jitter " << std::scientific
           << std::setprecision(1) << R.maxJitter << std::defaultfloat << "\n";
        if (R.feasible)
        {
            os << "  best feasible f = " << std::setprecision(10) << R.f << " at x =";
            for (double v : R.x) os << ' ' << std::setprecision(8) << v;
            os << "\n";
        }
        else
            os << "  NO FEASIBLE POINT FOUND; the least violating point is returned\n";
        os << "  no multipliers: recommend `method sqp` started from this point"
              " for the shadow prices and the KKT certificate\n";
    }
    return R;
}

// ===========================================================================
//  Self-check.  Branin (Dixon & Szego 1978): f* = 0.397887 on
//  [-5,10]x[0,15].  A constrained 2-D problem (Floudas & Pardalos 1990):
//  min -x1-x2, x2 <= 2x1^4-8x1^3+8x1^2+2, x2 <= 4x1^4-32x1^3+88x1^2-96x1+36,
//  box [0,3]x[0,4], f* = -5.5080 (checked here by a fine grid, 2026-11-24).
//  Tolerance and budget are stated, the seed fixed.
// ===========================================================================
scalar verifyBayesOpt(int verbosity)
{
    constexpr double braninBest = 0.397887;
    constexpr double fpBest = -5.5080;
    constexpr double braninTol = 0.05;   // absolute
    constexpr double fpTol = 0.05;       // absolute
    constexpr int braninBudget = 30;
    constexpr int fpBudget = 40;

    auto branin = [](const sVector& x) {
        BayesResponse r;
        const double a = 1.0, b = 5.1 / (4 * kPi * kPi), c = 5.0 / kPi,
                     rr = 6.0, s = 10.0, t = 1.0 / (8 * kPi);
        const double q = x[1] - b * x[0] * x[0] + c * x[0] - rr;
        r.f = a * q * q + s * (1 - t) * std::cos(x[0]) + s;
        return r;
    };
    auto fp = [](const sVector& x) {
        BayesResponse r;
        const double x1 = x[0], x2 = x[1];
        r.f = -x1 - x2;
        r.g = {x2 - (2 * x1 * x1 * x1 * x1 - 8 * x1 * x1 * x1 + 8 * x1 * x1 + 2),
               x2 - (4 * x1 * x1 * x1 * x1 - 32 * x1 * x1 * x1 + 88 * x1 * x1
                     - 96 * x1 + 36)};
        return r;
    };

    std::ostringstream sink;
    BayesOptions o;
    o.verbosity = 0;
    o.eiTol = 0.0;
    o.seed = 499;
    o.budget = braninBudget;
    const auto rb = bayesOpt(branin, {-5.0, 0.0}, {10.0, 15.0}, 0, o);
    const double eb = std::fabs(rb.f - braninBest);
    o.budget = fpBudget;
    const auto rc = bayesOpt(fp, {0.0, 0.0}, {3.0, 4.0}, 2, o);
    const double ec = std::fabs(rc.f - fpBest);
    if (verbosity >= 1)
        std::cout << "  [self-check]  Branin " << braninBudget << " sims: f = "
                  << rb.f << " (published " << braninBest << ", |df| " << eb
                  << ", tol " << braninTol << ");  constrained 2-D " << fpBudget
                  << " sims: f = " << rc.f << " (published " << fpBest
                  << ", |df| " << ec << ", tol " << fpTol << ")\n";
    if (!(eb <= braninTol))
        throw std::runtime_error("verifyBayesOpt: Branin missed its published"
            " optimum by " + std::to_string(eb) + " within "
            + std::to_string(braninBudget) + " simulations");
    if (!rc.feasible || !(ec <= fpTol))
        throw std::runtime_error("verifyBayesOpt: the constrained problem missed"
            " its published optimum by " + std::to_string(ec) + " within "
            + std::to_string(fpBudget) + " simulations");
    return std::max(eb, ec);
}

} // namespace Choupo::solver
