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
Description
    The LIQUID-LIQUID residual of fitParameters (DEV.md 4c C226 A1).

    `residual { kind T_bubble+LLE; }` adds MEASURED BINODAL compositions to a
    bubble-temperature fit, in the SAME least-squares problem.  A partially
    miscible binary (water + 1-butanol) has two kinds of evidence about one
    pair of parameters: where its boiling liquid sits (T_bubble) and where
    its two liquids sit (the binodal).  A pair fitted to the first alone
    either splits the liquid wherever it likes or not at all (C16 slice 2,
    ethanol + cyclohexane); the second is the only measurement that pins the
    gap.

    ONE DATUM = ONE TIE LINE = TWO ROWS.  A tie line is (T, x_phase1,
    x_phase2): the mole fraction of the FIRST named component in each
    liquid, measured at T.  The model answers by the SAME liquid-liquid flash
    propertyScanBinary uses -- IsothermalFlash::solveCore with PhaseSet::LL,
    the Gibbs minimisation that DECIDES and the Newton that SOLVES -- and the
    two rows are

        r_lo = (x_lo,model - x_lo,meas) / sigma
        r_hi = (x_hi,model - x_hi,meas) / sigma

    the branches matched BY ORDER (the lean one with the lean one), so the
    labels alpha/beta of the flash never matter.  sigma is a MOLE FRACTION,
    DECLARED (`residual { liquidLiquid { sigma 0.01; origin "..."; } }`,
    no default): the residual is dimensionless, exactly as the T_bubble
    residual is under `weighting uncertainty` (dT/U), so the two kinds add in
    one chi2 with the weights the author chose.  Mixing therefore REQUIRES
    `weighting uncertainty;` -- a kelvin and a mole fraction cannot be summed
    unweighted, and the engine refuses by name instead of choosing a scale.

    A MODEL THAT PREDICTS ONE LIQUID WHERE TWO WERE MEASURED is not given a
    made-up residual: the row takes the 1.0e3 penalty the bubble-T rows take
    (counted as penalised, never in the statistics), and the run SAYS SO, tie
    line by tie line.  If EVERY tie line is penalised at the starting
    parameters the fit refuses by name: the penalty is flat, the search has
    no gradient, and a start that splits nothing cannot find the gap -- start
    from parameters that split (a fit to the T_bubble alone is not one).

    THE FEED OF THE FLASH is not an input: the tie line is the same for any
    feed inside the model's gap, so several feeds between the two measured
    compositions are tried and the first that splits is taken.

    THE HELD-OUT BAND is `acceptance { maxLLE <x>; }`, a mean absolute
    deviation of the binodal mole fractions (dimensionless), declared before
    the fit like `maxAAD` and part of the same fingerprint.

    WHY A SEPARATE FILE.  FitParameters.cpp is cited line by line by the
    EduTools least-squares lesson (gui/tests/numericsLessons.test.ts); the
    liquid-liquid logic lives here so the fitter gains it through one-line
    call sites.
\*---------------------------------------------------------------------------*/

#pragma once

#include "EvidencePartition.H"
#include "core/Dictionary.H"
#include "core/PublishedTable.H"
#include "core/Types.H"

#include <cstdio>
#include <map>
#include <memory>
#include <string>
#include <vector>

