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

#include "CleanUtilitiesPass.H"

#include "core/Advisory.H"
#include "core/Dimensions.H"
#include "core/RegistryRefusal.H"
#include "result/ResultEmitter.H"   // overallMassFlow: the one home
#include "sizing/EquipmentTag.H"

#include <algorithm>
#include <cmath>
#include <iomanip>
#include <iostream>
#include <map>
#include <set>
#include <sstream>
#include <stdexcept>
#include <string>
#include <vector>

namespace Choupo {

namespace {

const char* const kTop = "cleanUtilities";

std::string fmt(scalar v, int prec = 6)
{
    std::ostringstream o;
    o << std::defaultfloat << std::setprecision(prec) << v;
    return o.str();
}

DictPtr block(const DictPtr& d, const std::string& key, const std::string& where)
{
    if (!d->found(key) || !std::holds_alternative<DictPtr>(d->entryValue(key)))
        throw std::runtime_error(where + ": `" + key + " { ... }` is not"
            " declared.");
    return d->subDict(key);
}

//  A block of declared numbers owes its reader where they came from.
void text(const DictPtr& d, const std::string& where)
{
    for (const char* k : { "source", "reason" })
        if (!d->found(k) || d->lookupWord(k).empty())
            throw std::runtime_error(where + ": `" + k + " \"...\";` is not"
                " declared -- a number the case chose carries where it came"
                " from and why it is this plant's.");
}

scalar number(const DictPtr& d, const std::string& key, const Dimensions& dims,
              const std::string& where)
{
    if (!d->found(key))
        throw std::runtime_error(where + ": `" + key + "` is not declared.");
    return d->lookupScalar(key, dims);
}

scalar plain(const DictPtr& d, const std::string& key, const std::string& where)
{
    if (!d->found(key))
        throw std::runtime_error(where + ": `" + key + "` is not declared.");
    return d->lookupScalar(key);
}

void announce(const std::string& locus, const std::string& msg,
              const char* level = "warning")
{
    std::cerr << "[cleanUtilities] " << msg << "\n";
    AdvisoryLog::instance().add("sizing", level, locus, msg);
}

void finishItem(EquipmentSizing& d, const std::string& unit, const std::string& tag,
                const std::string& type, const std::string& basis,
                const std::string& notCosted)
{
    d.unitName          = unit;
    d.equipmentTag      = tag;
    d.equipmentType     = type;
    d.basis             = basis;
    d.notCostedBecause  = notCosted;
    d.notPlacedBecause  = "sized from the finished building after the layout is"
                          " checked; its plant room is the case's to declare";
}

// ---------------------------------------------------------------------------
//  HVAC
// ---------------------------------------------------------------------------
void sizeHvac(const DictPtr& h, SimulationResult& result)
{
    const std::string W = std::string(kTop) + " { hvac }";
    if (!result.building.present)
        throw std::runtime_error(W + ": the case declares no `building {}` in"
            " system/layoutDict (or the layout did not run before this pass),"
            " so there are no rooms to size the air for.");

    const DictPtr air = block(h, "air", W);   text(air, W + " air");
    const scalar rho = number(air, "density", Dims::density, W + " air");           // kg/m3
    const scalar cp  = number(air, "heatCapacity", Dims::heatCapacity, W + " air"); // J/kg/K
    const DictPtr fan = block(h, "fan", W);   text(fan, W + " fan");
    const scalar dP  = number(fan, "pressureRise", Dims::pressure, W + " fan");     // Pa
    const scalar eta = plain(fan, "efficiency", W + " fan");
    const DictPtr out = block(h, "outdoor", W);  text(out, W + " outdoor");
    const scalar Tw  = number(out, "winter", Dims::temperature, W + " outdoor");    // K
    const scalar Ts  = number(out, "summer", Dims::temperature, W + " outdoor");    // K
    const DictPtr sup = block(h, "supply", W);   text(sup, W + " supply");
    const scalar Tsup  = number(sup, "temperature", Dims::temperature, W + " supply");
    const scalar fresh = plain(sup, "freshAirFraction", W + " supply");
    if (!(rho > 0.0 && cp > 0.0 && dP >= 0.0 && eta > 0.0 && eta <= 1.0
          && fresh >= 0.0 && fresh <= 1.0))
        throw std::runtime_error(W + ": density, heatCapacity must be positive,"
            " pressureRise non-negative, efficiency in (0, 1] and"
            " freshAirFraction in [0, 1].");

    if (!h->found("changesPerHour") || !h->hasDictList("changesPerHour"))
        throw std::runtime_error(W + ": `changesPerHour ( { grade <A|B|C|D|CNC>;"
            " perHour <n>; source \"...\"; reason \"...\"; } ... );` is not"
            " declared -- the air changes per hour of each grade are the"
            " case's own (no table is shipped).");
    std::map<std::string, scalar> ach;
    const std::vector<std::string> grades = { "A", "B", "C", "D", "CNC" };
    for (const auto& e : h->lookupDictList("changesPerHour"))
    {
        if (!e->found("grade"))
            throw std::runtime_error(W + " changesPerHour: an entry has no `grade`.");
        const std::string g = e->lookupWord("grade");
        if (std::find(grades.begin(), grades.end(), g) == grades.end())
            throw std::runtime_error(W + " changesPerHour: " + registryRefusal::message(
                "grade", g, grades, "Accepted"));
        text(e, W + " changesPerHour grade " + g);
        const scalar n = plain(e, "perHour", W + " changesPerHour grade " + g);
        if (!(n > 0.0))
            throw std::runtime_error(W + " changesPerHour grade " + g
                + ": perHour must be positive.");
        if (!ach.emplace(g, n).second)
            throw std::runtime_error(W + " changesPerHour: grade " + g
                + " is declared twice.");
    }

    //  ROOMS THE AIR PLANT DOES NOT SERVE (the technical floor that houses it):
    //  declared, with a reason, and each name must be a room of the building.
    std::set<std::string> unserved;
    if (h->found("unserved"))
    {
        const DictPtr un = block(h, "unserved", W);   text(un, W + " unserved");
        if (!un->found("rooms"))
            throw std::runtime_error(W + " unserved: `rooms ( ... );` is not declared.");
        for (const auto& n : un->lookupWordList("rooms"))
        {
            bool known = false;
            for (const auto& r : result.building.rooms) known = known || r.name == n;
            if (!known)
                throw std::runtime_error(W + " unserved: '" + n + "' is not a"
                    " room of the building.");
            unserved.insert(n);
        }
    }

    struct Acc { int rooms = 0; scalar V = 0, Q = 0; };
    std::map<std::string, Acc> byGrade;
    Acc total;

    std::cout << "\n========================  Clean utilities: HVAC  ==========================\n";
    std::cout << "  " << std::left << std::setw(22) << "room" << std::setw(7) << "grade"
              << std::setw(11) << "area m2" << std::setw(9) << "h m"
              << std::setw(12) << "V m3" << std::setw(8) << "ACH 1/h"
              << std::setw(14) << "supply m3/h" << "\n  "
              << std::string(83, '-') << "\n";
    for (const auto& r : result.building.rooms)
    {
        if (unserved.count(r.name))
        {
            std::cout << "  " << std::left << std::setw(22) << r.name << std::setw(7)
                      << r.grade << "(not served by the air plant: declared"
                         " `unserved`)\n";
            continue;
        }
        auto it = ach.find(r.grade);
        if (it == ach.end())
        {
            std::string declared;
            for (const auto& kv : ach) declared += " " + kv.first;
            throw std::runtime_error(W + ": room `" + r.name + "` is grade "
                + r.grade + " and `changesPerHour` declares no rate for that"
                " grade.  Declared:" + declared);
        }
        const scalar V = r.area * r.height;                     // m3
        const scalar Q = it->second * V;                        // m3/h
        std::cout << "  " << std::left << std::setw(22) << r.name << std::setw(7) << r.grade
                  << std::setw(11) << std::fixed << std::setprecision(2) << r.area
                  << std::setw(9) << r.height << std::setw(12) << V
                  << std::setw(8) << std::setprecision(1) << it->second
                  << std::setw(14) << std::setprecision(0) << Q << "\n";
        auto& a = byGrade[r.grade];
        a.rooms += 1;  a.V += V;  a.Q += Q;
        total.rooms += 1;  total.V += V;  total.Q += Q;
    }
    std::cout << std::defaultfloat;

    auto item = [&](const std::string& tag, const Acc& a, scalar achShown) {
        EquipmentSizing d;
        const scalar Qs   = a.Q / 3600.0;                       // m3/s
        const scalar m    = rho * Qs;                           // kg/s
        const scalar Pfan = Qs * dP / eta / 1000.0;             // kW
        const scalar heat = m * fresh * cp * std::max(0.0, Tsup - Tw) / 1000.0;   // kW
        const scalar cool = m * fresh * cp * std::max(0.0, Ts - Tsup) / 1000.0;   // kW
        d.set("nRooms",           a.rooms, "-");
        d.set("V_rooms",          a.V,     "m3");
        d.set("changesPerHour",   achShown, "1/h");
        d.set("Q_supply",         a.Q,     "m3/h");
        d.set("m_supply",         m,       "kg/s");
        d.set("dP_fan",           dP,      "Pa");
        d.set("eta_fan",          eta,     "-");
        d.set("P_fan",            Pfan,    "kW");
        d.set("freshAirFraction", fresh,   "-");
        d.set("T_supply",         Tsup,    "K");
        d.set("T_winter",         Tw,      "K");
        d.set("T_summer",         Ts,      "K");
        d.set("Q_heating",        heat,    "kW");
        d.set("Q_cooling",        cool,    "kW");
        finishItem(d, "hvac", tag, "airHandling",
            "supply flow = the grade's declared air changes per hour x the rooms'"
            " volumes (plan area x height, from the building the layout checked);"
            " fan power = flow x the declared pressure rise / the declared"
            " efficiency; heating and cooling = the SENSIBLE duty to bring the"
            " declared fresh-air share from the outdoor winter / summer design"
            " temperature to the supply temperature.  NOT here: humidity, latent"
            " load, room heat gains, return-air state other than the supply"
            " temperature, filter pressure drop beyond the declared rise",
            //  A grade item is PRICED, by the case's own declared cost per
            //  m3/h of supply air (`costing { quotes ( { hvacGrade <g>; ...
            //  valuePerSupplyAir ...; } ) }`, DEV.md 4c C210 E2); with no such
            //  quote the costing pass REFUSES it by name and the total reads
            //  INCOMPLETE.  The total item is the sum of the grades.
            tag == "total"
              ? "the total is the SUM of the grade items, which are the priced"
                " ones (costing it too would count the air twice)"
              : "");
        d.ordinal = static_cast<int>(result.sizings.size());
        result.sizings[d.itemId()] = std::move(d);
    };

    std::cout << "  " << std::string(83, '-') << "\n";
    for (const auto& g : grades)
    {
        auto it = byGrade.find(g);
        if (it == byGrade.end()) continue;
        item("grade" + g, it->second, ach.at(g));
        const Acc& a = it->second;
        std::cout << "  grade " << std::left << std::setw(4) << g << a.rooms
                  << " rooms, " << fmt(a.V, 7) << " m3, " << fmt(a.Q, 7)
                  << " m3/h at " << fmt(ach.at(g)) << " 1/h\n";
    }
    item("total", total, total.V > 0.0 ? total.Q / total.V : 0.0);
    {
        const EquipmentSizing& t = result.sizings.at("hvac/total");
        std::cout << "  TOTAL: " << total.rooms << " rooms, " << fmt(total.V, 7)
                  << " m3, supply " << fmt(total.Q, 7) << " m3/h, fan "
                  << fmt(t.values.at("P_fan"), 5) << " kW, heating "
                  << fmt(t.values.at("Q_heating"), 5) << " kW (winter), cooling "
                  << fmt(t.values.at("Q_cooling"), 5) << " kW (summer)\n";
    }
    announce("cleanUtilities hvac",
        "the air is sized SENSIBLE only: no humidity and no latent load"
        " (dehumidification), no room heat gain (machines, people, lighting), the"
        " recirculated air taken back at the supply temperature, the fan rise"
        " the case's own -- a first estimate of the air plant, not an HVAC"
        " design");
}

// ---------------------------------------------------------------------------
//  PURIFIED WATER
// ---------------------------------------------------------------------------
struct Draw { std::string use; scalar start, end, rate; };

void sizeWater(const DictPtr& w, SimulationResult& result)
{
    const std::string W = std::string(kTop) + " { purifiedWater }";
    const BatchPlanRecord& plan = result.batchPlan;
    if (!plan.present)
        throw std::runtime_error(W + ": no batch plan ran -- the demand per lot"
            " and the peak are read from the plan.  Declare `batchPlan { }`"
            " above this pass.");
    if (plan.multiProduct())
        throw std::runtime_error(W + ": the plan is MULTIPRODUCT; this pass reads"
            " the single-product plan's lot and Gantt.");
    const scalar lotHours = plan.lotSize / plan.productRate;          // h

    const DictPtr fl = block(w, "fluid", W);   text(fl, W + " fluid");
    const scalar rho = number(fl, "density", Dims::density, W + " fluid");   // kg/m3
    if (!(rho > 0.0)) throw std::runtime_error(W + " fluid: density must be positive.");
    const DictPtr gen = block(w, "generator", W);  text(gen, W + " generator");
    const scalar margin = plain(gen, "margin", W + " generator");
    if (!(margin >= 0.0))
        throw std::runtime_error(W + " generator: margin must be >= 0.");
    const DictPtr sto = block(w, "storage", W);    text(sto, W + " storage");
    const scalar hold = number(sto, "holdTime", Dims::time, W + " storage") / 3600.0;   // h
    if (!(hold > 0.0)) throw std::runtime_error(W + " storage: holdTime must be positive.");

    if (!w->found("uses") || !w->hasDictList("uses"))
        throw std::runtime_error(W + ": `uses ( { name; stream <s> | volumePerLot"
            " <vol>; stage <plan stage>; drawTime <h>; when start|end; source;"
            " reason; } ... );` is not declared.");

    struct Use { std::string name, stage, when; scalar V, draw; };
    std::vector<Use> uses;
    std::set<std::string> names;
    for (const auto& e : w->lookupDictList("uses"))
    {
        if (!e->found("name"))
            throw std::runtime_error(W + " uses: an entry has no `name`.");
        Use u;  u.name = e->lookupWord("name");
        const std::string wh = W + " use `" + u.name + "`";
        if (!names.insert(u.name).second)
            throw std::runtime_error(wh + ": declared twice.");
        text(e, wh);
        const bool hasStream = e->found("stream"), hasVol = e->found("volumePerLot");
        if (hasStream == hasVol)
            throw std::runtime_error(wh + ": declare EXACTLY ONE of `stream`"
                " (a flowsheet stream whose mass is read) and `volumePerLot`"
                " (a volume the case declares).");
        if (hasStream)
        {
            const std::string s = e->lookupWord("stream");
            auto it = result.streams.find(s);
            if (it == result.streams.end())
                throw std::runtime_error(wh + ": stream '" + s + "' is not a"
                    " stream of this flowsheet.");
            u.V = overallMassFlow(result, it->second) * 3600.0 * lotHours / rho;  // m3 per lot
        }
        else
            u.V = e->lookupScalar("volumePerLot", Dims::volume);
        if (!(u.V >= 0.0)) throw std::runtime_error(wh + ": negative volume.");
        if (!e->found("stage"))
            throw std::runtime_error(wh + ": `stage` (a stage of the batch plan)"
                " is not declared.");
        u.stage = e->lookupWord("stage");
        bool known = false;
        for (const auto& s : plan.stages) known = known || s.name == u.stage;
        if (!known)
            throw std::runtime_error(wh + ": stage '" + u.stage + "' is not a"
                " stage of the batch plan.");
        u.draw = number(e, "drawTime", Dims::time, wh) / 3600.0;               // h
        if (!(u.draw > 0.0)) throw std::runtime_error(wh + ": drawTime must be positive.");
        u.when = e->found("when") ? e->lookupWord("when") : std::string();
        if (u.when != "start" && u.when != "end")
            throw std::runtime_error(wh + ": `when start;` or `when end;` is"
                " required -- the draw sits at the start or the end of the"
                " stage's cycle in the plan's Gantt.");
        uses.push_back(u);
    }

    //  The draws, from the plan's Gantt.
    std::vector<Draw> draws;
    for (const auto& u : uses)
    {
        bool any = false;
        for (const auto& g : plan.gantt)
        {
            if (g.stage != u.stage || g.lot == 0) continue;
            any = true;
            const scalar len = g.end - g.start;
            if (u.draw > len + 1e-9)
                throw std::runtime_error(W + " use `" + u.name + "`: drawTime "
                    + fmt(u.draw) + " h exceeds the stage's cycle " + fmt(len)
                    + " h in the plan.");
            Draw d;  d.use = u.name;  d.rate = u.V / u.draw;
            d.start = (u.when == "start") ? g.start : g.end - u.draw;
            d.end   = d.start + u.draw;
            draws.push_back(d);
        }
        if (!any)
            throw std::runtime_error(W + " use `" + u.name + "`: the plan's"
                " Gantt has no bar for stage '" + u.stage + "'.");
    }
    //  THE CLEANING OF THE MACHINES, FROM THE BATCH PLAN (DEV.md 4c C210, E3).
    //  The plan counts the cleans (`batchPlan { cleaning }`) and this pass
    //  only DRAWS them in the Gantt it already reads -- ONE water ledger.  A
    //  clean after a lot draws over the stage's `cleanTime`, ending with the
    //  stage's bar; a clean at a changeover draws over the train's changeover
    //  bar.  Every instance the lot is split over (N_ip) is cleaned after each
    //  lot, every installed instance (N_ip N_op) at each changeover.
    scalar VcleanLot = 0.0, VcleanChangeoverYear = 0.0;
    if (!plan.cleaning.empty())
    {
        for (const auto& c : plan.cleaning)
        {
            const BatchStage* st = plan.stageOfUnit(c.unit);
            if (c.waterPerLotClean > 0.0)
            {
                const scalar V = c.waterPerLotClean * c.instancesPerLot;       // m3 per lot
                const scalar dt = st->cleanTime;                               // h
                VcleanLot += V;
                bool any = false;
                for (const auto& g : plan.gantt)
                {
                    if (g.stage != c.stage || g.lot == 0) continue;
                    any = true;
                    Draw d;  d.use = "clean:" + c.unit;  d.rate = V / dt;
                    d.start = g.end - dt;  d.end = g.end;
                    draws.push_back(d);
                }
                if (!any)
                    throw std::runtime_error(W + " cleaning of `" + c.unit + "`: the"
                        " plan's Gantt has no bar for stage '" + c.stage + "'.");
            }
            if (c.waterPerChangeover > 0.0)
            {
                const scalar V = c.waterPerChangeover * c.instances;           // m3 per changeover
                bool any = false;
                for (const auto& g : plan.gantt)
                {
                    if (g.stage != "changeover" || g.train != c.train) continue;
                    any = true;
                    Draw d;  d.use = "changeover:" + c.unit;
                    d.start = g.start;  d.end = g.end;  d.rate = V / (g.end - g.start);
                    draws.push_back(d);
                }
                if (!any)
                    throw std::runtime_error(W + " cleaning of `" + c.unit + "`: the"
                        " plan's Gantt has no changeover bar for train '" + c.train + "'.");
                for (const auto& t : plan.trains)
                    if (t.name == c.train) VcleanChangeoverYear += V * t.campaigns;
            }
        }
    }
    else
    {
        const std::string msg = "the batch plan declares no `cleaning`: the water of"
            " cleaning the machines is not counted by the plan (a `uses` entry may"
            " still carry a lump per lot)";
        if (AdvisoryLog::instance().addAnnouncedOnce("cleanUtilities:cleaningNotCounted",
                "sizing", "info", "cleanUtilities purifiedWater", msg))
            std::cerr << "[cleanUtilities] " << msg << "\n";
    }

    scalar peak = 0.0;
    for (const auto& a : draws)
    {
        scalar sum = 0.0;
        for (const auto& b : draws)
            if (b.start <= a.start + 1e-12 && a.start < b.end - 1e-12) sum += b.rate;
        peak = std::max(peak, sum);
    }

    scalar Vlot = 0.0;
    std::cout << "\n=====================  Clean utilities: purified water  ====================\n";
    std::cout << "  " << std::left << std::setw(26) << "use" << std::setw(24) << "stage"
              << std::setw(14) << "m3 per lot" << std::setw(10) << "draw h"
              << std::setw(12) << "m3/h" << "\n  " << std::string(86, '-') << "\n";
    for (const auto& u : uses)
    {
        Vlot += u.V;
        std::cout << "  " << std::left << std::setw(26) << u.name << std::setw(24) << u.stage
                  << std::setw(14) << fmt(u.V, 5) << std::setw(10) << fmt(u.draw, 4)
                  << std::setw(12) << fmt(u.V / u.draw, 5) << "\n";
    }
    //  The plan's cleaning joins the same ledger: the water of the cleans
    //  after a lot is part of the lot's demand, the changeover cleans are
    //  counted over the year's campaigns.
    for (const auto& c : plan.cleaning)
    {
        const scalar V = c.waterPerLotClean * c.instancesPerLot;
        if (!(V > 0.0)) continue;
        std::cout << "  " << std::left << std::setw(26) << ("clean:" + c.unit) << " "
                  << std::setw(24) << c.stage << std::setw(14) << fmt(V, 5)
                  << std::setw(10) << fmt(plan.stageOfUnit(c.unit)->cleanTime, 4)
                  << std::setw(12) << fmt(V / plan.stageOfUnit(c.unit)->cleanTime, 5)
                  << "  (the plan's cleaning)\n";
    }
    Vlot += VcleanLot;
    const scalar Vyear   = Vlot * plan.lotsPerYear + VcleanChangeoverYear;   // m3
    const scalar rating  = peak * (1.0 + margin);                        // m3/h
    const scalar Vtank   = hold * peak;                                  // m3
    std::cout << "  per lot " << fmt(Vlot, 6) << " m3, " << plan.lotsPerYear
              << " lots a year = " << fmt(Vyear, 7) << " m3/yr; peak "
              << fmt(peak, 6) << " m3/h; generator " << fmt(rating, 6)
              << " m3/h; tank " << fmt(Vtank, 6) << " m3\n";

    EquipmentSizing g;
    g.set("V_lot",           Vlot,    "m3");
    g.set("lotsPerYear",     plan.lotsPerYear, "-");
    g.set("V_year",          Vyear,   "m3/yr");
    g.set("draw_peak",       peak,    "m3/h");
    g.set("margin",          margin,  "-");
    g.set("capacity",        rating,  "m3/h");
    if (!plan.cleaning.empty())
    {
        //  Published only when the plan declares cleaning, so every other case
        //  carries exactly the keys it carried.
        g.set("V_cleaning_lot",             VcleanLot,            "m3");
        g.set("V_cleaning_changeover_year", VcleanChangeoverYear, "m3/yr");
    }
    finishItem(g, "purifiedWater", "generator", "waterGenerator",
        "demand per lot = the declared water streams (kg per lot from the"
        " converged balance and the plan's lot hours, over the declared density)"
        " + the declared volumes; the peak = the largest sum of the declared draws"
        " that overlap in the plan's Gantt (every train's first campaign started"
        " together -- the conservative reading); rating = peak x (1 + margin)."
        "  NOT here: the generator's technology (still, membrane, loop), the"
        " distribution loop, WFI",
        "no cost correlation exists for a water generator; the building and"
        " utilities quotes carry it (`costing { quotes }`)");
    g.ordinal = static_cast<int>(result.sizings.size());
    result.sizings[g.itemId()] = std::move(g);

    EquipmentSizing t;
    t.set("V_R",      Vtank, "m3");
    t.set("holdTime", hold,  "h");
    t.set("draw_peak", peak, "m3/h");
    finishItem(t, "purifiedWater", "storage", "waterStorage",
        "volume = the declared hold time x the peak draw (the tank covers the"
        " peak without the generator).  NOT here: the tank's wall, its"
        " recirculation or its sanitisation",
        "no cost correlation exists for a purified-water tank here; a quote"
        " carries it (`costing { quotes }`)");
    t.ordinal = static_cast<int>(result.sizings.size());
    result.sizings[t.itemId()] = std::move(t);
}

} // namespace

int CleanUtilitiesPass::run(SimulationResult& result)
{
    if (!dict_->found("hvac") && !dict_->found("purifiedWater"))
        throw std::runtime_error(std::string(kTop) + ": declare `hvac { }`"
            " and/or `purifiedWater { }`; neither is.");
    if (dict_->found("hvac"))          sizeHvac(dict_->subDict("hvac"), result);
    if (dict_->found("purifiedWater")) sizeWater(dict_->subDict("purifiedWater"), result);
    //  The plant tags of the items just added (the rule is idempotent).
    equipmentTags::assign(result);
    return 0;
}

} // namespace Choupo
