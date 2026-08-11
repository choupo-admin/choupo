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
    Choupo::EvidencePartition

Description
    THE FIT / HELD-OUT VALIDATION CONTRACT.

    Until this class existed, every residual statistic `choupoProps` could
    produce was IN-SAMPLE, and nothing said so.  `fitParameters` recorded one
    `fitData` path and a chi-square over the points it had just fitted;
    `freezingPoint` and `pitzerActivity` carried a `validation {}` block whose
    parameters came from the CATALOGUE, so the comparison was honest but
    nothing anywhere established that those catalogue parameters had not
    themselves been fitted against the very same measurements upstream.  The
    word `validation` could only mean `comparison`.

    What this class adds is not a mechanism -- the dataset-from-file grammar
    already existed -- but a DECLARED, FROZEN, REFUSABLE relationship between
    a fit and the evidence it did not see:

        evidence
        (
            {
                dataset   "constant/experiments/psat-water-lowT.dat";
                identity  { doi "10.xxxx/aaaa"; sha256 "..."; }
                role      fit;
            }
            {
                dataset   "constant/experiments/psat-water-highT.dat";
                identity  { doi "10.xxxx/bbbb"; }
                role      validation;
            }
        );

    THE ANCHOR IS ENFORCED BY CONSTRUCTION, NOT BY RULE.  The partition is
    parsed and frozen BEFORE any fitting code runs, and a caller obtains the
    fitting points through `fit()` and the held-out points through
    `validation()`.  The fitter is not forbidden to move a validation point
    into the fit; it is NEVER HANDED ONE.  A rule can be broken by the next
    edit -- a data-flow fact cannot.  `fingerprint()` additionally makes an
    after-the-fact edit of the declaration detectable.

    `role` HAS NO DEFAULT.  A defaulted role would silently make every dataset
    a fitting dataset and re-create the in-sample problem invisibly -- the same
    shape as the forward-reaction `order` that had five readers with five
    defaults, where a reactant with no declared order silently left its own
    rate law.

    THE LEGACY FORM STAYS, AND MAKES NO CLAIM.  An op declaring the older
    single `dataset "<path>";` gets one fitting dataset and `engaged() ==
    false`: it behaves exactly as before, and it never claimed a validation,
    so nothing is refused.  Declaring BOTH forms is ambiguous about which the
    author meant and is REFUSED rather than resolved by an undeclared
    precedence -- the same posture the stream reader takes for two material
    forms.

    THE REFUSALS (each by name; R5 shipped 2026-08-11 -- see the note under it,
    which is the interesting half):

      R1  the contract is engaged and NO dataset carries `role validation`
          -> "VALIDATION REFUSED: No independent experimental evidence
              remains after fitting."
          The op must then report its chi-square LABELLED IN-SAMPLE and must
          not present it as an external validation.

      R2  a dataset entry declares no `role`  -> refused, naming the dataset
          and both legal words.

      R3  the same evidence appears in both roles -- same path, same `sha256`
          or same `doi` -> refused, naming which identity collided.  This is
          the ONLY independence question a machine may settle: an identity
          collision is a fact.

      R4  the validation set is empty after the op's own domain filtering
          -> refused.  An empty comparison must never report as a pass; that
          is the shape of a check that cannot run and therefore must not.

      R5  an `evidence ( )` partition declared on an operation that performs
          NO fit -> refused.  See refuseOnNonFittingOp below.

    R5 SHIPPED 2026-08-11, and what it turned into is worth recording, because
    it is not what the plan said.  The plan expected it with "the slice that
    folds freezingPoint and pitzerActivity onto this reader" -- i.e. it assumed
    those two ops would BECOME fitters.  Measuring the op catalogue instead of
    remembering it showed they never will: `pitzerActivity` evaluates curated
    Pitzer parameters, `freezingPoint` derives the depression curve from the
    solvent's own record, and `estimateComponent` computes constants from
    molecular groups.  All three read data, none regresses against it.
    choupoProps has exactly TWO pure-property fitters (vapourPressure, heat
    capacity) and both carried the contract already.

    So R5 is not a step toward folding them in -- it is the refusal that says
    they can never be folded in, and why.  An operation with no fit has nothing
    to withhold data FROM, so the held-out claim is unavailable to it rather
    than merely unproven.  That is a stronger and more useful statement than
    the plan anticipated, and it is why the three ops keep their `validation {}`
    comparison unchanged: the refusal is about the CLAIM, never the comparison.

    INDEPENDENCE IS ANNOUNCED, NEVER ADJUDICATED.  Whether two studies are
    scientifically independent is a human judgement.  This class settles the
    one mechanical question that IS a fact (R3's identity collision) and
    ANNOUNCES the rest -- a shared DOI within a role, a dataset with no
    declared identity -- as findings for the reviewer, in the register the
    project already uses for "two independent primaries 0.39 % apart -- a
    finding, not an error".  Domain overlap and duplicate observations need
    the loaded numbers and are announced by the CALLER, which has them.

\*---------------------------------------------------------------------------*/

#pragma once

#include "core/Dictionary.H"
#include "core/Types.H"

#include <cstddef>
#include <string>
#include <vector>

namespace Choupo {

//  One declared piece of experimental evidence, with its role frozen.
struct EvidenceDataset
{
    std::string path;      // the dataset file, as declared
    std::string series;    // optional named series inside it
    std::string doi;       // identity -- optional, but see announce()
    std::string sha256;    // identity -- optional
    std::string role;      // "fit" | "validation"  (never defaulted)
};

//  A loaded (x, y) pair from a dataset's declared columns.
struct EvidencePoint
{
    scalar x = 0.0;
    scalar y = 0.0;
};

class EvidencePartition
{
public:
    //  Parse the op's dict.  Refuses R2 and R3 here; R1 and R4 are asked for
    //  later, because they depend on what the caller does with the points.
    //  `opLabel` prefixes every message so a refusal names its own op.
    static EvidencePartition read(const DictPtr& opDict,
                                  const std::string& opLabel);

    //  True when an `evidence ( ... )` block was declared -- i.e. the author
    //  engaged the contract.  False for the legacy single-`dataset` form,
    //  which claims nothing and is refused nothing.
    bool engaged() const { return engaged_; }

    const std::vector<EvidenceDataset>& fit() const { return fit_; }
    const std::vector<EvidenceDataset>& validation() const { return validation_; }

    //  R1.
    bool validationRefused() const { return engaged_ && validation_.empty(); }

    //  THE ACCEPTANCE CRITERION, and why it is OPTIONAL but PRE-DECLARED.
    //  Held-out residuals are a measurement; whether they are SMALL ENOUGH is
    //  a judgement, and the engine may not make it silently.  So:
    //    * declared  -> the run may report VALIDATED or NOT VALIDATED;
    //    * absent    -> the run reports that a held-out validation was
    //                   PERFORMED, with its residuals, and claims no verdict.
    //  The band is part of the frozen declaration and rides the fingerprint,
    //  because widening it after seeing the residuals is the same
    //  tuning-to-the-answer the partition itself exists to prevent.
    bool   hasAcceptance() const { return hasAcceptance_; }
    scalar acceptanceMaxAADPct() const { return maxAADPct_; }
    //  The DECLARED provenance of the band -- mandatory when a band exists,
    //  because a limit with no stated origin cannot be distinguished from one
    //  chosen after the residuals were seen.
    const std::string& acceptanceOrigin() const { return acceptanceOrigin_; }
    static const char* refusalR1();

    //  R4 -- the caller knows how many validation points survived its own
    //  domain filtering, and only the caller can know.
    void requireNonEmptyValidation(std::size_t nSurviving,
                                   const std::string& opLabel) const;

    //  R5 -- THE CONTRACT MAY ONLY BE DECLARED ON AN OPERATION THAT FITS.
    //
    //  Called by an operation that performs NO regression but does read data
    //  (pitzerActivity, freezingPoint, estimateComponent: each evaluates a
    //  curated or estimated parameter set and compares it against a dataset).
    //  Declaring `evidence ( ... role validation ... )` there is a category
    //  error, and a quiet one: the block would be parsed, the words "held out"
    //  would be true of nothing, and the run would read like a validation.
    //
    //  The distinction the refusal exists to protect (philosophy 3c):
    //  COMPARISON asks whether a model agrees with data; HELD-OUT VALIDATION
    //  additionally establishes that the data were withheld from the fit being
    //  assessed.  An op with no fit has nothing to withhold data FROM, so the
    //  stronger claim is unavailable to it -- not merely unproven.
    //
    //  It names the legacy `validation {}` block as the remedy, because a
    //  comparison against curated parameters IS scientifically useful and is
    //  what that block already does.  The refusal is about the CLAIM, never
    //  about the comparison.
    static void refuseOnNonFittingOp(const DictPtr& opDict,
                                     const std::string& opLabel,
                                     const std::string& whatItCompares);

    //  THE ONE WORDING of what a comparison is and is not.
    //
    //  An operation that compares curated parameters against a dataset makes a
    //  real and useful statement, and a WEAKER one than it used to sound like:
    //  until 2026-08-11 four console lines called it "validation", which reads
    //  as the strong claim while establishing only the weak one.  The word is
    //  now COMPARISON everywhere a human reads it, and this sentence says what
    //  the difference is -- in ONE home, because two ops print it and a
    //  sentence with two homes drifts exactly as a number does.
    static const char* comparisonCaveat();

    //  FNV-1a over the canonical declaration (role|path|doi|sha256, sorted).
    const std::string& fingerprint() const { return fingerprint_; }

    //  The partition and the identity-level independence facts.
    void announce(const std::string& opLabel, int verbosity) const;

    //  THE ONE dataset loader.  Reads `columns ( { name; unit; } ... )` +
    //  `data ( ... )`, converts to canonical SI, and returns the two named
    //  columns.  Lives here because the contract must load fitting and
    //  held-out evidence through the SAME reader -- two readers could differ,
    //  and a difference between them would look like a model error.
    //  `xNames` / `yNames` are the accepted spellings, in preference order.
    static std::vector<EvidencePoint>
    loadColumns(const EvidenceDataset& ds,
                const std::vector<std::string>& xNames,
                const std::vector<std::string>& yNames,
                const std::string& opLabel);

    //  Concatenate a role's datasets through loadColumns().
    static std::vector<EvidencePoint>
    loadAll(const std::vector<EvidenceDataset>& sets,
            const std::vector<std::string>& xNames,
            const std::vector<std::string>& yNames,
            const std::string& opLabel);

private:
    bool                         engaged_ = false;
    bool                         hasAcceptance_ = false;
    std::string                  acceptanceOrigin_;
    scalar                       maxAADPct_ = 0.0;
    std::vector<EvidenceDataset> fit_;
    std::vector<EvidenceDataset> validation_;
    std::string                  fingerprint_;
};

} // namespace Choupo
