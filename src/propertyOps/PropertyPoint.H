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
    Choupo::PropertyPoint

Description
    Evaluate the thermoPackage at a single (T, P, x) and report the
    available properties.  Replaces the `ThermoProbe` unit op
    (which abused the UnitOperation formalism to do property audits).

    Dictionary form:

        operations
        (
            {
                name        psat_check;
                type        propertyPoint;
                state
                {
                    T            298.15 K;
                    P            1.01325 bar;
                    composition  { ethanol 0.5;  water 0.5; }
                }
                properties  (all );    // or pick a subset
                output      { stdout; }
            }
        );

    Supported property keywords (case sensitive):

      * Mixture (always available):  H_ig  S_ig  Cp_ig  gamma
      * EoS-dependent:                Z  v_molar  H_R  S_R  H_real  S_real
      * Per-component (sweep-friendly when type == propertyScan*):
                                       Psat_<comp>  h_ig_<comp>  s_ig_<comp>

    Use the special keyword `all` to dump every property the package
    can compute at the given state.
\*---------------------------------------------------------------------------*/

#pragma once

#include "PropertyOperation.H"

#include <string>
#include <vector>

namespace Choupo {

class PropertyPoint : public PropertyOperation
{
public:
    PropertyPoint() = default;

    const std::string& type() const override { return type_; }

    int run(const DictPtr& dict,
            const ThermoPackage& thermo,
            int verbosity) override;

    std::map<std::string, scalar> diagnostics() const override
    {
        return diag_;
    }

private:
    inline static const std::string type_ = "propertyPoint";
    std::map<std::string, scalar>   diag_;
};

} // namespace Choupo
