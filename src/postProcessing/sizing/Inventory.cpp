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

#include "Inventory.H"
#include "PhaseDensity.H"
#include "core/Dimensions.H"

#include <cstdio>
#include <iostream>
#include <stdexcept>
#include <string>

namespace Choupo {
namespace inventory {

namespace {

//  A fraction sum above 1 by more than round-off is a declaration that the
//  phases overlap.
constexpr scalar fractionSlack = 1.0e-9;

HeldPhase phaseOf(const SimulationResult& result, const std::string& stream,
                  scalar fraction, scalar V, const std::string& who)
{
    const phaseDensity::Reading d = phaseDensity::of(result, stream, who);
    HeldPhase h;
    h.phase    = d.phase;
    h.stream   = stream;
    h.fraction = fraction;
    h.volume   = V * fraction;
    h.T        = d.T;
    h.P        = d.P;
    h.rho      = d.rho;
    h.mass     = h.volume * d.rho;
    for (const auto& [c, w] : d.massFraction) h.massOf[c] = h.mass * w;
    return h;
}

void announce(const std::string& who, const ItemInventory& inv)
{
    for (const auto& h : inv.phases)
    {
        char b[320];
        std::snprintf(b, sizeof(b),
            "  [inventory] %s: %s of stream '%s', %.4g x %.6g m3 = %.6g m3 x"
            " %.2f kg/m3 = %.6g kg\n",
            who.c_str(), h.phase.c_str(), h.stream.c_str(),
            static_cast<double>(h.fraction), static_cast<double>(inv.volume),
            static_cast<double>(h.volume), static_cast<double>(h.rho),
            static_cast<double>(h.mass));
        std::cout << b;
    }
}

} // anonymous namespace

ItemInventory declared(const EquipmentSizing&  item,
                       const DictPtr&          dict,
                       const SimulationResult& result,
                       const std::string&      who)
{
    ItemInventory inv;
    auto vit = item.values.find("V_R");
    const bool sized = (vit != item.values.end());
    if (sized && dict->found("volume"))
        throw std::runtime_error(who + ": `inventory { volume ...; }` beside a"
            " sized V_R (" + std::to_string(vit->second) + " m3).  The volume"
            " an item holds material in has ONE home: its own size.  Delete"
            " the declared `volume` -- it is for an item whose sizer publishes"
            " none (a compressor, an exchanger).");
    if (sized && item.unitOf("V_R") != "m3")
        throw std::runtime_error(who + ": its V_R is declared in '"
            + item.unitOf("V_R") + "', not m3 -- the inventory will not"
              " convert a volume it cannot read.");
    if (!sized && !dict->found("volume"))
        throw std::runtime_error(who + ": declares an `inventory {}` and its"
            " sizer publishes no volume (no V_R).  Declare the holdup volume"
            " the item holds material in -- `volume <m3>;` inside the block --"
            " or remove the block; no volume is invented for it.");
    inv.volume     = sized ? vit->second
                           : dict->lookupScalar("volume", Dims::volume);
    inv.volumeFrom = sized ? "sized" : "declared";
    if (!(inv.volume > 0.0))
        throw std::runtime_error(who + ": the inventory volume must be"
            " positive.");

    if (!dict->found("held"))
        throw std::runtime_error(who + ": `inventory {}` declares no"
            " `held ( { stream <name>; fraction <0..1>; } ... );` -- which"
            " stream's state fills which share of the volume is the whole"
            " declaration.");
    scalar fsum = 0.0;
    for (const auto& e : dict->lookupDictList("held"))
    {
        if (!e->found("stream") || !e->found("fraction"))
            throw std::runtime_error(who + ": every `held` entry declares"
                " `stream <name>;` and `fraction <0..1>;`.");
        const std::string stream = e->lookupWord("stream");
        const scalar f = e->lookupScalar("fraction");
        if (!(f > 0.0 && f <= 1.0))
            throw std::runtime_error(who + ": the fraction for stream '"
                + stream + "' must be in (0, 1].");
        for (const auto& h : inv.phases)
            if (h.stream == stream)
                throw std::runtime_error(who + ": stream '" + stream + "' is"
                    " named twice in `held`.");
        fsum += f;
        inv.phases.push_back(phaseOf(result, stream, f, inv.volume, who));
    }
    if (fsum > 1.0 + fractionSlack)
        throw std::runtime_error(who + ": the `held` fractions sum to "
            + std::to_string(fsum) + " -- more than the whole volume.");

    char b[200];
    std::snprintf(b, sizeof(b), "%.4g", static_cast<double>(1.0 - fsum));
    inv.basis = std::string("m = V x fraction x rho x w, V ")
              + (sized ? "the item's own sized V_R" : "a DECLARED holdup volume")
              + "; each phase at the state of the stream named for it, on the"
                " case's package";
    if (1.0 - fsum > fractionSlack)
        inv.basis += "; " + std::string(b) + " of V holds no counted"
                     " material (internals, catalyst or empty space)";
    announce(who, inv);
    return inv;
}

ItemInventory ofTank(const EquipmentSizing&  tank,
                     const SimulationResult& result,
                     const std::string&      who)
{
    ItemInventory inv;
    inv.volume     = tank.values.at("V_R");
    inv.volumeFrom = "sized";
    const scalar fill = tank.values.at("fillFraction");
    inv.phases.push_back(phaseOf(result, tank.stream, fill, inv.volume, who));
    inv.basis = "a storage tank at its working level: m = V_R x fillFraction"
                " x rho x w of the stored stream, i.e. storageTime of"
                " production per tank set";
    announce(who, inv);
    return inv;
}

} // namespace inventory
} // namespace Choupo
