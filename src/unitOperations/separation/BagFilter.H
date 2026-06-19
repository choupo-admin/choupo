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
    Choupo::BagFilter

Description
    Fabric (bag-house) filter for gas-solid separation --- the fine,
    high-efficiency complement to the Cyclone (cheap but coarse, ~80 %).
    The dust cake on the cloth is the real filter: collection is near-total
    and only mildly size-dependent, while the pressure drop is dominated by
    the cake and grows with the areal dust load.

    Grade efficiency (data-anchored, calibratable):

        eta(d) = 1 - P0 * exp(-d / d_c)

    so fines (d << d_c) penetrate most (eta -> 1-P0) and coarse particles
    are captured completely (eta -> 1).  P0 (the finest-particle
    penetration) and d_c default to 0.02 and 1 micron.

    Pressure drop (Darcy: clean cloth + cake), the headline engineering
    output:

        dP = mu * V * (K1 + K2 * W)        [Pa]

    with V = Q_gas / filterArea the face velocity (the air-to-cloth ratio),
    mu the gas viscosity (Chung), K1 the clean-fabric resistance [1/m], K2
    the specific cake resistance [m/kg], and W the areal dust load on the
    cloth [kg/m^2] (the operating cake at the chosen point in the cleaning
    cycle).

    Hardware/operation block:
        filterArea     (m^2, total cloth area)         REQUIRED
        K1             (1/m, clean-fabric resistance)  [opt, 1e9]
        K2             (m/kg, specific cake resistance) [opt, 1e10]
        arealDustLoad  (kg/m^2, cake load W)           [opt, 0.5]
        penetration0   (P0, finest-particle penetration) [opt, 0.02]
        dCharacteristic (d_c, m)                       [opt, 1e-6]

    Inputs (feed );   outputs (cleanGas  capturedSolids ).
\*---------------------------------------------------------------------------*/

#pragma once

#include "unitOperations/UnitOperation.H"

#include <map>
#include <optional>
#include <string>

namespace Choupo {

class BagFilter : public UnitOperation
{
public:
    const std::string& type() const override { return type_; }

    int solve(const DictPtr& dict,
              const ThermoPackage& thermo,
              int verbosity) override;

    std::vector<ProcessStream>    producedStreams() const override { return produced_; }
    std::map<std::string, scalar> kpis()    const override { return kpis_; }
    std::optional<UnitProfile>    profile() const override { return profile_; }

private:
    inline static const std::string type_ = "bagFilter";
    std::vector<ProcessStream>    produced_;
    std::map<std::string, scalar> kpis_;
    std::optional<UnitProfile>    profile_;
};

} // namespace Choupo
