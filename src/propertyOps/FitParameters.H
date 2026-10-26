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
    Choupo::FitParameters

Description
    Levenberg-Marquardt regression of thermoPackage parameters against
    experimental data.  Generalises the `FitBinaryPair` outer
    driver (which lived in choupoSolve and abused a dummy flowsheet
    to drive the fit) by living natively in choupoProps.

    Dictionary form:

        {
            name        fit_NRTL_ethanol_water;
            type        fitParameters;

            // Each parameter is a path into the thermoPackage dict.
            parameters
            (
                { path  activityModel.pairs[0].a_ij;  initial -0.8;   min -5.0; max  5.0; }
                { path  activityModel.pairs[0].b_ij;  initial  246.0; min -1500; max 1500; }
                { path  activityModel.pairs[0].a_ji;  initial  3.45;  min -5.0; max  5.0; }
                { path  activityModel.pairs[0].b_ji;  initial -586.0; min -1500; max 1500; }
            );

            residual
            {
                kind      T_bubble;       // current: T_bubble only
                P         1.01325 bar;    // pressure at which the data was taken
                // Data is a flat list (x_1 T_exp x_1 T_exp...); first component
                // index is implicit (= 0).
                data
                (
                    0.0500   362.50
                    0.1000   359.40
                    0.2000   355.10
...
                );
            }

            options
            {
                maxIter      40;
                tolerance    1.0e-4;
                fdStep       1.0e-3;
                lambda0      1.0e-3;
            }

            output
            {
                fit_log    fit_history.csv;     // chi2 + parameters per iter
                parity     parity.csv;          // model vs experiment, post-fit
            }
        }

    Supported `residual.kind` values :

      * T_bubble  --  for each (x_1, T_exp) row, compute T_bubble at the
                       given P and the model parameters, return
                       (T_bubble_model - T_exp).  Drives NRTL / Wilson
                       binary pair regression.

      * P_bubble  --  the same engine with the roles swapped (2026-10-21,
                       DEV.md 4c C123): for each (x_1, P_exp) row at a FIXED
                       T (a `T` column, or the dataset's held-constant
                       `T 298.15 K;`, or `residual.T`), compute the bubble
                       PRESSURE and return the RELATIVE residual
                       (P_model - P_exp)/P_exp -- relative because one
                       isotherm of a gas in a liquid spans 5 to 1100 bar and
                       an absolute residual would let the high-pressure end
                       outvote the pressures a plant runs at.  Built for the
                       kij of a cubic (the path `equilibrium.equationOfState
                       .binaryInteractions.<i>-<j>.kij`, whose inline form the
                       builder accepts only under regression, `origin`
                       named); the proposal it writes is a `recordType
                       eosBinaryInteraction` record the phi-phi package
                       declares by `source`.  `weighting` is refused (the
                       residual is already relative).  The held-out AAD is
                       in per cent of P, the same band grammar as T_bubble.

      * isotherm  --  adsorption-isotherm regression (A1b, contract section
                       2/5): fit the van't Hoff Langmuir surface
                       q = q_max b(T) p / (1 + b(T) p),
                       b(T) = b_ref exp(-dH_ads/R (1/T - 1/tRef)) to
                       (T, p, q) data.  Residual r_j = (q_model - q_j)/sigma_j
                       with sigma from a dataset `sigma` column when present,
                       else 1 mol/kg ABSOLUTE (announced), or
                       `weighting relative;` (sigma_j = max(q_j, floor),
                       floor declared).  POSITIVITY BY TRANSFORMATION: q_max
                       and b_ref are fitted in ln-space (positive by
                       construction, never clamped); dH_ads in natural space,
                       sign free --- a fitted dH_ads > 0 makes the report
                       SCREAM (endothermic adsorption: physically suspicious),
                       never refuse.  Identifiability is structural, not
                       cosmetic: a single-temperature dataset REFUSES to
                       report dH_ads (it fits q_max + b(T_data) only); data
                       confined to the Henry regime (max b p < 0.05) reports
                       ONLY the product q_max*b (the Henry slope) with its
                       uncertainty --- the factors are marked unidentifiable,
                       never quoted with +/-3000%.  The SVD of the
                       relative-scaled Jacobian (J diag(theta), natural
                       parameters) gives the condition number; cond > 1e8 =>
                       rank-deficient.  Covariance from the Gauss-Newton
                       Hessian at the optimum (cov = s^2 (J^T W J)^-1, i.e.
                       2 s^2 against the full chi^2 Hessian 2 J^T W J),
                       delta-method-transformed to natural space; correlation
                       matrix printed.  Opt-in `output { proposal auto; }`
                       writes a schema-exact record proposal under
                       data/local/adsorption/equilibria/ --- for HUMAN
                       promotion, never the standards catalogue.
