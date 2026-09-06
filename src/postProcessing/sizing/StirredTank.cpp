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

#include "StirredTank.H"
#include "DesignDefaults.H"
#include "core/Advisory.H"
#include "core/Constants.H"

#include <cmath>
#include <cstdio>
#include <iostream>
#include <stdexcept>

namespace Choupo {

EquipmentSizing StirredTank::size(const std::string&     unitName,
    const SimulationResult& result,
    const Material&         material,
    const DictPtr&          designRules) const
{
    // Read V_R from the unit's KPIs.
    auto kpiIt = result.kpis.find(unitName);
    if (kpiIt == result.kpis.end())
        throw std::runtime_error("StirredTank: unit '" + unitName
            + "' has no KPIs in the simulation result");
    auto v_it = kpiIt->second.find("V_R");
    if (v_it == kpiIt->second.end())
        throw std::runtime_error("StirredTank: unit '" + unitName
            + "' has no 'V_R' KPI — is it a CSTR or PFR?");
    const scalar V_R = v_it->second;     // m³

    //  THE RECORD IS BUILT FIRST because it is what remembers which of the
    //  inputs below the case DECLARED and which this sizer supplied.  Three
    //  of them used to be `lookupScalarOrDefault` literals -- 2.5, 0.003, 1.0
    //  -- duplicated in `VesselSize.cpp` and announced nowhere; they now come
    //  from the ONE home (`DesignDefaults`), which announces on use and marks
    //  the key here.  No value changed: see the L/D note in that header.
    EquipmentSizing d;
    d.unitName       = unitName;
    d.equipmentType  = "stirredTank";
    d.material       = material.name;

    //  EVERY HARD REQUIREMENT IS READ BEFORE ANY DEFAULT IS TAKEN, so an
    //  announcement is never raised about a size that will not exist.  An
    //  advisory reading "the size below was computed with the built-in
    //  default 0.003 m" is false when the unit then refuses and there IS no
    //  size below -- an announcement about a state the run never published,
    //  which is the very failure `AdvisoryLog`'s trial/accepted stamp exists
    //  to keep out of the caveat block.  No corpus case is affected: all of
    //  them declare `pressureDesign`.
    const scalar pressureDesign = designRules->lookupScalar("pressureDesign");  // bar

    if (material.sigma_y <= 0.0)
        throw std::runtime_error("StirredTank: material '" + material.name
            + "' has no σ_y defined");

    const scalar L_over_D = designDefault::valueOr(
        designRules, designDefault::stirredTankLoverD, "stirredTank", unitName, d);
    const scalar corrosionAllow = designDefault::valueOr(
        designRules, designDefault::corrosionAllow, "stirredTank", unitName, d);   // m
    const scalar jointEff = designDefault::valueOr(
        designRules, designDefault::jointEfficiency, "stirredTank", unitName, d);
    // Rating check (no-silent-crutch / "ratings should speak"): WARN, do not
    // abort.  Exceeding the material's pressure rating is a design red flag,
    // but throwing kills the whole run; a loud warning lets sizing complete so
    // the engineer sees the (over-thick) wall AND the rating violation, and
    // can pick a stronger material or lower the design pressure.
    if (pressureDesign > material.maxP)
    {
        char b[220];
        std::snprintf(b, sizeof(b),
            "design pressure %.1f bar EXCEEDS material '%s' rating %.1f bar"
            " -- choose a stronger material or lower the design pressure",
            static_cast<double>(pressureDesign), material.name.c_str(),
            static_cast<double>(material.maxP));
        std::cout << "  [rating] WARNING: vessel '" << unitName << "': " << b << "\n";
        AdvisoryLog::instance().add("rating", "warning", "vessel '" + unitName + "'", b);
    }

    // Geometry
    const scalar D = std::cbrt(4.0 * V_R / (constant::pi * L_over_D));    // m
    const scalar H = L_over_D * D;                                // m

    // Wall thickness — ASME §VIII Div. 1 thin-wall (cylindrical, hoop):
    //   t_w = P D / (2 σ E - 1.2 P) + c.a.
    // Pressure in Pa, stress in Pa.
    const scalar P_Pa     = pressureDesign * 1.0e5;
    const scalar sigma_Pa = material.sigma_y * 1.0e6;
    const scalar t_wall   = P_Pa * D / (2.0 * sigma_Pa * jointEff - 1.2 * P_Pa)
                          + corrosionAllow;

    // Weight (shell only; head contribution ~ +15% in practice — ignored here)
    const scalar weight = material.density * constant::pi * D * H * t_wall;

    d.basis          = "V_R = declared operation.V_R (pass-through); D and H from L_over_D; t_wall ASME thin-wall";
    d.set("V_R",            V_R,            "m3");
    d.set("D",              D,              "m");
    d.set("H",              H,              "m");
    d.set("L_over_D",       L_over_D,       "-");
    d.set("t_wall",         t_wall,         "m");
    d.set("pressureDesign", pressureDesign, "bar");
    d.set("weight",         weight,         "kg");
    return d;
}

} // namespace Choupo
