/*  SPDX-License-Identifier: GPL-3.0-or-later
    Part of Choupo (GPL-3.0-or-later); see NOTICE and AUTHORS.

    announceFitGrade -- A FITTED VALUE SAYS HOW WELL IT FITS (DEV.md 4c C285,
    2026-11-10; pairs since C286).  The acceptance of a curation fit is
    GRADED: `bin/choupo-curate` writes `fitGrade clean|warning|severe;` into
    the provenance entry of what it promoted, with the numbers that decided
    it -- the largest relative error over the kept measurements
    (`fitGradeMaxRelativeError_pct`), the largest absolute temperature error
    over them (`fitGradeMaxTemperatureError_K`, a bubble-temperature pair
    fit), and, where a normal-boiling-point criterion applied, the gap there
    (`fitGradeBoilingPointGap_K`).  A clean fit says nothing more; a warning
    or a severe grade is VOICED on every run that loads the record, once per
    subject and value per process, into the caveat block and the result JSON
    advisories.  A grade word this reader does not know REFUSES by name --
    `refused` included, because a refused fit is not a catalogue value.

    ONE home for the sentence, read by BOTH record loaders: the component
    loader (src/thermo/Database.cpp, per provenance entry, `key` = the
    property) and the pair loaders through fillPairAudit
    (src/thermo/PairAudit.H, the record's own provenance, `key` empty).  A
    second copy of the wording is how the two kinds of record would come to
    say two different things about the same fact.  */

#pragma once

#include "core/Advisory.H"
#include "core/Dictionary.H"

#include <iostream>
#include <sstream>
#include <stdexcept>
#include <string>

namespace Choupo
{

//  subject: who is spoken about, as the advisory locus prints it
//           ("component 'water'", "pair acetone-methanol");
//  key:     the provenance entry the grade sits in ("vaporPressure"), or
//           empty when the grade is the record's own (a pair);
//  entry:   the dictionary that carries `fitGrade`.
inline void announceFitGrade(const std::string& subject, const std::string& key,
                             const DictPtr& entry)
{
    if (!entry || !entry->found("fitGrade")) return;
    const std::string grade = entry->lookupWordOrDefault("fitGrade", "");
    if (grade == "clean") return;
    if (grade != "warning" && grade != "severe")
        throw std::runtime_error(
            subject + ": provenance" + (key.empty() ? "" : "." + key)
            + " declares `fitGrade " + grade + ";` -- the grades a catalogue"
            " value may carry are clean, warning and severe (DEV.md 4c C285);"
            " a refused fit is not promoted");
    std::ostringstream miss;
    miss.precision(4);
    const bool hasP = entry->found("fitGradeMaxRelativeError_pct");
    const bool hasK = entry->found("fitGradeMaxTemperatureError_K");
    const bool hasT = entry->found("fitGradeBoilingPointGap_K");
    if (hasP)
        miss << "misses some of its measurements by up to "
             << entry->lookupScalar("fitGradeMaxRelativeError_pct") << " %";
    if (hasK)
        miss << (hasP ? ", and " : "") << "misses some of its measurements by up to "
             << entry->lookupScalar("fitGradeMaxTemperatureError_K") << " K";
    if (hasT)
        miss << (hasP || hasK ? ", and " : "") << "places its normal boiling point "
             << std::showpos << entry->lookupScalar("fitGradeBoilingPointGap_K")
             << std::noshowpos << " K from the record's Tb";
    if (!hasP && !hasK && !hasT)
        miss << "records no deciding number";
    const bool severe = (grade == "severe");
    const std::string msg = (key.empty() ? std::string() : "`" + key + "` ")
        + "fitGrade " + (severe ? "SEVERE" : "warning") + " -- the fitted curve "
        + miss.str()
        + (severe ? "; it is WEAK and was accepted only with a SEVERE warning"
                  : "; it was accepted with a WARNING");
    if (AdvisoryLog::instance().addAnnouncedOnce(
            "fitGrade:" + subject + ":" + key, "provenance", "warning",
            subject, msg))
        std::cerr << "[fit-grade] " << subject << ": " << msg
                  << (severe ? ".  Check a result that depends on it against"
                               " the measurements before it is cited.\n"
                             : ".\n");
}

}   // namespace Choupo
