/*---------------------------------------------------------------------------*\
       \|/       C hemicals     | Open-source, glass-box chemical process simulator
      \\|//      H eat-transfer | https://choupo.org
     \\\|///     O perations    |
      \\|//      U nits         | Copyright (C) 2026 Vítor Geraldes
       \|/       P roperties    | Licence: GPL-3.0-or-later
        |        O ptimization  |
       /|\                      |
-------------------------------------------------------------------------------
    SPDX-License-Identifier: GPL-3.0-or-later
    Credit and attribution: see AUTHORS
    Required legal notices:  see NOTICE
\*---------------------------------------------------------------------------*/

#include "MaterialLimits.H"
#include "core/Advisory.H"

#include <cmath>
#include <cstdio>
#include <iostream>
#include <string>
#include <vector>

namespace Choupo {
namespace materialLimits {

namespace {

void announce(const std::string& who, const std::string& msg)
{
    std::cout << "  [rating] WARNING: " << who << ": " << msg << "\n";
    AdvisoryLog::instance().add("rating", "warning", who, msg);
}

} // anonymous namespace

void pressure(const std::string& who,
              const Material&    material,
              scalar             pressureDesign_bar)
{
    if (!(pressureDesign_bar > material.maxP)) return;
    char b[260];
    std::snprintf(b, sizeof(b),
        "design pressure %.1f bar EXCEEDS material '%s' rating %.1f bar"
        " -- choose a stronger material or lower the design pressure",
        static_cast<double>(pressureDesign_bar), material.name.c_str(),
        static_cast<double>(material.maxP));
    announce(who, b);
}

void temperature(const std::string& who,
                 const Material&    material,
                 scalar             T_K,
                 const std::string& where)
{
    if (!(material.maxT > 0.0) || !(T_K > 0.0) || !std::isfinite(T_K)) return;
    if (!(T_K > material.maxT)) return;
    char b[200];
    std::snprintf(b, sizeof(b),
        "service temperature %.1f K (%s) EXCEEDS material '%s' maxT %.1f K",
        static_cast<double>(T_K), where.c_str(), material.name.c_str(),
        static_cast<double>(material.maxT));
    announce(who, std::string(b)
        + " -- the record's own service limit, not a code allowable; the"
          " wall was sized on the record's one sigma_y, which no temperature"
          " reduces -- choose a material whose record covers this temperature");
}

HottestPort hottestPort(const EquipmentSizing&  item,
                        const SimulationResult& result)
{
    std::vector<std::string> ports;
    if (!item.stream.empty())
        ports.push_back(item.stream);          // a storage tank's one stream
    else
    {
        bool found = false;
        for (const auto& fu : result.topology)
            if (fu.name == item.unitName)
            {
                ports.insert(ports.end(), fu.ins.begin(), fu.ins.end());
                ports.insert(ports.end(), fu.outs.begin(), fu.outs.end());
                found = true;
                break;
            }
        //  AN ITEM A SECTOR REALISES names the sector as its unit (a
        //  converter's one pressure shell, the relief valve on it): its ports
        //  are those of every unit the sector holds.  Matched against the
        //  topology's own stamped `sector`, never by splitting a name.
        if (!found)
            for (const auto& fu : result.topology)
                if (fu.sector == item.unitName
                    || fu.sector.rfind(item.unitName + ".", 0) == 0)
                {
                    ports.insert(ports.end(), fu.ins.begin(), fu.ins.end());
                    ports.insert(ports.end(), fu.outs.begin(), fu.outs.end());
                }
    }

    HottestPort h;
    for (const auto& s : ports)
    {
        auto it = result.streams.find(s);
        if (it == result.streams.end()) continue;
        const scalar T = it->second.T;
        if (std::isfinite(T) && T > h.T) { h.T = T; h.stream = s; }
    }
    return h;
}

} // namespace materialLimits
} // namespace Choupo

// ************************************************************************* //
