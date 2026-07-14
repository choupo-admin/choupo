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
    Choupo::VaporPressureFit

Description
    Fit the Antoine equation to measured Psat(T) data.  Choupo's Antoine
    convention is  log10(Psat[bar]) = A − B/(T[K] + C).  The fit is linear in
    (A, B) for a fixed C, so the op golden-sections C and solves (A, B) by
    linear least squares at each C — robust, derivative-free.

    Reports the fitted (A, B, C), R², and the **Clausius–Clapeyron heat of
    vaporisation** with the proper (T+C) correction:

        dHvap(T) = R · ln(10) · B · (T / (T + C))²

    (the naive −d lnP/d(1/T) = dHvap/R holds only for 2-parameter
    Clausius–Clapeyron, i.e. C = 0; with a 3-parameter Antoine the ln P vs 1/T
    line is slightly curved — stated so students don't read curvature as bad data).
    dHvap is the consistency cross-check: compare it to the component's tabulated
    HvapTb / Trouton's rule.

    Dictionary form:

        {
            name       psat_water_fit;  type vaporPressureFit;
            component  water;           // for labelling + the dHvap cross-check
            dataset    "constant/experiments/psat-water";  // columns T, Psat
            output     { file psat_water_fit.csv; }         // T_K, Psat_data, Psat_fit (bar)
        }

    Emits diagnostics: A, B, C, R2, n_points, dHvap_kJ_per_mol (at the highest T).
\*---------------------------------------------------------------------------*/

#pragma once

#include "PropertyOperation.H"

#include <map>
#include <string>

namespace Choupo {

class VaporPressureFit : public PropertyOperation
{
public:
    VaporPressureFit() = default;

    const std::string& type() const override { return type_; }

    int run(const DictPtr& dict,
            const ThermoPackage& thermo,
            int verbosity) override;

    std::vector<std::string> headline() const override
    { return { "R2", "dHvap_kJ_per_mol" }; }

    std::map<std::string, scalar> diagnostics() const override { return diag_; }

private:
    std::string type_ = "vaporPressureFit";
    std::map<std::string, scalar> diag_;
};

} // namespace Choupo
