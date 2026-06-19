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
    Choupo::ElectricLoad

Description
    Passive shaft sink --- represents the electric generator (or any
    external mechanical absorber) wired to a turbine.  Carries no
    process stream: the only thing crossing its boundary is shaft work,
    consumed from a turbine via an energy wire.

    Hardware (none on the operation block --- a generator's "rating" is
    set by the W it actually absorbs, computed from the wire):

        {
            name        load;
            type        electricLoad;

            // optional, hardware: the generator's electromechanical
            // efficiency.  Default 1.0 means "report what the wire
            // brought in"; values < 1 record losses so W_electric
            // (shipped to the grid) < W_shaft (came in).
            operation   { eta 0.97; }

            energyInputs
            (
                { from turbine.shaft;  kind work;  target W_shaft; }
            );
        }

    Why this exists.  In a Brayton + Rankine combined cycle, the gas
    turbine drives BOTH the compressor (one wire) AND the generator
    (another wire); the steam turbine drives the pump + a second
    generator.  The generator is the entity that closes the shaft
    accounting --- without it the W extracted from the cycle would
    have nowhere to go in the topology, and the net-electric KPI
    could only be derived by a flowsheet-level variables expression.
    With this unit, the topology shows what the W actually does.
\*---------------------------------------------------------------------------*/

#pragma once

#include "core/Dictionary.H"
#include "thermo/ThermoPackage.H"
#include "unitOperations/UnitOperation.H"

#include <map>
#include <string>
#include <vector>

namespace Choupo {

class ElectricLoad : public UnitOperation
{
public:
    ElectricLoad() = default;

    const std::string& type() const override { return type_; }

    int solve(const DictPtr& dict,
              const ThermoPackage& thermo,
              int verbosity) override;

    std::vector<ProcessStream> producedStreams() const override
    {
        return {};   // no process streams cross the load's boundary
    }

    std::map<std::string, scalar> kpis() const override
    {
        return kpis_;
    }

private:
    inline static const std::string type_ = "electricLoad";
    std::map<std::string, scalar>   kpis_;
};

} // namespace Choupo
