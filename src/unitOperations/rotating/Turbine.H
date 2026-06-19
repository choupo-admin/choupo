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
    Choupo::Turbine

Description
    Credo-pure gas-phase turbine (expander).  The mirror of the
    compressor: it EXTRACTS shaft work from a gas, dropping its
    pressure and temperature.

    Hardware (the only OP parameters):
        W_shaft  --  shaft power extracted from the fluid  [W, NEGATIVE]
        eta      --  isentropic efficiency                 [-]  (0 < eta <= 1)

    P_out, T_out, the expansion ratio and dS_gen are RESULTS.  Per the
    credo, the discharge pressure is a property of the outlet stream:
    if the flowsheet requires the turbine to exhaust at a specific
    pressure (a condenser, the atmosphere), that is a DesignSpec that
    manipulates $W_shaft until compressor/turbine P_out hits the
    boundary pressure --- NOT a unit-op spec.

    Efficiency convention (turbine):
        eta = w_real / w_isen          =>  w_isen = w_real / eta
    Both works are negative (extraction); |w_real| < |w_isen| because
    irreversibility reduces the yield.

    Dictionary form:

        {
            name        turbine01;
            type        turbine;
            in          hotGas;
            outputs     (exhaust );

            operation
            {
                W_shaft    -40.0 kW;       // NEGATIVE (extracted)
                eta          0.85;
            }
        }
\*---------------------------------------------------------------------------*/

#pragma once

#include "core/Dictionary.H"
#include "thermo/ThermoPackage.H"
#include "unitOperations/UnitOperation.H"

#include <map>
#include <string>
#include <vector>

namespace Choupo {

class Turbine : public UnitOperation
{
public:
    Turbine() = default;

    const std::string& type() const override { return type_; }

    int solve(const DictPtr& dict,
              const ThermoPackage& thermo,
              int verbosity) override;

    std::vector<ProcessStream> producedStreams() const override
    {
        return produced_;
    }

    std::map<std::string, scalar> kpis() const override
    {
        return kpis_;
    }

private:
    inline static const std::string type_ = "turbine";
    std::vector<ProcessStream>      produced_;
    std::map<std::string, scalar>   kpis_;
};

} // namespace Choupo
