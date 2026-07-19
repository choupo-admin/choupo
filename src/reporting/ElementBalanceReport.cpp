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

#include "reporting/ElementBalanceReport.H"

#include "reporting/BalanceMath.H"
#include "reporting/Topology.H"
#include "thermo/ElementComposition.H"
#include "thermo/ThermoPackage.H"

#include <fstream>
#include <iomanip>
#include <iostream>
#include <map>

namespace Choupo {

void ElementBalanceReport::run(const DictPtr& /*dict*/,
                               const ReportContext& ctx)
{
    const auto topo = reporting::readTopology(ctx.flowsheetDict, ctx.result);
    const auto& comps = ctx.result.componentNames;
    const std::size_t n = comps.size();

    const std::filesystem::path dir = ctx.outDir("elementBalance", "balances");
    std::filesystem::create_directories(dir);
    const std::filesystem::path path = dir / "elementBalance.csv";

    // ONE shared routine (BalanceMath::elementBoundaryBalance): union of
    // in/out elements, refusals as states, missing streams withheld.
    (void) comps; (void) n;
    const auto eb = reporting::elementBoundaryBalance(
        topo.feeds, topo.products, ctx.result, ctx.thermo);

    std::ofstream f(path);
    if (!f.is_open())
        throw std::runtime_error("elementBalance: cannot open "
                                 + path.string());
    if (!eb.available)
    {
        f << "status,UNAVAILABLE\n";
        for (const auto& [nm, why] : eb.refusedSpecies)
            f << "species," << nm << ",\"" << why << "\"\n";
        for (const auto& nm : eb.missingStreams)
            f << "stream," << nm << ",\"declared boundary stream has no"
                 " state in the result\"\n";
        f.close();
        if (ctx.verbosity >= 1)
        {
            std::cout << "  [report] elementBalance -> UNAVAILABLE (the"
                         " elemental claim is withheld; mass balance stays"
                         " available):\n";
            for (const auto& [nm, why] : eb.refusedSpecies)
                std::cout << "      " << nm << ": " << why << "\n";
            for (const auto& nm : eb.missingStreams)
                std::cout << "      stream " << nm << ": no state in the"
                             " result\n";
        }
        return;
    }

    f << "element,in_kmol_atom_h,out_kmol_atom_h,residual_kmol_atom_h,"
         "closure_pct\n";
    scalar worst = 0.0;
    for (const auto& [sym, ain] : eb.elemIn)
    {
        const scalar aInH  = ain * 3600.0;
        const scalar aOutH = eb.elemOut.at(sym) * 3600.0;
        const scalar cl = reporting::closurePct(aInH, aOutH);
        worst = std::max(worst, std::abs(cl - 100.0));
        f << sym << "," << std::scientific << std::setprecision(6)
          << aInH << "," << aOutH << "," << (aOutH - aInH) << ","
          << std::fixed << std::setprecision(4) << cl << "\n";
    }
    f.close();
    if (ctx.verbosity >= 2)
        std::cout << "  [report] elementBalance -> " << path.string()
                  << "   (worst element closure off by "
                  << std::fixed << std::setprecision(4) << worst << " %)\n";
}

} // namespace Choupo
