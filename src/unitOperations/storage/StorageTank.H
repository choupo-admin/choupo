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
    Choupo::StorageTank

Description
    A BUFFER: it holds material and changes nothing about it.

    WHY A STEADY-STATE SIMULATOR NEEDS ONE (Vítor, 2026-09-08).  A plant's
    economics are not only its flows.  Somebody has to BUY the material that
    sits in the tanks before the plant makes its first tonne, and that
    inventory is working capital -- often a large fraction of it.  A student
    asked to appraise a process must be able to answer *how much ammonia is
    immobilised at start-up*, and until now nothing in Choupo could tell them:
    `residenceTime` existed only as a SIZING input for a reflux drum and a
    crystalliser, and no unit anywhere carried a holdup.

    WHAT IT DOES, and it is deliberately almost nothing: the outlet IS the
    inlet -- same F, z, T, P, vapour fraction.  Mass and energy therefore
    close over this unit BY CONSTRUCTION, which is the whole point: adding a
    tank to a flowsheet must not move a single number in the process, only
    add what the process was already holding and never counted.

    WHAT IT PUBLISHES: the holdup implied by the declared residence time.

        V_holdup = Q_volumetric * residenceTime          [m^3]
        m_holdup = V_holdup * rho                        [kg]
        V_vessel = V_holdup / fillFraction               [m^3]

    plus the holdup per component, so the inventory can be VALUED: the
    ammonia in the product tank and the syngas in the feed tank are not worth
    the same per tonne, and a single total would hide that.

    THE RESIDENCE TIME IS DECLARED, NEVER DEFAULTED.  A holdup nobody declared
    is not a holdup, and inventing one would put working capital on a
    student's balance sheet that no engineer chose.  `fillFraction` DOES have
    a default (0.80 -- the working volume of a tank is not its geometric
    volume), and it is ANNOUNCED at its site whenever it is used, per the
    2026-09-06 rule: a default that is USED is announced, a DECLARED value
    announces nothing.

    THE PHASE IS READ, NOT GUESSED: `density()` takes an explicit phase and
    this unit passes the one the stream's own vapour fraction implies.  A
    two-phase stream in a storage tank is refused by name -- a buffer holding
    a boiling mixture has a level, a vapour space and a duty, and none of
    those are modelled here.

    Dictionary form:

        {
            name        T101;
            type        storageTank;
            in          makeup;
            outputs     ( makeupToPlant );

            operation
            {
                residenceTime  48 h;      // REQUIRED
                fillFraction   0.85;      // optional, default 0.80 (announced)
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

class StorageTank : public UnitOperation
{
public:
    StorageTank() = default;

    const std::string& type() const override { return type_; }

    int solve(const DictPtr& dict,
              const ThermoPackage& thermo,
              int verbosity) override;

    std::vector<ProcessStream> producedStreams() const override
    {
        return produced_;
    }

    std::map<std::string, scalar> kpis() const override { return kpis_; }

private:
    inline static const std::string type_ = "storageTank";
    std::vector<ProcessStream>      produced_;
    std::map<std::string, scalar>   kpis_;
};

} // namespace Choupo
