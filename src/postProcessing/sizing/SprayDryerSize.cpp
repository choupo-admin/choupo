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

#include <cmath>
#include <stdexcept>

namespace Choupo {

EquipmentSizing SprayDryerSize::size(const std::string&     unitName,
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

    const scalar W_evap = we->second;       // kg/s   (Guthrie sizeKey)

    const scalar P_des = designRules->lookupScalarOrDefault("pressureDesign", 1.0);

    EquipmentSizing d;
    d.unitName       = unitName;
    d.equipmentType  = "sprayDryer";
    d.material       = material.name;
    d.values["W_evap"]         = W_evap;
    d.values["pressureDesign"] = P_des;
    if (k.count("chamberDiameter")) d.values["chamberDiameter"] = k.at("chamberDiameter");
    if (k.count("chamberHeight"))   d.values["chamberHeight"]   = k.at("chamberHeight");

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
            d.values["design_targetSize_um"] = d32_tgt;
            d.values["design_wheelSpeed_rpm"] = N_rated * std::pow(d32_rated / d32_tgt, 1.0 / 0.6);
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
            d.values["design_residenceFactor"]    = sf;
            d.values["design_residence_s"]        = res_req;
            d.values["design_chamberDiameter_m"]  = Dch * dimScale;
            d.values["design_chamberHeight_m"]    = Lch * dimScale;
        }
    }
    return d;
}

} // namespace Choupo
