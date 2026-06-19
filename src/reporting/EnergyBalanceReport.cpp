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

#include "EnergyBalanceReport.H"
#include "BalanceMath.H"
#include "Topology.H"

#include <cmath>
#include <fstream>
#include <iomanip>
#include <iostream>
#include <vector>

namespace Choupo {

void EnergyBalanceReport::run(const DictPtr& dict, const ReportContext& ctx)
{
    const scalar Tref = dict->lookupScalarOrDefault("Tref", 298.15);
    const auto topo = reporting::readTopology(ctx.flowsheetDict);

    const std::filesystem::path dir = ctx.reportsDir / "balances";
    std::filesystem::create_directories(dir);
    const std::filesystem::path path = dir / "energyBalance_byUnit.csv";
    std::ofstream f(path);
    if (!f.is_open())
        throw std::runtime_error("energyBalance: cannot open " + path.string());

    // Per unit: the stream enthalpy balance (dH = implied duty), the sum of
    // the unit's DECLARED energy items (the curated heat/work KPIs --- a
    // column's reboiler+condenser, a heater's Q, a compressor's shaft work),
    // and the closure (declared items vs dH).  The `reference` column says
    // which datum dH used (elements carries the reaction heat).
    f << "unit,H_in_kW,H_out_kW,dH_kW,energy_items_kW,energy_closure_pct,reference\n";

    auto lookup = [&](const std::vector<std::string>& names) {
        std::vector<const ProcessStream*> v;
        for (const auto& s : names)
        {
            auto it = ctx.result.streams.find(s);
            v.push_back(it == ctx.result.streams.end() ? nullptr
                                                     : &it->second);
        }
        return v;
    };

    // Sum of a unit's declared energy items (curated, signed +supplied/-removed).
    auto itemsSum = [&](const std::string& unit, int& n) -> scalar {
        scalar s = 0.0; n = 0;
        auto it = ctx.result.kpis.find(unit);
        if (it != ctx.result.kpis.end())
            for (const auto& [k, v] : it->second)
                if (reporting::isEnergyItemKpi(k)) { s += v; ++n; }
        return s;
    };

    const auto units = reporting::resolveUnits(topo, ctx.result);
    int naCount = 0, sensibleCount = 0;
    for (const auto& u : units)
    {
        const auto e = reporting::unitEnergyBalance(lookup(u.ins), lookup(u.outs), ctx.thermo, Tref);
        int nItems = 0;
        const scalar sumItems = itemsSum(u.name, nItems);

        if (e.ref == reporting::EnergyRef::None)
        {
            // No stream-enthalpy datum, but the unit may still declare a duty.
            f << u.name << ",n/a,n/a,n/a,";
            if (nItems > 0) f << std::fixed << std::setprecision(4) << sumItems;
            f << ",n/a,n/a\n";
            ++naCount;
            continue;
        }

        const scalar dH = e.hOut - e.hIn;
        const char* refName =
            (e.ref == reporting::EnergyRef::Elements) ? "elements" : "sensible";
        if (e.ref == reporting::EnergyRef::Sensible) ++sensibleCount;

        // energy_items: the declared sum if any, else the net duty (= dH).
        // closure: 100 % when items reconcile with dH (or no breakdown).
        const scalar items = (nItems > 0) ? sumItems : dH;
        const scalar closure = (nItems > 0)
            ? (std::abs(dH) > 1.0e-9 ? 100.0 * sumItems / dH
             : (std::abs(sumItems) < 1.0e-6 ? 100.0 : 0.0))
          : 100.0;   // net duty = dH by definition

        f << u.name << "," << std::fixed << std::setprecision(4)
          << e.hIn << "," << e.hOut << "," << dH << ","
          << items << "," << std::setprecision(2) << closure << ","
          << refName << "\n";
    }

    // Breakdown: each unit's individual declared energy items.
    f << "\n# declared energy items (kW)\nunit,item,value\n";
    for (const auto& u : units)
    {
        auto it = ctx.result.kpis.find(u.name);
        if (it == ctx.result.kpis.end()) continue;
        for (const auto& [k, v] : it->second)
            if (reporting::isEnergyItemKpi(k))
                f << u.name << "," << k << "," << std::fixed
                  << std::setprecision(4) << v << "\n";
    }
    f.close();

    if (ctx.verbosity >= 2)
    {
        std::cout << "  [report] energyBalance_byUnit -> " << path.string()
                  << "  (" << units.size() << " units";
        if (sensibleCount > 0) std::cout << ", " << sensibleCount << " sensible-only";
        if (naCount > 0)       std::cout << ", " << naCount << " n/a";
        std::cout << ")\n";
    }
}

} // namespace Choupo
