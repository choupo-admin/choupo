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
    choupoProps

Description
    Physical-property service + parameter-fitting workbench.

    Unlike choupoSolve / choupoBatch / choupoCtrl, this binary does
    NOT simulate a flowsheet.  It evaluates property functions
    f(T, P, x, params) over points, scans and surfaces, and ajusta
    parameters to data.

        case/
          system/
            controlDict           -- verbosity, output formatting
            propsDict             -- list of property operations to run
          constant/
            propertyDict          -- components + γ-φ + EoS models

    Usage:   choupoProps [case_dir]
\*---------------------------------------------------------------------------*/

#include "AadCompare.H"
#include "core/Banner.H"
#include "core/Dictionary.H"
#include "core/ResultEmitter.H"
#include "core/ThermoResolution.H"
#include "core/Units.H"
#include "propertyOps/PropertyOperation.H"
#include "propertyOps/ConstantEstimator.H"
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

#include <cmath>
#include <filesystem>
#include <fstream>
#include <iomanip>
#include <iostream>
#include <sstream>
#include <stdexcept>
#include <string>

using namespace Choupo;
namespace fs = std::filesystem;

// Build-time user-types hook (mirrors choupoSolve).  The normal binary links
// the empty stub (registerUserTypesStub.cpp); bin/buildCode instead links a
// case's own code/, so a student can register a CUSTOM PropertyOperation --
// their OWN property-estimation method -- with no runtime dlopen, no macros.
void registerUserTypes();

namespace {

// Emit the pre-solve GAP REPORT: the machine-readable JSON an author-time LLM
// reads to advise the student (which compounds are missing/estimating which
// properties).  Pure read-out of the assembled package -- NO solve, no estimate.
void emitGapReport(const ThermoPackage& thermo, std::ostream& os)
{
    auto js = [](const std::string& s) {     // minimal JSON string escape
        std::string o; o.reserve(s.size() + 2);
        for (char c : s) { if (c == '"' || c == '\\') o += '\\'; o += c; }
        return o;
    };
    bool anyGap = false;
    os << "{\n  \"gapReport\": {\n    \"models\": { \"eos\": \""
       << js(thermo.hasEos() ? thermo.eos().modelName() : "none")
       << "\", \"activity\": \"" << js(thermo.activity().modelName()) << "\" },\n";

    os << "    \"components\": [\n";
    const auto& comps = thermo.components();
    for (std::size_t i = 0; i < comps.size(); ++i)
    {
        const auto& c = comps[i];
        const bool criticals = c.Tc() > 0.0 && c.Pc() > 0.0;
        const bool psat = c.hasVaporPressure();
        const bool cpig = c.hasCpIdealGas();
        const bool gibbs = c.hasGibbsData();
        const bool vliq = c.Vliq() > 0.0;
        const bool nonvol = c.isNonvolatile();
        const std::string status = c.provenanceFor("status").raw;
        const bool unverified = status.find("UNVERIFIED") != std::string::npos
                             || status.find("ESTIMATE")   != std::string::npos;
        std::vector<std::string> missing;
        if (!criticals)            missing.push_back("criticals");
        if (!psat && !nonvol)      missing.push_back("vaporPressure");
        if (!cpig)                 missing.push_back("cpIdealGas");
        if (!gibbs)                missing.push_back("gibbsFormation");
        if (!missing.empty() || unverified) anyGap = true;
        os << "      { \"name\": \"" << js(c.name()) << "\""
           << ", \"unverified\": " << (unverified ? "true" : "false")
           << ", \"status\": \"" << js(status) << "\""
           << ", \"have\": { \"criticals\": " << (criticals?"true":"false")
           << ", \"vaporPressure\": " << (psat?"true":"false")
           << ", \"cpIdealGas\": " << (cpig?"true":"false")
           << ", \"gibbsFormation\": " << (gibbs?"true":"false")
           << ", \"vliq\": " << (vliq?"true":"false")
           << ", \"nonvolatile\": " << (nonvol?"true":"false") << " }"
           << ", \"missing\": [";
        for (std::size_t m = 0; m < missing.size(); ++m)
            os << (m?", ":"") << "\"" << missing[m] << "\"";
        os << "]";
        // Which group decompositions the compound carries -- the recipe the LLM
        // forwards to a deterministic estimator (never invents).
        const auto methods = c.groupMethods();
        os << ", \"groups\": [";
        for (std::size_t m = 0; m < methods.size(); ++m)
            os << (m?", ":"") << "\"" << js(methods[m]) << "\"";
        os << "]";
        // MW-sum consistency on the stored Joback decomposition (the best automatic
        // catch for a WRONG decomposition): re-run Joback, compare summed MW to the
        // declared MW.  A guard at the validation boundary -- never the hot path.
        if (c.hasGroups("joback"))
        {
            auto est = ConstantEstimator::New("Joback");
            bool gok = false; std::string ge;
            const auto ce = est->estimate(c.groupsFor("joback"), gok, ge);
            std::string gc = "unknown-group";
            if (gok && c.MW() > 0.0)
            {
                double d = ce.MW - c.MW(); if (d < 0) d = -d;
                const bool ok2 = d / c.MW() < 0.02;
                gc = ok2 ? "mw-ok" : "MW-MISMATCH";
                if (!ok2) anyGap = true;
            }
            os << ", \"groupCheck\": \"" << gc << "\"";
        }
        os << " }" << (i + 1 < comps.size() ? "," : "") << "\n";
    }
    os << "    ],\n";

    os << "    \"modelGaps\": [\n";
    const auto& f = thermo.auditFindings();
    if (!f.empty()) anyGap = true;
    for (std::size_t i = 0; i < f.size(); ++i)
        os << "      { \"model\": \"" << js(f[i].model) << "\", \"component\": \""
           << js(f[i].component) << "\", \"property\": \"" << js(f[i].property)
           << "\", \"kind\": \"" << js(f[i].kind) << "\" }"
           << (i + 1 < f.size() ? "," : "") << "\n";
    os << "    ],\n";

    os << "    \"verdict\": \"" << (anyGap ? "has-gaps" : "clean") << "\"\n";
    os << "  }\n}\n";
}

} // namespace

