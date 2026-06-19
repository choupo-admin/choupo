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
    Choupo::VleConsistency

Description
    Thermodynamic-consistency test of a binary VLE DATA SET (the
    differentiator: test the DATA, not just fit a model).  Given measured
    (x1, T, y1) at constant P, it back-computes the activity coefficients
    DIRECTLY from the data via modified Raoult,

        gamma_i = y_i P / (x_i Psat_i(T)),

    (Psat from the components' Antoine model) and applies the Gibbs-Duhem
    consistency tests:

      * pointwise Gibbs-Duhem slope residual (the "direct"/point flavour):
        x1 d(ln g1)/dx1 + x2 d(ln g2)/dx2  ~ 0  at each interior point;
      * Herington area test (companion): D = 100|A|/Sum|areas|, J from the
        T-range; pass if |D - J| < 10;
      * infinite-dilution gamma^inf endpoints (the most diagnostic numbers).

    PEDAGOGICAL CAVEAT (stated in the log + docs): the pointwise residual is
    written in its ISOTHERMAL form; for isobaric (constant-P) data there is an
    extra (-Hmix/RT^2)(dT/dx) term -- small for ethanol-water but real.  This is
    a FIRST, honest cut for review; the rigorous van Ness/Fredenslund direct
    test (fit -> integrate GD -> predict y -> mean|dy|) is the planned refinement.

    Dictionary form:

        {
            name       vle_consistency;
            type       vleConsistency;
            component  ethanol;              // the x1/y1 reference component
            dataset    "constant/experiments/ethanol-water-Txy-101kPa";
            state      { P 1.01325 bar; }
            output     { file vle_consistency.csv; }   // x1, lnG1, lnG2, lnRatio, gdResidual
        }

    Emits, per the consistency-test contract, diagnostics the GUI reads like
    KPIs: gamma1_inf, gamma2_inf, herington_D, herington_J, herington_pass,
    gd_max_resid, gd_mean_resid, n_points.
\*---------------------------------------------------------------------------*/

#pragma once

#include "PropertyOperation.H"

#include <map>
#include <string>

namespace Choupo {

class VleConsistency : public PropertyOperation
{
public:
    VleConsistency() = default;

    const std::string& type() const override { return type_; }

    int run(const DictPtr& dict,
            const ThermoPackage& thermo,
            int verbosity) override;

    std::map<std::string, scalar> diagnostics() const override { return diag_; }

private:
    std::string type_ = "vleConsistency";
    std::map<std::string, scalar> diag_;
};

} // namespace Choupo
