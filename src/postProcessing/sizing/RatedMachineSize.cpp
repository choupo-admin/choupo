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

#include "RatedMachineSize.H"

#include "core/Advisory.H"
#include "core/Dimensions.H"
#include "core/RegistryRefusal.H"
#include "result/ResultEmitter.H"   // overallMassFlow: the one home

#include <algorithm>
#include <cmath>
#include <iostream>
#include <sstream>
#include <stdexcept>
#include <string>

namespace Choupo {

namespace {

const scalar kAnnounceDefault = 0.85;   // the stated threshold, printed when used

std::string fmt(scalar v)
{
    std::ostringstream o;
    o.precision(6);
    o << v;
    return o.str();
}

//  A key the case owes, with its unit checked.
scalar need(const DictPtr& d, const std::string& key, const Dimensions& dims,
            const std::string& who, const std::string& hint)
{
    if (!d->found(key))
        throw std::runtime_error(who + ": `" + key + "` is not declared in"
            " `rating { }` (" + hint + ").  A vendor rating is the case's own"
            " fact and no default is taken.");
    return d->lookupScalar(key, dims);
}

scalar needPlain(const DictPtr& d, const std::string& key,
                 const std::string& who, const std::string& hint)
{
    if (!d->found(key))
        throw std::runtime_error(who + ": `" + key + "` is not declared in"
            " `rating { }` (" + hint + ").  A vendor rating is the case's own"
            " fact and no default is taken.");
    return d->lookupScalar(key);
}

void needText(const DictPtr& d, const std::string& block, const std::string& who)
{
    for (const char* k : { "source", "reason" })
        if (!d->found(k) || d->lookupWord(k).empty())
            throw std::runtime_error(who + ": `" + block + " { " + k
                + " \"...\"; }` is not declared -- a number the case chose"
                  " carries where it came from and why it is this plant's.");
}

} // namespace

std::vector<EquipmentSizing> RatedMachineSize::size(const std::string& unitName,
    const SimulationResult& result,
    const Material&         material,
    const DictPtr&          designRules) const
{
    const std::string who = "ratedMachine '" + unitName + "'";
    const BatchPlanRecord& plan = result.batchPlan;

    if (!plan.present)
        throw std::runtime_error(who + ": no batch plan ran before the sizing"
            " pass -- the machine's load is read from the plan's stage, lot and"
            " times.  Declare `batchPlan { ... }` ABOVE `sizing { ... }` in"
            " system/postDict.");
    if (plan.multiProduct())
        throw std::runtime_error(who + ": the plan is MULTIPRODUCT and this"
            " sizer reads the single-product plan's stage (one lot, one"
            " cycle).  Size the machine for its largest product by hand, or"
            " use a single-product plan.");
    const BatchStage* stage = plan.stageOfUnit(unitName);
    if (!stage)
        throw std::runtime_error(who + ": the unit is in no stage of the batch"
            " plan, so there is no lot, cycle or operating time to read.  Add"
            " it to a stage's `units ( ... )`.");
    if (!(plan.lotSize > 0.0) || !(plan.productRate > 0.0))
        throw std::runtime_error(who + ": the plan publishes no positive lot"
            " size and product rate.");

    //  ---- the declared kind -------------------------------------------------
    if (!designRules->found("kind"))
        throw std::runtime_error(who + ": `kind` is not declared in the"
            " designRules (batchVolume | massRate | tabletPress |"
            " packagingLine).");
    const std::string kind = designRules->lookupWord("kind");
    const std::vector<std::string> kinds =
        { "batchVolume", "massRate", "tabletPress", "packagingLine" };
    if (std::find(kinds.begin(), kinds.end(), kind) == kinds.end())
        throw std::runtime_error(who + ": " + registryRefusal::message(
            "kind", kind, kinds, "Accepted"));

    if (!designRules->found("rating")
        || !std::holds_alternative<DictPtr>(designRules->entryValue("rating")))
        throw std::runtime_error(who + ": `rating { ... source \"...\"; reason"
            " \"...\"; }` is not declared -- the vendor's number and where it"
            " came from.");
    const DictPtr rating = designRules->subDict("rating");
    needText(rating, "rating", who);

    //  ---- how many machines ----------------------------------------------
    int installed = stage->unitsInstalled;
    bool installedDeclared = false;
    if (designRules->found("installed"))
    {
        const DictPtr ins = designRules->subDict("installed");
        needText(ins, "installed", who);
        if (!ins->found("count"))
            throw std::runtime_error(who + ": `installed { count N; }` has no"
                " `count`.");
        const scalar c = ins->lookupScalar("count");
        if (!(c >= 1.0) || std::abs(c - std::round(c)) > 1e-9)
            throw std::runtime_error(who + ": `installed.count` must be a"
                " whole number >= 1.");
        installed = static_cast<int>(std::lround(c));
        installedDeclared = true;
    }

    //  ---- the mass the machine handles ---------------------------------------
    const scalar lotHours = plan.lotSize / plan.productRate;       // h
    scalar inletKgH = 0.0;                                         // kg/h, flowsheet basis
    {
        const FlatUnit* fu = nullptr;
        for (const auto& u : result.topology)
            if (u.name == unitName) { fu = &u; break; }
        if (!fu)
            throw std::runtime_error(who + ": the unit is not in the"
                " flattened topology, so its inlet streams are unknown.");
        for (const auto& s : fu->ins)
        {
            auto it = result.streams.find(s);
            if (it == result.streams.end())
                throw std::runtime_error(who + ": inlet stream '" + s
                    + "' is not in the converged result.");
            inletKgH += overallMassFlow(result, it->second) * 3600.0;
        }
    }
    const scalar m_lot_unit = inletKgH * lotHours;                  // kg per lot

    scalar load = 0.0, capacity = 0.0, perMachine = 0.0;
    std::string loadUnit, basis;
    EquipmentSizing d;
    d.unitName      = unitName;
    d.equipmentType = type_;
    d.material      = material.name;

    if (kind == "batchVolume")
    {
        if (stage->type != "batch")
            throw std::runtime_error(who + ": kind batchVolume needs a BATCH"
                " stage; stage '" + stage->name + "' is "
                + stage->type + ".");
        if (!(stage->bulkDensity > 0.0))
            throw std::runtime_error(who + ": stage '" + stage->name
                + "' declares no bulk density.");
        const scalar Vnom  = need(rating, "nominalVolume", Dims::volume, who,
                                  "the vendor's total volume, e.g. `nominalVolume 1.2 m3;`");
        const scalar fill  = needPlain(rating, "maxFill", who,
                                  "the largest fraction of the volume the vendor lets you fill, e.g. `maxFill 0.7;`");
        if (!(Vnom > 0.0) || !(fill > 0.0 && fill <= 1.0))
            throw std::runtime_error(who + ": nominalVolume must be positive"
                " and maxFill in (0, 1].");
        load       = stage->massPerLot / stage->bulkDensity;       // m3 working
        perMachine = Vnom * fill;
        capacity   = installed * perMachine;
        loadUnit   = "m3";
        d.set("m_lot",              stage->massPerLot,  "kg");
        d.set("rho_bulk",           stage->bulkDensity, "kg/m3");
        d.set("fillPlan",           stage->fillFraction, "-");
        d.set("V_nominal",          Vnom,               "m3");
        d.set("maxFill",            fill,               "-");
        d.set("V_working_required", load,               "m3");
        d.set("V_working_capacity", capacity,           "m3");
        basis = "lot working volume = the plan stage's mass per lot / its declared"
                " bulk density (read from the batch plan); capacity = machines x"
                " vendor nominal volume x maximum fill";
    }
    else
    {
        if (stage->type != "semicontinuous")
            throw std::runtime_error(who + ": kind " + kind + " needs a"
                " SEMICONTINUOUS stage; stage '" + stage->name + "' is "
                + stage->type + ".");
        if (!(stage->processTime > 0.0))
            throw std::runtime_error(who + ": stage '" + stage->name
                + "' has no positive operating time.");
        const scalar tOp = stage->processTime;                      // h
        d.set("m_lot",    m_lot_unit, "kg");
        d.set("t_operating_plan", tOp, "h");
        if (kind == "massRate")
        {
            const scalar cap = need(rating, "capacity", Dims::massFlow, who,
                                    "the vendor's throughput, e.g. `capacity 200 kg/h;`") * 3600.0;
            if (!(cap > 0.0)) throw std::runtime_error(who + ": capacity must be positive.");
            load = m_lot_unit / tOp;  perMachine = cap;  loadUnit = "kg/h";
            d.set("capacity_machine", cap, "kg/h");
            basis = "load = the mass the unit's inlet streams carry per lot (the"
                    " run's flowsheet basis scaled by the plan's lot hours) / the"
                    " stage's operating time (read from the batch plan);"
                    " capacity = machines x the vendor's throughput";
        }
        else
        {
            const scalar mItem = need(rating, "itemMass", Dims::mass, who,
                                      "the mass of ONE counted item, e.g. `itemMass 0.7 g;`");
            if (!(mItem > 0.0)) throw std::runtime_error(who + ": itemMass must be positive.");
            const scalar itemsPerHour = m_lot_unit / mItem / tOp;   // items/h
            d.set("itemMass", mItem, "kg");
            if (kind == "tabletPress")
            {
                const scalar st  = needPlain(rating, "stations", who,
                    "the turret's punch stations, e.g. `stations 45;`");
                const scalar rpm = needPlain(rating, "turretSpeed", who,
                    "the turret speed in revolutions per minute (a plain number), e.g. `turretSpeed 60;`");
                const scalar cpr = needPlain(rating, "compressionsPerRevolution", who,
                    "tablets a station makes per revolution (1 single-sided, 2 double-sided), e.g. `compressionsPerRevolution 1;`");
                if (!(st > 0.0 && rpm > 0.0 && cpr > 0.0))
                    throw std::runtime_error(who + ": stations, turretSpeed and"
                        " compressionsPerRevolution must be positive.");
                perMachine = st * rpm * 60.0 * cpr;                 // tablets/h
                load = itemsPerHour;  loadUnit = "tablets/h";
                d.set("stations",    st,  "-");
                d.set("turretSpeed", rpm, "1/min");
                d.set("compressionsPerRevolution", cpr, "-");
                d.set("capacity_machine", perMachine, "1/h");
                basis = "load = tablets per hour = the mass the press's inlet"
                        " carries per lot / the pressed tablet's mass / the"
                        " stage's operating time (read from the batch plan);"
                        " capacity = machines x stations x turret rpm x 60 x"
                        " compressions per revolution (nameplate, no efficiency)";
            }
            else   // packagingLine
            {
                const scalar ppm = needPlain(rating, "packsPerMinute", who,
                    "the line's packs per minute (a plain number), e.g. `packsPerMinute 300;`");
                const scalar nPk = needPlain(rating, "itemsPerPack", who,
                    "tablets in one pack, e.g. `itemsPerPack 28;`");
                if (!(ppm > 0.0 && nPk > 0.0))
                    throw std::runtime_error(who + ": packsPerMinute and"
                        " itemsPerPack must be positive.");
                perMachine = ppm * 60.0;                            // packs/h
                load = itemsPerHour / nPk;  loadUnit = "packs/h";
                d.set("packsPerMinute", ppm, "1/min");
                d.set("itemsPerPack",   nPk, "-");
                d.set("capacity_machine", perMachine, "1/h");
                basis = "load = packs per hour = the mass the line's inlet carries"
                        " per lot / the packed tablet's mass / tablets per pack /"
                        " the stage's operating time (read from the batch plan);"
                        " capacity = machines x packs per minute x 60 (nameplate)";
            }
        }
        capacity = installed * perMachine;
        d.set("load", load, loadUnit == "kg/h" ? "kg/h" : "1/h");
        const scalar run = (load * tOp) / capacity;                 // h at the rating
        d.set("runTime_atRating", run, "h");
    }

    const scalar util = load / capacity;
    const int needed = std::max(1, static_cast<int>(std::ceil(load / perMachine - 1e-9)));
    d.set("utilisation",       util,            "-");
    d.set("machinesNeeded",    needed,          "-");
    d.set("machinesInstalled", installed,       "-");
    d.set("machinesInPlan",    stage->unitsInstalled, "-");
    d.set("cycleTime_plan",    stage->cycleTime, "h");
    d.set("utilisation_plan",  stage->utilisation, "-");

    //  ---- the limits ---------------------------------------------------------
    if (util > 1.0 + 1e-12)
        throw std::runtime_error(who + ": the machine does NOT fit the lot --"
            " utilisation " + fmt(util) + " (" + fmt(load) + " " + loadUnit
            + " against " + fmt(capacity) + " " + loadUnit + " for "
            + std::to_string(installed) + " machine(s)).  "
            + std::to_string(needed) + " machine(s) of this rating would carry it:"
            " declare `installed { count " + std::to_string(needed)
            + "; source \"...\"; reason \"...\"; }` (a second unit is a decision"
              " the case states), or a larger machine, or a longer stage in the"
              " batch plan.");
    if (installedDeclared && installed != stage->unitsInstalled)
    {
        const std::string msg = "the case installs " + std::to_string(installed)
            + " machine(s) but the batch plan's stage '" + stage->name
            + "' assumes " + std::to_string(stage->unitsInstalled)
            + " (its cycle time is built on that number)";
        std::cerr << "[sizing] " << who << ": " << msg << "\n";
        AdvisoryLog::instance().add("sizing", "warning", who, msg);
    }
    scalar thr = kAnnounceDefault;
    if (designRules->found("announceAbove")) thr = designRules->lookupScalar("announceAbove");
    if (util > thr)
    {
        const std::string msg = "utilisation " + fmt(util) + " is above "
            + fmt(thr) + (designRules->found("announceAbove") ? "" :
              " (the engine's stated announcement threshold; declare"
              " `announceAbove` to own it)") + ": the machine fits the lot with"
            " little margin (" + fmt(load) + " " + loadUnit + " against "
            + fmt(capacity) + ")";
        std::cerr << "[sizing] " << who << ": " << msg << "\n";
        AdvisoryLog::instance().add("sizing", "warning", who, msg);
    }
    if (designRules->found("shift"))
    {
        const DictPtr sh = designRules->subDict("shift");
        needText(sh, "shift", who);
        if (!sh->found("length"))
            throw std::runtime_error(who + ": `shift { length ...; }` has no `length`.");
        const scalar Ls = sh->lookupScalar("length", Dims::time) / 3600.0;   // h
        d.set("shiftLength", Ls, "h");
        scalar run = 0.0;
        if (kind == "batchVolume") run = stage->cycleTime;   // the whole cycle of a lot
        else                       run = d.values.at("runTime_atRating");
        d.set("lotTime_forShift", run, "h");
        if (run > Ls)
        {
            const std::string msg = "a lot needs " + fmt(run) + " h ("
                + (kind == "batchVolume" ? "the plan's cycle" : "at the rating")
                + ") against a shift of " + fmt(Ls) + " h: the lot spans shifts";
            std::cerr << "[sizing] " << who << ": " << msg << "\n";
            AdvisoryLog::instance().add("sizing", "warning", who, msg);
        }
    }

    d.basis = basis + ".  The rating is the CASE's (" + kind + ", declared with"
              " its source); the machine's behaviour (compaction force, granule"
              " size, blend uniformity) and its overall equipment effectiveness"
              " are not modelled";
    d.notCostedBecause = "no cost correlation exists for a process machine; the"
        " money is the case's declared quote (`costing { quotes }`)";
    d.notPlacedBecause = "the machine stands in a room of the building; the"
        " room is what the plot plan places";
    return { d };
}

} // namespace Choupo
