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
    Choupo::Advisory / Choupo::AdvisoryLog

Description
    A solver "speak-up" event -- a bound active at the converged solution, an
    equipment rating exceeded, an auto-initialised tear, etc.  These are the
    "no silent crutch" messages: the solver announces what it did / what is
    physically suspect, never silently.

    Each event is ALSO printed to the run log at its site (with a `[bound]` /
    `[rating]` / `[init]` tag).  AdvisoryLog is a process-wide sink so the
    SAME events can ride in the structured result JSON and be surfaced by the
    GUI (a student who never opens the Log still sees them).

    Singleton, in the spirit of DisplayUnits::instance().  The application
    clears it at the start of each runSimulation pass and drains its entries
    into the SimulationResult afterwards -- so a sweep / optimisation gets the
    advisories of each pass, and the emitted result carries the final pass's.

    Only the MEANINGFUL events are recorded here (bound-at-solution, rating
    exceedance, auto-init) -- transient per-iteration cage clips stay log-only
    so the structured list is not flooded.
\*---------------------------------------------------------------------------*/

#pragma once

#include <string>
#include <utility>
#include <vector>

namespace Choupo {

struct Advisory
{
    std::string category;   // "bound" | "rating" | "init"
    std::string severity;   // "info" | "warning"
    std::string locus;      // "tear 'recycle'" | "membrane 'SW30HR'" | "vessel 'reactor'"
    std::string message;    // human-readable, same text as the log line
};

class AdvisoryLog
{
public:
    static AdvisoryLog& instance()
    {
        static AdvisoryLog inst;
        return inst;
    }

    void clear() { entries_.clear(); }

    // Returns true if the advisory was NEW (added), false if it was a
    // duplicate and skipped.  Callers gate their own log line on the return
    // value so the SAME event is not printed twice (e.g. a thermo package
    // whose activity model is constructed more than once per build).
    bool add(std::string category, std::string severity,
             std::string locus, std::string message)
    {
        // Dedup: the same advisory can be produced more than once (e.g. a
        // thermo package rebuilt per pass).  Keep the list clean.
        for (const auto& e : entries_)
            if (e.category == category && e.locus == locus && e.message == message)
                return false;
        entries_.push_back({ std::move(category), std::move(severity),
                             std::move(locus), std::move(message) });
        return true;
    }

    const std::vector<Advisory>& entries() const { return entries_; }

private:
    AdvisoryLog() = default;
    std::vector<Advisory> entries_;
};

} // namespace Choupo
