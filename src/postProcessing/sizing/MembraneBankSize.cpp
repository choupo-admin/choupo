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

#include "MembraneBankSize.H"
#include "TrainSplit.H"
#include "core/Dimensions.H"
#include "core/RegistryRefusal.H"

#include <algorithm>
#include <cmath>
#include <stdexcept>
#include <string>

namespace Choupo {

namespace {

//  A declared block that carries its origin, source and reason.
DictPtr block(const DictPtr& rules, const char* name, const std::string& who,
              std::string& originOut)
{
    if (!rules->found(name)
        || !std::holds_alternative<DictPtr>(rules->entryValue(name)))
        throw std::runtime_error(who + ": `" + name + " { ...; origin"
            " literature|assumed; source \"...\"; reason \"...\"; }` is not"
            " declared.  A vessel bank is built from numbers the CASE chooses;"
            " none is taken by default.");
    const DictPtr b = rules->subDict(name);
    for (const char* k : { "source", "reason" })
        if (!b->found(k) || b->lookupWord(k).empty())
            throw std::runtime_error(who + ": `" + name + " { " + k
                + " \"...\"; }` is not declared -- a number the case chose"
                  " carries where it came from and why it is this plant's.");
    if (!b->found("origin"))
        throw std::runtime_error(who + ": `" + name + " { origin ...; }` is"
            " not declared (literature | assumed).");
    originOut = b->lookupWord("origin");
    if (originOut != "literature" && originOut != "assumed")
        throw std::runtime_error(who + ": " + std::string(name) + ": "
            + registryRefusal::message("origin", originOut,
                { "literature", "assumed" }, "Accepted"));
    return b;
}

scalar len(const DictPtr& b, const char* key, const std::string& who,
           const char* block)
{
    if (!b->found(key))
        throw std::runtime_error(who + ": `" + block + " { " + key
            + " <length>; }` is not declared.");
    return b->lookupScalar(key, Dims::length);
}

int whole(const DictPtr& b, const char* key, const std::string& who,
          const char* block)
{
    if (!b->found(key))
        throw std::runtime_error(who + ": `" + block + " { " + key
            + " <n>; }` is not declared.");
    const scalar c = b->lookupScalar(key);
    if (!(c >= 1.0) || std::abs(c - std::round(c)) > 1e-9)
        throw std::runtime_error(who + ": `" + block + "." + key
            + "` must be a whole number >= 1; got " + std::to_string(c));
    return static_cast<int>(std::lround(c));
}

} // namespace

std::vector<EquipmentSizing> MembraneBankSize::size(const std::string& unitName,
    const SimulationResult& result, const Material& material,
    const DictPtr& designRules) const
{
    const std::string who = "membraneBank '" + unitName + "'";
    const int N   = trainSplit::trainsOf(result, designRules, who);
    const int nTr = std::max(1, N);

    auto kit = result.kpis.find(unitName);
    if (kit == result.kpis.end())
        throw std::runtime_error(who + ": the unit has no KPIs in the result.");
    auto kp = [&](const char* key, bool required, scalar def) -> scalar
    {
        auto it = kit->second.find(key);
        if (it != kit->second.end()) return it->second;
        if (required)
            throw std::runtime_error(who + ": the unit publishes no `" + key
                + "` KPI -- " + (std::string(key).rfind("element", 0) == 0
                  ? "declare `nominalDiameter` and `elementLength` in the module"
                    " record it runs (the bank is sized from the element's"
                    " outside size, and none is invented)"
                  : "is it a spiralWoundModule with `vessels`?") + ".");
        return def;
    };
    const int vesselsPlant = static_cast<int>(std::lround(kp("vessels", true, 0)));
    const int elements     = static_cast<int>(std::lround(kp("elements", false, 1)));
    const scalar Le        = kp("elementLength_m", true, 0);
    const scalar De        = kp("elementDiameter_m", true, 0);
    const scalar areaPlant = kp("area_stage", false, 0);
    const int vTrain = N > 0
        ? trainSplit::wholePerTrain(vesselsPlant, N, "pressure vessels", who)
        : vesselsPlant;

    std::string oV, oR, oC;
    const DictPtr V = block(designRules, "vessel", who, oV);
    const DictPtr R = block(designRules, "rack", who, oR);
    const DictPtr C = block(designRules, "loadingClearance", who, oC);

    const scalar allowance = len(V, "endAllowance", who, "vessel");
    const scalar OD        = len(V, "outsideDiameter", who, "vessel");
    if (allowance < 0.0)
        throw std::runtime_error(who + ": vessel.endAllowance must not be negative.");
    if (OD < De - 1e-12)
        throw std::runtime_error(who + ": the vessel's outside diameter "
            + std::to_string(OD) + " m is smaller than the element it holds ("
            + std::to_string(De) + " m).");

    const int vesselsPerRack = whole(R, "vesselsPerRack", who, "rack");
    const int tiers          = whole(R, "tiers", who, "rack");
    if (vesselsPerRack % tiers != 0)
        throw std::runtime_error(who + ": rack.vesselsPerRack "
            + std::to_string(vesselsPerRack) + " does not divide into "
            + std::to_string(tiers) + " tiers; a rack has whole tiers of equal"
              " width.");
    const int perTier = vesselsPerRack / tiers;
    const scalar pitch     = len(R, "pitch", who, "rack");
    const scalar tierPitch = len(R, "tierPitch", who, "rack");
    const scalar baseH     = len(R, "baseHeight", who, "rack");
    const scalar endMargin = len(R, "endMargin", who, "rack");
    const scalar aisle     = len(R, "aisle", who, "rack");
    if (pitch < OD - 1e-12 || tierPitch < OD - 1e-12)
        throw std::runtime_error(who + ": the rack pitch (" + std::to_string(pitch)
            + " m across, " + std::to_string(tierPitch) + " m between tiers) is"
            " smaller than the vessel's outside diameter (" + std::to_string(OD)
            + " m): the vessels would interpenetrate.");
    if (!(baseH >= 0.0) || !(endMargin >= 0.0) || !(aisle >= 0.0))
        throw std::runtime_error(who + ": rack baseHeight, endMargin and aisle"
            " must not be negative.");
    if (!C->found("vesselLengths"))
        throw std::runtime_error(who + ": `loadingClearance { vesselLengths <k>;"
            " }` is not declared -- the free length at one end where elements"
            " are pushed in and out, as a number of vessel lengths.");
    const scalar kClear = C->lookupScalar("vesselLengths");
    if (!(kClear >= 0.0))
        throw std::runtime_error(who + ": loadingClearance.vesselLengths must"
            " not be negative.");

    const scalar Lv     = elements * Le + allowance;
    const int    racks  = (vTrain + vesselsPerRack - 1) / vesselsPerRack;
    const int    vLast  = vTrain - (racks - 1) * vesselsPerRack;
    const scalar rackL  = Lv + 2.0 * endMargin;
    const scalar rackW  = perTier * pitch;
    const scalar rackH  = baseH + tiers * tierPitch;
    const scalar clear  = kClear * Lv;
    const scalar bankL  = rackL + clear;
    const scalar bankW  = racks * rackW + (racks - 1) * aisle;
    const scalar bankH  = rackH;

    EquipmentSizing d;
    d.unitName      = unitName;
    d.equipmentType = type_;
    d.material      = material.name;
    d.set("vesselsPlant",       vesselsPlant,        "-");
    d.set("vessels",            vTrain,              "-");
    d.set("elementsPerVessel",  elements,            "-");
    d.set("elementsPerBank",    static_cast<scalar>(vTrain) * elements, "-");
    d.set("elementLength",      Le,                  "m");
    d.set("elementDiameter",    De,                  "m");
    d.set("vesselEndAllowance", allowance,           "m");
    d.set("vesselLength",       Lv,                  "m");
    d.set("vesselOutsideDiameter", OD,               "m");
    d.set("vesselsPerRack",     vesselsPerRack,      "-");
    d.set("tiers",              tiers,               "-");
    d.set("vesselsPerTier",     perTier,             "-");
    d.set("racks",              racks,               "-");
    d.set("vesselsLastRack",    vLast,               "-");
    d.set("pitch",              pitch,               "m");
    d.set("tierPitch",          tierPitch,           "m");
    d.set("baseHeight",         baseH,               "m");
    d.set("endMargin",          endMargin,           "m");
    d.set("rackAisle",          aisle,               "m");
    d.set("rackLength",         rackL,               "m");
    d.set("rackWidth",          rackW,               "m");
    d.set("rackHeight",         rackH,               "m");
    d.set("loadingClearance",   clear,               "m");
    d.set("envelopeLength",     bankL,               "m");
    d.set("envelopeWidth",      bankW,               "m");
    d.set("envelopeHeight",     bankH,               "m");
    if (areaPlant > 0.0) d.set("membraneArea", areaPlant / nTr, "m2");
    d.basis = "vessel length = elements x element length + end allowance; racks ="
        " ceil(vessels per train / vessels per rack), tiers x vessels-per-tier"
        " per rack; rack envelope from the declared pitch, base height and end"
        " margin; a free loading clearance of " + std::to_string(kClear)
        + " vessel length(s) at the +x end of the bank; element size read from"
        " the module record (" + std::to_string(Le) + " m x " + std::to_string(De)
        + " m); the vessel and rack numbers are the CASE's (vessel: " + oV + ", "
        + V->lookupWord("source") + "; rack: " + oR + ", " + R->lookupWord("source")
        + "; clearance: " + oC + ", " + C->lookupWord("source") + ")"
        + (N > 0 ? "; per TRAIN of the " + std::to_string(N) + " declared identical"
                   " trains (" + result.trains.source + ")" : std::string());
    d.notCostedBecause = "no cost correlation is carried for a membrane vessel"
        " bank here (FRP vessels, frames and manifolds); the money is the case's"
        " declared quote (`costing { quotes }`)";
    if (N == 0) return { d };
    std::vector<EquipmentSizing> out;
    for (int k = 1; k <= N; ++k)
    {
        EquipmentSizing t = d;
        trainSplit::stamp(t, k, N);
        out.push_back(std::move(t));
    }
    return out;
}

} // namespace Choupo
