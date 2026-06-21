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

#include "Yang2020.H"

#include "core/Dictionary.H"
#include "thermo/Database.H"

#include <filesystem>
#include <map>

namespace Choupo {

namespace {

// One Yang-2020 group: the repeat-unit formula weight contribution (MW) and the
// limiting Tg contribution Yg(inf) in 10^3 g.K/mol.  Both are transcribed from
// Table S3 of Yang 2020 (CC-BY).  A group with no Yg carries hasYg=false ->
// printed `? (no value)`, never a silent zero.
struct YGroup { double MW; double Yg; bool hasYg; };

// Loaded ONCE from data/standards/yang2020/groups.dat.  The 58-group mapping is
// VERIFIED (2026-06-22): PVC/4VP/NVP/NVC reproduce the paper's Fig 6 Tg(inf)
// (351/426/452/504 K) exactly -- see the groups.dat header.
const std::map<std::string, YGroup>& table()
{
    static const std::map<std::string, YGroup> t = [] {
        namespace fs = std::filesystem;
        const fs::path p = fs::path(Database::currentRoot())
                         / "standards" / "yang2020" / "groups.dat";
        const auto d = Dictionary::fromFile(p.string());
        std::map<std::string, YGroup> m;
        for (const auto& g : d->lookupDictList("groups"))
        {
            const bool hasYg = g->found("Yg");
            m[g->lookupWord("name")] = YGroup{
                g->lookupScalar("MW"),
                hasYg ? g->lookupScalar("Yg") : 0.0,
                hasYg };
        }
        return m;
    }();
    return t;
}

} // namespace

std::vector<std::string> Yang2020::knownGroups() const
{
    std::vector<std::string> out;
    for (const auto& kv : table()) out.push_back(kv.first);
    return out;
}

PolymerEstimate Yang2020::estimatePolymer(const std::vector<GroupSpec>& groups,
                                          double k,
                                          bool& ok, std::string& error) const
{
    ok = true; error.clear();
    PolymerEstimate r;
    r.k = k;                 // not used by Tg, carried for a uniform record
    r.hasVol = false;        // Yang 2020 predicts Tg, not density
    r.hasTg = true;

    double M0 = 0.0, YgSum = 0.0;
    for (const auto& gs : groups)
    {
        auto it = table().find(gs.first);
        if (it == table().end())
        {
            ok = false;
            error = "unknown Yang-2020 polymer group '" + gs.first
                  + "'.  Known groups: ";
            for (const auto& kv : table()) error += kv.first + " ";
            r.hasTg = false;
            return r;
        }
        const YGroup& g = it->second;
        const int n = gs.second;
        M0 += n * g.MW;
        if (g.hasYg) YgSum += n * g.Yg;
        else         r.hasTg = false;     // a missing Yg makes Tg unavailable

        PolymerEstimate::PolyBreakdown b;
        b.name = gs.first; b.count = n; b.dMW = g.MW;
        b.dYg = g.Yg; b.hasYg = g.hasYg;
        r.breakdown.push_back(b);
    }

    r.M0    = M0;
    r.YgSum = YgSum;
    if (r.hasTg && M0 > 0.0)
        r.Tg = YgSum * 1.0e3 / M0;        // Yg in 10^3 g.K/mol ; M0 in g/mol -> K
    else
        r.hasTg = false;
    return r;
}

} // namespace Choupo
