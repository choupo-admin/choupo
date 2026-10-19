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

#include "result/BatchPlanJson.H"
#include "result/ResultEmitter.H"   // jsonNumber, jsonEscape: one formatter

#include <cstddef>
#include <string>
#include <vector>

namespace Choupo {

namespace {

std::string esc(const std::string& s) { return jsonEscape(s); }
std::string num(scalar v) { return jsonNumber(v); }

std::string words(const std::vector<std::string>& v)
{
    std::string s = "[";
    for (std::size_t i = 0; i < v.size(); ++i) s += (i ? ", " : "") + esc(v[i]);
    return s + "]";
}

} // namespace

void emitBatchPlanJson(std::ostream& os, const BatchPlanRecord& p)
{
    if (!p.present) return;
    os << ",\n  \"batchPlan\": {\n";
    os << "    \"summary\": { \"id\": \"batchPlan\""
       << ", \"product\": " << esc(p.product)
       << ", \"productRate\": " << num(p.productRate)
       << ", \"productPerYear\": " << num(p.productPerYear)
       << ", \"lotRule\": " << esc(p.lotRule);
    if (!p.lotStream.empty())
        os << ", \"lotStream\": " << esc(p.lotStream)
           << ", \"lotStreamMass\": " << num(p.lotStreamMass);
    if (!p.lotLimitingStage.empty())
        os << ", \"lotLimitingStage\": " << esc(p.lotLimitingStage);
    os << ", \"lotSize\": " << num(p.lotSize)
       << ", \"lotsPerYear\": " << p.lotsPerYear
       << ", \"production\": " << num(p.production)
       << ", \"equivalentHours\": " << num(p.equivalentHours)
       << ", \"streamFactor\": " << num(p.streamFactor)
       << ", \"lowUtilisation\": " << num(p.lowUtilisation)
       << ", \"lowUtilisationDeclared\": " << (p.lowUtilisationDeclared ? "true" : "false")
       << ", \"stages\": " << p.stages.size()
       << ", \"trains\": " << p.trains.size()
       << ", \"findings\": " << p.findings.size()
       << ", \"unplannedUnits\": " << words(p.unplannedUnits)
       << ", \"productionSource\": " << esc(p.productionSource)
       << ", \"productionReason\": " << esc(p.productionReason)
       << ", \"lotSource\": " << esc(p.lotSource)
       << ", \"lotReason\": " << esc(p.lotReason) << " },\n";

    os << "    \"trains\": [";
    for (std::size_t i = 0; i < p.trains.size(); ++i)
    {
        const auto& t = p.trains[i];
        os << (i ? ",\n" : "\n") << "      { \"id\": " << esc("train:" + t.name)
           << ", \"name\": " << esc(t.name)
           << ", \"limitingStage\": " << esc(t.limitingStage)
           << ", \"availableTime\": " << num(t.availableTime)
           << ", \"lotsPerCampaign\": " << t.lotsPerCampaign
           << ", \"changeover\": " << num(t.changeover)
           << ", \"cycleTime\": " << num(t.cycleTime)
           << ", \"campaigns\": " << t.campaigns
           << ", \"campaignSpan\": " << num(t.campaignSpan)
           << ", \"campaignDuration\": " << num(t.campaignDuration)
           << ", \"requiredTime\": " << num(t.requiredTime)
           << ", \"occupancy\": " << num(t.occupancy)
           << ", \"stages\": " << words(t.stages)
           << ", \"source\": " << esc(t.source)
           << ", \"reason\": " << esc(t.reason) << " }";
    }
    os << "\n    ],\n    \"stages\": [";
    for (std::size_t i = 0; i < p.stages.size(); ++i)
    {
        const auto& s = p.stages[i];
        os << (i ? ",\n" : "\n") << "      { \"id\": " << esc("stage:" + s.name)
           << ", \"name\": " << esc(s.name)
           << ", \"train\": " << esc(s.train)
           << ", \"type\": " << esc(s.type)
           << ", \"sizeKind\": " << esc(s.sizeKind)
           << ", \"holds\": " << esc(s.holds)
           << ", \"feeds\": " << esc(s.feeds)
           << ", \"limiting\": " << esc(s.limiting ? "yes" : "no")
           << ", \"dischargeFrom\": " << esc(s.dischargeFrom);
        if (!s.operatingFrom.empty())
            os << ", \"operatingFrom\": " << esc(s.operatingFrom);
        if (!s.ratingUnit.empty())
            os << ", \"ratingUnit\": " << esc(s.ratingUnit)
               << ", \"capacityRate\": " << num(s.capacityRate);
        os << ", \"massRate\": " << num(s.massRate)
           << ", \"massPerProduct\": " << num(s.massPerProduct)
           << ", \"massPerLot\": " << num(s.massPerLot);
        if (s.type == "batch")
        {
            os << ", \"bulkDensity\": " << num(s.bulkDensity)
               << ", \"fillFraction\": " << num(s.fillFraction)
               << ", \"sizeFactor\": " << num(s.sizeFactor)
               << ", \"volume\": " << num(s.volume)
               << ", \"volumePerUnit\": " << num(s.volumePerUnit);
            if (s.maxVolume > 0.0) os << ", \"maxVolume\": " << num(s.maxVolume);
        }
        else
            os << ", \"rate\": " << num(s.rate)
               << ", \"ratePerUnit\": " << num(s.ratePerUnit);
        os << ", \"inPhase\": " << s.inPhase
           << ", \"outOfPhase\": " << s.outOfPhase
           << ", \"unitsInstalled\": " << s.unitsInstalled
           << ", \"chargeTime\": " << num(s.chargeTime)
           << ", \"processTime\": " << num(s.processTime)
           << ", \"dischargeTime\": " << num(s.dischargeTime)
           << ", \"cleanTime\": " << num(s.cleanTime)
           << ", \"cycleTime\": " << num(s.cycleTime)
           << ", \"effectiveCycle\": " << num(s.effectiveCycle)
           << ", \"utilisation\": " << num(s.utilisation)
           << ", \"offset\": " << num(s.offset)
           << ", \"busyHours\": " << num(s.busyHours)
           << ", \"occupancy\": " << num(s.occupancy)
           << ", \"idleHours\": " << num(s.idleHours)
           << ", \"units\": " << words(s.units)
           << ", \"source\": " << esc(s.source)
           << ", \"reason\": " << esc(s.reason) << " }";
    }
    os << "\n    ],\n    \"gantt\": [";
    for (std::size_t i = 0; i < p.gantt.size(); ++i)
    {
        const auto& g = p.gantt[i];
        const std::string id = "gantt:" + g.train + ":" + g.stage
                             + (g.lot > 0 ? ":" + std::to_string(g.lot) : "");
        os << (i ? ",\n" : "\n") << "      { \"id\": " << esc(id)
           << ", \"train\": " << esc(g.train) << ", \"stage\": " << esc(g.stage)
           << ", \"lot\": " << g.lot << ", \"unit\": " << g.unit
           << ", \"start\": " << num(g.start) << ", \"end\": " << num(g.end) << " }";
    }
    os << (p.gantt.empty() ? "]" : "\n    ]") << ",\n    \"findings\": [";
    for (std::size_t i = 0; i < p.findings.size(); ++i)
    {
        const auto& f = p.findings[i];
        os << (i ? ",\n" : "\n") << "      { \"id\": " << esc(f.id)
           << ", \"kind\": " << esc(f.kind) << ", \"subject\": " << esc(f.subject)
           << ", \"value\": " << num(f.value) << ", \"limit\": " << num(f.limit)
           << ", \"message\": " << esc(f.message) << " }";
    }
    os << (p.findings.empty() ? "]" : "\n    ]") << "\n  }";
}

} // namespace Choupo
