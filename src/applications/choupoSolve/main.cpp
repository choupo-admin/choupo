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
    choupoSolve

Description
    Three-layer simulator driver:

        case/
          system/
            controlDict    -- meta-control (verbosity)
            flowsheetDict  -- topology: streams + units + connections
            solverDict     -- per-unit-op solver options              [opt]
            outerDict      -- outer driver (sweep / optim / fit / PE)  [opt]
            postDict       -- post-processing chain (sizing, costing)  [opt]
          constant/
            thermoPackage  -- components + γ-φ models
            reactions      -- named-reaction library                  [opt]

    Layer 1 (always):   one simulator pass via Flowsheet
    Layer 2 (optional): outerDict → wrap the pass in an outer algorithm
    Layer 3 (optional): postDict  → augment the result (sizing, cost, …)

    Usage:   choupoSolve [case_dir]
\*---------------------------------------------------------------------------*/

#include "core/Banner.H"
#include "core/Dictionary.H"
#include "core/DisplayUnits.H"
#include "core/ResultEmitter.H"
#include "core/Advisory.H"
#include "core/SimulationResult.H"
#include "core/ThermoResolution.H"
#include "streams/StreamMass.H"
#include "materials/MaterialRegistry.H"
#include "thermo/henrysLaw/HenrysLawRegistry.H"
#include "thermo/membrane/MembraneRegistry.H"
#include "thermo/utility/UtilityCatalogue.H"
#include "outerDriver/OuterDriver.H"
#include "postProcessing/PostProcessor.H"
#include "reporting/Report.H"
#include "reporting/UtilityAllocationReport.H"
#include "io/SolutionWriter.H"
#include "thermo/Database.H"
#include "thermo/SaturationCurves.H"
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
#include "unitOperations/UnitOperation.H"
#include "unitOperations/separation/cycloneModel/CycloneModel.H"
#include "unitOperations/reactor/gibbsMethod/GibbsMethod.H"
#include "unitOperations/flowsheet/Flowsheet.H"

#include <filesystem>
#include <iostream>
#include <map>
#include <memory>
#include <stdexcept>
#include <set>
#include <string>
#include <vector>

using namespace Choupo;
namespace fs = std::filesystem;

// Build-time hook for user-defined unit operations.  A case may
// ship C++ in its `code/` folder that defines new unit-op types and
// registers them here.  The normal binary links an EMPTY stub
// (registerUserTypesStub.cpp); `bin/buildCode` instead links the case's
// own.cpp files under `code/` --- which provide this function --- against
// libchoupo.so, so the new types are available WITHOUT runtime dlopen
// or macro magic.  See bin/buildCode and CLAUDE.md §"case-local code".
void registerUserTypes();

