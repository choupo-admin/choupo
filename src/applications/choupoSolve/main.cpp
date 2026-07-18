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
            flowsheetDict  -- topology: units + connections (state in 0/)
            solverDict     -- per-unit-op solver options              [opt]
            outerDict      -- outer driver (sweep / optim / fit / PE)  [opt]
            postDict       -- post-processing chain (sizing, costing)  [opt]
          constant/
            thermoPhysPropDict  -- the thermophysical system
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
#include "streams/StreamOwnership.H"
#include "streams/StreamStateIO.H"
#include "core/ThermoResolution.H"
#include "streams/StreamMass.H"
#include "materials/MaterialRegistry.H"
#include "thermo/henrysLaw/HenrysLawRegistry.H"
#include "thermo/solution/SolutionRegistry.H"
#include "thermo/membrane/MembraneRegistry.H"
#include "thermo/adsorbent/AdsorbentRegistry.H"
#include "thermo/utility/UtilityCatalogue.H"
#include "outerDriver/OuterDriver.H"
#include "postProcessing/PostProcessor.H"
#include "reporting/Report.H"
#include "reporting/UtilityAllocationReport.H"
#include "thermo/PropertyContext.H"
#include "io/SolutionWriter.H"
#include "thermo/Database.H"
#include "thermo/ThermoAnnounce.H"
#include "thermo/ThermoPackageBuilder.H"
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

