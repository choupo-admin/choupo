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
#include "core/ResultEmitter.H"
#include "postProcessing/PostProcessor.H"

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
    auto rng     = pdict->lookupList("range");
    if (rng.size() != 2)
        throw std::runtime_error("SweepDriver: 'range' needs (min max)");
    rangeMin_    = rng[0];
    rangeMax_    = rng[1];
    nPoints_     = static_cast<std::size_t>(pdict->lookupScalar("nPoints"));
    if (nPoints_ < 2)
        throw std::runtime_error("SweepDriver: nPoints must be >= 2");

    responses_   = dict->lookupWordList("responses");

    if (dict->found("report"))
    {
        auto rd = dict->subDict("report");
        reportFile_ = rd->lookupWordOrDefault("file", "sweep_results.csv");
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

    // Header
    csv << "point," << targetPath_;
    for (const auto& r : responses_) csv << "," << r;
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
    for (std::size_t k = 0; k < nPoints_; ++k)
    {
        const scalar val =
            rangeMin_ + (rangeMax_ - rangeMin_)
            * static_cast<scalar>(k) / static_cast<scalar>(nPoints_ - 1);

        // Clone the flowsheetDict via re-parse from its source.  The
        // current Dictionary class does not have a deep-copy operator,
        // so we re-read from disk each pass (cheap; cases are tiny).
        auto clone = Dictionary::fromFile(flowsheetDict_->sourceName());
        clone->setScalarAtPath(targetPath_, val);

        SimulationResult result;
        try { result = simulator_(clone); }
        catch (const std::exception& e)
        {
            std::cerr << "  [point " << k << "  " << val << "]  simulator FAILED: "
                      << e.what() << "\n";
            ++failures;
            csv << k << "," << val;
            for (std::size_t i = 0; i < responses_.size(); ++i) csv << ",nan";
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
            std::ostringstream sink;
            auto* coutBuf = std::cout.rdbuf(sink.rdbuf());
            auto* cerrBuf = std::cerr.rdbuf(sink.rdbuf());
            try
            {
                auto chain = PostProcessor::buildChain(postDict_);
                for (auto& pp : chain) pp->run(result);
            }
            catch (const std::exception&) { /* leave KPIs unset -> nan response */ }
            std::cout.rdbuf(coutBuf);
            std::cerr.rdbuf(cerrBuf);
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
        std::cout << "\n";
        csv << "\n";
    }

    csv.close();
    std::cout << "\n  Sweep complete.  " << (nPoints_ - failures)
              << "/" << nPoints_ << " points converged.\n"
              << "  CSV written to: " << reportFile_ << "\n\n";

    // Emit the representative point's structured result so downstream
    // consumers (the GUI) have a stream table to draw the flowsheet with.
    if (haveRep)
        emitResultJson(std::cout, representative);

    return (failures == 0) ? 0 : 1;
}

} // namespace Choupo
