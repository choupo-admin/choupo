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
    This file is part of Choupo.  GPL-3.0-or-later, see LICENSE.

    SPDX-License-Identifier: GPL-3.0-or-later

    Credit and attribution: see AUTHORS
    Required legal notices:  see NOTICE
-------------------------------------------------------------------------------
Description
    See DynamicPublications.H.
\*---------------------------------------------------------------------------*/

#include "postProcessing/views/DynamicPublications.H"

namespace Choupo {
namespace views {

std::string stateLabelUnit(const std::string& l)
{
    if (l == "T" || l == "T_jacket" || l == "T_in") return "K";
    if (l.rfind("n_", 0) == 0) return "kmol";
    if (l == "F_in" || l == "F_out") return "kmol/s";
    if (l.rfind("z_in_", 0) == 0) return "-";
    if (l == "level") return "m";
    if (l == "volume") return "m3";
    if (l == "density") return "kg/m3";
    return std::string();
}

std::vector<Publication> publicationsOfTimeSeries(const std::vector<TimeSeriesRecord>& producers)
{
    std::vector<Publication> out;
    for (const auto& p : producers)
    {
        Publication pub;
        pub.name = "unit:" + p.name;
        pub.type = p.type;
        for (const auto& [k, x] : p.kpis)
        {
            pub.diagnostics[k] = x;
            auto u = p.kpiUnits.find(k);
            pub.units[k] = u != p.kpiUnits.end() ? u->second : std::string();
        }
        PublishedTable t;
        t.name = "trajectory";
        t.description = "the write grid of trajectory.csv, one row per write point";
        t.columns.push_back({ "t", "s" });
        for (std::size_t c = 0; c < p.columns.size(); ++c)
            t.columns.push_back({ p.columns[c], p.columnUnits[c] });
        for (std::size_t r = 0; r < p.t.size(); ++r)
        {
            std::vector<scalar> row{ p.t[r] };
            row.insert(row.end(), p.rows[r].begin(), p.rows[r].end());
            t.rows.push_back(std::move(row));
        }
        pub.tables.push_back(std::move(t));
        out.push_back(std::move(pub));
    }
    return out;
}

} // namespace views
} // namespace Choupo
