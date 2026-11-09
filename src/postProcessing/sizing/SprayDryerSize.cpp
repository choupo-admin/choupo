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

#include "SprayDryerSize.H"
#include "MaterialLimits.H"
#include "core/Advisory.H"

#include <cmath>
#include <iomanip>
#include <sstream>
#include <stdexcept>

namespace Choupo {

std::vector<EquipmentSizing> SprayDryerSize::size(const std::string& unitName,
    const SimulationResult& result,
    const Material&         material,
    const DictPtr&          designRules) const
{
    auto kpiIt = result.kpis.find(unitName);
    if (kpiIt == result.kpis.end())
        throw std::runtime_error("SprayDryer: unit '" + unitName
            + "' has no KPIs in the simulation result");

    const auto& k = kpiIt->second;
    auto we = k.find("water_evaporated");
    if (we == k.end())
        throw std::runtime_error("SprayDryer: unit '" + unitName
            + "' has no 'water_evaporated' KPI -- is it a spray dryer?");

    const scalar W_evap = we->second;       // kg/s   (Turton sizeKey)

    const scalar P_des = designRules->lookupScalar("pressureDesign");   // required: a silent
        // 1 bar default costed pressure equipment as atmospheric while the
        // identical omission on a stirredTank refused -- one decision, six
        // homes, two answers (2026-08-22 fresh-eyes audit).

    EquipmentSizing d;
    d.unitName       = unitName;
    d.equipmentType  = "sprayDryer";
    d.material       = material.name;
    d.basis          = "W_evap = water_evaporated (unit result; pass-through)";
    d.set("W_evap",         W_evap,      "kg/s");
    d.set("pressureDesign", P_des,       "bar");
    materialLimits::pressure("sprayDryer '" + d.itemId() + "'", material, P_des);
    if (k.count("chamberDiameter")) d.set("chamberDiameter", k.at("chamberDiameter"), "m");
    if (k.count("chamberHeight"))   d.set("chamberHeight",   k.at("chamberHeight"),   "m");

    // ------------------------------------------------------------------
    //  DESIGN INVERSION (opt-in: a `design { ... }` block in the sizing
    //  rules).  Rating runs FORWARD (geometry -> performance); design is the
    //  same model run BACKWARD (targets -> geometry).  We do NOT re-derive the
    //  correlations -- we INVERT them from the rated anchor, so the student
    //  sees design as "the simulation scaled to hit the target":
    //    * wheel speed for a target drop size  (Friedman: d32 ~ N^-0.6),
    //    * chamber for a required residence     (safety factor x drying time).
    //  The rated regime warning (Tanasawa, in the atomiser note) still applies:
    //  a good design lands in the ligament regime.
    // ------------------------------------------------------------------
    if (designRules->found("design"))
    {
        auto dg = designRules->subDict("design");

        const scalar d32_rated = k.count("d_droplet_micron") ? k.at("d_droplet_micron") : 0.0;
        const scalar N_rated   = k.count("wheelSpeed")       ? k.at("wheelSpeed")       : 0.0;
        const scalar d32_tgt   = dg->lookupScalarOrDefault("targetSize", 0.0);   // um
        if (d32_rated > 0.0 && N_rated > 0.0 && d32_tgt > 0.0)
        {
            // Friedman d32 ~ N^-0.6  ->  N_req = N_rated (d32_rated/d32_tgt)^(1/0.6)
            d.set("design_targetSize_um", d32_tgt, "um");
            d.set("design_wheelSpeed_rpm",
                  N_rated * std::pow(d32_rated / d32_tgt, 1.0 / 0.6), "rpm");
        }

        const scalar t_c       = k.count("tau_dry_constant") ? k.at("tau_dry_constant") : 0.0;
        const scalar res_rated = k.count("residenceTime")    ? k.at("residenceTime")    : 0.0;
        const scalar Dch       = k.count("chamberDiameter")  ? k.at("chamberDiameter")  : 0.0;
        const scalar Lch       = k.count("chamberHeight")    ? k.at("chamberHeight")    : 0.0;
        const scalar sf        = dg->lookupScalarOrDefault("residenceFactor", 3.0);
        if (t_c > 0.0 && res_rated > 0.0 && Dch > 0.0 && Lch > 0.0)
        {
            // Need residence >= sf * (constant-rate drying time).  Plug-flow
            // residence ~ volume, so scale the chamber (aspect ratio kept) by the
            // cube root of the required volume ratio.
            const scalar res_req  = sf * t_c;
            const scalar dimScale = std::cbrt(res_req / res_rated);
            d.set("design_residenceFactor",   sf,             "-");
            d.set("design_residence_s",       res_req,        "s");
            d.set("design_chamberDiameter_m", Dch * dimScale, "m");
            d.set("design_chamberHeight_m",   Lch * dimScale, "m");
            //  WHAT THIS INVERSION DOES NOT CHECK, SAID IN THE RESULT
            //  (2026-11-09, DEV.md 4c C269 decision (4)).  The chamber is
            //  scaled on the residence time alone, aspect ratio kept.  A
            //  rotary wheel throws its droplets RADIALLY, and the chamber's
            //  diameter is governed by that throw against the wall (a wet
            //  wall is the classic spray-dryer failure), which this sizer
            //  has no rule for: sprayDryer07 returned a 0.32 m chamber for a
            //  0.1 m wheel at 39 750 rpm.  No clearance correlation is typed
            //  from memory; the caveat names what was not checked.
            {
                std::ostringstream m;
                m << std::fixed << std::setprecision(3)
                  << "the design chamber (D = " << (Dch * dimScale) << " m, H = "
                  << (Lch * dimScale) << " m) is scaled on the residence time"
                     " alone (" << sf << " x the constant-rate drying time, aspect"
                     " ratio kept).  NOT checked: the droplets' radial throw"
                     " against the chamber wall";
                if (N_rated > 0.0)
                {
                    m << " -- for this ROTARY atomiser (wheel "
                      << std::setprecision(0) << N_rated << " rpm rated";
                    if (d.values.count("design_wheelSpeed_rpm"))
                        m << ", " << d.values.at("design_wheelSpeed_rpm")
                          << " rpm designed";
                    m << ") the diameter is governed by that throw, not by the"
                         " residence time, and a chamber scaled on residence"
                         " alone may be too narrow for it (a wet wall)";
                }
                m << ".  Check the wall clearance against the atomiser"
                     " vendor's spray data or a sourced correlation before"
                     " taking this geometry.";
                AdvisoryLog::instance().add("sizing", "warning",
                    "sprayDryer '" + d.itemId() + "'", m.str());
            }
        }
    }
    //  ONE ITEM: this unit realises a single piece of equipment, so the
    //  tag is left empty and `itemId()` stays the unit's own name.
    return { d };
}

} // namespace Choupo
