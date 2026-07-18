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
    choupoCtrl

Description
    Dynamic continuous simulation binary (the third problem class,).  Equation form: dY/dt = f(Y, u, t) with control u(t)
    supplied by Controller objects that read measurements off the
    process and write back to manipulated variables.

    The time loop:

        for t in [startTime, endTime] step deltaT:
            for each controller:  controller.update(t, dt)
            for each unit:        unit.step(t, dt)
            if (t in writeInterval grid): emit snapshot

    Case dict layout:

        case/
        ├── system/
        │   ├── controlDict      verbosity + time settings
        │   └── flowsheetDict    units list + controllers list
        └── constant/
            ├── propertyDict     components + γ-φ models
            └── reactions        named-reaction library     [optional]

    Output: trajectory.csv with state variables of every unit plus the
    last CV / MV of every controller.

    Usage:  choupoCtrl [case_dir]
\*---------------------------------------------------------------------------*/

#include "control/Controller.H"
#include "control/signal/Signal.H"
#include "core/Banner.H"
#include "core/Dictionary.H"
#include "core/DisplayUnits.H"
#include "materials/MaterialRegistry.H"
#include "thermo/henrysLaw/HenrysLawRegistry.H"
#include "thermo/solution/SolutionRegistry.H"
#include "thermo/utility/UtilityCatalogue.H"
#include "thermo/Database.H"
#include "thermo/ThermoAnnounce.H"
#include "thermo/ThermoPackage.H"
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
#include "unitOperations/dynamic/DynamicUnitOperation.H"
#include "io/SolutionWriter.H"
#include "solver/ODE/AdaptiveTimeStep.H"
#include "core/ResultEmitter.H"

#include <algorithm>
#include <filesystem>
#include <fstream>
#include <iomanip>
#include <iostream>
#include <sstream>
#include <stdexcept>
#include <string>

using namespace Choupo;
namespace fs = std::filesystem;

// Seed each dynamic unit's initial holdup + inlet from the case's 0/ state --
// the SINGLE source of truth.  The inline initial{}/inlet{} blocks in
// flowsheetDict are RETIRED (no legacy): 0/internalState carries the holdup and
// 0/streams the inlet face, exactly as the engine writes them.  This translates
// them into the initial{}/inlet{} dicts each unit's initialise() already reads
// and injects them into the unit dict, so no unit code changes.  Must run with
// the CWD already at the case root (choupoCtrl chdir's before calling this).
static void seedDynamicUnitsFrom0(const std::vector<DictPtr>& unitList)
{
    DictPtr istate  = fs::exists("0/internalState")
                    ? Dictionary::fromFile("0/internalState") : nullptr;
    DictPtr sstreams = fs::exists("0/streams")
                    ? Dictionary::fromFile("0/streams") : nullptr;

    for (const auto& uDict : unitList)
    {
        const std::string uname = uDict->lookupWord("name");

        if (uDict->found("initial") || uDict->found("inlet"))
            throw std::runtime_error("choupoCtrl: unit '" + uname + "' carries an "
                "inline initial{}/inlet{} block -- RETIRED.  The initial holdup and"
                " inlet live in 0/internalState + 0/streams (bin/choupo-init0"
                " materialises them).  Delete the inline block from flowsheetDict.");

        if (!istate)
            throw std::runtime_error("choupoCtrl: no 0/internalState -- the dynamic"
                " initial state lives in 0/ (run bin/choupo-init0).");

        // --- holdup  ->  initial{ T P V totalMoles molarComposition } ---
        auto uHold = istate->subDict("units")->subDict(uname);
        const scalar T = uHold->lookupScalar("T");
        const scalar P = uHold->lookupScalarOrDefault("P", 1.0);
        const scalar V = uHold->lookupScalar("V");
        auto hold = uHold->subDict("holdupMolar");
        scalar nTot = 0.0;
        for (const auto& c : hold->keys()) nTot += hold->lookupScalar(c);
        std::ostringstream is;  is << std::setprecision(17);
        is << "T " << T << "; P " << P << "; V " << V << "; totalMoles " << nTot
           << "; molarComposition {";
        for (const auto& c : hold->keys())
            is << " " << c << " " << (nTot > 0.0 ? hold->lookupScalar(c) / nTot : 0.0) << ";";
        is << " }";
        uDict->insert("initial", Dictionary::fromString(is.str(), "initial"));

        // --- inlet face  ->  inlet{ F T molarComposition } ---
        if (sstreams && sstreams->found("streams"))
        {
            auto strm = sstreams->subDict("streams");
            for (const auto& sn : strm->keys())
            {
                auto face = strm->subDict(sn);
                if (face->lookupWordOrDefault("bc", "") != "inlet") continue;
                if (sn.rfind(uname + ".", 0) != 0) continue;   // this unit's face
                auto mf = face->subDict("molarFlows");
                scalar F = 0.0;
                for (const auto& c : mf->keys()) F += mf->lookupScalar(c);
                std::ostringstream in;  in << std::setprecision(17);
                in << "F " << F << "; T " << face->lookupScalar("T")
                   << "; molarComposition {";
                for (const auto& c : mf->keys())
                    in << " " << c << " " << (F > 0.0 ? mf->lookupScalar(c) / F : 0.0) << ";";
                in << " }";
                uDict->insert("inlet", Dictionary::fromString(in.str(), "inlet"));
                break;
            }
        }
    }
}

