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

#include "ParetoSweepDriver.H"
#include "OptimizationDriver.H"
#include "core/ResultEmitter.H"

#include <fstream>
#include <iomanip>
#include <iostream>
#include <sstream>
#include <stdexcept>

namespace Choupo {

ParetoSweepDriver::ParetoSweepDriver(const DictPtr& outerDict)
  : outerDict_(outerDict)
{
    if (!outerDict->found("tradeoff"))
        throw std::runtime_error("ParetoSweepDriver: a `tradeoff { kpi ...;"
            " bound atMost|atLeast; range (lo hi); nPoints N; }` block is"
            " required");
    auto t = outerDict->subDict("tradeoff");
    tradeoffPath_ = t->lookupWord("kpi");
    const std::string b = t->lookupWord("bound");
    if      (b == "atMost")  tradeoffOp_ = ConstraintSpec::Op::AtMost;
    else if (b == "atLeast") tradeoffOp_ = ConstraintSpec::Op::AtLeast;
    else if (b == "equals")
        throw std::runtime_error("ParetoSweepDriver: tradeoff bound `equals`"
            " is meaningless in an epsilon sweep -- use atMost or atLeast");
    else
        throw std::runtime_error("ParetoSweepDriver: unknown tradeoff bound '"
            + b + "' (atMost | atLeast)");
    auto rng = t->lookupList("range");
    if (rng.size() != 2)
        throw std::runtime_error("ParetoSweepDriver: tradeoff.range needs"
            " (lo hi)");
    epsLo_ = rng[0];
    epsHi_ = rng[1];
    nPoints_ = static_cast<std::size_t>(t->lookupScalar("nPoints"));
    if (nPoints_ < 2)
        throw std::runtime_error("ParetoSweepDriver: tradeoff.nPoints must"
            " be >= 2");

    // The point solver is the SQP -- the epsilon bound is a constraint and
    // Nelder-Mead has none.  Refuse anything else up front.
    if (outerDict->lookupWordOrDefault("method", "sqp") != "sqp")
        throw std::runtime_error("ParetoSweepDriver: the epsilon-constraint"
            " front needs `method sqp;` (the bound is a constraint)");

    if (outerDict->found("report"))
        reportFile_ = outerDict->subDict("report")
                    ->lookupWordOrDefault("file", reportFile_);
}

int ParetoSweepDriver::run()
{
    if (!simulator_)
        throw std::runtime_error("ParetoSweepDriver::run: simulator not set");

    std::cout << "\n=========================  Pareto sweep  ==========================\n"
              << "  Tradeoff:  " << tradeoffPath_ << "  "
              << (tradeoffOp_ == ConstraintSpec::Op::AtMost ? "atMost"
                                                            : "atLeast")
              << "  epsilon in [" << epsLo_ << ", " << epsHi_ << "], "
              << nPoints_ << " points\n"
              << "  Each point: one FULL SQP run of the declared objective"
                 " under the epsilon bound.\n"
              << "  Report:    " << reportFile_
              << "\n====================================================================\n";

    std::ofstream csv(reportFile_);
    if (!csv)
        throw std::runtime_error("ParetoSweepDriver: cannot open '"
            + reportFile_ + "'");

    // Header: epsilon, achieved objective + tradeoff, variables, status.
    // Variable names come from the first point's driver (same dict).
    bool wroteHeader = false;

    std::vector<scalar> warmX;          // previous solution (execution aid)
    SimulationResult    representative;
    bool                haveRep = false;
    std::size_t nConverged = 0, nFeasible = 0;

    for (std::size_t k = 0; k < nPoints_; ++k)
    {
        const scalar eps =
            epsLo_ + (epsHi_ - epsLo_)
            * static_cast<scalar>(k) / static_cast<scalar>(nPoints_ - 1);

        ConstraintSpec epsCon;
        epsCon.path = tradeoffPath_;
        epsCon.op   = tradeoffOp_;
        epsCon.rhs  = eps;

        std::cout << "\n---- pareto point " << k << ":  " << tradeoffPath_
                  << " " << epsCon.opWord() << " " << eps << " ----\n";

        // One SQP per point, built fresh from the SAME dict (the epsilon
        // bound injected programmatically, never by dict surgery).
        auto solveAt = [&](bool warm) -> std::unique_ptr<OptimizationDriver>
        {
            auto drv = std::make_unique<OptimizationDriver>(outerDict_);
            drv->setSimulator(simulator_);
            drv->setFlowsheetDict(flowsheetDict_);
            if (postDict_) drv->setPostDict(postDict_);
            drv->addConstraint(epsCon);
            drv->suppressResultJson();   // ONE result block per log: ours
            drv->setReportFile("pareto_point_history.csv");   // overwritten
            if (warm) drv->setInitialX(warmX);
            drv->run();   // rc mirrored by solutionConverged()
            return drv;
        };

        std::unique_ptr<OptimizationDriver> drv;
        bool warmed = !warmX.empty();
        try
        {
            drv = solveAt(warmed);
        }
        catch (const std::exception& e)
        {
            std::cout << "  [pareto] point " << k << " FAILED to run ("
                      << e.what() << ")\n";
            drv.reset();
        }
        if (warmed && (!drv || !drv->solutionConverged()))
        {
            // #103: warm start is an execution aid only -- retry COLD and
            // ANNOUNCE.
            std::cout << "  [pareto] warm-started point did not converge --"
                         " retrying COLD from the declared initials.\n";
            try { drv = solveAt(false); }
            catch (const std::exception& e)
            {
                std::cout << "  [pareto] cold retry FAILED too ("
                          << e.what() << ")\n";
                drv.reset();
            }
        }

        if (!wroteHeader)
        {
            csv << "point,epsilon,objective," << tradeoffPath_;
            const std::size_t nv = drv ? drv->solutionX().size() : 0;
            for (std::size_t i = 0; i < nv; ++i) csv << ",x" << i;
            csv << ",converged,feasible\n";
            wroteHeader = true;
        }

        csv << k << "," << eps;
        if (drv)
        {
            const bool conv = drv->solutionConverged();
            const bool feas = drv->solutionFeasible();
            // The achieved tradeoff value at the optimum, read from the
            // final replayed result (the solver's own state).
            scalar tradeVal = std::numeric_limits<scalar>::quiet_NaN();
            if (drv->hasFinalResult())
            {
                try
                {
                    tradeVal = extractResponse(drv->finalResult(),
                                               tradeoffPath_, "paretoSweep");
                }
                catch (const std::exception&) {}
            }
            csv << "," << drv->solutionF() << "," << tradeVal;
            for (scalar x : drv->solutionX()) csv << "," << x;
            csv << "," << (conv ? 1 : 0) << "," << (feas ? 1 : 0);
            if (conv) ++nConverged;
            if (feas) ++nFeasible;
            if (conv && feas)
            {
                warmX = drv->solutionX();      // execution aid for the next
                if (drv->hasFinalResult())
                {
                    representative = drv->finalResult();
                    haveRep        = true;
                }
            }
        }
        else
            csv << ",nan,nan,0,0";
        csv << "\n";
    }
    csv.close();

    std::cout << "\n  Pareto sweep complete: " << nConverged << " converged /"
              << " " << nFeasible << " feasible of " << nPoints_
              << " points (ALL on the front table -- nothing hidden).\n"
              << "  Front written to: " << reportFile_ << "\n\n";

    if (haveRep)
    {
        auto& pk = representative.kpis["pareto"];
        pk["points_total"]     = static_cast<scalar>(nPoints_);
        pk["points_converged"] = static_cast<scalar>(nConverged);
        pk["points_feasible"]  = static_cast<scalar>(nFeasible);
        emitResultJson(std::cout, representative);
    }
    return (nConverged == nPoints_) ? 0 : 1;
}

} // namespace Choupo
