/* Copyright (C) 2026 Vítor Geraldes */
/*  SPDX-License-Identifier: GPL-3.0-or-later
    Part of Choupo (GPL-3.0-or-later); see NOTICE and AUTHORS.

    ReviewRecord -- A RECORD SAYS WHO REVIEWED IT, AND WHAT WAS CHECKED
    (DEV.md 4c C297, 2026-11-10).  A provenance entry (a pair record's own
    `provenance {}`, or one value's entry in a component's `provenance {}`)
    may carry, beside `reviewStatus autoPromoted;`,

        review
        {
            by        human|model|none;
            reviewer  "<name or model id>";
            date      2026-11-10;
            checked   ( sourceOpened unitsAndBasis ... );
            verdict   accepted|flagged|rejected;
            note      "...";
        }

    ONE parser, used by BOTH record loaders (src/thermo/Database.cpp for
    component values, src/thermo/PairAudit.H for pairs).  A word outside the
    allowed set REFUSES by name; nothing is guessed.  Absent block: nothing
    here runs and the loaders say exactly what they said before.  A review is
    not a validation, and every announcement here says so.  */

#pragma once

#include "core/Dictionary.H"

#include <string>
#include <vector>

namespace Choupo
{

struct ReviewRecord
{
    std::string by;                    // human | model | none
    std::string reviewer;              // name or model id (may be empty)
    std::string date;
    std::vector<std::string> checked;
    std::string verdict;               // accepted | flagged | rejected
    std::string note;
};

//  Reads `entry`'s `review {}` block into `out`.  Returns false when there is
//  none.  Throws std::runtime_error (naming `subject` and the allowed words)
//  on an unknown `by` or `verdict`, or a missing `by`.
bool readReviewBlock(const std::string& subject, const DictPtr& entry,
                     ReviewRecord& out);

//  The loaders' single call.  Returns true when the review block HANDLED the
//  record's announcement (the caller then skips its "[unreviewed]" text);
//  false when there is no block, or `by none` accepted: the caller then says
//  what it always said.  With no block, a legacy `humanReviewed true;` reads
//  as `by human` (true) and `humanReviewed false;` as `by none` (false)
//  (DEV.md 4c C300 rule 4).
//    subject: "component 'water'" / "pair a-b";  onceKey: process-unique key;
//    key: the provenance entry's property ("" for a pair).
bool announceReviewBlock(const std::string& subject, const std::string& onceKey,
                         const std::string& key, const DictPtr& entry);

}   // namespace Choupo
