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
\*---------------------------------------------------------------------------*/

#include "CrystalliserSize.H"

#include <stdexcept>

namespace Choupo {

EquipmentSizing CrystalliserSize::size(const std::string&     unitName,
    const SimulationResult& result,
    const Material&         material,
    const DictPtr&          designRules) const
{
    auto kpiIt = result.kpis.find(unitName);
    if (kpiIt == result.kpis.end())
        throw std::runtime_error("Crystalliser: unit '" + unitName
            + "' has no KPIs in the simulation result");

    const auto& k = kpiIt->second;
    auto lf = k.find("liquorFlow");
    auto rt = k.find("residenceTime");
    if (lf == k.end() || rt == k.end())
        throw std::runtime_error("Crystalliser: unit '" + unitName
            + "' is missing 'liquorFlow' / 'residenceTime' KPIs -- is it an "
              "MSMPR crystalliser?");

    // Magma (working) volume = liquor volumetric flow * mean residence time.
    const scalar V_magma = lf->second * rt->second;     // m^3

    const scalar P_des = designRules->lookupScalarOrDefault("pressureDesign", 1.0);

    EquipmentSizing d;
    d.unitName       = unitName;
    d.equipmentType  = "crystalliser";
    d.material       = material.name;
    d.values["V_magma"]        = V_magma;     // Guthrie sizeKey
    d.values["liquorFlow"]     = lf->second;
    d.values["residenceTime"]  = rt->second;
    d.values["pressureDesign"] = P_des;
    return d;
}

} // namespace Choupo
