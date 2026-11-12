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
    Choupo::emitPanelJson

Description
    The result JSON's top-level `"panel"` block (2026-11-12, DEV.md 4c C371):
    the operator panel the case declared in `system/panelDict`, as the engine
    read it, with the FACTS about it (`postProcessing/panel/PanelPass.H`).
    Emitted ONLY when the case declares the file, so every other result is
    byte-for-byte unchanged.  Like the `"layout"` and `"batchPlan"` blocks,
    EVERY LINE THAT CARRIES A NUMBER CARRIES AN `"id"`, one record per line:
    `element:<name>`, `<fact>:<name>`, `message:<name>`, `summary`; the golden
    `panel` kind resolves a row on that line without walking braces.  The
    block holds four arrays (`elements`, `facts`, `messages`, `summary`), so
    the GUI parses no dict to draw.  Times in seconds; every other number in
    the unit its series is published in.
\*---------------------------------------------------------------------------*/

#pragma once

#include "core/PanelRecords.H"

#include <ostream>

namespace Choupo {

//- Write `,\n  "panel": { ... }` (a leading comma: the block follows the one
//  before it).  Writes nothing when `p.present` is false.
void emitPanelJson(std::ostream& os, const PanelRecord& p);

} // namespace Choupo
