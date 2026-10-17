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
#include "ShellTubeHX.H"
#include "core/Dimensions.H"
#include "unitOperations/heatTransfer/htc/ShellTubeDesign.H"
#include "core/Advisory.H"
#include "core/Constants.H"

#include <cmath>
#include <cstdio>
#include <iostream>
#include <sstream>
#include <stdexcept>
#include <tuple>
#include <map>
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

    //  ---- A MULTITUBULAR BED (DEV.md 4c C69) --------------------------------
    //  A bed that publishes `nTubes` is catalyst in N tubes inside a shell
    //  of coolant: ONE item, a tube bundle in a shell, and the catalyst
    //  charge -- never a cylinder of V_R at an L/D.
    if (k.count("nTubes"))
        return { sizeMultitubular(unitName, k, material, designRules, pressureDesign),
                 catalystCharge(unitName, k, designRules, multitubularVolume(k)) };

    //  ---- item 1: the SHELL, a vessel around the bed -----------------------
    EquipmentSizing shell;
    shell.unitName      = unitName;
    shell.equipmentTag  = "shell";
    shell.equipmentType = "vessel";          // priced on the EXISTING vessel set
    shell.material      = material.name;

    //  THE SLENDERNESS HAS ONE HOME (DEV.md 4c C66).  A bed that declares
    //  `operation.L_over_D` (the cross-section its Ergun pressure drop is
    //  integrated on) publishes it, and the shell is built on THAT number --
    //  a second copy here could disagree with the bed whose drop it sized.
    //  Absent it, the designRules value (or the announced default) as before.
    const auto ldIt = k.find("L_over_D");
    const bool ldFromUnit = (ldIt != k.end());
    if (ldFromUnit && designRules->found("L_over_D"))
        throw std::runtime_error("CatalystBed: unit '" + unitName
            + "' declares its bed's slenderness (`operation.L_over_D`, the"
              " cross-section its pressure drop is integrated on) AND this"
              " sizer's designRules declare `L_over_D` too.  One number, one"
              " home: delete the designRules copy -- the shell is built on the"
              " bed's own.");
    const scalar L_over_D = ldFromUnit
        ? ldIt->second
        : designDefault::valueOr(designRules, designDefault::vesselLoverD,
                                 "catalystBed", unitName, shell);
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
    //  A bed of DECLARED DIAMETER (C69) publishes it: the shell takes that
    //  diameter itself, never one re-derived from a slenderness (the two
    //  agree only to round-off, and only one of them is the declaration).
    const auto ddIt = k.find("D_bed_declared_m");
    const bool dFromUnit = (ddIt != k.end());
    const scalar D = dFromUnit ? ddIt->second
                   : std::cbrt(4.0 * V_R / (constant::pi * L_over_D));   // m
    const scalar H = dFromUnit ? V_R / (0.25 * constant::pi * D * D)
                   : L_over_D * D;                                       // m
    const auto mech = vesselMechanics::wall(D, H, pressureDesign, material,
                                            jointEff, corrosionAllow);

    shell.set("V_R",            V_R,            "m3");    // Turton vessel sizeKey
    shell.set("D",              D,              "m");
    shell.set("H",              H,              "m");
    shell.set("L_over_D",       dFromUnit ? H / D : L_over_D, "-");
    shell.set("t_wall",         mech.t_wall,    "m");
    shell.set("weight",         mech.weight,    "kg");
    shell.set("pressureDesign", pressureDesign, "bar");
    shell.basis = "catalyst volume V_R read from the unit (rating model);"
                  " shell = straight cylinder of that volume at L_over_D";
    if (dFromUnit)
        shell.basis = "catalyst volume V_R read from the unit (rating model);"
                      " shell = straight cylinder of that volume at the bed's"
                      " DECLARED diameter (read from the unit's"
                      " operation.diameter, the cross-section its pressure drop"
                      " is integrated on; H = V_R / (pi D^2 / 4))";
    else if (ldFromUnit)
        shell.basis += " (read from the unit's operation.L_over_D, the"
                       " cross-section its pressure drop is integrated on)";
    //  The bed's pressure drop, where the unit computed one: a number on the
    //  sheet an auditor checks the slenderness against.
    const auto dpIt = k.find("dP_bed_bar");
    if (dpIt != k.end()) shell.set("dP_bed", dpIt->second, "bar");

    return { shell, catalystCharge(unitName, k, designRules, V_R) };
}

