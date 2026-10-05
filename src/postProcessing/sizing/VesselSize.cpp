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
#include "core/RegistryRefusal.H"
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
    {
        //  A SPACE VELOCITY CARRIES ITS GAS-VOLUME BASIS, AND THE CASE
        //  DECLARES IT (2026-10-05).  This branch used to divide the ACTUAL
        //  gas flow at the unit's own (T, P) by whatever number was typed,
        //  while every published GHSV is on NORMAL gas volume (Nm3 per m3 of
        //  catalyst per hour).  At an ammonia converter's 700 K and 200 bar
        //  the two differ by a factor of 77, so an industrial GHSV typed
        //  straight in under-sized the bed 77x at exit 0 with a plausible
        //  volume -- and nothing in the engine could see the substitution.
        //  The engine must not GUESS which basis a number is on, so it reads
        //  a declared word and REFUSES when there is none, quoting the ratio
        //  at THIS unit's own conditions so the size of the trap is in the
        //  message, not in a reader's head.
        const scalar SV = designRules->lookupScalar("spaceVelocity");   // 1/h
        const scalar Q_normal_m3s =
            N_mol_s * constant::R * constant::T_normal / constant::P_normal;
        const scalar ratio = Q_normal_m3s / Q_m3s;     // = T_n P / (P_n T)
        char rb[64];
        std::snprintf(rb, sizeof(rb), "%.2f", static_cast<double>(ratio));
        char tp[96];
        std::snprintf(tp, sizeof(tp), "(%.6g K, %.6g bar)",
                      static_cast<double>(T), static_cast<double>(P * 1.0e-5));
        if (!designRules->found("spaceVelocityBasis"))
            throw std::runtime_error("Vessel: unit '" + unitName
                + "' declares `spaceVelocity` with no `spaceVelocityBasis`.\n"
                "  A space velocity is gas volume per catalyst volume per hour,"
                " and WHICH gas volume is a\n"
                "  convention the number carries: at this unit's own " + tp
                + " the NORMAL and the ACTUAL\n"
                "  gas volumes differ by a factor of " + rb + ", so the same"
                " number sizes a bed that many times apart.\n"
                "  Declare the one you mean in the same `designRules {}`:\n"
                "      spaceVelocityBasis normal;   // Nm3 at 273.15 K and"
                " 101325 Pa, ideal gas -- the basis published GHSVs use\n"
                "      spaceVelocityBasis actual;   // m3 of gas at the unit's"
                " own T and P, ideal gas");
        const std::string svBasis = designRules->lookupWord("spaceVelocityBasis");
        if (svBasis != "normal" && svBasis != "actual")
            throw std::runtime_error("Vessel: unit '" + unitName + "': "
                + registryRefusal::message("space-velocity basis", svBasis,
                                           { "normal", "actual" }, "Accepted")
                + "\n  (`standard` is not accepted on purpose: standard"
                " conditions are 15, 20 or 25 degC at 1 bar or\n"
                "  1 atm depending on the source -- convert the number to"
                " `normal` or `actual` and say which.)");
        const scalar Q_basis = (svBasis == "normal") ? Q_normal_m3s : Q_m3s;
        V = (Q_basis * 3600.0) / SV;
        basis = (svBasis == "normal")
            ? "catalyst V = Q_normal/SV; SV declared on NORMAL gas volume"
              " (273.15 K, 101325 Pa, ideal gas) of the flow KPI " + flowKey
            : "catalyst V = Q/SV; SV declared on ACTUAL gas volume (the unit's"
              " own T and P, ideal gas) of the flow KPI " + flowKey;
        //  The conversion is PRINTED, so the number a reader would compare
        //  with a datasheet is on the console beside the one that sized.
        char line[320];
        std::snprintf(line, sizeof(line),
            "  [basis] vessel '%s': spaceVelocity %.6g 1/h on %s gas volume;"
            " at %s that is %.6g 1/h on %s gas (normal/actual = %s) -> V = %.6g m3\n",
            unitName.c_str(), static_cast<double>(SV),
            svBasis == "normal" ? "NORMAL" : "ACTUAL", tp,
            static_cast<double>(svBasis == "normal" ? SV / ratio : SV * ratio),
            svBasis == "normal" ? "ACTUAL" : "NORMAL", rb,
            static_cast<double>(V));
        std::cout << line;
    }
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
