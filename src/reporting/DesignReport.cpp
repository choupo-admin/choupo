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

#include <algorithm>
#include <filesystem>
#include <fstream>
#include <iomanip>
#include <iostream>
#include <set>
#include <utility>
#include <stdexcept>
#include <vector>

namespace Choupo {

void DesignReport::run(const DictPtr& dict, const ReportContext& ctx)
{
    //  A REPORT DRAWS; IT DOES NOT RECOMPUTE.  This used to call
    //  `PostProcessor::New("sizing", dict)` and run the whole sizing pass
    //  again out of the REPORT's own dict -- so the equipment list had to be
    //  declared TWICE, once in `system/postDict` and once here, and the
    //  re-run overwrote the `sizings` the costing pass had already consumed.
    //  Two homes for one fact, and a reporting layer reaching down to
    //  recompute what the pipeline already produced.
    //
    //  It writes out `result.sizings` now.  No corpus case declared this
    //  report (measured 2026-08-27: zero, against 74 for `streamTable`), so
    //  nothing depended on the old behaviour -- which is also why the defect
    //  survived: an unexercised path is one nobody could find.
    (void)dict;
    if (ctx.result.sizings.empty())
        throw std::runtime_error(
            "design report: there is nothing to write -- `result.sizings` is"
            " empty.\n  This report SERIALISES the sizing the pipeline"
            " produced; it does not size anything itself.\n  Add a"
            " `sizing { units ( ... ) }` block to system/postDict (it runs"
            " before the reports),\n  and the equipment list lives THERE,"
            " once.");

    const std::filesystem::path dir = ctx.outDir("design", "design");
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

    //  THE HIERARCHY TRAVELS WITH THE FILE.  A plant is sectors of units,
    //  and this CSV is what a reader opens; without the owning sector the
    //  only way to recover it is to split the dotted unit name, which is the
    //  name identity this project bans everywhere else -- and which would
    //  misfile any unit whose name carries a dot for a different reason.
    //
    //  The column appears ONLY when at least one sizing carries a sector.  A
    //  flat case has no hierarchy to report, so it gets the same header and
    //  the same rows it got before this column existed; an empty column added
    //  to every flat case would be a change of format claiming a structure
    //  that is not there.
    bool anySector = false;
    for (const auto& [unit, sz] : ctx.result.sizings)
    { (void)unit; if (!sz.sector.empty()) { anySector = true; break; } }

    //  Rows ORDERED BY SECTOR when there is one, so the file reads as the
    //  plant is built.  `result.sizings` is a std::map, so a flat case is
    //  already unit-name ordered and stays exactly so.
    //  Keyed by the MAP KEY, not by `sz.unitName`.  Every sizer sets both
    //  and they agree, which is exactly why reading the copy would be the
    //  arity sin: the key is what `result.sizings` is indexed on and what
    //  every other reader resolves against.
    std::vector<std::pair<const std::string*, const EquipmentSizing*>> rows;
    rows.reserve(ctx.result.sizings.size());
    for (const auto& [unit, sz] : ctx.result.sizings) rows.emplace_back(&unit, &sz);
    if (anySector)
        std::stable_sort(rows.begin(), rows.end(),
            [](const std::pair<const std::string*, const EquipmentSizing*>& a,
               const std::pair<const std::string*, const EquipmentSizing*>& b)
            { return a.second->sector < b.second->sector; });

    //  THE BASIS TRAVELS WITH THE FILE, not only with the screen.  A volume
    //  is the same number whether a residence time, a space velocity or the
    //  author produced it, and this CSV is what goes into the report -- so
    //  the design ARGUMENT has to be in it.  Solving that on the console and
    //  not here would be half the fix.
    f << "unit";
    if (anySector) f << ",sector";
    f << ",equipmentType,material,basis";
    for (const auto& k : keys) f << "," << k;
    f << "\n";
    for (const auto& row : rows)
    {
        const EquipmentSizing& sz = *row.second;
        f << *row.first;
        if (anySector)
            f << "," << (sz.sector.empty() ? std::string("(no sector)") : sz.sector);
        f << "," << sz.equipmentType << "," << sz.material << ","
          << (sz.basis.empty() ? std::string("(not stated)") : sz.basis);
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
