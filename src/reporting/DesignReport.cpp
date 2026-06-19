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

#include "DesignReport.H"
#include "postProcessing/PostProcessor.H"

#include <filesystem>
#include <fstream>
#include <iomanip>
#include <iostream>
#include <set>
#include <vector>

namespace Choupo {

void DesignReport::run(const DictPtr& dict, const ReportContext& ctx)
{
    // Run the sizing pass (reuses the existing SizingPass PostProcessor),
    // which populates ctx.result.sizings from the unit KPIs + design rules.
    auto sizer = PostProcessor::New("sizing", dict);
    sizer->run(ctx.result);

    const std::filesystem::path dir = ctx.reportsDir / "design";
    std::filesystem::create_directories(dir);
    const std::filesystem::path path = dir / "sizing.csv";
    std::ofstream f(path);
    if (!f.is_open())
        throw std::runtime_error("design: cannot open " + path.string());

    // The sizing values are a per-unit free-form key->value map (D, H, A,
    // t_wall, weight,...).  Collect the union of keys for a stable header.
    std::set<std::string> keys;
    for (const auto& [unit, sz] : ctx.result.sizings)
        for (const auto& [k, v] : sz.values) { (void)v; keys.insert(k); }

    f << "unit,equipmentType,material";
    for (const auto& k : keys) f << "," << k;
    f << "\n";
    for (const auto& [unit, sz] : ctx.result.sizings)
    {
        f << unit << "," << sz.equipmentType << "," << sz.material;
        for (const auto& k : keys)
        {
            f << ",";
            auto it = sz.values.find(k);
            if (it != sz.values.end())
                f << std::setprecision(6) << it->second;
        }
        f << "\n";
    }
    f.close();

    if (ctx.verbosity >= 2)
        std::cout << "  [report] design -> " << path.string()
                  << "  (" << ctx.result.sizings.size() << " equipment items)\n";
}

} // namespace Choupo
