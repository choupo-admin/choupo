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
Class
    Choupo::PairResolution / Choupo::ThermoResolutionLog

Description
    Where did a binary-interaction parameter set come from?  When an activity
    model (NRTL today) resolves a pair, it records HOW it resolved (inline in
    the thermoPackage, a per-node `constant/binaryPairs/` file, the plant-root
    file, the standard library, or defaulted-to-ideal) and the ACTUAL file it
    loaded -- the source path itself reveals the owning node (".../SEPARATION/
    constant/..." vs ".../standards/..."), so the GUI gets per-node provenance
    for free from the engine's own record (never a TypeScript re-walk -- one
    source of truth).  When the file carries a `provenance { source ...; }`
    block, its value (placeholder / literature / fitted / ...) rides along so a
    PLACEHOLDER masquerading as data is visible, not inferred from the numbers.

    This is the foundation-navigator + pair-coverage-matrix data feed.  Same
    process-wide-sink pattern as AdvisoryLog: cleared at the start of a run,
    drained into the SimulationResult, emitted in the result JSON.
\*---------------------------------------------------------------------------*/

#pragma once

#include <string>
#include <utility>
#include <vector>

namespace Choupo {

struct PairResolution
{
    std::string model;       // "NRTL" | "Wilson" | ...
    std::string i;           // component i
    std::string j;           // component j
    std::string status;      // "inline"|"perNode"|"caseRoot"|"standard"|"idealDefault"
    std::string source;      // the file actually loaded, or "inline" / "ideal-default"
    std::string provSource;  // the file's provenance.source ("placeholder"/"literature"/
                             // "fitted"/...) when present, else "" (e.g. ideal-default)
};

class ThermoResolutionLog
{
public:
    static ThermoResolutionLog& instance()
    {
        static ThermoResolutionLog inst;
        return inst;
    }

    void clear() { entries_.clear(); }

    // Dedup on (model,i,j,status,source): the same package can be built more
    // than once (Phase + legacy activity_ pointer; per-pass rebuilds).
    void add(PairResolution pr)
    {
        for (const auto& e : entries_)
            if (e.model == pr.model && e.i == pr.i && e.j == pr.j
                && e.status == pr.status && e.source == pr.source)
                return;
        entries_.push_back(std::move(pr));
    }

    const std::vector<PairResolution>& entries() const { return entries_; }

private:
    ThermoResolutionLog() = default;
    std::vector<PairResolution> entries_;
};

} // namespace Choupo
