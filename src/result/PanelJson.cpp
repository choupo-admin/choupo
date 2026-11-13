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
    src/result/PanelJson.cpp
\*---------------------------------------------------------------------------*/

#include "result/PanelJson.H"
#include "result/ResultEmitter.H"   // jsonNumber, jsonEscape: one formatter

#include <cstddef>
#include <string>
#include <vector>

namespace Choupo {

namespace {

void emitIntervals(std::ostream& os, const char* key,
                   const std::vector<std::pair<scalar, scalar>>& iv)
{
    os << ", \"" << key << "\": [";
    for (std::size_t i = 0; i < iv.size(); ++i)
        os << (i ? ", " : "") << "[" << jsonNumber(iv[i].first)
           << ", " << jsonNumber(iv[i].second) << "]";
    os << "]";
}

//  One record, one line, `"id"` first and followed by a comma (the golden
//  `panel` kind finds a row by that exact prefix).  Numbers, then words, then
//  the intervals (the alarm's, then the limit's), and last the `"text": {}`
//  sub-object so a golden never reads a number out of the case's own
//  sentences.
void emitRow(std::ostream& os, const PanelRow& r, const char* lead)
{
    os << lead << "      { \"id\": " << jsonEscape(r.id);
    for (const auto& [k, v] : r.numbers)
        os << ", " << jsonEscape(k) << ": " << jsonNumber(v);
    for (const auto& [k, v] : r.words)
        os << ", " << jsonEscape(k) << ": " << jsonEscape(v);
    if (r.hasIntervals)      emitIntervals(os, "intervals", r.intervals);
    if (r.hasLimitIntervals) emitIntervals(os, "limitIntervals", r.limitIntervals);
    if (!r.text.empty())
    {
        os << ", \"text\": {";
        for (std::size_t i = 0; i < r.text.size(); ++i)
            os << (i ? ", " : " ") << jsonEscape(r.text[i].first) << ": "
               << jsonEscape(r.text[i].second);
        os << " }";
    }
    os << " }";
}

void emitList(std::ostream& os, const char* key,
              const std::vector<PanelRow>& rows, bool last)
{
    os << "    \"" << key << "\": [";
    for (std::size_t i = 0; i < rows.size(); ++i)
        emitRow(os, rows[i], i ? ",\n" : "\n");
    os << (rows.empty() ? "]" : "\n    ]") << (last ? "" : ",") << "\n";
}

} // namespace

void emitPanelJson(std::ostream& os, const PanelRecord& p)
{
    if (!p.present) return;
    os << ",\n  \"panel\": {\n";
    emitList(os, "elements", p.elements, false);
    emitList(os, "facts", p.facts, false);
    emitList(os, "messages", p.messages, false);
    os << "    \"summary\": [";
    emitRow(os, p.summary, "\n");
    os << "\n    ]\n  }";
}

} // namespace Choupo
