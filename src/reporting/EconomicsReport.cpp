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

#include "EconomicsReport.H"
#include "postProcessing/PostProcessor.H"

#include <filesystem>
#include <fstream>
#include <iomanip>
#include <iostream>

namespace Choupo {

void EconomicsReport::run(const DictPtr& dict, const ReportContext& ctx)
{
    // Run the costing pass (reuses the existing CostingPass PostProcessor);
    // it reads ctx.result.sizings (so `design` must run first) and
    // populates ctx.result.costs.
    auto coster = PostProcessor::New("costing", dict);
    coster->run(ctx.result);

    const std::filesystem::path dir = ctx.outDir("economics", "economics");
    std::filesystem::create_directories(dir);
    const std::filesystem::path path = dir / "costs.csv";
    std::ofstream f(path);
    if (!f.is_open())
        throw std::runtime_error("economics: cannot open " + path.string());

    std::string currency = "EUR_2026";
    if (!ctx.result.costs.empty())
        currency = ctx.result.costs.begin()->second.currency;

    f << "unit,purchased_" << currency
      << ",bareModule_" << currency
      << ",totalModule_" << currency << "\n";
    scalar tp = 0.0, tb = 0.0, tt = 0.0;
    for (const auto& [unit, c] : ctx.result.costs)
    {
        f << unit << "," << std::fixed << std::setprecision(2)
          << c.purchasedCost << "," << c.bareModuleCost
          << "," << c.totalModuleCost << "\n";
        tp += c.purchasedCost; tb += c.bareModuleCost; tt += c.totalModuleCost;
    }
    f << "TOTAL," << std::fixed << std::setprecision(2)
      << tp << "," << tb << "," << tt << "\n";
    f.close();

    if (ctx.verbosity >= 2)
        std::cout << "  [report] economics -> " << path.string()
                  << "  (total module cost " << std::fixed << std::setprecision(0)
                  << tt << " " << currency << ")\n";
}

} // namespace Choupo
