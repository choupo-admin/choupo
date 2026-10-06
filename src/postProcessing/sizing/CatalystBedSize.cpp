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

#include "CatalystBedSize.H"

#include "VesselMechanics.H"
#include "DesignDefaults.H"
#include "core/Advisory.H"
#include "core/Constants.H"

#include <cmath>
#include <cstdio>
#include <iostream>
#include <stdexcept>

namespace Choupo {

std::vector<EquipmentSizing> CatalystBedSize::size(const std::string& unitName,
    const SimulationResult& result,
    const Material&         material,
    const DictPtr&          designRules) const
{
    auto kpiIt = result.kpis.find(unitName);
    if (kpiIt == result.kpis.end())
        throw std::runtime_error("CatalystBed: unit '" + unitName
            + "' has no KPIs in the simulation result");
    const auto& k = kpiIt->second;
    auto vr = k.find("V_R");
    if (vr == k.end())
    {
        std::string have;
        for (const auto& kv : k) have += (have.empty() ? "" : ", ") + kv.first;
        throw std::runtime_error("CatalystBed: unit '" + unitName
            + "' publishes no 'V_R' KPI -- is it a `pfr`?  This sizer reads"
              " the bed volume the unit integrated and derives nothing from"
              " a throughput.\n  This unit publishes: "
            + (have.empty() ? std::string("(no KPIs at all)") : have));
    }
    //  THE SIZE IS THE UNIT'S OWN VOLUME, PASSED THROUGH.  The PFR is a
    //  rating model: it integrates the volume it is given and publishes it.
    //  Whether an outer driver solved that volume or the author typed it is
    //  a fact this pass cannot see (it has no view of the outerDict), so the
    //  basis says "read from the unit" and claims nothing more.
    const scalar V_R = vr->second;                              // m3 of bed
    if (!(V_R > 0.0))
        throw std::runtime_error("CatalystBed: unit '" + unitName
            + "' publishes a non-positive bed volume V_R -- nothing to size");

    //  EVERY HARD REQUIREMENT FIRST, THEN THE DEFAULTS (the VesselSize
    //  rule): no announcement is raised about a size that will not exist.
    if (!designRules->found("pressureDesign"))
        throw std::runtime_error("CatalystBed: unit '" + unitName
            + "' declares no `pressureDesign` in its designRules -- the shell"
              " around a catalyst bed is a pressure vessel and its wall cannot"
              " be sized without one.  Declare `pressureDesign <bar>;` (the"
              " loop pressure plus your margin).");
    const scalar pressureDesign = designRules->lookupScalar("pressureDesign");   // bar
    if (material.sigma_y <= 0.0)
        throw std::runtime_error("CatalystBed: material '" + material.name
            + "' has no sigma_y defined -- the shell wall cannot be sized");

    //  ---- item 1: the SHELL, a vessel around the bed -----------------------
    EquipmentSizing shell;
    shell.unitName      = unitName;
    shell.equipmentTag  = "shell";
    shell.equipmentType = "vessel";          // priced on the EXISTING vessel set
    shell.material      = material.name;

    const scalar L_over_D = designDefault::valueOr(
        designRules, designDefault::vesselLoverD, "catalystBed", unitName, shell);
    const scalar corrosionAllow = designDefault::valueOr(
        designRules, designDefault::corrosionAllow, "catalystBed", unitName, shell);
    const scalar jointEff = designDefault::valueOr(
        designRules, designDefault::jointEfficiency, "catalystBed", unitName, shell);
    if (pressureDesign > material.maxP)
    {
        char b[220];
        std::snprintf(b, sizeof(b),
            "design pressure %.1f bar EXCEEDS material '%s' rating %.1f bar",
            static_cast<double>(pressureDesign), material.name.c_str(),
            static_cast<double>(material.maxP));
        std::cout << "  [rating] WARNING: catalystBed '" << unitName << "': " << b << "\n";
        AdvisoryLog::instance().add("rating", "warning",
                                    "catalystBed '" + unitName + "'", b);
    }

    //  A straight cylinder holding exactly the bed volume: no head space, no
    //  distributor, no support grid -- the shell is the bed's envelope and
    //  the basis says so, so a reader does not take it for a vendor drawing.
    const scalar D = std::cbrt(4.0 * V_R / (constant::pi * L_over_D));   // m
    const scalar H = L_over_D * D;                                       // m
    const auto mech = vesselMechanics::wall(D, H, pressureDesign, material,
                                            jointEff, corrosionAllow);

    shell.set("V_R",            V_R,            "m3");    // Turton vessel sizeKey
    shell.set("D",              D,              "m");
    shell.set("H",              H,              "m");
    shell.set("L_over_D",       L_over_D,       "-");
    shell.set("t_wall",         mech.t_wall,    "m");
    shell.set("weight",         mech.weight,    "kg");
    shell.set("pressureDesign", pressureDesign, "bar");
    shell.basis = "catalyst volume V_R read from the unit (rating model);"
                  " shell = straight cylinder of that volume at L_over_D";

    //  ---- item 2: the CATALYST CHARGE ----------------------------------------
    //  Its mass follows from V_R and a bulk density the CASE declares; its
    //  price is the case's too.  Neither is estimated here, and neither
    //  absence is defaulted: no density -> no mass, said in the basis; no
    //  price -> refused by name where the price would be used (Turton),
    //  so the costing total reads INCOMPLETE and names this item.
    EquipmentSizing charge;
    charge.unitName      = unitName;
    charge.equipmentTag  = "catalystCharge";
    charge.equipmentType = "catalystCharge";
    //  NO construction material: the charge is not built of one, and there is
    //  no catalyst record in the catalogue to name.  Left empty on purpose --
    //  the sheet renders `(not stated)`, and the costing pass prices this
    //  kind with F_M = 1 and no material lookup.
    charge.material      = "";

    if (designRules->found("catalystBulkDensity"))
    {
        const scalar rho_bulk = designRules->lookupScalar("catalystBulkDensity"); // kg/m3
        if (!(rho_bulk > 0.0))
            throw std::runtime_error("CatalystBed: unit '" + unitName
                + "' declares a non-positive catalystBulkDensity");
        charge.set("catalystBulkDensity", rho_bulk,       "kg/m3");   // declared, pass-through
        charge.set("m_catalyst_kg",       V_R * rho_bulk, "kg");
        charge.basis = "m_catalyst = V_R x catalystBulkDensity (declared)";
    }
    else
    {
        charge.basis = "mass not derivable: catalystBulkDensity not declared";
    }
    if (designRules->found("catalystPrice"))
        charge.costInputs["catalystPrice"] = designRules->lookupScalar("catalystPrice");

    return { shell, charge };
}

} // namespace Choupo
