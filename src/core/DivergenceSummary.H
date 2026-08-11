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
    Choupo::printProblemDivergence

Description
    THE DIVERGENCE BLOCK -- printed ABOVE the caveats, never inside them.

    `printAdvisorySummary` exists because a warning a thousand lines above the
    answer has been delivered, not received.  This block exists for a stronger
    reason: a divergence is not a qualification on the answer, it is a
    statement that the answer belongs to a DIFFERENT QUESTION.  Sharing a
    channel with nine extrapolation warnings would make the tenth line
    invisible, and the tenth line is the only one that changes what the number
    means.

    So the two blocks are separate, and this one comes FIRST -- the reader must
    learn which problem was solved before reading how well it was solved.

    A run with nothing to declare says so.  Silence must mean "nothing
    diverged", never "the block did not run" -- the same rule the caveat
    surface follows, for the same reason.

\*---------------------------------------------------------------------------*/

#pragma once

#include "core/ProblemDivergence.H"

#include <iostream>
#include <map>
#include <ostream>
#include <string>
#include <vector>

namespace Choupo {

inline std::string divergenceHeading(const std::string& kind)
{
    if (kind == "substitution")
        return "SUBSTITUTIONS -- authorised, and NOT what was declared";
    if (kind == "declaredApproximation")
        return "DECLARED APPROXIMATIONS -- what was asked for, and what it costs";
    return "OTHER DIVERGENCES";
}

inline void printProblemDivergence(const std::vector<Divergence>& divs,
                                   std::ostream& os = std::cout)
{
    const std::string rule(74, '=');

    if (divs.empty())
    {
        os << "\n" << rule << "\n"
           << "PROBLEM SOLVED == PROBLEM POSED.  No divergence declared or"
              " imposed.\n";
        os << rule << "\n";
        return;
    }

    //  Grouped and ordered by heading, so two runs of the same case print the
    //  same block: a summary that reorders itself between runs is diffed by
    //  nobody.
    std::map<std::string, std::vector<const Divergence*>> byKind;
    for (const auto& d : divs) byKind[divergenceHeading(d.kind)].push_back(&d);

    os << "\n" << rule << "\n"
       << "THE PROBLEM SOLVED IS NOT THE PROBLEM POSED\n"
       << "  Read this before the numbers.  Each line names something the run"
          " replaced or\n  approximated; the answer below is the answer to the"
          " problem AFTER these\n  changes, not the one the case describes on"
          " its face.\n";

    for (const auto& [heading, items] : byKind)
    {
        os << "\n  " << heading << "  (" << items.size() << ")\n";
        for (const auto* d : items)
        {
            os << "    - " << d->locus << "\n"
               << "        requested: " << d->requested << "\n"
               << "        solved:    " << d->solved << "\n";
            if (!d->reason.empty())
                os << "        reason:    " << d->reason << "\n";
        }
    }
    os << rule << "\n";
}

} // namespace Choupo
