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

#include "SweepDriver.H"
#include "ResponseExtractor.H"
#include "result/ResultEmitter.H"
#include "postProcessing/PostProcessor.H"
#include "streams/StreamOverrides.H"

#include "thermo/RecordResolver.H"
#include <fstream>
#include <iomanip>
#include <iostream>
#include <limits>
#include <sstream>
#include <stdexcept>

namespace Choupo {

SweepDriver::SweepDriver(const DictPtr& dict)
{
    auto pdict = dict->subDict("parameter");
    targetPath_  = pdict->lookupWord("target");
    if (pdict->found("linkedTargets"))
        linkedTargets_ = pdict->lookupWordList("linkedTargets");
    auto rng     = pdict->lookupList("range");
    if (rng.size() != 2)
        throw std::runtime_error("SweepDriver: 'range' needs (min max)");
    rangeMin_    = rng[0];
    rangeMax_    = rng[1];
    nPoints_     = static_cast<std::size_t>(pdict->lookupScalar("nPoints"));
    if (nPoints_ < 2)
        throw std::runtime_error("SweepDriver: nPoints must be >= 2");

    responses_   = dict->lookupWordList("responses");
    constraints_ = parseConstraints(dict, "SweepDriver");

    if (dict->found("report"))
    {
        auto rd = dict->subDict("report");
        reportFile_ = rd->lookupWordOrDefault("file", "sweep_results.csv");
        records::refuseStandardsWrite("sweep", "file", reportFile_);
    }
}

int SweepDriver::run()
{
    if (!simulator_)
        throw std::runtime_error("SweepDriver::run: simulator functor not set");
    if (!flowsheetDict_)
        throw std::runtime_error("SweepDriver::run: flowsheetDict not set");

    std::cout << "\n========================  Sensitivity Sweep  =========================\n"
              << "  Target:    " << targetPath_ << "\n"
              << "  Range:     [" << rangeMin_ << ", " << rangeMax_ << "]\n"
              << "  nPoints:   " << nPoints_ << "\n"
              << "  Responses: ";
    for (const auto& r : responses_) std::cout << r << "  ";
    std::cout << "\n  Report:    " << reportFile_
              << "\n=====================================================================\n";

    // Open CSV early so we know if path is writable.
    std::ofstream csv(reportFile_);
    if (!csv)
        throw std::runtime_error("SweepDriver: cannot open '" + reportFile_
            + "' for writing");

    // Header.  Per constraint (the #103 amendment: value, bound, residual
    // and satisfied, never a global string), then the row verdict.
    csv << "point," << targetPath_;
    for (const auto& r : responses_) csv << "," << r;
    for (const auto& c : constraints_)
        csv << "," << c.path << "_value"
            << "," << c.path << "_" << c.opWord()
            << "," << c.path << "_residual"
            << "," << c.path << "_satisfied";
    if (!constraints_.empty()) csv << ",feasible";
    csv << "\n";

    // Echo same header to stdout (formatted)
    std::cout << "\n  " << std::setw(6) << "pt"
              << "  " << std::setw(14) << targetPath_;
    for (const auto& r : responses_)
        std::cout << "  " << std::setw(20) << r;
    std::cout << "\n  " << std::string(6 + 16 + 22 * responses_.size(), '-') << "\n";

    // Capture a representative converged pass to emit as the structured JSON
    // result, so a consumer (the GUI flowsheet, a notebook) gets the stream
    // table for ONE point — without it a swept case shows blank "— K — Pa"
    // nodes even though every point solved.  We pick the converged point
    // closest to the MIDDLE of the range (a typical operating point, not an
    // extreme), the same way DesignSpec/Optimization emit their final pass.
    SimulationResult representative;
    bool             haveRep  = false;
    std::size_t      bestDist = nPoints_;
    const std::size_t midK    = (nPoints_ > 0) ? (nPoints_ - 1) / 2 : 0;

    int failures = 0;
    std::size_t nFeasible = 0, nInfeasible = 0;
    for (std::size_t k = 0; k < nPoints_; ++k)
    {
        const scalar val =
            rangeMin_ + (rangeMax_ - rangeMin_)
            * static_cast<scalar>(k) / static_cast<scalar>(nPoints_ - 1);

        // Clone the flowsheetDict via re-parse from its source.  The
        // current Dictionary class does not have a deep-copy operator,
        // so we re-read from disk each pass (cheap; cases are tiny).
        auto clone = Dictionary::fromFile(flowsheetDict_->sourceName());
        StreamOverrides ov;
        if (targetPath_.rfind("streams.", 0) == 0)
        {
            // Forum #52/#53: a `streams.` target is the driver's hand on
            // stream STATE -- it goes through the override channel onto the
            // seeded registry (works identically over 0/ and legacy), never
            // through the dict, which a 0/ case ignores.
            //   streams.<name>.molarComposition.<c>  (legacy spelling)
            //   -> override "<name>.moleFraction.<c>"
            ov.set(
                StreamOverrides::fromDictPath(targetPath_), val);
        }
        else
            clone->setScalarAtPath(targetPath_, val);
        for (const auto& lp : linkedTargets_)
            clone->setScalarAtPath(lp, val);        // lockstep, same datum

        SimulationResult result;
        try { result = simulator_(clone, ov); }
        catch (const std::exception& e)
        {
            std::cerr << "  [point " << k << "  " << val << "]  simulator FAILED: "
                      << e.what() << "\n";
            ++failures;
            csv << k << "," << val;
            for (std::size_t i = 0; i < responses_.size(); ++i) csv << ",nan";
            for (std::size_t i = 0; i < constraints_.size(); ++i)
                csv << ",nan,nan,nan,0";
            if (!constraints_.empty()) csv << ",0";
            ++nInfeasible;
            csv << "\n";
            continue;
        }

        // Run the post-processing chain (sizing -> costing -> economics) on
        // this converged point so a response can read a cost/economics KPI
        // (e.g. economics.IRR).  Without this a sweep cannot SEE cost -- the
        // differentiator.  Mirrors OptimizationDriver's per-evaluation chain.
        // The chain's own console output is silenced across the sweep (one
        // run would otherwise print ~nPoints economics tables); the headline
        // scalars land in result.kpis where extractResponse finds them.  The
        // representative point (captured below) is re-emitted with its log
        // visible at the end.
        if (postDict_ && result.converged)
        {
            //  SUPPRESS THE TABLE, NEVER THE DIAGNOSTIC (AS7).
            //
            //  This used to redirect `cerr` into the sink as well.  The stated
            //  intent -- and it is a good one -- is to stop N repetitions of
            //  the economics table from burying the sweep.  But `cerr` is
            //  where the post-processing chain reports that a unit could not
            //  be sized or costed, and it is the ONLY channel it has (the
            //  passes count their failures and both call sites throw the
            //  count away, which is AS6).
            //
            //  So a sweep could plot NPV against feed rate with half the
            //  curve costed on a DIFFERENT equipment set -- no nan, no flag,
            //  nothing to tell the rows apart.  Silencing the one channel
            //  that says "this point is not comparable" is worse than the
            //  noise it avoided: noise is read and ignored, silence is read
            //  as agreement.
            //
            //  `cout` only.  And the catch below no longer swallows the
            //  reason: an exception here means this point's KPIs are absent,
            //  and the reader is told which point and why.
            std::ostringstream sink;
            auto* coutBuf = std::cout.rdbuf(sink.rdbuf());
            try
            {
                auto chain = PostProcessor::buildChain(postDict_);
                for (auto& pp : chain) pp->run(result);
            }
            catch (const std::exception& e)
            {
                std::cout.rdbuf(coutBuf);
                std::cerr << "[sweep] post-processing FAILED at this point -- "
                             "its post KPIs are absent (nan), so any curve"
                             " drawn through it is comparing points costed"
                             " differently: " << e.what() << "\n";
            }
            std::cout.rdbuf(coutBuf);
        }

        // Keep the converged point nearest the range middle as the GUI's
        // representative stream snapshot.
        if (result.converged)
        {
            const std::size_t d = (k > midK) ? (k - midK) : (midK - k);
            if (!haveRep || d < bestDist)
            {
                representative = result;
                haveRep        = true;
                bestDist       = d;
            }
        }

        // Extract responses
        std::cout << "  " << std::setw(6) << k
                  << "  " << std::fixed << std::setprecision(6)
                  << std::setw(14) << val;
        csv << k << "," << val;
        for (const auto& key : responses_)
        {
            scalar v = std::numeric_limits<scalar>::quiet_NaN();
            try { v = extractResponse(result, key, "SweepDriver"); }
            catch (const std::exception& e)
            {
                std::cerr << "  [warning: " << e.what() << "]\n";
            }
            std::cout << "  " << std::scientific << std::setprecision(5)
                      << std::setw(20) << v;
            csv << "," << v;
        }
        // Feasibility map: evaluate + MARK every constraint on this row.
        bool rowFeasible = !constraints_.empty();
        for (const auto& c : constraints_)
        {
            const ConstraintEval e = evaluateConstraint(c, result, "SweepDriver");
            if (e.evaluated)
                csv << "," << e.value << "," << c.rhs << "," << e.residual
                    << "," << (e.satisfied ? 1 : 0);
            else
                csv << ",nan," << c.rhs << ",nan,0";
            if (!e.evaluated || !e.satisfied) rowFeasible = false;
        }
        if (!constraints_.empty())
        {
            csv << "," << (rowFeasible ? 1 : 0);
            std::cout << (rowFeasible ? "   feasible" : "   INFEASIBLE");
            if (rowFeasible) ++nFeasible; else ++nInfeasible;
        }
        std::cout << "\n";
        csv << "\n";
    }

    csv.close();
    std::cout << "\n  Sweep complete.  " << (nPoints_ - failures)
              << "/" << nPoints_ << " points converged.\n"
              << "  CSV written to: " << reportFile_ << "\n\n";

    if (!constraints_.empty())
        std::cout << "  Feasibility map: " << nFeasible << " feasible / "
                  << nInfeasible << " infeasible of " << nPoints_
                  << " points (ALL rows in the CSV -- nothing filtered).\n\n";

    // Emit the representative point's structured result so downstream
    // consumers (the GUI) have a stream table to draw the flowsheet with.
    if (haveRep)
    {
        if (!constraints_.empty())
        {
            auto& sk = representative.kpis["sweep"];
            sk["feasible_points"]   = static_cast<scalar>(nFeasible);
            sk["infeasible_points"] = static_cast<scalar>(nInfeasible);
            sk["total_points"]      = static_cast<scalar>(nPoints_);
        }
        emitResultJson(std::cout, representative);
    }

    return (failures == 0) ? 0 : 1;
}

} // namespace Choupo
