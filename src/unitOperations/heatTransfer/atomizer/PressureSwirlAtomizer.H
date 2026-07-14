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
    Choupo::PressureSwirlAtomizer

Description
    Pressure-swirl (simplex) nozzle atomizer.  Two selectable correlations
    (`correlation` key), each reading `deltaP` [Pa]:

      classAverage (DEFAULT): d32[um] = 9575 * deltaP[Pa]^(-1/3)
        The class-average design curve (Marshall 1954 / Handbook of Industrial
        Drying).  ONE input (deltaP); it is what the course's worked problems
        (casein, whey) use, so it is the validated default.  A rough class
        average -- NOT liquid-property-resolved.

      wangLefebvre: the physics-based two-term SMD, resolving surface tension
        and viscosity (Wang & Lefebvre 1987, DOI 10.2514/3.22946):
          SMD = 4.52 (sigma mu_L^2/(rho_A dP^2))^0.25 (t cos th)^0.25
              + 0.39 (sigma rho_L/(rho_A dP))^0.25    (t cos th)^0.75
        with film thickness `filmThickness` t [m] and half-cone `coneAngle` th.

    Pressure nozzles give a WIDER size distribution than rotary wheels.
\*---------------------------------------------------------------------------*/

#pragma once

#include "Atomizer.H"

namespace Choupo {

class PressureSwirlAtomizer : public Atomizer
{
public:
    explicit PressureSwirlAtomizer(const DictPtr& dict);

    const std::string& name() const override { return name_; }
    DropletResult dropletSize(const Feed& feed) const override;

private:
    inline static const std::string name_ = "pressureNozzle";
    std::string correlation_ = "classAverage";
    scalar dP_       = 0.0;        // injection pressure differential [Pa]
    scalar filmT_    = 5.0e-5;     // liquid film thickness (Wang-Lefebvre) [m]
    scalar coneHalf_ = 0.0;        // half spray-cone angle [rad] (default 60 deg)
};

} // namespace Choupo