\*---------------------------------------------------------------------------*/

#pragma once

#include "PropertyOperation.H"

#include <map>
#include <string>
#include <vector>

namespace Choupo {

class FitParameters : public PropertyOperation
{
public:
    FitParameters() = default;

    const std::string& type() const override { return type_; }

    int run(const DictPtr& dict,
            const ThermoPackage& thermo,
            int verbosity) override;

    std::vector<std::string> headline() const override
    { return headline_; }

    std::map<std::string, scalar> diagnostics() const override
    {
        return diag_;
    }

    //  THE CURATION AXIS -- the verdict and the band it was judged against,
    //  as WORDS, for the channel a program reads.  See
    //  PropertyOperation::curation() for why this is not `diagnostics()`
    //  (numbers), not the dict's `provenance {}` (where the data came from),
    //  and not named `validation` (that word is already taken, one level up,
    //  by the overlay AAD table).
    std::map<std::string, std::string> curation() const override
    {
        return curation_;
    }

private:
    // fit keeps its historical trio; evaluate swaps in its honest scores.
    std::vector<std::string> headline_ =
        { "chi2_reduced", "converged", "identifiable" };

    // PUBLISHED TABLE `fitPoints` (DEV.md 4c C149): one row per data point,
    // `point`, the abscissae (isotherm: p_Pa, T_K; a bubble fit: x_1 and the
    // fixed coordinate), `measured`, `model` and `residual` (model -
    // measured; relative for P_bubble), each with its unit -- from which any
    // fit earns its default parity and residuals views
    // (src/postProcessing/views), and the parameter table from fit.<p>.*.
    std::vector<PublishedTable> publishedTables() const override { return tables_; }
    std::string diagnosticUnit(const std::string& key) const override;
    std::string diagnosticLabel(const std::string& key) const override;
    std::string defaultViews(const std::string& opName) const override;

private:
    std::vector<PublishedTable> tables_;
    std::vector<std::string> paramPaths_;   // fit.<i>.* is the parameter at paramPaths_[i]
    static PublishedTable bubbleFitPoints(const ThermoPackage& thermo,
        const sVector& xExp, const sVector& pExp, const sVector& tExp,
        std::size_t iF1, std::size_t iF2, bool kindP, const std::string& parityPath);
    std::vector<scalar> isoTemperatures_;   // the distinct T of an isotherm dataset
    bool isoUnweighted_ = true;              // every sigma the unweighted 1 mol/kg

    // residual.kind == isotherm: self-contained analytic-Jacobian LM on the
    // van't Hoff Langmuir surface (no thermoPackage rebuild --- the isotherm
    // record is pair data, not a thermo model).  Declared here, implemented
    // in FitParameters.cpp beside the T_bubble engine.
    int runIsothermFit(const DictPtr& dict, int verbosity);

    // residual.kind == membrane (DEV.md 4c C149/C152): a membrane record's
    // transport parameters fitted to measured rejections / fluxes, one
    // operating point per dataset row, the transport law evaluated per row
    // exactly as the units evaluate it; FitParametersMembrane.cpp.
    int runMembraneFit(const DictPtr& dict, const ThermoPackage& thermo, int verbosity);
    std::vector<std::string> memQuantities_;   // the measured quantity of fitPoints' `quantity`
    std::vector<std::string> memSets_;         // the dataset of fitPoints' `set`
    std::vector<bool>        memSetHeldOut_;   // per set: held out of the fit (C172)
    std::vector<std::vector<std::size_t>> memSetQuantities_;   // per set: its quantities
    std::map<std::string, std::string> memUnits_;  // fit.<p>.* units
    //  The unit of the membrane fit's held-out and in-sample AAD, from what
    //  the scored terms ARE (DEV.md 4c C172): rejection terms alone are
    //  points, flux terms alone per cent, a mixture has no unit ("").
    std::string memHeldOutUnit_, memInSampleUnit_;

    //  A bubble-point fit's parameter i, when it is a pair parameter of an
    //  activity model: the unit THAT MODEL declares for its key
    //  (ActivityModel::pairParameterUnit), "" when it declares none -- never
    //  read off the parameter's name (DEV.md 4c C172).
    std::vector<std::string> pairParamUnits_;

    inline static const std::string type_ = "fitParameters";
    std::map<std::string, scalar>   diag_;
    std::map<std::string, std::string> curation_;
};

} // namespace Choupo
