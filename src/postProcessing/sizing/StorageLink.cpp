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

#include "StorageLink.H"
#include "core/FlatUnit.H"

#include <stdexcept>

namespace Choupo {
namespace storageLink {

Link resolve(const DictPtr&            entry,
             const SimulationResult&   result,
             const std::string&        who,
             const std::string&        noun,
             const std::string&        ownForm,
             const std::vector<Owned>& owned)
{
    Link link;
    link.unit = entry->lookupWord("unit");
    const FlatUnit* fu = nullptr;
    std::string tanks;
    for (const auto& u : result.topology)
    {
        if (u.name == link.unit) fu = &u;
        if (u.type == "storageTank") tanks += " " + u.name;
    }
    if (!fu)
        throw std::runtime_error(who + ": `unit " + link.unit + ";` names"
            " no unit of this flowsheet.  The flowsheet's storageTank"
            " units are:" + (tanks.empty() ? std::string(" (none)") : tanks)
            + ".  Name one of them, or drop `unit` and declare the store"
            " on its own " + ownForm + ".");
    if (fu->type != "storageTank")
        throw std::runtime_error(who + ": `unit " + link.unit + ";` is a `"
            + fu->type + "`, not a `storageTank`.  A storage entry links"
            " only the unit that holds the stream (its residence time is"
            " the stock the " + noun + " is sized for).  The flowsheet's"
            " storageTank units are:" + (tanks.empty() ? std::string(" (none)")
            : tanks) + ".");
    //  WHAT THE UNIT OWNS, refused here by name.
    for (const auto& o : owned)
        if (entry->found(o.key))
            throw std::runtime_error(who + ": `" + o.key + "` is declared"
                " here AND the entry names the storageTank unit '"
                + link.unit + "' (`unit " + link.unit + ";`) -- "
                + o.remedy);
    if (fu->ins.empty())
        throw std::runtime_error(who + ": the storageTank unit '"
            + link.unit + "' has no inlet stream in the topology.");
    link.stream = fu->ins.front();
    const auto k = result.kpis.find(link.unit);
    auto kpi = [&](const char* key) -> scalar
    {
        if (k == result.kpis.end() || !k->second.count(key))
            throw std::runtime_error(who + ": the storageTank unit '"
                + link.unit + "' published no `" + key + "` KPI -- the"
                " " + noun + " is sized on what the unit publishes, and it"
                " published nothing to size on (did the unit solve?).");
        return k->second.at(key);
    };
    link.residenceTime_s = kpi("residenceTime_s");
    link.fillFraction    = kpi("fillFraction");
    link.vesselVolume    = kpi("vesselVolume_m3");
    return link;
}

void refuseUnlinkedNamesake(const std::string&      name,
                            const SimulationResult& result,
                            const std::string&      who,
                            const std::string&      drop,
                            const std::string&      readsWhat)
{
    //  AN ENTRY NAMED AFTER A storageTank UNIT, WITHOUT THE LINK.  Its
    //  items would belong to that unit (the plot plan pipes a unit's
    //  streams to the items of the same name) while it declares its own
    //  hold time beside the unit's -- the two homes again, by a name
    //  match nobody declared.  Refused, naming the explicit link.
    for (const auto& u : result.topology)
        if (u.type == "storageTank" && u.name == name)
            throw std::runtime_error(who + ": this entry carries the name of"
                " the flowsheet storageTank unit '" + name + "' but does not"
                " link it.  Write `unit " + name + ";` in place of `name "
                + name + ";` and delete " + drop + ": " + readsWhat + ", which"
                " have ONE home, the unit.  (A store that no flowsheet unit"
                " holds takes a name of its own.)");
}

} // namespace storageLink
} // namespace Choupo
