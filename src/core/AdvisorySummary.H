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

    THE PATH IS NOT THE ANSWER (2026-08-24).  An iterative solver evaluates the
    physics at states it invents and mostly discards, and each of those can
    raise an advisory.  Enumerating them here defeats the block: column13
    printed 99 Davies warnings, of which ONE describes the converged column and
    98 describe compositions the answer does not contain.  Ninety-nine
    near-identical sentences are read by nobody, so the true caveat was
    delivered and not received -- the exact failure this block was built to
    end, arriving by a different road.

    So the block is about THE ANSWER.  Advisories a solver stamped `trial`
    (see `core/Advisory.H`) are not enumerated; they are COUNTED, under their
    own heading, with the frame that raised them named.  The count is not a
    footnote -- it is the honest form of the fact, which is "the solver's path
    went out of band N times on its way here", not N separate cautions about
    the result.

    THIS IS A PARTITION, NOT A DEDUPLICATION.  Nothing here inspects two
    messages and decides they mean the same thing.  It reads one field the
    engine stamped at the moment of the raise.  And because the default is
    `accepted`, a run whose solvers open no frames prints exactly what it
    printed before this existed.

    WHAT IS DELIBERATELY NOT DONE.  The counted line does not summarise the
    RANGE the trials spanned ("I from 0.59 to 2.39"), because the sink stores
    the advisory's text and not the number inside it, and recovering the
    number would mean parsing the sentence -- a second, weaker home for a
    quantity the raising site already had in hand.  The trials ride in full in
    the result JSON, where a reader who wants the path can read the path.
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
    //  The path, counted per frame that walked it (see the header).
    std::map<std::string, std::size_t> trialsByFrame;
    std::size_t nTrial = 0;

    for (const auto& a : advs)
    {
        if (a.status == "trial")
        {
            ++nTrial;
            ++trialsByFrame[a.where.empty() ? std::string("(unnamed solve)")
                                            : a.where];
            continue;
        }
        byHeading[advisoryHeading(a.category)].push_back(&a);
    }

    //  Every advisory this run raised was about a state it walked through and
    //  discarded.  Say that plainly rather than printing a headed block with
    //  nothing under it, and say it in the same shape as the no-advisory line
    //  so its absence still cannot be read as "nothing looked".
    if (byHeading.empty())
    {
        os << "\n" << rule << "\n"
           << "ASSUMPTIONS AND CAVEATS: none raised about the answer.\n";
    }
    else
    {
        os << "\n" << rule << "\n"
           << "ASSUMPTIONS AND CAVEATS -- what this run announced along the way\n"
           << "  Every line below was already printed at its site.  It is repeated "
              "here because a\n  warning a thousand lines above the answer has been "
              "delivered, not received.\n";

        for (const auto& [heading, items] : byHeading)
        {
            os << "\n  " << heading << "  (" << items.size() << ")\n";
            for (const auto* a : items)
            {
                os << "    - " << a->locus << ": " << a->message;
                if (!a->where.empty()) os << "  [" << a->where << "]";
                os << "\n";
            }
        }
    }

    if (nTrial > 0)
    {
        os << "\n  THE SOLVER'S PATH  (" << nTrial << ")\n"
           << "    Raised while evaluating states a solver visited and did NOT "
              "publish.\n    They caution about no number in this run's answer;"
              " they describe how it\n    was reached.  Full text in the result"
              " JSON (status \"trial\").\n";
        for (const auto& [frame, n] : trialsByFrame)
            os << "    - " << frame << ": " << n
               << (n == 1 ? " advisory\n" : " advisories\n");
    }
    os << rule << "\n";
}

} // namespace Choupo
