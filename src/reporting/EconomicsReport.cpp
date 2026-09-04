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

#include <algorithm>
#include <array>
#include <filesystem>
#include <fstream>
#include <iomanip>
#include <iostream>
#include <map>
#include <stdexcept>
#include <utility>
#include <vector>

namespace Choupo {

void EconomicsReport::run(const DictPtr& dict, const ReportContext& ctx)
{
    //  A REPORT DRAWS; IT DOES NOT RECOMPUTE.  Same defect as the design
    //  report, same fix: this ran the whole costing pass again out of the
    //  REPORT's own dict, so `method`, `cepci`, `usdToEur` and the rest had
    //  to be declared TWICE -- in system/postDict and here -- with nothing
    //  keeping the two copies equal.  It serialises `result.costs` now.
    (void)dict;
    if (ctx.result.costs.empty())
        throw std::runtime_error(
            "economics report: there is nothing to write -- `result.costs` is"
            " empty.\n  This report SERIALISES the costing the pipeline"
            " produced; it does not cost anything itself.\n  Add"
            " `sizing { ... }` and `costing { ... }` blocks to"
            " system/postDict (they run before the reports),\n  and the cost"
            " basis lives THERE, once.");

    const std::filesystem::path dir = ctx.outDir("economics", "economics");
    std::filesystem::create_directories(dir);
    const std::filesystem::path path = dir / "costs.csv";
    std::ofstream f(path);
    if (!f.is_open())
        throw std::runtime_error("economics: cannot open " + path.string());

    std::string currency = "EUR_2026";
    if (!ctx.result.costs.empty())
        currency = ctx.result.costs.begin()->second.currency;

    //  THE CSV IS SELF-DEFENDING, to the same standard the console block is
    //  held to.  Three costs and nothing else is a number a reader cannot
    //  reproduce -- and this is the file that goes into the report, so the
    //  correlation, its size driver, the module factors and the two indices
    //  ride with it.  Enough digits to redo the arithmetic: a provenance
    //  column too coarse to reproduce is worse than none.
    //  THE HIERARCHY REACHES THE COST FILE.  "Which sector is the money in?"
    //  is the question a plant's structure exists to answer, and this CSV is
    //  where a reader answers it -- adding the dotted names up by hand was
    //  the only route before.  The column and the subtotal rows appear ONLY
    //  when a hierarchy exists: a flat case has none, and gets exactly the
    //  file it got before.
    bool anySector = false;
    for (const auto& [unit, c] : ctx.result.costs)
    { (void)unit; if (!c.sector.empty()) { anySector = true; break; } }

    //  Keyed by the MAP KEY, never by the `unitName` copy inside the record:
    //  the key is what `result.costs` is indexed on and what every other
    //  reader resolves against.
    std::vector<std::pair<const std::string*, const CostBreakdown*>> rows;
    rows.reserve(ctx.result.costs.size());
    for (const auto& [unit, c] : ctx.result.costs) rows.emplace_back(&unit, &c);
    if (anySector)
        std::stable_sort(rows.begin(), rows.end(),
            [](const std::pair<const std::string*, const CostBreakdown*>& a,
               const std::pair<const std::string*, const CostBreakdown*>& b)
            { return a.second->sector < b.second->sector; });

    f << "unit";
    if (anySector) f << ",sector";
    f << ",purchased_" << currency
      << ",bareModule_" << currency
      << ",totalModule_" << currency
      << ",correlation,sizeKey,S,K1_or_CpRef,K2_or_SRef,K3_or_n,"
         "B1,B2,F_M,F_P,material,cepci,cepci2001,usdToEur\n";
    scalar tp = 0.0, tb = 0.0, tt = 0.0;
    std::map<std::string, std::array<scalar, 3>> bySector;
    std::vector<std::string> sectorOrder;      // first-appearance, = row order
    for (const auto& row : rows)
    {
        const std::string& unit  = *row.first;
        const CostBreakdown& entry = *row.second;
        //  An ordinary reference, because a STRUCTURED BINDING CANNOT BE
        //  CAPTURED BY A LAMBDA IN C++17 -- g++ allows it as an extension,
        //  emscripten's clang errors, and that is what broke the site
        //  earlier today.  Written the wrong way here a second time, hours
        //  later, in the same shape; `check_wasm_dialect` caught it before it
        //  could reach the site, which is the whole reason that gate exists.
        const CostBreakdown& c = entry;
        if (anySector)
        {
            const std::string s = c.sector.empty() ? "(no sector)" : c.sector;
            if (!bySector.count(s)) sectorOrder.push_back(s);
            auto& acc = bySector[s];
            acc[0] += c.purchasedCost;
            acc[1] += c.bareModuleCost;
            acc[2] += c.totalModuleCost;
        }
        auto fac = [&](const char* k) -> scalar {
            auto it = c.factors.find(k);
            return it == c.factors.end() ? 0.0 : it->second;
        };
        const bool pw = (c.correlation == "power-law");
        f << unit;
        if (anySector)
            f << "," << (c.sector.empty() ? std::string("(no sector)") : c.sector);
        f << "," << std::fixed << std::setprecision(2)
          << c.purchasedCost << "," << c.bareModuleCost
          << "," << c.totalModuleCost
          << "," << (c.correlation.empty() ? "(not stated)" : c.correlation)
          << "," << (c.sizeKey.empty() ? "(not stated)" : c.sizeKey)
          << "," << std::setprecision(6) << fac("S")
          << "," << (pw ? fac("Cp_ref") : fac("K1"))
          << "," << (pw ? fac("S_ref")  : fac("K2"))
          << "," << (pw ? fac("n_exp")  : fac("K3"))
          << "," << fac("B1") << "," << fac("B2")
          << "," << fac("F_M") << "," << fac("F_P")
          << "," << (c.material.empty() ? "(not stated)" : c.material)
          << "," << fac("cepci") << "," << fac("cepci2001")
          << "," << fac("usdToEur") << "\n";
        tp += c.purchasedCost; tb += c.bareModuleCost; tt += c.totalModuleCost;
    }
    //  SUBTOTALS BEFORE THE TOTAL, accumulated from the SAME per-unit costs
    //  the rows above carry and the TOTAL below sums -- so the file cannot
    //  contain a sector total that disagrees with its own rows.  The `unit`
    //  column holds `SUBTOTAL`, following the `TOTAL` row that has always
    //  lived in it, so a reader filtering that column finds all three levels.
    for (const auto& s : sectorOrder)
    {
        const auto& acc = bySector.at(s);
        f << "SUBTOTAL," << s << "," << std::fixed << std::setprecision(2)
          << acc[0] << "," << acc[1] << "," << acc[2] << "\n";
    }
    f << "TOTAL";
    if (anySector) f << ",";
    f << "," << std::fixed << std::setprecision(2)
      << tp << "," << tb << "," << tt << "\n";
    f.close();

    if (ctx.verbosity >= 2)
        std::cout << "  [report] economics -> " << path.string()
                  << "  (total module cost " << std::fixed << std::setprecision(0)
                  << tt << " " << currency << ")\n";
}

} // namespace Choupo