int main(int argc, char** argv)
try
{
    printBanner("  ctrl");

    VaporPressureModel::registerBuiltins();
    ActivityModel     ::registerBuiltins();
    electrolyte::AqueousActivity::registerBuiltins();   // aqueous per-ion gamma (Davies)
    PureFluidModel    ::registerBuiltins();   // pure-component absolute props (IF97)
    EquationOfState   ::registerBuiltins();
    TransportModel    ::registerBuiltins();
    SurfaceTensionModel::registerBuiltins();
    ThermalConductivityModel::registerBuiltins();
    DiffusivityModel      ::registerBuiltins();
    LiquidViscosityModel  ::registerBuiltins();
    LiquidConductivityModel ::registerBuiltins();
    LiquidDiffusivityModel::registerBuiltins();
    HeatCapacityModel ::registerBuiltins();
    Phase             ::registerBuiltins();
    HeatTransferCorrelation::registerBuiltins();
    DynamicUnitOperation::registerBuiltins();
    Signal            ::registerBuiltins();   // forcing-function vocabulary
    Controller        ::registerBuiltins();

    const std::string caseDir = (argc > 1) ? argv[1] : ".";
    if (!fs::exists(caseDir))
        throw std::runtime_error("Case directory does not exist: " + caseDir);

    // Database root resolution mirrors choupoBatch.
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

    auto controlDict   = Dictionary::fromFile("system/controlDict");
    auto flowsheetDict = Dictionary::fromFile("system/flowsheetDict");
    // ONE property-package file, TWO names: constant/thermoPhysPropDict (the
    // v2 contract, resolved FIRST -- 2026-07-17) or constant/propertyDict
    // (the v1 home).  Mirrors choupoSolve/choupoProps; translation + content
    // routing happen at the build site below, after verbosity gates the
    // announce chorus.
    if (!fs::exists("constant/thermoPhysPropDict")
        && fs::exists("constant/propertyDict"))
        throw std::runtime_error(
            "the v1 `constant/propertyDict` grammar is RETIRED (the 2026-07-18"
                " consolidation): this case still carries one.  Migrate it --"
                " bin/curate/migrate_thermoPhysProp.py (mechanical, golden-safe)"
                " -- then re-run.");
    const std::string pkgFile = "constant/thermoPhysPropDict";
    auto thermoDict    = Dictionary::fromFile(pkgFile);

    DictPtr reactionsDict;
    if (fs::exists("constant/reactions"))
        reactionsDict = Dictionary::fromFile("constant/reactions");

    DisplayUnits::instance().readFrom(controlDict);
    DisplayUnits::instance().readPrecision(controlDict);

    const int verbosity = static_cast<int>(controlDict->lookupScalarOrDefault("verbosity", 3));
    thermoAnnounceLevel() = verbosity;   // gate the load-phase thermo chorus too
    const std::string application =
        controlDict->lookupWordOrDefault("application", "choupoCtrl");
    const std::string description =
        controlDict->lookupWordOrDefault("description", "");

    const scalar startTime     = controlDict->lookupScalarOrDefault("startTime", 0.0);
    const scalar endTime       = controlDict->lookupScalar("endTime");
    const scalar deltaT        = controlDict->lookupScalar("deltaT");
    const scalar writeInterval =
        controlDict->lookupScalarOrDefault("writeInterval", deltaT);

    // ---- timeStepping: OPT-IN adaptive plant integration --------------
    //  ABSENT or `fixed` => today's fixed-RK4 deltaT loop, BYTE-IDENTICAL.
    //  `adaptive` => the controller STILL fires on the fixed deltaT sample
    //  grid (digital control --- the sampler must NOT adapt), but BETWEEN
    //  samples the plant ODE is advanced by the stiff Rosenbrock23 integrator
    //  with the step set by LOCAL ERROR (rtol/atol), the MV held constant.
    //  The two Δt are different and BOTH correct: deltaT is the sample time;
    //  deltaT0..deltaTmax is the integrator's adaptive plant step.
    const std::string timeStepping =
        controlDict->lookupWordOrDefault("timeStepping", "fixed");
    const bool adaptive = (timeStepping == "adaptive");
    solver::AdaptiveSettings adaptSet;
    if (adaptive)
    {
        DictPtr ts = controlDict->found("timeSteppingControl")
            ? controlDict->subDict("timeSteppingControl") : controlDict;
        adaptSet.rtol      = ts->lookupScalarOrDefault("rtol",      1.0e-6);
        adaptSet.atol      = ts->lookupScalarOrDefault("atol",      1.0e-9);
        adaptSet.deltaT0   = ts->lookupScalarOrDefault("deltaT0",   deltaT);
        adaptSet.deltaTmax = ts->lookupScalarOrDefault("deltaTmax", deltaT);
        adaptSet.maxGrowth = ts->lookupScalarOrDefault("maxGrowth", 4.0);
        adaptSet.verbosity = verbosity;
    }

    std::cout << "Application:       " << application << "\n";
    if (!description.empty())
        std::cout << "Description:       " << description << "\n";
    std::cout << "Verbosity:         " << verbosity      << "\n"
              << "startTime:         " << startTime      << " s\n"
              << "endTime:           " << endTime        << " s\n"
              << "deltaT:            " << deltaT         << " s"
              << (adaptive ? "   (controller SAMPLE time --- held fixed)" : "")
              << "\n"
              << "writeInterval:     " << writeInterval  << " s\n"
              << "timeStepping:      " << timeStepping
              << (adaptive ? "  (Rosenbrock23 between samples, MV held)"
                           : "  (fixed RK4)")
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
    //  directory holding each unit's holdup internalState + outlet stream.
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

    // v2 contract (thermophysicalPropertySystem): the BUILDER owns the
    // dispatch (native buildV2 for the formulations it serves; the
    // translateV2 scaffold for the rest) -- the main never decides to
    // translate.  Routed by content, exactly like choupoSolve: manifest
    // (components + propertyMethods) -> builder; flat form -> legacy reader.
    ThermoPackage thermo;
    if (thermoDict->lookupWordOrDefault("recordType", "")
        == "thermophysicalPropertySystem")
    {
        if (ThermoPackageBuilder::v2NativeFormulation(thermoDict))
            thermo = ThermoPackageBuilder::build(thermoDict, db);   // native
        else
        {
            thermoDict = ThermoPackageBuilder::translateV2(thermoDict);
            if (thermoDict->found("components")
                && thermoDict->found("propertyMethods"))
                thermo = ThermoPackageBuilder::build(thermoDict, db);
            else
                thermo.readFromDict(thermoDict, db);
        }
    }
    else if (thermoDict->found("components")
             && thermoDict->found("propertyMethods"))
        thermo = ThermoPackageBuilder::build(thermoDict, db);
    else
        thermo.readFromDict(thermoDict, db);

    // ---- Build dynamic units -----------------------------------------
    auto unitList = flowsheetDict->lookupDictList("units");
    if (unitList.empty())
        throw std::runtime_error("choupoCtrl: flowsheetDict has no units");

    std::vector<std::unique_ptr<DynamicUnitOperation>> units;
    std::vector<std::string>                            unitNames;
    units.reserve(unitList.size());
    unitNames.reserve(unitList.size());

    // Seed initial holdup + inlet from 0/ (single source of truth; inline
    // initial{}/inlet{} is retired) BEFORE each unit initialises itself.
    seedDynamicUnitsFrom0(unitList);

    for (const auto& uDict : unitList)
    {
        const std::string uname = uDict->lookupWord("name");
        const std::string utype = uDict->lookupWord("type");
        auto u = DynamicUnitOperation::New(utype);
        u->setName(uname);
        u->initialise(uDict, thermo, reactionsDict);
        unitNames.push_back(uname);
        units.push_back(std::move(u));
    }

    auto findUnit = [&](const std::string& nm) -> DynamicUnitOperation*
    {
        for (std::size_t i = 0; i < units.size(); ++i)
            if (unitNames[i] == nm) return units[i].get();
        return nullptr;
    };

    std::cout << "Units in process:";
    for (const auto& n : unitNames) std::cout << "  " << n;
    std::cout << "\n";

    // ---- Build controllers -------------------------------------------
    std::vector<std::unique_ptr<Controller>> controllers;
    std::vector<std::string>                  ctrlNames;
    if (flowsheetDict->found("controllers"))
    {
        auto ctrlList = flowsheetDict->lookupDictList("controllers");
        controllers.reserve(ctrlList.size());
        ctrlNames.reserve(ctrlList.size());
        for (const auto& cDict : ctrlList)
        {
            const std::string cname = cDict->lookupWord("name");
            const std::string ctype = cDict->lookupWord("type");
            auto c = Controller::New(ctype);
            c->setName(cname);
            c->initialise(cDict, findUnit);
            ctrlNames.push_back(cname);
            controllers.push_back(std::move(c));
        }
    }

    if (!controllers.empty())
    {
        std::cout << "Controllers:    ";
        for (const auto& n : ctrlNames) std::cout << "  " << n;
        std::cout << "\n";
    }
    std::cout << "\n";

    // ---- solutionControl writer (opt-in) -----------------------------
    //  The instant directory IS the real physical time (seconds).  Each unit
    //  contributes its HOLDUP internalState + an instantaneous outlet face.
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

    // ---- Trajectory CSV header --------------------------------------
    std::ofstream csv("trajectory.csv");
    if (!csv)
        throw std::runtime_error("choupoCtrl: cannot open trajectory.csv");
    csv << "t";
    for (const auto& u : units)
        for (const auto& lbl : u->stateLabels())
            csv << "," << u->name() << "." << lbl;
    for (const auto& c : controllers)
        csv << "," << c->name() << ".SP,"
            << c->name() << ".PV,"
            << c->name() << ".MV";
    csv << "\n";

    auto writeSnapshot = [&](scalar t)
    {
        csv << std::scientific << std::setprecision(8) << t;
        for (const auto& u : units)
            for (auto v : u->stateVector())
                csv << "," << v;
        for (const auto& c : controllers)
            csv << "," << c->setpoint()
                << "," << c->lastCV()
                << "," << c->lastMV();
        csv << "\n";

        // OpenFOAM-style real-time instant: each unit's HOLDUP state at t.
        // The state vector is labelled (n_<comp>... , T, ...); n_<comp> entries
        // map to the holdup inventory, T to temperature, the rest to extras.
        // The unit's instantaneous outletStream() is the outlet face.
        //
        // The `0/` directory is the AUTHORED initial state (the single source of
        // truth the seed reads back) -- the writer NEVER overwrites it.  Physical
        // transient snapshots are 0.01/ 50/ 100/ ... (t > 0 only).
        if (solWriter && std::abs(t) > 1.0e-9)
        {
            std::vector<DynamicUnitSnapshot> snaps;
            snaps.reserve(units.size());
            for (const auto& u : units)
            {
                const auto labels = u->stateLabels();
                const auto vals   = u->stateVector();
                DynamicUnitSnapshot snap;
                snap.name = u->name();
                snap.type = u->type();
                snap.moles.assign(thermo.n(), 0.0);
                for (std::size_t i = 0; i < labels.size() && i < vals.size(); ++i)
                {
                    const std::string& lbl = labels[i];
                    if (lbl == "T") { snap.T = vals[i]; continue; }
                    if (lbl.rfind("n_", 0) == 0)
                    {
                        const std::size_t ci = thermo.indexOf(lbl.substr(2));
                        if (ci < snap.moles.size()) { snap.moles[ci] = vals[i]; continue; }
                    }
                    // Anything else (a controller MV mirror, a level, ...) is a
                    // verbatim extra so the instant captures the FULL state.
                    snap.extras.emplace_back(lbl, vals[i]);
                }
                // Instantaneous outlet face (continuous unit): F/T/P/z.  The
                // dict parser already converted `P ... bar;` to canonical SI
                // (Pa) at load, so outletStream().P is in Pa --- no rescale.
                const ContinuousStream out = u->outletStream();
                snap.P         = out.P;
                snap.hasOutlet = true;
                snap.outF      = out.F;
                snap.outT      = out.T;
                snap.outP      = out.P;
                snap.outZ.assign(out.z.begin(), out.z.end());

                // Instantaneous FEED face (symmetric): F_in/T_in/P/z_in.  When
                // the unit exposes one, the live overlay shows BOTH faces and
                // the student SEES accumulation (in flux != out flux).
                if (u->hasInlet())
                {
                    const ContinuousStream in = u->inletStream();
                    snap.hasInlet = true;
                    snap.inF      = in.F;
                    snap.inT      = in.T;
                    snap.inP      = in.P;
                    snap.inZ.assign(in.z.begin(), in.z.end());
                }

                // Jacket coolant temperature as a per-unit extra (where the
                // unit exposes it as a CV) --- so the instant's internalState
                // records the jacket the controller is driving.
                {
                    const auto cvs = u->availableCVs();
                    if (std::find(cvs.begin(), cvs.end(), std::string("T_jacket"))
                            != cvs.end())
                        snap.extras.emplace_back("T_jacket", u->getCV("T_jacket"));
                }

                snaps.push_back(std::move(snap));
            }
            solWriter->writeDynamicInstant(t, "ctrl", snaps);
        }
    };

    // ---- Time loop ---------------------------------------------------
    std::cout << (adaptive
                    ? "Time integration  (adaptive Rosenbrock23 between samples, "
                      "sample dt = "
                    : "Time integration  (RK4 inside units, dt = ")
              << deltaT << " s):\n";
    if (verbosity >= 3)
    {
        std::cout << "      t [s]    ";
        for (const auto& u : units)
            for (const auto& lbl : u->stateLabels())
                std::cout << std::setw(14) << (u->name() + "." + lbl);
        for (const auto& c : controllers)
            std::cout << std::setw(14) << (c->name() + ".PV")
                      << std::setw(14) << (c->name() + ".MV");
        std::cout << "\n";
    }

    auto echoLine = [&](scalar t)
    {
        std::cout << "  " << std::setw(9) << std::fixed << std::setprecision(2) << t << "  ";
        for (const auto& u : units)
            for (auto v : u->stateVector())
                std::cout << std::setw(14) << std::scientific << std::setprecision(5) << v;
        for (const auto& c : controllers)
            std::cout << std::setw(14) << std::scientific << std::setprecision(5) << c->lastCV()
                      << std::setw(14) << std::scientific << std::setprecision(5) << c->lastMV();
        std::cout << "\n";
    };

    scalar t         = startTime;
    scalar nextWrite = startTime;
    writeSnapshot(t);
    if (verbosity >= 3) echoLine(t);
    nextWrite += writeInterval;

    if (!adaptive)
    {
        // ---- FIXED-STEP RK4 (today's path --- byte-identical) ---------
        while (t < endTime - 1.0e-12)
        {
            scalar dt = deltaT;
            if (t + dt > endTime) dt = endTime - t;

            // Update controllers FIRST so the unit step sees the new MV.
            // (Causality choice: MV at time t acts on dY/dt in [t, t+dt].)
            for (auto& c : controllers) c->update(t, dt);

            // Advance each unit by dt with the current MV held constant
            // across the RK4 stages (zero-order hold).  Acceptable for
            // typical dt much smaller than the closed-loop time constant.
            for (auto& u : units) u->step(t, dt);

            t += dt;

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
        // ---- ADAPTIVE plant integration between FIXED controller samples ----
        //  THE CONTROL SUBTLETY: a digital controller samples at the FIXED
        //  deltaT grid --- it must NOT adapt with the integrator.  So the
        //  controller fires once per sample interval [t_s, t_s+deltaT]; with
        //  the MV then HELD, the adaptive Rosenbrock23 integrator sub-steps
        //  the plant ODE across that interval.  Writes land on the (possibly
        //  finer or coarser) writeInterval grid WITHOUT re-firing the
        //  controller --- the integrator is just clamped to each write time.
        solver::AdaptiveTimeStepper stepper(adaptSet);

        bool printedHeader = false;
        auto onStep = [&](scalar tEnd, scalar hTaken)
        {
            if (verbosity < 3) return;
            if (!printedHeader)
            {
                std::cout << "    [adaptive plant step history]   t [s]"
                          << "        h [s]\n";
                printedHeader = true;
            }
            std::cout << "                                  "
                      << std::setw(11) << std::scientific << std::setprecision(4) << tEnd
                      << "  " << std::setw(11) << hTaken << "\n";
        };

        scalar nextSample = startTime;     // controller fires on this grid
        while (t < endTime - 1.0e-12)
        {
            // Fire the controllers exactly at each sample instant (held MV).
            if (t >= nextSample - 1.0e-9)
            {
                scalar sampleDt = std::min(deltaT, endTime - t);
                for (auto& c : controllers) c->update(t, sampleDt);
                nextSample += deltaT;
            }

            // Advance the plant to the next clean boundary: the earliest of
            // the next controller sample, the next write, and endTime.  The
            // MV is held across this whole sub-interval.
            scalar tNext = std::min({ nextSample, nextWrite, endTime });
            if (tNext <= t + 1.0e-12)
                tNext = std::min(t + deltaT, endTime);

            std::vector<solver::OdeUnit> odeUnits;
            for (auto& u : units)
            {
                if (u->hasOdeForm())
                {
                    DynamicUnitOperation* up = u.get();
                    odeUnits.push_back({
                        [up]               { return up->odeState(); },
                        [up](const sVector& y){ up->setOdeState(y); },
                        [up](const sVector& y){ return up->odeDerivative(y); },
                        up->odeNPositive() });
                }
                else
                    u->step(t, tNext - t);   // non-ODE unit: one fixed step
            }
            if (!odeUnits.empty())
                stepper.advance(odeUnits, t, tNext, onStep);

            t = tNext;

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

    // ---- Final summary ----------------------------------------------
    std::cout << "\n=========================  Final state at t = " << t << " s  ===\n";
    for (const auto& u : units)
    {
        const auto labels = u->stateLabels();
        const auto vals   = u->stateVector();
        std::cout << "  Unit: " << u->name() << "  (" << u->type() << ")\n";
        for (std::size_t i = 0; i < labels.size(); ++i)
            std::cout << "    " << std::left << std::setw(20) << labels[i]
                      << std::right << std::scientific << std::setprecision(6)
                      << vals[i] << "\n";
    }
    for (const auto& c : controllers)
    {
        std::cout << "  Controller: " << c->name() << "  (" << c->type() << ")\n"
                  << "    SP = " << std::fixed << std::setprecision(4) << c->setpoint()
                  << "    PV = " << c->lastCV()
                  << "    MV = " << c->lastMV() << "\n";
    }
    std::cout << "==================================================\n";

    // ---- Golden-master emission (same rationale as choupoBatch): the final
    //  state + each controller's terminal SP/PV/MV become pinned KPIs.
    {
        SimulationResult result;
        result.converged = true;
        for (const auto& u : units)
        {
            auto& k = result.kpis[u->name()];
            k["t_end"] = t;
            const auto labels = u->stateLabels();
            const auto vals   = u->stateVector();
            for (std::size_t i = 0; i < labels.size(); ++i)
                k[labels[i] + "_final"] = vals[i];
        }
        for (const auto& c : controllers)
        {
            auto& k = result.kpis[c->name()];
            k["SP_final"] = c->setpoint();
            k["PV_final"] = c->lastCV();
            k["MV_final"] = c->lastMV();
        }
        emitResultJson(std::cout, result);
    }

    return 0;
}
catch (const std::exception& e)
{
    std::cerr << "\nERROR: " << e.what() << "\n";
    return 2;
}
