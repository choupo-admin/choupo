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
-------------------------------------------------------------------------------
Description
    See RunPublications.H.
\*---------------------------------------------------------------------------*/

#include "postProcessing/views/RunPublications.H"

#include "core/Units.H"

#include <cstddef>
#include <map>
#include <string>
#include <utility>

namespace Choupo {
namespace views {

namespace {

//  A quantity's unit WHERE ITS NAME SAYS IT: the part after the last `_`
//  when that is a registered, linear, dimensioned unit (`Q_reboiler_kW`).  A
//  name that does not say it publishes none: the unit a view declares is then
//  the author's statement, said aloud on the console.
std::string unitFromName(const std::string& name)
{
    const auto us = name.rfind('_');
    if (us == std::string::npos || us + 1 >= name.size()) return std::string();
    const std::string suffix = name.substr(us + 1);
    const auto spec = units::lookupUnit(suffix);
    if (!spec || spec->affine) return std::string();
    if (spec->dims == Dims::dimensionless) return std::string();
    return suffix;
}

std::string profileColumnUnit(const std::string& name)
{
    if (name == "stage") return "-";
    if (name == "T") return "K";     // the engine's T is kelvin
    for (const char* p : { "x_", "y_", "z_", "w_", "gamma_" })
        if (name.rfind(p, 0) == 0) return "-";
    return unitFromName(name);
}

} // namespace

std::vector<Publication> publicationsOfRun(const SimulationResult& r)
{
    std::vector<Publication> out;

    for (const auto& fu : r.topology)
    {
        Publication pub;
        pub.name = "unit:" + fu.name;
        pub.type = fu.type;
        const auto kp = r.kpis.find(fu.name);
        if (kp != r.kpis.end())
            for (const auto& [key, v] : kp->second)
            {
                pub.diagnostics[key] = v;
                pub.units[key] = unitFromName(key);
            }
        const auto pr = r.profiles.find(fu.name);
        if (pr != r.profiles.end() && !pr->second.columns.empty())
        {
            const UnitProfile& up = pr->second;
            PublishedTable t;
            t.name = "profile";
            t.description = "the unit's own profile along " + up.xAxis + ", one row per point";
            std::vector<const std::vector<scalar>*> cols;
            //  the x axis first, then the other columns in the map's order
            if (up.columns.count(up.xAxis))
            {
                t.columns.push_back({ up.xAxis, profileColumnUnit(up.xAxis) });
                cols.push_back(&up.columns.at(up.xAxis));
            }
            for (const auto& [cn, cv] : up.columns)
            {
                if (cn == up.xAxis) continue;
                t.columns.push_back({ cn, profileColumnUnit(cn) });
                cols.push_back(&cv);
            }
            const std::size_t nrows = cols.empty() ? 0 : cols.front()->size();
            for (std::size_t i = 0; i < nrows; ++i)
            {
                std::vector<scalar> row;
                for (const auto* c : cols) row.push_back(i < c->size() ? (*c)[i] : 0.0);
                t.rows.push_back(std::move(row));
            }
            pub.tables.push_back(std::move(t));
            //  where the unit marks a position on its axis (the feed stage)
            for (const auto& m : up.markers)
            {
                pub.diagnostics["marker_" + m.label] = m.x;
                pub.units["marker_" + m.label] = up.xAxis == "stage" ? "-" : std::string();
            }
        }
        out.push_back(std::move(pub));
    }

    const auto& names = r.componentNames;
    for (const auto& [name, s] : r.streams)
    {
        Publication pub;
        pub.name = "stream:" + name;
        pub.type = "stream";
        scalar solid = 0.0;
        for (std::size_t i = 0; i < s.s.size(); ++i) solid += s.s[i];
        const scalar total = s.F + solid;
        pub.diagnostics["T"] = s.T;         pub.units["T"] = "K";
        pub.diagnostics["P"] = s.P;         pub.units["P"] = "Pa";
        pub.diagnostics["F"] = total;       pub.units["F"] = "kmol/s";
        pub.diagnostics["vf"] = s.vf;       pub.units["vf"] = "-";
        scalar mass = 0.0;
        std::map<std::string, scalar> flow;       // kmol/s of the overall material
        for (std::size_t i = 0; i < names.size(); ++i)
        {
            const scalar zi = i < s.z.size() ? s.z[i] : 0.0;
            const scalar si = i < s.s.size() ? s.s[i] : 0.0;
            const auto mw = r.componentMolarMass.find(names[i]);
            const scalar n = s.F * zi + si;
            flow[names[i]] = n;
            if (mw != r.componentMolarMass.end()) mass += n * mw->second;
        }
        pub.diagnostics["F_mass"] = mass;   pub.units["F_mass"] = "kg/s";
        for (std::size_t i = 0; i < names.size(); ++i)
        {
            const std::string& c = names[i];
            const auto mw = r.componentMolarMass.find(c);
            pub.diagnostics["x_" + c] = total > 0.0 ? flow[c] / total : 0.0;
            pub.units["x_" + c] = "-";
            if (mw != r.componentMolarMass.end())
            {
                pub.diagnostics["m_" + c] = flow[c] * mw->second;
                pub.units["m_" + c] = "kg/s";
                pub.diagnostics["w_" + c] = mass > 0.0 ? flow[c] * mw->second / mass : 0.0;
                pub.units["w_" + c] = "-";
            }
        }
        out.push_back(std::move(pub));
    }
    return out;
}

} // namespace views
} // namespace Choupo
