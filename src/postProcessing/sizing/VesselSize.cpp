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

#include "VesselSize.H"
#include "core/Constants.H"
#include "core/Advisory.H"
#include <cmath>
#include <cstdio>
#include <iostream>
#include <stdexcept>

namespace Choupo {

EquipmentSizing VesselSize::size(const std::string&     unitName,
    const SimulationResult& result,
    const Material&         material,
    const DictPtr&          designRules) const
{
    auto kpiIt = result.kpis.find(unitName);
    if (kpiIt == result.kpis.end())
        throw std::runtime_error("Vessel: unit '" + unitName
            + "' has no KPIs in the simulation result");
    const auto& k = kpiIt->second;
    auto kpi = [&](const std::string& key) -> scalar {
        auto it = k.find(key);
        if (it == k.end())
            throw std::runtime_error("Vessel: unit '" + unitName
                + "' has no '" + key + "' KPI needed to size it");
        return it->second;
    };

    const scalar T = kpi("T");                 // K
    const scalar P = kpi("P");                 // Pa

    // --- The gas volumetric flow that drives the volume ------------------
    const std::string flowKey  = designRules->lookupWordOrDefault("flowKey", "N_out_mol_s");
    const std::string flowUnit = designRules->lookupWordOrDefault("flowUnit", "mol/s");
    scalar N_mol_s = kpi(flowKey);
    if (flowUnit == "kmol/s")      N_mol_s *= 1000.0;
    else if (flowUnit == "kmol/h") N_mol_s *= 1000.0 / 3600.0;
    const scalar Q_m3s = N_mol_s * constant::R * T / P;     // ideal-gas m^3/s

    // --- Volume from exactly ONE design basis ----------------------------
    scalar V = 0.0;  std::string basis;
    if (designRules->found("volume"))
    { V = designRules->lookupScalar("volume"); basis = "volume (author-set)"; }
    else if (designRules->found("spaceVelocity"))
    { const scalar SV = designRules->lookupScalar("spaceVelocity");   // 1/h
      V = (Q_m3s * 3600.0) / SV; basis = "catalyst V = Q/SV"; }
    else if (designRules->found("residenceTime"))
    { const scalar tau = designRules->lookupScalar("residenceTime");  // s
      V = Q_m3s * tau; basis = "drum V = Q*tau"; }
    else
        throw std::runtime_error("Vessel: unit '" + unitName + "' needs a design"
            " basis in designRules -- one of spaceVelocity [1/h], residenceTime"
            " [s], or volume [m^3]");
    if (V <= 0.0)
        throw std::runtime_error("Vessel: unit '" + unitName + "' sized to a"
            " non-positive volume -- check the flow KPI and the design basis");

    const scalar L_over_D       = designRules->lookupScalarOrDefault("L_over_D", 3.0);
    const scalar pressureDesign = designRules->lookupScalar("pressureDesign");   // bar
    const scalar corrosionAllow = designRules->lookupScalarOrDefault("corrosionAllow", 0.003);
    const scalar jointEff       = designRules->lookupScalarOrDefault("jointEfficiency", 1.0);
    if (material.sigma_y <= 0.0)
        throw std::runtime_error("Vessel: material '" + material.name
            + "' has no sigma_y defined");
    if (pressureDesign > material.maxP)
    {
        char b[220];
        std::snprintf(b, sizeof(b),
            "design pressure %.1f bar EXCEEDS material '%s' rating %.1f bar",
            static_cast<double>(pressureDesign), material.name.c_str(),
            static_cast<double>(material.maxP));
        std::cout << "  [rating] WARNING: vessel '" << unitName << "': " << b << "\n";
        AdvisoryLog::instance().add("rating", "warning", "vessel '" + unitName + "'", b);
    }

    const scalar D = std::cbrt(4.0 * V / (constant::pi * L_over_D));   // m
    const scalar H = L_over_D * D;                                     // m
    const scalar P_Pa     = pressureDesign * 1.0e5;
    const scalar sigma_Pa = material.sigma_y * 1.0e6;
    const scalar t_wall   = P_Pa * D / (2.0 * sigma_Pa * jointEff - 1.2 * P_Pa)
                          + corrosionAllow;
    const scalar weight = material.density * constant::pi * D * H * t_wall;

    EquipmentSizing d;
    d.unitName       = unitName;
    d.equipmentType  = "vessel";
    d.material       = material.name;
    d.values["V_R"]            = V;
    d.values["D"]              = D;
    d.values["H"]              = H;
    d.values["L_over_D"]       = L_over_D;
    d.values["t_wall"]         = t_wall;
    d.values["weight"]         = weight;
    d.values["pressureDesign"] = pressureDesign;
    d.values["Q_gas"]          = Q_m3s;
    (void)basis;
    return d;
}

} // namespace Choupo
