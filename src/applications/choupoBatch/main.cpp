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
            ├── propertyDict    components + γ-φ models
            └── reactions        named-reaction library

    Output: trajectory.csv in the case directory.

    Usage:  choupoBatch [case_dir]
\*---------------------------------------------------------------------------*/

#include "core/Banner.H"
#include "core/Dictionary.H"
#include "core/DisplayUnits.H"
#include "materials/MaterialRegistry.H"
#include "thermo/ElementComposition.H"
#include "thermo/henrysLaw/HenrysLawRegistry.H"
#include "thermo/solution/SolutionRegistry.H"
#include "thermo/utility/UtilityCatalogue.H"
#include "thermo/Database.H"
#include "thermo/ThermoAnnounce.H"
#include "thermo/ThermoPackage.H"
#include "thermo/PropertyContext.H"
#include "thermo/ThermoPackageBuilder.H"
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
#include "io/SolutionWriter.H"
#include "solver/ODE/AdaptiveTimeStep.H"
#include "core/ResultEmitter.H"

#include <algorithm>
#include <filesystem>
#include <fstream>
#include <iomanip>
#include <iostream>
#include <sstream>      // std::ostringstream (libc++/WASM needs it explicit)
#include <stdexcept>
#include <set>
#include <string>

using namespace Choupo;
namespace fs = std::filesystem;

