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
C499 measurement harness (docs/audits/2026-11-24-c499-protocol.md).

An OuterDriver of type `bayesBench`, registered through a case's own
`registerUserTypes()` (the case-code route of bin/buildCode), so it runs INSIDE
choupoSolve: every evaluation is one simulator pass exactly as
OptimizationDriver makes it (clone the flowsheet dict, write the variable
through the same path or StreamOverrides channel, extractResponse, the same
simulationFailure test).  It runs ONE optimiser from ONE start and writes one
CSV row per simulation:

    outerDict:   type bayesBench;
                 variables (...);  objective {...};  constraints (...);   // as `optimization`
                 bench { method bayes|sqpForward|sqpCentral|grid;  seed 1;  budget 30;
                         file bench.csv; }
                 method grid (two variables): `gridN` points per variable.

    The start is drawn uniformly in the box from `seed` (mt19937_64(1000+seed));
    seed 0 is the variables' own `initial` (the check against `method sqp`).
    bayes      -> solver::bayesOpt, that start as its first design point.
    sqpForward -> solver::sqp with the driver's scaling and options
                  (forward differences, fdStep 1e-3), maxIter large; stopped when
                  the budget of simulations is spent.
    sqpCentral -> the same with central differences.

    CSV: eval,seconds,ok,f,feasible,bestFeasible,x...,g...   (f in the user's
    sense; g <= 0 feasible; feasible means every g <= 1e-6).
Build: bin/buildCode on a scratch COPY of a case that has this file as
code/bench.cpp (see the protocol).
\*---------------------------------------------------------------------------*/

#include "outerDriver/ClosureGuard.H"
#include "outerDriver/ConstraintSpec.H"
#include "outerDriver/OuterDriver.H"
#include "outerDriver/ResponseExtractor.H"
#include "postProcessing/PostProcessor.H"
#include "solver/BayesOpt.H"
#include "solver/SQP.H"
#include "streams/StreamOverrides.H"

#include <chrono>
#include <cmath>
#include <fstream>
#include <iomanip>
#include <iostream>
#include <limits>
#include <random>
#include <sstream>

using namespace Choupo;

namespace {

struct BenchStop {};

class BayesBenchDriver : public OuterDriver
{
public:
    explicit BayesBenchDriver(const DictPtr& d) : d_(d) {}
    const std::string& type() const override { return type_; }
    std::string postDictPolicy() const override
    { return "applied per evaluation when `bench { usePost true; }`"; }

