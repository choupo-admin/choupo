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

#include "EquipmentTag.H"

#include "core/Advisory.H"
#include "core/FlatUnit.H"

#include <algorithm>
#include <cstdio>
#include <iostream>
#include <limits>
#include <map>
#include <set>
#include <stdexcept>

namespace Choupo {
namespace equipmentTags {

namespace {

//  THE LETTER TABLE.  Ours, for the kinds our sizers produce; Turton's PFD
//  convention names P for pumps, C for compressors, E for exchangers, V for
//  vessels, T for towers, R for reactors and TK for tanks, and the rest are
//  written here in the same spirit.  Keyed on the item's `equipmentType`.
const std::vector<std::pair<std::string, std::string>>& table()
{
    static const std::vector<std::pair<std::string, std::string>> t = {
        { "compressor",        "C"   },
        { "shellTubeHX",       "E"   },
        { "evaporator",        "EV"  },
        { "vessel",            "V"   },
        { "stirredTank",       "R"   },
        { "storageTank",       "TK"  },
        { "sprayDryer",        "D"   },
        { "crystalliser",      "CR"  },
        { "cyclone",           "CY"  },
        { "pressureExchanger", "PX"  },
        { "membraneBank",      "MB"  },
        { "reliefValve",       "PSV" },
        { "pipeHeader",        "PH"  },
        { "airHandling",       "AH"  },
        { "waterGenerator",    "WG"  },
        { "waterStorage",      "TK"  },
        { "sieveTrays",        "TR"  },
        { "catalystCharge",    "CAT" },
        //  A rated machine is told apart by its `kind` (see kindLetters).
        { "ratedMachine:volumeRate",   "P"  },
        { "ratedMachine:tabletPress",  "TP" },
        { "ratedMachine:packagingLine","PK" },
        { "ratedMachine:batchVolume",  "M"  },
        { "ratedMachine:massRate",     "M"  },
        //  An item whose letters depend on the unit it belongs to.
        { "column:shell",      "T"   },
        { "column:trays",      "TR"  },
        { "column:condenser",  "E"   },
        { "column:reboiler",   "E"   },
        { "column:refluxDrum", "V"   },
        { "reactor:vessel",    "R"   },
        { "reactor:shellTubeHX","R"  },
    };
    return t;
}

std::string lookup(const std::string& key)
{
    for (const auto& kv : table()) if (kv.first == key) return kv.second;
    return std::string();
}

std::string two(int n)
{
    char b[16];
    std::snprintf(b, sizeof b, "%02d", n);
    return b;
}

//  The suffix of an item that stands for `n` machines in parallel.
std::string installedSuffix(int n)
{
    if (n <= 1) return std::string();
    if (n == 2) return "A/B";
    if (n > 26) return "A-" + std::to_string(n);       // beyond the alphabet: a count
    return std::string("A-") + char('A' + n - 1);
}

} // namespace

std::vector<std::pair<std::string, std::string>> letterTable() { return table(); }

std::string kindLetters(const EquipmentSizing& s)
{
    const std::string& st = s.sizerType;
    std::string l;
    if (st == "distillationColumn")
        l = lookup("column:" + s.equipmentTag);
    else if (st == "pfr" || st == "converterShell")
        l = lookup("reactor:" + s.equipmentType);
    if (l.empty() && s.equipmentType == "ratedMachine")
        l = lookup("ratedMachine:" + s.machineKind);
    //  A rated machine of a kind the table does not name is still a machine.
    if (l.empty() && s.equipmentType == "ratedMachine") l = "M";
    if (l.empty()) l = lookup(s.equipmentType);
    if (l.empty())
    {
        AdvisoryLog::instance().add("sizing", "warning",
            "tag '" + s.itemId() + "'",
            "the equipment kind '" + s.equipmentType + "' has no letters in the"
            " tag table (src/postProcessing/sizing/EquipmentTag.cpp); the"
            " letter X is used until one is written for it");
        l = "X";
    }
    return l;
}

void assign(SimulationResult& result)
{
    //  ---- the sector numbers, in the order the flowsheet declares them ----
    std::vector<std::string> sectorOrder;
    for (const auto& fu : result.topology)
    {
        const std::string top = topLevelSector(fu.sector);
        if (top.empty()) continue;
        if (std::find(sectorOrder.begin(), sectorOrder.end(), top) == sectorOrder.end())
            sectorOrder.push_back(top);
    }
    auto sectorNumber = [&](const EquipmentSizing& s) -> int
    {
        if (sectorOrder.empty()) return 1;              // a flat case
        const std::string top = topLevelSector(s.sector);
        if (top.empty()) return 0;                      // the plant's own level
        auto it = std::find(sectorOrder.begin(), sectorOrder.end(), top);
        return it == sectorOrder.end() ? 0 : int(it - sectorOrder.begin()) + 1;
    };

    //  ---- declaration order ----------------------------------------------
    std::map<std::string, int> unitRank;
    for (std::size_t i = 0; i < result.topology.size(); ++i)
        unitRank.emplace(result.topology[i].name, int(i));
    const int far = std::numeric_limits<int>::max();
    std::vector<EquipmentSizing*> items;
    for (auto& kv : result.sizings) items.push_back(&kv.second);
    std::stable_sort(items.begin(), items.end(),
        [&](const EquipmentSizing* a, const EquipmentSizing* b)
        {
            auto ra = unitRank.find(a->unitName);
            auto rb = unitRank.find(b->unitName);
            const int xa = ra == unitRank.end() ? far : ra->second;
            const int xb = rb == unitRank.end() ? far : rb->second;
            if (xa != xb) return xa < xb;
            return a->ordinal < b->ordinal;
        });

    //  ---- the families of parallel items share ONE base ------------------
    auto familyOf = [](const EquipmentSizing& s)
    {
        return s.unitName + "|" + s.equipmentType + "|" + s.parallelGroup;
    };

    //  Declared bases first, so a generated number skips what a declaration
    //  took (a base is the tag without its parallel / installed suffix).
    std::set<std::string> declaredBases;
    for (const auto* s : items)
        if (!s->declaredTag.empty()) declaredBases.insert(s->declaredTag);

    std::map<std::string, std::string> baseOfFamily;     // family -> base
    std::map<std::string, std::string> byOfFamily;       // family -> generated|declared
    std::map<std::string, int>         counter;          // "Y|letters" -> last ZZ
    std::map<std::string, std::string> owner;            // final tag -> item
    std::vector<std::string>           announced;
    std::set<std::string>              announcedFamilies;

    for (auto* s : items)
    {
        const bool parallel = s->parallelOf > 1 && s->parallelIndex >= 1;
        const std::string fam = parallel ? familyOf(*s) : s->itemId();

        std::string base, by;
        auto fit = baseOfFamily.find(fam);
        if (fit != baseOfFamily.end())
        {
            base = fit->second;
            by   = byOfFamily[fam];
            if (!s->declaredTag.empty() && s->declaredTag != base)
                throw std::runtime_error("tag: item '" + s->itemId() + "' declares tag '"
                    + s->declaredTag + "' but its parallel family already took '"
                    + base + "'.  The N identical items of a family share ONE"
                      " tag base and take the letters A, B, ...; declare the"
                      " same `tag` on the entry.");
        }
        else if (!s->declaredTag.empty())
        {
            base = s->declaredTag;
            by   = "declared";
        }
        else
        {
            const std::string letters = kindLetters(*s);
            const std::string key = std::to_string(sectorNumber(*s)) + "|" + letters;
            int zz = counter[key];
            std::string cand;
            do {
                ++zz;
                cand = letters + "-" + std::to_string(sectorNumber(*s)) + two(zz);
            } while (declaredBases.count(cand));
            counter[key] = zz;
            base = cand;
            by   = "generated";
        }
        baseOfFamily[fam] = base;
        byOfFamily[fam]   = by;

        std::string suffix;
        if (parallel)
        {
            if (s->parallelOf > 26)
                throw std::runtime_error("tag: item '" + s->itemId() + "' is one of "
                    + std::to_string(s->parallelOf) + " parallel items; the letters"
                      " A..Z cannot tell more than 26 apart.  Declare a `tag` per"
                      " group of fewer.");
            suffix = std::string(1, char('A' + s->parallelIndex - 1));
        }
        else
            suffix = installedSuffix(s->installed);

        const std::string finalTag = base + suffix;
        auto ow = owner.find(finalTag);
        if (ow != owner.end())
            throw std::runtime_error("tag: items '" + ow->second + "' and '"
                + s->itemId() + "' would both be tagged '" + finalTag + "'.  Two"
                  " items of a plant never share a tag"
                  + std::string(by == "declared"
                      ? ": change the declared `tag` of one of them."
                      : ": declare a `tag` on one of them."));
        owner[finalTag] = s->itemId();

        const bool fresh = s->tagNo != finalTag;
        s->tagNo = finalTag;
        s->tagBy = by;
        if (fresh && by == "declared" && !s->declaredTag.empty()
            && announcedFamilies.insert(fam).second)
            announced.push_back("item '" + s->itemId() + "'"
                + std::string(parallel ? " (and its " + std::to_string(s->parallelOf - 1)
                                           + " parallel sibling(s))" : "")
                + ": tag " + (parallel ? base + "A.." : finalTag)
                + " is the case's own (declared), not generated");
    }
    for (const auto& m : announced)
    {
        std::cout << "  [tag] " << m << "\n";
        AdvisoryLog::instance().add("sizing", "info", "tag", m);
    }
}

} // namespace equipmentTags
} // namespace Choupo