// Seed each batch vessel's initial holdup from the case's 0/internalState -- the
// SINGLE source of truth.  A closed batch vessel has no continuous inlet, so the
// holdup is ALL of its authored state and there is no 0/streamFaces.  The inline
// initial{} block does not live in flowsheetDict: 0/internalState
// carries each holdup unit's block VERBATIM (T, P, V, totalMoles,
// molarComposition, ...), re-inserted here as the initial{} dict the unit's
// initialise() already reads.  Units whose initial state is NOT a unit-level
// holdup (fixedBedAdsorber's operation.initial + 0/bed.profile) carry no
// 0/internalState entry and are left untouched.
static void seedBatchUnitsFrom0(const std::vector<DictPtr>& unitList)
{
    DictPtr istate = fs::exists("0/internalState")
                   ? Dictionary::fromFile("0/internalState") : nullptr;
    DictPtr uroot  = (istate && istate->found("units"))
                   ? istate->subDict("units") : nullptr;

    for (const auto& uDict : unitList)
    {
        const std::string uname = uDict->lookupWord("name");
        const bool inState = uroot && uroot->found(uname);

        if (uDict->found("initial"))
            throw std::runtime_error("choupoBatch: unit '" + uname + "' carries an "
                "inline initial{} block -- the initial holdup "
                "lives in 0/internalState (the single source of truth); move the "
                "block there and delete it from flowsheetDict.");

        if (inState)
            uDict->insert("initial", uroot->subDict(uname));
    }
}

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

        SolutionRegistry::loadFrom(dataRoot.string());
        UtilityCatalogue::loadFrom(dataRoot.string());
    }

    fs::current_path(caseDir);
    std::cout << "Case directory: " << fs::current_path().string() << "\n"
              << "Database root:  " << db.root() << "\n\n";

    // ---- Required dictionaries ----------------------------------------
    auto controlDict   = Dictionary::fromFile("system/controlDict");
    auto flowsheetDict = Dictionary::fromFile("system/flowsheetDict");
    // The case system lives in constant/thermoPhysPropDict.
    if (!fs::exists("constant/thermoPhysPropDict")
        && fs::exists("constant/propertyDict"))
        throw std::runtime_error(
            "this case carries a constant/propertyDict -- the case grammar is"
                " constant/thermoPhysPropDict (bin/curate/migrate_thermoPhysProp.py"
                " converts old cases).");
    const std::string pkgFile = "constant/thermoPhysPropDict";
    auto thermoDict    = Dictionary::fromFile(pkgFile);

    // ---- Optional dictionaries ----------------------------------------
    DictPtr reactionsDict;
    if (fs::exists("constant/reactions"))
        reactionsDict = Dictionary::fromFile("constant/reactions");

    DisplayUnits::instance().readFrom(controlDict);
    DisplayUnits::instance().readPrecision(controlDict);

    const int verbosity = static_cast<int>(controlDict->lookupScalarOrDefault("verbosity", 3));
    thermoAnnounceLevel() = verbosity;   // gate the load-phase thermo chorus too
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

    // ---- timeStepping: OPT-IN adaptive (error-controlled) stepping ----
    //  ABSENT or `fixed` => today's fixed-RK4 deltaT loop, BYTE-IDENTICAL.
    //  `adaptive` => the stiff Rosenbrock23 integrator sub-steps each
    //  write/event interval with the step set by LOCAL ERROR (rtol/atol),
    //  starting LOW (deltaT0) and growing/shrinking automatically.  The
    //  trajectory + instant dirs still land on the CLEAN writeInterval grid.
    const std::string timeStepping =
        controlDict->lookupWordOrDefault("timeStepping", "fixed");
    const bool adaptive = (timeStepping == "adaptive");
    solver::AdaptiveSettings adaptSet;
    if (adaptive)
    {
        // Keys may sit in a `timeSteppingControl {}` sub-dict OR flat in
        // controlDict (the flat form keeps the simple cases terse).
        DictPtr ts = controlDict->found("timeSteppingControl")
            ? controlDict->subDict("timeSteppingControl") : controlDict;
        adaptSet.rtol      = ts->lookupScalarOrDefault("rtol",      1.0e-6);
        adaptSet.atol      = ts->lookupScalarOrDefault("atol",      1.0e-9);
        adaptSet.deltaT0   = ts->lookupScalarOrDefault("deltaT0",   deltaT);
        adaptSet.deltaTmax = ts->lookupScalarOrDefault("deltaTmax", writeInterval);
        adaptSet.maxGrowth = ts->lookupScalarOrDefault("maxGrowth", 4.0);
        adaptSet.verbosity = verbosity;
    }

    std::cout << "Application:       " << application << "\n";
    if (!description.empty())
        std::cout << "Description:       " << description << "\n";
    std::cout << "Verbosity:         " << verbosity      << "\n"
              << "startTime:         " << startTime      << " s\n"
              << "endTime:           " << endTime        << " s\n"
              << "deltaT:            " << deltaT         << " s\n"
              << "writeInterval:     " << writeInterval  << " s\n"
              << "timeStepping:      " << timeStepping
              << (adaptive ? "  (Rosenbrock23, error-controlled)" : "  (fixed RK4)")
              << "\n";
    if (adaptive)
        std::cout << "  rtol=" << adaptSet.rtol << "  atol=" << adaptSet.atol
                  << "  deltaT0=" << adaptSet.deltaT0 << " s"
                  << "  deltaTmax=" << adaptSet.deltaTmax << " s"
                  << "  maxGrowth=" << adaptSet.maxGrowth << "\n";
    std::cout << "reactions library: "
              << (reactionsDict ? "loaded" : "not present")
              << "\n\n";

    // ---- solutionControl: OpenFOAM-style REAL-TIME instant directories ----
    //  ABSENT block => OFF: the run is byte-identical (trajectory.csv only).
    //  Present with `write true;` => each write step also drops a `<t>/` time
    //  directory (`0/ 0.5/ 1/ ...`, the time IS the folder name) holding each
    //  vessel's holdup internalState.  trajectory.csv is ALWAYS still written.
    SolutionControl solutionCtl;            // defaults: write=false (OFF)
    if (controlDict->found("solutionControl"))
    {
        auto sc = controlDict->subDict("solutionControl");
        solutionCtl.write =
            (sc->lookupWordOrDefault("write", "false") == "true");
        solutionCtl.flushEach =
            (sc->lookupWordOrDefault("flushEach", "true") == "true");
        if (solutionCtl.write)
            std::cout << "solutionControl:   ON -> real-time instant dirs "
                         "(0/ <t>/ ...) at the case root, every writeInterval\n\n";
    }

    // ---- Build thermo package ----------------------------------------
    // v2 contract (thermophysicalPropertySystem): the BUILDER owns the ONE
    // exhaustive dispatch -- an implemented formulation assembles, any
    // other shape gets a NAMED refusal; the main never decides.  Routed by
    // content: manifest
    // (components + propertyMethods) -> builder; flat form -> legacy reader.
    // ACTIVE-CHEMISTRY SELECTION (constant/chemistryDict): the same
    // context chain, nearest owner wins; optional.
    ChemistrySystem chem = resolveChemistryContext("constant");
    const ChemistrySystem* chemPtr = chem.present ? &chem : nullptr;
    if (thermoDict->lookupWordOrDefault("recordType", "")
        != "thermophysicalPropertySystem")
        throw std::runtime_error("constant/thermoPhysPropDict must declare"
            " `recordType thermophysicalPropertySystem;` (the ONE case"
            " grammar).");
    ThermoPackage thermo = ThermoPackageBuilder::build(thermoDict, db, chemPtr);

    // ---- Build batch units from flowsheetDict ------------------------
    auto unitList = flowsheetDict->lookupDictList("units");
    if (unitList.empty())
        throw std::runtime_error("choupoBatch: flowsheetDict has no units");

    std::vector<std::unique_ptr<BatchUnitOperation>> units;
    std::vector<std::string>                          unitNames;
    std::vector<std::string>                          dischargeToName;  // "" = none
    units.reserve(unitList.size());
    unitNames.reserve(unitList.size());

    // Seed initial holdup from 0/ (single source of truth; inline initial{} is
    // retired) BEFORE each vessel initialises itself.
    seedBatchUnitsFrom0(unitList);

    for (const auto& uDict : unitList)
    {
        const std::string uname = uDict->lookupWord("name");
        const std::string utype = uDict->lookupWord("type");
        auto u = BatchUnitOperation::New(utype);
        u->setName(uname);
        u->initialise(uDict, thermo, reactionsDict);
        u->attachThermo(&thermo);   // phase (b): H-equality chargeFrom
        unitNames.push_back(uname);
        // Continuous discharge wiring: a unit (e.g. a still) may
        // route what it sheds each step to a receiver vessel.
        dischargeToName.push_back(uDict->lookupWordOrDefault("dischargeTo", ""));
        units.push_back(std::move(u));
    }

    // Resolve dischargeTo names to unit indices (-1 = none).
    // Campaign inventory datum (forum #88): the ALL-phase per-component
    // inventory summed over every vessel, BEFORE any event fires.  Internal
    // transfers cancel exactly; with no external feeds/removals mid-campaign
    // the final inventory must equal this to integration accuracy -- checked
    // and REPORTED at the end (mass closure in kg via the component MWs;
    // reactions conserve mass, not moles).
    sVector inventory0(thermo.n(), 0.0);
    for (const auto& u : units)
    {
        const sVector inv = u->materialInventory();
        for (std::size_t i = 0; i < thermo.n() && i < inv.size(); ++i)
            inventory0[i] += inv[i];
    }

    // Per-VESSEL initial enthalpy (energy balance): priced NOW, through the
    // vessel's OWN rung-aware hook (a crystalliser's magma splits dissolved
    // liquid vs solid-rung crystal; a fluid vessel prices as one liquid) --
    // a global mole sum cannot do that, and neither can a one-rung price.
    struct VesselH0 { scalar H0 = 0.0; bool ok = true; std::string why; };
    std::vector<VesselH0> vesselH0(units.size());
    for (std::size_t i = 0; i < units.size(); ++i)
        vesselH0[i].H0 =
            units[i]->vesselEnthalpy(vesselH0[i].ok, vesselH0[i].why);

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

    // ---- solutionControl writer (opt-in) -----------------------------
    //  The instant directory IS the real physical time (seconds).  Component
    //  names label each vessel's holdup inventory in <t>/internalState.
    std::unique_ptr<SolutionWriter> solWriter;
    if (solutionCtl.write)
    {
        std::vector<std::string> compNames;
        compNames.reserve(thermo.n());
        for (std::size_t i = 0; i < thermo.n(); ++i)
            compNames.push_back(thermo.comp(i).name());
        solWriter = std::make_unique<SolutionWriter>(
            fs::current_path().string(), solutionCtl, std::move(compNames));
    }

    // ---- Trajectory CSV: header --------------------------------------
    // (t, T) per unit on the write grid -- post-processed into the ignition
    // delay (time of max dT/dt) printed with the final state.  Cheap: one
    // pair per snapshot.
    std::vector<std::vector<std::pair<scalar, scalar>>> tempTrace(units.size());
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
        for (std::size_t u = 0; u < units.size(); ++u)
            tempTrace[u].emplace_back(t, units[u]->state().T);
        csv << std::scientific << std::setprecision(8) << t;
        for (const auto& unit : units)
            for (auto v : unit->state().n) csv << "," << v;
        for (const auto& unit : units)
            csv << "," << unit->state().T;
        for (const auto& unit : units)
            for (const auto& [k, v] : unit->trajectoryExtras())
                csv << "," << v;
        csv << "\n";

        // OpenFOAM-style real-time instant: each vessel's HOLDUP state at t.
        // A batch vessel is a closed 0-D cell -> internalState only (no outlet).
        //
        // The `0/` directory is the AUTHORED initial state (the single source of
        // truth the seed reads back) -- the writer NEVER overwrites it.  Physical
        // transient snapshots are t > 0 only (50/ 100/ ...).
        if (solWriter && std::abs(t) > 1.0e-9)
        {
            std::vector<DynamicUnitSnapshot> snaps;
            snaps.reserve(units.size());
            for (const auto& unit : units)
            {
                const auto& s = unit->state();
                DynamicUnitSnapshot snap;
                snap.name  = unit->name();
                snap.type  = unit->type();
                snap.T     = s.T;
                snap.P     = s.P;          // already canonical SI (Pa)
                snap.V     = s.V;
                snap.moles.assign(s.n.begin(), s.n.end());
                snap.extras = unit->trajectoryExtras();
                snaps.push_back(std::move(snap));
            }
            solWriter->writeDynamicInstant(t, "batch", snaps);
        }
    };

    // ---- Time loop ---------------------------------------------------
    // Console columns mirror trajectory.csv: moles per (unit, component),
    // then T per unit -- an adiabatic runaway's WHOLE POINT is T(t), so it
    // is printed, not csv-only.  Widths adapt to each label (a name like
    // `reactor.ethylAcetate` overflows a fixed setw(13) and the header
    // tokens mash into one unreadable string), with 2 spaces of separation.
    std::vector<std::string> colLabels;
    for (const auto& unit : units)
        for (std::size_t i = 0; i < thermo.n(); ++i)
            colLabels.push_back(unit->name() + "." + thermo.comp(i).name());
    for (const auto& unit : units)
        colLabels.push_back(unit->name() + ".T[K]");
    std::vector<int> colWidth;
    colWidth.reserve(colLabels.size());
    std::size_t ruleLen = 0;
    for (const auto& l : colLabels)
    {
        colWidth.push_back(std::max<int>(13, static_cast<int>(l.size()) + 2));
        ruleLen += static_cast<std::size_t>(colWidth.back());
    }

    std::cout << (adaptive
                    ? "Time integration  (adaptive Rosenbrock23, deltaT0 = "
                    : "Time integration  (RK4, dt = ")
              << (adaptive ? adaptSet.deltaT0 : deltaT) << " s):\n"
              << "      t [s]  ";
    for (std::size_t c = 0; c < colLabels.size(); ++c)
        std::cout << std::setw(colWidth[c]) << colLabels[c];
    std::cout << "\n  ---------  "
              << std::string(ruleLen, '-') << "\n";

    auto echoLine = [&](scalar t)
    {
        std::cout << "  " << std::setw(9) << std::fixed << std::setprecision(2) << t << "  ";
        std::size_t c = 0;
        for (const auto& unit : units)
            for (auto v : unit->state().n)
                std::cout << std::setw(colWidth[c++]) << std::scientific
                          << std::setprecision(5) << v;
        for (const auto& unit : units)
            std::cout << std::setw(colWidth[c++]) << std::fixed
                      << std::setprecision(2) << unit->state().T;
        std::cout << "\n";
    };

    // Every FIRED action is recorded here with its trigger -- the
    // machine-readable sequence the result JSON's `timeline` carries (the
    // recipe sequence/Gantt feed).  The trigger says WHY it fired: the
    // scheduled time, or the `when` condition that tripped.
    std::vector<SimulationResult::TimelineEvent> timeline;
    // The MATERIAL LEDGER (forum #88): every material edge as a structured
    // record; the timeline/Gantt are projections, balances read THIS.
    std::vector<SimulationResult::TransferRecord> transfers;
    std::vector<std::string> transferTriggers;   // per DISCRETE record, in order
    // Continuous dischargeTo edges: ONE ledger record per (from,to) pair,
    // amounts ACCUMULATED per component over the campaign (a per-dt record
    // would be thousands of rows saying nothing new); kind carries the
    // interval.  Discrete recipe transfers stay one record each.
    std::map<std::size_t, std::size_t> contSlot;   // unit idx -> transfers slot
    std::map<std::size_t, std::size_t> ventSlot;   // unit idx -> transfers slot
    sVector externalOut;                            // kmol, per component
    // Enthalpy of ONE package at ITS OWN (T, n) -- kJ, elements datum.  The
    // integral of these per-package values is the TRANSPORTED enthalpy the
    // energy balance will read (forum #99-P0: a single end-temperature
    // stamped on an accumulated dn destroys this history).  A species with
    // no formation route marks the record invalid, NAMED -- never decorative.
    auto packageH = [&](const BatchState& pkg, bool& ok,
                        std::vector<std::string>& missing) -> scalar
    {
        const scalar nTot = pkg.totalMoles();
        if (nTot <= 0.0) { ok = true; return 0.0; }
        sVector z(thermo.n(), 0.0);
        for (std::size_t i = 0; i < thermo.n() && i < pkg.n.size(); ++i)
        {
            z[i] = pkg.n[i] / nTot;
            if (z[i] > 0.0 && !thermo.hasEnthalpyDatum(i))
            {
                const std::string nm = thermo.comp(i).name();
                if (std::find(missing.begin(), missing.end(), nm) == missing.end())
                    missing.push_back(nm);
                ok = false;
            }
        }
        if (!ok) return 0.0;
        try
        {
            // liquid package (condensed distillate / vessel contents)
            return thermo.H_stream_formation(pkg.T, pkg.P > 0 ? pkg.P * 1.0e5 : 1.0e5,
                                   0.0, z) * nTot;   // J/mol * kmol = kJ
        }
        catch (const std::exception&)
        {
            // Datum present but the evaluation itself threw: the record is
            // just as unpriceable, and the poison must be NAMED so the
            // monotonic-validity invariant below (poisoned <=> H_missing
            // non-empty) holds on this path too.
            const std::string why = "(enthalpy evaluation failed)";
            if (std::find(missing.begin(), missing.end(), why) == missing.end())
                missing.push_back(why);
            ok = false;
            return 0.0;
        }
    };
    auto addPackage = [&](SimulationResult::TransferRecord& tr, scalar tNow,
                          const BatchState& pkg)
    {
        tr.tEnd = tNow;
        for (std::size_t c = 0; c < thermo.n() && c < pkg.n.size(); ++c)
            if (pkg.n[c] != 0.0) tr.dn[thermo.comp(c).name()] += pkg.n[c];
        bool pkgOk = true;
        const scalar h = packageH(pkg, pkgOk, tr.H_missing);
        // Validity is MONOTONIC (forum #101): once ONE package could not be
        // priced, the record's integrated H has lost a parcel FOREVER -- a
        // later priceable package must never resurrect it.  packageH names
        // every poison it meets, so "ever poisoned" is exactly "H_missing
        // non-empty"; that also separates 'first package' from 'integral
        // numerically zero', which the old H_kJ==0.0 test conflated.
        if (!pkgOk || !tr.H_missing.empty())
        {
            tr.H_valid = false;
            tr.H_kJ    = 0.0;      // a partial integral is never emitted
        }
        else
        {
            tr.H_kJ  += h;
            tr.H_valid = true;
        }
    };
    auto recordContinuous = [&](std::size_t i, scalar tNow, const BatchState& pkg)
    {
        if (pkg.totalMoles() <= 0.0) return;
        auto it = contSlot.find(i);
        if (it == contSlot.end())
        {
            SimulationResult::TransferRecord tr;
            tr.tStart = tNow; tr.tEnd = tNow;
            tr.from = unitNames[i];
            tr.to   = unitNames[static_cast<std::size_t>(dischargeToIdx[i])];
            tr.kind = "continuous";
            contSlot[i] = transfers.size();
            transfers.push_back(std::move(tr));
            it = contSlot.find(i);
        }
        addPackage(transfers[it->second], tNow, pkg);
    };
    // A vessel that sheds material with NO receiver is an EXTERNAL outlet --
    // an UNROUTED PRODUCT stream, not an emission (forum #99: '(vented)'
    // turned product into a vent).  The role is neutral and explicit.
    auto recordVented = [&](std::size_t i, scalar tNow, const BatchState& pkg)
    {
        if (pkg.totalMoles() <= 0.0) return;
        if (externalOut.size() != thermo.n()) externalOut.assign(thermo.n(), 0.0);
        for (std::size_t c = 0; c < thermo.n() && c < pkg.n.size(); ++c)
            externalOut[c] += pkg.n[c];
        auto it = ventSlot.find(i);
        if (it == ventSlot.end())
        {
            SimulationResult::TransferRecord tr;
            tr.tStart = tNow; tr.tEnd = tNow;
            tr.from = unitNames[i];
            tr.to   = "(unrouted outlet)";
            tr.kind = "external";
            ventSlot[i] = transfers.size();
            transfers.push_back(std::move(tr));
            it = ventSlot.find(i);
        }
        addPackage(transfers[it->second], tNow, pkg);
    };
    auto fireEvent = [&](const DictPtr& ed, scalar tNow,
                         const std::string& trigger)
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
            std::ostringstream d;
            d << "TRANSFER " << pkg.totalMoles() << " kmol ("
              << (frac * 100.0) << "%) " << fromN << " -> " << toN;
            SimulationResult::TransferRecord tr;
            tr.tStart = tNow; tr.tEnd = tNow;
            tr.from = fromN; tr.to = toN; tr.kind = "discrete";
            addPackage(tr, tNow, pkg);
            transferTriggers.push_back(trigger);        // timeline derives from the ledger
            transfers.push_back(std::move(tr));
        }
        else if (action == "setParameter")
        {
            const std::string uN  = ed->lookupWord("unit");
            const std::string key = ed->lookupWord("key");
            const scalar      val = ed->lookupScalar("value");
            // An instantaneous T jump is an ENERGY INTERVENTION: the unit
            // itself prices it as a canonical `impulse` ledger record
            // (phase (e), #99-3) -- a state difference on the elements
            // datum, never a teleported temperature the balance forgets.
            findUnit(uN)->setOperationParameter(key, val);
            if (verbosity >= 2)
                std::cout << "  * t=" << std::fixed << std::setprecision(2)
                          << tNow << "s   recipe: SET " << uN << "."
                          << key << " = " << val << "\n";
            std::ostringstream d;
            d << "SET " << uN << "." << key << " = " << val;
            timeline.push_back({ tNow, "recipe", "setParameter", d.str(), trigger, uN, "" });
        }
    };
    // A time trigger's description carries the SCHEDULED time; the entry's
    // `t` is the instant the mutation was APPLIED (in fixed-step the event
    // lands on the next grid boundary -- recording the schedule as `t` made
    // the Gantt lie about when the state actually changed, forum #87-P1).
    auto timeDesc = [](scalar tSched) -> std::string
    {
        std::ostringstream d;
        d << "time (scheduled " << tSched << " s)";
        return d.str();
    };
    // The `when` trigger's own description (for the timeline record).
    auto whenDesc = [](const DictPtr& w) -> std::string
    {
        std::ostringstream d;
        d << "when: " << w->lookupWord("unit") << "." << w->lookupWord("quantity")
          << " " << w->lookupWord("op") << " " << w->lookupScalar("value");
        return d.str();
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

    // Start every vessel's energy-ledger clock at startTime BEFORE the
    // initial events, so a t=0 recipe charge lands on an already-open
    // (empty) segment boundary instead of an unstamped one.
    for (auto& unit : units) unit->noteTimeAdvanced(startTime);

    // Fire any events scheduled at or before startTime BEFORE the
    // initial snapshot, so the very first row of trajectory.csv
    // already reflects them.
    while (nextEvent < events.size() && events[nextEvent].time <= startTime)
    {
        fireEvent(events[nextEvent].dict, startTime,
                  timeDesc(events[nextEvent].time));
        ++nextEvent;
    }
    // Condition-triggered events already satisfied at startTime.
    for (auto& c : condEvents)
        if (!c.fired && condTrue(c.when)) { fireEvent(c.dict, startTime, whenDesc(c.when)); c.fired = true; }

    writeSnapshot(t);
    if (verbosity >= 3) echoLine(t);
    nextWrite += writeInterval;

    // Shared post-step processing (discharge routing, events, writes).
    auto postStep = [&](scalar tNow)
    {
        // Continuous discharge routing: hand each unit's per-step
        // sheddings (e.g. a still's condensed vapour) to its `dischargeTo`
        // receiver, so a distillate-receiver tank fills up step by step.
        for (std::size_t i = 0; i < units.size(); ++i)
            if (dischargeToIdx[i] >= 0)
            {
                const BatchState pkg = units[i]->takeContinuousDischarge();
                recordContinuous(i, tNow, pkg);
                units[dischargeToIdx[i]]->chargeFrom(pkg);
            }
            else
                recordVented(i, tNow, units[i]->takeContinuousDischarge());

        while (nextEvent < events.size() && events[nextEvent].time <= tNow + 1.0e-9)
        {
            fireEvent(events[nextEvent].dict, tNow,
                      timeDesc(events[nextEvent].time));
            ++nextEvent;
        }
        for (auto& c : condEvents)
            if (!c.fired && condTrue(c.when)) { fireEvent(c.dict, tNow, whenDesc(c.when)); c.fired = true; }
    };

    if (!adaptive)
    {
        // ---- FIXED-STEP RK4 (today's path --- byte-identical) ---------
        while (t < endTime - 1.0e-12)
        {
            scalar dt = deltaT;
            if (t + dt > endTime) dt = endTime - t;

            for (auto& unit : units) unit->step(t, dt);
            t += dt;
            for (auto& unit : units) unit->noteTimeAdvanced(t);

            // Continuous discharge routing.
            for (std::size_t i = 0; i < units.size(); ++i)
                if (dischargeToIdx[i] >= 0)
                {
                    const BatchState pkg = units[i]->takeContinuousDischarge();
                    recordContinuous(i, t, pkg);
                    units[dischargeToIdx[i]]->chargeFrom(pkg);
                }
                else
                    recordVented(i, t, units[i]->takeContinuousDischarge());

            // Fire any events whose trigger has just elapsed.  Pedagogical
            // simplification: we do not cut dt to land exactly on the
            // trigger time --- events fire at the next step boundary
            // after t_trigger.  With the typical dt of 0.5-1.0 s this is
            // an O(dt) error in event timing, negligible at the trajectory
            // resolution writeInterval typically asks for.
            while (nextEvent < events.size() && events[nextEvent].time <= t)
            {
                fireEvent(events[nextEvent].dict, t,
                          timeDesc(events[nextEvent].time));
                ++nextEvent;
            }
            for (auto& c : condEvents)
                if (!c.fired && condTrue(c.when)) { fireEvent(c.dict, t, whenDesc(c.when)); c.fired = true; }

            if (t >= nextWrite - 1.0e-9 || t >= endTime - 1.0e-12)
            {
                writeSnapshot(t);
                if (verbosity >= 3) echoLine(t);
                nextWrite += writeInterval;
            }
        }
    }
    else
    {
        // ---- ADAPTIVE Rosenbrock23 (opt-in) ---------------------------
        //  The integrator's LOCAL ERROR sets the step.  We advance to the
        //  NEXT boundary in {writeInterval grid, recipe-event time, endTime}
        //  --- the step is clamped so it NEVER overshoots a write/event time;
        //  the instant + trajectory rows still land on the clean grid.  ODE-
        //  form units (batchReactor) go through the stiff sweep; any non-ODE
        //  vessel (a still) takes ONE fixed step over the sub-interval.
        solver::AdaptiveTimeStepper stepper(adaptSet);

        // Glass-box step history: print the adaptive step as it grows/shrinks.
        bool printedHeader = false;
        auto onStep = [&](scalar tEnd, scalar hTaken)
        {
            if (verbosity < 3) return;
            if (!printedHeader)
            {
                std::cout << "    [adaptive step history]   t [s]"
                          << "        h [s]\n";
                printedHeader = true;
            }
            std::cout << "                            "
                      << std::setw(11) << std::scientific << std::setprecision(4) << tEnd
                      << "  " << std::setw(11) << hTaken << "\n";
        };

        while (t < endTime - 1.0e-12)
        {
            // Next clean boundary: the earliest of the next write, the next
            // pending recipe event, and endTime.  The integrator lands HERE.
            scalar tNext = std::min(nextWrite, endTime);
            if (nextEvent < events.size())
                tNext = std::min(tNext, events[nextEvent].time);
            if (tNext <= t + 1.0e-12) tNext = std::min(t + writeInterval, endTime);

            // Collect ODE-form units for the stiff sweep; step the rest fixed.
            std::vector<solver::OdeUnit> odeUnits;
            for (auto& unit : units)
            {
                if (unit->hasOdeForm())
                {
                    BatchUnitOperation* up = unit.get();
                    odeUnits.push_back({
                        [up]               { return up->odeState(); },
                        [up](const sVector& y){ up->setOdeState(y); },
                        [up](const sVector& y){ return up->odeDerivative(y); },
                        up->odeNPositive() });
                }
                else
                    unit->step(t, tNext - t);   // non-ODE vessel: one fixed step
            }
            if (!odeUnits.empty())
                stepper.advance(odeUnits, t, tNext, onStep);

            t = tNext;
            for (auto& unit : units) unit->noteTimeAdvanced(t);
            postStep(t);

            if (t >= nextWrite - 1.0e-9 || t >= endTime - 1.0e-12)
            {
                writeSnapshot(t);
                if (verbosity >= 3) echoLine(t);
                nextWrite += writeInterval;
            }
        }
    }

    csv.close();
    std::cout << "\nTrajectory written: trajectory.csv\n";

    // ---- Final state summary ----------------------------------------
    // ---- ignition delay (time of max dT/dt on the write grid) ----------
    // Reported whenever a unit's temperature rose by > 200 K -- the
    // shock-tube convention nearest to the pressure/temperature-rise tangent
    // criterion used by the experiments (Slack 1977; O Conaire 2004).
    for (std::size_t u = 0; u < units.size(); ++u)
    {
        const auto& tr = tempTrace[u];
        if (tr.size() < 3 || (tr.back().second - tr.front().second) < 200.0)
            continue;
        scalar best = 0.0, tIgn = 0.0;
        for (std::size_t k = 1; k < tr.size(); ++k)
        {
            const scalar dt = tr[k].first - tr[k-1].first;
            if (dt <= 0) continue;
            const scalar d = (tr[k].second - tr[k-1].second) / dt;
            if (d > best) { best = d; tIgn = tr[k].first; }
        }
        std::cout << "\n  Ignition delay, " << units[u]->name()
                  << ":  tau_ign (max dT/dt) = " << std::scientific
                  << std::setprecision(3) << tIgn << " s   (grid resolution "
                  << (tr[1].first - tr[0].first) << " s)\n";
    }

    std::cout << "\n=========================  Final state at t = " << t << " s  ===\n";
    for (const auto& unit : units)
    {
        const auto& s = unit->state();
        const scalar nTot = s.totalMoles();
        std::cout << "  Unit: " << unit->name() << "  (" << unit->type() << ")\n"
                  << std::defaultfloat << std::setprecision(4)
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

    // ---- Golden-master emission -------------------------------------
    //  The forum lesson (fitNRTL01, chi^2 100x off with nothing red): a case
    //  without a numerical referee can break in silence.  The FINAL state of
    //  every vessel becomes the result JSON's per-unit KPI block, so
    //  `runTests --record` pins it like any steady case -- trajectories stay
    //  in trajectory.csv; the golden guards where they END.
    {
        SimulationResult result;
        result.converged = true;
        for (const auto& unit : units)
        {
            auto& k = result.kpis[unit->name()];
            const auto& st = unit->state();
            k["t_end"]            = t;
            k["T_final"]          = st.T;
            k["P_final"]          = st.P;
            k["totalMoles_final"] = st.totalMoles();
            for (std::size_t i = 0; i < thermo.n(); ++i)
                k["n_" + thermo.comp(i).name() + "_final"] = st.n[i];
            for (const auto& [key, v] : unit->kpis())
                k[key] = v;                     // unit-specific verdicts (rectifier x_D, R, D)
            for (const auto& ev : unit->statusEvents())
                timeline.push_back(ev);         // qualitative state changes
        }
        // ---- Timeline: the MATERIAL rows are DERIVED from the ledger ----
        //  (forum #99-P0: two parallel writes drift; the ledger is canonical.
        //  setParameter/status rows are not material and stay direct.)
        {
            std::size_t d = 0;
            for (const auto& tr : transfers)
            {
                std::ostringstream det;
                scalar nTot = 0.0;
                for (const auto& [c, v] : tr.dn) nTot += v;
                if (tr.kind == "discrete")
                {
                    det << "TRANSFER " << nTot << " kmol " << tr.from
                        << " -> " << tr.to;
                    timeline.push_back({ tr.tEnd, "recipe", "transfer",
                        det.str(),
                        d < transferTriggers.size() ? transferTriggers[d] : "",
                        tr.from, tr.to });
                    ++d;
                }
                else
                {
                    det << (tr.kind == "external" ? "EXTERNAL OUTLET "
                                                  : "CONTINUOUS ")
                        << nTot << " kmol " << tr.from << " -> " << tr.to
                        << " over [" << tr.tStart << ", " << tr.tEnd << "] s";
                    timeline.push_back({ tr.tStart, "recipe",
                        tr.kind == "external" ? "externalOutlet"
                                              : "dischargeTo",
                        det.str(), "", tr.from, tr.to });
                }
            }
        }

        // ---- Campaign mass balance (forum #88) --------------------------
        //  Per-component moles can legitimately change (reactions); MASS in
        //  kg cannot.  Closure is |m_final - m_0| / m_0 -- a transfer bug, a
        //  phase the inventory hook misses, or a stoichiometry*MW error all
        //  go RED here.
        {
            sVector inventoryF(thermo.n(), 0.0);
            for (const auto& u : units)
            {
                const sVector inv = u->materialInventory();
                for (std::size_t i = 0; i < thermo.n() && i < inv.size(); ++i)
                    inventoryF[i] += inv[i];
            }
            auto& ck = result.kpis["campaign"];
            scalar m0 = 0.0, mF = 0.0, mOut = 0.0;
            for (std::size_t i = 0; i < thermo.n(); ++i)
            {
                m0  += inventory0[i] * thermo.comp(i).MW();
                mF  += inventoryF[i] * thermo.comp(i).MW();
                if (i < externalOut.size())
                    mOut += externalOut[i] * thermo.comp(i).MW();
            }
            // Robust closure (forum #99-P1): absolute residual normalised by
            // a robust scale -- mass created from an EMPTY initial inventory
            // can never read as closed.
            const scalar residual_kg = std::abs(mF + mOut - m0);
            const scalar scale_kg    = std::max({ m0, mF + mOut, 1.0e-12 });
            const scalar rel         = residual_kg / scale_kg;
            ck["mass_kg_initial"]      = m0;
            ck["mass_kg_final"]        = mF;
            ck["mass_kg_external_out"] = mOut;
            ck["mass_residual_kg"]     = residual_kg;
            ck["mass_closure_rel"]     = rel;
            ck["transfers_logged"]     = static_cast<scalar>(transfers.size());
            // Ledger H-validity census (forum #101): the energy balance can
            // only ever integrate records whose per-package enthalpy history
            // is intact, so the split is a first-class campaign verdict.
            std::size_t nHValid = 0;
            for (const auto& tr : transfers)
                if (tr.H_valid) ++nHValid;
            ck["transfers_H_valid"]   = static_cast<scalar>(nHValid);
            ck["transfers_H_invalid"] =
                static_cast<scalar>(transfers.size() - nHValid);

            // Per-ELEMENT closure (reactions conserve elements, not moles;
            // total mass can close over a chemically WRONG stoichiometry).
            // Formulas parse as Element[count] runs; an unparseable formula
            // names itself and withholds the elemental claim (never silent).
            //  THE shared parser (src/thermo/ElementComposition) validates
            //  against the real periodic table and reads the full grammar
            //  (groups, hydrates, ionic charge, D/T isotopes): a lumped toy
            //  species whose "formula" is A/B/X is NOT an element and must
            //  not fabricate an elemental claim.
            std::map<std::string, std::string> parseReason;
            auto parseFormula = [&parseReason](const std::string& f)
                -> std::map<std::string, scalar>
            {
                const auto ec = parseElementalFormula(f);
                if (!ec.available) parseReason[f] = ec.reason;
                return ec.available ? ec.atoms
                                    : std::map<std::string, scalar>{};
            };
            std::vector<std::string> unparsed;
            std::map<std::string, scalar> elem0, elemF;
            //  Declared model-error residuals (forum #119): each unit may
            //  PREDICT, by construction, the matter its declared closure
            //  fabricates (e.g. the fixed bed's constant-(u, P, T) carrier
            //  roll-up).  The reported numbers below stay RAW -- nothing is
            //  discounted; the prediction is only an independent
            //  cross-check for the VERDICT.
            std::map<std::string, scalar> elemDeclared;   // kmol-atoms
            scalar declared_kg = 0.0;
            bool anyDeclared = false;
            for (const auto& u : units)
                for (const auto& [nm, kmol] : u->declaredMaterialResidual())
                    for (std::size_t i = 0; i < thermo.n(); ++i)
                        if (thermo.comp(i).name() == nm)
                        {
                            anyDeclared = true;
                            declared_kg += kmol * thermo.comp(i).MW();
                            for (const auto& [sym, na]
                                 : parseFormula(thermo.comp(i).formula()))
                                elemDeclared[sym] += na * kmol;
                        }
            for (std::size_t i = 0; i < thermo.n(); ++i)
            {
                const scalar present = inventory0[i] + inventoryF[i]
                    + (i < externalOut.size() ? externalOut[i] : 0.0);
                if (present == 0.0) continue;
                const auto el = parseFormula(thermo.comp(i).formula());
                if (el.empty())
                {
                    const auto& fr = thermo.comp(i).formula();
                    unparsed.push_back(thermo.comp(i).name()
                        + (parseReason.count(fr)
                            ? " (" + parseReason.at(fr) + ")" : ""));
                    continue;
                }
                for (const auto& [sym, na] : el)
                {
                    elem0[sym] += na * inventory0[i];
                    elemF[sym] += na * (inventoryF[i]
                        + (i < externalOut.size() ? externalOut[i] : 0.0));
                }
            }
            scalar elemWorst = 0.0, elemWorstAdj = 0.0;
            if (unparsed.empty())
            {
                for (const auto& [sym, a0] : elem0)
                {
                    const scalar aF = elemF[sym];
                    const scalar r  = std::abs(aF - a0)
                                    / std::max({ a0, aF, 1.0e-15 });
                    ck["element_" + sym + "_closure_rel"] = r;   // RAW, shown
                    elemWorst = std::max(elemWorst, r);
                    //  adjusted ONLY for the verdict: residual minus the
                    //  units' own prediction -- if the leak IS the declared
                    //  fabrication, this collapses to numerics.
                    const scalar exp2 = anyDeclared
                        ? (elemDeclared.count(sym) ? elemDeclared.at(sym) : 0.0)
                        : 0.0;
                    const scalar rAdj = std::abs(aF - a0 - exp2)
                                      / std::max({ a0, aF, 1.0e-15 });
                    elemWorstAdj = std::max(elemWorstAdj, rAdj);
                }
                ck["element_worst_closure_rel"] = elemWorst;
                if (anyDeclared)
                    ck["element_worst_closure_vs_declared_rel"] = elemWorstAdj;
            }
            else if (verbosity >= 1)
            {
                std::cout << "[campaign] elemental balance UNAVAILABLE -- "
                             "unparseable formula on: ";
                for (const auto& u2 : unparsed) std::cout << u2 << " ";
                std::cout << "\n";
            }

            // A genuine leak is a FAILURE, not a log line (forum #99-P1):
            // the run reports non-convergence and exits nonzero.
            //  The TRUE invariant of a reacting campaign is the ELEMENTS
            //  (they close at 1e-15 here); total mass is only as consistent
            //  as the catalogue's Sum(nu*MW) = 0, and curated MWs from mixed
            //  sources drift at ~1e-5 (found live on wgs/ignition: elements
            //  1e-15, mass 1.8e-5 -- a curation note, not a leak).  Verdict:
            //  elements when available; mass only when they are not.
            constexpr scalar tolClosure = 1.0e-6;
            //  The verdict (forum #119): a residual that MATCHES the units'
            //  own declared-fabrication prediction is the announced model
            //  error doing exactly what was announced -- reported LOUD (the
            //  raw closure numbers above keep showing it), but it is not an
            //  unexplained leak.  A residual the prediction does NOT explain
            //  still fails, declared or not.
            const scalar relAdjMass = anyDeclared
                ? std::abs(mF + mOut - m0 - declared_kg) / scale_kg
                : rel;
            const bool leak = unparsed.empty()
                ? ((anyDeclared ? elemWorstAdj : elemWorst) > tolClosure)
                : (relAdjMass > tolClosure);
            if (anyDeclared && !leak && verbosity >= 1
                && (elemWorst > tolClosure || rel > tolClosure))
                std::cout << "[campaign] DECLARED MODEL RESIDUAL: the balance"
                             " shows " << std::scientific << residual_kg
                          << std::fixed << " kg of fabricated matter and that"
                             " MATCHES the units' own declared prediction"
                             " (carrier_fabricated_mol) to "
                          << std::scientific << elemWorstAdj << std::fixed
                          << " -- the named error of the declared closure,"
                             " shown, never discounted (forum #119); A4"
                             " removes it physically.\n";
            if (unparsed.empty() && elemWorst <= tolClosure
                && rel > tolClosure && verbosity >= 1)
                std::cout << "[campaign] NOTE: total mass drifts "
                          << std::scientific << rel << std::fixed
                          << " while every element closes -- the catalogue MWs"
                             " are inconsistent with the stoichiometry at that"
                             " level (Sum(nu*MW) != 0); a curation note, not a"
                             " leak.\n";
            if (leak) result.converged = false;
            if (verbosity >= 2)
                std::cout << "\n[campaign] mass balance: m0 = " << m0
                          << " kg = mF " << mF << " + external " << mOut
                          << " kg, closure " << std::scientific << rel
                          << (unparsed.empty()
                                ? ", worst element " : ", elements n/a ")
                          << (unparsed.empty() ? elemWorst : 0.0) << std::fixed
                          << (leak ? "  <-- LEAK: reported NON-CONVERGED"
                                   : (anyDeclared
                                      && (elemWorst > tolClosure
                                          || rel > tolClosure)
                                        ? "  (DECLARED residual -- explained"
                                          " above, not discounted)"
                                        : "  (closed)"))
                          << "\n";
        }
        // ---- ENERGY ledger + campaign energy balance (phase (a),
        //      forum #98.3 as amended by #99-1..5 and gated by #101) -------
        //  Q = dH per closed constant-P segment is an EXACT state
        //  difference; the balance claims a verdict ONLY when every piece
        //  is ledgered and priceable -- otherwise it reports UNAVAILABLE
        //  naming each missing piece (never a decorative closure).
        {
            auto& ek = result.kpis["campaign"];
            std::vector<std::string> eMissing;

            for (std::size_t i = 0; i < units.size(); ++i)
            {
                auto recs = units[i]->energyRecords(t);
                std::map<std::string, scalar> kindTotal;
                std::size_t seg = 0;
                for (const auto& er : recs)
                {
                    if (er.E_valid)
                    {
                        result.kpis[unitNames[i]]
                            ["E_" + er.kind + "_seg"
                                  + std::to_string(seg) + "_kJ"] = er.E_kJ;
                        kindTotal[er.kind] += er.E_kJ;
                    }
                    else
                    {
                        eMissing.push_back("unit '" + er.unit + "': "
                            + (er.E_missing.empty() ? std::string("E invalid")
                                                    : er.E_missing.front()));
                    }
                    ++seg;
                }
                for (const auto& [kind, tot] : kindTotal)
                    result.kpis[unitNames[i]]["E_" + kind + "_total_kJ"] = tot;
                result.energyLedger.insert(result.energyLedger.end(),
                                           recs.begin(), recs.end());
                const std::string gap = units[i]->energyLedgerGap();
                if (!gap.empty())
                    eMissing.push_back("unit '" + unitNames[i] + "' ("
                        + units[i]->type() + "): " + gap);
            }

            std::size_t eValid = 0;
            for (const auto& er : result.energyLedger)
                if (er.E_valid) ++eValid;
            ek["energy_records_valid"]   = static_cast<scalar>(eValid);
            ek["energy_records_invalid"] =
                static_cast<scalar>(result.energyLedger.size() - eValid);

            // Gates that keep the balance honest.  Since phase (b) the
            // charge conserves H by construction (T_mix solved from
            // H-equality), so internal transfers cancel EXACTLY in the
            // vessel sum and need no gate -- what gates is each occasion a
            // charge FELL BACK to the molar-T average (announced by the
            // vessel, drained here), an EXTERNAL record whose transported
            // H could not be priced, and an instantaneous setParameter T
            // (an un-ledgered impulse until phase (e)).
            for (const auto& u2 : units)
                for (const auto& fb : u2->chargeFallbacks())
                    eMissing.push_back(fb);
            scalar Hext = 0.0;   // kJ leaving with unrouted external outlets
            for (const auto& tr : transfers)
            {
                if (tr.kind != "external") continue;
                if (tr.H_valid) Hext += tr.H_kJ;
                else eMissing.push_back("external outlet '" + tr.from
                    + "' -> " + tr.to + ": transported H unpriceable"
                    + (tr.H_missing.empty() ? ""
                       : " (" + tr.H_missing.front() + ")"));
            }

            // Per-vessel dH between the campaign endpoints, each priced at
            // the vessel's OWN (T, P) with the SAME pricing the material
            // ledger uses.
            scalar dHsum = 0.0;
            scalar dHabs = 0.0;   // Sum |dH_vessel|: how much enthalpy MOVED
                                  // -- the honest scale for the closure when
                                  // the signed sum cancels to ~0 (a pure
                                  // transfer campaign must not read 0/0).
            for (std::size_t i = 0; i < units.size(); ++i)
            {
                bool okF = true;
                std::string whyF;
                const scalar HF = units[i]->vesselEnthalpy(okF, whyF);
                if (!vesselH0[i].ok)
                    eMissing.push_back("unit '" + unitNames[i]
                        + "' (initial): " + vesselH0[i].why);
                if (!okF)
                    eMissing.push_back("unit '" + unitNames[i]
                        + "' (final): " + whyF);
                if (vesselH0[i].ok && okF)
                {
                    dHsum += HF - vesselH0[i].H0;
                    dHabs += std::abs(HF - vesselH0[i].H0);
                }
            }

            if (!eMissing.empty())
            {
                // Dedup, order-preserving: a segment's reboiler+condenser
                // records legitimately share one poison reason -- name it
                // once.
                std::vector<std::string> uniq;
                for (const auto& m2 : eMissing)
                    if (std::find(uniq.begin(), uniq.end(), m2) == uniq.end())
                        uniq.push_back(m2);
                ek["energy_balance_available"] = 0.0;
                if (verbosity >= 1)
                {
                    std::cout << "[campaign] energy balance UNAVAILABLE --"
                                 " missing pieces:\n";
                    for (const auto& m2 : uniq)
                        std::cout << "    - " << m2 << "\n";
                }
            }
            else
            {
                scalar Q = 0.0;
                for (const auto& er : result.energyLedger) Q += er.E_kJ;
                // First law over the whole campaign: what the vessels
                // gained = what the jackets supplied - what left with
                // the external outlets (internal moves cancel; the
                // H-equality charge guarantees it).
                const scalar res   = dHsum + Hext - Q;
                const scalar scale = std::max({ dHabs, std::abs(Q),
                                                std::abs(Hext), 1.0e-12 });
                ek["energy_balance_available"] = 1.0;
                ek["energy_dH_vessels_kJ"]     = dHsum;
                ek["energy_Q_ledger_kJ"]       = Q;
                ek["energy_H_external_kJ"]     = Hext;
                ek["energy_residual_kJ"]       = std::abs(res);
                ek["energy_closure_rel"]       = std::abs(res) / scale;
                if (verbosity >= 2)
                    std::cout << "[campaign] energy balance: dH_vessels = "
                              << dHsum << " kJ + external " << Hext
                              << " kJ = Q_ledger " << Q
                              << " kJ, closure "
                              << std::scientific << std::abs(res) / scale
                              << std::fixed
                              << "  (residual is the INTEGRATION + mix-solve"
                                 " honesty -- all terms are state functions)\n";
            }
        }
        // ---- CAMPAIGN UTILITIES (phase (f), forum #98.3-6 as amended by
        //      #99-5): each VALID ledger record with a known service T is
        //      allocated to a catalogue utility by the SAME pick rule the
        //      steady report uses (UtilityCatalogue::pickForDuty -- tightest
        //      feasible margin at the record's worst-case T).  Mass uses the
        //      catalogue's phase-aware dutyPerKg (condensing steam is latent,
        //      never cp*dT); campaign cost = Sum E * price.  Records that
        //      cannot be served are LISTED, never silently dropped.
        {
            constexpr scalar dTminUtil = 10.0;   // approach [K], declared below
            auto& uk = result.kpis["campaign"];
            struct UtilAgg { scalar E_kJ = 0.0, kg = 0.0, eur = 0.0; };
            std::map<std::string, UtilAgg> byUtil;
            std::vector<std::string> unserved;
            for (const auto& er : result.energyLedger)
            {
                if (!er.E_valid || er.E_kJ == 0.0) continue;
                if (er.T_service_K < 0.0)
                {
                    unserved.push_back("unit '" + er.unit + "' " + er.kind
                        + ": no service temperature on the record");
                    continue;
                }
                const bool heating = er.E_kJ > 0.0;
                const Utility* u = UtilityCatalogue::pickForDuty(
                                       heating, er.T_service_K, dTminUtil);
                if (!u)
                {
                    std::ostringstream why;
                    why << "unit '" << er.unit << "' " << er.kind << " ("
                        << (heating ? "heating" : "cooling") << " at "
                        << er.T_service_K << " K): no catalogue utility"
                        " adequate";
                    unserved.push_back(why.str());
                    continue;
                }
                auto& a = byUtil[u->name];
                a.E_kJ += std::abs(er.E_kJ);
                a.kg   += std::abs(er.E_kJ) * 1000.0 / u->dutyPerKg;
                a.eur  += std::abs(er.E_kJ) * 1.0e-6 * u->cost;   // kJ->GJ
            }
            scalar totalEur = 0.0;
            for (const auto& [nm, a] : byUtil)
            {
                uk["utility_" + nm + "_kJ"]  = a.E_kJ;
                uk["utility_" + nm + "_kg"]  = a.kg;
                uk["utility_" + nm + "_eur"] = a.eur;
                totalEur += a.eur;
            }
            if (!byUtil.empty()) uk["utility_cost_eur_total"] = totalEur;
            if (verbosity >= 2 && (!byUtil.empty() || !unserved.empty()))
            {
                std::cout << "[campaign] utilities (approach dTmin = "
                          << dTminUtil << " K; catalogue dutyPerKg is"
                          " phase-aware):\n";
                for (const auto& [nm, a] : byUtil)
                    std::cout << "    " << nm << ": " << a.E_kJ << " kJ, "
                              << a.kg << " kg, " << a.eur << " EUR\n";
                if (!byUtil.empty())
                    std::cout << "    TOTAL: " << totalEur << " EUR\n";
                for (const auto& m2 : unserved)
                    std::cout << "    UNSERVED: " << m2 << "\n";
            }
        }
        result.transfers = std::move(transfers);
        std::stable_sort(timeline.begin(), timeline.end(),
            [](const SimulationResult::TimelineEvent& a,
               const SimulationResult::TimelineEvent& b) { return a.t < b.t; });
        result.timeline = std::move(timeline);
        emitResultJson(std::cout, result);
        // A campaign leak reported non-converged must FAIL the process
        // (forum #99-P1: a LEAK line with exit 0 is not "going red").
        if (!result.converged) return 1;
    }

    return 0;
}
catch (const std::exception& e)
{
    std::cerr << "\nERROR: " << e.what() << "\n";
    return 2;
}
