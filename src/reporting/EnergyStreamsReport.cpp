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

#include "EnergyStreamsReport.H"

#include <filesystem>
#include <fstream>
#include <iomanip>
#include <iostream>

namespace Choupo {

void EnergyStreamsReport::run(const DictPtr& /*dict*/, const ReportContext& ctx)
{
    const std::filesystem::path dir = ctx.outDir("energyStreams", "utilities");
    std::filesystem::create_directories(dir);
    const std::filesystem::path path = dir / "energyStreams.csv";

    std::ofstream f(path);
    if (!f.is_open())
        throw std::runtime_error("energyStreams: cannot open " + path.string());

    f << "from_unit,from_port,to_unit,to_target,kind,value_W,value_kW\n";

    if (ctx.result.energyWires.empty())
    {
        f << "(none),,,,,,\n";
    }
    else
    {
        scalar sum_work = 0.0, sum_heat = 0.0;
        for (const auto& w : ctx.result.energyWires)
        {
            f << w.fromUnit << "," << w.fromPort << ","
              << w.toUnit   << "," << w.toTarget << ","
              << w.kind     << ","
              << std::scientific << std::setprecision(6) << w.value << ","
              << std::fixed << std::setprecision(4) << (w.value / 1000.0) << "\n";
            if (w.kind == "work") sum_work += w.value;
            else if (w.kind == "heat") sum_heat += w.value;
        }
        f << "# totals by kind\n";
        f << "TOTAL_work,,,,," << std::scientific << std::setprecision(6)
          << sum_work << "," << std::fixed << std::setprecision(4)
          << (sum_work / 1000.0) << "\n";
        f << "TOTAL_heat,,,,," << std::scientific << std::setprecision(6)
          << sum_heat << "," << std::fixed << std::setprecision(4)
          << (sum_heat / 1000.0) << "\n";
    }
    f.close();

    if (ctx.verbosity >= 2)
        std::cout << "  [report] energyStreams -> " << path.string()
                  << "  (" << ctx.result.energyWires.size()
                  << " wire" << (ctx.result.energyWires.size() == 1 ? "" : "s")
                  << ")\n";
}

} // namespace Choupo
