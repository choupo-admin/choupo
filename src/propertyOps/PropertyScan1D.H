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
    Choupo::PropertyScan1D

Description
    Sweep ONE state variable (T, P, or a single composition x_i) over a
    range and report property values at each grid point.  Output goes to
    a CSV that the GUI plots and that the student can paste into the
    report.

    Dictionary form:

        {
            name       psat_ethanol;
            type       propertyScan1D;

            vary
            {
                variable  T;             // T, P, or x[<componentName>]
                from      250.0  K;
                to        400.0  K;
                n         51;            // OR  step  3.0;
            }

            state
            {
                P            1.01325 bar;     // any axes NOT varying
                composition  { ethanol 1.0; }
            }

            properties  (Psat );           // list of property keywords

            output
            {
                file    psat_ethanol.csv;   // relative to case directory
            }
        }

    Supported property keywords (case-sensitive --- see PropertyKeywords.md
    in docs for the catalogue):

      Single-value       :  T  P
      Pure / mixture VLE :  Psat_<comp>   T_bubble   T_dew
                               y_eq_<comp>  (vapour comp. at bubble pt;
                                              together with T_bubble +
                                              x[<comp>] this draws a
                                              classical T-x-y diagram)
      Activity model     :  gamma_<comp>
      Ideal gas (mixture):  H_ig  S_ig  Cp_ig
      EoS                :  Z  v_molar  H_R  S_R  H_real  S_real

    The CSV always carries the swept variable as the first column.
\*---------------------------------------------------------------------------*/

#pragma once

#include "PropertyOperation.H"

#include <string>

namespace Choupo {

class PropertyScan1D : public PropertyOperation
{
public:
    PropertyScan1D() = default;

    const std::string& type() const override { return type_; }

    int run(const DictPtr& dict,
            const ThermoPackage& thermo,
            int verbosity) override;

    std::map<std::string, scalar> diagnostics() const override
    {
        return diag_;
    }

private:
    inline static const std::string type_ = "propertyScan1D";
    std::map<std::string, scalar>   diag_;
};

} // namespace Choupo
