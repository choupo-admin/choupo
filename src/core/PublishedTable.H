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
    src/core/PublishedTable.H

Description
    A NAMED TABLE AN OPERATION PUBLISHES (2026-10-24, DEV.md 4c C147): rows
    of numbers under named columns, each column carrying its unit.  It is
    the record a view (the propsDict's `views ( ... )` or an op's defaults,
    read by src/postProcessing/views/Views) names -- `op N350; table pore;
    x x_um; y c_Na_molm3;` -- instead of re-parsing a CSV the op happened
    to write.

    WHY A RECORD AND NOT A FILE.  A props op that writes its profile to a
    CSV publishes it only to a reader who knows the file name and its
    header; a plot built on that would be a second reader of a format
    nobody declared.  The op hands this record to the run instead, the CSV
    (when the case asks for one) is written FROM it, and a plot names the
    table and its columns -- names the engine can check and refuse.

    WHY IN `core`.  It is neutral data: numbers, words and units, no thermo
    and no unit operation.  The producer (propertyOps; unitOperations
    later) and the consumer (postProcessing) sit in different bands, and a
    record both read belongs below both -- the ResultRecords.H argument.

    GENERALISATION.  A UnitOperation publishes ONE UnitProfile today
    (SimulationResult::profiles holds one per unit).  A unit with more than
    one named profile -- the spiral-wound module's march along the element
    and its pore at each station -- would publish a vector of these, keyed
    by name, and the same post-processing reader would draw them
    (docs/design/a-post-processing-dictionary.md, section 6).
\*---------------------------------------------------------------------------*/

#pragma once

#include "core/Types.H"

#include <cstddef>
#include <string>
#include <vector>

namespace Choupo {

struct PublishedTable
{
    struct Column
    {
        std::string name;    // a word: what a view names
        std::string unit;    // "-" for a dimensionless number, never empty
    };

    std::string name;                       // a word, unique within its producer
    std::string description;                // one sentence: what a row is
    std::vector<Column> columns;
    std::vector<std::vector<scalar>> rows;  // rows[r][c], every row full width

    //  The index of column `col`, or -1 when the table has none.
    int columnIndex(const std::string& col) const
    {
        for (std::size_t c = 0; c < columns.size(); ++c)
            if (columns[c].name == col) return static_cast<int>(c);
        return -1;
    }
};

} // namespace Choupo
