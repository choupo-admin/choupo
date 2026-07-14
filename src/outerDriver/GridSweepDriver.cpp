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

#include "GridSweepDriver.H"
#include "ResponseExtractor.H"

#include <fstream>
#include <iomanip>
#include <iostream>
#include <limits>
#include <stdexcept>

namespace Choupo {

namespace {

GridSweepDriver::Axis readAxis(const DictPtr& pd, const char* which)
{
    GridSweepDriver::Axis ax;
    ax.target  = pd->lookupWord("target");
    auto rng   = pd->lookupList("range");
    if (rng.size() != 2)
        throw std::runtime_error(std::string("GridSweepDriver: ") + which
            + " 'range' needs (min max)");
    ax.min = rng[0];
    ax.max = rng[1];
    ax.n   = static_cast<std::size_t>(pd->lookupScalar("nPoints"));
    if (ax.n < 2)
        throw std::runtime_error(std::string("GridSweepDriver: ") + which
            + " nPoints must be >= 2");
    return ax;
}

} // namespace

GridSweepDriver::GridSweepDriver(const DictPtr& dict)
{
    auto params = dict->lookupDictList("parameters");
    if (params.size() != 2)
        throw std::runtime_error(
            "GridSweepDriver: 'parameters' needs exactly TWO entries "
            "( {target;range;nPoints} {target;range;nPoints} ) --- the two-knob "
            "surface is the cap (3+ is unviewable; use 'sweep' for one knob)");

    a_ = readAxis(params[0], "axis A");
    b_ = readAxis(params[1], "axis B");

    responses_ = dict->lookupWordList("responses");

    if (dict->found("report"))
    {
        auto rd = dict->subDict("report");
        reportFile_ = rd->lookupWordOrDefault("file", "gridsweep_results.csv");
    }
}

int GridSweepDriver::run()
{
    if (!simulator_)
        throw std::runtime_error("GridSweepDriver::run: simulator functor not set");
    if (!flowsheetDict_)
        throw std::runtime_error("GridSweepDriver::run: flowsheetDict not set");

    const std::size_t total = a_.n * b_.n;

    std::cout << "\n========================  Grid Sweep (2-D)  =========================\n"
              << "  Axis A:    " << a_.target
              << "   [" << a_.min << ", " << a_.max << "]  x " << a_.n << "\n"
              << "  Axis B:    " << b_.target
              << "   [" << b_.min << ", " << b_.max << "]  x " << b_.n << "\n"
              << "  Grid:      " << a_.n << " x " << b_.n << " = " << total << " points\n"
              << "  Responses: ";
    for (const auto& r : responses_) std::cout << r << "  ";
    std::cout << "\n  Report:    " << reportFile_
              << "\n=====================================================================\n";

    std::ofstream csv(reportFile_);
    if (!csv)
        throw std::runtime_error("GridSweepDriver: cannot open '" + reportFile_
            + "' for writing");

    csv << "point," << a_.target << "," << b_.target;
    for (const auto& r : responses_) csv << "," << r;
    csv << "\n";

    int failures = 0;
    std::size_t pt = 0;
    for (std::size_t i = 0; i < a_.n; ++i)
    {
        const scalar va =
            a_.min + (a_.max - a_.min)
            * static_cast<scalar>(i) / static_cast<scalar>(a_.n - 1);

        for (std::size_t j = 0; j < b_.n; ++j, ++pt)
        {
            const scalar vb =
                b_.min + (b_.max - b_.min)
                * static_cast<scalar>(j) / static_cast<scalar>(b_.n - 1);

            // Re-parse the template each pass (Dictionary has no deep copy;
            // cases are tiny).  Write BOTH targets, then run.
            auto clone = Dictionary::fromFile(flowsheetDict_->sourceName());
            clone->setScalarAtPath(a_.target, va);
            clone->setScalarAtPath(b_.target, vb);

            SimulationResult result;
            bool converged = true;
            try { result = simulator_(clone, StreamOverrides{}); }
            catch (const std::exception& e)
            {
                std::cerr << "  [point " << pt << "  A=" << va << " B=" << vb
                          << "]  simulator FAILED: " << e.what() << "\n";
                converged = false;
                ++failures;
            }

            csv << pt << "," << va << "," << vb;
            if (!converged)
            {
                // Honest hole: emit the row with nan responses, never skip.
                for (std::size_t r = 0; r < responses_.size(); ++r) csv << ",nan";
            }
            else
            {
                for (const auto& key : responses_)
                {
                    scalar v = std::numeric_limits<scalar>::quiet_NaN();
                    try { v = extractResponse(result, key, "GridSweepDriver"); }
                    catch (const std::exception& e)
                    {
                        std::cerr << "  [warning: " << e.what() << "]\n";
                    }
                    csv << "," << v;
                }
            }
            csv << "\n";
        }
    }

    csv.close();
    std::cout << "\n  Grid sweep complete.  " << (total - static_cast<std::size_t>(failures))
              << "/" << total << " points converged.\n"
              << "  CSV written to: " << reportFile_ << "\n\n";

    return (failures == 0) ? 0 : 1;
}

} // namespace Choupo
