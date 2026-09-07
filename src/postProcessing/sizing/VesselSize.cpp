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

#include "VesselMechanics.H"
#include "DesignDefaults.H"
#include "core/Constants.H"
#include "core/Advisory.H"
#include <cmath>
#include <cstdio>
#include <iostream>
#include <stdexcept>

namespace Choupo {

std::vector<EquipmentSizing> VesselSize::size(const std::string& unitName,
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
        {
            //  NAME WHAT THE AUTHOR CAN DO, not only what is absent.  The
            //  flow key is CONFIGURABLE (`designRules { flowKey ...; }`) and
            //  the message never said so, so an author whose unit publishes a
            //  differently-named throughput had a dead end: the remedy is one
            //  word in the dict they are already editing.  Listing the KPIs
            //  the unit DOES publish turns "not found" into a choice --
            //  invariant I5, and the same fix the heater's Q refusal took.
            std::string have;
            for (const auto& kv : k)
                have += (have.empty() ? "" : ", ") + kv.first;
            throw std::runtime_error("Vessel: unit '" + unitName
                + "' has no '" + key + "' KPI needed to size it.\n"
                "  This unit publishes: "
                + (have.empty() ? std::string("(no KPIs at all)") : have) + "\n"
                "  If one of those is the throughput to size on, name it --"
                " `designRules { flowKey <name>; }`\n"
                "  (the default is N_out_mol_s).  If none is, this unit does"
                " not report a flow and cannot\n"
                "  be sized by residence time or space velocity: give the"
                " volume directly instead\n"
                "  (`designRules { volume <m3>; }`), which makes it the"
                " author's declared design choice.");
        }
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

    //  THE RECORD IS BUILT HERE, before the three constants below are read,
    //  because it is what remembers which of them the case DECLARED and which
    //  this sizer supplied.  All three used to be `lookupScalarOrDefault`
    //  literals -- 3.0, 0.003, 1.0 -- two of them duplicated in
    //  `StirredTank.cpp` and the third DISAGREEING with it (2.5 there, 3.0
    //  here, same key, same question).  They now come from the ONE home
    //  (`DesignDefaults`), which announces on use and marks the key here.
    //  NO VALUE CHANGED, the 2.5/3.0 disagreement included: see that header.
    EquipmentSizing d;
    d.unitName       = unitName;
    d.equipmentType  = "vessel";
    d.material       = material.name;

    //  EVERY HARD REQUIREMENT FIRST, THEN THE DEFAULTS -- so no announcement
    //  is ever raised about a size that will not exist.  "the size below was
    //  computed with the built-in default 0.003 m" is false when the unit
    //  then refuses and there is no size below.
    const scalar pressureDesign = designRules->lookupScalar("pressureDesign");   // bar
    if (material.sigma_y <= 0.0)
        throw std::runtime_error("Vessel: material '" + material.name
            + "' has no sigma_y defined");

    const scalar L_over_D = designDefault::valueOr(
        designRules, designDefault::vesselLoverD, "vessel", unitName, d);
    const scalar corrosionAllow = designDefault::valueOr(
        designRules, designDefault::corrosionAllow, "vessel", unitName, d);
    const scalar jointEff = designDefault::valueOr(
        designRules, designDefault::jointEfficiency, "vessel", unitName, d);
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
    //  The ASME thin-wall shell, from the ONE home.  These two lines used to
    //  be written out here AND identically in `StirredTank.cpp`; the column
    //  sizer would have made four copies.  No number moved.
    const auto mech = vesselMechanics::wall(D, H, pressureDesign, material,
                                            jointEff, corrosionAllow);
    const scalar t_wall = mech.t_wall;
    const scalar weight = mech.weight;

    d.set("V_R",            V,              "m3");
    d.set("D",              D,              "m");
    d.set("H",              H,              "m");
    d.set("L_over_D",       L_over_D,       "-");
    d.set("t_wall",         t_wall,         "m");
    d.set("weight",         weight,         "kg");
    d.set("pressureDesign", pressureDesign, "bar");
    d.set("Q_gas",          Q_m3s,          "m3/s");
    d.basis                    = basis;
    //  ONE ITEM: this unit realises a single piece of equipment, so the
    //  tag is left empty and `itemId()` stays the unit's own name.
    return { d };
}

} // namespace Choupo
