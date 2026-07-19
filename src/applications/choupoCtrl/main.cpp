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
            ├── thermoPhysPropDict   the thermophysical system
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
#include "unitOperations/dynamic/DynamicUnitOperation.H"
#include "thermo/ElementComposition.H"
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
// flowsheetDict do not exist: 0/internalState carries the holdup and
// 0/streamFaces the inlet face, exactly as the engine writes them.  This translates
// them into the initial{}/inlet{} dicts each unit's initialise() already reads
// and injects them into the unit dict, so no unit code changes.  Must run with
// the CWD already at the case root (choupoCtrl chdir's before calling this).
static void seedDynamicUnitsFrom0(const std::vector<DictPtr>& unitList)
{
    DictPtr istate  = fs::exists("0/internalState")
                    ? Dictionary::fromFile("0/internalState") : nullptr;
    DictPtr sstreams = fs::exists("0/streamFaces")
                    ? Dictionary::fromFile("0/streamFaces") : nullptr;

    for (const auto& uDict : unitList)
    {
        const std::string uname = uDict->lookupWord("name");

        if (uDict->found("initial") || uDict->found("inlet"))
            throw std::runtime_error("choupoCtrl: unit '" + uname + "' carries an "
                "inline initial{}/inlet{} block -- the initial holdup and"
                " inlet live in 0/internalState + 0/streamFaces (bin/choupo-init0"
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
        if (sstreams && sstreams->found("faces"))
        {
            auto strm = sstreams->subDict("faces");
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
    // The case system lives in constant/thermoPhysPropDict.
    if (!fs::exists("constant/thermoPhysPropDict")
        && fs::exists("constant/propertyDict"))
        throw std::runtime_error(
            "this case carries a constant/propertyDict -- the case grammar is"
                " constant/thermoPhysPropDict (bin/curate/migrate_thermoPhysProp.py"
                " converts old cases).");
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

    // ---- Build dynamic units -----------------------------------------
    auto unitList = flowsheetDict->lookupDictList("units");
    if (unitList.empty())
        throw std::runtime_error("choupoCtrl: flowsheetDict has no units");

    std::vector<std::unique_ptr<DynamicUnitOperation>> units;
    std::vector<std::string>                            unitNames;
    units.reserve(unitList.size());
    unitNames.reserve(unitList.size());

    // Seed initial holdup + inlet from 0/ (single source of truth; inline
    // initial{}/inlet{} does not exist) BEFORE each unit initialises itself.
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

    // ---- Balance ledger (material + elements; energy claims honestly) ----
    //  Integrated IN the time loop on ACCEPTED states: fixed-step samples the
    //  post-controller rate on the left and the stepped state on the right of
    //  every dt; adaptive accepts through the state-aware integrator hook.
    //  Availability is a claim: any unit whose snapshot refuses, or a mixed
    //  ODE/non-ODE adaptive interval, withholds the WHOLE ledger naming why.
    struct CtrlBalanceLedger
    {
        bool                     available = true;
        std::string              reason;
        std::vector<std::string> comps;
        sVector N0, Ncur;                 // inventory kmol
        sVector cumIn, cumOut;            // kmol
        sVector prevIn, prevOut;          // kmol/s at the previous sample
        scalar  prevT = 0.0;
        bool    havePrev = false;
        std::string energyReason;         // first refusing energy claim
        std::ofstream csv;

        void refuse(const std::string& why)
        { if (available) { available = false; reason = why; } }
    };
    CtrlBalanceLedger ledger;
    ledger.csv.open("balanceTrajectory.csv");
    // Element columns are decided AT INIT: if every loaded formula parses,
    // the trajectory carries per-element series; otherwise the elemental
    // claim is withheld (named in the metadata sidecar, never a zero).
    std::vector<std::string> ledgerElems;      // wide-format element columns
    std::vector<std::map<std::string, scalar>> compAtoms;  // per component
    bool ledgerElemsAvailable = true;
    bool ledgerElemsPartial = false;
    std::string ledgerElemsReason;
    std::vector<ElementalResolution> ledgerElemRes;
    std::vector<char> ledgerElemRelevant;
    // Promote the elemental state for a component that has become part of
    // the accounted set (at init, or at the first accepted snapshot where
    // it carries inventory/flow).  The FINAL meta rewrite carries the
    // promoted truth; the GUI's metadata sovereignty keeps contradictory
    // columns undrawn.
    std::function<void(std::size_t)> markElemRelevant =
        [&](std::size_t i)
    {
        if (i >= ledgerElemRelevant.size() || ledgerElemRelevant[i]) return;
        ledgerElemRelevant[i] = 1;
        const auto& er = ledgerElemRes[i];
        if (er.completeness
            == ElementalResolution::Completeness::unavailable)
        {
            ledgerElemsAvailable = false;
            if (!ledgerElemsReason.empty()) ledgerElemsReason += "; ";
            ledgerElemsReason += ledger.comps[i] + " (" + er.reason + ")";
        }
        else if (er.completeness
                 == ElementalResolution::Completeness::partial)
        {
            ledgerElemsPartial = true;
            if (!ledgerElemsReason.empty()) ledgerElemsReason += "; ";
            ledgerElemsReason += ledger.comps[i] + " (PARTIAL, unaccounted "
                + std::to_string(er.unaccountedMassFraction) + " kg/kg)";
        }
    };
    auto gatherRates = [&](sVector& in, sVector& out, sVector& inv) -> bool
    {
        in.assign(ledger.comps.size(), 0.0);
        out.assign(ledger.comps.size(), 0.0);
        inv.assign(ledger.comps.size(), 0.0);
        for (const auto& u : units)
        {
            const auto bs = u->balanceSnapshot();
            if (!bs.materialAvailable)
            { ledger.refuse(u->name() + ": " + bs.materialReason); return false; }
            if (bs.componentNames != ledger.comps)
            { ledger.refuse(u->name() + ": component set differs from the"
                            " ledger's -- no common basis"); return false; }
            if (bs.inventory.size() != ledger.comps.size())
            { ledger.refuse(u->name() + ": inventory dimension "
                            + std::to_string(bs.inventory.size())
                            + " != component set "
                            + std::to_string(ledger.comps.size()));
              return false; }
            for (auto v : bs.inventory)
                if (!std::isfinite(v))
                { ledger.refuse(u->name() + ": non-finite inventory");
                  return false; }
            for (std::size_t i = 0; i < inv.size(); ++i)
                inv[i] += bs.inventory[i];
            for (const auto& fc : bs.faces)
            {
                if (fc.role == BalanceFace::Role::internal_) continue;
                if (fc.molarFlows.size() != ledger.comps.size())
                { ledger.refuse(u->name() + ": face '" + fc.id
                                + "' dimension "
                                + std::to_string(fc.molarFlows.size())
                                + " != component set");
                  return false; }
                for (auto v : fc.molarFlows)
                    if (!std::isfinite(v))
                    { ledger.refuse(u->name() + ": non-finite flow on face '"
                                    + fc.id + "'");
                      return false; }
                auto& acc = (fc.direction == BalanceFace::Direction::in)
                            ? in : out;
                for (std::size_t i = 0; i < acc.size(); ++i)
                    acc[i] += fc.molarFlows[i];
            }
            if (!bs.physicalEnergyAvailable && ledger.energyReason.empty())
                ledger.energyReason = u->name() + ": " + bs.energyReason;
        }
        return true;
    };
    // Left sample: (re)base the trapezoid AT the current state -- called
    // after every controller fire so no area ever spans an MV discontinuity.
    auto ledgerRebase = [&](scalar tNow)
    {
        if (!ledger.available) return;
        sVector in, out, inv;
        if (!gatherRates(in, out, inv)) return;
        ledger.prevIn = std::move(in);
        ledger.prevOut = std::move(out);
        ledger.prevT = tNow;
        ledger.havePrev = true;
    };
    // Accepted step: trapezoid from the previous sample to the ACCEPTED
    // state at tNow, then advance the base.
    auto ledgerAccept = [&](scalar tNow)
    {
        if (!ledger.available || !ledger.havePrev) return;
        sVector in, out, inv;
        if (!gatherRates(in, out, inv)) return;
        const scalar dt2 = tNow - ledger.prevT;
        if (dt2 > 0.0)
        {
            for (std::size_t i = 0; i < ledger.comps.size(); ++i)
            {
                ledger.cumIn[i]  += 0.5 * (ledger.prevIn[i]  + in[i])  * dt2;
                ledger.cumOut[i] += 0.5 * (ledger.prevOut[i] + out[i]) * dt2;
            }
        }
        // Promotion: a component entering the accounted set at t > 0
        // (inventory or boundary flow becomes nonzero) promotes its
        // elemental state from this accepted snapshot on.
        for (std::size_t i = 0; i < ledger.comps.size(); ++i)
            if (!ledgerElemRelevant.empty() && !ledgerElemRelevant[i]
                && (inv[i] != 0.0 || in[i] != 0.0 || out[i] != 0.0))
                markElemRelevant(i);
        ledger.prevIn = std::move(in);
        ledger.prevOut = std::move(out);
        ledger.prevT = tNow;
        ledger.Ncur = inv;
        if (ledger.csv.is_open())
        {
            // MASS and ELEMENTS are the conservation laws; total moles are
            // not (a reaction changes them without violating either).
            scalar mInv = 0, mIn = 0, mOut = 0;
            for (std::size_t i = 0; i < ledger.comps.size(); ++i)
            {
                const scalar MW = thermo.comp(i).MW();
                mInv += inv[i] * MW;
                mIn  += ledger.cumIn[i] * MW;
                mOut += ledger.cumOut[i] * MW;
            }
            scalar m0 = 0;
            for (std::size_t i = 0; i < ledger.comps.size(); ++i)
                m0 += ledger.N0[i] * thermo.comp(i).MW();
            ledger.csv << std::scientific << std::setprecision(9)
                       << tNow << "," << mInv << "," << mIn << ","
                       << mOut << ","
                       << ((mInv - m0) - (mIn - mOut));
            for (const auto& e : ledgerElems)
            {
                scalar aInv = 0, a0 = 0, aIn = 0, aOut = 0;
                for (std::size_t i = 0; i < ledger.comps.size(); ++i)
                {
                    auto it2 = compAtoms[i].find(e);
                    if (it2 == compAtoms[i].end()) continue;
                    const scalar na = it2->second;
                    aInv += na * inv[i];
                    a0   += na * ledger.N0[i];
                    aIn  += na * ledger.cumIn[i];
                    aOut += na * ledger.cumOut[i];
                }
                ledger.csv << "," << aInv << ","
                           << ((aInv - a0) - (aIn - aOut));
            }
            ledger.csv << "\n";
        }
    };
    {
        // Initialise from the units' first snapshots.
        bool first = true;
        for (const auto& u : units)
        {
            const auto bs = u->balanceSnapshot();
            if (!bs.materialAvailable)
            { ledger.refuse(u->name() + ": " + bs.materialReason); break; }
            if (first) { ledger.comps = bs.componentNames; first = false; }
        }
        if (ledger.available && !ledger.comps.empty())
        {
            ledger.N0.assign(ledger.comps.size(), 0.0);
            ledger.cumIn.assign(ledger.comps.size(), 0.0);
            ledger.cumOut.assign(ledger.comps.size(), 0.0);
            sVector in, out, inv;
            if (gatherRates(in, out, inv)) ledger.N0 = inv;
            ledger.Ncur = ledger.N0;
            // Parse every formula ONCE: the element columns exist only when
            // the whole component set decomposes.
            compAtoms.resize(ledger.comps.size());
            std::set<std::string> symbols;
            // The elemental claim is a property of the ACCOUNTED set: a
            //  component whose inventory and faces are zero cannot withdraw
            //  or dilute the seal.  Relevance is decided from the INITIAL
            //  snapshot here; a component that ENTERS later promotes the
            //  state at its first accepted snapshot (never eternal absence).
            ledgerElemRes.resize(ledger.comps.size());
            ledgerElemRelevant.assign(ledger.comps.size(), false);
            for (std::size_t i = 0; i < ledger.comps.size(); ++i)
            {
                ledgerElemRes[i] = elementalCompositionOf(thermo.comp(i));
                const bool relevant = ledger.N0[i] != 0.0
                    || in[i] != 0.0 || out[i] != 0.0;
                if (relevant) markElemRelevant(i);
                if (ledgerElemRes[i].completeness
                    != ElementalResolution::Completeness::unavailable)
                {
                    compAtoms[i] = ledgerElemRes[i].atoms;
                    for (const auto& [sym, na] : ledgerElemRes[i].atoms)
                    { (void) na; symbols.insert(sym); }
                }
            }
            if (ledgerElemsAvailable)
                ledgerElems.assign(symbols.begin(), symbols.end());
            if (ledger.csv.is_open())
            {
                ledger.csv << "t,mass_inventory_kg,mass_in_cum_kg,"
                              "mass_out_cum_kg,mass_residual_kg";
                for (const auto& e : ledgerElems)
                    ledger.csv << ",elem_" << e << "_inventory_kmolatom"
                               << ",elem_" << e << "_residual_kmolatom";
                ledger.csv << "\n";
            }
        }
    }
    // ONE metadata emission -- written at init and REWRITTEN at the end from
    // the ledger's FINAL state, so a mid-run refusal (dimension, NaN, mixed
    // stepping) can never leave a sidecar claiming what the KPIs withdrew.
    auto writeLedgerMeta = [&]()
    {
        std::ofstream meta("balanceTrajectory.meta");
        meta << "key,value\n"
             << "material_available," << (ledger.available ? 1 : 0)
             << "\n";
        if (!ledger.available)
            meta << "material_reason,\"" << ledger.reason << "\"\n"
                 << "trajectory_partial,1\n";
        meta << "elements_available,"
             << ((ledger.available && ledgerElemsAvailable) ? 1 : 0)
             << "\n"
             << "elements_partial,"
             << ((ledger.available && ledgerElemsAvailable
                  && ledgerElemsPartial) ? 1 : 0)
             << "\n";
        if (!ledgerElemsAvailable || ledgerElemsPartial)
            meta << "elements_reason,\"" << ledgerElemsReason << "\"\n";
        meta << "energy_available,0\n"
             << "energy_reason,\""
             << (ledger.energyReason.empty()
                 ? std::string("no dynamic units expose an energy"
                               " functional")
                 : ledger.energyReason) << "\"\n";
    };
    writeLedgerMeta();
    // The t = startTime row: inventory at the initial state, zero
    // accumulations and zero residual -- the plot starts at the start.
    if (ledger.available && ledger.csv.is_open() && !ledger.comps.empty())
    {
        scalar m0 = 0;
        for (std::size_t i = 0; i < ledger.comps.size(); ++i)
            m0 += ledger.N0[i] * thermo.comp(i).MW();
        ledger.csv << std::scientific << std::setprecision(9)
                   << startTime << "," << m0 << ",0,0,0";
        for (const auto& e : ledgerElems)
        {
            scalar a0 = 0;
            for (std::size_t i = 0; i < ledger.comps.size(); ++i)
            {
                auto it2 = compAtoms[i].find(e);
                if (it2 != compAtoms[i].end())
                    a0 += it2->second * ledger.N0[i];
            }
            ledger.csv << "," << a0 << ",0";
        }
        ledger.csv << "\n";
    }

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

            // Ledger LEFT sample AFTER the controller fired: no trapezoid
            // area ever crosses an MV discontinuity with the old rate.
            ledgerRebase(t);

            // Advance each unit by dt with the current MV held constant
            // across the RK4 stages (zero-order hold).  Acceptable for
            // typical dt much smaller than the closed-loop time constant.
            for (auto& u : units) u->step(t, dt);

            t += dt;
            ledgerAccept(t);

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

            // Ledger LEFT sample BEFORE any unit advances (post-controller,
            // pre-step): a snapshot taken after a step is not a left edge.
            ledgerRebase(t);

            std::vector<solver::OdeUnit> odeUnits;
            bool anyNonOde = false;
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
                {
                    anyNonOde = true;
                    u->step(t, tNext - t);   // non-ODE unit: one fixed step
                }
            }
            if (anyNonOde && !odeUnits.empty())
                // No common accepted-step grid exists across the two kinds:
                // the global ledger refuses rather than fabricate a closure.
                ledger.refuse("mixed ODE and non-ODE units under adaptive"
                              " stepping: no common accepted-step grid");
            if (!odeUnits.empty())
                stepper.advance(odeUnits, t, tNext, onStep,
                    [&](scalar tEnd, scalar /*hTaken*/)
                    { ledgerAccept(tEnd); });
            else
                ledgerAccept(tNext);

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

        // ---- Balance-ledger KPIs (engine-owned; the GUI only draws) -----
        writeLedgerMeta();   // FINAL state: a mid-run refusal reaches the sidecar
        {
            auto& bk = result.kpis["balance"];
            bk["material_available"] = ledger.available ? 1.0 : 0.0;
            bk["energy_balance_available"] = 0.0;   // honest: see energyReason
            if (!ledger.available)
            {
                std::cout << "\n[balance] ledger UNAVAILABLE -- "
                          << ledger.reason << "\n";
            }
            else
            {
                scalar m0 = 0, mF = 0, mIn = 0, mOut = 0;
                for (std::size_t i = 0; i < ledger.comps.size(); ++i)
                {
                    const scalar MW = thermo.comp(i).MW();
                    m0  += ledger.N0[i]     * MW;
                    mF  += ledger.Ncur[i]   * MW;
                    mIn += ledger.cumIn[i]  * MW;
                    mOut+= ledger.cumOut[i] * MW;
                }
                const scalar residual = (mF - m0) - (mIn - mOut);
                const scalar scale = std::max({ std::abs(m0), std::abs(mF),
                                                mIn, mOut, 1.0e-30 });
                bk["mass_kg_initial"]   = m0;
                bk["mass_kg_final"]     = mF;
                bk["mass_kg_in_cum"]    = mIn;
                bk["mass_kg_out_cum"]   = mOut;
                bk["mass_residual_kg"]  = residual;
                bk["mass_closure_rel"]  = std::abs(residual) / scale;
                std::cout << "\n[balance] material: M(t)-M(0) = "
                          << std::scientific << std::setprecision(4)
                          << (mF - m0) << " kg vs integral(in-out) = "
                          << (mIn - mOut) << " kg, closure "
                          << bk["mass_closure_rel"] << "\n";

                // Elements: the SAME resolver truth the ledger promoted --
                // compAtoms (resolver atoms) + the relevance-gated
                // availability/partial flags, so the JSON, the log and the
                // .meta can never diverge (a declared-block component is
                // available; a formula-vs-block DISAGREE stays refused).
                if (!ledgerElemsAvailable)
                {
                    std::cout << "[balance] elemental UNAVAILABLE -- "
                              << ledgerElemsReason << "\n";
                }
                else
                {
                    std::map<std::string, scalar> e0, eF, eIn, eOut;
                    for (std::size_t i = 0; i < ledger.comps.size(); ++i)
                    {
                        const scalar present = ledger.N0[i] + ledger.Ncur[i]
                            + ledger.cumIn[i] + ledger.cumOut[i];
                        if (present == 0.0) continue;
                        for (const auto& [sym, na] : compAtoms[i])
                        {
                            e0[sym]  += na * ledger.N0[i];
                            eF[sym]  += na * ledger.Ncur[i];
                            eIn[sym] += na * ledger.cumIn[i];
                            eOut[sym]+= na * ledger.cumOut[i];
                        }
                    }
                    scalar worst = 0.0;
                    for (const auto& [sym, a0] : e0)
                    {
                        const scalar r = std::abs((eF[sym] - a0)
                                        - (eIn[sym] - eOut[sym]))
                            / std::max({ std::abs(a0), std::abs(eF[sym]),
                                         eIn[sym], eOut[sym], 1.0e-30 });
                        bk["element_" + sym + "_closure_rel"] = r;
                        worst = std::max(worst, r);
                    }
                    bk["element_worst_closure_rel"] = worst;
                    if (ledgerElemsPartial)
                        bk["element_balance_partial"] = 1.0;
                    std::cout << "[balance] elements: worst closure "
                              << std::scientific << worst
                              << (ledgerElemsPartial
                                  ? "  (PARTIAL -- " + ledgerElemsReason + ")"
                                  : std::string()) << "\n";
                }
                std::cout << "[balance] energy: UNAVAILABLE -- "
                          << (ledger.energyReason.empty()
                              ? std::string("no dynamic units expose an"
                                            " energy functional")
                              : ledger.energyReason) << "\n";
            }
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
