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
    Choupo::StirredTank

Description
    Sizing for a stirred (jacketed) cylindrical vessel — fits CSTR
    reactors and surge drums.

    Inputs (from result.kpis[unitName]):
        V_R              — vessel volume [m³]
    Inputs (from designRules):
        L_over_D         — height / diameter ratio (typical 2.0–3.0)
        pressureDesign   — design pressure [bar] (operation × safety factor)
        corrosionAllow   — corrosion allowance [m] (default 3 mm)
        jointEfficiency  — ASME weld joint efficiency (default 1.0)

    Geometry:
        D   =  (4 V_R / (π · L/D))^(1/3)        [m]
        H   =  (L/D) · D                          [m]

    Wall thickness (ASME §VIII, Div. 1, thin-wall cylindrical):
        t_w = P_des · D / (2 · σ_y · E - 1.2 · P_des)  +  corrosion_allow

    Weight (steel shell, no heads):
        W   ≈ ρ · π · D · H · t_w                 [kg]
\*---------------------------------------------------------------------------*/

#pragma once

#include "EquipmentSize.H"

namespace Choupo {

class StirredTank : public EquipmentSize
{
public:
    const std::string& type() const override { return type_; }

    EquipmentSizing size(const std::string&     unitName,
        const SimulationResult& result,
        const Material&         material,
        const DictPtr&          designRules) const override;

private:
    inline static const std::string type_ = "stirredTank";
};

} // namespace Choupo
