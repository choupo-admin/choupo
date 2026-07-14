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
                       data/proposed/adsorption/equilibria/ --- for HUMAN
                       promotion, never the standards catalogue.
\*---------------------------------------------------------------------------*/

#pragma once

#include "PropertyOperation.H"

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

private:
    // fit keeps its historical trio; evaluate swaps in its honest scores.
    std::vector<std::string> headline_ =
        { "chi2_reduced", "converged", "identifiable" };

private:
    // residual.kind == isotherm: self-contained analytic-Jacobian LM on the
    // van't Hoff Langmuir surface (no thermoPackage rebuild --- the isotherm
    // record is pair data, not a thermo model).  Declared here, implemented
    // in FitParameters.cpp beside the T_bubble engine.
    int runIsothermFit(const DictPtr& dict, int verbosity);

    inline static const std::string type_ = "fitParameters";
    std::map<std::string, scalar>   diag_;
};

} // namespace Choupo
