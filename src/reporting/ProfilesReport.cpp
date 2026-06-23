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

#include "ProfilesReport.H"

#include <algorithm>
#include <filesystem>
#include <fstream>
#include <iomanip>
#include <iostream>
#include <set>
#include <vector>

namespace Choupo {

void ProfilesReport::run(const DictPtr& dict, const ReportContext& ctx)
{
    // Optional `units (... );` filter; empty -> every unit with a profile.
    std::set<std::string> only;
    if (dict->found("units"))
        for (const auto& u : dict->lookupWordList("units")) only.insert(u);

    int written = 0;
    for (const auto& [unit, prof] : ctx.result.profiles)
    {
        if (!only.empty() && !only.count(unit)) continue;
        if (prof.columns.empty()) continue;

        // Column order: the xAxis first, then the rest alphabetically
        // (std::map already sorts), skipping the xAxis if it appears in
        // columns too (it usually does).
        std::vector<std::string> cols;
        if (prof.columns.count(prof.xAxis)) cols.push_back(prof.xAxis);
        for (const auto& [name, vec] : prof.columns)
        {
            (void)vec;
            if (name != prof.xAxis) cols.push_back(name);
        }
        if (cols.empty()) continue;

        // Number of rows = length of the longest column.
        std::size_t nrows = 0;
        for (const auto& c : cols)
            nrows = std::max(nrows, prof.columns.at(c).size());

        const std::filesystem::path dir =
            ctx.outDir("profiles", "unitOperations") / unit;
        std::filesystem::create_directories(dir);

        std::ofstream f(dir / "profile.csv");
        if (!f.is_open())
            throw std::runtime_error(
                "profiles: cannot open " + (dir / "profile.csv").string());

        for (std::size_t k = 0; k < cols.size(); ++k)
            f << (k ? "," : "") << cols[k];
        f << "\n";
        for (std::size_t r = 0; r < nrows; ++r)
        {
            for (std::size_t k = 0; k < cols.size(); ++k)
            {
                const auto& v = prof.columns.at(cols[k]);
                f << (k ? "," : "");
                if (r < v.size())
                    f << std::setprecision(8) << v[r];
            }
            f << "\n";
        }
        f.close();

        // Markers (e.g. the column's feed stage), if any.
        if (!prof.markers.empty())
        {
            std::ofstream m(dir / "markers.csv");
            if (m.is_open())
            {
                m << prof.xAxis << ",label\n";
                for (const auto& mk : prof.markers)
                    m << std::setprecision(8) << mk.x << "," << mk.label << "\n";
            }
        }
        ++written;
    }

    if (ctx.verbosity >= 2)
        std::cout << "  [report] profiles -> " << (ctx.reportsDir
                  / "unitOperations").string() << "/<unit>/profile.csv  ("
                  << written << " unit" << (written == 1 ? "" : "s") << ")\n";
}

} // namespace Choupo
