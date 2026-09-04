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
Struct
    Choupo::FlatUnit

Description
    One unit's INTERFACE after the flowsheet is flattened: name + equipment
    type + the resolved (namespaced) inlet / outlet stream names.

    WHY IT LIVES IN `core` AND NOT BESIDE `SimulationResult` (debt D1, paid
    2026-08-05).  `SimulationResult` used to declare this struct, and that one
    header therefore carried TWO different concepts:

      * `SimulationResult` -- what the pipeline PRODUCED.  It holds streams,
        saturation curves and unit profiles, so it necessarily reads `streams`,
        `thermo` and `unitOperations`.
      * `FlatUnit` -- pure TOPOLOGY.  Four strings.  It reads nothing.

    Because they shared a header, `core` inherited the first one's dependencies
    and reached UP into three subsystems above it -- the three sites recorded
    as F1 in `module-boundaries.md`, and the cause of three of the eight
    measured cycles.  `streams/StreamOwnership.H` was paying that whole bill to
    obtain four strings.

    Ruling §7.2 said `SimulationResult` moves above `core`.  Measuring the
    header showed WHY it had to: not because a result record is misplaced in
    `core`, but because a topology record and an output record are not the same
    kind of thing and had been filed as one.  `SimulationResult` moved to
    `result/`; this stayed, because it always belonged here.
\*---------------------------------------------------------------------------*/

#pragma once

#include <string>
#include <vector>

namespace Choupo {

// Populated by Flowsheet::solve from the post-flatten unit list, so the
// per-unit reports (mass/energy balance, the per-equipment balance sheet) see
// the real equipment even when the case is a COMPOSITE plant --- where the
// flowsheetDict alone only exposes the system boundary.
struct FlatUnit
{
    std::string              name;
    std::string              type;
    std::vector<std::string> ins;
    std::vector<std::string> outs;

    //  WHICH SECTOR OWNS THIS UNIT.  The dotted parent chain WITHOUT the
    //  unit's own leaf name -- "EXTRACTION" for `EXTRACTION.mix01`, "A.B" for
    //  a doubly nested one -- and EMPTY at the plant root, where the unit has
    //  no owning sector at all.
    //
    //  It is a DECLARED field and not a substring of `name` on purpose.  The
    //  hierarchy is a fact the flatten seam KNOWS exactly (`nsPrefix` is the
    //  parent chain, held in hand at the moment the leaf is emitted), and
    //  recovering it downstream by splitting on the last dot would be name
    //  identity -- the crossing this project bans everywhere else.  A unit
    //  named with a dot for any other reason would be misfiled by the split
    //  and correctly filed by this field.
    //
    //  Empty is not a sector called "root".  A flat case has no hierarchy to
    //  report, and inventing one for it would make every flat report differ
    //  from what it printed the day before.
    std::string              sector;
};

} // namespace Choupo
