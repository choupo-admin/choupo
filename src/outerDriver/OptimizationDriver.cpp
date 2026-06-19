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

#include "OptimizationDriver.H"
#include "ResponseExtractor.H"
#include "core/ResultEmitter.H"
#include "postProcessing/PostProcessor.H"
#include "solver/ActiveSetQP.H"
#include "solver/NelderMead.H"
#include "solver/SQP.H"

#include <cmath>
#include <fstream>
#include <iomanip>
#include <iostream>
#include <limits>
#include <sstream>
#include <stdexcept>

namespace Choupo {

namespace {

// Parse "<a>.<b>" -> {a, b}.  Throws if the dot is missing.
std::pair<std::string, std::string> splitDot(const std::string& s,
                                             const std::string& ctx)
{
    const auto dot = s.find('.');
    if (dot == std::string::npos || dot == 0 || dot + 1 == s.size())
        throw std::runtime_error(ctx + ": expected '<a>.<b>', got '" + s + "'");
    return {s.substr(0, dot), s.substr(dot + 1)};
}

// Extract the objective scalar from the (possibly post-processed) result.
scalar extractObjective(const SimulationResult& r,
                        OptimizationDriver::Kind kind,
                        const std::string& path)
{
    using Kind = OptimizationDriver::Kind;

    switch (kind)
    {
        case Kind::Kpi:
        case Kind::Stream:
            // The shared dotted-path resolver handles both (unit KPI and
            // stream field) in canonical SI -- one taxonomy for every driver.
            return extractResponse(r, path, "optimization");

        case Kind::Cost:
        {
            auto [unit, field] = splitDot(path, "objective.path (cost)");
            auto itC = r.costs.find(unit);
            if (itC == r.costs.end())
                throw std::runtime_error("optimization: unit '" + unit
                    + "' has no costs in this result -- did the post chain run?");
            const auto& c = itC->second;
            if (field == "purchasedCost"  ) return c.purchasedCost;
            if (field == "bareModuleCost" ) return c.bareModuleCost;
            if (field == "totalModuleCost") return c.totalModuleCost;
            throw std::runtime_error("optimization: unknown cost field '"
                + field + "' (allowed: purchasedCost, bareModuleCost,"
                          " totalModuleCost)");
        }

        case Kind::CostTotal:
        {
            // path selects which total: "purchasedCost", "bareModuleCost",
            // or "totalModuleCost".  We sum across all units in result.costs.
            if (r.costs.empty())
                throw std::runtime_error("optimization: result.costs is empty"
                    " -- did the post chain run with a costing pass?");
            scalar total = 0;
            for (const auto& [u, c] : r.costs)
            {
                if (path == "purchasedCost"  ) total += c.purchasedCost;
                else if (path == "bareModuleCost" ) total += c.bareModuleCost;
                else if (path == "totalModuleCost") total += c.totalModuleCost;
                else throw std::runtime_error("optimization: costTotal path '"
                    + path + "' must be one of purchasedCost / bareModuleCost"
                            " / totalModuleCost");
            }
            return total;
        }
    }
    return std::numeric_limits<scalar>::quiet_NaN();  // unreachable
}

} // anonymous namespace

OptimizationDriver::OptimizationDriver(const DictPtr& d)
{
    const std::string method = d->lookupWordOrDefault("method", "nelderMead");
    if      (method == "nelderMead") method_ = Method::NelderMead;
    else if (method == "sqp")        method_ = Method::Sqp;
    else throw std::runtime_error("OptimizationDriver: method must be"
        " 'nelderMead' or 'sqp' (got '" + method + "')");

    // -----------------------------------------------------------------
    //  variables  ( {path; min; max; initial;}... );
    // -----------------------------------------------------------------
    auto varList = d->lookupDictList("variables");
    if (varList.empty())
        throw std::runtime_error("OptimizationDriver: 'variables' list is empty");
    vars_.reserve(varList.size());
    for (const auto& v : varList)
    {
        Var var;
        var.path = v->lookupWord("path");
        var.lo   = v->lookupScalar("min");
        var.hi   = v->lookupScalar("max");
        var.x0   = v->lookupScalar("initial");
        if (var.lo >= var.hi)
            throw std::runtime_error("OptimizationDriver: variable '"
                + var.path + "': min must be < max");
        if (var.x0 < var.lo || var.x0 > var.hi)
            throw std::runtime_error("OptimizationDriver: variable '"
                + var.path + "': initial value out of [min, max]");
        vars_.push_back(var);
    }

    // -----------------------------------------------------------------
    //  objective { kind; path; sense; }
    // -----------------------------------------------------------------
    auto obj = d->subDict("objective");
    const std::string k = obj->lookupWord("kind");
    if      (k == "kpi"      ) objKind_ = Kind::Kpi;
    else if (k == "stream"   ) objKind_ = Kind::Stream;
    else if (k == "cost"     ) objKind_ = Kind::Cost;
    else if (k == "costTotal") objKind_ = Kind::CostTotal;
    else throw std::runtime_error("OptimizationDriver: objective.kind must be"
        " one of: kpi, stream, cost, costTotal (got '" + k + "')");

    objPath_ = obj->lookupWord("path");

    const std::string sense = obj->lookupWordOrDefault("sense", "minimise");
    if      (sense == "minimise") objSense_ = Sense::Minimise;
    else if (sense == "maximise") objSense_ = Sense::Maximise;
    else throw std::runtime_error("OptimizationDriver: objective.sense must be"
        " 'minimise' or 'maximise' (got '" + sense + "')");

    // -----------------------------------------------------------------
    //  options { maxIter; tolX; tolF; simplexInit; }
    // -----------------------------------------------------------------
    if (d->found("options"))
    {
        auto op = d->subDict("options");
        if (op->found("maxIter")    ) maxIter_     = static_cast<int>(op->lookupScalar("maxIter"));
        if (op->found("tolX")       ) tolX_        = op->lookupScalar("tolX");
        if (op->found("tolF")       ) tolF_        = op->lookupScalar("tolF");
        if (op->found("simplexInit")) simplexInit_ = op->lookupScalar("simplexInit");
        if (op->found("fdStep")     ) fdStep_      = op->lookupScalar("fdStep");
        if (op->found("fdMode"))
        {
            const std::string m = op->lookupWord("fdMode");
            if      (m == "forward") fdCentral_ = false;
            else if (m == "central") fdCentral_ = true;
            else throw std::runtime_error("OptimizationDriver: options.fdMode"
                " must be 'forward' or 'central' (got '" + m + "')");
        }
    }

    // -----------------------------------------------------------------
    //  constraints  ( { kpi <path>; atMost|atLeast|equals <rhs>; tol <x>; } ... );
    //  (SQP only -- the active-set machinery needs constraints; Nelder-Mead
    //   has none.  Keywords are atLeast/atMost/equals, NOT min/max -- those
    //   collide with objective.sense.)
    // -----------------------------------------------------------------
    if (d->found("constraints"))
    {
        auto cl = d->lookupDictList("constraints");
        for (const auto& c : cl)
        {
            Constraint con;
            con.path = c->lookupWord("kpi");
            int nForm = 0;
            if (c->found("atMost"))
            {
                con.op = Constraint::Op::AtMost;
                con.rhs = c->lookupScalar("atMost");   // canonical SI (unit-aware)
                ++nForm;
            }
            if (c->found("atLeast"))
            {
                con.op = Constraint::Op::AtLeast;
                con.rhs = c->lookupScalar("atLeast");
                ++nForm;
            }
            if (c->found("equals"))
            {
                con.op = Constraint::Op::Equals;
                con.rhs = c->lookupScalar("equals");
                ++nForm;
            }
            if (nForm != 1)
                throw std::runtime_error("OptimizationDriver: each constraint"
                    " needs EXACTLY one of atMost / atLeast / equals (on '"
                    + con.path + "')");
            con.tol = c->lookupScalarOrDefault("tol", 1.0e-4);
            constraints_.push_back(std::move(con));
        }
    }
    if (!constraints_.empty() && method_ != Method::Sqp)
        throw std::runtime_error("OptimizationDriver: `constraints` require"
            " method 'sqp' (Nelder-Mead is unconstrained; add a penalty term"
            " or switch to sqp)");

    // -----------------------------------------------------------------
    //  report { file; }
    // -----------------------------------------------------------------
    if (d->found("report"))
    {
        auto rp = d->subDict("report");
        reportFile_ = rp->lookupWordOrDefault("file", "optimization_history.csv");
    }
}

int OptimizationDriver::run()
{
    if (!simulator_)
        throw std::runtime_error("OptimizationDriver: simulator not set");
    if (!flowsheetDict_)
        throw std::runtime_error("OptimizationDriver: flowsheetDict not set");

    return (method_ == Method::Sqp) ? runSqp() : runNelderMead();
}

int OptimizationDriver::runNelderMead()
{
    if (!simulator_)
        throw std::runtime_error("OptimizationDriver: simulator not set");
    if (!flowsheetDict_)
        throw std::runtime_error("OptimizationDriver: flowsheetDict not set");

    const bool needPost = (objKind_ == Kind::Cost || objKind_ == Kind::CostTotal);
    if (needPost && !postDict_)
        throw std::runtime_error("OptimizationDriver: objective requires a"
            " post-processing chain, but the case has no system/postDict");

    // -----------------------------------------------------------------
    //  Header + CSV
    // -----------------------------------------------------------------
    std::ofstream csv(reportFile_);
    if (!csv)
        throw std::runtime_error("OptimizationDriver: cannot open '"
            + reportFile_ + "' for writing");
    csv << "iter,move,fBest";
    for (const auto& v : vars_) csv << "," << v.path;
    csv << ",fWorst,simplexSize\n";

    std::cout << "\n=========================  Optimisation  ===========================\n"
              << "  method:        nelderMead\n"
              << "  variables:     " << vars_.size() << "\n";
    for (const auto& v : vars_)
        std::cout << "    " << v.path
                  << "   range [" << v.lo << ", " << v.hi << "]"
                  << "   initial " << v.x0 << "\n";
    std::cout << "  objective:     ";
    switch (objKind_) {
        case Kind::Kpi:       std::cout << "kpi";       break;
        case Kind::Stream:    std::cout << "stream";    break;
        case Kind::Cost:      std::cout << "cost";      break;
        case Kind::CostTotal: std::cout << "costTotal"; break;
    }
    std::cout << "  '" << objPath_ << "'   "
              << (objSense_ == Sense::Minimise ? "minimise" : "maximise") << "\n"
              << "  maxIter:       " << maxIter_
              << "   tolX " << tolX_ << "   tolF " << tolF_ << "\n"
              << "  history file:  " << reportFile_ << "\n"
              << "====================================================================\n";

    // -----------------------------------------------------------------
    //  Build the f: R^n -> R closure that Nelder-Mead will call.
    // -----------------------------------------------------------------
    int evalCount = 0;
    std::ostringstream sink;

    auto evaluate = [&](const sVector& x) -> scalar {
        ++evalCount;

        // Clone fresh flowsheet from source so each evaluation is hermetic.
        auto clone = Dictionary::fromFile(flowsheetDict_->sourceName());
        for (std::size_t i = 0; i < vars_.size(); ++i)
            clone->setScalarAtPath(vars_[i].path, x[i]);

        // Silence inner simulator chatter -- ~200 evaluations would
        // otherwise flood the log.  We restore the buffer afterwards.
        auto* coutBuf = std::cout.rdbuf(sink.rdbuf());
        auto* cerrBuf = std::cerr.rdbuf(sink.rdbuf());

        scalar fval = std::numeric_limits<scalar>::infinity();
        try {
            auto result = simulator_(clone);
            if (needPost) {
                auto chain = PostProcessor::buildChain(postDict_);
                for (auto& pp : chain) pp->run(result);
            }
            fval = extractObjective(result, objKind_, objPath_);
            if (!std::isfinite(fval))
                fval = std::numeric_limits<scalar>::infinity();
            else if (objSense_ == Sense::Maximise)
                fval = -fval;
        }
        catch (const std::exception&) {
            // Simulator failed at this point: huge penalty pulls the
            // simplex away.  Nelder-Mead will treat this vertex as
            // "worst" and contract/shrink toward the better ones.
            fval = std::numeric_limits<scalar>::infinity();
        }

        std::cout.rdbuf(coutBuf);
        std::cerr.rdbuf(cerrBuf);
        sink.str(""); sink.clear();
        return fval;
    };

    // -----------------------------------------------------------------
    //  Pack bounds and initial point.
    // -----------------------------------------------------------------
    const std::size_t n = vars_.size();
    sVector x0(n), lo(n), hi(n);
    for (std::size_t i = 0; i < n; ++i) {
        x0[i] = vars_[i].x0;
        lo[i] = vars_[i].lo;
        hi[i] = vars_[i].hi;
    }

    solver::NMOptions opts;
    opts.maxIter           = maxIter_;
    opts.tolX              = tolX_;
    opts.tolF              = tolF_;
    opts.simplexInitFactor = simplexInit_;

    // Per-iteration callback -- writes to CSV and stdout.
    std::cout << "\n  iter   move      fBest         ";
    for (const auto& v : vars_) {
        // Use just the last segment of the path for a compact column.
        const auto dot = v.path.find_last_of('.');
        const std::string lbl = (dot == std::string::npos)
                                ? v.path : v.path.substr(dot + 1);
        std::cout << std::setw(12) << lbl << " ";
    }
    std::cout << "   simplex\n"
              << "  -----  --------  ------------  "
              << std::string(13 * n, '-')
              << "  --------\n";

    auto sensed = [&](scalar f) {
        return (objSense_ == Sense::Maximise) ? -f : f;
    };

    opts.onIter = [&](const solver::NMTrace& t) {
        std::cout << "  " << std::setw(4) << t.iteration
                  << "   " << std::left << std::setw(9) << t.move << std::right
                  << "  " << std::scientific << std::setprecision(5)
                  << std::setw(12) << sensed(t.fBest) << "  ";
        csv << t.iteration << "," << t.move << "," << sensed(t.fBest);
        for (std::size_t i = 0; i < t.xBest.size(); ++i) {
            std::cout << std::setw(12) << std::fixed << std::setprecision(4)
                      << t.xBest[i] << " ";
            csv << "," << t.xBest[i];
        }
        std::cout << std::scientific << std::setprecision(2)
                  << "  " << std::setw(8) << t.simplexSize << "\n";
        csv << "," << sensed(t.fWorst) << "," << t.simplexSize << "\n";
    };

    // -----------------------------------------------------------------
    //  Run!
    // -----------------------------------------------------------------
    auto R = solver::nelderMead(evaluate, x0, lo, hi, opts);

    csv.close();

    // -----------------------------------------------------------------
    //  Final report
    // -----------------------------------------------------------------
    std::cout << "\n=========================  Optimum  =================================\n"
              << "  status:        " << (R.converged ? "converged" : "stopped")
              << "  (" << R.reason << ")\n"
              << "  iterations:    " << R.iterations
              << "   evaluations: " << R.evaluations << "\n"
              << "  best objective:" << std::scientific << std::setprecision(6)
              << "  " << sensed(R.f) << "\n"
              << "  best variables:\n";
    for (std::size_t i = 0; i < R.x.size(); ++i)
        std::cout << "    " << vars_[i].path << " = "
                  << std::fixed << std::setprecision(6) << R.x[i] << "\n";
    std::cout << "  history:       " << reportFile_
              << "\n=====================================================================\n";

    // -----------------------------------------------------------------
    //  Replay the simulator once at the optimum with full verbosity so
    //  the case ends with the converged final state on stdout.
    // -----------------------------------------------------------------
    std::cout << "\n[replaying simulator at optimum]\n";
    auto clone = Dictionary::fromFile(flowsheetDict_->sourceName());
    for (std::size_t i = 0; i < vars_.size(); ++i)
        clone->setScalarAtPath(vars_[i].path, R.x[i]);
    auto finalResult = simulator_(clone);
    if (needPost) {
        auto chain = PostProcessor::buildChain(postDict_);
        for (auto& pp : chain) pp->run(finalResult);
    }
    setFinalResult(finalResult);          // expose for the reports{} chain
    emitResultJson(std::cout, finalResult);

    return R.converged ? 0 : 1;
}

// ===========================================================================
//  SQP back-end (constrained optimisation; hand-rolled line-search SQP).
// ===========================================================================
int OptimizationDriver::runSqp()
{
    // -----------------------------------------------------------------
    //  Silent self-check gate (mirrors PitzerHMW::verify / IF97::verify):
    //  before trusting the SQP on a real case, prove the inner convex-QP
    //  active-set solver and the SQP loop itself still reproduce the
    //  hand-worked QP and the Hock-Schittkowski analytic optima.  A throw
    //  here aborts the run (no result block) -- a LOUD merge-block, never a
    //  silent wrong answer.
    // -----------------------------------------------------------------
    {
        const scalar qpErr  = solver::verifyActiveSetQP(0);
        const scalar nlpErr = solver::verifySQP(0);
        std::cout << "  [self-check]  activeSetQP maxErr = "
                  << std::scientific << std::setprecision(2) << qpErr
                  << "   HS35/HS21/HS71 worst |df| = " << nlpErr
                  << "   (gates passed)\n";
    }

    const bool needPost = (objKind_ == Kind::Cost || objKind_ == Kind::CostTotal);
    if (needPost && !postDict_)
        throw std::runtime_error("OptimizationDriver: objective requires a"
            " post-processing chain, but the case has no system/postDict");

    const std::size_t n = vars_.size();

    // Partition constraints into equalities (h) and inequalities (g).
    // We map every constraint onto the SQP sign convention:
    //   atMost  rhs :  g = resp - rhs           <= 0
    //   atLeast rhs :  g = rhs  - resp          <= 0
    //   equals  rhs :  h = (resp - rhs) / tol   == 0   (tol-scaled)
    std::vector<std::size_t> eqIdx, ineqIdx;
    for (std::size_t k = 0; k < constraints_.size(); ++k)
    {
        if (constraints_[k].op == Constraint::Op::Equals) eqIdx.push_back(k);
        else                                              ineqIdx.push_back(k);
    }
    const std::size_t nEq   = eqIdx.size();
    const std::size_t nIneq = ineqIdx.size();

    // ----------------------------------------------------------------------
    //  Header.
    // ----------------------------------------------------------------------
    std::ofstream csv(reportFile_);
    if (!csv)
        throw std::runtime_error("OptimizationDriver: cannot open '"
            + reportFile_ + "' for writing");
    csv << "iter,f";
    for (const auto& v : vars_) csv << "," << v.path;
    for (const auto& c : constraints_) csv << ",g[" << c.path << "]";
    csv << ",kktStat,kktFeasEq,kktFeasIneq,kktCompl,mu,alpha\n";

    std::cout << "\n=========================  Optimisation (SQP)  =====================\n"
              << "  method:        sqp  (line-search, damped-BFGS, L1 merit,\n"
              << "                       active-set convex QP -- N&W Ch.18 / 16.5)\n"
              << "  variables:     " << n << "\n";
    for (const auto& v : vars_)
        std::cout << "    " << v.path
                  << "   range [" << v.lo << ", " << v.hi << "]"
                  << "   initial " << v.x0 << "\n";
    std::cout << "  objective:     '" << objPath_ << "'   "
              << (objSense_ == Sense::Minimise ? "minimise" : "maximise") << "\n"
              << "  constraints:   " << constraints_.size()
              << "  (" << nEq << " equality, " << nIneq << " inequality)\n";
    for (const auto& c : constraints_)
    {
        const char* op = (c.op == Constraint::Op::AtMost)  ? "<="
                       : (c.op == Constraint::Op::AtLeast) ? ">="
                                                           : "==";
        std::cout << "    " << c.path << "  " << op << "  "
                  << std::scientific << std::setprecision(6) << c.rhs << "\n";
    }
    std::cout << "  fd gradients:  " << (fdCentral_ ? "central (2n/iter)"
                                                    : "forward (n+1/iter)")
              << "   step " << fdStep_ << "\n"
              << "  maxIter:       " << maxIter_ << "\n"
              << "  history file:  " << reportFile_ << "\n"
              << "====================================================================\n";

    // ----------------------------------------------------------------------
    //  Variable scaling (numerical honesty -- ANNOUNCED).  Design variables
    //  can span orders of magnitude (feed pressure ~1e6 Pa vs a module count
    //  ~5).  An unscaled QP is ill-conditioned: the FD step on the large
    //  variable is huge relative to the small one and the active constraint
    //  gradients collapse toward dependence (a spurious LICQ failure).  We
    //  solve the SQP in SCALED coordinates  xs = x / s  with s the typical
    //  magnitude, and unscale at the simulator boundary.  This is a visible
    //  aid, not a hidden crutch: the scale factors are printed.
    // ----------------------------------------------------------------------
    sVector s(n);
    for (std::size_t i = 0; i < n; ++i)
    {
        s[i] = std::max(std::abs(vars_[i].x0),
                        0.25 * std::abs(vars_[i].hi - vars_[i].lo));
        if (!(s[i] > 0.0)) s[i] = 1.0;
    }
    std::cout << "  variable scaling (xs = x / s):\n";
    for (std::size_t i = 0; i < n; ++i)
        std::cout << "    " << vars_[i].path << "   s = "
                  << std::scientific << std::setprecision(3) << s[i] << "\n";

    // ----------------------------------------------------------------------
    //  The response evaluator: ONE simulator pass -> objective + all
    //  constraints, with the inner chatter silenced.  Takes SCALED x.
    // ----------------------------------------------------------------------
    int simRuns = 0;
    std::ostringstream sink;

    auto evaluateAll = [&](const sVector& xs) -> solver::SQPResponse
    {
        ++simRuns;
        solver::SQPResponse out;
        out.h.assign(nEq, 0.0);
        out.g.assign(nIneq, 0.0);

        auto clone = Dictionary::fromFile(flowsheetDict_->sourceName());
        for (std::size_t i = 0; i < n; ++i)
            clone->setScalarAtPath(vars_[i].path, xs[i] * s[i]);   // unscale

        auto* coutBuf = std::cout.rdbuf(sink.rdbuf());
        auto* cerrBuf = std::cerr.rdbuf(sink.rdbuf());
        try
        {
            auto result = simulator_(clone);
            if (needPost)
            {
                auto chain = PostProcessor::buildChain(postDict_);
                for (auto& pp : chain) pp->run(result);
            }
            scalar f = extractObjective(result, objKind_, objPath_);
            // SQP always MINIMISES; flip for a maximise objective.
            out.f = (objSense_ == Sense::Maximise) ? -f : f;

            for (std::size_t e = 0; e < nEq; ++e)
            {
                const auto& c = constraints_[eqIdx[e]];
                const scalar resp = extractResponse(result, c.path, "constraint");
                out.h[e] = (resp - c.rhs) / c.tol;     // tol-scaled equality
            }
            for (std::size_t q = 0; q < nIneq; ++q)
            {
                const auto& c = constraints_[ineqIdx[q]];
                const scalar resp = extractResponse(result, c.path, "constraint");
                out.g[q] = (c.op == Constraint::Op::AtMost) ? (resp - c.rhs)
                                                            : (c.rhs - resp);
            }
            out.ok = std::isfinite(out.f);
            for (scalar v : out.h) out.ok = out.ok && std::isfinite(v);
            for (scalar v : out.g) out.ok = out.ok && std::isfinite(v);
        }
        catch (const std::exception&)
        {
            out.ok = false;
        }
        std::cout.rdbuf(coutBuf);
        std::cerr.rdbuf(cerrBuf);
        sink.str(""); sink.clear();
        return out;
    };

    // The constraint VALUE in user terms (for the trace; un-flips equality
    // scaling so the student sees the physical residual).
    auto userConstraintValue = [&](const solver::SQPResponse& r, std::size_t k)
        -> scalar
    {
        for (std::size_t e = 0; e < nEq; ++e)
            if (eqIdx[e] == k) return r.h[e] * constraints_[k].tol + constraints_[k].rhs;
        for (std::size_t q = 0; q < nIneq; ++q)
            if (ineqIdx[q] == k)
                return (constraints_[k].op == Constraint::Op::AtMost)
                       ? r.g[q] + constraints_[k].rhs
                       : constraints_[k].rhs - r.g[q];
        return 0.0;
    };

    // ----------------------------------------------------------------------
    //  Pack the start IN SCALED COORDINATES (xs = x / s).  typX = 1 because
    //  the scaled variables are already O(1).
    // ----------------------------------------------------------------------
    sVector x0(n), lo(n), hi(n), typX(n, 1.0);
    for (std::size_t i = 0; i < n; ++i)
    {
        x0[i] = vars_[i].x0 / s[i];
        lo[i] = vars_[i].lo / s[i];
        hi[i] = vars_[i].hi / s[i];
    }

    // ----------------------------------------------------------------------
    //  Sim-noise-floor probe (the skeptic's mandated diagnostic).  Evaluate
    //  F(x0) TWICE; if the FD perturbation h*|gradF| is not safely above the
    //  repeatability |dF|, the gradients are noise and SQP cannot be trusted.
    // ----------------------------------------------------------------------
    auto r0a = evaluateAll(x0);
    auto r0b = evaluateAll(x0);
    const scalar repeat = std::abs(r0a.f - r0b.f);
    std::cout << "  [noise-floor probe]  F(x0) evaluated twice:  |dF| = "
              << std::scientific << std::setprecision(3) << repeat
              << "   (the FD gradient step must clear this)\n";
    if (!r0a.ok)
        throw std::runtime_error("OptimizationDriver(sqp): the model could not"
            " be evaluated at the initial point -- SQP v1 refuses to guess a"
            " feasible start; fix `initial` in the variables block.");
    {
        // Honest infeasible-start report (does NOT abort -- SQP can recover
        // for inequalities; equalities are driven to feasibility too).
        scalar worstIneq = 0.0, worstEq = 0.0;
        for (scalar gv : r0a.g) worstIneq = std::max(worstIneq, gv);
        for (scalar hv : r0a.h) worstEq   = std::max(worstEq, std::abs(hv));
        if (worstIneq > 1.0e-6 || worstEq > 1.0e-6)
            std::cout << "  [start feasibility]  INFEASIBLE start:"
                      << "  max g+ = " << worstIneq
                      << "   max|h| = " << worstEq
                      << "   (SQP will drive toward the feasible region)\n";
        else
            std::cout << "  [start feasibility]  feasible start.\n";
    }

    // ----------------------------------------------------------------------
    //  Glass-box per-iteration trace.
    // ----------------------------------------------------------------------
    auto sensed = [&](scalar f) { return (objSense_ == Sense::Maximise) ? -f : f; };

    std::cout << "\n  iter        f         ||gradL||   max|h|     maxg+     "
                 "alpha    theta   mu        active-set / shadow prices\n"
              << "  ----  ------------  ---------  ---------  ---------  "
                 "-------  ------  --------  --------------------------------\n";

    solver::SQPOptions o;
    o.maxIter = maxIter_;
    o.fdStep  = fdStep_;
    o.central = fdCentral_;
    o.typX    = typX;
    o.tolFeasEq = 1.0e-6;     // equality residual is tol-scaled in the evaluator

    o.onIter = [&](const solver::SQPTrace& t)
    {
        std::cout << "  " << std::setw(4) << t.iteration
                  << "  " << std::scientific << std::setprecision(5)
                  << std::setw(12) << sensed(t.f)
                  << "  " << std::setprecision(2) << std::setw(9) << t.kktStat
                  << "  " << std::setw(9) << t.kktFeasEq
                  << "  " << std::setw(9) << t.kktFeasIneq
                  << "  " << std::fixed << std::setprecision(4) << std::setw(7) << t.alpha
                  << "  " << std::setw(6) << t.theta
                  << "  " << std::scientific << std::setprecision(2) << std::setw(8) << t.mu
                  << "  ";
        // active set + shadow prices
        for (std::size_t e = 0; e < nEq; ++e)
            std::cout << "[" << constraints_[eqIdx[e]].path << " eq lam="
                      << std::setprecision(3) << t.lambdaEq[e] << "] ";
        for (std::size_t q = 0; q < nIneq; ++q)
            if (q < t.gActive.size() && t.gActive[q])
                std::cout << "[" << constraints_[ineqIdx[q]].path << " ACTIVE lam="
                          << std::setprecision(3) << t.lambdaIneq[q] << "] ";
        if (!t.note.empty()) std::cout << " <- " << t.note;
        std::cout << "\n";

        csv << t.iteration << "," << sensed(t.f);
        for (std::size_t i = 0; i < t.x.size(); ++i) csv << "," << t.x[i] * s[i];
        // per-constraint physical values
        solver::SQPResponse rr; rr.h = t.h; rr.g = t.g;
        for (std::size_t k = 0; k < constraints_.size(); ++k)
            csv << "," << userConstraintValue(rr, k);
        csv << "," << t.kktStat << "," << t.kktFeasEq << "," << t.kktFeasIneq
            << "," << t.kktCompl << "," << t.mu << "," << t.alpha << "\n";
    };

    auto R = solver::sqp(evaluateAll, x0, lo, hi, nEq, nIneq, o);
    csv.close();

    // ----------------------------------------------------------------------
    //  Final report + the 5-line KKT certificate.
    // ----------------------------------------------------------------------
    std::cout << "\n=========================  Optimum (SQP)  ==========================\n"
              << "  status:        " << (R.converged ? "CONVERGED" : "stopped")
              << "  (" << R.reason << ")\n"
              << "  iterations:    " << R.iterations
              << "   simulator runs: " << simRuns << "\n"
              << "  best objective:" << std::scientific << std::setprecision(6)
              << "  " << sensed(R.f) << "\n"
              << "  best variables:\n";
    for (std::size_t i = 0; i < R.x.size(); ++i)
        std::cout << "    " << vars_[i].path << " = "
                  << std::fixed << std::setprecision(6) << R.x[i] * s[i] << "\n";

    std::cout << "  Lagrange multipliers (shadow prices):\n";
    for (std::size_t e = 0; e < nEq; ++e)
        std::cout << "    " << constraints_[eqIdx[e]].path
                  << "  (equality)    lambda = "
                  << std::scientific << std::setprecision(4) << R.lambdaEq[e] << "\n";
    for (std::size_t q = 0; q < nIneq; ++q)
        std::cout << "    " << constraints_[ineqIdx[q]].path
                  << "  (inequality)  lambda = "
                  << std::scientific << std::setprecision(4) << R.lambdaIneq[q]
                  << (R.lambdaIneq[q] > 1.0e-8 ? "   <- ACTIVE" : "") << "\n";

    // ----------------------------------------------------------------------
    //  A KKT *certificate* is only valid when the SQP actually converged.
    //  No-silent-crutch: on a FAILED / stopped run the stored kkt* fields may
    //  be stale or unmeasurable (e.g. a singular QP gives no valid
    //  multipliers, so stationarity/complementarity are NaN) -- printing them
    //  as all-zeros would forge a perfect optimum.  Instead, label the run
    //  NOT CERTIFIED and surface the genuine feasibility of the returned
    //  point so the failure is visible.
    if (R.converged)
    {
        std::cout << "  --- KKT certificate (N&W 18.1) ---\n"
                  << "    stationarity   ||grad L||inf = "
                  << std::scientific << std::setprecision(3) << R.kktStat
                  << "   (tol " << o.tolStat << ")\n"
                  << "    primal feas eq   max|h|       = " << R.kktFeasEq
                  << "   (tol " << o.tolFeasEq << ")\n"
                  << "    primal feas ineq max g+       = " << R.kktFeasIneq
                  << "   (tol " << o.tolFeasIneq << ")\n"
                  << "    complementarity  max|lam g|   = " << R.kktCompl
                  << "   (tol " << o.tolCompl << ")\n"
                  << "    dual feas        max(0,-lam)  = " << R.kktDualFeas
                  << "   (>= 0 required)\n";
    }
    else
    {
        std::cout << "  --- NO KKT certificate (run did NOT converge) ---\n"
                  << "    *** This point is NOT a certified optimum. ***\n"
                  << "    reason: " << R.reason << "\n"
                  << "    returned point is "
                  << (R.feasible ? "FEASIBLE (constraints met)"
                                 : "INFEASIBLE (constraints VIOLATED)") << "\n"
                  << "    stationarity   ||grad L||inf = "
                  << std::scientific << std::setprecision(3) << R.kktStat
                  << "   (NaN = unmeasurable: no valid QP multipliers)\n"
                  << "    primal feas eq   max|h|       = " << R.kktFeasEq
                  << "   (tol " << o.tolFeasEq << ")\n"
                  << "    primal feas ineq max g+       = " << R.kktFeasIneq
                  << "   (tol " << o.tolFeasIneq << ")\n";
    }
    std::cout << "  history:       " << reportFile_
              << "\n====================================================================\n";

    // ----------------------------------------------------------------------
    //  Replay at the optimum so the case ends with the converged state.
    // ----------------------------------------------------------------------
    std::cout << "\n[replaying simulator at optimum]\n";
    auto clone = Dictionary::fromFile(flowsheetDict_->sourceName());
    for (std::size_t i = 0; i < n; ++i)
        clone->setScalarAtPath(vars_[i].path, R.x[i] * s[i]);   // unscale
    auto finalResult = simulator_(clone);
    if (needPost)
    {
        auto chain = PostProcessor::buildChain(postDict_);
        for (auto& pp : chain) pp->run(finalResult);
    }
    setFinalResult(finalResult);
    emitResultJson(std::cout, finalResult);

    return R.converged ? 0 : 1;
}

} // namespace Choupo