// --------------------------------------------------------------------------
//   One simulator pass: load thermo + run flowsheet → SimulationResult.
//   Reusable from the outer-driver layer (varies flowsheetDict each call).
// --------------------------------------------------------------------------
static SimulationResult runSimulation(const DictPtr&     flowsheetDict,
    const Database&    db,
    const DictPtr&     thermoDict,
    const DictPtr&     solverDict,        // may be null
    const DictPtr&     reactionsDict,     // may be null
    int                verbosity,
    const SolutionControl* solutionCtl = nullptr)  // null => feature OFF
{
    // Fresh advisory sink for this pass (so a sweep/optim gets per-pass
    // advisories, and the result carries this pass's).  Cleared BEFORE the
    // thermo build so a thermo-level advisory (e.g. NRTL ideal-defaulted pairs)
    // is captured.
    AdvisoryLog::instance().clear();
    ThermoResolutionLog::instance().clear();   // per-pass binary-pair provenance

    ThermoPackage thermo;
    thermo.readFromDict(thermoDict, db);

    // Run-block (integrity teeth): refuse to SOLVE on an UNVERIFIED estimate of a
    // REQUIRED property unless the thermoPackage opts in with `acceptUnverified true;`.
    requireVerifiedOrThrow(thermo.auditFindings(),
        thermoDict->lookupWordOrDefault("acceptUnverified", "false") == "true");

    Flowsheet flowsheet;
    flowsheet.setSolverDict   (solverDict);
    flowsheet.setReactionsDict(reactionsDict);
    flowsheet.setDatabase     (&db);          // per-unit thermo overrides
    flowsheet.setThermoDict   (thermoDict);

    // ---- Solution-directory (OpenFOAM-style per-iteration writer) ---------
    //  Installed ONLY when controlDict carried `solutionControl{ write true; }`.
    //  Absent => `solutionCtl == nullptr` => no hooks => byte-identical run.
    //  The writer is built HERE because the flattened component names come
    //  from the just-built thermo; it outlives solve() (stack-scoped).
    std::unique_ptr<SolutionWriter> solWriter;
    if (solutionCtl && solutionCtl->write)
    {
        std::vector<std::string> compNames;
        compNames.reserve(thermo.n());
        for (std::size_t i = 0; i < thermo.n(); ++i)
            compNames.push_back(thermo.comp(i).name());
        solWriter = std::make_unique<SolutionWriter>(
            fs::current_path().string(), *solutionCtl, std::move(compNames));

        const int interval = std::max(1, solutionCtl->writeInterval);
        SolutionControl ctl = *solutionCtl;   // capture by value for the closure
        // Recycle tolerance, for the instant header (read where the solver does).
        const scalar recTol = flowsheetDict->lookupScalarOrDefault("recycleTol", 1.0e-5);

        flowsheet.setInstantCallback(
            [&solWriter, interval, recTol]
            (int it, const char* solver, scalar residual, bool converged,
             const std::map<std::string, ProcessStream>& streams,
             const std::vector<std::string>& tears,
             const std::vector<FlatUnit>& units)
            {
                // Cadence: always write the seed and the final converged
                // instant; otherwise every `writeInterval`-th iteration.
                const bool isSeed   = (std::string(solver) == "seed");
                const bool onCadence = (it % interval == 0);
                if (!isSeed && !converged && !onCadence) return;
                SolutionInstantMeta m;
                m.iteration    = it;
                m.solver       = solver;
                m.tearResidual = residual;
                m.tolerance    = recTol;
                m.converged    = converged;
                solWriter->writeInstant(m, streams, tears, units);
            });

        if (ctl.startFrom == "latestTime")
            flowsheet.setRestartHook(
                [&solWriter, &thermo]
                (std::map<std::string, ProcessStream>& streams,
                 const std::vector<std::string>& tears) -> int
                {
                    return solWriter->restartFromLatest(streams, tears, thermo);
                });
    }

    int rc = flowsheet.solve(flowsheetDict, thermo, verbosity);

    SimulationResult r;
    r.streams     = flowsheet.streams();
    r.kpis        = flowsheet.unitKpis();
    r.topology    = flowsheet.topology();
    r.energyWires = flowsheet.energyWires();
    r.modelBoundaries = flowsheet.modelBoundaries();
    r.convergence = flowsheet.unitResiduals();
    r.profiles    = flowsheet.unitProfiles();
    r.converged   = (rc == 0);
    r.advisories  = AdvisoryLog::instance().entries();   // drain this pass's advisories
    r.thermoResolution = ThermoResolutionLog::instance().entries();  // pair provenance
    r.componentNames.reserve(thermo.n());
    for (std::size_t i = 0; i < thermo.n(); ++i)
    {
        const auto& c = thermo.comp(i);
        r.componentNames.push_back(c.name());
        r.componentMolarMass[c.name()] = c.MW();
        // Thermo coverage: which capabilities this component actually carries,
        // so the GUI can flag gaps (e.g. an estimate with no Antoine -> no VLE).
        ComponentCoverage cc;
        cc.name        = c.name();
        cc.criticals   = c.Tc() > 0.0 && c.Pc() > 0.0;
        cc.psat        = c.hasVaporPressure();
        cc.vliq        = c.Vliq() > 0.0;
        cc.cpIdealGas  = c.hasCpIdealGas();
        cc.gibbs       = c.hasGibbsData();
        cc.nonvolatile = c.isNonvolatile();
        r.componentCoverage.push_back(cc);
    }

    // Utility consumption aggregation.  Walk every stream
    // and bucket its mass flow by its `category` tag; streams with
    // empty category are skipped (process streams).  The same logic
    // is also printed inside Flowsheet::solve --- here we lift it
    // into SimulationResult so the structured JSON output, the GUI
    // and any OuterDriver can consult it programmatically.
    for (const auto& [name, s] : r.streams)
    {
        if (s.category.empty()) continue;
        r.utilities[s.category] += F_mass(s, thermo);
    }

    // Binary T-x-y diagram: useful in the GUI for any 2-component
    // VLE system.  Reference P is the first stream's P (typically the
    // feed pressure).  Skip cheaply if not a 2-component package or
    // if the package has no vapor phase (e.g. an LL-only extraction
    // case --- bubble-T calls would dereference a null EoS).
    //
    // A bubble/dew envelope is ONLY physical when the two components form a
    // genuine VLE.  Three guards (QA finding T4) keep us from shipping a
    // garbage envelope the GUI would plot:
    //
    //   (1) BOTH components must be VOLATILE (carry a vapour-pressure model and
    //       not be flagged nonvolatile).  A nonvolatile solute --- sucrose, a
    //       salt, a polymer repeat unit --- has no bubble/dew point, so the
    //       envelope is undefined (e.g. solidDryer01_sugar: water + sucrose).
    //
    //   (2) The PHYSICS of the unit must be phase equilibrium.  Single-phase
    //       rotating equipment (turbine / compressor / pump) and pure-transport
    //       contexts have no VLE envelope in their model; a 2-gas package
    //       (turbine01_air: N2 + O2) would otherwise drive bubble-T to the
    //       solver bracket floor and emit mole fractions far outside [0,1].
    //
    //   (3) The computed envelope must be VALID --- every vapour mole fraction
    //       in [0,1] (a small slack for round-off).  A y outside that range is
    //       a diverged / clamped solve; we never ship out-of-range fractions.
    bool allVolatile = (thermo.n() == 2);
    for (std::size_t i = 0; i < thermo.n() && allVolatile; ++i)
    {
        const auto& c = thermo.comp(i);
        if (!c.hasVaporPressure() || c.isNonvolatile()) allVolatile = false;
    }

    // A txy envelope is part of the physics only for phase-equilibrium units;
    // it is meaningless for single-phase rotating equipment and pure transport.
    // We emit ONLY when EVERY unit in the flattened flowsheet is an
    // equilibrium-capable type (no turbine/compressor/pump in the path).
    static const std::set<std::string> kNonEquilibrium =
        { "turbine", "compressor", "pump" };
    bool equilibriumPhysics = !r.topology.empty();
    for (const auto& u : r.topology)
        if (kNonEquilibrium.count(u.type)) equilibriumPhysics = false;

    if (allVolatile && equilibriumPhysics && !r.streams.empty()
        && !thermo.phasesOfType("vapor").empty())
    {
        try {
            BinaryTxy t = binaryTxy(thermo, r.streams.begin()->second.P, 31);

            // Guard (3): reject an envelope with any out-of-range vapour mole
            // fraction --- a sign the inner bubble-T solve diverged or hit the
            // bracket floor.  Better no plot than a mole fraction of 170.
            constexpr scalar slack = 1.0e-6;
            bool yValid = !t.yDew.empty();
            for (scalar y : t.yDew)
                if (y < -slack || y > 1.0 + slack) { yValid = false; break; }

            if (yValid) r.txy = std::move(t);
        } catch (const std::exception&) {
            // Some thermo combinations (e.g. azeotropes near pure-component
            // bounds) can fail the inner Newton; degrade silently.
        }
    }
    return r;
}

