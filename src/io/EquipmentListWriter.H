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
    Choupo::EquipmentListWriter

Description
    Writes `reports/equipment/equipmentList.csv`: the equipment list of the
    run, one row per sized item, tag first (rows from `result/EquipmentList`,
    the one builder).  Regenerated WHOLE every run -- the directory is removed
    and rebuilt, like `design/` and `converged/` -- and written only when a
    sizing pass produced items.  Called with the design sheets, because it
    needs the costs a later pass adds.
\*---------------------------------------------------------------------------*/

#pragma once

#include "result/SimulationResult.H"

#include <cstddef>
#include <string>

namespace Choupo {
namespace EquipmentListWriter {

//  Returns the number of rows written (0 when there was no sizing).
std::size_t write(const std::string&      caseRoot,
                  const SimulationResult& result,
                  int                     verbosity);

} // namespace EquipmentListWriter
} // namespace Choupo
