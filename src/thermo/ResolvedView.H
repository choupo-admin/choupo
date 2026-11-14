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
File
    src/thermo/ResolvedView.H

Description
    THE RESOLVED VIEW of a property package (DEV.md 4c C398, RULED, point 7,
    and its second and third addenda, V1-V2 and U4): printed by the engine
    once for the case's system and once for every variant a unit or an
    operation selects, BEFORE the solve, at verbosity >= 2.  For each
    property the package can be asked it prints two columns:

      CHOICE  where the choice was made -- the file's system, a named
              variant (`variants.<name>`), or the inline `thermo {}` of a
              unit or operation.  A choice belongs to the level that
              RESOLVED it, never to the level that selected the variant.
      DATA    what runs and where its data come from -- the model of each
              constituent, the mixing rule (marked "default" when the case
              wrote none) and the interaction parameters it consumes (or
              the pair it misses and what that pair is treated as), the
              density route per component, the energy basis and each
              phase's enthalpy route with the excess or departure terms.

    Every line begins with `[properties]`, so a reader (or a byte-identity
    check) can take the view out of a log with one filter.  The view READS
    the package's own objects (what runs) and a deep COPY of the resolved
    dictionary (where it was decided), so printing it marks nothing read
    and changes nothing: the unread-key audit after the run still sees what
    the builder did not read.  Nothing here goes into the result JSON yet.

    What it does not show yet, and says so: the form of a law with its
    coefficient units (the law types do not declare them: slice (b), U3);
    the line in the file where a choice was made (the parser keeps no line
    numbers); the liquid-density method per constituent SET, which the
    kernel decides at the set's first request and the [liquid properties]
    table prints after the run.
\*---------------------------------------------------------------------------*/

#pragma once

#include "core/Dictionary.H"

#include <ostream>
#include <string>
#include <vector>

namespace Choupo {

class ThermoPackage;

namespace resolvedView {

struct Choice
{
    std::string system;     // the base, e.g. "system (constant/thermoPhysPropDict)"
    std::string variant;    // "variants.line", "inline thermo{} of unit 'P1'", "" for the system itself
    DictPtr     fragment;   // the variant's (or inline fragment's) body; null for the system
    //  A base that `inherits` a parent: the file AS WRITTEN, so a block it
    //  declares is attributed to it and any other to the parent.
    DictPtr     localFile;
    std::string inherited;  // e.g. "plant system, through `inherits` (../../constant)"
};

//  Print the view of `pkg`, the package built from `resolved` (the system,
//  or the system with the variant applied).  `selectedBy` names the units
//  and operations that selected it (empty for the system).
void print(std::ostream& os, const std::string& title, const ThermoPackage& pkg,
           const DictPtr& resolved, const Choice& choice,
           const std::vector<std::string>& selectedBy);

//  The Choice of a case's own system: the file it was read from, and, when
//  that file `inherits` a parent, the file as written (so a block the
//  parent declared is attributed to the parent).
Choice systemChoice(const DictPtr& system);

//  A short hash of the resolved definition (every block that decides a
//  property; components and per-node plumbing excluded), printed in the
//  view: two runs that print the same fingerprint for a variant built it
//  from the same text.
std::string fingerprint(const DictPtr& resolved);

} // namespace resolvedView
} // namespace Choupo
