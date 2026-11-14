/* Copyright (C) 2026 Vítor Geraldes */
/*  SPDX-License-Identifier: GPL-3.0-or-later
    Part of Choupo (GPL-3.0-or-later); see NOTICE and AUTHORS.
    See ReviewRecord.H (DEV.md 4c C297).  */

#include "ReviewRecord.H"

#include "core/Advisory.H"

#include <iostream>
#include <stdexcept>

namespace Choupo
{

bool readReviewBlock(const std::string& subject, const DictPtr& entry,
                     ReviewRecord& out)
{
    if (!entry || !entry->found("review")) return false;
    if (!std::holds_alternative<DictPtr>(entry->entryValue("review")))
        throw std::runtime_error(subject + ": `review` must be a block"
            " { by ...; reviewer ...; date ...; checked ( ... ); verdict ...; }"
            " (DEV.md 4c C297)");
    const DictPtr r = entry->subDict("review");
    out = ReviewRecord();
    out.by = r->lookupWordOrDefault("by", "");
    if (out.by != "human" && out.by != "model" && out.by != "none")
        throw std::runtime_error(subject + ": review `by "
            + (out.by.empty() ? std::string("<missing>") : out.by)
            + ";` -- the allowed words are human, model and none"
              " (DEV.md 4c C297)");
    out.verdict = r->lookupWordOrDefault("verdict", out.by == "none" ? "accepted" : "");
    if (out.verdict != "accepted" && out.verdict != "flagged"
        && out.verdict != "rejected")
        throw std::runtime_error(subject + ": review `verdict "
            + (out.verdict.empty() ? std::string("<missing>") : out.verdict)
            + ";` -- the allowed words are accepted, flagged and rejected"
              " (DEV.md 4c C297)");
    out.reviewer = r->lookupWordOrDefault("reviewer", "");
    out.date = r->lookupWordOrDefault("date", "");
    out.note = r->lookupWordOrDefault("note", "");
    if (r->found("checked")) out.checked = r->lookupWordList("checked");
    return true;
}

bool announceReviewBlock(const std::string& subject, const std::string& onceKey,
                         const std::string& key, const DictPtr& entry)
{
    ReviewRecord rv;
    if (!readReviewBlock(subject, entry, rv))
    {
        //  THE LEGACY FIELD (DEV.md 4c C300 rule 4, C297's open item).  With
        //  no `review {}` block, `humanReviewed true` reads as `by human`
        //  with no reviewer named (handled: nothing more to say, as a
        //  reviewed record) and `false` -- or no field -- as `by none`
        //  (the caller says what it always said).  A block, when present,
        //  is the one home and the field is not read.
        return entry && entry->lookupWordOrDefault("humanReviewed", "") == "true";
    }

    const std::string what = key.empty() ? std::string() : "`" + key + "` ";
    std::string who;
    if (rv.by == "model") who = "model " + (rv.reviewer.empty() ? std::string("<unnamed>") : rv.reviewer);
    else if (rv.by == "human") who = "human " + (rv.reviewer.empty() ? std::string("<unnamed>") : rv.reviewer);
    else who = "nobody";
    const std::string when = rv.date.empty() ? std::string() : " on " + rv.date;
    std::string checks;
    for (const std::string& c : rv.checked) checks += (checks.empty() ? "" : ", ") + c;
    if (checks.empty()) checks = "none listed";
    const std::string note = rv.note.empty() ? std::string() : " Note: " + rv.note;

    //  Flagged or rejected: a warning whoever reviewed.
    if (rv.verdict != "accepted")
    {
        const std::string msg = what + "review verdict " + rv.verdict
            + " by " + who + when + "; checks: " + checks
            + " -- the record was promoted automatically and its reviewer"
              " doubts it";
        if (AdvisoryLog::instance().addAnnouncedOnce(
                "reviewVerdict:" + onceKey, "provenance", "warning", subject, msg))
            std::cerr << "[review-" << rv.verdict << "] " << subject << ": "
                      << msg << ".  Read its provenance before the result is"
                         " cited." << note << "\n";
        return true;
    }
    if (rv.by == "none") return false;      // today's text, unchanged
    if (rv.by == "human") return true;      // as `reviewed; humanReviewed true`

    const std::string msg = what + "fitted and promoted AUTOMATICALLY; reviewed by "
        + who + when + "; checks: " + checks + "; verdict accepted -- a review is"
        " not a validation";
    if (AdvisoryLog::instance().addAnnouncedOnce(
            "modelReviewed:" + onceKey, "provenance", "warning", subject, msg))
        std::cerr << "[model-reviewed] " << subject << ": " << msg
                  << "; the held-out evidence is stated separately by the"
                     " record's own provenance." << note << "\n";
    return true;
}

}   // namespace Choupo
