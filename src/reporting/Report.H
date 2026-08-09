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
Class
    Choupo::Report

Description
    A *chemical-engineering report object* --- the thing the controlDict
    `reports {... }` block runs after a converged solve.  Analogous to
    a controlDict `functions {... }` block, but the
    concrete types speak the vocabulary of the discipline:

        streamTable     --  the classic flowsheet stream table
        massBalance     --  per-component in/out + closure %, per unit + global
        energyBalance   --  stream enthalpies + per-unit duty, per unit + global
        equipmentSizing --  (future; wraps the existing SizingPass)
        economics       --  (future; wraps the existing CostingPass)
        profiles        --  (future; dumps UnitProfile internals)

    Each concrete type is registered by an EXPLICIT factory (no auto-
    registration), exactly like UnitOperation / PropertyOperation /
    OuterDriver.  Reports write CSV (and later ODS) into the case's
    `reports/` directory; nothing here mutates the SimulationResult.

    Dict form (in controlDict):

        reports
        {
            streamTable    { }
            massBalance    { }
            energyBalance  { }
        }

    The block KEY is the instance name; an optional `type <name>;` inside
    selects the concrete report (defaulting to the key, so the common
    case `streamTable { }` needs no `type`).
\*---------------------------------------------------------------------------*/

#pragma once

#include "core/Dictionary.H"
#include "result/SimulationResult.H"
#include "thermo/ThermoPackage.H"

#include <filesystem>
#include <functional>
#include <map>
#include <memory>
#include <string>
#include <vector>

namespace Choupo {

class Database;
struct ChemistrySystem;

// Everything a report needs, gathered once by the application main.
//
// `result` is mutable: most reports only read it, but `design` and
// `economics` run the sizing / costing passes (which populate
// result.sizings / result.costs) before writing.  Declaration order in
// the controlDict `reports {... }` block therefore matters --- put
// `design` before `economics` (costing reads the sizes), and
// `spreadsheet` last (so its Design / Economics sheets see the data).
struct ReportContext
{
    SimulationResult&        result;
    const ThermoPackage&     thermo;
    DictPtr                  flowsheetDict;   // topology (units in/out)
    std::filesystem::path    reportsDir;      // case/reports/  (created)
    int                      verbosity = 3;

    // ---- Output layout (fractal-discipline pilot) -------------------------
    //  DEFAULT (postProcessing == false): the original `reports/<sub>/` tree;
    //  every existing case keeps its exact paths (`reports/streams/...`,
    //  `reports/balances/...`).  Opt-in (`reportsLayout postProcessing;` in
    //  controlDict): the CHT-faithful `postProcessing/<report>/<instant>/`
    //  tree (OpenFOAM functionObject convention), which keeps derived report
    //  output OUT of the way of the instant `streams` field files --- so
    //  "streams" stops being overloaded (the report's stream TABLE is now at
    //  postProcessing/streamTable/<n>/streamTable.csv, never a `streams/` dir).
    bool                     postProcessing = false;
    int                      instant        = 0;   // the solved pseudo-time <n>

    // ---- The AUDITOR's own reach into the case's DECLARED thermo ----------
    //  Added 2026-08-09 for the model-boundary ledger.  A report that audits
    //  a per-unit thermo world may NOT accept the package the unit (or
    //  `Flowsheet::thermoFor`) built -- an auditor that reuses the auditee's
    //  arithmetic checks nothing.  It must assemble that world itself, and
    //  that needs the three things `thermo` alone cannot supply: the record
    //  Database, the AUTHORED system dict a per-unit `thermo {}` fragment
    //  merges onto, and the case's active chemistry selection.  `solverDict`
    //  carries the declared convergence controls for the closure test.
    //
    //  All four are OPTIONAL.  A context without them cannot audit, and the
    //  ledger says so (`status unavailable`) with the RED alarm standing --
    //  it never falls back to a package somebody else built.
    Database*                db = nullptr;
    DictPtr                  packageDict;    // the authored v2 system
    const ChemistrySystem*   chemistry = nullptr;
    DictPtr                  solverDict;

    // Resolve a report's output directory.  `report` is the report's canonical
    // name (e.g. "streamTable", "massBalance"); `legacySub` is the historical
    // sub-folder under reports/ (e.g. "streams", "balances") --- preserved
    // byte-for-byte in the default layout.  In the postProcessing layout the
    // report-name + instant convention is used instead.  The directory is the
    // caller's to create.
    std::filesystem::path outDir(const std::string& report,
                                 const std::string& legacySub) const
    {
        if (postProcessing)
            return reportsDir / report / std::to_string(instant);
        return reportsDir / legacySub;
    }
};

class Report
{
public:
    virtual ~Report() = default;

    virtual const std::string& type() const = 0;

    // Produce the report.  `dict` is the report's own sub-dict (options).
    virtual void run(const DictPtr& dict, const ReportContext& ctx) = 0;

    using Factory = std::function<std::unique_ptr<Report>()>;
    static void registerType(const std::string& name, Factory f);
    static std::unique_ptr<Report> New(const std::string& name);
    static void registerBuiltins();

    // Build the ordered chain from a controlDict `reports {... }` block.
    // Each child dict becomes one report; its `type` defaults to the key.
    // Returns pairs of (report, optionsDict) so run() gets its options.
    static std::vector<std::pair<std::unique_ptr<Report>, DictPtr>>
    buildChain(const DictPtr& reportsDict);

private:
    static std::map<std::string, Factory>& registry();
};

} // namespace Choupo
