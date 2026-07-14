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
    Choupo::HeatCapacityFit

Description
    Fit a polynomial Cp(T) = A0 + A1 T + A2 T² (+ …) to measured liquid (or
    ideal-gas) heat-capacity data, by LINEAR least squares (normal equations) --
    no iteration, R² reported.

    Consistency cross-check (KIRCHHOFF): for the heat of vaporisation,
        d(ΔHvap)/dT = Cp_gas − Cp_liq.
    With the FITTED liquid Cp and the component's catalogue ideal-gas Cp it
    reports  dHvap_dT = Cp_ig − Cp_L  at the mid temperature -- which should
    match the slope of ΔHvap(T) (negative: ΔHvap falls as T rises).  This is the
    link that ties Cp ↔ ΔHvap ↔ the Antoine/Psat fit into one consistency network.

    Dictionary form:

        {
            name       cp_water_liquid_fit;  type heatCapacityFit;
            component  water;        // for the Kirchhoff Cp_ig cross-check
            degree     2;            // polynomial degree (default 2)
            dataset    "constant/experiments/cp-water-liquid";  // columns T, Cp
            output     { file cp_water_liquid_fit.csv; }         // T_K, Cp_data, Cp_fit
        }

    Emits: A0..Ad, R2, n_points, Cp_at_Tmid, Cp_ig_at_Tmid, dHvap_dT_kirchhoff.
\*---------------------------------------------------------------------------*/

#pragma once

#include "PropertyOperation.H"

#include <map>
#include <string>

namespace Choupo {

class HeatCapacityFit : public PropertyOperation
{
public:
    HeatCapacityFit() = default;

    const std::string& type() const override { return type_; }

    int run(const DictPtr& dict,
            const ThermoPackage& thermo,
            int verbosity) override;

    std::vector<std::string> headline() const override
    { return { "R2", "Cp_at_Tmid" }; }

    std::map<std::string, scalar> diagnostics() const override { return diag_; }

private:
    std::string type_ = "heatCapacityFit";
    std::map<std::string, scalar> diag_;
};

} // namespace Choupo
