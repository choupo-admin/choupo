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
    Choupo::DataReconciliation

Description
    STEADY-STATE DATA RECONCILIATION OF A FLOW NETWORK, AND ITS GROSS-ERROR
    TESTS (2026-10-20, DEV.md 4c C121).  The witness of the EduTool "Data
    reconciliation, and how Bayes helps".

    A plant's flow meters are read at one instant.  Each reading carries a
    declared standard uncertainty, and the node balances the true flows obey
    are known exactly; the readings, being noisy, do not close them.  This
    operation finds the flows that DO close every balance and move the
    readings as little as their uncertainties allow:

        min  Sum_j ((x_j - m_j) / sigma_j)^2     s.t.   A x = 0

    It does NOT solve that problem itself.  The weighted least squares has
    ONE home in this engine, `analysis::reconcileWeightedLeastSquares`
    (src/streams/AnalysisReconciler), built for the laboratory water analysis
    and generic over its rows; this operation assembles the request -- one
    row per metered flow, one linear law per node balance -- hands it over
    and reads the answer back.  What it computes BESIDE that answer is the
    statistics the answer does not carry:

      * the residual of every balance at the readings, and its standard
        deviation sqrt((A C A^T)_kk), C = diag(sigma^2): how far a balance
        fails to close, measured against how far noise alone would make it;
      * the GLOBAL TEST: the objective at the answer is, when the meters
        carry only their declared noise, distributed as chi-square with
        nu = rank(A) degrees of freedom -- its critical value at the declared
        `alpha`, and its p-value;
      * the MEASUREMENT TEST: each adjustment a_j divided by its own standard
        deviation sqrt(V_jj), V = C A^T (A C A^T)^-1 A C, compared with the
        two-sided normal critical value at the Sidak level
        beta = 1 - (1 - alpha)^(1/N) over the N redundant meters;
      * the POSTERIOR COVARIANCE of the reconciled flows, C - V: what the
        redundancy of the balances buys in precision.

    THE BAYESIAN READING, which is the point of the page this op feeds.  With
    Gaussian measurement noise the likelihood of the readings is
    prod_j exp(-(m_j - x_j)^2 / 2 sigma_j^2); with a FLAT prior on the true
    flows restricted to the balance subspace A x = 0, the posterior is that
    likelihood on that subspace, and its MODE is the weighted least squares
    above.  Its covariance is C - V exactly, because the likelihood is
    Gaussian and the constraint linear.

    A PRIOR THAT IS NOT FLAT is accepted per flow -- an independent Gaussian
    N(x0_j, s_j^2), e.g. yesterday's estimate or a soft sensor -- and it is
    implemented EXACTLY, by completing the square:

        (x - m)^2 / sigma^2 + (x - x0)^2 / s^2
            = (x - m*)^2 / sigma*^2  +  (m - x0)^2 / (sigma^2 + s^2)

        1 / sigma*^2 = 1 / sigma^2 + 1 / s^2,
        m*  = sigma*^2 (m / sigma^2 + x0 / s^2)

    The second term does not depend on x, so the posterior mode and the
    posterior covariance are those of the SAME reconciliation run on the
    precision-weighted pseudo-measurements (m*, sigma*).  That term is
    published separately as the prior-data conflict, a chi-square with one
    degree of freedom per flow that has both a reading and a prior.  A flow
    with a prior and no reading enters as the pseudo-measurement (x0, s).
    The prior is DIAGONAL by construction; a reconciled estimate carried
    over from yesterday is correlated, and those correlations are not
    accepted here -- said, not hidden.

    A METER TAKEN OUT OF SERVICE (`exclude`) leaves its flow UNMEASURED.
    The balances are then PROJECTED: P, whose rows span the left null space
    of the unmeasured columns A_u, eliminates the unmeasured flows exactly,
    and the reconciliation runs on P A_x x = 0 -- a projected row is a
    combination of node balances, named after them ("mixer+reactor").  The
    unmeasured flows are then read back from the balances,
    u = -(A_u^T A_u)^-1 A_u^T A_x x, with covariance L Sigma_x L^T; an
    unmeasured set the balances cannot determine is REFUSED by name.  A
    meter excluded with a reading also publishes how far that reading sits
    from what the other meters and the balances say -- the size of its
    gross error, with its standard deviation.

        operations
        (
            {
                name     honest;
                type     dataReconciliation;
                network  constant/plant/network;   // flows with their sigmas, nodes
                readings constant/plant/readings;  // one snapshot
                alpha    0.05;                     // REQUIRED: no default
                // prior          constant/plant/yesterday;   // optional
                // exclude        F3;                          // or ( F3 F5 )
                // syntheticDrift { meter F3; size 15 t/h; }   // exercise
                output { streams honest_streams.csv;
                         balances honest_balances.csv;
                         covariance honest_covariance.csv; }
            }
        );

    `syntheticDrift` adds a declared offset to ONE reading before anything
    else happens: it is the exercise's way of planting a gross error in an
    invented plant, announced on every run, and a real case has no use for
    it.  The network file's optional `syntheticTruth {}` is the same kind of
    device: the true flows the invented plant ran at, so the page can show
    how far the readings and the reconciled flows sit from them.

    Refused by name: a stream that enters no balance or the same side of two,
    a node with nothing in or out, a node balance that is a combination of
    the others, a reading for an unmetered stream or a meter with none, a
    non-positive sigma, an `exclude` or a drift naming no meter, a reporting
    unit that is not a mass flow, a projected problem with no redundancy left
    or with unobservable unmeasured flows, and an answer pressed against
    non-negativity (the Gaussian statistics above then do not apply).

    Diagnostics (numbers): counts, `objective`, `dof`, `chi2Critical`,
    `pValue`, `globalTestRejects`, `alpha`, `measurementTestLevel`,
    `zCritical`, `maxAbsMeasurementTest`, `flagged`, the prior-conflict
    statistic and its test, and per flow `reconciled_<s>`,
    `sigmaReconciled_<s>`, `adjustmentSigma_<s>`, `measurementTest_<s>`,
    `offset_<s>`/`offsetTest_<s>` (excluded meters), per balance
    `residual_<b>`, `residualTest_<b>`, `multiplier_<b>`.  PUBLISHED IMPLIES
    PINNED: the three CSVs repeat these and add the per-balance attribution,
    the pseudo-measurements and the covariance matrix, which the witness's
    golden pins through the `csv` kind.
\*---------------------------------------------------------------------------*/

#pragma once

#include "PropertyOperation.H"

#include <map>

namespace Choupo {

class DataReconciliation : public PropertyOperation
{
public:
    const std::string& type() const override { return type_; }

    int run(const DictPtr& dict,
            const ThermoPackage& thermo,
            int verbosity) override;

    std::map<std::string, scalar> diagnostics() const override { return diag_; }

    std::vector<std::string> headline() const override
    {
        return { "objective", "dof", "chi2Critical", "globalTestRejects",
                 "maxAbsMeasurementTest", "zCritical", "flagged" };
    }

private:
    std::string type_ = "dataReconciliation";
    std::map<std::string, scalar> diag_;
};

} // namespace Choupo
