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
Description
    WHAT A UNIT IS HANDED BEFORE ITS solve(): the unit's own declaration
    augmented with its inlet streams (`feed {}` + `composition {}` for a
    single inlet, `inputStreams ( ... )` for several), the solverDict
    defaults and its resolved named references (reaction, drying curve,
    crystallisation kinetics).  The ONE home of that injection.

    It lived in Flowsheet.cpp's anonymous namespace until 2026-09-30, when
    a second caller arrived: the `quasiSteady` adapter solves a steady unit
    inside each accepted step of the dynamic driver, and a unit must be
    handed its inlets the SAME way in both binaries or it would read two
    different dictionaries depending on who ran it.  Moved verbatim.
\*---------------------------------------------------------------------------*/

#pragma once

#include "core/Dictionary.H"
#include "streams/ProcessStream.H"
#include "thermo/ThermoPackage.H"

#include <map>
#include <string>

namespace Choupo {

//- One stream as the sub-dict a multi-inlet unit reads (`inputStreams`).
DictPtr streamToDict(const ProcessStream& s, const ThermoPackage& thermo);

//- The unit's declaration with its inlets, solver defaults and resolved
//  named references injected -- what its solve() reads.
DictPtr buildAugmentedDict(const DictPtr&                             udict,
                           const std::string&                         utype,
                           const std::map<std::string,ProcessStream>& streams,
                           const ThermoPackage&                       thermo,
                           const DictPtr&                             solverDict,
                           const DictPtr&                             reactionsDict,
                           const DictPtr&                             dryingDict,
                           const DictPtr&                             crystDict);

} // namespace Choupo
