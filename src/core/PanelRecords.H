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
    src/core/PanelRecords.H

Description
    THE OPERATOR PANEL a case declares in `system/panelDict` and the engine
    reads AFTER the time loop (2026-11-12, DEV.md 4c C371, slice S1; the
    decision record is docs/design/operator-panel-in-the-case.md).  Two plain
    records, in `core` for the reason `ResultRecords.H` gives (debt D7): the
    driver CAPTURES the series, `postProcessing/panel` PRODUCES the facts and
    the result CARRIES them.

    `PublishedSeries` is the labels and the rows `trajectory.csv` carries,
    kept in memory as they are written, each value rounded through the CSV's
    own `%.8e` so a fact says what a reader of the file would see.  It is
    handed to the evaluator as a `const&`: the panel holds no pointer to a
    unit and no way to change one.

    `PanelRecord` is EMPTY (`present` false) unless the case declares
    `system/panelDict`, so every other result is byte-for-byte unchanged.
    Every record is one `PanelRow`; the JSON emitter writes one line per row
    with an `"id"`, which the golden `panel` kind resolves without walking
    braces.  The engine reports FACTS; no row is a grade.
\*---------------------------------------------------------------------------*/

#ifndef Choupo_core_PanelRecords_H
#define Choupo_core_PanelRecords_H

#include "core/Types.H"

#include <cstddef>
#include <string>
#include <utility>
#include <vector>

namespace Choupo {

//- The columns a time-integrated run publishes, in memory.
struct PublishedSeries
{
    std::vector<std::string>         labels;   // "t", "<owner>.<key>", ...
    std::vector<std::vector<scalar>> rows;     // rows[k][labels index]

    //- Index of a label, -1 when the run did not publish it.
    int column(const std::string& label) const
    {
        for (std::size_t i = 0; i < labels.size(); ++i)
            if (labels[i] == label) return static_cast<int>(i);
        return -1;
    }
};

//- One record of the panel block (one JSON line).
struct PanelRow
{
    std::string id;                                    // "<kind>:<name>"
    std::vector<std::pair<std::string, scalar>>      numbers;
    std::vector<std::pair<std::string, std::string>> words;      // short words
    bool                                             hasIntervals = false;
    std::vector<std::pair<scalar, scalar>>           intervals;  // [t0, t1] s
    //  An element's LIMIT-violation periods on the write grid (no delay), a
    //  list apart from `intervals` (its alarm's active periods, the delay
    //  applied) so neither is read for the other.
    bool                                             hasLimitIntervals = false;
    std::vector<std::pair<scalar, scalar>>           limitIntervals;
    //  The case's own sentences and the engine's explanation, written last on
    //  the line inside `"text": {}` so a golden reads no number out of them.
    std::vector<std::pair<std::string, std::string>> text;
};

struct PanelRecord
{
    bool                  present = false;
    std::vector<PanelRow> elements;   // `element:<name>`
    std::vector<PanelRow> facts;      // `<kind>:<name>`
    std::vector<PanelRow> messages;   // `message:<name>`
    PanelRow              summary;    // `summary`
    //  The log lines (`[panel] ...`), one per fact, in the order printed.
    std::vector<std::string> logLines;
};

} // namespace Choupo

#endif
