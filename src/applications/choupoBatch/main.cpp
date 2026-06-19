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
-------------------------------------------------------------------------------
Application
    choupoBatch

Description
    Recipe-driven batch simulator.  Time loop:

        for t in [startTime, endTime] step deltaT:
            for each unit: unit->step(t, dt)
            if (t in writeInterval grid): emit trajectory snapshot baseline: ONE batch unit, no recipe events, no transfers.
    The case dict layout:

        case/
        ├── system/
        │   ├── controlDict      verbosity + (startTime, endTime, deltaT, writeInterval)
        │   └── flowsheetDict    list of batch units with initial state and operation
        └── constant/
            ├── thermoPackage    components + γ-φ models
            └── reactions        named-reaction library

    Output: trajectory.csv in the case directory.

    Usage:  choupoBatch [case_dir]
\*---------------------------------------------------------------------------*/

#include "core/Banner.H"
#include "core/Dictionary.H"
#include "core/DisplayUnits.H"
#include "materials/MaterialRegistry.H"
#include "thermo/henrysLaw/HenrysLawRegistry.H"
#include "thermo/utility/UtilityCatalogue.H"
#include "thermo/Database.H"
#include "thermo/ThermoPackage.H"
#include "thermo/activityCoefficient/ActivityModel.H"
#include "thermo/electrolyte/AqueousActivity.H"
#include "thermo/pureFluid/PureFluidModel.H"
#include "thermo/SurfaceTensionModel.H"
#include "thermo/equationOfState/EquationOfState.H"
#include "thermo/transport/TransportModel.H"
#include "thermo/transport/ThermalConductivityModel.H"
#include "thermo/transport/DiffusivityModel.H"
#include "thermo/transport/LiquidViscosityModel.H"
#include "thermo/transport/LiquidConductivityModel.H"
#include "thermo/transport/LiquidDiffusivityModel.H"
#include "thermo/heatCapacity/HeatCapacityModel.H"
#include "thermo/phase/Phase.H"
#include "unitOperations/heatTransfer/htc/HeatTransferCorrelation.H"
#include "thermo/vaporPressure/VaporPressureModel.H"
#include "unitOperations/batch/BatchUnitOperation.H"

#include <algorithm>
#include <filesystem>
#include <fstream>
#include <iomanip>
#include <iostream>
#include <stdexcept>
#include <string>

using namespace Choupo;
namespace fs = std::filesystem;

