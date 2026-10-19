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
    Choupo::emitBatchPlanJson

Description
    The result JSON's top-level `"batchPlan"` block (DEV.md 4c C99): the
    batch plant designed on the steady balance (`postProcessing/
    BatchPlanPass`).  Emitted ONLY when the postDict declares `batchPlan {}`,
    so every other result is byte-for-byte unchanged.  Like the `"layout"`
    and `"building"` blocks, EVERY LINE THAT CARRIES A NUMBER CARRIES AN
    `"id"` -- `batchPlan` (the summary), `train:<name>`, `stage:<name>`,
    `gantt:<train>:<stage>:<lot>`, `<kind>:<subject>` for a finding -- one
    record per line, so the golden `batch` kind resolves a row on that line
    without walking braces.  Times in hours, masses in kg, volumes in m3,
    rates in kg/h.
\*---------------------------------------------------------------------------*/

#pragma once

#include "core/BatchPlanRecords.H"

#include <ostream>

namespace Choupo {

//- Write `,\n  "batchPlan": { ... }` (a leading comma: the block follows the
//  one before it).  Writes nothing when `p.present` is false.
void emitBatchPlanJson(std::ostream& os, const BatchPlanRecord& p);

} // namespace Choupo
