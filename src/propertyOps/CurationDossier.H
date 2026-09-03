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
    Choupo::CurationDossier

Description
    THE CURATION DOSSIER -- a scientific work record, NOT runtime property
    data, and structurally out of the solver's reach.

    Ruled 2026-08-11.  The automated curation phase must not end by writing a
    partially-trusted component record into a catalogue tier: that was the
    shape of the retired `data/proposed/`, and recreating it under another
    name would repeat the architectural mistake that retired it.  So the first
    phase produces a DOSSIER with EVIDENCE semantics instead, and only an
    explicit human promotion puts anything into `data/standards/`:

        curation dossier  ->  human review / promotion  ->  data/standards/

    The governing sentence:

        Curation state belongs to the evidence process; runtime trust belongs
        to the numerical record actually admitted to standards.

    WHY `<case>/curation/` AND NOT SOMEWHERE ELSE.  Record resolution looks in
    exactly three places -- `<case>/constant/<sub>`, `data/standards/` and
    `data/local/` (RecordResolver.H, Database.cpp).  A file under
    `<case>/curation/` is therefore unreachable by the resolver BY
    CONSTRUCTION, which makes "nothing in the dossier is visible to the
    solver" a fact about the code rather than a promise about behaviour.
    `generated/` was considered and rejected: everything there is regenerable
    on demand and staleness-gated, while a dossier whose evidence may sit
    outside the repository is regenerable by nobody -- its staleness gate
    would be checking something it cannot recompute.

    MATURITY IS PER PROPERTY OBJECT, never per component.  A component
    legitimately holds a mixture -- one property validated, another estimated,
    another missing -- so there is no whole-component status word here.  Any
    such summary is DERIVED from the records below, and deriving it is the
    reader's job; storing it beside them would be a second home for a fact the
    records already carry.

    THE FOUR METRICS ARE KEPT APART, deliberately and by field name:

        r2InSample        how well the model reproduces what it was GIVEN
        rmsHeldOut        how it fares on evidence it never saw
        aadHeldOutPct     the same, in a unit a reader can judge
        verdict           whether that met a PRE-DECLARED band

    Merging them into one "good fit" number is precisely the claim this whole
    contract exists to prevent, and the field names are the enforcement.

    THE VERDICT IS NOT THE ENGINE'S TO INVENT.  Held-out residuals are a
    measurement; whether they are small enough is a judgement.  So a verdict
    of `validated` is reported ONLY against an acceptance band the case
    declared BEFORE the fit (EvidencePartition::hasAcceptance).  With no band
    the dossier says `heldOutPerformed` and reports the numbers, claiming
    nothing -- which is the honest state, not a missing feature.

\*---------------------------------------------------------------------------*/

#pragma once

#include "EvidencePartition.H"
#include "core/Types.H"

#include <cstddef>
#include <limits>
#include <ostream>
#include <string>
#include <utility>
#include <vector>

namespace Choupo {

class CurationDossier
{
public:
    //  One PROPERTY of one component, as one operation resolved it.
    struct PropertyRecord
    {
        std::string property;        // "vapourPressure", "liquidHeatCapacity"
        std::string opName;
        std::string opType;
        std::string model;           // "Antoine", "polynomial (degree 2)"
        std::vector<std::pair<std::string, scalar>> parameters;

        //  The frozen declaration.
        bool                         engaged = false;
        std::string                  fingerprint;
        std::vector<EvidenceDataset> fitSets;
        std::vector<EvidenceDataset> validationSets;

        //  Experimental domains, per role (0/0 when the role is empty).
        scalar      fitMin = 0.0,  fitMax = 0.0;
        scalar      valMin = 0.0,  valMax = 0.0;
        std::string domainUnit;      // "K"
        std::size_t nFit = 0, nValidation = 0;

        //  The four metrics, never merged.
        //  NaN = THIS OPERATION DOES NOT COMPUTE THIS METRIC.  Not zero:
        //  a printed `r2InSample 0` reads as a catastrophically bad fit, and
        //  fitParameters (which reports chi-square, not R2) wrote exactly that
        //  on its first dossier.  A metric nobody computed must be ABSENT, and
        //  absence needs a value that cannot be mistaken for a measurement.
        scalar r2InSample    = std::numeric_limits<scalar>::quiet_NaN();
        bool   heldOut       = false;
        scalar rmsHeldOut    = std::numeric_limits<scalar>::quiet_NaN();
        std::string rmsUnit;
        scalar aadHeldOutPct = 0.0;

        bool   hasAcceptance   = false;
        scalar acceptMaxAADPct = 0.0;
        //  WHERE THE BAND CAME FROM.  Recorded beside the limit because a
        //  reader auditing a verdict months later needs to know whether the
        //  criterion was an experimental uncertainty, a literature tolerance
        //  or an engineering choice -- and, above all, that it existed BEFORE
        //  the residuals did.
        std::string acceptOrigin;

        //  notClaimed | validationRefused | heldOutPerformed | validated
        //  | notValidated
        std::string verdict;
        std::string refusal;         // the verbatim refusal, when there is one
    };

    static CurationDossier& instance();

    void add(const std::string& component, PropertyRecord r);
    bool empty() const { return records_.empty(); }
    void clear() { records_.clear(); }

    //  Derive the verdict from what the run observed.  Static so the rule has
    //  ONE home and both ops cannot drift into two readings of it.
    static std::string verdictOf(const EvidencePartition& part,
                                 bool heldOut, scalar aadPct);

    //  ONE WRITER for a declared piece of evidence, because two artefacts now
    //  record the same fact and a second copy of this formatting is a second
    //  place for it to drift: the curation dossier, and the promotable pair
    //  record `fitParameters` proposes.  `indent` is the column the entry's
    //  opening brace sits at; its keys sit four further in.
    static void writeEvidenceSets(std::ostream& os,
                                  const char* role,
                                  const std::vector<EvidenceDataset>& sets,
                                  const std::string& indent);

    //  Write one `<cwd>/curation/<component>.dossier` per component seen.
    //  Returns the paths written.
    std::vector<std::string> write() const;

private:
    CurationDossier() = default;
    std::vector<std::pair<std::string, PropertyRecord>> records_;
};

} // namespace Choupo
