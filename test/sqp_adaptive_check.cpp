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
    This file is part of Choupo.  GNU GPL-3.0-or-later, see LICENSE.
    SPDX-License-Identifier: GPL-3.0-or-later

    Credit and attribution: see AUTHORS
    Required legal notices:  see NOTICE
-------------------------------------------------------------------------------
File
    sqp_adaptive_check.cpp

Description
    C496 (Opus review, docs/audits/2026-11-24-c496-opus-review.md): every
    failing input the review named, as an arm, plus the four invariants of
    the adaptive SQP (fdMode auto).  A real defect each arm would have
    caught is named in its header.  Built standalone against src/solver
    (bin/runTests gate check_sqp_adaptive builds and runs it):

      g++ -std=c++17 -O1 -Isrc test/sqp_adaptive_check.cpp src/solver/SQP.cpp \
          src/solver/ActiveSetQP.cpp src/solver/NewtonND.cpp src/solver/LU.cpp \
          src/solver/BlockTridiagonal.cpp

    Prints one PASS/FAIL line per arm and exits non-zero on any FAIL.
    `sqp_adaptive_check ARM` runs one arm.
\*---------------------------------------------------------------------------*/

#include "solver/ActiveSetQP.H"
#include "solver/SQP.H"

#include <algorithm>
#include <cmath>
#include <functional>
#include <iostream>
#include <map>
#include <sstream>
#include <string>
#include <vector>

using namespace Choupo;
using namespace Choupo::solver;

