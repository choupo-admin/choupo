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

#include "EquipmentList.H"

#include <algorithm>
#include <iomanip>
#include <sstream>

namespace Choupo {
namespace equipmentList {

const std::vector<std::string>& columns()
{
    static const std::vector<std::string> c = {
        "tag", "item", "unit", "sector", "equipment", "installed",
        "sizeKey", "sizeValue", "sizeUnit", "dimensions",
        "pressureDesign", "pressureUnit", "material",
        "currency", "purchased", "bareModule", "totalModule", "costNote",
        "tagBy" };
    return c;
}

namespace {

std::string shortNum(double v)
{
    std::ostringstream o;
    o << std::defaultfloat << std::setprecision(6) << v;
    return o.str();
}

} // namespace

std::vector<Row> rows(const SimulationResult& result)
{
    std::vector<Row> out;
    out.reserve(result.sizings.size());
    for (const auto& [itemKey, sz] : result.sizings)
    {
        Row r;
        r.tag       = sz.tagNo;
        r.item      = itemKey;
        r.unit      = sz.unitName;
        r.sector    = sz.sector;
        r.equipment = sz.equipmentType;
        r.installed = sz.installed;
        r.material  = sz.material;
        r.tagBy     = sz.tagBy;

        //  THE CANONICAL SIZE, by the same order the sizing table prints it.
        for (const char* k : { "V_R", "A", "m_catalyst_kg", "A_relief", "utilisation" })
        {
            auto it = sz.values.find(k);
            if (it == sz.values.end()) continue;
            r.sizeKey = k;  r.haveSize = true;  r.sizeValue = it->second;
            r.sizeUnit = sz.unitOf(k);
            break;
        }
        //  THE KEY DIMENSIONS the sheet carries, each with its own unit.
        for (const char* k : { "D", "H", "L" })
        {
            auto it = sz.values.find(k);
            if (it == sz.values.end()) continue;
            if (!r.dimensions.empty()) r.dimensions += "; ";
            const std::string u = sz.unitOf(k);
            r.dimensions += std::string(k) + " " + shortNum(it->second)
                          + (u.empty() || u == "-" ? std::string() : " " + u);
        }
        {
            auto it = sz.values.find("pressureDesign");
            if (it != sz.values.end())
            {
                r.havePressure = true;
                r.pressureDesign = it->second;
                r.pressureUnit = sz.unitOf("pressureDesign");
            }
        }
        auto ci = result.costs.find(itemKey);
        if (ci != result.costs.end())
        {
            const CostBreakdown& c = ci->second;
            r.costed = true;
            r.currency = c.currency;
            r.purchased = c.purchasedCost;
            r.bareModule = c.bareModuleCost;
            r.totalModule = c.totalModuleCost;
            r.costNote = c.quoteBasis.empty()
                ? "priced by " + (c.correlation.empty() ? std::string("the costing model")
                                                         : c.correlation)
                : "declared quote, " + c.quoteBasis;
        }
        else if (!sz.notCostedBecause.empty())
            r.costNote = "not costed: " + sz.notCostedBecause;
        else if (result.sizingAttempted)
            r.costNote = "no costing pass ran";
        out.push_back(std::move(r));
    }
    std::stable_sort(out.begin(), out.end(),
        [](const Row& a, const Row& b)
        {
            if (a.tag != b.tag) return a.tag < b.tag;
            return a.item < b.item;
        });
    return out;
}

} // namespace equipmentList
} // namespace Choupo