    int run() override
    {
        struct Var { std::string path; scalar lo, hi, init; };
        std::vector<Var> vars;
        for (const auto& v : d_->lookupDictList("variables"))
            vars.push_back({v->lookupWord("path"), v->lookupScalar("min"),
                            v->lookupScalar("max"),
                            v->lookupScalarOrDefault("initial", 0.5 * (v->lookupScalar("min") + v->lookupScalar("max")))});
        const std::size_t n = vars.size();
        const auto obj = d_->subDict("objective");
        const std::string objPath = obj->lookupWord("path");
        const bool maximise = obj->lookupWordOrDefault("sense", "minimise") == "maximise";
        const auto cons = parseConstraints(d_, "bayesBench");
        const std::size_t nc = cons.size();
        for (const auto& c : cons)
            if (c.op == ConstraintSpec::Op::Equals)
                throw std::runtime_error("bayesBench: equality constraints are not supported");

        const auto b = d_->subDict("bench");
        const std::string method = b->lookupWord("method");
        const int seed = static_cast<int>(b->lookupScalar("seed"));
        const int budget = static_cast<int>(b->lookupScalar("budget"));
        const std::string file = b->lookupWordOrDefault("file", "bench.csv");
        const bool usePost = b->lookupWordOrDefault("usePost", "false") == "true";
        const scalar feasTol = 1.0e-6;

        std::mt19937_64 g(1000 + seed);
        std::uniform_real_distribution<double> U(0.0, 1.0);
        sVector x0(n), lo(n), hi(n);
        for (std::size_t i = 0; i < n; ++i)
        {
            lo[i] = vars[i].lo; hi[i] = vars[i].hi;
            x0[i] = lo[i] + U(g) * (hi[i] - lo[i]);
            if (seed == 0) x0[i] = vars[i].init;   // seed 0: the case's own start
        }

        std::ofstream csv(file);
        csv << "eval,seconds,ok,f,feasible,bestFeasible";
        for (const auto& v : vars) csv << "," << v.path;
        for (const auto& c : cons) csv << ",g[" << c.path << "]";
        csv << "\n" << std::setprecision(12);

        int count = 0;
        double best = std::numeric_limits<double>::quiet_NaN();
        const auto t0 = std::chrono::steady_clock::now();

        //  One simulation at the PHYSICAL point x.  f is MINIMISED (negated
        //  for a maximise objective).
        auto simulate = [&](const sVector& x) -> solver::BayesResponse
        {
            if (count >= budget) throw BenchStop{};
            ++count;
            solver::BayesResponse out;
            out.g.assign(nc, 0.0);
            auto clone = Dictionary::fromFile(flowsheetDict_->sourceName());
            StreamOverrides ov;
            for (std::size_t i = 0; i < n; ++i)
            {
                if (vars[i].path.rfind("streams.", 0) == 0)
                    ov.set(StreamOverrides::fromDictPath(vars[i].path), x[i]);
                else
                    clone->setScalarAtPath(vars[i].path, x[i]);
            }
            std::ostringstream sink;
            auto* cb = std::cout.rdbuf(sink.rdbuf());
            auto* eb = std::cerr.rdbuf(sink.rdbuf());
            try
            {
                auto result = simulator_(clone, ov);
                const std::string cause = simulationFailure(result);
                //  A run whose own published mass/element closure breaks the
                //  band (the optimiser's closure guard, outerDriver/
                //  ClosureGuard.H) is a FAILED evaluation, like a run that did
                //  not converge: its objective is not a result.
                ClosureReading cr;
                if (cause.empty()) cr = readClosure(result);
                if (!cause.empty())
                {
                    out.ok = false;
                    out.failCause = cause;
                }
                else if (cr.published && cr.worst > closureBand())
                {
                    out.ok = false;
                    out.failCause = "closure " + cr.key + " breaks the conservation band";
                }
                else
                {
                    if (usePost && postDict_)
                    {
                        auto chain = PostProcessor::buildChain(postDict_);
                        for (auto& pp : chain) PostProcessor::runOrThrow(*pp, result);
                    }
                    const scalar f = extractResponse(result, objPath, "objective");
                    out.f = maximise ? -f : f;
                    for (std::size_t k = 0; k < nc; ++k)
                    {
                        const scalar r = extractResponse(result, cons[k].path, "constraint");
                        out.g[k] = (cons[k].op == ConstraintSpec::Op::AtMost)
                                 ? r - cons[k].rhs : cons[k].rhs - r;
                    }
                    out.ok = std::isfinite(out.f);
                    for (double v : out.g) out.ok = out.ok && std::isfinite(v);
                    if (!out.ok) out.failCause = "non-finite response";
                }
            }
            catch (const std::exception& e)
            {
                out.ok = false;
                out.failCause = std::string("threw: ") + e.what();
            }
            std::cout.rdbuf(cb);
            std::cerr.rdbuf(eb);
            bool feas = out.ok;
            if (out.ok)
                for (double v : out.g) feas = feas && (v <= feasTol);
            if (feas)
            {
                const double fu = maximise ? -out.f : out.f;
                if (std::isnan(best) || (maximise ? fu > best : fu < best)) best = fu;
            }
            const double secs = std::chrono::duration<double>(
                std::chrono::steady_clock::now() - t0).count();
            csv << count << "," << secs << "," << (out.ok ? 1 : 0) << ","
                << (out.ok ? (maximise ? -out.f : out.f) : std::nan("")) << ","
                << (feas ? 1 : 0) << "," << best;
            for (double v : x) csv << "," << v;
            for (std::size_t k = 0; k < nc; ++k)
                csv << "," << (out.ok ? out.g[k] : std::nan(""));
            csv << "\n";
            csv.flush();
            if (!out.ok)
                std::cout << "  [sim " << count << "] FAILED: " << out.failCause << "\n";
            return out;
        };

        try
        {
            if (method == "bayes")
            {
                solver::BayesOptions o;
                o.budget = budget;
                o.seed = static_cast<unsigned>(seed);
                o.eiTol = 0.0;                // the budget is the stop (protocol)
                o.feasTol = feasTol;
                o.x0 = x0;
                o.verbosity = 1;
                std::cout << "  [self-check] ";
                const scalar e = solver::verifyBayesOpt(0);
                std::cout << "worst |df| " << e << " (passed)\n";
                solver::bayesOpt(simulate, lo, hi, nc, o);
            }
            else if (method == "grid")
            {
                //  A regular grid of the box over two variables, `gridN`
                //  points each (the best-known value of problem (a)).
                if (n != 2)
                    throw std::runtime_error("bayesBench: grid needs two variables");
                const int gn = static_cast<int>(b->lookupScalar("gridN"));
                for (int i = 0; i < gn; ++i)
                    for (int j = 0; j < gn; ++j)
                        simulate({lo[0] + (hi[0] - lo[0]) * i / (gn - 1),
                                  lo[1] + (hi[1] - lo[1]) * j / (gn - 1)});
            }
            else
            {
                //  The driver's variable scaling (xs = x / s).
                sVector s(n);
                for (std::size_t i = 0; i < n; ++i)
                {
                    s[i] = std::max(std::abs(x0[i]), 0.25 * std::abs(hi[i] - lo[i]));
                    if (!(s[i] > 0.0)) s[i] = 1.0;
                }
                auto eval = [&](const sVector& xs) -> solver::SQPResponse
                {
                    sVector x(n);
                    for (std::size_t i = 0; i < n; ++i) x[i] = xs[i] * s[i];
                    const auto r = simulate(x);
                    solver::SQPResponse q;
                    q.ok = r.ok;
                    q.f = r.f;
                    q.g = r.g;
                    return q;
                };
                solver::SQPOptions o;
                o.maxIter = 1000;
                o.fdStep = 1.0e-3;
                o.central = (method == "sqpCentral");
                o.typX = sVector(n, 1.0);
                o.tolFeasEq = 1.0e-6;
                sVector xs0(n), los(n), his(n);
                for (std::size_t i = 0; i < n; ++i)
                {
                    xs0[i] = x0[i] / s[i];
                    los[i] = lo[i] / s[i];
                    his[i] = hi[i] / s[i];
                }
                const auto R = solver::sqp(eval, xs0, los, his, 0, nc, o);
                std::cout << "  sqp stopped: " << R.reason << " after "
                          << R.evaluations << " evaluations\n";
            }
        }
        catch (const BenchStop&)
        {
            std::cout << "  budget of " << budget << " simulations spent\n";
        }
        std::cout << "BENCH method=" << method << " seed=" << seed
                  << " simulations=" << count << " bestFeasible=" << best << "\n";
        return 0;
    }

private:
    DictPtr d_;
    inline static const std::string type_ = "bayesBench";
};

} // namespace

void registerUserTypes()
{
    OuterDriver::registerType("bayesBench",
        [](const DictPtr& d) -> std::unique_ptr<OuterDriver>
        { return std::make_unique<BayesBenchDriver>(d); });
}
