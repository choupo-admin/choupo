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
    Choupo::views

Description
    THE VIEWS OF A PROPS RUN -- the figures and tables a reviewer scans to
    decide (DEV.md 4c C147, and its design in C149: "o choupoProps ... e
    um companion para o engenheiro que cria o seu data set no laboratorio
    ... o GUI so serve para o utilizador rever").  THREE LAYERS, all in the
    propsDict an AI writes whole: the DATA (constant/experimental/...,
    constant/reference/...), the OPERATIONS over it, and the VIEWS.

    EVERY OPERATION PUBLISHES ITS DEFAULT VIEWS with nothing declared -- its
    own, written by the op in this grammar (PropertyOperation::defaultViews:
    a bench's model curves, a dataset's per-row quantities), and the ones
    any fit earns (parity and residuals from a `fitPoints` table, the
    parameter table from its fit.<p>.* diagnostics).  EXTRA views are a
    `views ( ... );` block of the propsDict, over what the run PUBLISHES --
    an op's diagnostics, its published tables (core/PublishedTable.H), and
    case-local `references ( ... )` under constant/ with their citation:

        views
        (
            {   name gamma; type series;              // series | profile |
                op table1; table rows;                 //  parity | residuals |
                select { C_b_dye_molm3 4; }            //  table
                x C_b_Cl_molm3; y ( Gamma_dye Gamma_Na Gamma_Cl );
                overlay ( { name exp; label "measured"; reference bm;
                            x cCl_molm3; y Robs; yError dRobs; } );
            }
        );

    (the long form names each series -- `series ( { name; label; op|ops|
    reference|difference; x; y; ... } )`; the grammar in full is
    docs/design/a-post-processing-dictionary.md, section 3).

    THE READER REFUSES every name it cannot resolve, listing what IS
    published (an operation, a diagnostic, a table, a column, a reference,
    a series a difference names) and every key nothing reads; it holds a
    unit the source publishes to the one declared (one change of SCALE is
    made, never a model: a temperature published in K is drawn on an axis
    declared in degC or degF through units::fromSI, DEV.md 4c C182), and an
    axis that declares none takes the one its series publish.  It writes each view to
    postProcessing/<op>/<view>.csv (postProcessing/case/ for a view drawing
    several operations) and its description to <view>.json beside it, and
    returns the descriptions as the result JSON's `postProcessing` block --
    what the Props review screen draws.  The GUI computes nothing.

    TWO PHASES.  The declared views are parsed BEFORE the operations run
    (a typo must not cost the run it guards); the defaults and every name
    of a published thing are resolved after them.
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
namespace views {

//- What one operation of the run published, as the reader sees it.
struct Publication
{
    std::string name;                               // the op's name
    std::string type;                               // its type word
    std::map<std::string, scalar> diagnostics;
    std::map<std::string, std::string> units;       // diagnostic -> unit ("" = none)
    std::map<std::string, std::string> labels;      // diagnostic -> its name, where the key is not
    std::vector<PublishedTable> tables;
    std::string defaultViews;                       // the op's own, in this grammar
};

//- The root every view is written under, relative to the case.
inline const char* outputDir() { return "postProcessing"; }
//- The files the last run wrote, so the next removes exactly those.
inline const char* indexFile() { return "postProcessing/views.index"; }

class Reader
{
public:
    //  Parse the propsDict's `references` and `views`.  `declaredOps` are its
    //  operation names, in order: a view's op must be one of them.  Throws a
    //  refusal naming what is wrong.
    Reader(const DictPtr& propsDict, const std::vector<std::string>& declaredOps);
    ~Reader();

    //  Add each operation's default views, resolve every view against the
    //  run's publications, write the CSVs and sidecars, print the tables, and
    //  return the result-JSON block body (a JSON object), or "" when the run
    //  has no view at all.  Throws a refusal naming the unresolved name.
    std::string evaluate(const std::vector<Publication>& published, int verbosity);

private:
    struct Impl;
    std::unique_ptr<Impl> impl_;
};

//- Remove the view files the last run wrote (postProcessing/views.index).
void clearStale();

} // namespace views
} // namespace Choupo
