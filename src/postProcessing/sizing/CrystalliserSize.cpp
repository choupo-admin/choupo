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
    auto vm = k.find("V_magma");
    auto lf = k.find("liquorFlow");
    auto rt = k.find("residenceTime");
    auto th = k.find("throughput");
    if (vm == k.end() || lf == k.end() || rt == k.end() || th == k.end())
        throw std::runtime_error("Crystalliser: unit '" + unitName
            + "' is missing one of 'V_magma' / 'liquorFlow' / 'residenceTime' /"
              " 'throughput' -- is it an MSMPR crystalliser?  (The yield-only"
              " mode publishes no residence time and cannot be sized.)");

    //  THE SIZE IS THE DECLARED WORKING VOLUME, passed through.  The MSMPR
    //  unit is a RATING model -- `operation.volume` is its input and
    //  tau = V/Q its result -- so the Guthrie size key is the declaration,
    //  and the basis says so.  Until 2026-09-05 this sizer computed
    //  `liquorFlow * residenceTime` and called the product m^3: liquorFlow is
    //  the unit's MOLAR flow (kmol/s, labelled so in Crystalliser.cpp), so the
    //  "volume" was a molar holdup in kmol, 18.46 on a vessel declared 1.0 m^3,
    //  costed on the flagship plant at exit 0 with a golden pinning it.  Found
    //  by writing the basis string: "which rule produced this size" had no
    //  honest answer.  Deriving V as throughput * residenceTime was rejected --
    //  it reproduces the declaration to round-off and hides that it is one.
    const scalar V_magma = vm->second;                   // m^3, declared
    const scalar P_des = designRules->lookupScalar("pressureDesign");   // required: a silent
        // 1 bar default costed pressure equipment as atmospheric while the
        // identical omission on a stirredTank refused -- one decision, six
        // homes, two answers (2026-08-22 fresh-eyes audit).

    EquipmentSizing d;
    d.unitName       = unitName;
    d.equipmentType  = "crystalliser";
    d.material       = material.name;
    d.basis          = "V_magma = declared operation.volume (MSMPR working volume; pass-through)";
    d.set("V_magma",        V_magma,      "m3");      // Guthrie sizeKey
    d.set("throughput",     th->second,   "m3/s");    // Q, the VOLUMETRIC flow tau is taken on
    d.set("liquorFlow",     lf->second,   "kmol/s");  // the MOLAR liquor flow -- NOT a volume rate
    d.set("residenceTime",  rt->second,   "s");
    d.set("pressureDesign", P_des,        "bar");
    return d;
}

} // namespace Choupo
