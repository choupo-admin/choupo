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

#include "VanKrevelen.H"

#include "core/Dictionary.H"
#include "thermo/Database.H"

#include <filesystem>
#include <map>

namespace Choupo {

namespace {

// One Van Krevelen (Slice 1) group: repeat-unit molar mass + the Bondi van der
// Waals group volume.  MW is an atomic-mass fact; Vw is Bondi (1964), carried
// per value with its own provenance in the .dat.  hasVw=false marks a group
// whose open Vw value is not (yet) available -> printed `? (no open value)`,
// never a silent zero.
struct VKGroup { double MW; double Vw; bool hasVw; };

// Loaded ONCE from data/standards/parameters/vanKrevelen.dat (resolved via
// Database::currentRoot()).  The loader is TOLERANT of an absent `Vw` key: such
// a group still carries its MW (so M0 is exact) but contributes no volume.
const std::map<std::string, VKGroup>& table()
{
    static const std::map<std::string, VKGroup> t = [] {
        namespace fs = std::filesystem;
        const fs::path p = fs::path(Database::currentRoot())
                         / "standards" / "parameters" / "vanKrevelen.dat";
        const auto d = Dictionary::fromFile(p.string());
        std::map<std::string, VKGroup> m;
        for (const auto& g : d->lookupDictList("groups"))
        {
            const bool hasVw = g->found("Vw");
            m[g->lookupWord("name")] = VKGroup{
                g->lookupScalar("MW"),
                hasVw ? g->lookupScalar("Vw") : 0.0,
                hasVw };
        }
        return m;
    }();
    return t;
}

} // namespace

std::vector<std::string> VanKrevelen::knownGroups() const
{
    std::vector<std::string> out;
    for (const auto& kv : table()) out.push_back(kv.first);
    return out;
}

PolymerEstimate VanKrevelen::estimatePolymer(const std::vector<GroupSpec>& groups,
                                             double k,
                                             bool& ok, std::string& error) const
{
    ok = true; error.clear();
    PolymerEstimate r;
    r.k = k;
    r.hasVol = true;

    double M0 = 0.0, Vw = 0.0;
    for (const auto& gs : groups)
    {
        auto it = table().find(gs.first);
        if (it == table().end())
        {
            ok = false;
            error = "unknown polymer group '" + gs.first + "'.  Known groups: ";
            for (const auto& kv : table()) error += kv.first + " ";
            return r;
        }
        const VKGroup& g = it->second;
        const int n = gs.second;
        M0 += n * g.MW;
        if (g.hasVw) Vw += n * g.Vw;
        else         r.hasVol = false;     // a missing Vw makes V/rho unavailable
        r.breakdown.push_back({ gs.first, n, g.MW, g.Vw, g.hasVw });
    }

    r.M0 = M0;
    r.Vw = Vw;
    if (r.hasVol && k > 0.0 && Vw > 0.0)
    {
        r.V   = k * Vw;                    // cm^3/mol
        r.rho = M0 / r.V;                  // g/cm^3
    }
    return r;
}

} // namespace Choupo
