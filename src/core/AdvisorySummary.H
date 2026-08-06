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
Function
    Choupo::printAdvisorySummary

Description
    The END-OF-RUN block that gathers what the engine announced during the run
    and prints it once, grouped, where a reader will actually meet it.

    WHY THIS EXISTS.  Choupo announces a great deal -- an extrapolated Cp, a
    record read from the unverified local tier, a component whose review never
    happened, an estimate standing in for a measurement.  Every one of those
    was already printed, at its site, in the middle of a long log.

    That is where the honesty argument runs out.  A warning emitted a thousand
    lines above the answer, between two Newton iterations, has been DELIVERED
    and not RECEIVED, and the difference matters most exactly when the run went
    well: nothing failed, the number looks fine, and the reader scrolls to the
    stream table.  **"Announced" then becomes a slightly louder form of
    silence** -- the phrase is an external reviewer's, and it names the failure
    precisely.

    So the announcements ride the existing `AdvisoryLog` -- the same sink that
    already carries them into the result JSON for the GUI -- and are replayed
    here, at the end, grouped by what kind of doubt they represent:

        MODEL ASSUMPTIONS      a model was chosen or approximated for you
        EXTRAPOLATIONS         a correlation was used outside its fitted range
        UNVERIFIED DATA        a value's provenance is weaker than curated
        REFUSED CALCULATIONS   something the engine declined to compute

    WHAT THIS IS NOT.  It is not a second source of truth.  Every line here was
    already printed at its site and already rides in the JSON; this reprints
    what the log holds and invents nothing.  If a category is empty it is
    omitted rather than shown as "none", because a heading with nothing under
    it trains the eye to skip the block.

    AND IT SAYS WHEN IT HAS NOTHING TO SAY.  A run with no advisories prints
    one line confirming that -- silence from this block must mean "the engine
    raised nothing", never "the block did not run".
\*---------------------------------------------------------------------------*/

#pragma once

#include "core/Advisory.H"

#include <iostream>
#include <map>
#include <string>
#include <vector>

namespace Choupo {

//  Which heading each advisory category appears under.  A category with no
//  mapping falls into MODEL ASSUMPTIONS rather than being dropped: an
//  unclassified advisory must still reach the reader, and the cost of a
//  slightly wrong heading is far below the cost of a silent omission.
inline const char* advisoryHeading(const std::string& category)
{
    if (category == "validity")   return "EXTRAPOLATIONS AND VALIDITY";
    if (category == "provenance") return "UNVERIFIED DATA";
    if (category == "refusal")    return "REFUSED CALCULATIONS";
    return "MODEL ASSUMPTIONS";
}

inline void printAdvisorySummary(const std::vector<Advisory>& advs,
                                 std::ostream& os = std::cout)
{
    const std::string rule(74, '-');

    if (advs.empty())
    {
        os << "\n" << rule << "\n"
           << "ASSUMPTIONS AND CAVEATS: none raised.\n"
           << "  Every property was evaluated inside its declared validity "
              "range, from curated\n  records.  This line is printed even when "
              "empty so its absence cannot be read\n  as \"nothing to report\" "
              "when the truth is \"nothing looked\".\n";
        return;
    }

    //  Grouped, and ordered by heading so two runs of the same case print the
    //  same block -- a summary that reorders itself between runs is diffed by
    //  nobody.
    std::map<std::string, std::vector<const Advisory*>> byHeading;
    for (const auto& a : advs)
        byHeading[advisoryHeading(a.category)].push_back(&a);

    os << "\n" << rule << "\n"
       << "ASSUMPTIONS AND CAVEATS -- what this run announced along the way\n"
       << "  Every line below was already printed at its site.  It is repeated "
          "here because a\n  warning a thousand lines above the answer has been "
          "delivered, not received.\n";

    for (const auto& [heading, items] : byHeading)
    {
        os << "\n  " << heading << "  (" << items.size() << ")\n";
        for (const auto* a : items)
            os << "    - " << a->locus << ": " << a->message << "\n";
    }
    os << rule << "\n";
}

} // namespace Choupo
