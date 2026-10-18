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
#include "StorageLink.H"

#include <cmath>
#include <cstdio>
#include <iostream>
#include <stdexcept>
#include <string>
#include <vector>

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

    //  TWO ROUTES, and an entry takes exactly one (DEV.md 4c C87, Vitor's
    //  ruling "um so sitio": the hold time has ONE home).
    //
    //    LINKED -- `unit <name>;` names a flowsheet `storageTank` UNIT.  The
    //      unit already DECLARES how long it holds the stream
    //      (`operation { residenceTime; fillFraction; }`) and PUBLISHES both
    //      as KPIs; the tank is sized on those published values and on the
    //      unit's own inlet, and the entry declares only what the unit does
    //      not know: the tank's material and its size ceiling.  Declaring
    //      the hold time, the fill fraction, the stream or a second name
    //      here as well REFUSES by name -- two homes for one fact agree only
    //      until somebody edits one of them.
    //    UNLINKED -- no `unit`: a store attached to a boundary stream that no
    //      flowsheet unit holds (the C44 shape, `NH3Storage` on the green
    //      ammonia plants).  The entry is the ONLY home of its hold time,
    //      so it declares it, exactly as before.
    std::string stream;
    scalar      t_s  = 0.0;
    scalar      fill = 0.0;
    std::string linkedUnit;
    if (entry->found("unit"))
    {
        //  WHAT THE UNIT OWNS, refused by name beside `unit` (the link has
        //  ONE home, `storageLink`, shared with the two pressure stores).
        const std::vector<storageLink::Owned> owned = {
            { "storageTime",  "the hold time has ONE home, the unit's `operation"
                " { residenceTime; }` in system/flowsheetDict, and the tank is"
                " sized on the residence time the unit publishes.  Delete"
                " `storageTime` from this entry; to change the stock, change the"
                " unit's `residenceTime`." },
            { "fillFraction", "the working level has ONE home, the unit's"
                " `operation { fillFraction; }` in system/flowsheetDict (its"
                " holdup is computed with it), and the tank is sized on the"
                " fill fraction the unit publishes.  Delete `fillFraction` from"
                " this entry; to change it, change the unit's." },
            { "stream",       "the stream a linked tank stores is the unit's own"
                " inlet.  Delete `stream` from this entry." },
            { "name",         "the items of a linked entry ARE the unit's ("
                + entry->lookupWord("unit") + "/tank1, ...).  Delete `name` from"
                " this entry." },
        };
        const storageLink::Link link = storageLink::resolve(entry, result,
            who, "tank", "(stream; storageTime; fillFraction)", owned);
        linkedUnit = link.unit;
        stream     = link.stream;
        t_s        = link.residenceTime_s;
        fill       = link.fillFraction;
    }
    else
    {
        storageLink::refuseUnlinkedNamesake(name, result, who,
            "`stream`, `storageTime` and `fillFraction`",
            "the tank is then sized on the unit's own inlet, residence time"
            " and fill fraction");

        auto need = [&](const char* key)
        {
            if (!entry->found(key))
                throw std::runtime_error(who + ": `" + key + "` is not declared."
                    "  A storage item is sized from five declarations and the"
                    " stream's own state:\n"
                    "      stream <name>;  storageTime <n> day;  fillFraction <0..1>;"
                    "  maxTankVolume <m3>;  material <record>;\n"
                    "  None has a default -- each is a design basis somebody"
                    " chooses.  (A tank that a flowsheet `storageTank` unit"
                    " holds is linked with `unit <name>;` instead, and reads"
                    " the unit's stream, residence time and fill fraction.)");
        };
        need("stream");
        need("storageTime");
        need("fillFraction");

        stream = entry->lookupWord("stream");

        //  THE UNIT IS REQUIRED ON THE STORAGE TIME (see the header): a bare
        //  number is SI seconds to the dict grammar.
        if (!entry->hasDimensions("storageTime"))
            throw std::runtime_error(who + ": `storageTime` carries no unit.  A"
                " bare number is read as SECONDS by the dict grammar, so `21`"
                " would size a 21-second tank.  Write the unit: `storageTime 21"
                " day;` (or `h`).");
        t_s  = entry->lookupScalar("storageTime", Dims::time);   // s
        fill = entry->lookupScalar("fillFraction");
    }
    if (!entry->found("maxTankVolume"))
        throw std::runtime_error(who + ": `maxTankVolume` is not declared."
            "  A storage item is sized from five declarations and the"
            " stream's own state:\n"
            "      stream <name>;  storageTime <n> day;  fillFraction <0..1>;"
            "  maxTankVolume <m3>;  material <record>;\n"
            "  None has a default -- each is a design basis somebody"
            " chooses.");
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
              " does not model.  A buffer in pressure vessels is"
              " `gasStorage ( ... )`.");
    if (d.P > atmosphericCeiling_Pa)
        throw std::runtime_error(who + ": stream '" + stream + "' is at "
            + std::to_string(d.P * 1.0e-5) + " bar.  Pressurised liquid"
              " storage (spheres, bullets) is not an atmospheric tank, and"
              " the only tank correlation here prices an atmospheric one."
              "  Let the liquid down to atmospheric pressure first, or size"
              " the store as pressure vessels (`liquefiedGasStorage ("
              " ... )`).");
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
    if (!linkedUnit.empty())
        std::cout << "  [basis] storage '" << name << "': the storage time,"
                     " the fill fraction and the stream are those of the"
                     " storageTank unit '" << linkedUnit << "' (its KPIs"
                     " residenceTime_s and fillFraction, its inlet) -- declared"
                     " once, on the unit\n";

    std::string basis = linkedUnit.empty()
        ? std::string("storage V = storageTime x mdot / (rho_liquid x"
              " fillFraction), split into equal tanks of at most"
              " maxTankVolume; costed as an atmospheric API fixed-roof tank")
        : std::string("storage V = residenceTime x mdot / (rho_liquid x"
              " fillFraction), the residence time, the fill fraction and the"
              " stream read from the storageTank unit '") + linkedUnit
          + "', split into equal tanks of at most maxTankVolume; costed as an"
            " atmospheric API fixed-roof tank";
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
