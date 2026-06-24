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
    Choupo::CrystalliserSize

Description
    Sizing for an MSMPR crystalliser.  The characteristic size is the magma
    (working) volume V_magma [m^3], recovered from the unit-op KPIs as the
    liquor volumetric flow times the mean residence time:

        V_magma = liquorFlow [m^3/s] * residenceTime [s]

    Costed with a single-anchor power-law (Cp = Cp_ref*(V/V_ref)^n,
    n ~ 0.6), near-atmospheric -> F_P = 1.  Wetted material sets F_M.

    Inputs (from result.kpis[unitName]):
        liquorFlow       -- mother-liquor volumetric flow [m^3/s]
        residenceTime    -- mean residence time [s]
    Inputs (from designRules):
        pressureDesign   -- design pressure [bar] (default 1, near-atm)
\*---------------------------------------------------------------------------*/

#pragma once

#include "EquipmentSize.H"

namespace Choupo {

class CrystalliserSize : public EquipmentSize
{
public:
    const std::string& type() const override { return type_; }

    EquipmentSizing size(const std::string&     unitName,
        const SimulationResult& result,
        const Material&         material,
        const DictPtr&          designRules) const override;

private:
    inline static const std::string type_ = "crystalliser";
};

} // namespace Choupo
