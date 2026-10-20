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

//  THE MULTIPRODUCT BLOCK (2026-10-20, DEV.md 4c C110 G2): the same
//  one-record-per-line shape, every record with an "id" -- the summary,
//  `product:<p>`, `train:<t>` and `stage:<s>` (the aggregates the consumers
//  read), `productTrain:<p>:<t>`, `productStage:<p>:<s>`, the year's Gantt
//  and the findings.  A one-product plan never reaches here.
void emitMultiProduct(std::ostream& os, const BatchPlanRecord& p)
{
    os << ",\n  \"batchPlan\": {\n";
    os << "    \"summary\": { \"id\": \"batchPlan\""
       << ", \"product\": " << esc(p.product)
       << ", \"productRate\": " << num(p.productRate)
       << ", \"productPerYear\": " << num(p.productPerYear)
       << ", \"products\": " << p.products.size()
       << ", \"campaignOrder\": " << words(p.campaignOrder)
       << ", \"lotsPerYear\": " << p.lotsPerYear
       << ", \"production\": " << num(p.production)
       << ", \"equivalentHours\": " << num(p.equivalentHours)
       << ", \"streamFactor\": " << num(p.streamFactor)
       << ", \"lowUtilisation\": " << num(p.lowUtilisation)
       << ", \"lowUtilisationDeclared\": " << (p.lowUtilisationDeclared ? "true" : "false")
       << ", \"stages\": " << p.stages.size()
       << ", \"trains\": " << p.trains.size()
       << ", \"findings\": " << p.findings.size()
       << ", \"unplannedUnits\": " << words(p.unplannedUnits) << " },\n";

    os << "    \"products\": [";
    for (std::size_t i = 0; i < p.products.size(); ++i)
    {
        const auto& x = p.products[i];
        os << (i ? ",\n" : "\n") << "      { \"id\": " << esc("product:" + x.name)
           << ", \"name\": " << esc(x.name)
           << ", \"next\": " << esc(x.next)
           << ", \"lotFrom\": " << esc(x.lotFrom)
           << ", \"lotRule\": " << esc(x.lotRule);
        if (!x.lotStream.empty())
            os << ", \"lotStream\": " << esc(x.lotStream)
               << ", \"lotStreamMass\": " << num(x.lotStreamMass);
        if (!x.lotLimitingStage.empty())
            os << ", \"lotLimitingStage\": " << esc(x.lotLimitingStage);
        os << ", \"perYear\": " << num(x.perYear)
           << ", \"lotSize\": " << num(x.lotSize)
           << ", \"lotsPerYear\": " << x.lotsPerYear
           << ", \"production\": " << num(x.production)
           << ", \"equivalentHours\": " << num(x.equivalentHours)
           << ", \"ownBalance\": " << words(x.ownBalance)
           << ", \"source\": " << esc(x.source)
           << ", \"reason\": " << esc(x.reason)
           << ", \"lotSource\": " << esc(x.lotSource)
           << ", \"lotReason\": " << esc(x.lotReason) << " }";
    }
    os << "\n    ],\n    \"trains\": [";
    for (std::size_t i = 0; i < p.trains.size(); ++i)
    {
        const auto& t = p.trains[i];
        os << (i ? ",\n" : "\n") << "      { \"id\": " << esc("train:" + t.name)
           << ", \"name\": " << esc(t.name)
           << ", \"availableTime\": " << num(t.availableTime)
           << ", \"lotsPerCampaign\": " << t.lotsPerCampaign
           << ", \"changeover\": " << num(t.changeover)
           << ", \"campaigns\": " << t.campaigns
           << ", \"productChangeovers\": " << t.productChangeovers
           << ", \"changeoverHours\": " << num(t.changeoverHours)
           << ", \"requiredTime\": " << num(t.requiredTime)
           << ", \"occupancy\": " << num(t.occupancy)
           << ", \"stages\": " << words(t.stages)
           << ", \"source\": " << esc(t.source)
           << ", \"reason\": " << esc(t.reason) << " }";
    }
    os << "\n    ],\n    \"productTrains\": [";
    for (std::size_t i = 0; i < p.productTrains.size(); ++i)
    {
        const auto& x = p.productTrains[i];
        os << (i ? ",\n" : "\n") << "      { \"id\": "
           << esc("productTrain:" + x.product + ":" + x.train)
           << ", \"product\": " << esc(x.product)
           << ", \"train\": " << esc(x.train)
           << ", \"limitingStage\": " << esc(x.limitingStage)
           << ", \"next\": " << esc(x.next)
           << ", \"cycleTime\": " << num(x.cycleTime)
           << ", \"campaigns\": " << x.campaigns
           << ", \"lotsLastCampaign\": " << x.lotsLastCampaign
           << ", \"campaignSpan\": " << num(x.campaignSpan)
           << ", \"start\": " << num(x.start)
           << ", \"productChangeover\": " << num(x.productChangeover)
           << ", \"requiredTime\": " << num(x.requiredTime) << " }";
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
           << ", \"sizingProduct\": " << esc(s.sizingProduct);
        if (!s.ratingUnit.empty())
            os << ", \"ratingUnit\": " << esc(s.ratingUnit)
               << ", \"capacityRate\": " << num(s.capacityRate);
        os << ", \"massRate\": " << num(s.massRate);
        if (s.type == "batch")
        {
            os << ", \"volume\": " << num(s.volume)
               << ", \"volumePerUnit\": " << num(s.volumePerUnit);
            if (s.maxVolume > 0.0) os << ", \"maxVolume\": " << num(s.maxVolume);
        }
        else
            os << ", \"rate\": " << num(s.rate)
               << ", \"ratePerUnit\": " << num(s.ratePerUnit);
        os << ", \"inPhase\": " << s.inPhase
           << ", \"outOfPhase\": " << s.outOfPhase
           << ", \"unitsInstalled\": " << s.unitsInstalled;
        if (p.products.size() >= 2)
            os << ", \"productChangeover\": " << num(s.productChangeover);
        os << ", \"maxUtilisation\": " << num(s.maxUtilisation)
           << ", \"busyHours\": " << num(s.busyHours)
           << ", \"occupancy\": " << num(s.occupancy)
           << ", \"idleHours\": " << num(s.idleHours)
           << ", \"units\": " << words(s.units)
           << ", \"source\": " << esc(s.source)
           << ", \"reason\": " << esc(s.reason) << " }";
    }
    os << "\n    ],\n    \"productStages\": [";
    for (std::size_t i = 0; i < p.productStages.size(); ++i)
    {
        const auto& x = p.productStages[i];
        const bool batch = x.sizeFactor > 0.0;
        os << (i ? ",\n" : "\n") << "      { \"id\": "
           << esc("productStage:" + x.product + ":" + x.stage)
           << ", \"product\": " << esc(x.product)
           << ", \"stage\": " << esc(x.stage)
           << ", \"balanceFrom\": " << esc(x.balanceFrom)
           << ", \"dischargeFrom\": " << esc(x.dischargeFrom);
        if (!x.operatingFrom.empty())
            os << ", \"operatingFrom\": " << esc(x.operatingFrom);
        os << ", \"limiting\": " << esc(x.limiting ? "yes" : "no")
           << ", \"massPerProduct\": " << num(x.massPerProduct)
           << ", \"massPerLot\": " << num(x.massPerLot);
        if (batch)
            os << ", \"bulkDensity\": " << num(x.bulkDensity)
               << ", \"fillFraction\": " << num(x.fillFraction)
               << ", \"sizeFactor\": " << num(x.sizeFactor)
               << ", \"volume\": " << num(x.volume)
               << ", \"volumePerUnit\": " << num(x.volumePerUnit);
        else
            os << ", \"rate\": " << num(x.rate)
               << ", \"ratePerUnit\": " << num(x.ratePerUnit);
        os << ", \"chargeTime\": " << num(x.chargeTime)
           << ", \"processTime\": " << num(x.processTime)
           << ", \"dischargeTime\": " << num(x.dischargeTime)
           << ", \"cleanTime\": " << num(x.cleanTime)
           << ", \"cycleTime\": " << num(x.cycleTime)
           << ", \"effectiveCycle\": " << num(x.effectiveCycle)
           << ", \"utilisation\": " << num(x.utilisation)
           << ", \"offset\": " << num(x.offset)
           << ", \"changeoverAfter\": " << num(x.changeoverAfter);
        if (!x.overrideSource.empty())
            os << ", \"overrideSource\": " << esc(x.overrideSource)
               << ", \"overrideReason\": " << esc(x.overrideReason);
        os << " }";
    }
    os << "\n    ],\n    \"gantt\": [";
    for (std::size_t i = 0; i < p.gantt.size(); ++i)
    {
        const auto& g = p.gantt[i];
        std::string id = "gantt:" + g.train + ":" + g.product + ":";
        if (g.kind == "campaign")        id += "campaign:" + std::to_string(g.campaign);
        else if (g.kind == "changeover") id += "changeover:" + std::to_string(g.campaign);
        else if (g.kind == "productChangeover") id += "productChangeover";
        else if (g.kind == "stageClean") id += g.stage + ":clean";
        else                             id += g.stage + ":" + std::to_string(g.lot);
        os << (i ? ",\n" : "\n") << "      { \"id\": " << esc(id)
           << ", \"train\": " << esc(g.train) << ", \"product\": " << esc(g.product)
           << ", \"kind\": " << esc(g.kind) << ", \"stage\": " << esc(g.stage)
           << ", \"campaign\": " << g.campaign << ", \"lot\": " << g.lot
           << ", \"lots\": " << g.lots << ", \"unit\": " << g.unit
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

} // namespace

void emitBatchPlanJson(std::ostream& os, const BatchPlanRecord& p)
{
    if (!p.present) return;
    if (p.multiProduct())
    {
        emitMultiProduct(os, p);
        return;
    }
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
