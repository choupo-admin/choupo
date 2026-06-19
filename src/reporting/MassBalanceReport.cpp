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

#include "MassBalanceReport.H"
#include "BalanceMath.H"
#include "Topology.H"
#include "streams/StreamMass.H"

#include <fstream>
#include <iomanip>
#include <iostream>
#include <vector>

namespace Choupo {

using reporting::componentMassFlow;
using reporting::closurePct;

void MassBalanceReport::run(const DictPtr& /*dict*/, const ReportContext& ctx)
{
    const auto topo = reporting::readTopology(ctx.flowsheetDict);
    const auto& comps = ctx.result.componentNames;
    const std::size_t n = comps.size();

    const std::filesystem::path dir = ctx.reportsDir / "balances";
    std::filesystem::create_directories(dir);

    // ---- Global per-component balance (feeds in, products out) ----------
    std::vector<scalar> in(n, 0.0), out(n, 0.0);
    for (const auto& name : topo.feeds)
    {
        auto it = ctx.result.streams.find(name);
        if (it == ctx.result.streams.end()) continue;
        const auto m = componentMassFlow(it->second, ctx.thermo);
        for (std::size_t i = 0; i < n; ++i) in[i] += m[i];
    }
    for (const auto& name : topo.products)
    {
        auto it = ctx.result.streams.find(name);
        if (it == ctx.result.streams.end()) continue;
        const auto m = componentMassFlow(it->second, ctx.thermo);
        for (std::size_t i = 0; i < n; ++i) out[i] += m[i];
    }

    {
        const std::filesystem::path path = dir / "massBalance.csv";
        std::ofstream f(path);
        if (!f.is_open())
            throw std::runtime_error("massBalance: cannot open " + path.string());
        f << "component,in_kg_per_h,out_kg_per_h,net_kg_per_h\n";
        scalar totIn = 0.0, totOut = 0.0;
        for (std::size_t i = 0; i < n; ++i)
        {
            f << comps[i] << "," << std::fixed << std::setprecision(4)
              << in[i] << "," << out[i] << "," << (out[i] - in[i]) << "\n";
            totIn += in[i]; totOut += out[i];
        }
        f << "TOTAL," << std::fixed << std::setprecision(4)
          << totIn << "," << totOut << "," << (totOut - totIn) << "\n";
        f << "closure_pct,,," << std::setprecision(4)
          << closurePct(totIn, totOut) << "\n";
        f.close();
        if (ctx.verbosity >= 2)
            std::cout << "  [report] massBalance -> " << path.string()
                      << "   (global closure "
                      << std::fixed << std::setprecision(3)
                      << closurePct(totIn, totOut) << " %)\n";
    }

    // ---- Per-unit total mass balance ------------------------------------
    {
        const std::filesystem::path path = dir / "massBalance_byUnit.csv";
        std::ofstream f(path);
        if (!f.is_open())
            throw std::runtime_error("massBalance: cannot open " + path.string());
        f << "unit,in_kg_per_h,out_kg_per_h,diff_kg_per_h,closure_pct\n";
        const auto units = reporting::resolveUnits(topo, ctx.result);
        for (const auto& u : units)
        {
            scalar uin = 0.0, uout = 0.0;
            for (const auto& s : u.ins)
            {
                auto it = ctx.result.streams.find(s);
                if (it != ctx.result.streams.end())
                    uin += F_mass(it->second, ctx.thermo) * 3600.0;
            }
            for (const auto& s : u.outs)
            {
                auto it = ctx.result.streams.find(s);
                if (it != ctx.result.streams.end())
                    uout += F_mass(it->second, ctx.thermo) * 3600.0;
            }
            f << u.name << "," << std::fixed << std::setprecision(4)
              << uin << "," << uout << "," << (uout - uin)
              << "," << std::setprecision(4) << closurePct(uin, uout) << "\n";
        }
        f.close();
        if (ctx.verbosity >= 2)
            std::cout << "  [report] massBalance_byUnit -> " << path.string()
                      << "  (" << units.size() << " units)\n";
    }
}

} // namespace Choupo
