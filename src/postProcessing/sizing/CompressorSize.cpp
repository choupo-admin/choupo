/*---------------------------------------------------------------------------*\
       \|/       C hemicals     | Open-source, glass-box chemical process simulator
      \\|//      H eat-transfer | https://choupo.org
     \\\|///     O perations    |
      \\|//      U nits         | Copyright (C) 2026 Vítor Geraldes
       \|/       P roperties    | Licence: GPL-3.0-or-later
        |        O ptimization  |
       /|\                      |
-------------------------------------------------------------------------------
    SPDX-License-Identifier: GPL-3.0-or-later
    Credit and attribution: see AUTHORS
    Required legal notices:  see NOTICE
\*---------------------------------------------------------------------------*/

#include "CompressorSize.H"
#include <stdexcept>

namespace Choupo {

EquipmentSizing CompressorSize::size(const std::string&     unitName,
    const SimulationResult& result,
    const Material&         material,
    const DictPtr&          designRules) const
{
    auto kpiIt = result.kpis.find(unitName);
    if (kpiIt == result.kpis.end())
        throw std::runtime_error("Compressor: unit '" + unitName
            + "' has no KPIs in the simulation result");
    const auto& k = kpiIt->second;
    auto w = k.find("W_shaft_kW");
    if (w == k.end())
        throw std::runtime_error("Compressor: unit '" + unitName
            + "' has no 'W_shaft_kW' KPI -- nothing to size (is it a compressor?)");
    const scalar power_kW = w->second;         // kW   (Guthrie sizeKey "power")

    EquipmentSizing d;
    d.unitName       = unitName;
    d.equipmentType  = "compressor";
    d.material       = material.name;
    d.values["power"] = power_kW;
    if (k.count("ratio"))  d.values["ratio"]  = k.at("ratio");
    if (k.count("P_out"))  d.values["P_out"]  = k.at("P_out");
    // Carry the design pressure through (records only; compressors have F_P=1).
    d.values["pressureDesign"] =
        designRules->lookupScalarOrDefault("pressureDesign", 1.0);
    return d;
}

} // namespace Choupo
