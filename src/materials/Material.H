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
    Choupo::Material

Description
    Properties of a construction material (vessels, exchangers, columns).
    Read from data/materials/<name>.dat via MaterialRegistry.

    Used by:
      * EquipmentSize  — needs σ_y for wall-thickness (ASME §VIII), ρ
                          for weight, max-T / max-P checks
      * CostingModel   — needs the Guthrie/Turton material factor F_M
\*---------------------------------------------------------------------------*/

#pragma once

#include "core/Types.H"

#include <string>

namespace Choupo {

struct Material
{
    std::string name;
    scalar      density   = 0.0;   // ρ        [kg/m³]
    scalar      F_M       = 1.0;   //           Guthrie/Turton material factor
                                    //          (carbonSteel = 1.0)
    scalar      sigma_y   = 0.0;   // σ_y      [MPa]  allowable stress (ASME)
    scalar      maxT      = 0.0;   //          [K]    max service temperature
    scalar      maxP      = 0.0;   //          [bar]  typical design max
    scalar      thermalConductivity = 0.0;  // k  [W/(m·K)]  wall conduction
                                    //          (heat-exchanger geometry U path;
                                    //          0 = absent -> the geometry path
                                    //          throws asking for it)
};

} // namespace Choupo
