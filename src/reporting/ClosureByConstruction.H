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

    SPDX-License-Identifier: GPL-3.0-or-later
    Credit and attribution: see AUTHORS
-------------------------------------------------------------------------------
Namespace
    Choupo::reporting::byConstruction

Description
    ONE home for how the three balance reports speak about a CLOSURE BY
    CONSTRUCTION (DEV.md 4c C174, result/ClosureVariable.H): a unit term
    computed as the remainder of the very balance the report then checks.

    The reports do not decide which terms those are -- the UNIT declares them
    (UnitOperation::closureVariables), the flowsheet collects them, and the
    result carries them.  What a report owes the reader is to stop
    presenting such a closure as evidence: it stamps the unit's row with the
    word (`verified` when the unit's second route agrees, `notVerified`
    otherwise), says so on the console in one line per term plus a count, and
    raises every `notVerified` one on AdvisoryLog so it reaches the end-of-run
    caveat block.  The three reports call these functions with their own
    balance word and nothing else, so the sentence has one home.

    A run whose units declare none prints nothing here: silence keeps meaning
    "no closure was computed from its own balance".
\*---------------------------------------------------------------------------*/

#pragma once

#include "core/Advisory.H"
#include "result/SimulationResult.H"

#include <iomanip>
#include <iostream>
#include <map>
#include <sstream>
#include <string>

namespace Choupo {
namespace reporting {
namespace byConstruction {

//  Per unit: the closure variable(s) of one balance and the word for the row.
//  A unit with two such terms reads `notVerified` unless BOTH are verified.
struct UnitWord
{
    std::string variables;   // ';'-joined, for a CSV cell (never a comma)
    std::string status;      // verified | notVerified
};

inline std::map<std::string, UnitWord>
wordsFor(const SimulationResult& r, const std::string& balance)
{
    std::map<std::string, UnitWord> out;
    for (const auto& c : r.closuresByConstruction)
    {
        if (c.balance != balance) continue;
        auto& w = out[c.unit];
        std::string v = c.variable;
        for (auto& ch : v) if (ch == ',') ch = ';';
        w.variables += (w.variables.empty() ? "" : ";") + v;
        if (w.status.empty() || w.status == "verified")
            w.status = c.status();
    }
    return out;
}

//  Console + caveat block.  `label` is the report's own name (`energyBalance`,
//  `massBalance`, `elementBalance`).  Returns the number of terms announced.
inline int announce(const SimulationResult& r, const std::string& balance,
                    const std::string& label)
{
    int n = 0, nVerified = 0;
    for (const auto& c : r.closuresByConstruction)
    {
        if (c.balance != balance) continue;
        ++n;
        std::ostringstream m;
        m << "unit '" << c.unit << "': " << c.variable << " is computed as the "
             "remainder of its own " << balance << " balance (" << c.rule
          << "), so the unit's " << balance << " closure holds BY CONSTRUCTION"
             " and is not evidence about it -- it cannot see " << c.blindTo
          << ".  ";
        if (c.verified)
        {
            ++nVerified;
            m << "VERIFIED by a second route: " << c.check << " (gap "
              << std::scientific << std::setprecision(3) << c.gap << " "
              << c.units << ", tolerance " << c.tolerance << ").";
        }
        else
            m << "NOT VERIFIED: " << c.note << ".";
        std::cout << "  [report] " << label << ": closure by construction -- "
                  << m.str() << "\n";
        if (!c.verified)
            AdvisoryLog::instance().add(
                "validity", "info",
                "unit '" + c.unit + "' " + c.variable
                    + " closes by construction",
                m.str());
    }
    if (n > 0)
        std::cout << "  [report] " << label << ": " << n << " closure(s) BY"
                     " CONSTRUCTION -- not evidence (" << nVerified
                  << " verified by the unit's second route, " << (n - nVerified)
                  << " not verified)\n";
    return n;
}

} // namespace byConstruction
} // namespace reporting
} // namespace Choupo
