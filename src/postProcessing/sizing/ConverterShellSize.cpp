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

#include "ConverterShellSize.H"

#include "DesignDefaults.H"
#include "VesselMechanics.H"
#include "MaterialLimits.H"
#include "core/Advisory.H"
#include "core/Constants.H"
#include "core/Dimensions.H"
#include "core/RegistryRefusal.H"

#include <algorithm>
#include <cmath>
#include <cstdio>
#include <iomanip>
#include <iostream>
#include <set>
#include <sstream>
#include <stdexcept>
#include <string>

namespace Choupo {

namespace {

bool inSector(const std::string& stamped, const std::string& sector)
{
    return stamped == sector || stamped.rfind(sector + ".", 0) == 0;
}

//  How close the binding bed's drop must sit to its allowable for the
//  diameter to be called the SMALLEST admissible one: the 0.2 % the witness's
//  DesignSpec solves `dP_over_allowable = 1` to (system/outerDict, tol 0.002).
constexpr scalar bindingTolerance = 2.0e-3;

//  The bracket the smallest admissible diameter is searched on: a range
//  wider than any converter shell built (a SEARCH bracket, not a design
//  limit), so a root outside it means no axial-flow converter meets the
//  beds' budgets, and is refused by name.
constexpr scalar diameterBracketLo = 0.1;    // m
constexpr scalar diameterBracketHi = 10.0;   // m

std::string fmt(scalar v)
{
    std::ostringstream o;
    o.precision(6);
    o << v;
    return o.str();
}

} // namespace

std::vector<EquipmentSizing> ConverterShellSize::size(const std::string& unitName,
    const SimulationResult& result,
    const Material&         material,
    const DictPtr&          designRules) const
{
    const std::string who = "ConverterShell: sector '" + unitName + "'";

    //  ---- THE MEMBERS: the sector's units, from the solved topology -------
    std::vector<std::string> units;
    std::set<std::string> sectors;
    for (const auto& fu : result.topology)
    {
        if (!fu.sector.empty()) sectors.insert(fu.sector);
        if (inSector(fu.sector, unitName)) units.push_back(fu.name);
    }
    if (units.empty())
        throw std::runtime_error(who + ": " + registryRefusal::message(
            "sector of this plant", unitName,
            std::vector<std::string>(sectors.begin(), sectors.end()),
            "Sectors of this plant")
            + "  A converterShell names a SECTOR: its members are that"
              " sector's units, read from the topology, never listed again.");

    //  ---- EVERY HARD REQUIREMENT FIRST (the VesselSize rule) ------------
    if (!designRules->found("pressureDesign"))
        throw std::runtime_error(who + ": no `pressureDesign` in its designRules"
            " -- the converter's shell is THE pressure vessel and its wall"
            " cannot be sized without one.  Declare `pressureDesign <bar>;`.");
    const scalar pressureDesign = designRules->lookupScalar("pressureDesign");   // bar g
    if (material.sigma_y <= 0.0)
        throw std::runtime_error(who + ": material '" + material.name
            + "' has no sigma_y defined -- the shell wall cannot be sized");
    //  THE RECORD'S PRESSURE RATING, from the one home both material limits
    //  share (`MaterialLimits.H`): announced, never refused.
    materialLimits::pressure("converterShell '" + unitName + "'", material, pressureDesign);

    struct Member { std::string unit, item; scalar D, H; bool vessel, bed; };
    std::vector<Member> members;
    for (const auto& u : units)
    {
        bool sized = false, placed = false;
        const auto kIt = result.kpis.find(u);
        //  A CATALYST BED is a member whose unit publishes the bed's own
        //  cross-section (the pfr's `D_bed_m`, read from the unit, never
        //  inferred from its name).
        const bool bed = kIt != result.kpis.end() && kIt->second.count("D_bed_m");
        for (const auto& entry : result.sizings)
        {
            //  Not a structured binding: the lambda below captures `sz`, and
            //  capturing a structured binding is C++20 (emscripten refuses it).
            const std::string&     id = entry.first;
            const EquipmentSizing& sz = entry.second;
            if (sz.unitName != u || sz.relief.present()) continue;
            sized = true;
            auto has = [&](const char* k, const char* unit)
            { return sz.values.count(k) && sz.unitOf(k) == unit; };
            if (has("D", "m") && has("H", "m"))
            {
                members.push_back({ u, id, sz.values.at("D"), sz.values.at("H"),
                                    true, bed });
                placed = true;
            }
            else if (has("shellID", "m") && has("tubeLength", "m"))
            {
                const scalar n = sz.values.count("shellsInSeries")
                               ? std::max(1.0, sz.values.at("shellsInSeries")) : 1.0;
                members.push_back({ u, id, sz.values.at("shellID"),
                                    n * sz.values.at("tubeLength"), false, false });
                placed = true;
            }
            if (sz.values.count("pressureDesign")
                && sz.unitOf("pressureDesign") == "bar"
                && sz.values.at("pressureDesign") > pressureDesign)
                throw std::runtime_error(who + ": member '" + id + "' is designed"
                    " for " + fmt(sz.values.at("pressureDesign")) + " bar and"
                    " the shell that holds it for " + fmt(pressureDesign)
                    + " bar -- a pressure shell rated below what it contains."
                      "  Raise the converterShell's `pressureDesign`.");
        }
        if (!sized)
            throw std::runtime_error(who + ": its unit '" + u + "' has not been"
                " sized before this entry, so the shell does not know what it"
                " holds.  Declare the converterShell entry AFTER every member's"
                " own entry in `sizing { units ( ... ); }`.");
        if (!placed)
            throw std::runtime_error(who + ": its unit '" + u + "' is sized but"
                " publishes no geometry the shell can hold -- a vessel's D and H"
                " (a catalyst bed's shell) or an exchanger DESIGN's shellID and"
                " tubeLength (`design {}` in its designRules).  An exchanger"
                " sized on an assumed U has no shell to stack.");
    }

    //  ---- ONE DIAMETER: the shell's, shared by every bed ------------------
    //  The beds sit in ONE shell, so they have ONE diameter, and it has ONE
    //  home: the beds' `operation.diameter` -- in the FLOWSHEET, because a
    //  bed needs its cross-section DURING the solve (its Ergun drop and its
    //  length) and this pass runs after it.  A bed sized at its own
    //  slenderness would give the shell a second, contradicting diameter.
    scalar D_conv = -1.0;
    std::string firstBed;
    for (const auto& m : members)
    {
        if (!m.vessel) continue;
        const auto& k = result.kpis.at(m.unit);
        if (!m.bed || !k.count("D_bed_declared_m"))
            throw std::runtime_error(who + ": its member '" + m.unit + "' is"
                " a vessel whose diameter is its OWN (" + (m.bed
                    ? std::string("a bed sized at its own `operation.L_over_D`")
                    : std::string("not a catalyst bed of declared diameter"))
                + ") -- inside a converter the beds share ONE diameter, the"
                  " shell's.  Declare `diameter $<converter diameter>;` in each"
                  " bed's operation (one plant variable, read by every bed) and"
                  " delete its `L_over_D`.");
        const scalar Dm = k.at("D_bed_declared_m");
        if (D_conv < 0.0) { D_conv = Dm; firstBed = m.unit; }
        else if (std::abs(Dm - D_conv) > 1.0e-12 * D_conv)
            throw std::runtime_error(who + ": its beds declare TWO diameters ("
                + firstBed + " " + fmt(D_conv) + " m, " + m.unit + " " + fmt(Dm)
                + " m) -- ONE shell holds them, so they share ONE diameter."
                  "  Declare it once (a plant variable) and read it in every"
                  " bed.");
    }
    if (D_conv < 0.0)
        throw std::runtime_error(who + ": the sector holds no catalyst bed of"
            " declared diameter, and a converter's diameter is its beds' (one"
            " home, in the flowsheet).  A converterShell is for a sector of"
            " catalyst beds.");
    if (designRules->found("D"))
        throw std::runtime_error(who + ": `D` in its designRules is a second"
            " home for the converter's diameter -- it is the beds' declared"
            " `operation.diameter` (" + fmt(D_conv) + " m), read in the"
            " flowsheet where the beds need it during the solve.  Delete it.");
    for (const auto& m : members)
        if (!m.vessel && m.D > D_conv * (1.0 + 1.0e-12))
            throw std::runtime_error(who + ": its exchanger '" + m.item + "'"
                " has a shell of " + fmt(m.D) + " m inside a converter of "
                + fmt(D_conv) + " m -- it does not fit.  Widen the converter"
                " (the beds' `diameter`) or redesign the exchanger.");

    scalar Hreq = 0.0;
    for (const auto& m : members) Hreq += m.H;

    //  ---- THE SMALLEST ADMISSIBLE DIAMETER: a bracketed root search -----
    //  Each bed published its Ergun drop at the converter's diameter D0 and
    //  the share of it the INERTIAL term carries over the bed (the pfr's
    //  `ergunInertialShare_bed`).  At a fixed volume and a FROZEN axial
    //  state the viscous term goes as D^-4 and the inertial as D^-6, so
    //      r_i(D) = r_i(D0) [ (1 - s_i) (D0/D)^4 + s_i (D0/D)^6 ]
    //  is bed i's drop over its allowable at any D, EXACT at D0 (the drop it
    //  splits is the marched one).  Every r_i falls monotonically as D
    //  widens, so f(D) = max_i r_i(D) - 1 has ONE root: the smallest D at
    //  which every bed is within its allowable, and the bed that is largest
    //  there is the BINDING bed.  Bisected (in ln D) on a fixed bracket, said
    //  aloud with the bracket; no root in the bracket is REFUSED by name.
    //  This pass does not move the diameter -- the beds were SOLVED at D0,
    //  their drops are in the stream table -- it says where D0 stands.  The
    //  frozen state is the one approximation, and it vanishes at D0: away
    //  from it, a different drop would move the pressure the gas reacts at.
    struct BedDrop { std::string unit; scalar dP, r0, share; };
    std::vector<BedDrop> drops;
    for (const auto& m : members)
    {
        if (!m.bed) continue;
        const auto& k = result.kpis.at(m.unit);
        if (!k.count("dP_over_allowable")) continue;       // no allowable declared
        if (!k.count("ergunInertialShare_bed") || !k.count("dP_bed_bar"))
            throw std::runtime_error(who + ": its bed '" + m.unit + "' publishes"
                " a drop over its allowable but not the Ergun split this sizer"
                " scales it on (`ergunInertialShare_bed`, `dP_bed_bar`) -- a pfr"
                " of declared diameter with `pressureDrop { model Ergun; }`"
                " publishes both; this is an engine inconsistency, not a case"
                " error.");
        drops.push_back({ m.unit, k.at("dP_bed_bar"), k.at("dP_over_allowable"),
                          k.at("ergunInertialShare_bed") });
    }
    auto ratioAt = [&](const BedDrop& b, scalar D) -> scalar
    {
        const scalar q = D_conv / D, q4 = q * q * q * q;
        return b.r0 * ((1.0 - b.share) * q4 + b.share * q4 * q * q);
    };
    auto largestAt = [&](scalar D, std::string& which) -> scalar
    {
        scalar best = -1.0;
        for (const auto& b : drops)
        {
            const scalar r = ratioAt(b, D);
            if (r > best) { best = r; which = b.unit; }
        }
        return best;
    };

    std::string binding, bindingAtD0;
    scalar ratioMax = -1.0, dPmax = 0.0, Dmin = -1.0;
    int bisections = 0;
    for (const auto& b : drops)
        if (b.r0 > ratioMax) { ratioMax = b.r0; bindingAtD0 = b.unit; dPmax = b.dP; }
    std::ostringstream verdict;
    if (drops.empty())
        verdict << "no bed declares an allowable pressure drop, so nothing"
                   " bounds the converter's diameter from below";
    else
    {
        std::string whoHi, whoLo;
        const scalar fHi = largestAt(diameterBracketHi, whoHi) - 1.0;
        const scalar fLo = largestAt(diameterBracketLo, whoLo) - 1.0;
        if (fHi > 0.0)
            throw std::runtime_error(who + ": NO diameter in the bracket ["
                + fmt(diameterBracketLo) + ", " + fmt(diameterBracketHi) + "] m"
                " holds every bed within its allowable pressure drop: at "
                + fmt(diameterBracketHi) + " m " + whoHi + " still loses "
                + fmt(1.0 + fHi) + " of its allowable (each bed's solved axial"
                  " state held fixed, drop ~ D^-4 viscous to D^-6 inertial)."
                  "  An axial-flow converter cannot meet these budgets: a larger"
                  " particle, a larger allowable, or a bed the gas crosses"
                  " RADIALLY.");
        if (fLo <= 0.0)
        {
            binding = whoLo;
            verdict << "every bed is within its allowable even at the bracket's"
                       " lower end " << fmt(diameterBracketLo) << " m, so the"
                       " converter's " << std::fixed << std::setprecision(4)
                    << D_conv << " m is set by something other than the beds'"
                       " drops (the largest is " << bindingAtD0 << " at "
                    << ratioMax << " of its allowable)";
        }
        else
        {
            scalar a = std::log(diameterBracketLo), c = std::log(diameterBracketHi);
            while (c - a > 1.0e-12 && bisections < 200)
            {
                const scalar mid = 0.5 * (a + c);
                std::string w;
                if (largestAt(std::exp(mid), w) - 1.0 > 0.0) a = mid; else c = mid;
                ++bisections;
            }
            Dmin = std::exp(c);
            largestAt(Dmin, binding);
            verdict << std::fixed
                    << "the smallest diameter at which every bed's Ergun drop is"
                       " within its allowable, bracketed on ["
                    << std::setprecision(2) << diameterBracketLo << ", "
                    << diameterBracketHi << "] m (" << bisections
                    << " bisections in ln D, each bed's solved axial state held"
                       " fixed), is " << std::setprecision(4) << Dmin
                    << " m, and the binding bed there is " << binding << ".  ";
            if (std::abs(ratioMax - 1.0) <= bindingTolerance)
                verdict << "The converter's " << D_conv << " m is that diameter:"
                           " the binding bed sits at " << ratioMax
                        << " of its allowable (to " << std::setprecision(1)
                        << 100.0 * bindingTolerance << " %) and every other bed"
                           " below it";
            else if (ratioMax < 1.0)
                verdict << "The converter's " << D_conv << " m is WIDER than"
                           " that: every bed is inside its allowable with margin"
                           " (the largest, " << bindingAtD0 << ", at "
                        << ratioMax << "), so a narrower converter would still"
                           " meet them";
            else
                verdict << "The converter's " << D_conv << " m is NARROWER than"
                           " that: " << bindingAtD0 << " EXCEEDS its allowable ("
                        << ratioMax << ") -- a wider converter is needed";
        }
    }
    std::ostringstream table;
    table.setf(std::ios::fixed);
    for (const auto& m : members)
    {
        if (!m.bed) continue;
        const auto& k = result.kpis.at(m.unit);
        table << "      " << std::left << std::setw(26) << m.unit << std::right
              << " H " << std::setprecision(3) << std::setw(7) << m.H << " m";
        if (k.count("dP_bed_bar"))
            table << "   dP " << std::setprecision(4) << k.at("dP_bed_bar") << " bar";
        if (k.count("dP_over_allowable"))
            table << "   " << std::setprecision(4) << k.at("dP_over_allowable")
                  << " of its allowable";
        if (k.count("ergunInertialShare_bed"))
            table << "   (inertial share " << std::setprecision(3)
                  << k.at("ergunInertialShare_bed") << ")";
        table << "\n";
    }
    std::cout << "    converterShell '" << unitName << "': ONE diameter "
              << std::fixed << std::setprecision(4) << D_conv << " m for its "
              << "beds (declared in the flowsheet); bed heights H = V_R / (pi D^2 / 4):\n"
              << table.str() << "      " << verdict.str() << "\n";
    if (ratioMax > 1.0 + bindingTolerance)
        AdvisoryLog::instance().add("rating", "warning",
            "converterShell '" + unitName + "'", verdict.str());
    else
        AdvisoryLog::instance().add("model", "info",
            "converterShell '" + unitName + "'", verdict.str());

    EquipmentSizing d;
    d.unitName      = unitName;
    d.equipmentTag  = "shell";
    d.equipmentType = "vessel";            // priced on the EXISTING vessel set
    d.material      = material.name;

    scalar H = Hreq;
    if (designRules->found("H"))
    {
        H = designRules->lookupScalar("H", Dims::length);
        if (H < Hreq * (1.0 - 1.0e-12))
            throw std::runtime_error(who + ": the declared `H` " + fmt(H)
                + " m is SMALLER than its members need (" + fmt(Hreq)
                + " m: the members' heights stacked) -- a shell smaller than"
                  " what it holds.");
    }
    const scalar D = D_conv;

    const scalar corrosionAllow = designDefault::valueOr(
        designRules, designDefault::corrosionAllow, "converterShell", unitName, d);
    const scalar jointEff = designDefault::valueOr(
        designRules, designDefault::jointEfficiency, "converterShell", unitName, d);
    const auto mech = vesselMechanics::wall(D, H, pressureDesign, material,
                                            jointEff, corrosionAllow);
    const scalar V = 0.25 * constant::pi * D * D * H;

    d.set("V_R",            V,                    "m3");    // Turton vessel sizeKey
    d.set("D",              D,                    "m");
    d.set("H",              H,                    "m");
    d.set("L_over_D",       H / D,                "-");
    d.set("H_members",      Hreq,                 "m");
    d.set("nMembers",       static_cast<scalar>(members.size()), "-");
    d.set("t_wall",         mech.t_wall,          "m");
    d.set("weight",         mech.weight,          "kg");
    d.set("pressureDesign", pressureDesign,       "bar");
    if (ratioMax >= 0.0)
    {
        d.set("dP_binding",                 dPmax,    "bar");
        d.set("dP_binding_over_allowable",  ratioMax, "-");
    }
    if (Dmin > 0.0) d.set("D_smallestAdmissible", Dmin, "m");

    std::ostringstream basis;
    basis << "ONE pressure shell around the " << members.size() << " items of sector "
          << unitName << ": D the beds' ONE declared diameter (read from their"
             " operation.diameter, where they need it during the solve), H the"
             " members stacked axially" << (designRules->found("H")
                              ? " (a DECLARED H at least that)" : "")
          << "; no head space, cooling annulus, distributor or plenum: the beds'"
             " own shells become internal baskets and are NOT costed; a member"
             " exchanger keeps its Turton exchanger cost, whose shell share is"
             " then counted twice (an over-estimate -- no bundle-only"
             " correlation is carried)";
    if (Dmin > 0.0)
        basis << "; the smallest diameter holding every bed within its allowable"
                 " drop, bracketed on [" << fmt(diameterBracketLo) << ", "
              << fmt(diameterBracketHi) << "] m with each bed's solved axial"
                 " state held fixed: " << fmt(Dmin) << " m, binding bed " << binding;
    else if (!binding.empty())
        basis << "; binding bed " << binding;
    d.basis = basis.str();
    for (const auto& m : members)
        if (m.vessel) d.encloses.push_back(m.item);
    return { d };
}

} // namespace Choupo
