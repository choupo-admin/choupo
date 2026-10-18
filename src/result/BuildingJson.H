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
Function
    Choupo::emitBuildingJson

Description
    The result JSON's top-level `"building"` block (DEV.md 4c C97): the GMP
    interior as the engine read and checked it.  Emitted by
    `emitResultJson` ONLY when the case declares `building {}`, so every
    other result is byte-for-byte unchanged.  Like the `"layout"` block,
    EVERY LINE THAT CARRIES A NUMBER CARRIES AN `"id"` -- `buildingSummary`,
    `floor:<name>`, `room:<name>`, `<type>:<a>:<b>` for a connection,
    `flow:<name>`, `<kind>:<a>:<b>` for a finding -- one record per line, so
    the golden `layout` kind resolves a row on that line without walking
    braces.  The GUI draws this block and computes nothing.
\*---------------------------------------------------------------------------*/

#pragma once

#include "core/BuildingRecords.H"

#include <ostream>

namespace Choupo {

//- Write `,\n  "building": { ... }` (a leading comma: the block follows the
//  one before it).  Writes nothing when `b.present` is false.
void emitBuildingJson(std::ostream& os, const BuildingRecord& b);

} // namespace Choupo