int main(int argc, char** argv)
try
{
    printBanner("  batch");

    // Registries shared with choupoSolve.
    VaporPressureModel::registerBuiltins();
    ActivityModel   ::registerBuiltins();
    electrolyte::AqueousActivity::registerBuiltins();   // aqueous per-ion gamma (Davies)
    PureFluidModel    ::registerBuiltins();   // pure-component absolute props (IF97)
    EquationOfState ::registerBuiltins();
    TransportModel  ::registerBuiltins();
    SurfaceTensionModel::registerBuiltins();
    ThermalConductivityModel::registerBuiltins();
    DiffusivityModel      ::registerBuiltins();
    LiquidViscosityModel  ::registerBuiltins();
    LiquidConductivityModel ::registerBuiltins();
    LiquidDiffusivityModel::registerBuiltins();
    HeatCapacityModel ::registerBuiltins();
    Phase           ::registerBuiltins();
    HeatTransferCorrelation::registerBuiltins();
    BatchUnitOperation::registerBuiltins();

    const std::string caseDir = (argc > 1) ? argv[1] : ".";
    if (!fs::exists(caseDir))
        throw std::runtime_error("Case directory does not exist: " + caseDir);

    // Resolve the database BEFORE entering the case dir.
    const fs::path launchCwd = fs::current_path();
    fs::path dataRoot;
    if (const char* env = std::getenv("CHOUPO_HOME"))
        dataRoot = fs::path(env) / "data";
    else if (fs::exists(launchCwd / "data" / "standards" / "components"))
        dataRoot = launchCwd / "data";
    Database db(dataRoot.empty() ? "" : dataRoot.string());

    if (!dataRoot.empty())
    {
        MaterialRegistry::loadFrom(dataRoot.string());
        HenrysLawRegistry::loadFrom(dataRoot.string());
        UtilityCatalogue::loadFrom(dataRoot.string());
    }

    fs::current_path(caseDir);
    std::cout << "Case directory: " << fs::current_path().string() << "\n"
              << "Database root:  " << db.root() << "\n\n";

    // ---- Required dictionaries ----------------------------------------
    auto controlDict   = Dictionary::fromFile("system/controlDict");
    auto flowsheetDict = Dictionary::fromFile("system/flowsheetDict");
    auto thermoDict    = Dictionary::fromFile("constant/thermoPackage");

    // ---- Optional dictionaries ----------------------------------------
    DictPtr reactionsDict;
    if (fs::exists("constant/reactions"))
        reactionsDict = Dictionary::fromFile("constant/reactions");

    DisplayUnits::instance().readFrom(controlDict);
    DisplayUnits::instance().readPrecision(controlDict);

    const int verbosity = static_cast<int>(controlDict->lookupScalarOrDefault("verbosity", 3));
    const std::string application =
        controlDict->lookupWordOrDefault("application", "choupoBatch");
    const std::string description =
        controlDict->lookupWordOrDefault("description", "");

    // Time settings
    const scalar startTime     = controlDict->lookupScalarOrDefault("startTime",     0.0);
    const scalar endTime       = controlDict->lookupScalar("endTime");
    const scalar deltaT        = controlDict->lookupScalar("deltaT");
    const scalar writeInterval =
        controlDict->lookupScalarOrDefault("writeInterval", deltaT);

    std::cout << "Application:       " << application << "\n";
    if (!description.empty())
        std::cout << "Description:       " << description << "\n";
    std::cout << "Verbosity:         " << verbosity      << "\n"
              << "startTime:         " << startTime      << " s\n"
              << "endTime:           " << endTime        << " s\n"
              << "deltaT:            " << deltaT         << " s\n"
              << "writeInterval:     " << writeInterval  << " s\n"
              << "reactions library: "
              << (reactionsDict ? "loaded" : "not present")
              << "\n\n";

    // ---- Build thermo package ----------------------------------------
    ThermoPackage thermo;
    thermo.readFromDict(thermoDict, db);

    // ---- Build batch units from flowsheetDict ------------------------
    auto unitList = flowsheetDict->lookupDictList("units");
    if (unitList.empty())
        throw std::runtime_error("choupoBatch: flowsheetDict has no units");

    std::vector<std::unique_ptr<BatchUnitOperation>> units;
    std::vector<std::string>                          unitNames;
    std::vector<std::string>                          dischargeToName;  // "" = none
    units.reserve(unitList.size());
    unitNames.reserve(unitList.size());

    for (const auto& uDict : unitList)
    {
        const std::string uname = uDict->lookupWord("name");
        const std::string utype = uDict->lookupWord("type");
        auto u = BatchUnitOperation::New(utype);
        u->setName(uname);
        u->initialise(uDict, thermo, reactionsDict);
        unitNames.push_back(uname);
        // Continuous discharge wiring: a unit (e.g. a still) may
        // route what it sheds each step to a receiver vessel.
        dischargeToName.push_back(uDict->lookupWordOrDefault("dischargeTo", ""));
        units.push_back(std::move(u));
    }

    // Resolve dischargeTo names to unit indices (-1 = none).
    std::vector<int> dischargeToIdx(units.size(), -1);
    for (std::size_t i = 0; i < units.size(); ++i)
    {
        if (dischargeToName[i].empty()) continue;
        auto it = std::find(unitNames.begin(), unitNames.end(), dischargeToName[i]);
        if (it == unitNames.end())
            throw std::runtime_error("Unit '" + unitNames[i] + "' dischargeTo '"
                + dischargeToName[i] + "' is not a unit in the list");
        dischargeToIdx[i] = static_cast<int>(it - unitNames.begin());
    }

    std::cout << "Units in campaign:";
    for (const auto& n : unitNames) std::cout << "  " << n;
    std::cout << "\n\n";

    // ---- Recipe events: optional, time-triggered. ------------
    //   recipe
    //   (
    //       { time 400;  action transfer;     from reactor;  to still; }
    //       { time 700;  action setParameter; unit still;    key F_vap;  value 2.0e-6; }
    //   );
    //
    // Each entry must carry `time` and `action`.  Remaining keys depend
    // on the action.  Events are sorted by time at startup; each step
    // of the time loop fires every pending event with time ≤ t.
    struct RecipeEvent { scalar time; DictPtr dict; };
    struct CondEvent   { DictPtr when; DictPtr dict; bool fired = false; };
    auto findUnit = [&](const std::string& nm) -> BatchUnitOperation*
    {
        for (std::size_t i = 0; i < units.size(); ++i)
            if (unitNames[i] == nm) return units[i].get();
        throw std::runtime_error("Recipe: unit '" + nm + "' not found"
            " in units list");
    };

    // Validate an event's action + params (shared by time- and condition-
    // triggered events).
    auto validateAction = [&](const DictPtr& ed)
    {
        const std::string action = ed->lookupWord("action");
        if (action == "transfer")
        {
            findUnit(ed->lookupWord("from"));
            findUnit(ed->lookupWord("to"));     // catch typos up front
        }
        else if (action == "setParameter")
        {
            findUnit(ed->lookupWord("unit"));
            ed->lookupWord  ("key");
            ed->lookupScalar("value");
        }
        else
            throw std::runtime_error("Recipe event has unknown action '"
                + action + "'.  Supported: transfer, setParameter.");
    };

    std::vector<RecipeEvent> events;       // time-triggered
    std::vector<CondEvent>   condEvents;   // condition-triggered (`when {... }`)
    if (flowsheetDict->found("recipe"))
    {
        for (const auto& ed : flowsheetDict->lookupDictList("recipe"))
        {
            validateAction(ed);
            if (ed->found("when"))           // condition-triggered
            {
                auto w = ed->subDict("when");
                findUnit(w->lookupWord("unit"));     // validate target + op
                w->lookupWord("quantity");
                w->lookupWord("op");
                w->lookupScalar("value");
                condEvents.push_back({ w, ed, false });
            }
            else                             // time-triggered
                events.push_back({ ed->lookupScalar("time"), ed });
        }
        std::sort(events.begin(), events.end(),
                  [](const RecipeEvent& a, const RecipeEvent& b)
                  { return a.time < b.time; });

        std::cout << "Recipe events (" << (events.size() + condEvents.size())
                  << "):\n";
        for (const auto& e : events)
            std::cout << "  t = " << std::setw(8) << e.time
                      << " s  action = " << e.dict->lookupWord("action") << "\n";
        for (const auto& c : condEvents)
            std::cout << "  when " << c.when->lookupWord("unit") << "."
                      << c.when->lookupWord("quantity") << " "
                      << c.when->lookupWord("op") << " "
                      << c.when->lookupScalar("value")
                      << "  action = " << c.dict->lookupWord("action") << "\n";
        std::cout << "\n";
    }

    // ---- Trajectory CSV: header --------------------------------------
    std::ofstream csv("trajectory.csv");
    if (!csv)
        throw std::runtime_error("choupoBatch: cannot open trajectory.csv");
    csv << "t";
    for (const auto& unit : units)
        for (std::size_t i = 0; i < thermo.n(); ++i)
            csv << "," << unit->name() << ".n_" << thermo.comp(i).name();
    for (const auto& unit : units)
        csv << "," << unit->name() << ".T";
    for (const auto& unit : units)
        for (const auto& [k, v] : unit->trajectoryExtras())
            csv << "," << unit->name() << "." << k;
    csv << "\n";

    auto writeSnapshot = [&](scalar t)
    {
        csv << std::scientific << std::setprecision(8) << t;
        for (const auto& unit : units)
            for (auto v : unit->state().n) csv << "," << v;
        for (const auto& unit : units)
            csv << "," << unit->state().T;
        for (const auto& unit : units)
            for (const auto& [k, v] : unit->trajectoryExtras())
                csv << "," << v;
        csv << "\n";
    };

    // ---- Time loop ---------------------------------------------------
    std::cout << "Time integration  (RK4, dt = " << deltaT << " s):\n"
              << "      t [s]  ";
    for (const auto& unit : units)
        for (std::size_t i = 0; i < thermo.n(); ++i)
            std::cout << std::setw(13) << (unit->name() + "." + thermo.comp(i).name());
    std::cout << "\n  ---------  "
              << std::string(13 * units.size() * thermo.n(), '-') << "\n";

    auto echoLine = [&](scalar t)
    {
        std::cout << "  " << std::setw(9) << std::fixed << std::setprecision(2) << t << "  ";
        for (const auto& unit : units)
            for (auto v : unit->state().n)
                std::cout << std::setw(13) << std::scientific << std::setprecision(5) << v;
        std::cout << "\n";
    };

    auto fireEvent = [&](const DictPtr& ed, scalar tNow)
    {
        const std::string action = ed->lookupWord("action");
        if (action == "transfer")
        {
            const std::string fromN = ed->lookupWord("from");
            const std::string toN   = ed->lookupWord("to");
            // PARTIAL transfer: `fraction` (0..1) of the source
            // moves; default 1.0 == empty the source.
            const scalar frac = ed->lookupScalarOrDefault("fraction", 1.0);
            BatchUnitOperation* src = findUnit(fromN);
            BatchUnitOperation* dst = findUnit(toN);
            BatchState pkg = src->discharge(frac);
            dst->chargeFrom(pkg);
            if (verbosity >= 2)
                std::cout << "  * t=" << std::fixed << std::setprecision(2)
                          << tNow << "s   recipe: TRANSFER " << pkg.totalMoles()
                          << " kmol (" << (frac * 100.0) << "%) from '" << fromN
                          << "' to '" << toN << "'  (T_src=" << pkg.T << " K)\n";
        }
        else if (action == "setParameter")
        {
            const std::string uN  = ed->lookupWord("unit");
            const std::string key = ed->lookupWord("key");
            const scalar      val = ed->lookupScalar("value");
            findUnit(uN)->setOperationParameter(key, val);
            if (verbosity >= 2)
                std::cout << "  * t=" << std::fixed << std::setprecision(2)
                          << tNow << "s   recipe: SET " << uN << "."
                          << key << " = " << val << "\n";
        }
    };

    // Resolve a `when` quantity on a unit's current state, and test the
    // comparison.  Quantities: T, total, n_<comp>, x_<comp>.
    auto quantityOf = [&](const std::string& uname, const std::string& q) -> scalar
    {
        const BatchState& s = findUnit(uname)->state();
        if (q == "T")     return s.T;
        if (q == "total") return s.totalMoles();
        if (q.rfind("n_", 0) == 0)
        {
            std::size_t i = thermo.indexOf(q.substr(2));
            return (i < s.n.size()) ? s.n[i] : 0.0;
        }
        if (q.rfind("x_", 0) == 0)
        {
            std::size_t i = thermo.indexOf(q.substr(2));
            scalar tot = s.totalMoles();
            return (tot > 0.0 && i < s.n.size()) ? s.n[i] / tot : 0.0;
        }
        throw std::runtime_error("Recipe `when`: unknown quantity '" + q
            + "' (use T, total, n_<comp>, x_<comp>)");
    };
    auto condTrue = [&](const DictPtr& w) -> bool
    {
        const scalar lhs = quantityOf(w->lookupWord("unit"), w->lookupWord("quantity"));
        const scalar rhs = w->lookupScalar("value");
        const std::string op = w->lookupWord("op");
        if (op == "gt") return lhs >  rhs;
        if (op == "ge") return lhs >= rhs;
        if (op == "lt") return lhs <  rhs;
        if (op == "le") return lhs <= rhs;
        throw std::runtime_error("Recipe `when`: unknown op '" + op
            + "' (use gt, ge, lt, le)");
    };

    scalar t = startTime;
    scalar nextWrite = startTime;
    std::size_t nextEvent = 0;

    // Fire any events scheduled at or before startTime BEFORE the
    // initial snapshot, so the very first row of trajectory.csv
    // already reflects them.
    while (nextEvent < events.size() && events[nextEvent].time <= startTime)
    {
        fireEvent(events[nextEvent].dict, events[nextEvent].time);
        ++nextEvent;
    }
    // Condition-triggered events already satisfied at startTime.
    for (auto& c : condEvents)
        if (!c.fired && condTrue(c.when)) { fireEvent(c.dict, startTime); c.fired = true; }

    writeSnapshot(t);
    if (verbosity >= 3) echoLine(t);
    nextWrite += writeInterval;

    while (t < endTime - 1.0e-12)
    {
        scalar dt = deltaT;
        if (t + dt > endTime) dt = endTime - t;

        for (auto& unit : units) unit->step(t, dt);
        t += dt;

        // Continuous discharge routing: hand each unit's per-step
        // sheddings (e.g. a still's condensed vapour) to its `dischargeTo`
        // receiver, so a distillate-receiver tank fills up step by step.
        for (std::size_t i = 0; i < units.size(); ++i)
            if (dischargeToIdx[i] >= 0)
                units[dischargeToIdx[i]]->chargeFrom(units[i]->takeContinuousDischarge());

        // Fire any events whose trigger has just elapsed.  Pedagogical
        // simplification: we do not cut dt to land exactly on the
        // trigger time --- events fire at the next step boundary
        // after t_trigger.  With the typical dt of 0.5-1.0 s this is
        // an O(dt) error in event timing, negligible at the trajectory
        // resolution writeInterval typically asks for.
        while (nextEvent < events.size() && events[nextEvent].time <= t)
        {
            fireEvent(events[nextEvent].dict, events[nextEvent].time);
            ++nextEvent;
        }
        // Condition-triggered events: fire ONCE, the first step their
        // `when` condition becomes true (evaluated on the post-step state).
        for (auto& c : condEvents)
            if (!c.fired && condTrue(c.when)) { fireEvent(c.dict, t); c.fired = true; }

        if (t >= nextWrite - 1.0e-9 || t >= endTime - 1.0e-12)
        {
            writeSnapshot(t);
            if (verbosity >= 3) echoLine(t);
            nextWrite += writeInterval;
        }
    }

    csv.close();
    std::cout << "\nTrajectory written: trajectory.csv\n";

    // ---- Final state summary ----------------------------------------
    std::cout << "\n=========================  Final state at t = " << t << " s  ===\n";
    for (const auto& unit : units)
    {
        const auto& s = unit->state();
        const scalar nTot = s.totalMoles();
        std::cout << "  Unit: " << unit->name() << "  (" << unit->type() << ")\n"
                  << "    T = " << s.T << " K   P = " << (s.P * 1.0e-5)
                  << " bar   V = " << s.V << " m³\n"
                  << "    Total moles = " << nTot << " kmol\n"
                  << "    Composition (mole fractions):\n";
        for (std::size_t i = 0; i < thermo.n(); ++i)
        {
            const scalar x = (nTot > 0) ? s.n[i] / nTot : 0.0;
            std::cout << "      " << std::left << std::setw(14)
                      << thermo.comp(i).name() << std::right << std::fixed
                      << std::setprecision(6) << x << "\n";
        }
    }
    std::cout << "==================================================\n";

    return 0;
}
catch (const std::exception& e)
{
    std::cerr << "\nERROR: " << e.what() << "\n";
    return 2;
}
