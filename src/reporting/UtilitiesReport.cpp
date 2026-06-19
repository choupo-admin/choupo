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

#include "UtilitiesReport.H"
#include "thermo/utility/UtilityCatalogue.H"

#include <cmath>
#include <filesystem>
#include <fstream>
#include <iomanip>
#include <iostream>

namespace Choupo {

namespace {

// Find the duty (W) a unit op consumed at its last solve(), drawn
// from its KPIs.  Each unit type publishes the same datum under one
// of a handful of canonical keys; we try them in order so a new unit
// type only has to pick one of the existing names.  Returns 0 if no
// duty KPI is exposed.
scalar dutyOfUnit(const std::map<std::string, scalar>& kpis)
{
    for (const char* k : { "Q", "duty", "Q_required", "Q_removed" })
    {
        auto it = kpis.find(k);
        if (it != kpis.end()) return std::abs(it->second);
    }
    return 0.0;
}

} // anonymous namespace

void UtilitiesReport::run(const DictPtr& /*dict*/, const ReportContext& ctx)
{
    const std::filesystem::path dir = ctx.reportsDir / "utilities";
    std::filesystem::create_directories(dir);
    const std::filesystem::path path = dir / "consumption.csv";

    std::ofstream f(path);
    if (!f.is_open())
        throw std::runtime_error("utilities: cannot open " + path.string());

    // The columns answer the engineer's actual question --- "how much
    // utility did the process really consume, and what did it cost?":
    //
    //   delivered_MW    -- the duty the process drew from this utility,
    //                      pulled from each consuming unit op's `Q` /
    //                      `duty` KPI and distributed by mass-flow share.
    //                      This is the bill.
    //   loop_capacity_MW -- the duty the same mass flow would deliver if
    //                      the loop ran end-to-end at its nominal ΔT
    //                      (= F × dutyPerKg from the catalogue).  The
    //                      headroom on the loop.
    //
    // Cost is on the bill, not the headroom.  Hours/year = 8000 nominal.
    f << "category,tier,mechanism,mass_flow_kg_per_h,"
         "delivered_MW,loop_capacity_MW,cost_EUR_per_GJ,"
         "cost_EUR_per_h,cost_EUR_per_year\n";

    if (ctx.result.utilities.empty())
    {
        f << "(none),-,-,0,0,0,0,0,0\n";
        f.close();
        if (ctx.verbosity >= 2)
            std::cout << "  [report] utilities -> " << path.string()
                      << "  (no utility streams in this case)\n";
        return;
    }

    constexpr scalar HOURS_PER_YEAR = 8000.0;

    // ------------------------------------------------------------------
    // For each unit op with one or more utility-tagged inputs, pull the
    // duty from its KPIs and split it across its utility categories by
    // mass-flow share (the way an accountant would allocate a shared
    // resource).  Most cases have a single utility per unit, where the
    // share is 1.0 and the duty maps 1:1.
    // ------------------------------------------------------------------
    std::map<std::string, scalar> deliveredW_per_cat;
    std::map<std::string, bool>   deliveredKnown;

    for (const auto& unit : ctx.result.topology)
    {
        // Collect the utility inputs of this unit + their kg/s.
        std::vector<std::pair<std::string, scalar>> utilInputs;
        scalar totalKgs = 0.0;
        for (const auto& inName : unit.ins)
        {
            auto sit = ctx.result.streams.find(inName);
            if (sit == ctx.result.streams.end()) continue;
            const ProcessStream& s = sit->second;
            if (s.category.empty()) continue;
            // Approximate kg/s for the share split.  The simulator
            // computes the exact F_mass when emitting JSON; here we
            // re-use ProcessStream::F (kmol/s) × an average MW (only
            // the RATIO matters for the share split, so the absolute
            // calibration drops out).
            scalar mw_avg = 0.0;
            for (std::size_t i = 0; i < s.z.size() && i < unit.ins.size(); ++i)
                (void)i;
            // Pragmatic surrogate: use F itself as the share weight.
            // For a single-utility unit, this is fine.  For two
            // utilities sharing one HX (rare), F-weighting beats a
            // 50/50 split for a similar-MW pair.
            utilInputs.push_back({ s.category, s.F });
            totalKgs += s.F;
        }
        if (utilInputs.empty()) continue;

        // Pull the duty from the unit's KPIs.
        auto kit = ctx.result.kpis.find(unit.name);
        if (kit == ctx.result.kpis.end()) continue;
        const scalar Q_W = dutyOfUnit(kit->second);
        if (Q_W <= 0.0) continue;

        // Distribute by share.
        for (const auto& [cat, share] : utilInputs)
        {
            const scalar w = (totalKgs > 0.0 ? share / totalKgs : 1.0 / utilInputs.size());
            deliveredW_per_cat[cat] += Q_W * w;
            deliveredKnown[cat] = true;
        }
    }

    scalar grandDeliveredMW = 0.0;
    scalar grandCapacityMW  = 0.0;
    scalar grandEURph       = 0.0;

    for (const auto& [cat, kgs] : ctx.result.utilities)
    {
        const scalar kg_per_h = kgs * 3600.0;
        scalar loop_capacity_MW = 0.0;
        scalar delivered_MW     = 0.0;
        scalar cost_EURph       = 0.0;
        scalar cost_EURpy       = 0.0;
        std::string tier      = "?";
        std::string mechanism = "?";
        scalar cost_EUR_per_GJ = 0.0;

        if (UtilityCatalogue::has(cat))
        {
            const Utility& u = UtilityCatalogue::byName(cat);
            tier             = u.tier;
            mechanism        = u.mechanism;
            cost_EUR_per_GJ  = u.cost;
            loop_capacity_MW = kgs * u.dutyPerKg / 1.0e6;
        }

        if (deliveredKnown.count(cat))
            delivered_MW = deliveredW_per_cat.at(cat) / 1.0e6;
        else
            delivered_MW = loop_capacity_MW;    // fallback when the unit op
                                                // does not expose a duty KPI

        cost_EURph = delivered_MW * 3.6 * cost_EUR_per_GJ;
        cost_EURpy = cost_EURph * HOURS_PER_YEAR;

        f << cat << "," << tier << "," << mechanism << ","
          << std::fixed << std::setprecision(3) << kg_per_h << ","
          << std::setprecision(4) << delivered_MW << ","
          << std::setprecision(4) << loop_capacity_MW << ","
          << std::setprecision(2) << cost_EUR_per_GJ << ","
          << std::setprecision(2) << cost_EURph << ","
          << std::setprecision(0) << cost_EURpy << "\n";

        grandDeliveredMW += delivered_MW;
        grandCapacityMW  += loop_capacity_MW;
        grandEURph       += cost_EURph;
    }

    f << "TOTAL,-,-,-," << std::fixed << std::setprecision(4) << grandDeliveredMW
      << "," << std::setprecision(4) << grandCapacityMW
      << ",-," << std::setprecision(2) << grandEURph
      << "," << std::setprecision(0) << (grandEURph * HOURS_PER_YEAR)
      << "\n";
    f.close();

    if (ctx.verbosity >= 2)
        std::cout << "  [report] utilities -> " << path.string()
                  << "  (" << ctx.result.utilities.size()
                  << " categor" << (ctx.result.utilities.size() == 1 ? "y" : "ies")
                  << ", " << std::fixed << std::setprecision(2)
                  << grandDeliveredMW << " MW delivered)\n";
}

} // namespace Choupo
