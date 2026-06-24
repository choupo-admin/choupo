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

#include "EvaporatorSize.H"

#include <stdexcept>

namespace Choupo {

EquipmentSizing EvaporatorSize::size(const std::string&     unitName,
    const SimulationResult& result,
    const Material&         material,
    const DictPtr&          designRules) const
{
    auto kpiIt = result.kpis.find(unitName);
    if (kpiIt == result.kpis.end())
        throw std::runtime_error("Evaporator: unit '" + unitName
            + "' has no KPIs in the simulation result");

    // The evaporator unit-op exposes its required area as `A_m2` (preferred)
    // or the bare `A` alias; either is the characteristic size for costing.
    const auto& k = kpiIt->second;
    scalar A = 0.0;
    if      (k.count("A_m2")) A = k.at("A_m2");
    else if (k.count("A"))    A = k.at("A");
    else
        throw std::runtime_error("Evaporator: unit '" + unitName
            + "' has no 'A_m2' (or 'A') KPI -- is it an evaporator effect?");

    const scalar P_des = designRules->lookupScalarOrDefault("pressureDesign", 1.0);

    EquipmentSizing d;
    d.unitName       = unitName;
    d.equipmentType  = "evaporator";
    d.material       = material.name;
    d.values["A"]              = A;        // Guthrie sizeKey
    d.values["A_m2"]           = A;
    d.values["pressureDesign"] = P_des;
    return d;
}

} // namespace Choupo