namespace Choupo {

class ThermoPackage;

namespace lle {

constexpr const char* kindMixed   = "T_bubble+LLE";
constexpr const char* propertyLLE = "binaryLLE.binodal";
constexpr scalar      penalty     = 1.0e3;      // the bubble-T rows' sentinel

//  One measured tie line: comp-1 mole fractions of the two liquids, lean one
//  first.
struct Tie { scalar T = 0.0; scalar xLo = 0.0; scalar xHi = 0.0; };

//  The LLE rows of one fit (or held-out) set.  They sit AFTER `first` bubble
//  rows in the residual vector: row first+2t is the lean branch of tie t,
//  first+2t+1 the rich one.
struct Rows
{
    std::size_t      first = 0;
    scalar           sigma = 1.0;
    std::vector<Tie> ties;
    std::size_t size() const { return 2 * ties.size(); }
    bool active() const { return !ties.empty(); }
    bool isRow(std::size_t k) const { return k >= first && k < first + size(); }
};

//  The rows computeResiduals reads while a fit is running (the s_bubbleP
//  precedent: one operation runs at a time).  Scope restores it.
extern const Rows* current;
struct Scope
{
    explicit Scope(const Rows* r) { current = (r && r->active()) ? r : nullptr; }
    ~Scope() { current = nullptr; }
    void set(const Rows* r) { current = (r && r->active()) ? r : nullptr; }
};

//  fixed, 8 decimals: the proposal's own number format (any model's keys)
inline std::string fmt8(scalar v)
{
    char buf[64];
    std::snprintf(buf, sizeof buf, "%.8f", v);
    return buf;
}

bool isMixed(const std::string& kind);
bool inRows(const Rows& r, std::size_t k);

//  Evidence routing: a dataset is liquid-liquid when its header says
//  `property binaryLLE.binodal;`.  Under the mixed kind a dataset with any
//  other property that is not binaryVLE.T_bubble is REFUSED by name.
std::vector<EvidenceDataset> vleSets(const std::vector<EvidenceDataset>& all, bool mixed);
std::vector<EvidenceDataset> lleSets(const std::vector<EvidenceDataset>& all);

//  The declared sigma (REQUIRED, with its origin) and the mode's refusals.
scalar readSigma(const DictPtr& resDict);
void   requireFitMode(const std::string& kind, bool evalMode,
                      const std::string& weighting);

//  Read the tie lines; `first` = index of the first LLE row.
Rows load(const std::vector<EvidenceDataset>& sets, const std::string& comp1,
          scalar sigma, std::size_t first, const std::string& label);

//  Append the rows to the (x, T, p) arrays the bubble engine keeps, so the
//  residual vector, the Jacobian and the statistics run over ONE index.
void append(const Rows& r, sVector& xExp, sVector& tExp, sVector& pExp);

//  The first `r.first` entries (the bubble rows) when r is active, else v.
sVector head(const sVector& v, const Rows& r);

//  The weights vector extended with 1/sigma for the LLE rows.
sVector withRows(sVector bubbleWeights, const Rows& r);

//  The residual of row k (called by computeResiduals).  The two rows of a tie
//  share ONE flash.
scalar row(const ThermoPackage& thermo, const Rows& r, std::size_t k,
           std::size_t i1, std::size_t i2, const sVector* weights);

//  One tie line through the engine: does the model split, and where.
struct Binodal { bool split = false; scalar xLo = 0.0; scalar xHi = 0.0; };
Binodal solveTie(const ThermoPackage& thermo, scalar T, scalar xLo, scalar xHi,
                 std::size_t i1, std::size_t i2);

//  Refuse (by name) a start that splits no measured tie line; announce the
//  ones it does not.  `residuals` = the first residual vector.
void requireSplitAtStart(const Rows& r, const sVector& residuals);

struct Stats
{
    std::size_t ties = 0;
    std::size_t penalisedTies = 0;
    scalar      aad = 0.0;          // mean |dx| over the rows that split
    scalar      maxAbs = 0.0;
};
//  From UNWEIGHTED residuals r[first .. first+2t).
Stats statsOf(const Rows& r, const sVector& unweighted);

//  The held-out pass: tie lines the fitter never saw, solved with the fitted
//  parameters.  Prints each tie line that the model leaves one liquid.
Stats heldOut(const ThermoPackage& thermo, const Rows& r, std::size_t i1,
              std::size_t i2, int verbosity, scalar band);

//  Publish the in-sample statistics under lle_* keys, and (separately) the
//  held-out ones.
void publish(std::map<std::string, scalar>& diag, const Rows& fit,
             const sVector& unweighted);
void publishHeldOut(std::map<std::string, scalar>& diag, const Stats& held);

//  The verdict: the bubble-T rule (CurationDossier::verdictOf, passed in as
//  `bubbleVerdict`) AND the binodal band.  A held-out kind present must have
//  its band declared (refused by name before the fit), and a held-out tie
//  line the model leaves one liquid is a MISS, named.
std::string verdict(const EvidencePartition& part, const std::string& bubbleVerdict,
                    bool bubbleHeldOut, bool lleHeldOut, const Stats& held);

//  Refused BEFORE the fit: a held-out kind with no band declared.
void requireBands(const EvidencePartition& part, bool bubbleHeldOut, bool lleHeldOut);

//  The PUBLISHED table of the tie lines (measured and fitted branches).
//  Columns: tie, T_K, x_lo_meas, x_lo_model, x_hi_meas, x_hi_model.
PublishedTable fitPointsTable(const ThermoPackage& thermo, const Rows& r,
                              std::size_t i1, std::size_t i2);

//  The text the promotable record carries for a pair fitted with LLE
//  evidence (empty when `r` is not active): `liquidLiquid true;` and the
//  gap evidence + band the catalogue gate reads (arm f).
std::string recordBlock(const EvidencePartition& part, const Rows& fit,
                        const Stats& inSample, const Stats* held, scalar band);

} // namespace lle
} // namespace Choupo
