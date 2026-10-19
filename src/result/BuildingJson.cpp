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
\*---------------------------------------------------------------------------*/

#include "result/BuildingJson.H"
#include "result/ResultEmitter.H"   // jsonNumber, jsonEscape: one formatter

#include <cstddef>
#include <string>
#include <vector>

namespace Choupo {

namespace {

std::string esc(const std::string& s) { return jsonEscape(s); }
std::string num(scalar v) { return jsonNumber(v); }

std::string words(const std::vector<std::string>& v)
{
    std::string s = "[";
    for (std::size_t i = 0; i < v.size(); ++i) s += (i ? ", " : "") + esc(v[i]);
    return s + "]";
}

const char* tf(bool b) { return b ? "true" : "false"; }

} // namespace

void emitBuildingJson(std::ostream& os, const BuildingRecord& b)
{
    if (!b.present) return;
    os << ",\n  \"building\": {\n";
    os << "    \"summary\": { \"id\": \"buildingSummary\""
       << ", \"name\": " << esc(b.name)
       << ", \"floors\": " << b.floors.size()
       << ", \"rooms\": " << b.rooms.size()
       << ", \"connections\": " << b.connections.size()
       << ", \"flows\": " << b.flows.size()
       << ", \"findings\": " << b.findings.size()
       << ", \"floorArea\": " << num(b.floorArea)
       << ", \"occupancy\": " << b.occupancy
       << ", \"minimumStep\": " << num(b.minimumStep);
    if (b.atexSeparationDeclared)
        os << ", \"atexDistance\": " << num(b.atexDistance);
    if (!b.envelope.empty())
        os << ", \"envelope\": " << esc(b.envelope);
    os << ", \"source\": " << esc(b.source) << ", \"reason\": " << esc(b.reason)
       << ", \"stepSource\": " << esc(b.stepSource)
       << ", \"stepReason\": " << esc(b.stepReason);
    if (b.atexSeparationDeclared)
        os << ", \"atexSource\": " << esc(b.atexSource)
           << ", \"atexReason\": " << esc(b.atexReason);
    os << " },\n    \"floors\": [";
    for (std::size_t i = 0; i < b.floors.size(); ++i)
    {
        const auto& f = b.floors[i];
        os << (i ? ",\n" : "\n") << "      { \"id\": " << esc("floor:" + f.name)
           << ", \"name\": " << esc(f.name)
           << ", \"elevation\": " << num(f.elevation)
           << ", \"height\": " << num(f.height) << " }";
    }
    os << "\n    ],\n    \"rooms\": [";
    for (std::size_t i = 0; i < b.rooms.size(); ++i)
    {
        const auto& r = b.rooms[i];
        os << (i ? ",\n" : "\n") << "      { \"id\": " << esc("room:" + r.name)
           << ", \"name\": " << esc(r.name)
           << ", \"floor\": " << esc(r.floor)
           << ", \"role\": " << esc(r.role)
           << ", \"grade\": " << esc(r.grade)
           << ", \"regime\": " << esc(r.regime)
           << ", \"containment\": " << tf(r.containment)
           << ", \"xMin\": " << num(r.xMin) << ", \"xMax\": " << num(r.xMax)
           << ", \"yMin\": " << num(r.yMin) << ", \"yMax\": " << num(r.yMax)
           << ", \"z\": " << num(r.z) << ", \"height\": " << num(r.height)
           << ", \"area\": " << num(r.area)
           << ", \"pressure\": " << num(r.pressure)
           << ", \"relativeTo\": " << esc(r.relativeTo)
           << ", \"pressureToOutside\": " << num(r.pressureToOutside);
        if (r.occupancy >= 0) os << ", \"occupancy\": " << r.occupancy;
        if (r.atexZone >= 0)
            os << ", \"atexZone\": " << r.atexZone
               << ", \"atexSource\": " << esc(r.atexSource)
               << ", \"atexReason\": " << esc(r.atexReason);
        if (!r.ignition.empty()) os << ", \"ignition\": " << esc(r.ignition);
        os << ", \"equipment\": " << words(r.equipment);
        if (!r.source.empty())
            os << ", \"source\": " << esc(r.source) << ", \"reason\": " << esc(r.reason);
        os << " }";
    }
    os << "\n    ],\n    \"connections\": [";
    for (std::size_t i = 0; i < b.connections.size(); ++i)
    {
        const auto& c = b.connections[i];
        os << (i ? ",\n" : "\n") << "      { \"id\": " << esc(c.id)
           << ", \"a\": " << esc(c.a) << ", \"b\": " << esc(c.b)
           << ", \"type\": " << esc(c.type) << ", \"dP\": " << num(c.dP) << " }";
    }
    os << (b.connections.empty() ? "]" : "\n    ]") << ",\n    \"flows\": [";
    for (std::size_t i = 0; i < b.flows.size(); ++i)
    {
        const auto& f = b.flows[i];
        os << (i ? ",\n" : "\n") << "      { \"id\": " << esc("flow:" + f.name)
           << ", \"name\": " << esc(f.name) << ", \"kind\": " << esc(f.kind)
           << ", \"steps\": " << (f.path.size() - 1)
           << ", \"connected\": " << tf(f.connected)
           << ", \"path\": " << words(f.path)
           << ", \"reason\": " << esc(f.reason) << " }";
    }
    os << (b.flows.empty() ? "]" : "\n    ]") << ",\n    \"shared\": [";
    for (std::size_t i = 0; i < b.shared.size(); ++i)
    {
        const auto& s = b.shared[i];
        os << (i ? ",\n" : "\n") << "      { \"room\": " << esc(s.room)
           << ", \"flows\": " << words(s.flows)
           << ", \"reason\": " << esc(s.reason) << " }";
    }
    os << (b.shared.empty() ? "]" : "\n    ]") << ",\n    \"findings\": [";
    for (std::size_t i = 0; i < b.findings.size(); ++i)
    {
        const auto& f = b.findings[i];
        os << (i ? ",\n" : "\n") << "      { \"id\": " << esc(f.id)
           << ", \"kind\": " << esc(f.kind)
           << ", \"a\": " << esc(f.a) << ", \"b\": " << esc(f.b)
           << ", \"value\": " << num(f.value) << ", \"limit\": " << num(f.limit)
           << ", \"message\": " << esc(f.message) << " }";
    }
    os << (b.findings.empty() ? "]" : "\n    ]") << "\n  }";
}

} // namespace Choupo
