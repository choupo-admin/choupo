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
    Choupo::PropertyScan2D

Description
    Sweep TWO state variables (any pair of T, P, x[<comp>]) over a
    rectangular grid and report property values at every node.

    Dictionary form:

        {
            name        Z_co2_TP;
            type        propertyScan2D;

            varyX
            {
                variable  T;
                from      300 K;
                to        600 K;
                n         16;
            }
            varyY
            {
                variable  P;
                from        1 bar;
                to        150 bar;
                n         20;
            }

            state
            {
                composition  { CO2 1.0; }
            }

            properties  (Z  v_molar  H_R  S_R );

            output
            {
                file    Z_co2_grid.csv;     // long-form CSV
            }
        }

    Output layout (LONG form, friendly to Plotly heatmaps, pandas
    pivot_table, and direct overlay of model-vs-data):

        <varyX.variable>,<varyY.variable>,prop1,prop2,...
        T1,P1,Z11,v11,...
        T1,P2,Z12,v12,...
...
        Tn,Pm,Znm,vnm,...

    For binary x[<comp>] sweeps the partner component is identified
    from `state.composition` --- exactly as in PropertyScan1D.
\*---------------------------------------------------------------------------*/

#pragma once

#include "PropertyOperation.H"

#include <string>

namespace Choupo {

class PropertyScan2D : public PropertyOperation
{
public:
    PropertyScan2D() = default;

    const std::string& type() const override { return type_; }

    int run(const DictPtr& dict,
            const ThermoPackage& thermo,
            int verbosity) override;

    std::map<std::string, scalar> diagnostics() const override
    {
        return diag_;
    }

private:
    inline static const std::string type_ = "propertyScan2D";
    std::map<std::string, scalar>   diag_;
};

} // namespace Choupo