// --------------------------------------------------------------------------
int main(int argc, char** argv)
try
{
    printBanner("");

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
    CycloneModel    ::registerBuiltins();
    GibbsMethod     ::registerBuiltins();
    UnitOperation   ::registerBuiltins();
    registerUserTypes();          // case-local unit ops (empty by default)
    OuterDriver     ::registerBuiltins();
    PostProcessor   ::registerBuiltins();
    Report          ::registerBuiltins();

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

    // Load the materials and membranes registries from the same data root.
    if (!dataRoot.empty())
    {
        MaterialRegistry::loadFrom(dataRoot.string());
        MembraneRegistry::loadFrom(dataRoot.string());
        HenrysLawRegistry::loadFrom(dataRoot.string());
        UtilityCatalogue::loadFrom(dataRoot.string());
    }

    fs::current_path(caseDir);
    std::cout << "Case directory: " << fs::current_path().string() << "\n"
              << "Database root:  " << db.root() << "\n\n";

    // ---- Required dictionaries -----------------------------------------
    //  Cascade resolution (fractal): a sector / unit node may omit the
    //  thermoPackage or controlDict it inherits from a PARENT folder level ---
    //  walk UP the tree until the file is found (capped, to stay within the
    //  plant).  The flowsheetDict is NEVER inherited: it IS the node.
    auto resolveUp = [](const std::string& rel) -> std::string {
        fs::path p = fs::current_path();
        for (int up = 0; up < 6; ++up)
        {
            if (fs::exists(p / rel)) return (p / rel).string();
            if (!p.has_parent_path()) break;
            p = p.parent_path();
        }
        return rel;   // fall back to the local path (fromFile reports the error)
    };

    auto flowsheetDict = Dictionary::fromFile("system/flowsheetDict");
    auto controlDict   = Dictionary::fromFile(resolveUp("system/controlDict"));
    auto thermoDict    = Dictionary::fromFile(resolveUp("constant/thermoPackage"));

    // ---- CURATION-PHASE guard ------------------------------------------
    // A composite case (sectors via `children`) whose streams are not yet
    // wired (no `connections`) is still in the THERMO-PHYSICAL PROPERTY
    // CURATION phase -- there is nothing to simulate yet.  Say so clearly and
    // exit cleanly (a valid state, NOT an error), instead of throwing
    // "child inlet not cabled" from deep in the flattener.
    if (flowsheetDict->found("children")
        && (!flowsheetDict->found("connections")
            || flowsheetDict->lookupDictList("connections").empty()))
    {
        std::cout <<
          "\n================================================================\n"
          "  This case is in the THERMO-PHYSICAL PROPERTY CURATION phase.\n"
          "  Its sectors are defined, but their streams are NOT wired yet\n"
          "  (the flowsheet has no `connections`).  There is nothing to\n"
          "  simulate.  Curate the per-sector properties first (choupoProps);\n"
          "  add the `connections` to assemble the plant, then simulate.\n"
          "================================================================\n\n";
        return 0;
    }

    // ---- Optional dictionaries -----------------------------------------
    DictPtr solverDict;
    if (fs::exists("system/solverDict"))
        solverDict = Dictionary::fromFile("system/solverDict");

    DictPtr reactionsDict;
    if (fs::exists("constant/reactions"))
        reactionsDict = Dictionary::fromFile("constant/reactions");

    DictPtr outerDict;
    if (fs::exists("system/outerDict"))
        outerDict = Dictionary::fromFile("system/outerDict");

    DictPtr postDict;
    if (fs::exists("system/postDict"))
        postDict = Dictionary::fromFile("system/postDict");

    // controlDict `reports {... }` block: chemical-engineering
    // report objects (streamTable, massBalance, energyBalance,...) that
    // write CSV into the case's reports/ directory after a converged solve.
    DictPtr reportsDict;
    if (controlDict->found("reports"))
        reportsDict = controlDict->subDict("reports");

    // controlDict `solutionControl {... }` block (OpenFOAM-style solution
    // directory).  ABSENT => the feature is OFF and the run is byte-identical
    // to before.  Present with `write true;` => durable per-recycle-iteration
    // stream snapshots in NUMBERED TIME DIRECTORIES at the case root (0/ 1/ ...
    // next to constant/ system/ and the sector folders), opt-in restart, purge
    // ring-buffer, + a per-unit byUnit/ projection.
    SolutionControl solutionCtl;            // defaults: write=false (OFF)
    bool haveSolutionCtl = false;
    if (controlDict->found("solutionControl"))
    {
        auto sc = controlDict->subDict("solutionControl");
        solutionCtl.write =
            (sc->lookupWordOrDefault("write", "false") == "true");
        solutionCtl.writeInterval =
            static_cast<int>(sc->lookupScalarOrDefault("writeInterval", 5));
        solutionCtl.purgeWrite =
            static_cast<int>(sc->lookupScalarOrDefault("purgeWrite", 3));
        solutionCtl.startFrom =
            sc->lookupWordOrDefault("startFrom", "startTime");
        solutionCtl.flushEach =
            (sc->lookupWordOrDefault("flushEach", "true") == "true");
        solutionCtl.byUnit =
            (sc->lookupWordOrDefault("byUnit", "true") == "true");
        haveSolutionCtl = solutionCtl.write;
        if (solutionCtl.write)
            std::cout << "solutionControl:   ON (write every "
                      << solutionCtl.writeInterval << " iter, purgeWrite "
                      << solutionCtl.purgeWrite << ", startFrom "
                      << solutionCtl.startFrom << ", byUnit "
                      << (solutionCtl.byUnit ? "true" : "false")
                      << ") -> instant dirs at the case root\n";
    }

    const int verbosity = static_cast<int>(controlDict->lookupScalarOrDefault("verbosity", 3));
    const std::string application =
        controlDict->lookupWordOrDefault("application", "choupoSolve");
    const std::string description =
        controlDict->lookupWordOrDefault("description", "");

    // Pull display-unit + precision preferences out of controlDict.
    DisplayUnits::instance().readFrom(controlDict);
    DisplayUnits::instance().readPrecision(controlDict);

    std::cout << "Application:       " << application << "\n";
    if (!description.empty())
        std::cout << "Description:       " << description << "\n";
    std::cout << "Verbosity:         " << verbosity << "\n";
    std::cout << "outerDict:         "
              << (outerDict ? "loaded — outer driver active" : "not present (single pass)")
              << "\npostDict:          "
              << (postDict  ? "loaded — post-processing active" : "not present")
              << "\nsolverDict:        "
              << (solverDict ? "loaded" : "not present (built-in defaults)")
              << "\nreactions library: "
              << (reactionsDict ? "loaded" : "not present")
              << "\n";

    // ---- Simulator functor reusable by outer driver --------------------
    auto simulate = [&](const DictPtr& flowDictForRun) {
        auto r = runSimulation(flowDictForRun, db, thermoDict,
                               solverDict, reactionsDict, verbosity,
                               haveSolutionCtl ? &solutionCtl : nullptr);
        // Size plant utilities for every duty HERE, so BOTH the direct path and
        // the outer-driver passes carry it.  The outer driver (DesignSpec /
        // recycle / sweep) emits the result JSON itself and previously skipped
        // allocation -> the GUI's utilities/duty-stubs were empty for any case
        // with an outerDict.  Cheap; only on a converged pass.
        if (r.converged) r.utilityAllocation = allocateUtilities(r, flowDictForRun);
        return r;
    };

    // ---- controlDict reports{} chain (reusable by both paths) ----------
    // Chemical-engineering report objects writing the per-domain tree +
    //.ods into reports/.  Runs on the direct pass AND on an outer
    // driver's representative pass (the replay at the optimum).
    auto runReports = [&](SimulationResult& result) {
        if (!reportsDict || !result.converged) return;
        ThermoPackage thermoForReports;
        thermoForReports.readFromDict(thermoDict, db);
        const fs::path reportsDir = fs::current_path() / "reports";
        fs::create_directories(reportsDir);
        ReportContext rctx{
            result, thermoForReports, flowsheetDict, reportsDir, verbosity
        };
        if (verbosity >= 2)
            std::cout << "\nReports (-> " << reportsDir.string() << "):\n";
        auto chain = Report::buildChain(reportsDict);
        for (auto& [rep, opts] : chain) rep->run(opts, rctx);
    };

    int finalRc = 0;

    if (outerDict)
    {
        // Layer 2: outer driver controls the simulator
        auto driver = OuterDriver::New(outerDict);
        driver->setSimulator     (simulate);
        driver->setFlowsheetDict (flowsheetDict);
        driver->setThermoDict    (thermoDict);
        driver->setPostDict      (postDict);   // may be null; drivers that don't need it ignore
        finalRc = driver->run();

        // Layer 3b: reports{} on the driver's representative pass (the
        // replay at the optimum).  The driver already emitted the JSON
        // result; here we add the per-domain report tree +.ods.  Drivers
        // without a single representative pass (sweep, fit) skip this.
        if (driver->hasFinalResult())
        {
            SimulationResult r = driver->finalResult();
            runReports(r);
        }
    }
    else
    {
        // Direct: one simulator pass
        auto result = simulate(flowsheetDict);
        finalRc = result.converged ? 0 : 1;

        // Layer 3: optional post-processing on the result
        if (postDict)
        {
            auto chain = PostProcessor::buildChain(postDict);
            for (auto& pp : chain) pp->run(result);
        }

        // Layer 3b: controlDict `reports {... }` chain.
        runReports(result);

        // (utility allocation now done inside `simulate` -- carried on every
        // pass, direct + outer -- so the GUI always has it.)

        // Refresh advisories: the post-processing (sizing) may have added
        // rating warnings AFTER the simulate() pass drained the log.  Re-draining
        // captures the flowsheet advisories + any from the post chain.
        result.advisories = AdvisoryLog::instance().entries();

        // Structured-result emitter: any downstream consumer (the
        // browser GUI; a shell script with `awk`; a Python notebook)
        // can extract the result block from stdout between the two
        // marker lines without re-parsing the iteration log.
        emitResultJson(std::cout, result);
    }

    return finalRc;
}
catch (const std::exception& e)
{
    std::cerr << "\nERROR: " << e.what() << "\n";
    return 2;
}
