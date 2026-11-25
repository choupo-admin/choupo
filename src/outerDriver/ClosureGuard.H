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
    Choupo

Description
    THE CLOSURE GUARD of the optimiser (C494 follow-up; CLAUDE.md rule 4b).

    Real defect it would have caught: ctrl16 under `method mads;` returned
    J = 6497 -- twelve times the published optimum -- at a point where the
    run's own `balance.mass_closure_rel` was 0.98 (4.3e6 kg of residual
    against 0.97e6 kg fed).  The objective rewarded a state in which the
    model creates matter, and the run exited 0.

    This header READS what a run published; it recomputes nothing.  The keys
    are the mass / element / solute closure keys of
    bin/curate/check_campaign_closure.py (MASS_ELEMENT_KEY), matched in
    `result.kpis[unit][key]`; plus the plant-boundary mass closure
    (`globalMassBoundary`, percent about 100) when the reports have run.
    The band is the engine's own, reporting::massBandPct (BalanceAlarm.H:122,
    0.1 %, equal to the gate's CAMPAIGN_TOL = 1e-3), not a second number.

    SCOPE, in one sentence: a steady optimum's closure is held by the run's own
    balance reports (which run after the optimiser), not by this guard, which
    sees only the closures a run publishes at an evaluation (dynamic and batch
    ledgers, and units that publish one such as the spiral-wound module).
\*---------------------------------------------------------------------------*/

#pragma once

#include "reporting/BalanceAlarm.H"
#include "result/SimulationResult.H"

#include <algorithm>
#include <cmath>
#include <regex>
#include <string>

namespace Choupo {

struct ClosureReading
{
    bool        published = false;   // the run published at least one closure
    scalar      worst     = 0.0;     // largest |closure| (a fraction)
    std::string key;                 // "<unit>.<key>" of the worst
};

//  The band, as a fraction.
inline scalar closureBand() { return reporting::massBandPct / 100.0; }

inline ClosureReading readClosure(const SimulationResult& r)
{
    static const std::regex massElement(
        "^(mass_closure_rel|solute_closure_rel|closure_worst_rel"
        "|element_worst_closure_rel|element_worst_closure_vs_declared_rel"
        "|element_[A-Za-z]+_closure_rel"
        "|kpi_(mass|solute)_closure_rel_final)$");
    ClosureReading out;
    for (const auto& [unit, kv] : r.kpis)
        for (const auto& [key, v] : kv)
            if (std::regex_match(key, massElement) && std::isfinite(v))
            {
                out.published = true;
                if (std::abs(v) > out.worst || out.key.empty())
                { out.worst = std::max(out.worst, std::abs(v)); out.key = unit + "." + key; }
            }
    const auto& gm = r.globalMassBoundary;
    if (gm.present && gm.process_closure_available)
    {
        out.published = true;
        const scalar d = std::abs(gm.process_closure_pct - 100.0) / 100.0;
        if (d > out.worst) { out.worst = d; out.key = "globalMassBoundary.process"; }
    }
    return out;
}

} // namespace Choupo
