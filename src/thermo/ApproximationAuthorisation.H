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
    Choupo::ApproximationAuthorisation

Description
    THE CASE'S AUTHORISED APPROXIMATIONS, PARSED ONCE AND PROPAGATED.

    `approximations { ... }` stays at the TOP LEVEL of the thermophysical
    system, where `idealMolecularVLE` already lives.  That placement is not
    economy, it is meaning: **the authorisation is a statement about the CASE,
    not about the model**.  An author writing "ideal is acceptable for this
    pair" is making a scientific concession about their problem; filing it
    inside `activityModel {}` would record a scientific concession as a
    configuration parameter of an object, and would give one decision two homes
    in the grammar.

    THE PROBLEM THIS CLASS SOLVES IS PROPAGATION, NOT GRAMMAR.  An activity
    model's constructor receives only the `activityModel` sub-dict and can
    never see the top level.  Six call sites construct activity models.  Rather
    than thread a parameter through all six -- or, worse, let each re-parse the
    block and drift -- the block is parsed ONCE, where the builder already
    reads it, and consulted from here.  Same shape as `readIdentity()` /
    `readAqueousMapping()`: one parse, several callers, never a second copy of
    the parse.

    THE ORDERING HAZARD IS REAL AND IS HANDLED EXPLICITLY.  A run-scoped record
    consulted by a constructor is only safe if "nobody read the case yet" is
    distinguishable from "the case authorises nothing".  Collapsing those two
    would let a construction path that runs before the read produce a REFUSAL
    THE AUTHOR CANNOT ESCAPE -- a false refusal, which is the exact defect this
    whole slice exists to remove.  So the state is tri-valued:

        NotRead        no case-level block has been read on this path.
                       A model may NOT refuse: it does not know whether an
                       authorisation exists, and refusing on ignorance is
                       worse than proceeding on it.  It announces and records
                       the divergence instead, marked as unverifiable here.

        Read, empty    the case was read and authorises nothing.
                       A model MUST refuse an unauthorised substitution.

        Read, listed   the case authorises these pairs, and only these.

    `clear()` returns to NotRead, so a driver running many passes cannot leak
    one case's authorisation into the next.

    `resolveIdealPairSubstitution()` (below) is the ONE HOME of the decision
    itself -- refuse, record, announce.  NRTL, UNIQUAC and Wilson all reach the
    same ideal default by the same route and must all answer for it the same
    way; three transcriptions of one refusal would be the arity sin committed
    inside the machinery built to enforce it.

\*---------------------------------------------------------------------------*/

#pragma once

#include "core/Dictionary.H"

#include <set>
#include <string>
#include <vector>

namespace Choupo {

class ApproximationAuthorisation
{
public:
    static ApproximationAuthorisation& instance()
    {
        static ApproximationAuthorisation inst;
        return inst;
    }

    //  Back to NotRead.  An outer driver runs the same functor many times and
    //  one pass's authorisation must never survive into the next.
    void clear()
    {
        read_ = false;
        idealPairs_.clear();
        reason_.clear();
    }

    //  THE ONE PARSE.  Called by the builder with the top-level thermophysical
    //  system dict; safe to call with a dict that carries no block at all --
    //  that is the "Read, empty" state and it is a real answer.
    void readFrom(const DictPtr& topLevel)
    {
        read_ = true;
        idealPairs_.clear();
        reason_.clear();
        if (!topLevel || !topLevel->found("approximations")) return;
        auto ap = topLevel->subDict("approximations");
        if (!ap->found("idealBinaryPair")) return;
        auto ib = ap->subDict("idealBinaryPair");
        for (const auto& w : ib->lookupWordList("pairs"))
            idealPairs_.insert(w);
        reason_ = ib->lookupWordOrDefault("reason", "");
    }

    //  False until a case has been read.  A caller that refuses on an
    //  unauthorised substitution MUST gate on this: see the header note.
    bool wasRead() const { return read_; }

    bool authorisesIdealPair(const std::string& a, const std::string& b) const
    {
        return idealPairs_.count(a + "-" + b) || idealPairs_.count(b + "-" + a);
    }

    const std::string& reason() const { return reason_; }

private:
    ApproximationAuthorisation() = default;
    bool read_ = false;
    std::set<std::string> idealPairs_;
    std::string reason_;
};


//  THE DECISION, once, for every pair-parameter activity model.
//
//  A declared model whose pair has no parameters does not run that model: it
//  runs IDEAL, which is a different model and often a different answer.  Until
//  2026-08-11 that was announced afterwards and applied -- the contract the
//  wrong way round.  Now:
//
//      authorised by the case  -> runs, and is RECORDED as a divergence
//      not authorised          -> REFUSED, with the four legitimate paths
//
//  `model` is the model's own name as the author wrote it ("NRTL"), used in
//  the refusal, the divergence locus and the parameter-directory remedy.
//  `idealDefaulted` holds "<a>-<b>" pair keys.  Empty is a no-op.
void resolveIdealPairSubstitution(const std::string& model,
                                  const std::vector<std::string>& idealDefaulted);

}   // namespace Choupo
