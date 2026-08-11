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
    Choupo::ProblemDivergence

Description
    THE PROBLEM SOLVED IS NOT ALWAYS THE PROBLEM POSED, AND THE DIFFERENCE
    MUST TRAVEL WITH THE ANSWER.

    Ruled by Vítor, 2026-08-11, after an agent test reached a converged
    acetone process only by downgrading the physics twice -- a rigorous column
    replaced by an FUG shortcut, and a requested non-ideal liquid run as ideal.
    Both were declared, in comments the agent chose to write.  Nothing in the
    result JSON, the KPIs or `converged/` carried either, and the distillate
    still read 99.55 mol% acetone.

    THE DISTINCTION THIS CLASS EXISTS TO PROTECT.  An advisory says the answer
    is qualified: "Antoine extrapolated 3 K beyond its range" leaves the
    question unchanged.  A DIVERGENCE says the answer is to a DIFFERENT
    QUESTION.  The agent put it exactly right: those two must not share a
    channel, because a run emitting nine warnings makes the tenth invisible,
    and one of them is not a warning at all.

    So this is NOT AdvisoryLog with a new severity.  It is a separate record,
    surfaced separately, ABOVE the KPIs rather than below them.

    THE CONTRACT IS INVERTED FROM WHAT IT WAS.  Until now a downgrade happened
    and the declaration was optional afterwards.  Now:

        an approximation the author AUTHORISED  -> may be used, and is RECORDED
        an approximation nobody authorised      -> REFUSED

    Authorisation is the presence of a delimited block, exactly as
    `approximations { idealMolecularVLE { components ( … ); } }` already works
    in ThermoPackageBuilder -- that contract was extended rather than a second
    one invented.

    TWO KINDS, and they are different:

      * SUBSTITUTION -- the engine would otherwise deliver something other than
        what was requested (a declared NRTL pair with no parameters running as
        ideal).  Refused unless authorised, because the author asked for one
        thing and would silently receive another.

      * DECLARED APPROXIMATION -- the author chose an approximate model
        knowingly (an FUG shortcut column).  Not refused: it is what was
        asked for.  But it is recorded, because a reader six months later
        cannot tell from a stream table that the column was a shortcut, and
        FUG's own assumptions (constant relative volatility, no azeotrope)
        may be exactly what the process turns on.

\*---------------------------------------------------------------------------*/

#pragma once

#include <string>
#include <vector>

namespace Choupo {

struct Divergence
{
    //  "substitution" | "declaredApproximation"
    std::string kind;
    //  where it happened -- a unit name, or a thermo model + pair
    std::string locus;
    //  what the author asked for, in the author's own vocabulary
    std::string requested;
    //  what actually ran
    std::string solved;
    //  the author's declared justification; empty when none was required
    std::string reason;
};

class ProblemDivergence
{
public:
    static ProblemDivergence& instance()
    {
        static ProblemDivergence inst;
        return inst;
    }

    void clear() { entries_.clear(); }

    //  Deduplicated on (kind, locus, requested, solved): a thermo package may
    //  be rebuilt several times in one run, and the same substitution must not
    //  be counted twice -- a divergence LIST whose length depends on how often
    //  a builder ran would be reporting the software, not the problem.
    bool add(std::string kind, std::string locus,
             std::string requested, std::string solved, std::string reason)
    {
        for (const auto& e : entries_)
            if (e.kind == kind && e.locus == locus
             && e.requested == requested && e.solved == solved)
                return false;
        entries_.push_back({ std::move(kind), std::move(locus),
                             std::move(requested), std::move(solved),
                             std::move(reason) });
        return true;
    }

    const std::vector<Divergence>& entries() const { return entries_; }
    bool empty() const { return entries_.empty(); }

private:
    ProblemDivergence() = default;
    std::vector<Divergence> entries_;
};

}   // namespace Choupo
