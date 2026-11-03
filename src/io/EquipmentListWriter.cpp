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

#include "EquipmentListWriter.H"

#include "result/EquipmentList.H"

#include <filesystem>
#include <fstream>
#include <iomanip>
#include <iostream>
#include <sstream>

namespace fs = std::filesystem;

namespace Choupo {
namespace EquipmentListWriter {

namespace {

//  RFC 4180, and only when needed, as `sizing.csv` does.
std::string field(const std::string& s)
{
    if (s.find_first_of(",\"\n") == std::string::npos) return s;
    std::string o = "\"";
    for (char c : s) { if (c == '"') o += '"'; o += c; }
    return o + "\"";
}

std::string num(double v)
{
    std::ostringstream o;
    o << std::defaultfloat << std::setprecision(10) << v;
    return o.str();
}

} // namespace

std::size_t write(const std::string& caseRoot, const SimulationResult& result,
                  int verbosity)
{
    const fs::path dir = fs::path(caseRoot) / "reports" / "equipment";
    std::error_code ec;
    //  REGENERATED WHOLE: a stale list of a previous run's items must not
    //  linger beside a fresh answer.
    fs::remove_all(dir, ec);
    if (result.sizings.empty()) return 0;
    fs::create_directories(dir, ec);

    const auto rs = equipmentList::rows(result);
    std::ofstream f((dir / "equipmentList.csv").string(),
                    std::ios::out | std::ios::trunc);
    if (!f.is_open())
        throw std::runtime_error("equipment list: cannot open "
                                 + (dir / "equipmentList.csv").string());
    const auto& cols = equipmentList::columns();
    for (std::size_t i = 0; i < cols.size(); ++i)
        f << (i ? "," : "") << cols[i];
    f << "\n";
    for (const auto& r : rs)
    {
        f << field(r.tag) << "," << field(r.item) << "," << field(r.unit) << ","
          << field(r.sector.empty() ? std::string() : r.sector) << ","
          << field(r.equipment) << "," << r.installed << ","
          << field(r.sizeKey) << "," << (r.haveSize ? num(r.sizeValue) : std::string())
          << "," << field(r.sizeUnit) << "," << field(r.dimensions) << ","
          << (r.havePressure ? num(r.pressureDesign) : std::string()) << ","
          << field(r.havePressure ? r.pressureUnit : std::string()) << ","
          << field(r.material) << "," << field(r.costed ? r.currency : std::string())
          << "," << (r.costed ? num(r.purchased) : std::string())
          << "," << (r.costed ? num(r.bareModule) : std::string())
          << "," << (r.costed ? num(r.totalModule) : std::string())
          << "," << field(r.costNote) << "," << field(r.tagBy) << "\n";
    }
    if (verbosity >= 2)
        std::cout << "  [equipment] list -> reports/equipment/equipmentList.csv  ("
                  << rs.size() << " items; regenerated whole)\n";
    return rs.size();
}

} // namespace EquipmentListWriter
} // namespace Choupo
