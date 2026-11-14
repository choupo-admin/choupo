/*---------------------------------------------------------------------------*\
       \|/       C hemicals     | Open-source, glass-box chemical process simulator
      \\|//      H eat-transfer | https://choupo.org
     \\\|///     O perations    |
      \\|//      U nits         | Copyright (C) 2026 Vítor Geraldes
       \|/       P roperties    | Licence: GPL-3.0-or-later
        |        O ptimization  |
       /|\                      |
-------------------------------------------------------------------------------
License
    This file is part of Choupo.

    Choupo is free software: you can redistribute it and/or modify it
    under the terms of the GNU General Public License as published
    by the Free Software Foundation, either version 3 of the License, or
    (at your option) any later version.

    Choupo is distributed in the hope that it will be useful, but WITHOUT
    ANY WARRANTY; without even the implied warranty of MERCHANTABILITY or
    FITNESS FOR A PARTICULAR PURPOSE.  See the GNU General Public
    License for more details (https://www.gnu.org/licenses/gpl-3.0.html).

    SPDX-License-Identifier: GPL-3.0-or-later

    Credit and attribution: see AUTHORS
    Required legal notices:  see NOTICE
-------------------------------------------------------------------------------
File
    src/thermo/TransportGrammar.H

Description
    THE PROPERTY BLOCKS OF `transport {}`, in one table (DEV.md 4c C398,
    slice (a)).  A property block -- `transport.<phase>.<property>` -- is the
    ATOM a variant, an inline `thermo {}` fragment and a sector's `inherits`
    replace (THE RULING, point 2).  For the atom to be one thing, the names
    it is spelt with must be one list:

        vapour    { viscosity  thermalConductivity  diffusivity }
        liquid    { viscosity  thermalConductivity  diffusivity }
        interface { surfaceTension }

    and inside a block the builder reads `model`, `mixingRule` and
    `interaction` (ThermoPackageBuilder.cpp, v2TransportDict).  Until this
    table, a name outside it was DROPPED in silence -- a misspelt property
    under a phase, or the flat spelling `liquidViscosity { }` beside
    `liquid { viscosity { } }` (the SAME block written twice, of which one
    was read).  Measured on 2026-11-14 over 3877 dictionaries
    (thermoPhysPropDict, propsDict, flowsheetDict): no shipped block carries
    a name outside the table, so refusing them moves no case.
\*---------------------------------------------------------------------------*/

#pragma once

#include "core/Dictionary.H"

#include <stdexcept>
#include <string>
#include <vector>

namespace Choupo {
namespace transportGrammar {

//  The property names of one phase ("" list for an unknown phase).
inline const std::vector<std::string>& propertiesOf(const std::string& phase)
{
    static const std::vector<std::string> fluid{ "viscosity", "thermalConductivity", "diffusivity" };
    static const std::vector<std::string> iface{ "surfaceTension" };
    static const std::vector<std::string> none;
    if (phase == "vapour" || phase == "liquid") return fluid;
    if (phase == "interface") return iface;
    return none;
}

inline const std::vector<std::string>& phases()
{
    static const std::vector<std::string> p{ "vapour", "liquid", "interface" };
    return p;
}

//  The flat (legacy canonical) spelling of a block, mapped to the
//  phase-structured one -- for the refusal's remedy.
inline std::string phaseStructuredSpelling(const std::string& flat)
{
    if (flat == "viscosity")           return "vapour { viscosity { ... } }";
    if (flat == "thermalConductivity") return "vapour { thermalConductivity { ... } }";
    if (flat == "diffusivity")         return "vapour { diffusivity { ... } }";
    if (flat == "liquidViscosity")     return "liquid { viscosity { ... } }";
    if (flat == "liquidConductivity")  return "liquid { thermalConductivity { ... } }";
    if (flat == "liquidDiffusivity")   return "liquid { diffusivity { ... } }";
    if (flat == "surfaceTension")      return "interface { surfaceTension { ... } }";
    return "";
}

inline bool readInsideBlock(const std::string& k)
{
    return k == "model" || k == "mixingRule" || k == "interaction";
}

//  Refuse, by name, every name of a `transport {}` block nothing would read.
//  Consults nothing (keys() and childDictsUnnoted() do not note), so the
//  unread-key audit still sees what the builder did not read.
inline void validate(const DictPtr& t, const std::string& where)
{
    auto list = [](const std::vector<std::string>& v)
    {
        std::string s;
        for (const auto& x : v) s += (s.empty() ? "" : ", ") + x;
        return s;
    };
    const auto kids = t->childDictsUnnoted();
    auto child = [&](const DictPtr& d, const std::string& k) -> DictPtr
    {
        for (const auto& [path, c] : d->childDictsUnnoted()) if (path == k) return c;
        return nullptr;
    };
    for (const auto& ph : t->keys())
    {
        if (propertiesOf(ph).empty())
        {
            const std::string other = phaseStructuredSpelling(ph);
            if (!other.empty())
                throw std::runtime_error(where + ": `" + ph + "` is the flat"
                    " spelling of a property block; this grammar has ONE"
                    " spelling for each block, the phase-structured one: write"
                    " `transport { " + other + " }`.  (Both spellings of one"
                    " block cannot both be read, so neither is accepted"
                    " beside the other.)");
            throw std::runtime_error(where + ": `" + ph + "` is not a phase of"
                " `transport {}` -- the phases are " + list(phases()) + ".");
        }
        DictPtr pd;
        for (const auto& [path, c] : kids) if (path == ph) { pd = c; break; }
        if (!pd)
            throw std::runtime_error(where + "." + ph + " is not a block --"
                " write `" + ph + " { <property> { model <word>; } }`.");
        for (const auto& pr : pd->keys())
        {
            bool known = false;
            for (const auto& v : propertiesOf(ph)) if (v == pr) { known = true; break; }
            if (!known)
                throw std::runtime_error(where + "." + ph + ": `" + pr + "` is not"
                    " a property block of this phase, so nothing would read it."
                    "  The " + ph + " blocks are: " + list(propertiesOf(ph)) + ".");
            const DictPtr pb = child(pd, pr);
            if (!pb)
                throw std::runtime_error(where + "." + ph + "." + pr + " is not a"
                    " block -- write `" + pr + " { model <word>; }`.");
            for (const auto& k : pb->keys())
                if (!readInsideBlock(k))
                    throw std::runtime_error(where + "." + ph + "." + pr + ": `" + k
                        + "` is read by nothing -- a property block carries `model`,"
                          " and for the liquid properties `mixingRule` and"
                          " `interaction`.");
        }
    }
}

} // namespace transportGrammar
} // namespace Choupo
