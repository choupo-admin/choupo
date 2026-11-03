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
    Choupo::equipmentList

Description
    THE EQUIPMENT LIST: one row per sized item, tag first, built from the
    finished result and nothing else (slice S1 of
    `docs/design/the-plant-document-set.md`).  A projection, like `design/`:
    it adds no number and recomputes none -- a size, a pressure, a cost is
    READ from the item's own record.

    ONE builder, three readers: `reports/equipment/equipmentList.csv` (the
    engine's file), the result JSON's `equipmentList` block (what the GUI
    draws and prints), and the gate that recounts `design/` against it.  A
    second builder anywhere would be the second home for the table.

    The columns are the CSV header, in order; the JSON rows carry the same
    keys.  The rows are ordered by tag.
\*---------------------------------------------------------------------------*/

#pragma once

#include "result/SimulationResult.H"

#include <string>
#include <vector>

namespace Choupo {
namespace equipmentList {

struct Row
{
    std::string tag;            // P-101A
    std::string item;           // EquipmentSizing::itemId()
    std::string unit;           // the owning flowsheet unit
    std::string sector;         // empty for a flat case
    std::string equipment;      // the kind (equipmentType)
    int         installed = 1;  // machines this tag stands for in parallel
    std::string sizeKey;        // V_R | A | m_catalyst_kg | A_relief | utilisation | ""
    bool        haveSize = false;
    double      sizeValue = 0.0;
    std::string sizeUnit;
    std::string dimensions;     // "D 1.2 m; H 3.4 m" where the sheet has them
    bool        havePressure = false;
    double      pressureDesign = 0.0;
    std::string pressureUnit;   // as the sizer declared it (bar)
    std::string material;
    std::string currency;
    bool        costed = false;
    double      purchased = 0.0;
    double      bareModule = 0.0;
    double      totalModule = 0.0;
    std::string costNote;       // why there is no cost, or how it was priced
    std::string tagBy;          // generated | declared
};

//  The header words, in column order (shared by the CSV and the JSON).
const std::vector<std::string>& columns();

//  The rows, ordered by tag.
std::vector<Row> rows(const SimulationResult& result);

} // namespace equipmentList
} // namespace Choupo