int main(int argc, char** argv)
try
{
    bool gapReport = false;
    for (int gi = 1; gi < argc; ++gi)
        if (std::string(argv[gi]) == "--gap-report") gapReport = true;
    if (!gapReport) printBanner("  props");   // clean stdout for the JSON consumer

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
    PropertyOperation ::registerBuiltins();
    ConstantEstimator ::registerBuiltins();   // estimateComponent's `model` slot
    registerUserTypes();          // case-local property ops (empty by default)

    // Resolve argv[0] before any chdir.  Symlinks are fine; weakly_canonical
    // tolerates non-existent suffixes which fs::canonical does not.
    const fs::path argv0 = fs::weakly_canonical(fs::absolute(fs::path(argv[0])));

    // Args: the case directory (defaults to cwd) + optional flags.
    //   --gap-report : assemble the thermo package, emit the pre-solve GAP REPORT
    //                  (the artifact an author-time LLM reads), and exit -- NO solve.
    fs::path caseArg;   // gapReport already parsed above (before the banner)
    for (int i = 1; i < argc; ++i)
    {
        const std::string a = argv[i];
        if (a != "--gap-report" && caseArg.empty()) caseArg = a;
    }
    const fs::path caseDir = caseArg.empty() ? fs::current_path() : caseArg;
    if (!fs::is_directory(caseDir))
        throw std::runtime_error("choupoProps: not a directory: "
                                 + caseDir.string());
    fs::current_path(caseDir);

    // Locate the data root (which contains standards/components).  The
    // Database expects `data/`, NOT `data/standards/`, so we hand it the
    // parent.  Same fallback chain as choupoSolve.
    fs::path dataRoot;
    if (const char* env = std::getenv("CHOUPO_HOME"))
    {
        fs::path p = fs::path(env) / "data";
        if (fs::is_directory(p / "standards" / "components")) dataRoot = p;
    }
    if (dataRoot.empty())
    {
        fs::path here = argv0.parent_path();
        while (!here.empty() && here != here.root_path())
        {
            if (fs::is_directory(here / "data" / "standards" / "components"))
            { dataRoot = here / "data"; break; }
            here = here.parent_path();
        }
    }
    Database db(dataRoot.empty() ? "" : dataRoot.string());

    // --- Dictionaries ---------------------------------------------------
    //  Cascade resolution (fractal), identical to choupoSolve: a sector node
    //  may omit the controlDict / propertyDict it inherits from a PARENT
    //  folder level --- walk UP the tree until found (capped).  The propsDict
    //  is NEVER inherited: it IS the node's own analyses.  Without this a
    //  composite sector (e.g. esterification2sector/REACTION) is a CLI dead-end.
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

    auto controlDict = Dictionary::fromFile(resolveUp("system/controlDict"));
    const int verbosity = static_cast<int>(controlDict->lookupScalarOrDefault("verbosity", 3));
    thermoAnnounceLevel() = verbosity;   // gate the load-phase thermo chorus too
    const std::string description =
        controlDict->lookupWordOrDefault("description", "");
    if (verbosity >= 2 && !description.empty())
        std::cout << "Description:       " << description << "\n"
                  << std::string(56, '-') << "\n";

    auto propsDict = Dictionary::fromFile("system/propsDict");
    ThermoResolutionLog::instance().clear();
    AdvisoryLog::instance().clear();   // capture binary-pair provenance
    ThermoPackage thermo;
    DictPtr thermoDict;   // null in the propertyPackage branch (only fit ops use it)
    // ONE name: constant/propertyDict, accepting BOTH grammars (routed by
    // content) with constant/propertyDict as a deprecated-but-read alias --
    // mirrors choupoSolve.
    std::string pkgPath = resolveUp("constant/propertyDict");
    bool deprecatedName = false;
    if (!fs::exists(pkgPath))
    {
        const std::string legacy = resolveUp("constant/propertyDict");
        if (fs::exists(legacy)) { pkgPath = legacy; deprecatedName = true; }
    }
    if (fs::exists(pkgPath))
    {
        auto sel = Dictionary::fromFile(pkgPath);
        if (deprecatedName)
            std::cout << "  [deprecated] constant/propertyDict -- rename it to"
                         " constant/propertyDict (the property package is"
                         " more than thermo).\n";
        const bool speciationPkg = sel->found("propertyMethods")
            && sel->subDict("propertyMethods")->found("aqueousActivity")
            && !sel->subDict("propertyMethods")->found("liquid");
        if (speciationPkg)
        {
            // SPECIATION package (roadmap Phase B): the case's dictionary declares the
            // electrolyte SYSTEM (aqueousActivity + inputBasis) consumed by the
            // speciate/scalingScan ops; the ThermoPackage here is just the solvent
            // basis (the op does the ion chemistry).  Build it lean -- no liquid /
            // vapour manifest required.
            if (verbosity >= 2)
                std::cout << "Property package:  constant/propertyDict"
                             "   (electrolyte speciation: aqueousActivity + inputBasis)\n";
            thermoDict = sel;
            // The op consumes aqueousActivity + inputBasis from `sel`; the
            // ThermoPackage here is the (ideal) basis over ALL the package's
            // declared components, so `components (...)` keeps the full canonical
            // list.  Ideal activity/eos are supplied here so the package file itself
            // stays clean of a degenerate `activityModel ideal`.
            std::string manifest = "components ( ";
            for (const auto& c : sel->lookupWordList("components")) manifest += c + " ";
            manifest += "); activityModel { model ideal; } "
                        "equationOfState { model idealGas; }";
            auto basis = Dictionary::fromString(manifest, "<speciation-basis>");
            thermo.readFromDict(basis, db);
        }
        else if (sel->found("components") && sel->found("propertyMethods"))
        {
            if (verbosity >= 2)
                std::cout << "Property package:  INLINE in the case"
                             "   (constant/propertyDict carries the full"
                             " manifest)\n";
            thermo = ThermoPackageBuilder::build(sel, db);   // rich MANIFEST
        }
        else if (sel->found("components"))
        {
            if (verbosity >= 2)
                std::cout << "Property package:  constant/propertyDict"
                             "   (flat form: activityModel/equationOfState)\n";
            thermoDict = sel;
            thermo.readFromDict(sel, db);                    // FLAT form
        }
        else
        {
            const std::string pkgName = sel->lookupWord("package");
            const fs::path rec = fs::path(Database::currentRoot())
                                     / "standards" / "propertyPackages" / (pkgName + ".dat");
            auto pkgDict = Dictionary::fromFile(rec.string());
            if (verbosity >= 2)
                std::cout << "Property package:  " << pkgName
                          << "   (record: data/standards/propertyPackages/"
                          << pkgName << ".dat)\n";
            thermo = ThermoPackageBuilder::build(pkgDict, db);   // SELECTOR
        }
    }

    // GAP REPORT mode: emit the pre-solve gap JSON the author-time LLM consumes,
    // then exit -- never runs an operation (the artifact is read-only honesty).
    if (gapReport)
    {
        emitGapReport(thermo, std::cout);
        return 0;
    }

    if (verbosity >= 2)
    {
        std::cout << "Thermo package:    " << thermo.n() << " components, EoS = "
                  << thermo.eos().modelName() << "\n";
        std::cout << "  components:     ";
        for (std::size_t i = 0; i < thermo.n(); ++i)
            std::cout << thermo.comp(i).name() << " ";
        std::cout << "\n\n";
    }

    // Auditability (B2): the WHY behind each decision.  Pull the op's declared
    // model, rationale, and source/provenance so the result JSON -- and the GUI
    // decision ledger -- can show whether a choice is justified (fitted /
    // literature) or an undeclared guess.
    auto opProvenance = [](const DictPtr& opDict) -> std::map<std::string, std::string>
    {
        std::map<std::string, std::string> p;
        // Which model did this op use? (per-op thermo override, else its own model word)
        if (opDict->found("thermo") && opDict->subDict("thermo")->found("activityModel"))
            p["model"] = opDict->subDict("thermo")->subDict("activityModel")
                            ->lookupWordOrDefault("model", "");
        else if (opDict->found("model"))
            p["model"] = opDict->lookupWordOrDefault("model", "");
        if (opDict->found("rationale")) p["rationale"] = opDict->lookupWordOrDefault("rationale", "");
        std::string src = opDict->lookupWordOrDefault("source", "");
        if (src.empty() && opDict->found("provenance"))
            src = opDict->subDict("provenance")->lookupWordOrDefault("source", "");
        p["source"] = src.empty() ? "undeclared" : src;
        return p;
    };

    // --- Run each operation in order ------------------------------------
    int overallRc = 0;
    auto opsList = propsDict->lookupDictList("operations");
    struct OpResult { std::string name, type; std::map<std::string, scalar> diag;
                      std::map<std::string, std::string> prov;
                      std::vector<std::string> head; };
    std::vector<OpResult> opResults;
    for (std::size_t k = 0; k < opsList.size(); ++k)
    {
        const auto& opDict = opsList[k];
        const std::string opType = opDict->lookupWord("type");
        const std::string opName =
            opDict->lookupWordOrDefault("name", opType + "_" + std::to_string(k));

        if (verbosity >= 2)
            std::cout << ">>>  Operation [" << k << "]:  " << opName
                      << "   (type = " << opType << ")\n";

        auto op = PropertyOperation::New(opType);
        op->setThermoDict(thermoDict);
        op->setDatabase(&db);
        const int rc = op->run(opDict, thermo, verbosity);
        if (rc != 0)
        {
            std::cerr << "*** Operation '" << opName << "' returned rc = "
                      << rc << "\n";
            overallRc = rc;
        }
        opResults.push_back({ opName, opType, op->diagnostics(), opProvenance(opDict),
                              op->headline() });
    }

    // --- Experimental datasets: echo each to a CSV in the case dir -------
    // "See, then decide": raw LAB data must be overlaid on the model curves so
    // the student chooses a model from EVIDENCE.  We declare datasets in the
    // propsDict `experimental ( ... )` list (dict-on-disk, no GUI upload) and
    // echo each as `exp_<name>.csv`; the GUI's CSV harvest picks it up through
    // the existing channel (no new transport) and renders it as overlay points.
    struct ExpDataset { std::string name, kind, component, source, citation;
                        std::size_t nPoints = 0; };
    std::vector<ExpDataset> expDatasets;

    // Validation weapon: AAD of each named model vs the measured dataset.
    struct ValBlock { std::string name, abscissa; std::vector<AadRecord> recs; };
    std::vector<ValBlock> validation;

    // SI unit label of a dataset column from its declared source unit -- so the
    // AAD pass classifies by UNIT (affine -> temperature/K; dimensionless ->
    // fraction; pressure -> Pa; else -> "SI"), not by a name guess.
    auto siLabel = [](const std::string& u) -> std::string
    {
        if (u == "-" || u == "frac" || u == "[-]" || u == "dimensionless"
            || u == "none" || u == "mol/mol") return "-";
        auto sp = units::lookupUnit(u);
        if (sp && sp->affine) return "K";
        if (u == "Pa" || u == "kPa" || u == "bar" || u == "mbar"
            || u == "atm" || u == "MPa") return "Pa";
        return "SI";
    };
    if (propsDict->found("experimental"))
    {
        for (const auto& e : propsDict->lookupDictList("experimental"))
        {
            const std::string name = e->lookupWord("name");
            // `dataset` is OPTIONAL (docs/ai/patterns.md S12): an experimental
            // entry with only `models ( ... )` is a pure MODEL-vs-MODEL overlay
            // -- the GUI reads `models` straight from the propsDict and overlays
            // the model curves; there is no lab dataset for the engine to emit.
            // (Was lookupWord("dataset") with NO default, OUTSIDE the try below,
            // so a dataset-less entry aborted the whole run -- the bug.)
            const std::string dsPath = e->lookupWordOrDefault("dataset", "");
            const std::string kind = e->lookupWordOrDefault("kind", "txy");
            const std::string comp = e->lookupWordOrDefault("component", "");
            if (dsPath.empty()) continue;   // model-only comparison: nothing to emit here
            try
            {
                auto ds = Dictionary::fromFile(dsPath);   // relative to the case dir
                ExpDataset rec;
                rec.name = name; rec.kind = kind; rec.component = comp;
                std::vector<AadRecord> aadRecs; std::string aadAbs;   // filled in the columns branch

                if (ds->found("columns"))
                {
                    // Self-describing format: write EVERY column (so the GUI's
                    // overlay has y too -> the x-y / T-y views get their lab
                    // points), each converted to canonical SI by its unit.
                    auto cols = ds->lookupDictList("columns");
                    auto grid = ds->lookupList("data");
                    const std::size_t ncc = cols.size();
                    if (ncc < 2 || grid.empty() || grid.size() % ncc != 0)
                        throw std::runtime_error("dataset 'columns'+'data' grid mismatch");
                    std::vector<std::string> cname(ncc), cunit(ncc);
                    for (std::size_t j = 0; j < ncc; ++j)
                    { cname[j] = cols[j]->lookupWord("name"); cunit[j] = cols[j]->lookupWord("unit"); }
                    auto conv = [](scalar v, const std::string& u) -> scalar
                    {
                        if (u == "frac" || u == "-" || u == "[-]" || u == "dimensionless"
                            || u == "none" || u == "mol/mol") return v;
                        auto sp = units::lookupUnit(u);
                        if (!sp) return v;
                        return sp->affine ? units::affineToK(v, u) : v * sp->factor;
                    };
                    std::ofstream csv("exp_" + name + ".csv");
                    for (std::size_t j = 0; j < ncc; ++j) csv << (j ? "," : "") << cname[j];
                    csv << "\n";
                    const std::size_t rows = grid.size() / ncc;
                    for (std::size_t r = 0; r < rows; ++r)
                    {
                        for (std::size_t j = 0; j < ncc; ++j)
                            csv << (j ? "," : "") << conv(grid[r * ncc + j], cunit[j]);
                        csv << "\n";
                    }
                    rec.nPoints = rows;
                    csv.close();   // flush before the AAD pass re-reads it

                    // Validation weapon: AAD of each named model vs this measured
                    // dataset.  COLUMNS FORMAT ONLY -- the legacy 2-column branch
                    // writes values RAW (not canonical SI), so trusting them here
                    // would yield a plausible but catastrophically wrong AAD; that
                    // branch is left out (no validation emitted) by construction.
                    auto models = e->found("models") ? e->lookupWordList("models")
                                                     : std::vector<std::string>{};
                    if (!models.empty())
                    {
                        std::vector<std::string> siu(ncc);
                        for (std::size_t j = 0; j < ncc; ++j) siu[j] = siLabel(cunit[j]);
                        std::vector<std::string> mpaths;
                        for (const auto& mn : models)
                        {
                            std::string p;
                            for (const auto& od : opsList)
                                if (od->lookupWordOrDefault("name", "") == mn && od->found("output"))
                                { p = od->subDict("output")->lookupWordOrDefault("file", ""); break; }
                            mpaths.push_back(p);
                        }
                        aadRecs = computeAad("exp_" + name + ".csv", siu, mpaths, models);
                        aadAbs  = cname[0];
                    }
                }
                else
                {
                auto flat = ds->lookupList("data");
                if (flat.empty() || flat.size() % 2 != 0)
                    throw std::runtime_error("dataset 'data' must be a flat even list");

                // Column headers chosen so the GUI's findColumn aliases match
                // the model-scan axes (x[<comp>] / T_bubble / c_<comp>).
                std::string c0, c1;
                if (kind == "kinetics") { c0 = "time"; c1 = comp.empty() ? "c" : "c_" + comp; }
                else /* txy/xy/scan */  { c0 = comp.empty() ? "x" : "x[" + comp + "]"; c1 = "T_bubble"; }

                std::ofstream csv("exp_" + name + ".csv");
                csv << c0 << "," << c1 << "\n";
                for (std::size_t k = 0; k + 1 < flat.size(); k += 2)
                    csv << flat[k] << "," << flat[k + 1] << "\n";
                rec.nPoints = flat.size() / 2;
                }

                // Provenance (B1): the entry's `source` + the dataset file's own
                // `provenance { source; citation; }` block -- so un-cited / made-up
                // data is visible, not silently as polished as a defended set.
                rec.source = e->lookupWordOrDefault("source", "");
                if (ds->found("provenance"))
                {
                    auto pv = ds->subDict("provenance");
                    if (rec.source.empty()) rec.source = pv->lookupWordOrDefault("source", "");
                    rec.citation = pv->lookupWordOrDefault("citation", "");
                }
                if (rec.source.empty()) rec.source = "undeclared";
                expDatasets.push_back(rec);

                if (verbosity >= 2)
                    std::cout << ">>>  Experimental dataset '" << name << "' ("
                              << rec.nPoints << " points, kind " << kind
                              << ", source " << rec.source << ") -> exp_" << name << ".csv\n";

                // Validation table (AAD vs measured) + store for the JSON emit.
                if (!aadRecs.empty())
                {
                    if (verbosity >= 2)
                    {
                        std::cout << ">>>  Validation '" << name << "' (abscissa "
                                  << aadAbs << ", " << rec.nPoints << " measured pts):\n";
                        for (const auto& a : aadRecs)
                        {
                            if (a.property.empty())
                            { std::cout << "       " << std::left << std::setw(12) << a.model
                                        << " --  status: " << a.status
                                        << (a.note.empty() ? "" : " (" + a.note + ")")
                                        << " -- no AAD\n" << std::right; continue; }
                            std::cout << "       " << std::left << std::setw(11) << a.model
                                      << std::setw(13) << a.property << std::right << ": ";
                            if (a.hasAbs || a.hasRel)
                            {
                                if (a.hasAbs) std::cout << "AAD " << a.aadAbs << " " << a.unit;
                                if (a.hasRel) std::cout << (a.hasAbs ? "  rel " : "AAD rel ")
                                                        << a.aadRelPct << "%";
                                std::cout << "   (" << a.nUsed << "/" << a.nMeas << " pts)";
                                if (a.status != "ok") std::cout << "  [" << a.status << "]";
                            }
                            else std::cout << "no AAD  [" << a.status << "]";
                            std::cout << "\n";
                            if (a.nOutOfRange > 0)
                                std::cout << "       [!] " << a.nOutOfRange << " of " << a.nMeas
                                          << " measured pts outside model range -- EXCLUDED\n";
                        }
                    }
                    validation.push_back({ name, aadAbs, aadRecs });
                }
            }
            catch (const std::exception& ex)
            {
                // Never halt a run over a bad dataset -- warn and skip.
                std::cerr << "*** experimental '" << name << "': " << ex.what()
                          << " (skipped)\n";
            }
        }
    }

    // --- Structured result emitter (JSON) -------------------------------
    // D-c (forum #67/#73): announced BEFORE the JSON stream opens -- an
    // announcement inside the result block corrupts the machine channel.
    announceProvenanceConsumption(ThermoResolutionLog::instance().entries());
    std::cout << "\n<<<Choupo:result-begin>>>\n{\n";
    std::cout << "  \"binary\": \"choupoProps\",\n";
    std::cout << "  \"caseDir\": \"" << caseDir.string() << "\",\n";
    std::cout << "  \"components\": [";
    for (std::size_t i = 0; i < thermo.n(); ++i)
        std::cout << (i ? ", " : "") << "\""
                  << thermo.comp(i).name() << "\"";
    std::cout << "],\n";
    std::cout << "  \"eos\": \"" << thermo.eos().modelName() << "\",\n";
    std::cout << "  \"operations\": [";
    for (std::size_t k = 0; k < opsList.size(); ++k)
        std::cout << (k ? ", " : "") << "\""
                  << opsList[k]->lookupWordOrDefault("name",
                       opsList[k]->lookupWord("type") + "_" + std::to_string(k))
                  << "\"";
    std::cout << "],\n";

    // Per-operation diagnostics (fit stats, scan counts, ...) -- the GUI
    // Fit view reads these (chi2, reduced chi2, RMS, per-parameter stderr +
    // t95 CI, the correlation matrix, the condition-number proxy).
    std::cout << "  \"operationResults\": [";
    for (std::size_t k = 0; k < opResults.size(); ++k)
    {
        const auto& orr = opResults[k];
        std::cout << (k ? ", " : "") << "\n    { \"name\": \"" << orr.name
                  << "\", \"type\": \"" << orr.type << "\", \"diagnostics\": {";
        std::size_t i = 0;
        for (const auto& [key, val] : orr.diag)
        {
            // Drop non-finite values (a NaN stderr from an ill-conditioned
            // fit) -- "nan"/"inf" tokens are invalid JSON; absence => GUI "--".
            if (!std::isfinite(val)) continue;
            std::cout << (i++ ? ", " : "") << "\"" << key << "\": " << val;
        }
        std::cout << "}";
        if (!orr.head.empty())
        {
            std::cout << ", \"headline\": [";
            for (std::size_t h = 0; h < orr.head.size(); ++h)
                std::cout << (h ? ", " : "") << "\"" << orr.head[h] << "\"";
            std::cout << "]";
        }
        std::cout << ", \"provenance\": {";
        std::size_t j = 0;
        for (const auto& [key, val] : orr.prov)
            std::cout << (j++ ? ", " : "") << "\"" << key << "\": \"" << val << "\"";
        std::cout << "} }";
    }
    std::cout << "\n  ]";

    // Binary-pair resolution provenance (feeds the GUI foundation navigator +
    // pair-coverage matrix): where each NRTL pair came from + its source tag.
    const auto& resln = ThermoResolutionLog::instance().entries();
    // advisories (forum #75-1/#77-6): the ONE shared emitter.
    std::cout << advisoriesJson(AdvisoryLog::instance().entries());
    std::cout << ",\n  \"thermoResolution\": [";
    for (std::size_t i = 0; i < resln.size(); ++i)
    {
        const auto& p = resln[i];
        std::cout << (i ? "," : "") << "\n    { \"model\": " << jsonEscape(p.model)
                  << ", \"i\": " << jsonEscape(p.i) << ", \"j\": " << jsonEscape(p.j)
                  << ", \"status\": " << jsonEscape(p.status)
                  << ", \"source\": " << jsonEscape(p.source)
                  << ", \"provSource\": " << jsonEscape(p.provSource)
                  << pairResolutionAuditJson(p, jsonEscape) << " }";
    }
    std::cout << "\n  ]";

    // componentCoverage: which thermo capabilities each component carries, so
    // the props Foundation view shows ready-vs-gap (no Antoine -> no VLE) just
    // like a flowsheet case.  Read straight from the base thermo package.
    std::cout << ",\n  \"componentCoverage\": [";
    for (std::size_t i = 0; i < thermo.n(); ++i)
    {
        const auto& c = thermo.comp(i);
        auto b = [](bool v){ return v ? "true" : "false"; };
        std::cout << (i ? "," : "") << "\n    { \"name\": \"" << c.name() << "\""
                  << ", \"criticals\": "   << b(c.Tc() > 0.0 && c.Pc() > 0.0)
                  << ", \"psat\": "        << b(c.hasVaporPressure())
                  << ", \"vliq\": "        << b(c.Vliq() > 0.0)
                  << ", \"cpIdealGas\": "  << b(c.hasCpIdealGas())
                  << ", \"gibbs\": "       << b(c.hasGibbsData())
                  << ", \"nonvolatile\": " << b(c.isNonvolatile()) << " }";
    }
    std::cout << "\n  ]";

    // componentProvenance: per-value Origin + method/validity/uncertainty parsed
    // from each component's .dat `provenance {}` block (the keystone, 2026-06-06).
    // PARSE-IF-PRESENT: a component with no block emits hasProvenance:false + an
    // empty fields[] (the honest "unattributed" state).  DATA boundary only --
    // never the solver hot path.  Validation (AAD) stays its own sibling channel
    // (the GUI joins them); folding it here is deferred (data-integrity risk).
    {
        auto esc = [](const std::string& s)
        {
            std::string o = "\"";
            for (char ch : s)
            {
                switch (ch)
                {
                    case '"':  o += "\\\""; break;
                    case '\\': o += "\\\\"; break;
                    case '\n': o += "\\n";  break;
                    case '\r': o += "\\r";  break;
                    case '\t': o += "\\t";  break;
                    default:
                        if (static_cast<unsigned char>(ch) >= 0x20) o += ch;  // drop ASCII controls; pass UTF-8
                }
            }
            o += "\"";
            return o;
        };
        std::cout << ",\n  \"componentProvenance\": [";
        for (std::size_t i = 0; i < thermo.n(); ++i)
        {
            const auto& c = thermo.comp(i);
            std::cout << (i ? "," : "") << "\n    { \"name\": " << esc(c.name())
                      << ", \"hasProvenance\": " << (c.hasProvenance() ? "true" : "false")
                      << ", \"fields\": [";
            std::size_t j = 0;
            for (const auto& [field, oi] : c.provenance())
            {
                std::cout << (j++ ? "," : "") << "\n      { \"field\": " << esc(field)
                          << ", \"origin\": " << esc(originToWord(oi.origin))
                          << ", \"method\": " << (oi.method.empty() ? "null" : esc(oi.method))
                          << ", \"methodVersion\": " << (oi.methodVersion.empty() ? "null" : esc(oi.methodVersion))
                          << ", \"validity\": "
                          << (oi.hasValidity
                                ? "[" + std::to_string(oi.validityMin) + "," + std::to_string(oi.validityMax) + "]"
                                : std::string("null"))
                          << ", \"uncertainty\": " << (oi.uncertainty.empty() ? "null" : esc(oi.uncertainty))
                          << ", \"raw\": " << (oi.raw.empty() ? "null" : esc(oi.raw))
                          << " }";
            }
            std::cout << "] }";
        }
        std::cout << "\n  ]";
    }

    // Experimental-dataset provenance (B1): name/kind/component + source +
    // citation + nPoints, so the decision ledger can show whether the lab data
    // a model was judged against is cited or an undeclared paste.
    std::cout << ",\n  \"experimentalDatasets\": [";
    for (std::size_t i = 0; i < expDatasets.size(); ++i)
    {
        const auto& d = expDatasets[i];
        std::cout << (i ? "," : "") << "\n    { \"name\": " << jsonEscape(d.name)
                  << ", \"kind\": " << jsonEscape(d.kind)
                  << ", \"component\": " << jsonEscape(d.component)
                  << ", \"source\": " << jsonEscape(d.source)
                  << ", \"citation\": " << jsonEscape(d.citation)
                  << ", \"nPoints\": " << d.nPoints << " }";
    }
    std::cout << "\n  ]";

    // Validation weapon: AAD of each model vs measured data (additive array; the
    // GUI/consumers may ignore it).  A number is emitted ONLY when status=="ok"
    // (or a coverage-flagged variant); otherwise JSON null + the status reason --
    // a wrong AAD is worse than no AAD.
    {
        auto numOrNull = [](bool has, double v) -> std::string
        { if (!has || !std::isfinite(v)) return "null";
          std::ostringstream os; os << v; return os.str(); };
        std::cout << ",\n  \"validation\": [";
        for (std::size_t i = 0; i < validation.size(); ++i)
        {
            const auto& vb = validation[i];
            std::cout << (i ? "," : "") << "\n    { \"dataset\": " << jsonEscape(vb.name)
                      << ", \"abscissa\": " << jsonEscape(vb.abscissa) << ", \"aad\": [";
            for (std::size_t j = 0; j < vb.recs.size(); ++j)
            {
                const auto& a = vb.recs[j];
                std::cout << (j ? "," : "") << "\n      { \"model\": " << jsonEscape(a.model)
                          << ", \"property\": " << (a.property.empty() ? "null" : jsonEscape(a.property))
                          << ", \"kind\": " << (a.kind.empty() ? "null" : jsonEscape(a.kind))
                          << ", \"aadAbs\": " << numOrNull(a.hasAbs, a.aadAbs)
                          << ", \"aadAbsUnit\": " << (a.hasAbs ? jsonEscape(a.unit) : std::string("null"))
                          << ", \"aadRelPct\": " << numOrNull(a.hasRel, a.aadRelPct)
                          << ", \"nMeas\": " << a.nMeas << ", \"nUsed\": " << a.nUsed
                          << ", \"nOutOfRange\": " << a.nOutOfRange
                          << ", \"nNearZeroSkipped\": " << a.nNearZeroSkipped
                          << ", \"nNonFinite\": " << a.nNonFinite
                          << ", \"status\": " << jsonEscape(a.status) << " }";
            }
            std::cout << " ] }";
        }
        std::cout << "\n  ]";
    }

    std::cout << "\n}\n<<<Choupo:result-end>>>\n";

    return overallRc;
}
catch (const std::exception& e)
{
    std::cerr << "*** choupoProps fatal error: " << e.what() << "\n";
    return 1;
}
