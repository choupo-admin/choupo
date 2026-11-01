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
    WHAT THE ABSORBER AND THE STRIPPER ACCEPT (DEV.md 4c C188 item 5, slice
    D; docs/design/what-a-unit-accepts.md section 12).  The two units are the
    same Kremser cascade on Henry's law run in opposite directions, so they
    share ONE declaration, parameterised by which inlet is the liquid.

    Their refusals used to be `throw`s inside each solve(), reached only at
    the unit's turn; they are conditions of the contract now, so the
    pre-solve pass reports them on an authored inlet (and `choupo-lint` with
    it) and the generated documentation lists them.  ONE condition is new: a
    component declared `role solute` that has NO Henry pair against the
    solvent is not transferred -- the classification test requires both --
    and fell through to the inert branch in silence (the gas passed on
    unchanged, at exit 0).
\*---------------------------------------------------------------------------*/

#pragma once

#include "unitOperations/UnitAcceptance.H"

namespace Choupo {

//  `absorber` = true: inlet 0 is the gas feed, inlet 1 the liquid wash.
//  `absorber` = false (the stripper): inlet 0 is the rich liquid, inlet 1 the
//  stripping gas.
UnitAcceptance kremserAcceptance(bool absorber);

} // namespace Choupo