//  ---- the CATALYST CHARGE ------------------------------------------------------
//  Its mass follows from the bed volume and a bulk density the CASE declares;
//  its price is the case's too.  Neither is estimated here, and neither
//  absence is defaulted: no density -> no mass, said in the basis; no price ->
//  refused by name where the price would be used (Turton), so the costing
//  total reads INCOMPLETE and names this item.  The density has ONE home
//  (C69): a bed whose rate is per kg of catalyst declares it as its own
//  `catalystLoading` and publishes it; the designRules copy is then refused.
EquipmentSizing CatalystBedSize::catalystCharge(const std::string& unitName,
    const std::map<std::string, scalar>& k, const DictPtr& designRules,
    scalar V_R)
{
    EquipmentSizing charge;
    charge.unitName      = unitName;
    charge.equipmentTag  = "catalystCharge";
    charge.equipmentType = "catalystCharge";
    //  NO construction material: the charge is not built of one, and there is
    //  no catalyst record in the catalogue to name.  Left empty on purpose --
    //  the sheet renders `(not stated)`, and the costing pass prices this
    //  kind with F_M = 1 and no material lookup.
    charge.material      = "";

    const auto loadIt = k.find("catalystLoading");
    if (loadIt != k.end())
    {
        if (designRules->found("catalystBulkDensity"))
            throw std::runtime_error("CatalystBed: unit '" + unitName
                + "' declares its bed's bulk density (`operation.catalystLoading`,"
                  " the number its per-kg rate is made volumetric with) AND this"
                  " sizer's designRules declare `catalystBulkDensity`.  One number,"
                  " one home: delete the designRules copy -- the charge is priced"
                  " on the bed's own.");
        const scalar rho_bulk = loadIt->second;
        charge.set("catalystBulkDensity", rho_bulk,       "kg/m3");   // read from the unit
        charge.set("m_catalyst_kg",       V_R * rho_bulk, "kg");
        charge.basis = "m_catalyst = V_bed x the unit's catalystLoading (its"
                       " declared bulk density, read from the unit)";
    }
    else if (designRules->found("catalystBulkDensity"))
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

    return charge;
}

//  The catalyst volume of the tubes actually BUILT: the count rounded up.
scalar CatalystBedSize::multitubularVolume(const std::map<std::string, scalar>& k)
{
    const scalar N = std::ceil(k.at("nTubes") - 1.0e-9);
    const scalar d = k.at("d_tube_m");
    return 0.25 * constant::pi * d * d * N * k.at("L_tube_m");
}