namespace {

const scalar kNaN = std::numeric_limits<scalar>::quiet_NaN();
const scalar kInf = std::numeric_limits<scalar>::infinity();
int gOutside = 0;
std::string gInfo;   // one-line summary of the last run, printed beside PASS   // invariant (a): evaluations outside the declared box, all arms

struct Prob
{
    std::function<scalar(const sVector&)> f;
    std::vector<std::function<scalar(const sVector&)>> h, g;
    sVector lo, hi, x0;
    scalar  noise    = 0.0;     // absolute uniform noise amplitude on every response
    scalar  noiseRel = 0.0;     // relative uniform noise amplitude
    unsigned long long seed = 88172645463325252ULL;
    std::function<bool(const sVector&)> fails;   // model failure region
    std::function<scalar(const sVector&, std::size_t)> noiseAt;  // extra deterministic wiggle
};

struct Run
{
    SQPResult R;
    int outside = 0;            // evaluations outside the declared box
    int evals = 0;
    std::vector<std::string> reports;
    std::vector<std::string> notes;
};

Run run(const Prob& p, SQPOptions o, bool adaptive = true)
{
    Run out;
    unsigned long long lcg = p.seed;
    auto u = [&]() -> scalar {
        lcg = lcg * 6364136223846793005ULL + 1442695040888963407ULL;
        return static_cast<scalar>((lcg >> 11) & 0xFFFFFFFFFFFFULL) / 140737488355328.0 - 1.0;
    };
    auto eval = [&](const sVector& x) -> SQPResponse
    {
        ++out.evals;
        for (std::size_t j = 0; j < x.size(); ++j)
            if (x[j] < p.lo[j] || x[j] > p.hi[j]) { ++out.outside; ++gOutside; break; }
        SQPResponse r;
        if (p.fails && p.fails(x)) { r.ok = false; return r; }
        auto nz = [&](scalar v) { return (p.noise > 0.0 ? p.noise * u() : 0.0)
                                       + (p.noiseRel > 0.0 ? p.noiseRel * std::abs(v) * u() : 0.0); };
        r.f = p.f(x); r.f += nz(r.f);
        for (const auto& hj : p.h) { scalar v = hj(x); r.h.push_back(v + nz(v)); }
        for (const auto& gk : p.g) { scalar v = gk(x); r.g.push_back(v + nz(v)); }
        return r;
    };
    o.adaptiveFd = adaptive;
    if (adaptive) o.maxIter = std::max(o.maxIter, 60);
    o.onIter = [&](const SQPTrace& t)
    {
        out.reports.push_back(t.fdReport);
        out.notes.push_back(t.note);
    };
    out.R = sqp(eval, p.x0, p.lo, p.hi, p.h.size(), p.g.size(), o);
    {
        std::ostringstream os;
        os << (out.R.converged ? "converged" : "stopped") << " x=" << out.R.x[0] << " f=" << out.R.f
           << " evals=" << out.evals << " statBar=" << out.R.statBar << "/" << out.R.statTolUsed;
        if (!out.R.lambdaIneq.empty()) os << " lamI=" << out.R.lambdaIneq[0] << "+-"
            << (out.R.sigmaLamIneq.empty() ? kNaN : out.R.sigmaLamIneq[0]);
        if (!out.R.lambdaEq.empty()) os << " lamE=" << out.R.lambdaEq[0] << "+-"
            << (out.R.sigmaLamEq.empty() ? kNaN : out.R.sigmaLamEq[0]);
        os << " [" << out.R.reason.substr(0, 60) << "]";
        gInfo = os.str();
    }
    return out;
}

SQPOptions baseOpts()
{
    SQPOptions o;
    o.fdStep = 1.0e-5;
    o.central = false;
    return o;
}

//  a printed bar is honest when it is unavailable or covers the error
bool honest(scalar lam, scalar exact, scalar bar, scalar nsig = 3.0)
{
    if (!std::isfinite(bar)) return true;
    return std::abs(lam - exact) <= nsig * bar + 1.0e-12 * std::max(1.0, std::abs(exact));
}

using Arm = std::function<std::string()>;
std::map<std::string, Arm> arms;
std::vector<std::string> armOrder;
void add(const std::string& name, Arm a) { arms[name] = a; armOrder.push_back(name); }

std::string num(scalar v) { std::ostringstream os; os << v; return os.str(); }

bool has(const std::string& s, const std::string& sub) { return s.find(sub) != std::string::npos; }

// ---------------------------------------------------------------------------
Prob smoothQuad(scalar x0, scalar xs)
{
    Prob p;
    p.f = [xs](const sVector& x) { return (x[0] - xs) * (x[0] - xs); };
    p.lo = {0.0}; p.hi = {1.0}; p.x0 = {x0};
    return p;
}

void defineArms()
{
    // 2. ECnoise ---------------------------------------------------------
    //  DEFECT: one jump of 1.0 inside the nine points and no noise at all
    //  was reported "noise 2.2e-01 (ECnoise)", h = 0.05.
    add("ecnoise_jump", []() -> std::string {
        Prob p = smoothQuad(0.1, 0.4);
        auto f0 = p.f;
        p.f = [f0](const sVector& x) { return f0(x) + (x[0] > 0.1045 ? 1.0 : 0.0); };
        SQPOptions o = baseOpts(); o.maxIter = 3;
        Run r = run(p, o);
        if (r.reports.empty()) return std::string("no iteration report");
        if (!has(r.reports[0], "noise unknown"))
            return "a jump of 1.0 was reported as a noise level: " + r.reports[0];
        return std::string();
    });
    //  DEFECT: f = x + 0.05 sin(1500 x), smooth, was reported "noise 3.5e-2".
    add("ecnoise_sin1500", []() -> std::string {
        Prob p;
        p.f = [](const sVector& x) { return x[0] + 0.05 * std::sin(1500.0 * x[0]); };
        p.lo = {0.0}; p.hi = {1.0}; p.x0 = {0.3};
        SQPOptions o = baseOpts(); o.maxIter = 3;
        Run r = run(p, o);
        if (r.reports.empty()) return std::string("no iteration report");
        if (!has(r.reports[0], "noise unknown"))
            return "a smooth oscillation was reported as noise: " + r.reports[0];
        return std::string();
    });

    // 3. QP robust mode -----------------------------------------------------
    //  DEFECT: B=[1], g=0, 1e3 d + 1e-7 = 0: robust gave d = 0, "QP INFEASIBLE".
    add("qp_zero_step", []() -> std::string {
        QPProblem q; q.B = {{1.0}}; q.g = {0.0};
        q.Aeq = {{1.0e3}}; q.beq = {1.0e-7}; q.robust = true;
        QPResult R = activeSetQP(q);
        if (!R.converged) return "robust QP not converged: " + R.reason;
        if (std::abs(R.d[0] + 1.0e-10) > 1.0e-12) return "d = " + num(R.d[0]) + " (expected -1e-10)";
        return std::string();
    });
    //  DEFECT: B=I, g=(-10,0), d1 + 1e-6 d2 = 1e-6, -1 <= d1 <= 0, |d2| <= 5:
    //  the default solves it, robust returned INFEASIBLE.
    add("qp_near_dependent", []() -> std::string {
        QPProblem q; q.B = {{1, 0}, {0, 1}}; q.g = {-10.0, 0.0};
        q.Aeq = {{1.0, 1.0e-6}}; q.beq = {-1.0e-6};
        q.Aineq = {{1, 0}, {-1, 0}, {0, 1}, {0, -1}};
        q.bineq = {0.0, -1.0, -5.0, -5.0};
        q.robust = true;
        QPResult R = activeSetQP(q);
        if (!R.converged) return "robust QP not converged: " + R.reason;
        return std::string();
    });
    //  DEFECT: min -10x1 + x2^2 s.t. x1 + 5e-6 x2 = 1.00002, x1 in [0,1],
    //  x2 in [0,5]: default converges at (1,4); auto stopped LOCAL INFEASIBILITY.
    add("sqp_false_infeasible", []() -> std::string {
        Prob p;
        p.f = [](const sVector& x) { return -10.0 * x[0] + x[1] * x[1]; };
        p.h = {[](const sVector& x) { return x[0] + 5.0e-6 * x[1] - 1.00002; }};
        p.lo = {0.0, 0.0}; p.hi = {1.0, 5.0}; p.x0 = {0.5, 1.0};
        Run r = run(p, baseOpts());
        if (has(r.R.reason, "INFEASIBILITY") || has(r.R.reason, "theta = 0"))
            return "false local infeasibility: " + r.R.reason;
        if (std::abs(r.R.x[1] - 4.0) > 1.0e-2 && r.R.converged) return "converged at the wrong point";
        return std::string();
    });
    //  DEFECT: HS13 (min (x1-2)^2 + x2^2, (1-x1)^3 - x2 >= 0, x >= 0) stopped with
    //  "even the fully relaxed linearisation (theta = 0) has no solution".
    add("sqp_hs13_theta0", []() -> std::string {
        Prob p;
        p.f = [](const sVector& x) { return (x[0] - 2.0) * (x[0] - 2.0) + x[1] * x[1]; };
        p.g = {[](const sVector& x) { return x[1] - std::pow(1.0 - x[0], 3); }};
        p.lo = {0.0, 0.0}; p.hi = {5.0, 5.0}; p.x0 = {0.0, 0.5};
        Run r = run(p, baseOpts());
        //  HS13 has no KKT point (LICQ fails at its optimum), so the run may
        //  stop; what it must not do is claim that theta = 0 "has no solution"
        //  (d = 0 satisfies the relaxed linearisation by construction)
        if (has(r.R.reason, "has no solution")) return "false claim: " + r.R.reason;
        if (!r.R.converged && !has(r.R.reason, "a failure of the QP solver") && has(r.R.reason, "theta = 0"))
            return "theta = 0 stop without saying it is a solver failure: " + r.R.reason;
        return std::string();
    });

    // 4. multiplier bars ----------------------------------------------------
    //  DEFECT: constraint 1e3 x^3 - 1 + 1e-6 U: printed 0.12272 +- 5.3e-7,
    //  exact 0.126667 (the bar was 7000 times too small).
    auto cnoise = [](scalar nz, unsigned long long seed) {
        Prob p;
        p.f = [](const sVector& x) { return (x[0] - 2.0) * (x[0] - 2.0) + x[1] * x[1]; };
        p.g = {[](const sVector& x) { return 1.0e3 * x[0] * x[0] * x[0] - 1.0; }};
        p.lo = {0.0, -5.0}; p.hi = {5.0, 5.0}; p.x0 = {0.05, 0.5};
        p.seed = seed;
        (void)nz;
        return p;
    };
    add("bar_constraint_noise", [cnoise]() -> std::string {
        for (scalar nz : {1.0e-6, 1.0e-8})
        {
            Prob p = cnoise(nz, 7);
            //  noise on the constraint only
            auto g0 = p.g[0];
            unsigned long long st = 12345;
            p.g[0] = [g0, nz, st](const sVector& x) mutable {
                st = st * 6364136223846793005ULL + 1442695040888963407ULL;
                return g0(x) + nz * (static_cast<scalar>((st >> 11) & 0xFFFFFFFFFFFFULL) / 140737488355328.0 - 1.0);
            };
            Run r = run(p, baseOpts());
            const scalar lam = r.R.lambdaIneq.empty() ? 0.0 : r.R.lambdaIneq[0];
            const scalar bar = r.R.sigmaLamIneq.empty() ? kNaN : r.R.sigmaLamIneq[0];
            if (!honest(lam, 0.126667, bar))
                return "noise " + num(nz) + ": lambda " + num(lam) + " +- " + num(bar) + " vs exact 0.126667";
        }
        return std::string();
    });
    //  DEFECT: f = 500(x-.6)^2 + 1e-5 U, x <= 0.5, model fails for x > 0.50001:
    //  printed 125.00004 +- 0.005, exact 100, "KKT satisfied".
    add("bar_one_sided", []() -> std::string {
        Prob p;
        p.f = [](const sVector& x) { return 500.0 * (x[0] - 0.6) * (x[0] - 0.6); };
        p.g = {[](const sVector& x) { return x[0] - 0.5; }};
        p.lo = {0.0}; p.hi = {1.0}; p.x0 = {0.3}; p.noise = 1.0e-5;
        p.fails = [](const sVector& x) { return x[0] > 0.50001; };
        Run r = run(p, baseOpts());
        const scalar lam = r.R.lambdaIneq.empty() ? 0.0 : r.R.lambdaIneq[0];
        const scalar bar = r.R.sigmaLamIneq.empty() ? kNaN : r.R.sigmaLamIneq[0];
        if (!honest(lam, 100.0, bar)) return "lambda " + num(lam) + " +- " + num(bar) + " vs exact 100";
        if (r.R.converged && std::abs(lam - 100.0) > 1.0)
            return "certified with lambda " + num(lam) + ", exact 100";
        return std::string();
    });
    //  DEFECT: the bar was that of the least-squares multiplier, the printed
    //  lambda is the QP's: H=[[101,10],[10,1]], x1<=0.3, noise 1e-6, 40 seeds:
    //  actual sd 1.1e-4, mean bar 2.2e-5.
    add("bar_estimator_match", []() -> std::string {
        std::vector<scalar> lams, bars;
        for (int s = 0; s < 40; ++s)
        {
            Prob p;
            p.f = [](const sVector& x) {
                return 0.5 * (101.0 * x[0] * x[0] + 20.0 * x[0] * x[1] + x[1] * x[1])
                     - 111.0 * x[0] - 11.0 * x[1];
            };
            p.g = {[](const sVector& x) { return x[0] - 0.3; }};
            p.lo = {-10.0, -10.0}; p.hi = {10.0, 10.0}; p.x0 = {0.0, 0.0};
            p.noise = 1.0e-6; p.seed = 1000ULL + 7919ULL * s;
            SQPOptions oo = baseOpts(); oo.maxIter = 300;
            //  the bar is a bar of the gradient noise, not of how far the iterate is from
            //  the noisy optimum (the displacement is OMITTED, and says so): tight convergence
            oo.scaledStationarity = false;
            Run r = run(p, oo);
            //  only a run that reached stationarity says what the bar is a bar OF;
            //  one stopped on maxIter or a line search carries a non-convergence error
            if (!(r.R.converged || r.R.stationaryUncertified) || r.R.lambdaIneq.empty()) continue;
            const scalar bar = r.R.sigmaLamIneq.empty() ? kNaN : r.R.sigmaLamIneq[0];
            if (!std::isfinite(bar)) continue;
            lams.push_back(r.R.lambdaIneq[0]); bars.push_back(bar);
        }
        if (lams.size() < 8) return "only " + std::to_string(lams.size()) + " of 40 runs reached stationarity with a bar";
        scalar m = 0.0, mb = 0.0;
        for (std::size_t i = 0; i < lams.size(); ++i) { m += lams[i]; mb += bars[i]; }
        m /= lams.size(); mb /= lams.size();
        //  robust spread (1.4826 MAD): one run that stopped in the flat valley
        //  would otherwise stand for the whole set
        std::vector<scalar> dev;
        std::vector<scalar> sorted = lams; std::sort(sorted.begin(), sorted.end());
        const scalar med = sorted[sorted.size() / 2];
        for (scalar l : lams) dev.push_back(std::abs(l - med));
        std::sort(dev.begin(), dev.end());
        const scalar sd = 1.4826 * dev[dev.size() / 2];
        (void)m;
        //  the review's criterion: mean printed bar over the actual sd of the runs
        const scalar ratio = mb / std::max(sd, 1.0e-300);
        if (ratio < 0.5 || ratio > 2.0)
            return "mean bar " + num(mb) + " vs actual sd " + num(sd) + " (ratio " + num(ratio) + ") over "
                 + std::to_string(lams.size()) + " seeds";
        return std::string();
    });
    //  DEFECT: absolute ridge 1e-12 on A A^T: row 1e-7 (x - 0.5) = 0, noise 1e-8:
    //  printed 9999997.1 +- 5.5e5.
    add("bar_ridge", []() -> std::string {
        Prob p;
        p.f = [](const sVector& x) { return (x[0] - 1.0) * (x[0] - 1.0); };
        p.h = {[](const sVector& x) { return 1.0e-7 * (x[0] - 0.5); }};
        p.lo = {0.0}; p.hi = {2.0}; p.x0 = {0.8}; p.noise = 1.0e-8;
        Run r = run(p, baseOpts());
        const scalar lam = r.R.lambdaEq.empty() ? 0.0 : r.R.lambdaEq[0];
        const scalar bar = r.R.sigmaLamEq.empty() ? kNaN : r.R.sigmaLamEq[0];
        if (!honest(lam, 1.0e7, bar, 1.0)) return "lambda " + num(lam) + " +- " + num(bar) + " vs exact 1e7";
        return std::string();
    });
    //  DEFECT: an inactive constraint printed "0 (+-0.0e+00)".
    add("bar_inactive", []() -> std::string {
        Prob p;
        p.f = [](const sVector& x) { return (x[0] - 0.4) * (x[0] - 0.4); };
        p.g = {[](const sVector& x) { return x[0] - 0.9; }};
        p.lo = {0.0}; p.hi = {1.0}; p.x0 = {0.1}; p.noise = 1.0e-9;
        Run r = run(p, baseOpts());
        if (r.R.ineqActive.size() != 1 || r.R.ineqActive[0]) return std::string("ineqActive not reported false");
        if (!r.R.sigmaLamIneq.empty() && !std::isnan(r.R.sigmaLamIneq[0]))
            return "inactive row carries a bar: " + num(r.R.sigmaLamIneq[0]);
        return std::string();
    });

    // 5. failed evaluations -------------------------------------------------
    //  DEFECT: one failed ECnoise point made eps = 1e-14 for every response
    //  ("noise 1.0e-14 (floor)", h = 4e-9, stat 1508, ...).
    add("estimate_failed_point", []() -> std::string {
        Prob p;
        p.f = [](const sVector& x) { return (x[0] - 0.9) * (x[0] - 0.9); };
        p.lo = {0.0}; p.hi = {1.0}; p.x0 = {0.1}; p.noise = 1.0e-5;
        p.fails = [](const sVector& x) { return std::abs(x[0] - 0.103) < 1.0e-9; };
        Run r = run(p, baseOpts());
        if (r.reports.empty()) return std::string("no iteration report");
        if (has(r.reports[0], "(floor)")) return "a failed point became the floor: " + r.reports[0];
        return std::string();
    });

    // 6. stopping -----------------------------------------------------------
    //  DEFECT: f = 1e8 max(0,.3-x)^2 + 10 (x-.6)^2, relative noise 1e-9,
    //  x0 = 0: "KKT conditions satisfied" at x = 0.575, true gradient -0.5.
    auto cliff = [](scalar K, scalar rel) {
        Prob p;
        p.f = [K](const sVector& x) { return K * std::pow(std::max(0.0, 0.3 - x[0]), 2) + 10.0 * (x[0] - 0.6) * (x[0] - 0.6); };
        p.lo = {0.0}; p.hi = {1.0}; p.x0 = {0.0}; p.noiseRel = rel;
        return p;
    };
    add("certificate_nonstationary", [cliff]() -> std::string {
        Run r = run(cliff(1.0e8, 1.0e-9), baseOpts());
        if (r.R.converged && std::abs(r.R.x[0] - 0.6) > 1.0e-3)
            return "certified x = " + num(r.R.x[0]) + " (optimum 0.6)";
        return std::string();
    });
    //  DEFECT (79bf454c79, which is NOT taken): K = 2e10, relative noise 1e-12
    //  certified x = 1, f = 1.6.  Regression guard: must never be certified.
    add("certificate_k2e10", [cliff]() -> std::string {
        Run r = run(cliff(2.0e10, 1.0e-12), baseOpts());
        if (r.R.converged && std::abs(r.R.x[0] - 0.6) > 1.0e-3)
            return "certified x = " + num(r.R.x[0]) + " f = " + num(r.R.f);
        return std::string();
    });
    //  DEFECT: min 2 (x-1.5)^2 on [0,1] evaluated x = 1.0000002.
    add("box_reused_step", []() -> std::string {
        Prob p;
        p.f = [](const sVector& x) { return 2.0 * (x[0] - 1.5) * (x[0] - 1.5); };
        p.lo = {0.0}; p.hi = {1.0}; p.x0 = {0.5}; p.noise = 1.0e-9;
        Run r = run(p, baseOpts());
        if (r.outside > 0) return std::to_string(r.outside) + " evaluations outside the box";
        return std::string();
    });
    //  DEFECT: a variable whose box is narrower than the step (optim05's
    //  T_feed: h = 17.5 K scaled against a box that ends 17.5 K sooner) went
    //  forward across the bound.
    add("box_narrow", []() -> std::string {
        Prob p;
        p.f = [](const sVector& x) { return (x[0] - 3.0) * (x[0] - 3.0) + 0.5 * (x[1] - 0.2) * (x[1] - 0.2); };
        p.lo = {0.0, 0.0}; p.hi = {0.02, 1.0}; p.x0 = {0.01, 0.5}; p.noise = 1.0e-7;
        Run r = run(p, baseOpts());
        if (r.outside > 0) return std::to_string(r.outside) + " evaluations outside the box";
        return std::string();
    });
    //  optim05's geometry: T_feed in [348, 352.5] K scaled by 350 is [0.99429, 1.00714],
    //  a box narrower than the largest step (0.05 scaled = 17.5 K); the first version
    //  simulated 367.5 K against the declared 352.5 K.  An objective of 6.6e8 with
    //  absolute noise 2e-4 (relative 3e-13) and its minimum beyond both bounds.
    add("box_optim05_geometry", []() -> std::string {
        Prob p;
        p.f = [](const sVector& x) { return 6.6e8 + 1.0e8 * (0.01 * (x[0] - 9.0) * (x[0] - 9.0) + (x[1] - 1.2) * (x[1] - 1.2)); };
        p.g = {[](const sVector& x) { return x[0] - 7.5; }};
        p.lo = {0.25, 348.0 / 350.0}; p.hi = {7.5, 352.5 / 350.0}; p.x0 = {1.0, 1.0}; p.noise = 2.0e-4;
        SQPOptions o = baseOpts(); o.typX = {1.0, 1.0};
        Run r = run(p, o);
        if (r.outside > 0) return std::to_string(r.outside) + " evaluations outside the box (T above 352.5 K)";
        return std::string();
    });
    add("box_failed_side_fallback", []() -> std::string {
        //  the forward side fails: the fallback side must be inside the box too
        Prob p;
        p.f = [](const sVector& x) { return (x[0] + 1.0) * (x[0] + 1.0); };
        p.lo = {0.0}; p.hi = {1.0}; p.x0 = {0.0}; p.noise = 1.0e-9;
        p.fails = [](const sVector& x) { return x[0] > 1.0e-4; };
        Run r = run(p, baseOpts());
        if (r.outside > 0) return std::to_string(r.outside) + " evaluations outside the box";
        return std::string();
    });

    // 3. invariants ---------------------------------------------------------
    //  (b) a CONVERGED verdict needs a bar at the point that is below the
    //  tolerance.  Smooth 2-variable problem, clean: certified, bar finite.
    add("inv_b_clean_certified", []() -> std::string {
        Prob p;
        p.f = [](const sVector& x) { return (x[0] - 0.3) * (x[0] - 0.3) + 2.0 * (x[1] - 0.7) * (x[1] - 0.7); };
        p.lo = {0.0, 0.0}; p.hi = {1.0, 1.0}; p.x0 = {0.9, 0.1};
        Run r = run(p, baseOpts());
        if (!r.R.converged) return "clean smooth problem not converged: " + r.R.reason;
        if (!r.R.certified || !std::isfinite(r.R.statBar) || r.R.statBar > r.R.statTolUsed)
            return "converged without a certified bar (statBar " + num(r.R.statBar) + ", tol " + num(r.R.statTolUsed) + ")";
        return std::string();
    });
    add("inv_b_noisy_not_certified", []() -> std::string {
        Prob p;
        p.f = [](const sVector& x) { return (x[0] - 0.3) * (x[0] - 0.3) + 2.0 * (x[1] - 0.7) * (x[1] - 0.7); };
        p.lo = {0.0, 0.0}; p.hi = {1.0, 1.0}; p.x0 = {0.9, 0.1}; p.noise = 1.0e-3;
        Run r = run(p, baseOpts());
        if (r.R.converged && !(std::isfinite(r.R.statBar) && r.R.statBar <= r.R.statTolUsed))
            return "CONVERGED with statBar " + num(r.R.statBar) + " against tolerance " + num(r.R.statTolUsed);
        if (r.R.converged && !r.R.certified) return "converged but not certified";
        return std::string();
    });
}

} // namespace

int main(int argc, char** argv)
{
    defineArms();
    int fails = 0;
    for (const auto& name : armOrder)
    {
        if (argc > 1 && name != argv[1]) continue;
        std::string msg;
        const int out0 = gOutside;
        try { msg = arms[name](); }
        catch (const std::exception& e) { msg = std::string("threw: ") + e.what(); }
        if (msg.empty() && gOutside > out0)
            msg = "invariant (a): " + std::to_string(gOutside - out0) + " evaluations outside the box";
        std::cout << (msg.empty() ? "PASS " : "FAIL ") << name;
        if (!msg.empty()) { std::cout << "  -- " << msg; ++fails; }
        else if (!gInfo.empty()) std::cout << "  (" << gInfo << ")";
        gInfo.clear();
        std::cout << "\n";
    }
    std::cout << (fails == 0 ? "ALL PASS" : "FAILURES: " + std::to_string(fails)) << "\n";
    return fails == 0 ? 0 : 1;
}
