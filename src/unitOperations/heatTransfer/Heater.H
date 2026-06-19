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
    Choupo::Heater

Description
    Single-stream heater (or cooler when Q < 0).  Credo-pure:

        Streams IN  ->  OP (hardware-only)  ->  Streams OUT

    Hardware:  Q  --  the absolute thermal power delivered to the stream
                       (W in SI; positive = heating, negative = cooling).
                       Think of it as the electrical rating of the heater
                       or the burner duty of a furnace at a fixed firing
                       rate.

    Inputs:    one process stream (T, P, F, z).
    Outputs:   one process stream of identical composition and total flow,
               with T_out computed from the enthalpy balance

                   H_out(T_out, z) - H_in(T_in, z) = Q / F_mol_s

               where F_mol_s is the feed in mol/s and H_* are per-mol
               liquid enthalpies relative to Tref.

    Design questions ("I need T_out = 360 K") move to a DesignSpec outer
    driver that manipulates $Q with a target on `out.T`.  This is the
    same pattern as the evaporator: the unit op never specifies its
    own outlet state.

Dictionary form:

        operation
        {
            Q       250.0  kW;        // required (W, kW, or J/s)
            Tref    298.15;           // optional (K), default 298.15
        }
\*---------------------------------------------------------------------------*/

#pragma once

#include "core/Dictionary.H"
#include "thermo/ThermoPackage.H"
#include "unitOperations/UnitOperation.H"

#include <string>

namespace Choupo {

class Heater : public UnitOperation
{
public:
    Heater() = default;

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
    inline static const std::string type_ = "heater";
    std::vector<ProcessStream>      produced_;
    std::map<std::string, scalar>   kpis_;
};

} // namespace Choupo
