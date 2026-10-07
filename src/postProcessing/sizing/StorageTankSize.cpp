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

#include "StorageTankSize.H"
#include "PhaseDensity.H"
#include "core/Advisory.H"
#include "core/Dimensions.H"

#include <cmath>
#include <cstdio>
#include <iostream>
#include <stdexcept>
#include <string>

namespace Choupo {

namespace {

//  The temperature below which the stored liquid is REFRIGERATED and the
//  atmospheric tank correlation prices less tank than is built: 0 degC.
//  A choice of where to start saying so, not a property of any tank.
constexpr scalar refrigeratedBelow_K = 273.15;

//  Above this the store is a pressurised one (spheres, bullets), which the
//  atmospheric tank correlation does not describe at all.
constexpr scalar atmosphericCeiling_Pa = 1.5e5;

} // anonymous namespace

std::vector<EquipmentSizing> StorageTankSize::size(const std::string& name,
    const SimulationResult& result,
    const Material&         material,
    const DictPtr&          entry) const
{
    const std::string who = "storage '" + name + "'";
    auto need = [&](const char* key)
    {
        if (!entry->found(key))
            throw std::runtime_error(who + ": `" + key + "` is not declared."
                "  A storage item is sized from five declarations and the"
                " stream's own state:\n"
                "      stream <name>;  storageTime <n> day;  fillFraction <0..1>;"
                "  maxTankVolume <m3>;  material <record>;\n"
                "  None has a default -- each is a design basis somebody"
                " chooses.");
    };
    need("stream");
    need("storageTime");
    need("fillFraction");
    need("maxTankVolume");

    const std::string stream = entry->lookupWord("stream");

    //  THE UNIT IS REQUIRED ON THE STORAGE TIME (see the header): a bare
    //  number is SI seconds to the dict grammar.
    if (!entry->hasDimensions("storageTime"))
        throw std::runtime_error(who + ": `storageTime` carries no unit.  A"
            " bare number is read as SECONDS by the dict grammar, so `21`"
            " would size a 21-second tank.  Write the unit: `storageTime 21"
            " day;` (or `h`).");
    const scalar t_s  = entry->lookupScalar("storageTime", Dims::time);   // s
    const scalar fill = entry->lookupScalar("fillFraction");
    const scalar Vmax = entry->lookupScalar("maxTankVolume", Dims::volume); // m3
    if (!(t_s > 0.0))
        throw std::runtime_error(who + ": `storageTime` must be positive.");
    if (!(fill > 0.0 && fill <= 1.0))
        throw std::runtime_error(who + ": `fillFraction` is the working"
            " liquid level as a fraction of the tank volume, in (0, 1].");
    if (!(Vmax > 0.0))
        throw std::runtime_error(who + ": `maxTankVolume` must be positive.");

    const phaseDensity::Reading d = phaseDensity::of(result, stream, who);
    if (d.phase != "liquid")
        throw std::runtime_error(who + ": stream '" + stream + "' is a "
            + d.phase + ".  A gas is not stored in an atmospheric tank --"
              " it needs a pressure vessel or a gas holder, which this sizer"
              " does not model.");
    if (d.P > atmosphericCeiling_Pa)
        throw std::runtime_error(who + ": stream '" + stream + "' is at "
            + std::to_string(d.P * 1.0e-5) + " bar.  Pressurised liquid"
              " storage (spheres, bullets) is not an atmospheric tank, and"
              " the only tank correlation here prices an atmospheric one."
              "  Let the liquid down to atmospheric pressure first, or size"
              " the store as a vessel.");
    if (!(d.massFlow > 0.0))
        throw std::runtime_error(who + ": stream '" + stream + "' carries no"
            " flow -- there is nothing to store.");

    const scalar V_stored = t_s * d.massFlow / d.rho;        // m3 of liquid
    const scalar V_tanks  = V_stored / fill;                 // m3 of tank
    const int    N        = static_cast<int>(std::ceil(V_tanks / Vmax - 1.0e-9));
    const int    nTanks   = N < 1 ? 1 : N;
    const scalar V_each   = V_tanks / nTanks;

    const bool refrigerated = d.T < refrigeratedBelow_K;

    char line[512];
    std::snprintf(line, sizeof(line),
        "  [basis] storage '%s': %.6g day x %.6g kg/s (stream %s) / %.6g kg/m3"
        " = %.6g m3 of liquid; / fillFraction %.4g = %.6g m3 of tank; at most"
        " %.6g m3 each -> %d tank(s) of %.6g m3\n",
        name.c_str(), static_cast<double>(t_s / 86400.0),
        static_cast<double>(d.massFlow), stream.c_str(),
        static_cast<double>(d.rho), static_cast<double>(V_stored),
        static_cast<double>(fill), static_cast<double>(V_tanks),
        static_cast<double>(Vmax), nTanks, static_cast<double>(V_each));
    std::cout << line;

    std::string basis =
        "storage V = storageTime x mdot / (rho_liquid x fillFraction), split"
        " into equal tanks of at most maxTankVolume; costed as an atmospheric"
        " API fixed-roof tank";
    if (refrigerated)
    {
        basis += " -- a LOWER BOUND: the liquid is stored REFRIGERATED, and a"
                 " refrigerated (insulated, double-containment) tank costs"
                 " more than the atmospheric tank the correlation prices";
        char b[96];
        std::snprintf(b, sizeof(b), "%.2f K", static_cast<double>(d.T));
        const std::string m = "the liquid of stream '" + stream + "' is stored"
            " at " + b + ", below 0 degC: a REFRIGERATED tank (insulation,"
            " double containment, boil-off handling).  The only citable tank"
            " correlation in this engine prices an ATMOSPHERIC API fixed-roof"
            " tank, so the capital cost of this storage is a LOWER BOUND --"
            " no factor is invented to raise it";
        AdvisoryLog::instance().add("costing", "warning", who, m);
        std::cout << "  [lower bound] " << who << ": " << m << "\n";
    }

    std::vector<EquipmentSizing> items;
    for (int k = 1; k <= nTanks; ++k)
    {
        EquipmentSizing it;
        it.unitName      = name;
        it.equipmentType = type_;
        it.equipmentTag  = "tank" + std::to_string(k);
        it.material      = material.name;
        it.stream        = stream;
        it.basis         = basis;
        it.set("V_R",          V_each,       "m3");
        it.set("V_stored",     V_stored,     "m3");
        it.set("V_tanks",      V_tanks,      "m3");
        it.set("nTanks",       nTanks,       "-");
        it.set("storageTime",  t_s / 86400.0, "day");
        it.set("fillFraction", fill,         "-");
        it.set("maxTankVolume", Vmax,        "m3");
        it.set("massFlow",     d.massFlow,   "kg/s");
        it.set("rho",          d.rho,        "kg/m3");
        it.set("T",            d.T,          "K");
        it.set("P",            d.P,          "Pa");
        //  The tank correlation carries no pressure factor; the word that
        //  says WHY the cost is a floor travels to the costing model.
        if (refrigerated) it.costWords["service"] = "refrigerated";
        items.push_back(std::move(it));
    }
    return items;
}

} // namespace Choupo
