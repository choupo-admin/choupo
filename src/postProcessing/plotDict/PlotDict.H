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
Namespace
    Choupo::plotDict

Description
    THE POST-PROCESSING DICTIONARY (2026-10-24, DEV.md 4c C147; Vitor: "Era
    bom ter um dicionario onde se pudessem pedir plots ... pertinentes para
    pos processamento", and for the NanoFiltran paper: "Um pos processamento
    nao gera os graficos e tabelas que sao precisos para este artigo?").

    `system/plotDict` declares named PLOTS and TABLES over what the run
    PUBLISHES -- an operation's diagnostics, an operation's published tables
    (core/PublishedTable.H), and case-local REFERENCE data under `constant/`
    with its citation -- and this reader:

      * REFUSES every name it cannot resolve, listing what IS published (an
        operation, a diagnostic, a table, a column, a reference, a series
        named by a difference), and every key nobody reads (a new dict owes
        no corpus a tolerance);
      * holds every unit the source publishes to the unit the plot or table
        declares, and refuses a disagreement;
      * writes each item's numbers to `postProcessing/plotDict/<name>.csv`
        and its description (titles, units, series roles, sources) to
        `<name>.json` beside it -- a run output regenerated WHOLE every run,
        gitignored like converged/ -- and returns the same descriptions as
        the result JSON's `postProcessing` block, which is what the GUI's
        Plot workspace draws.  The GUI computes nothing: a difference column
        is computed HERE, once.

    THE GRAMMAR (the full reference is docs/design/
    a-post-processing-dictionary.md, section 3):

        references ( { name; file "constant/..."; role reference|experiment;
                       citation "..."; units { <column> "<unit>"; ... } } );
        plots      ( { name; title; xAxis { label; unit; scale linear|log; }
                       yAxis { ... }; series ( <series> ... ); } );
        tables     ( { name; title; x { label; unit; } columns ( <series> ) }
                     { name; title; columns ( { name; label; unit; } ... );
                       rows ( <row> ... ); } );

      a <series> is exactly one of
        { name; label; op <op>; table <t>; x <col>; y <col>; [select {..}] }
        { name; label; ops ( <op> ... ); x <diag>; y <diag>; }
        { name; label; reference <ref>; x <col>; y <col>; [select {..}] }
        { name; label; difference ( <a> <b> ); relative yes|no; }
      with optional `yError <col|diag>` and `style lines|markers|linesMarkers`;
      a <row> is exactly one of
        { name; label; op <op>; cells { <column> <diag>; ... } }
        { name; label; reference <ref>; select { .. }; cells { <column> <col>; } }
        { name; label; difference ( <a> <b> ); relative yes|no; }

    WHY TWO PHASES.  `parse` runs BEFORE the operations and refuses what the
    dict alone can refute (grammar, a reference file, an operation the
    propsDict does not declare); `evaluate` runs after them, when the
    diagnostics and tables exist.  A typo must not cost the run it guards.
\*---------------------------------------------------------------------------*/

#pragma once

#include "core/Dictionary.H"
#include "core/PublishedTable.H"
#include "core/Types.H"

#include <map>
#include <memory>
#include <string>
#include <vector>

namespace Choupo {
namespace plotDict {

//- What one operation of the run published, as the reader sees it.
struct Publication
{
    std::string name;                               // the op's name
    std::string type;                               // its type word
    std::map<std::string, scalar> diagnostics;
    std::map<std::string, std::string> units;       // diagnostic -> unit ("" = none)
    std::vector<PublishedTable> tables;
};

//- The directory every item is written to, relative to the case.
inline const char* outputDir() { return "postProcessing/plotDict"; }

class Reader
{
public:
    //  Parse `path` (the case's system/plotDict).  `declaredOps` are the
    //  propsDict operation names, in order: an op a series names must be
    //  one of them.  Throws a refusal naming what is wrong.
    Reader(const std::string& path, const std::vector<std::string>& declaredOps);
    ~Reader();

    //  Resolve every item against the run's publications, write the CSVs
    //  and sidecars, print the tables, and return the result-JSON block
    //  body (a JSON object).  Throws a refusal naming the unresolved name.
    std::string evaluate(const std::vector<Publication>& published, int verbosity);

private:
    struct Impl;
    std::unique_ptr<Impl> impl_;
};

//- Remove `postProcessing/plotDict/` when the case declares no plotDict: a
//  DERIVATIVE view regenerated whole must not outlive its declaration.
void clearStale();

} // namespace plotDict
} // namespace Choupo
