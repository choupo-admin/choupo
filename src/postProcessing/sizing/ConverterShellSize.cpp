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
#include "core/Advisory.H"
#include "core/Constants.H"
#include "core/Dimensions.H"
#include "core/RegistryRefusal.H"

#include <algorithm>
#include <cmath>
#include <cstdio>
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
    if (pressureDesign > material.maxP)
    {
        //  The catalyst-bed sizer's warning, word for word in substance: a
        //  shell designed above its material record's rating is announced.
        char msg[220];
        std::snprintf(msg, sizeof(msg),
            "design pressure %.1f bar EXCEEDS material '%s' rating %.1f bar",
            static_cast<double>(pressureDesign), material.name.c_str(),
            static_cast<double>(material.maxP));
        std::cout << "  [rating] WARNING: converterShell '" << unitName << "': "
                  << msg << "\n";
        AdvisoryLog::instance().add("rating", "warning",
                                    "converterShell '" + unitName + "'", msg);
    }

    struct Member { std::string item; scalar D, H; bool vessel; };
    std::vector<Member> members;
    for (const auto& u : units)
    {
        bool sized = false, placed = false;
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
                members.push_back({ id, sz.values.at("D"), sz.values.at("H"), true });
                placed = true;
            }
            else if (has("shellID", "m") && has("tubeLength", "m"))
            {
                const scalar n = sz.values.count("shellsInSeries")
                               ? std::max(1.0, sz.values.at("shellsInSeries")) : 1.0;
                members.push_back({ id, sz.values.at("shellID"),
                                    n * sz.values.at("tubeLength"), false });
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

    scalar Dreq = 0.0, Hreq = 0.0;
    for (const auto& m : members) { Dreq = std::max(Dreq, m.D); Hreq += m.H; }

    EquipmentSizing d;
    d.unitName      = unitName;
    d.equipmentTag  = "shell";
    d.equipmentType = "vessel";            // priced on the EXISTING vessel set
    d.material      = material.name;

    auto declaredOr = [&](const char* key, scalar req) -> scalar
    {
        if (!designRules->found(key)) return req;
        const scalar v = designRules->lookupScalar(key, Dims::length);
        if (v < req * (1.0 - 1.0e-12))
            throw std::runtime_error(who + ": the declared `" + key + "` "
                + fmt(v) + " m is SMALLER than its members need (" + fmt(req)
                + " m: " + (std::string(key) == "D"
                    ? "the widest member's diameter"
                    : "the members' heights stacked") + ") -- a shell smaller"
                  " than what it holds.");
        return v;
    };
    const scalar D = declaredOr("D", Dreq);
    const scalar H = declaredOr("H", Hreq);

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
    d.set("D_members",      Dreq,                 "m");
    d.set("H_members",      Hreq,                 "m");
    d.set("nMembers",       static_cast<scalar>(members.size()), "-");
    d.set("t_wall",         mech.t_wall,          "m");
    d.set("weight",         mech.weight,          "kg");
    d.set("pressureDesign", pressureDesign,       "bar");

    std::ostringstream basis;
    basis << "ONE pressure shell around the " << members.size() << " items of sector "
          << unitName << ", stacked axially (D = the widest member's, H = the sum of"
             " theirs" << (designRules->found("D") || designRules->found("H")
                              ? "; a DECLARED D/H at least that" : "")
          << "; no head space, cooling annulus, distributor or plenum): the members' vessel shells"
             " become internal baskets and are NOT costed; a member exchanger keeps"
             " its Turton exchanger cost, whose shell share is then counted twice"
             " (an over-estimate -- no bundle-only correlation is carried)";
    d.basis = basis.str();
    for (const auto& m : members)
        if (m.vessel) d.encloses.push_back(m.item);
    return { d };
}

} // namespace Choupo