#include <algorithm>
#include <cctype>
#include <filesystem>
#include <fstream>
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
    const DictPtr&     packageDict,       // THE authored v2 system (required)
    const ChemistrySystem* chem,          // constant/chemistryDict (may be null)
    const DictPtr&     solverDict,        // may be null
    const DictPtr&     reactionsDict,     // may be null
    int                verbosity,
    const SolutionControl* solutionCtl = nullptr,  // null => feature OFF
    bool               init0 = false,
    bool               init0Force = false,
    const StreamOverrides& overrides = StreamOverrides{})
{
    // Fresh advisory sink for this pass (so a sweep/optim gets per-pass
    // advisories, and the result carries this pass's).  Cleared BEFORE the
    // thermo build so a thermo-level advisory (e.g. NRTL ideal-defaulted pairs)
    // is captured.
    AdvisoryLog::instance().clear();
    ThermoResolutionLog::instance().clear();   // per-pass binary-pair provenance

    if (!packageDict)
        throw std::runtime_error("choupoSolve: no constant/thermoPhysPropDict"
            " -- every case declares its thermophysical system (v2 grammar).");
    ThermoPackage thermo = ThermoPackageBuilder::build(packageDict, db, chem);

    // Run-block (integrity teeth): refuse to SOLVE on an UNVERIFIED estimate of a
    // REQUIRED property unless the package opts in with `acceptUnverified true;`.
    requireVerifiedOrThrow(thermo.auditFindings(),
        packageDict->lookupWordOrDefault("acceptUnverified", "false") == "true");

    Flowsheet flowsheet;
    flowsheet.setStreamOverrides(overrides);
    flowsheet.setInit0Mode    (init0, init0Force);
    flowsheet.setSolverDict   (solverDict);
    flowsheet.setReactionsDict(reactionsDict);
    flowsheet.setDatabase     (&db);          // per-unit thermo overrides
    // The AUTHORED v2 system is the base every per-unit thermo{} FRAGMENT
    // merges onto.
    flowsheet.setAuthoredV2(packageDict);

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
            (int it, const char* solver, scalar residual,
             scalar massResidual, scalar energyResidual, bool converged,
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
                m.iteration      = it;
                m.solver         = solver;
                m.tearResidual   = residual;
                m.massResidual   = massResidual;
                m.energyResidual = energyResidual;
                m.tolerance      = recTol;
                m.converged      = converged;
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
    r.boundaryAliases = flowsheet.boundaryAliases();
    r.boundaryAliasOf  = flowsheet.boundaryAliasOf();
    r.kpis        = flowsheet.unitKpis();
    r.topology    = flowsheet.topology();
    r.energyWires = flowsheet.energyWires();
    r.modelBoundaries = flowsheet.modelBoundaries();
    r.convergence = flowsheet.unitResiduals();
    // GLOBAL recycle-closure curves: the same physical, feed-normalised mass /
    // energy tear residuals the CLI plot reads from residuals.dat, surfaced as
    // two named convergence curves so the GUI's convergence plot draws the
    // global mass/energy closure alongside the per-unit inner residuals.  Empty
    // for a tear-free flowsheet (no recycle loop) -> the GUI silently drops
    // empty curves, so only recycle cases gain the two extra lines.
    if (!flowsheet.globalMassResiduals().empty())
        r.convergence["Mass balance (global)"] = flowsheet.globalMassResiduals();
    if (!flowsheet.globalEnergyResiduals().empty())
        r.convergence["Energy balance (global)"] = flowsheet.globalEnergyResiduals();
    r.profiles    = flowsheet.unitProfiles();
    r.converged   = (rc == 0);
    r.advisories  = AdvisoryLog::instance().entries();   // drain this pass's advisories
    r.thermoResolution = ThermoResolutionLog::instance().entries();  // pair provenance

    // D-c (forum #67/#69, shared impl per #73-3): announced on EVERY
    // consumption, independent of verbosity.
    if (announceProvenanceConsumption(r.thermoResolution))
        r.advisories = AdvisoryLog::instance().entries();   // refresh
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
        { "turbine", "compressor", "pump",
          // pass-5: a hydraulics/solids case has no business drawing a
          // distillation diagram -- the txy sweep on pipe02 was pure noise.
          "pipe", "pneumaticConveyor", "cyclone", "bagFilter",
          "gasSolidSplitter", "solidDryer", "sprayDryer", "electricLoad" };
    bool equilibriumPhysics = !r.topology.empty();
    for (const auto& u : r.topology)
        if (kNonEquilibrium.count(u.type)) equilibriumPhysics = false;

    if (allVolatile && equilibriumPhysics && !r.streams.empty()
        && !thermo.phasesOfType("vapor").empty())
    {
        try {
            // Announce the sweep BEFORE it runs: the bubble-T scan visits
            // temperatures far from the operating point, so any model-range
            // warnings it triggers (e.g. a Henry-pair Trange guard) must be
            // attributable to THIS diagnostic, not to the case's own state.
            if (verbosity >= 2)
                std::cout << "[txy] scanning bubble/dew T across composition"
                             " for the T-x-y diagram (an internal diagnostic"
                             " sweep -- any model-range warnings below come"
                             " from this scan, NOT your operating point).\n";

            BinaryTxy t = binaryTxy(thermo, r.streams.begin()->second.P, 31);

            // Guard (3): reject an envelope with any out-of-range vapour mole
            // fraction --- a sign the inner bubble-T solve diverged or hit the
            // bracket floor.  Better no plot than a mole fraction of 170.
            constexpr scalar slack = 1.0e-6;
            bool yValid = !t.yDew.empty();
            for (scalar y : t.yDew)
                if (y < -slack || y > 1.0 + slack) { yValid = false; break; }

            // Guard (4): a bubble/dew T pinned at the bubble-T solver's
            // bracket floor (200 K, SaturationCurves.cpp) for EVERY
            // composition is a degenerate envelope --- the Newton never left
            // the bound, so the flat "diagram" is a solver artefact, not
            // physics.  Omit the block and say so.
            constexpr scalar Tfloor = 200.0;
            bool pinnedAtFloor = !t.Tbubble.empty();
            for (std::size_t k = 0; k < t.Tbubble.size(); ++k)
                if (t.Tbubble[k] > Tfloor + 0.01 || t.Tdew[k] > Tfloor + 0.01)
                    { pinnedAtFloor = false; break; }
            if (pinnedAtFloor)
            {
                if (verbosity >= 2)
                    std::cout << "[txy] envelope degenerate: bubble/dew T"
                                 " pinned at the 200 K solver floor for every"
                                 " composition -- a solver artefact, not"
                                 " physics; omitting the T-x-y block.\n";
            }
            else if (yValid) r.txy = std::move(t);
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

    // Flags: `-init0` materialises 0/ instead of solving (arch step 2);
    // `--force` lets it regenerate existing internal/outlet estimates.
    bool init0Mode = false, init0Force = false;
    std::string caseDir = ".";
    for (int a = 1; a < argc; ++a)
    {
        const std::string arg = argv[a];
        if      (arg == "-init0" || arg == "--init0") init0Mode = true;
        else if (arg == "--force")                    init0Force = true;
        else caseDir = arg;
    }
    if (!fs::exists(caseDir))
        throw std::runtime_error("Case directory does not exist: " + caseDir);

    // Resolve the database BEFORE entering the case dir.
    const fs::path launchCwd = fs::current_path();
    fs::path dataRoot;
    if (const char* env = std::getenv("CHOUPO_HOME"))
        dataRoot = fs::path(env) / "data";
    else if (fs::exists(launchCwd / "data" / "standards" / "components"))
        dataRoot = launchCwd / "data";
    // Enter the case dir BEFORE constructing the Database.  A SEALED case
    // (constant/propertyManifest; legacy constant/propertyData/) is then
    // detected -- the record resolver walks up from HERE -- so the Database
    // skips the catalogue-root requirement and the engine consults ONLY the
    // case.  dataRoot stays absolute (from launchCwd).
    fs::current_path(caseDir);
    Database db(dataRoot.empty() ? "" : dataRoot.string());

    // Load the registries.  A SEALED case with the catalogue hidden has an
    // EMPTY dataRoot -- every directory-scan registry reads the case's OWN
    // MIRRORED constant/<sub>/ closure via the record resolver (assets/ for
    // materials/membranes/adsorbents, parameters/Henry/ for Henry, ...), so
    // they must ALL load unconditionally: loadFrom("") scans the case-local
    // dir alone (sealed), and the empty standards path is fs::exists-guarded.
    MaterialRegistry::loadFrom(dataRoot.string());
    MembraneRegistry::loadFrom(dataRoot.string());
    AdsorbentRegistry::loadFrom(dataRoot.string());
    HenrysLawRegistry::loadFrom(dataRoot.string());
    SolutionRegistry::loadFrom(dataRoot.string());
    UtilityCatalogue::loadFrom(dataRoot.string());

    std::cout << "Case directory: " << fs::current_path().string() << "\n"
              << "Database root:  " << db.root() << "\n\n";

    // ---- Required dictionaries -----------------------------------------
    //  Cascade resolution (fractal): a sector / unit node may omit the
    //  propertyDict or controlDict it inherits from a PARENT folder level ---
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

    // DUAL-READER (fractal folder discipline, mirrors Flowsheet's child loader).
    // A case's flowsheetDict is in one of two places, tried in order:
    //   (1) <caseRoot>/flowsheetDict        -- the LEAN layout (the dict at the
    //       node root, no sparse system/ wrapper).  A branch of a fractal plant
    //       (e.g. .../ChemicalPlantTutorial/CONCENTRATION) is then itself a
    //       runnable case: open it directly and it solves with its own frozen
    //       inlets, writing its OWN instants in place.
    //   (2) <caseRoot>/system/flowsheetDict -- the original layout, KEPT for
    //       backwards-compat (every flat tutorial + the composite ROOTs).
    // The flowsheetDict is NEVER inherited from a parent (it IS the node), so
    // there is no resolveUp here -- only this local two-place lookup.
    const std::string flowsheetPath =
        fs::exists("flowsheetDict") ? "flowsheetDict" : "system/flowsheetDict";
    auto flowsheetDict = Dictionary::fromFile(flowsheetPath);
    auto controlDict   = Dictionary::fromFile(resolveUp("system/controlDict"));

    // Verbosity is read HERE (before any thermo load) so the 0-silent contract
    // covers the LOAD phase too: the package/builder announcement chorus below
    // is gated at >= 2, same threshold as the flash's seed line.
    const int verbosity = static_cast<int>(controlDict->lookupScalarOrDefault("verbosity", 3));
    thermoAnnounceLevel() = verbosity;

    // Aspen property architecture: a case SELECTS a propertyPackage (the builder
    // assembles the ThermoPackage from the new records, reads zero old salt files)
    // XOR carries a thermoPackage (the legacy reader).  Mirrors choupoProps.
    DictPtr packageDict;
    ChemistrySystem chem;                 // constant/chemistryDict selection
    const ChemistrySystem* chemPtr = nullptr;
    {
        // ONE name: constant/propertyDict (there are more properties than
        // thermodynamics -- transport, chemistry, solids).  It accepts BOTH
        // grammars, routed by content, so a simple case stays simple and a rich
        // one gets the manifest:
        //   - has `components` + `propertyMethods`  -> the full MANIFEST (builder);
        //   - has `components`, no `propertyMethods` -> the FLAT form
        //     (activityModel / equationOfState), read by the legacy reader;
        //   - no `components`                        -> a SELECTOR (`package <name>;`).
        // The case system lives in constant/thermoPhysPropDict (the *Dict
        // convention: flowsheetDict / solverDict / controlDict).
        std::string pkgPath = resolveUp("constant/thermoPhysPropDict");
        bool deprecatedName = false;
        if (!fs::exists(pkgPath) && fs::exists(resolveUp("constant/propertyDict")))
            throw std::runtime_error(
                "this case carries a constant/propertyDict -- the case grammar is"
                " constant/thermoPhysPropDict (bin/curate/migrate_thermoPhysProp.py"
                " converts old cases).");
        if (fs::exists(pkgPath))
        {
            auto sel = Dictionary::fromFile(pkgPath);
            if (deprecatedName)
                std::cout << "  [deprecated] constant/propertyDict -- rename it"
                             " to constant/propertyDict (the property package"
                             " is more than thermo).\n";
            // ACTIVE-CHEMISTRY SELECTION (constant/chemistryDict): the same
            // context chain, nearest owner wins; optional.
            chem = resolveChemistryContext(
                fs::path(pkgPath).parent_path().string());
            if (chem.present) chemPtr = &chem;
            // A case-level propertyDict may itself `inherit` a parent context: a
            // projected local unit run (choupo-project) points at the plant
            // context this way, copying no property data.
            if (sel->found("inherits"))
            {
                std::set<std::string> visited;
                sel = resolvePropertyContext(
                    fs::path(pkgPath).parent_path().string(), visited);
            }
            if (sel->lookupWordOrDefault("recordType", "")
                    != "thermophysicalPropertySystem")
                throw std::runtime_error("constant/thermoPhysPropDict must"
                    " declare `recordType thermophysicalPropertySystem;`"
                    " -- the ONE case grammar.");
            // The AUTHORED v2 dict IS the package source -- build()'s ONE
            // dispatch assembles a claimed formulation natively and gives
            // every other shape a NAMED refusal.
            packageDict = sel;
            if (verbosity >= 2)
                std::cout << "Property package:  INLINE in the case"
                             "   (v2 grammar, NATIVE assembly)\n";
        }
    }

    // ---- CURATION-PHASE guard ------------------------------------------
    // A composite case (sectors via `children`) whose streams are not yet
    // wired (no `connections`) is still in the THERMO-PHYSICAL PROPERTY
    // CURATION phase -- there is nothing to simulate yet.  Say so clearly and
    // exit cleanly (a valid state, NOT an error), instead of throwing
    // "child inlet not cabled" from deep in the flattener.
    bool connsEmpty = !flowsheetDict->found("connections");
    if (!connsEmpty)
    {
        const auto& cv = flowsheetDict->entryValue("connections");
        connsEmpty = std::holds_alternative<DictPtr>(cv)
            ? std::get<DictPtr>(cv)->keys().empty()
            : flowsheetDict->lookupDictList("connections").empty();
    }
    if (flowsheetDict->found("sectors") && connsEmpty)
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

    // reactions: the named-reaction library.  CASCADES UP the parent chain,
    // SYMMETRICALLY with constant/propertyDict and the component overlays --
    // so a branch of a fractal plant run STANDALONE
    // (./choupoSolve .../ChemicalPlantTutorial/FERMENTATION) still finds a
    // reaction (e.g. sucroseToEthanol) declared at a HIGHER folder level.
    // Before this, only thermo/components walked up and reactions did not, so
    // the bare reference threw "reaction '<name>' not in constant/reactions".
    // The cascade is LOUD: we record WHERE the file came from (LOCAL vs a named
    // parent) and print it below -- never a silent find (no-silent-crutch).
    DictPtr     reactionsDict;
    std::string reactionsOrigin;          // "" = not present; else the path used
    {
        fs::path here = fs::current_path();
        fs::path found;
        fs::path p = here;
        for (int up = 0; up < 6; ++up)
        {
            if (fs::exists(p / "constant/reactions")) { found = p / "constant/reactions"; break; }
            if (!p.has_parent_path()) break;
            p = p.parent_path();
        }
        if (!found.empty())
        {
            reactionsDict = Dictionary::fromFile(found.string());
            // Describe the origin relative to the run dir: LOCAL when it sits at
            // this node, otherwise "inherited from <parent>/constant/reactions".
            const fs::path owner = found.parent_path().parent_path();  // dir holding constant/
            reactionsOrigin = (owner == here)
                ? "LOCAL (constant/reactions)"
                : ("inherited from " + owner.filename().string()
                   + "/constant/reactions");
        }
    }

    DictPtr outerDict;
    if (fs::exists("system/outerDict"))
        outerDict = Dictionary::fromFile("system/outerDict");

    DictPtr postDict;
    if (fs::exists("system/postDict"))
        postDict = Dictionary::fromFile("system/postDict");

    // controlDict `reports {... }` block: chemical-engineering
    // report objects (streamTable, massBalance, energyBalance,...) that
    // write CSV into the case's report directory after a converged solve.
    DictPtr reportsDict;
    if (controlDict->found("reports"))
        reportsDict = controlDict->subDict("reports");

    // Report-output layout.  DEFAULT `reports` => the original `reports/<kind>/`
    // tree (every existing case keeps it unchanged).  Opt-in
    // `reportsLayout postProcessing;` (the fractal-discipline pilot) => the
    // CHT-faithful `postProcessing/<n>/<kind>/` tree, where <n> is the solved
    // instant (the converged pseudo-time).  This keeps the derived reports OUT
    // of the way of the instant `streams` field files and gitignores cleanly.
    const std::string reportsLayout =
        controlDict->lookupWordOrDefault("reportsLayout", "reports");

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

    // (verbosity was read right after controlDict loaded, before the thermo
    //  package announcements -- see above.)
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
              << (reactionsDict ? ("loaded — " + reactionsOrigin) : "not present")
              << "\n";

    // ---- Simulator functor reusable by outer driver --------------------
    auto simulate = [&](const DictPtr& flowDictForRun,
                        const StreamOverrides& overrides) {
        auto r = runSimulation(flowDictForRun, db, packageDict,
                               chemPtr, solverDict, reactionsDict, verbosity,
                               haveSolutionCtl ? &solutionCtl : nullptr,
                               false, false, overrides);
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
        thermoForReports = ThermoPackageBuilder::build(packageDict, db, chemPtr);
        const bool postProc = (reportsLayout == "postProcessing");
        const fs::path reportsDir =
            fs::current_path() / (postProc ? "postProcessing" : "reports");
        fs::create_directories(reportsDir);
        // The solved instant <n> for the postProcessing/<report>/<n>/ tree:
        // the highest-numbered instant dir at the case root (the converged
        // pseudo-time), or 0 when solutionControl wrote no instants.
        int instant = 0;
        if (postProc)
        {
            std::error_code ec;
            for (const auto& e : fs::directory_iterator(fs::current_path(), ec))
            {
                if (!e.is_directory()) continue;
                const std::string nm = e.path().filename().string();
                if (nm.empty() || !std::all_of(nm.begin(), nm.end(),
                        [](char c){ return std::isdigit(static_cast<unsigned char>(c)); }))
                    continue;
                if (!fs::exists(e.path() / "streamFaces")) continue;
                try { instant = std::max(instant, std::stoi(nm)); }
                catch (const std::exception&) {}
            }
        }
        ReportContext rctx{
            result, thermoForReports, flowsheetDict, reportsDir, verbosity,
            postProc, instant
        };
        if (verbosity >= 2)
            std::cout << "\nReports (-> " << reportsDir.string() << "):\n";
        auto chain = Report::buildChain(reportsDict);
        for (auto& [rep, opts] : chain) rep->run(opts, rctx);
    };

    // ---- converged/ writer (stream-state architecture, 2026-07-06) ------
    //  Persist the converged steady state as one file per stream, canonical
    //  componentFlows grammar, under converged/SECTOR/.../stream.  This is the
    //  disk truth a topological drill-in materialises a child 0/ from
    //  (docs/architecture/stream-state-architecture.md).  Only on convergence.
    //  OWNERSHIP (arch doc 8.4): a stream lives FLAT under its owning SECTOR --
    //  `<dir>/SECTOR/streamName` (no unit sub-path).  Internal / inter-sector /
    //  external-outlet streams are owned by their PRODUCING sector; an external
    //  inlet (a feed) by its CONSUMING sector.  Built from the flattened
    //  topology: unit `SECTOR.op` -> its outputs owned by SECTOR; a feed (an
    //  input produced by nobody) owned by the sector that consumes it.
    auto sectorOwnedPaths = [](const SimulationResult& result)
        -> std::map<std::string, fs::path>
    {
        // THE one rule is StreamOwnership::canonicalManifest (forum #83) --
        // the same call the pre-solve reader makes, so the writer, the
        // validator and the reader can never disagree about which file
        // carries which stream.  Here we only project the result's names.
        std::set<std::string> names;
        for (const auto& [name, s] : result.streams)
        { (void) s; names.insert(name); }
        return StreamOwnership::canonicalManifest(
            result.topology, names, result.boundaryAliases);
    };

    auto writeConverged = [&](const SimulationResult& result) {
        if (!result.converged) return;
        ThermoPackage tp;
        tp = ThermoPackageBuilder::build(packageDict, db, chemPtr);
        const fs::path dir = fs::current_path() / "converged";
        fs::remove_all(dir);                 // stale state must never linger
        StreamStateIO::writeStateDir(result.streams, tp, dir, sectorOwnedPaths(result));
        if (verbosity >= 2)
            std::cout << "[state] wrote converged/ -- (sector-owned, componentFlows)\n";
    };

    // ---- 0/ COMPLETENESS validator (arch doc rule 8.2, no heuristics) ------
    //  When the case ran from a `0/` state directory, the graph's stream IDs
    //  must correspond EXACTLY to the state files: N declared streams == N files.
    //  A MISSING file (a graph stream with no state) or an ORPHAN file (a state
    //  with no graph stream) is FATAL -- the completeness contract.  Skipped for
    //  the legacy streams{} path (no 0/).
    auto validate0 = [&](const SimulationResult& result) -> bool {
        if (!fs::exists("0") || !fs::is_directory("0")) return true;
        auto owned = sectorOwnedPaths(result);              // stream -> 0/ path
        std::set<std::string> expected, actual;
        for (const auto& [nm, p] : owned) expected.insert(p.generic_string());
        for (const auto& e : fs::recursive_directory_iterator("0"))
        {
            if (!e.is_regular_file() || e.path().filename() == "manifest.dat") continue;
            std::ifstream probe(e.path());
            std::string body((std::istreambuf_iterator<char>(probe)), {});
            if (!StreamStateIO::looksLikeStreamState(body)) continue;  // not a state file
            actual.insert(fs::relative(e.path(), "0").generic_string());
        }
        std::vector<std::string> missing, orphan;
        for (const auto& x : expected) if (!actual.count(x)) missing.push_back(x);
        for (const auto& x : actual)   if (!expected.count(x)) orphan.push_back(x);
        if (missing.empty() && orphan.empty())
        {
            if (verbosity >= 2)
                std::cout << "[state] 0/ complete: " << expected.size()
                          << " graph stream IDs == " << actual.size() << " state files\n";
            return true;
        }
        std::cerr << "\nERROR: 0/ COMPLETENESS violated (graph stream IDs != 0/ state files):\n";
        for (const auto& m : missing) std::cerr << "  MISSING  0/" << m << "  (graph stream, no state file)\n";
        for (const auto& o : orphan)  std::cerr << "  ORPHAN   0/" << o << "  (state file, no graph stream)\n";
        return false;
    };

    int finalRc = 0;

    // ---- choupo-init0: materialise 0/ and leave.  No solve, no reports, no
    //      converged/ writer, no result JSON -- this is a PREPARATION step.
    if (init0Mode)
    {
        auto r = runSimulation(flowsheetDict, db, packageDict,
                               chemPtr, solverDict, reactionsDict, verbosity,
                               nullptr, true, init0Force);
        return r.converged ? 0 : 1;
    }

    if (outerDict)
    {
        // Layer 2: outer driver controls the simulator.  (The old
        // streams{}-steering guard is gone with the legacy reader: a dict
        // carrying `streams {}` now REFUSES inside the Flowsheet itself.)
        //
        // outerDriver + builder propertyPackage works with NO extra wiring:
        // runSimulation() rebuilds the package from packageDict on EVERY
        // evaluation (ThermoPackageBuilder::build above), so each pass is a
        // pure function of its inputs.  No concrete driver mutates the
        // thermo dict -- Sweep/GridSweep/DesignSpec/Optimization clone and
        // mutate the flowsheetDict only.  Fitting drivers that vary property
        // PARAMETERS between passes are a separate feature (they will
        // deepCopy the manifest and rebuild per evaluation, same semantics).
        auto driver = OuterDriver::New(outerDict);
        driver->setSimulator     (simulate);
        driver->setFlowsheetDict (flowsheetDict);
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
            if (!validate0(r)) finalRc = 1;
            writeConverged(r);
        }
    }
    else
    {
        // Direct: one simulator pass
        auto result = simulate(flowsheetDict, StreamOverrides{});
        finalRc = result.converged ? 0 : 1;

        // Layer 3: optional post-processing on the result
        if (postDict)
        {
            auto chain = PostProcessor::buildChain(postDict);
            for (auto& pp : chain) pp->run(result);
        }

        // Layer 3b: controlDict `reports {... }` chain.
        runReports(result);
        if (!validate0(result)) finalRc = 1;
        writeConverged(result);

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
