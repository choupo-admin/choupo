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

    SPDX-License-Identifier: GPL-3.0-or-later
    Credit and attribution: see AUTHORS
-------------------------------------------------------------------------------
File
    src/result/EnergyItems.H

Description
    WHICH KPIs ARE ENERGY ITEMS, AND WHICH HEAT DUTIES A UNIT PUBLISHES --
    the one home of that vocabulary, read by the balance reports, the
    utility allocation and the pinch pass.  It is a fact about the KPIs a
    RESULT carries, so it sits beside SimulationResult, below both of its
    readers' subsystems.  Moved VERBATIM out of reporting/BalanceMath.H on
    2026-10-25 (DEV.md 4c C150 R16): the pinch pass needed `unitHeatDuties`
    to list the duties its population leaves out, and including BalanceMath.H
    from postProcessing would have closed a postProcessing <-> reporting
    cycle (reporting's design and economics reports already include
    postProcessing) -- the remedy the OdsWriter took for the same cycle.
    The namespace stays `reporting`, so no caller changed.
\*---------------------------------------------------------------------------*/

#pragma once

#include "core/Types.H"

#include <algorithm>
#include <cmath>
#include <map>
#include <stdexcept>
#include <string>
#include <vector>

namespace Choupo {
namespace reporting {

//  WHICH SIDE OF THE FIRST LAW AN ENERGY ITEM IS ON (2026-09-12).
//
//  The steady-flow energy equation a student writes is  dH = Q - W, and the
//  two terms on the right are not interchangeable: heat crosses a boundary
//  down a temperature difference, work leaves through a shaft.  The engine
//  published only their SUM (`Q_boundary_kW`), so nothing downstream could
//  draw the equation -- and a figure that cannot separate Q from W cannot be
//  the first law, it can only be its total.
//
//  `Heat` and `Work` are the whole vocabulary, deliberately.  There is NO
//  catch-all: the map below IS the set of energy items (see
//  `isEnergyItemKpi`), so a KPI cannot become an energy item without a human
//  saying which side of the equation it is on.  An item that is genuinely
//  neither is a decision for a maintainer, not a default bucket that
//  quietly absorbs it -- the shape the 2026-08-05 arity slice found in the
//  reaction `order` (five readers, five defaults, a silent zero).
enum class EnergyItemKind { Heat, Work };

// Curated set of KPI names that are genuine energy-balance ITEMS (heat
// supplied/removed, shaft work), signed as energy ADDED to the process
// streams (+ in, - out).  Used to list a unit's energy items on the balance
// sheet and to close the energy balance against the stream enthalpy change.
// Deliberately EXCLUDES diagnostics (e.g. W_isen_kW) so nothing double-
// counts; a unit adds itself here by exposing one of these KPIs.
//
//  ONE HOME for both facts: membership AND kind.  `isEnergyItemKpi` reads
//  this map's keys, so the two can never disagree about what an energy item
//  is.  NOT VERIFIED HERE, and said rather than implied: `W_hydraulic_kW`
//  and `Q_removed_kW` are declared but published by no unit in the tree
//  today (the pump emits `W_hydraulic`, without the `_kW`), so their kind is
//  a contract for a future publisher rather than a fact about a current run.
inline const std::map<std::string, EnergyItemKind>& energyItemKpis()
{
    static const std::map<std::string, EnergyItemKind> items = {
        {"Q_kW",                    EnergyItemKind::Heat},
        {"duty_kW",                 EnergyItemKind::Heat},
        {"Q_reboiler_kW",           EnergyItemKind::Heat},
        {"Q_condenser_kW",          EnergyItemKind::Heat},
        {"Q_removed_kW",            EnergyItemKind::Heat},
        {"Q_regeneration_kW",       EnergyItemKind::Heat},
        {"Q_adsorption_cooling_kW", EnergyItemKind::Heat},
        {"W_shaft_kW",              EnergyItemKind::Work},
        {"W_hydraulic_kW",          EnergyItemKind::Work},
    };
    return items;
}

inline bool isEnergyItemKpi(const std::string& k)
{
    return energyItemKpis().count(k) > 0;
}

//  Is this item SHAFT WORK?  Asked by the plant-boundary accumulator so the
//  published ledger can carry Q and W apart.  A name this map does not know
//  is not an energy item at all and never reaches here.
inline bool isWorkItemKpi(const std::string& k)
{
    const auto it = energyItemKpis().find(k);
    return it != energyItemKpis().end() && it->second == EnergyItemKind::Work;
}

// A duty KPI whose heat is delivered to the process THROUGH the unit's own
// heating-medium streams (steam in / condensate out), which appear in the
// unit's ins/outs.  That medium's enthalpy drop is ALREADY counted as a
// stream item in the energy balance, so summing the KPI on top double-counts
// it (the old "2131 % closure" on the evaporator).  Such a duty is INTERNAL
// to the unit's stream ledger -- kept as a sizing/economy KPI but NOT an
// external boundary item.  Today this is exactly the evaporator's `duty_kW`
// (its chest steam + condensate are always streams); a bare `Q_kW`,
// `Q_reboiler_kW`, `Q_condenser_kW` (flash / heater / column) has NO stream
// medium and so IS a genuine boundary item.
inline bool isInternalMediumDutyKpi(const std::string& k)
{
    return k == "duty_kW";
}

//  IS THIS UNIT A PROCESS-TO-PROCESS HEAT EXCHANGER?  (2026-10-05, DEV.md
//  C35 / 4d D1.)  Asked of what the unit IS -- its TYPE -- never of how many
//  ports it has.  Such a unit moves its declared duty BETWEEN its own process
//  streams, so the duty is internal: the streams already net it and counting
//  it at the plant boundary would count it twice (the old -3663 % on
//  heatExchanger01).  The test used to be structural -- >= 2 process inlets,
//  >= 2 process outlets, no utility stream -- and a MULTI-FEED distillation
//  column satisfies it while its reboiler and condenser are heat that
//  crosses the boundary: its two duties were dropped, and the plant residual
//  was exactly -(Q_reboiler + Q_condenser) on column04 (-78.693876 kW),
//  column05 and column08 (-891.980060 kW).  An antisolvent crystalliser's
//  cooling duty was one data datum away from the same fate.
//
//  The list is the set of unit types whose energy-item KPI IS heat passed
//  from one of their process streams to another: a shell-and-tube or plate
//  exchanger, a multi-stream exchanger, a cooling tower (water to air).  A
//  new exchanger type joins it here, by a human, the way an energy item
//  joins `energyItemKpis`; a type that is not listed keeps its duties on the
//  boundary, which is the reading a unit's published duty already promises.
//  The structural conditions stay as NECESSARY ones (an exchanger whose one
//  side is a utility circuit tagged on both ends sends its heat through
//  `qBoundary` and is not internal), never as sufficient.
inline bool isProcessToProcessExchanger(const std::string& unitType)
{
    return unitType == "heatExchanger"
        || unitType == "multiStreamHX"
        || unitType == "coolingTower";
}

//  WHICH HEAT DUTIES A UNIT PUBLISHES -- the ONE home of "this unit has a
//  duty" (2026-10-10, DEV.md 4c C52).
//
//  The energy report has always put a unit's `Q_kW` on the plant boundary
//  (`energyItemKpis` above); the utility allocation read only the KPI `Q`
//  in W, plus the column's two port keys.  Every unit that publishes `Q_kW`
//  alone -- gibbsReactor, cstr, conversionReactor, equilibriumReactor, pfr,
//  crystalliser -- had its duty PRICED by the first law and DROPPED by the
//  allocation: not allocated, not listed unserved, absent from C_UT and from
//  the economics' count of unpriced duties.  The green-ammonia converter's
//  -30 605 kW was the witness.  Two readers asking "does this unit have a
//  duty" with two different key lists is the arity sin; the answer now has
//  ONE home, derived from the SAME list the first law reads:
//
//      a boundary heat duty = an `energyItemKpis()` item of kind Heat that
//      is not an internal-medium duty (`isInternalMediumDutyKpi`).
//
//  What this table adds is only what the allocation needs beyond the first
//  law: the PORT a duty is served on (a column has two) and the KPI that
//  carries the temperature the heat crosses at.  A Heat item with no row here
//  is a maintainer's omission and REFUSES by name (`unitHeatDuties`) rather
//  than being skipped -- skipping is exactly the defect this replaces.
//
//  THE SI TWIN.  Four units (heater, heatExchanger, isothermalFlash,
//  phaseChanger) publish the generic duty twice: `Q` in W and `Q_kW`.  Each
//  computes the second from the first (`Q_W / 1000`, read at their kpis_
//  assignments), so the two agree by construction; they are CHECKED here
//  anyway, and a disagreement refuses naming both numbers, because a unit
//  publishing two different duties is a defect no reader should pick a side
//  of.  `Q` is preferred when present, so every row those units published
//  before this home existed is byte-identical.
struct HeatDutyPort
{
    const char* kpi;       // the energy item (kW)
    const char* port;      // "" = the unit's single generic duty
    const char* tempKpi;   // the KPI holding the temperature it crosses at
                           // ("" = the unit's own T, else T_out)
};

inline const std::vector<HeatDutyPort>& heatDutyPorts()
{
    //  ORDER IS THE ROW ORDER of the allocation (generic duty first, then the
    //  column's reboiler and condenser, as before this home existed).
    static const std::vector<HeatDutyPort> ports = {
        {"Q_kW",                    "",                  ""},
        {"Q_reboiler_kW",           "reboiler",          "T_bottom"},
        {"Q_condenser_kW",          "condenser",         "T_top"},
        {"Q_removed_kW",            "removed",           ""},
        {"Q_regeneration_kW",       "regeneration",      "T_regeneration"},
        {"Q_adsorption_cooling_kW", "adsorptionCooling", "T_adsorption"},
    };
    return ports;
}

struct UnitHeatDuty
{
    std::string kpi;       // which energy item it is
    std::string port;      // "" for the generic duty
    scalar      W = 0.0;   // signed, + heat INTO the process
    scalar      T = -1.0;  // K, the process temperature it crosses at; -1 unknown
};

inline std::vector<UnitHeatDuty>
unitHeatDuties(const std::map<std::string, scalar>& kpis, const std::string& unit)
{
    //  Every Heat item that crosses the boundary must have a port row.
    for (const auto& [key, kind] : energyItemKpis())
    {
        if (kind != EnergyItemKind::Heat || isInternalMediumDutyKpi(key)) continue;
        bool found = false;
        for (const auto& p : heatDutyPorts()) if (key == p.kpi) { found = true; break; }
        if (!found)
            throw std::logic_error("reporting::unitHeatDuties: the energy item `"
                + key + "` is a boundary heat duty (energyItemKpis) with no row in"
                  " heatDutyPorts() -- the utility allocation would drop it in"
                  " silence.  Add its port and temperature KPI there.");
    }

    auto find = [&kpis](const std::string& k) -> const scalar*
    {
        auto it = kpis.find(k);
        return it == kpis.end() ? nullptr : &it->second;
    };
    //  The unit's own temperature: `T`, else `T_out`, else `T_op` (the
    //  crystalliser publishes its magma temperature under that name and no
    //  other, so its cooling duty had no temperature to be served at).  A
    //  non-isothermal pfr publishes `T` as its INLET temperature: a duty
    //  spread along a profile is served here at that one temperature, an
    //  approximation said rather than refined.
    auto unitT = [&find]() -> scalar
    {
        if (auto t = find("T"))     return *t;
        if (auto t = find("T_out")) return *t;
        if (auto t = find("T_op"))  return *t;
        return -1.0;
    };

    std::vector<UnitHeatDuty> out;
    for (const auto& p : heatDutyPorts())
    {
        const std::string key = p.kpi;
        const scalar* kW = find(key);
        const scalar* W  = (key == "Q_kW") ? find("Q") : nullptr;
        if (!kW && !W) continue;
        if (kW && W)
        {
            const scalar a = *W, b = *kW * 1000.0;
            if (std::abs(a - b) > 1.0e-9 * std::max(std::abs(a), std::abs(b)) + 1.0e-6)
                throw std::runtime_error("unit '" + unit + "' publishes two"
                    " different duties: Q = " + std::to_string(a) + " W and"
                    " Q_kW = " + std::to_string(*kW) + " kW.  They are one"
                    " number in two units and must agree; no reader picks a"
                    " side.  This is a defect in the unit's KPI publication.");
        }
        UnitHeatDuty d;
        d.kpi  = key;
        d.port = p.port;
        d.W    = W ? *W : *kW * 1000.0;
        const std::string tk = p.tempKpi;
        const scalar* tp = tk.empty() ? nullptr : find(tk);
        d.T = tp ? *tp : unitT();
        out.push_back(std::move(d));
    }
    return out;
}

} // namespace reporting
} // namespace Choupo
