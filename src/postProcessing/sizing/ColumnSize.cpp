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

#include "ColumnSize.H"

#include "DesignDefaults.H"
#include "ShellTubeHX.H"
#include "VesselMechanics.H"
#include "core/Advisory.H"
#include "core/Constants.H"

#include <algorithm>
#include <cmath>
#include <iostream>
#include <map>
#include <sstream>
#include <stdexcept>
#include <string>
#include <vector>

namespace Choupo {

namespace {

//  AN ITEM THIS RUN COULD NOT BUILD IS SAID BY NAME, AND THE COLUMN GOES ON.
//
//  `SizingPass` catches per UNIT, so throwing from the sizer would lose the
//  shell and the tray stack along with the item that was actually missing an
//  input.  A column that yields four of its five items and names the fifth is
//  strictly more useful than one that yields none -- and the reader is told
//  exactly what to declare, at the moment the gap is found, in the caveat
//  block at the end, and in the result JSON.
void itemNotBuilt(const std::string& unitName,
                  const std::string& item,
                  const std::string& why)
{
    const std::string m =
        "the " + item + " of column '" + unitName + "' was NOT sized: " + why
        + "  Nothing was substituted -- an assumed value here would be priced"
          " into the capital cost as though it were the author's.";
    if (AdvisoryLog::instance().add("sizing", "warning",
                                    "distillationColumn '" + unitName + "'", m))
        std::cout << "  [not sized] " << m << "\n";
}

//  Does the case declare EVERY key an item needs?  Reported as the LIST of
//  what is missing, never as the first one found: an author who declares U
//  and forgets LMTD should not have to run twice to learn that.
std::string missingKeys(const DictPtr& d, const std::vector<std::string>& keys)
{
    std::string out;
    for (const auto& k : keys)
        if (!d || !d->found(k)) out += (out.empty() ? "" : ", ") + k;
    return out;
}

} // namespace


std::vector<EquipmentSizing> ColumnSize::size(const std::string& unitName,
    const SimulationResult& result,
    const Material&         material,
    const DictPtr&          designRules) const
{
    auto kpiIt = result.kpis.find(unitName);
    if (kpiIt == result.kpis.end())
        throw std::runtime_error("ColumnSize: unit '" + unitName
            + "' has no KPIs in the simulation result");
    const auto& k = kpiIt->second;

    auto have = [&](const std::string& key) -> const scalar*
    {
        auto it = k.find(key);
        return it == k.end() ? nullptr : &it->second;
    };

    //  ---- THE SHELL: the one hard requirement -------------------------
    //
    //  A column with no diameter has no size at all, so this refusal is a
    //  THROW and costs the unit its whole sheet.  The remedy is one block in
    //  the case, and the message names it: the diameter is the tray
    //  hydraulics' answer, and a column that never ran the hydraulics has
    //  never been asked whether its trays can pass the traffic.
    const scalar* Dcol = have("diameter");
    if (!Dcol)
        throw std::runtime_error("ColumnSize: unit '" + unitName
            + "' publishes no 'diameter' KPI, so its shell cannot be sized.\n"
              "  The diameter of a tray column is the TRAY HYDRAULICS'"
              " answer, not a separate correlation:\n"
              "  add an `hydraulics { trayType sieve; traySpacing ...; ... }`"
              " block to the unit's `operation {}`\n"
              "  and leave `diameter` out of it to have the pass DESIGN the"
              " diameter (the widest tray sets it).\n"
              "  Declaring `diameter` there instead rates the trays against a"
              " tower you have chosen, and\n"
              "  that diameter is what this sizer would then use.");

    if (material.sigma_y <= 0.0)
        throw std::runtime_error("ColumnSize: material '" + material.name
            + "' has no sigma_y defined, so no wall thickness can be computed"
              " for column '" + unitName + "'");

    const scalar pressureDesign = designRules->lookupScalar("pressureDesign"); // bar

    //  THE TRAY COUNT IS THE HYDRAULICS' OWN, NOT `nStages` ARITHMETIC.
    //  This sizer first computed `nStages - 2` -- "the condenser and the
    //  reboiler are stages, not trays" -- and it was WRONG BY ONE on the
    //  witness case: the solver's stage list carries the reboiler and NOT the
    //  condenser, so the hydraulics rated 14 trays where that rule said 13,
    //  and the tower came out half a tray spacing short.  `TrayHydraulics`
    //  decides what is a tray by asking whether the stage carries vapour
    //  traffic, which is the fact rather than a rule about the fact; it
    //  publishes the count and nothing re-derives it.
    const scalar* nTraysK = have("nTrays");
    if (!nTraysK)
        throw std::runtime_error("ColumnSize: unit '" + unitName
            + "' publishes no 'nTrays' KPI, so the tray stack has no height."
              "\n  It is written by the tray-hydraulics pass beside the"
              " diameter; a column with a `diameter` and no\n  `nTrays` is a"
              " state this engine should not be able to reach -- please report"
              " it.");

    //  THE TRAY SPACING IS THE AUTHOR'S HYDRAULICS GEOMETRY, and it is read
    //  from `designRules` rather than from the unit's `hydraulics {}` block
    //  on purpose: a sizing pass sees the postDict and the result, never the
    //  flowsheet's operation dict.  Declaring it twice would be two homes for
    //  one number, so the refusal below sends the author to copy the one they
    //  already wrote rather than letting this sizer invent a third value.
    if (!designRules->found("traySpacing"))
        throw std::runtime_error("ColumnSize: column '" + unitName
            + "' needs `traySpacing [m]` in its `designRules {}`.\n"
              "  It is the same spacing the unit's `hydraulics {}` block"
              " declares -- the sizing pass cannot\n"
              "  read the flowsheet's operation dict, so state it here too."
              "  It is what turns a stage COUNT\n"
              "  into a tower HEIGHT, and no default would be the author's"
              " choice.");
    const scalar traySpacing = designRules->lookupScalar("traySpacing");   // m
    if (traySpacing <= 0.0)
        throw std::runtime_error("ColumnSize: column '" + unitName
            + "' declares a non-positive traySpacing");

    const long nTrays = std::max(0L, std::lround(*nTraysK));

    std::vector<EquipmentSizing> items;

    EquipmentSizing shell;
    shell.unitName      = unitName;
    shell.equipmentType = "vessel";     // Turton prices a tower as a vertical vessel
    shell.equipmentTag  = "shell";
    shell.material      = material.name;

    const scalar disengage = designDefault::valueOr(
        designRules, designDefault::columnDisengagement,
        "distillationColumn", unitName, shell);
    const scalar sump = designDefault::valueOr(
        designRules, designDefault::columnSump,
        "distillationColumn", unitName, shell);
    const scalar corrosionAllow = designDefault::valueOr(
        designRules, designDefault::corrosionAllow,
        "distillationColumn", unitName, shell);
    const scalar jointEff = designDefault::valueOr(
        designRules, designDefault::jointEfficiency,
        "distillationColumn", unitName, shell);

    //  THE TANGENT-TO-TANGENT HEIGHT.  N trays leave N-1 gaps between them,
    //  plus the disengagement above and the sump below.
    const scalar H = (nTrays > 1 ? scalar(nTrays - 1) * traySpacing : 0.0)
                   + disengage + sump;
    const scalar D = *Dcol;
    const scalar V = 0.25 * constant::pi * D * D * H;         // m3

    const auto mech = vesselMechanics::wall(D, H, pressureDesign, material,
                                            jointEff, corrosionAllow);

    //  THE BASIS, STATED WHERE THE RULE IS APPLIED, and it names the swage
    //  decision because that is the one a reader will ask about.
    //
    //  IT BRANCHES ON WHICH MODE THE HYDRAULICS RAN IN, because otherwise one
    //  of the two sentences is FALSE.  With `diameter` omitted the pass
    //  DESIGNS it and the tower really is built straight at the wider
    //  section; with `diameter` declared the pass RATES the trays against a
    //  tower the author chose, which may be narrower than a section needs
    //  (`column10_flooding` declares 1.1 m and floods at 114 %).  Claiming
    //  "at the wider section" there would describe a tower nobody sized.
    const scalar* designedK = have("diameterDesigned");
    const bool designed = (designedK == nullptr) || (*designedK != 0.0);
    shell.basis = designed
        ? "straight tower at the wider section; D from the tray"
          " hydraulics, H = (nTrays-1)*traySpacing + disengagement + sump;"
          " t_wall ASME thin-wall"
        : "D DECLARED by the case and RATED by the tray hydraulics (not"
          " designed here -- compare D_rectifying and D_stripping, which are"
          " what each section would need); H = (nTrays-1)*traySpacing +"
          " disengagement + sump; t_wall ASME thin-wall";
    shell.set("D",              D,              "m");
    shell.set("H",              H,              "m");
    shell.set("V_R",            V,              "m3");
    shell.set("nTrays",         scalar(nTrays), "-");
    shell.set("traySpacing",    traySpacing,    "m");
    shell.set("t_wall",         mech.t_wall,    "m");
    shell.set("weight",         mech.weight,    "kg");
    shell.set("pressureDesign", pressureDesign, "bar");

    //  THE TWO SECTIONS, ON THE SHEET, WITH THE SWAGE TEST APPLIED.  The
    //  tower is built STRAIGHT (`D` above is the larger); these say what the
    //  swaged alternative would be and how far apart the two sections are, so
    //  a reader can make the economic comparison Choupo does not price.
    const scalar* Drect = have("diameter_rectifying");
    const scalar* Dstrip = have("diameter_stripping");
    if (Drect && Dstrip && *Drect > 0.0 && *Dstrip > 0.0)
    {
        const scalar big = std::max(*Drect, *Dstrip);
        const scalar sml = std::min(*Drect, *Dstrip);
        shell.set("D_rectifying", *Drect,             "m");
        shell.set("D_stripping",  *Dstrip,            "m");
        shell.set("swageGap",     (big - sml) / big,  "-");
    }

    items.push_back(std::move(shell));

    //  ---- THE TRAY STACK ----------------------------------------------
    //  Sized, published, and NOT COSTED: see the header.  It is a separate
    //  item rather than three more keys on the shell because it is a separate
    //  purchase, from a separate vendor, with a separate delivery -- and
    //  because burying an uncosted item inside a costed one is how a total
    //  comes to look complete when it is not.
    if (nTrays > 0)
    {
        EquipmentSizing trays;
        trays.unitName      = unitName;
        trays.equipmentType = "sieveTrays";
        trays.equipmentTag  = "trays";
        trays.material      = material.name;
        trays.basis =
            "nTrays as the hydraulics pass rated them (a stage carrying"
            " vapour traffic is a tray); tray area = pi D^2 / 4 at the tower"
            " diameter";
        trays.set("nTrays",      scalar(nTrays),                "-");
        trays.set("D",           D,                             "m");
        trays.set("A",           0.25 * constant::pi * D * D,   "m2");
        trays.set("traySpacing", traySpacing,                   "m");
        items.push_back(std::move(trays));
    }

    //  ---- THE TWO EXCHANGERS ------------------------------------------
    //  Each is a `shellTubeHX` in every sense that matters to a sizer and to
    //  a costing model, so it goes through the SAME rule a heater does --
    //  `ShellTubeHX::sizeFromDuty` -- with the duty this column published and
    //  the U and LMTD the author declared.  Writing A = Q/(U*LMTD) again here
    //  would be a second home for the correlation AND for its five units.
    struct Exchanger { const char* tag; const char* kpi; const char* block; };
    const Exchanger exchangers[] =
    {
        { "condenser", "Q_condenser_kW", "condenser" },
        { "reboiler",  "Q_reboiler_kW",  "reboiler"  },
    };
    for (const auto& e : exchangers)
    {
        const scalar* Q = have(e.kpi);
        if (!Q)
        {
            itemNotBuilt(unitName, e.tag, std::string("the column publishes no '")
                + e.kpi + "' KPI, so there is no duty to size an area from.");
            continue;
        }
        if (!designRules->found(e.block))
        {
            itemNotBuilt(unitName, e.tag,
                "the case declares no `" + std::string(e.block) + " { U ...;"
                " LMTD ...; pressureDesign ...; }` block in this column's"
                " `designRules {}`.  U and the approach temperature do not"
                " follow from a converged column -- they are a choice about"
                " the SERVICE and its coolant, and they are yours.");
            continue;
        }
        auto sub = designRules->subDict(e.block);
        const std::string missing = missingKeys(sub, { "U", "LMTD", "pressureDesign" });
        if (!missing.empty())
        {
            itemNotBuilt(unitName, e.tag,
                "its `" + std::string(e.block) + " {}` block declares no "
                + missing + ".");
            continue;
        }
        EquipmentSizing hx =
            ShellTubeHX::sizeFromDuty(unitName, *Q, material, sub);
        hx.equipmentTag = e.tag;
        //  The duty's NAME matters as much as its value on a sheet with two
        //  exchangers: `Q_kW` alone cannot say which service this is.
        hx.basis = "A = Q/(U*LMTD) with U and LMTD author-set; Q is the"
                   " column's own " + std::string(e.kpi) + " KPI";
        items.push_back(std::move(hx));
    }

    //  ---- THE REFLUX DRUM ----------------------------------------------
    if (designRules->found("refluxDrum"))
    {
        auto sub = designRules->subDict("refluxDrum");
        const std::string missing =
            missingKeys(sub, { "residenceTime", "pressureDesign" });
        const scalar* Qc = have("Q_condensate_m3_s");
        if (!missing.empty())
            itemNotBuilt(unitName, "reflux drum",
                "its `refluxDrum {}` block declares no " + missing + ".");
        else if (!Qc || *Qc <= 0.0)
            itemNotBuilt(unitName, "reflux drum",
                "the column publishes no 'Q_condensate_m3_s' KPI, so the"
                " volume the condensate occupies is unknown.  That KPI is"
                " written by the tray-hydraulics pass from the thermo"
                " package's LIQUID density; a package that cannot supply one"
                " cannot size a drum, and the ideal-gas volume every other"
                " vessel is sized on would be wrong here by about three"
                " orders of magnitude.");
        else
        {
            EquipmentSizing drum;
            drum.unitName      = unitName;
            drum.equipmentType = "vessel";
            drum.equipmentTag  = "refluxDrum";
            drum.material      = material.name;

            const scalar tau  = sub->lookupScalar("residenceTime");        // s
            const scalar pDes = sub->lookupScalar("pressureDesign");       // bar
            const scalar LoD  = designDefault::valueOr(
                sub, designDefault::vesselLoverD,
                "reflux drum of distillationColumn", unitName, drum);
            const scalar ca = designDefault::valueOr(
                sub, designDefault::corrosionAllow,
                "reflux drum of distillationColumn", unitName, drum);
            const scalar je = designDefault::valueOr(
                sub, designDefault::jointEfficiency,
                "reflux drum of distillationColumn", unitName, drum);

            const scalar Vd = *Qc * tau;                                   // m3
            const scalar Dd = std::cbrt(4.0 * Vd / (constant::pi * LoD));  // m
            const scalar Hd = LoD * Dd;                                    // m
            const auto md = vesselMechanics::wall(Dd, Hd, pDes, material, je, ca);

            drum.basis =
                "V = Q_condensate * residenceTime; Q_condensate is the"
                " overhead vapour condensed, priced at the LIQUID density of"
                " the top-tray temperature; D and H from L_over_D; t_wall"
                " ASME thin-wall";
            drum.set("V_R",            Vd,        "m3");
            drum.set("D",              Dd,        "m");
            drum.set("H",              Hd,        "m");
            drum.set("L_over_D",       LoD,       "-");
            drum.set("residenceTime",  tau,       "s");
            drum.set("Q_condensate",   *Qc,       "m3/s");
            drum.set("t_wall",         md.t_wall, "m");
            drum.set("weight",         md.weight, "kg");
            drum.set("pressureDesign", pDes,      "bar");
            items.push_back(std::move(drum));
        }
    }
    else
        itemNotBuilt(unitName, "reflux drum",
            "the case declares no `refluxDrum { residenceTime ...;"
            " pressureDesign ...; }` block in this column's `designRules {}`."
            "  How long the condensate is held is an operability choice, not"
            " a consequence of the separation, and it is yours.");

    return items;
}

} // namespace Choupo

// ************************************************************************* //