//  ---- THE MULTITUBULAR REACTOR: a bundle of catalyst tubes in a shell -------
//  Sized from the unit's OWN tubes (count, inner and outer diameter, length):
//  the count rounded UP to whole tubes, the shell ID from Sinnott's bundle-
//  diameter rule for ONE tube pass plus the fixed clearance (both from
//  htc/ShellTubeDesign, the exchanger design's one home), the area the
//  tubes' OUTSIDE surface, the weight the exchanger rule's.  Priced on
//  Turton's fixed-tube-sheet exchanger set by that area: a COSTING CHOICE,
//  stated in the basis -- this engine carries no reactor correlation, and a
//  multitubular reactor is built as a fixed-tube-sheet exchanger whose tubes
//  hold catalyst.
EquipmentSizing CatalystBedSize::sizeMultitubular(const std::string& unitName,
    const std::map<std::string, scalar>& k, const Material& material,
    const DictPtr& designRules, scalar pressureDesign)
{
    const std::string who = "CatalystBed: unit '" + unitName + "' (multitubular)";
    if (designRules->found("L_over_D"))
        throw std::runtime_error(who + ": `L_over_D` in the designRules of a"
            " bed of TUBES -- the tubes are its geometry (operation.tubes).  Delete it.");
    if (!k.count("d_tube_outer_m"))
        throw std::runtime_error(who + ": the bundle's shell and area need the"
            " tubes' OUTSIDE diameter, and the unit declares no wall: add"
            " `wallThickness` and `wallConductivity` to its `operation.tubes`.");
    for (const char* key : { "tubePitch", "tubePattern" })
        if (!designRules->found(key))
            throw std::runtime_error(who + ": `" + key + "` is required in the"
                " designRules -- the shell around N tubes depends on how they are"
                " laid out (`tubePitch <length>;` centre to centre, and"
                " `tubePattern triangular|square;`).  No layout is assumed.");
    const std::string pattern = designRules->lookupWord("tubePattern");
    if (pattern != "triangular" && pattern != "square")
        throw std::runtime_error(who + ": `tubePattern` must be `triangular` or"
            " `square` (got '" + pattern + "').");

    const scalar nSolved = k.at("nTubes");
    const int    N       = static_cast<int>(std::ceil(nSolved - 1.0e-9));
    shellTubeDesign::TubeBundle b;
    b.tubeID     = k.at("d_tube_m");
    b.tubeOD     = k.at("d_tube_outer_m");
    b.tubeLength = k.at("L_tube_m");
    b.pitch      = designRules->lookupScalar("tubePitch", Dims::length);
    b.passes     = 1;
    b.triangular = (pattern == "triangular");
    if (!(b.pitch > b.tubeOD))
        throw std::runtime_error(who + ": `tubePitch` must exceed the tubes'"
            " outside diameter (" + std::to_string(b.tubeOD) + " m).");
    const scalar shellID = shellTubeDesign::shellFromTubes(b, N);
    const scalar A       = shellTubeDesign::outsideArea(b, N);

    EquipmentSizing d;
    d.unitName      = unitName;
    d.equipmentTag  = "reactor";
    d.equipmentType = "shellTubeHX";          // Turton's fixed-tube-sheet set
    d.material      = material.name;
    d.set("nTubes",         N,                       "-");
    d.set("nTubesSolved",   nSolved,                 "-");
    d.set("tubeID",         b.tubeID,                "m");
    d.set("tubeOD",         b.tubeOD,                "m");
    d.set("tubeLength",     b.tubeLength,            "m");
    d.set("tubePitch",      b.pitch,                 "m");
    d.set("shellID",        shellID,                 "m");
    d.set("shellClearance", shellTubeDesign::shellClearance, "m");
    d.set("A",              A,                       "m2");    // Turton exchanger sizeKey
    d.set("V_tubes",        multitubularVolume(k),   "m3");
    d.set("pressureDesign", pressureDesign,          "bar");
    d.set("weight",         ShellTubeHX::bundleWeight(A, material), "kg");
    //  What the unit computed that a reader audits the bundle against: the
    //  duty the coolant takes, the hot spot, the inlet overall coefficient.
    //  Named on the sheet without a unit in the key; the unit is declared.
    for (const auto& [kpi, key, unit] : { std::tuple<const char*, const char*, const char*>
              { "Q_coolant_kW", "Q_coolant", "kW" },
              { "T_max",        "T_hotSpot", "K" },
              { "U_in",         "U_in",      "W/m2/K" } })
    {
        auto it = k.find(kpi);
        if (it != k.end()) d.set(key, it->second, unit);
    }
    std::ostringstream basis;
    basis << "multitubular reactor: the unit's tube count (nTubesSolved) rounded UP to"
             " whole tubes (nTubes); shell ID = Sinnott bundle diameter (one tube pass, "
          << pattern << " pitch) + clearance; A = pi d_o L N, the tubes' outside"
             " surface; priced as a FIXED-TUBE-SHEET shell-and-tube exchanger of"
             " that area (a costing choice -- no reactor correlation is carried)";
    d.basis = basis.str();
    if (N != nSolved)
    {
        std::ostringstream os;
        os << "the reactor is built with " << N << " tubes: the unit solved "
           << nSolved << " (an outer driver's real number) and a tube is whole";
        std::cout << "  [sizing] catalystBed '" << unitName << "': " << os.str() << "\n";
        AdvisoryLog::instance().add("sizing", "info",
                                    "catalystBed '" + unitName + "'", os.str());
    }
    return d;
}

} // namespace Choupo
