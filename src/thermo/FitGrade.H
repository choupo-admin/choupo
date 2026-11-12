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
    say two different things about the same fact.

    THE GRADE IS IN-SAMPLE, AND A CLEAN NEEDS EVIDENCE THAT COULD HAVE
    CONTRADICTED IT (DEV.md 4c C300, 2026-11-11).  Every graded record says
    `fitGradeBasis inSample;` -- the residual is the curve reproducing the
    very points it was fitted to -- and the voice says "in-sample".  A pair
    fitted at ONE stated temperature or on ONE laboratory, with nothing held
    out, cannot be `clean`: its curation tool caps it at `warning` and names
    the reason, `fitGradeCap ( singleTemperature singleLaboratory );` (one
    or both words), and the voice names the cap.  A basis or a cap word this
    reader does not know refuses by name, and so does a cap beside any grade
    but warning (a cap that lowered nothing is a contradiction).  */

#pragma once

#include "core/Advisory.H"
#include "core/Dictionary.H"

#include <iostream>
#include <sstream>
#include <stdexcept>
#include <string>
#include <vector>

namespace Choupo
{

//  What the record says it HELD OUT, read from the record (EL review, 2026-11-12):
//  the cap sentence used to say "with nothing held out" for every capped record,
//  including those that DID hold points out (eNRTL Na-SO4: 10 fitted, 3 held out).
//  A held-out block is read as a count; the points are still of the same source,
//  so no INDEPENDENT measurement could have contradicted the record either way.
inline std::string heldOutClause(const DictPtr& entry)
{
    long n = 0;
    if (entry->found("heldOut"))
    {
        //  `heldOut none;` (a word, the molecular records' form) is the
        //  "nothing held out" statement; `heldOut { nPoints N; }` is a block.
        try
        {
            auto h = entry->subDict("heldOut");
            if (h->found("nPoints")) n = static_cast<long>(h->lookupScalar("nPoints"));
        }
        catch (const std::exception&) { n = 0; }
    }
    if (n <= 0)
        return " with nothing held out, so no measurement could have contradicted it";
    return " with " + std::to_string(n) + " point" + (n == 1 ? "" : "s")
         + " held out of the same source, so no independent measurement could have"
           " contradicted it";
}

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
    const std::string where = subject + ": provenance" + (key.empty() ? "" : "." + key);
    if (grade != "clean" && grade != "warning" && grade != "severe")
        throw std::runtime_error(
            where + " declares `fitGrade " + grade + ";` -- the grades a catalogue"
            " value may carry are clean, warning and severe (DEV.md 4c C285);"
            " a refused fit is not promoted");
    if (entry->found("fitGradeBasis"))
    {
        const std::string basis = entry->lookupWordOrDefault("fitGradeBasis", "");
        if (basis != "inSample")
            throw std::runtime_error(
                where + " declares `fitGradeBasis " + basis + ";` -- the only basis"
                " is inSample: the grade is the fit reproducing its own points,"
                " and a held-out residual is recorded beside it, never in its"
                " place (DEV.md 4c C300)");
    }
    std::vector<std::string> caps;
    if (entry->found("fitGradeCap"))
    {
        caps = entry->lookupWordList("fitGradeCap");
        if (caps.empty())
            throw std::runtime_error(where + " declares an empty `fitGradeCap ( );`"
                " -- name the reason: singleTemperature, singleLaboratory"
                " (DEV.md 4c C300)");
        for (const std::string& c : caps)
            if (c != "singleTemperature" && c != "singleLaboratory")
                throw std::runtime_error(
                    where + " declares `fitGradeCap ( ... " + c + " ... );` -- the"
                    " allowed words are singleTemperature and singleLaboratory"
                    " (DEV.md 4c C300)");
        if (grade != "warning")
            throw std::runtime_error(
                where + " declares `fitGradeCap` beside `fitGrade " + grade + ";`"
                " -- a cap lowers an in-sample clean to warning and goes with"
                " warning only (DEV.md 4c C300)");
    }
    if (grade == "clean") return;
    std::ostringstream miss;
    miss.precision(4);
    const bool hasP = entry->found("fitGradeMaxRelativeError_pct");
    const bool hasK = entry->found("fitGradeMaxTemperatureError_K");
    const bool hasT = entry->found("fitGradeBoilingPointGap_K");
    if (hasP)
        miss << "misses some of the measurements it was fitted to by up to "
             << entry->lookupScalar("fitGradeMaxRelativeError_pct") << " %";
    if (hasK)
        miss << (hasP ? ", and " : "") << "misses some of the measurements it was"
                " fitted to by up to "
             << entry->lookupScalar("fitGradeMaxTemperatureError_K") << " K";
    if (hasT)
        miss << (hasP || hasK ? ", and " : "") << "places its normal boiling point "
             << std::showpos << entry->lookupScalar("fitGradeBoilingPointGap_K")
             << std::noshowpos << " K from the record's Tb";
    if (!hasP && !hasK && !hasT)
        miss << "records no deciding number";
    const bool severe = (grade == "severe");
    std::string capped;
    if (!caps.empty())
    {
        bool T1 = false, L1 = false;
        for (const std::string& c : caps)
        {
            T1 = T1 || c == "singleTemperature";
            L1 = L1 || c == "singleLaboratory";
        }
        capped = std::string(" CAPPED from an in-sample clean: it rests on ")
            + (T1 ? "ONE stated temperature" : "")
            + (T1 && L1 ? " and " : "")
            + (L1 ? "ONE laboratory" : "")
            + heldOutClause(entry)
            + " (DEV.md 4c C300);";
    }
    const std::string msg = (key.empty() ? std::string() : "`" + key + "` ")
        + "fitGrade " + (severe ? "SEVERE" : "warning") + " --" + capped
        + " in-sample, the fitted curve "
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
