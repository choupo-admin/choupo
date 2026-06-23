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

#include "StreamTableReport.H"
#include "BalanceMath.H"
#include "Topology.H"
#include "streams/StreamMass.H"

#include <algorithm>
#include <fstream>
#include <iomanip>
#include <iostream>

namespace Choupo {

void StreamTableReport::run(const DictPtr& /*dict*/, const ReportContext& ctx)
{
    const auto topo = reporting::readTopology(ctx.flowsheetDict);

    auto roleOf = [&](const std::string& name) -> std::string {
        if (topo.feeds.count(name))    return "feed";
        if (topo.products.count(name)) return "product";
        return "intermediate";
    };

    const auto& comps = ctx.result.componentNames;
    const std::filesystem::path dir = ctx.outDir("streamTable", "streams");
    std::filesystem::create_directories(dir);
    const std::filesystem::path path = dir / "streamTable.csv";
    std::ofstream f(path);
    if (!f.is_open())
        throw std::runtime_error("streamTable: cannot open " + path.string());

    // Header
    f << "stream,role,F_kmol_per_h,F_mass_kg_per_h,T_K,P_bar,vapourFraction,solids_kg_per_h,enthalpy_kW";
    for (const auto& c : comps) f << ",x_" << c;
    f << "\n";

    // Stable order: feed -> intermediate -> product, then by name.
    auto rank = [&](const std::string& n) {
        const std::string r = roleOf(n);
        return r == "feed" ? 0 : r == "intermediate" ? 1 : 2;
    };
    std::vector<std::string> names;
    for (const auto& [name, s] : ctx.result.streams) { (void)s; names.push_back(name); }
    std::sort(names.begin(), names.end(), [&](const std::string& a, const std::string& b) {
        const int ra = rank(a), rb = rank(b);
        return ra != rb ? ra < rb : a < b;
    });

    for (const auto& name : names)
    {
        const auto& s = ctx.result.streams.at(name);
        const scalar F_kmol_h = s.F * 3600.0;                  // kmol/s -> kmol/h
        const scalar Fm_kg_h  = F_mass(s, ctx.thermo) * 3600.0; // kg/s  -> kg/h
        f << name << "," << roleOf(name)
          << "," << std::fixed << std::setprecision(6) << F_kmol_h
          << "," << Fm_kg_h
          << "," << std::setprecision(3) << s.T
          << "," << std::setprecision(4) << (s.P / 1.0e5)
          << "," << std::setprecision(4) << s.vf;
        scalar solidMass = 0.0;                                  // kg/h
        for (std::size_t i = 0; i < comps.size() && i < s.s.size(); ++i)
            solidMass += s.s[i] * ctx.thermo.comp(i).MW() * 3600.0;
        f << "," << std::setprecision(6) << solidMass;
        // Per-stream enthalpy flow [kW] (elements datum, sensible fallback).
        auto h = reporting::streamH_elements(s, ctx.thermo);
        if (!h) h = reporting::streamH_sensible(s, ctx.thermo, 298.15);
        if (h) f << "," << std::setprecision(4) << *h;
        else   f << ",n/a";
        for (std::size_t i = 0; i < comps.size(); ++i)
        {
            const scalar xi = (i < s.z.size()) ? s.z[i] : 0.0;
            f << "," << std::setprecision(6) << xi;
        }
        f << "\n";
    }
    f.close();

    if (ctx.verbosity >= 2)
        std::cout << "  [report] streamTable -> " << path.string()
                  << "  (" << names.size() << " streams)\n";
}

} // namespace Choupo
