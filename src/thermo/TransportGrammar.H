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
    static const std::vector<std::string> liquidP{ "viscosity", "thermalConductivity", "diffusivity", "rheology", "ionDiffusivity" };   // C421 (7): the flow curve; C435 (4): the ions' temperature rule
    static const std::vector<std::string> iface{ "surfaceTension" };
    static const std::vector<std::string> none;
    if (phase == "liquid") return liquidP;
    if (phase == "vapour") return fluid;
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
    if (flat == "liquidRheology")      return "liquid { rheology { ... } }";
    if (flat == "surfaceTension")      return "interface { surfaceTension { ... } }";
    return "";
}

inline bool readInsideBlock(const std::string& k)
{
    return k == "model" || k == "mixingRule" || k == "interaction" || k == "pin";
}

//  The keys one block reads beyond those four (C398 slice (d)): the liquid
//  viscosity's `measured {}` (a mixture measurement of a constituent set)
//  and the liquid diffusivity's declared quantity -- `returns`,
//  `composition`, `infiniteDilution`, `thermodynamicFactor`
//  (transport/LiquidTransportDeclarations.H reads them, and refuses what is
//  not this slice's by name).
inline bool readInsideBlock(const std::string& phase, const std::string& prop,
                            const std::string& k)
{
    //  C435 (4): the ions' D0 temperature rule is a declared choice, not a side effect of a viscosity.
    if (phase == "liquid" && prop == "ionDiffusivity") return k == "temperatureCorrection" || k == "reason";
    if (readInsideBlock(k)) return true;
    //  C421 slice (8): the liquid thermal conductivity and the surface tension take `measured {}` too.
    if (phase == "liquid" && (prop == "viscosity" || prop == "thermalConductivity")) return k == "measured";
    if (phase == "interface" && prop == "surfaceTension") return k == "measured";
    if (phase == "liquid" && prop == "rheology") return k == "measured";            // C421 (7)
    if (phase == "liquid" && prop == "diffusivity")
        return k == "returns" || k == "composition" || k == "infiniteDilution"
            || k == "thermodynamicFactor";
    return false;
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
                if (!readInsideBlock(ph, pr, k))
                    throw std::runtime_error(where + "." + ph + "." + pr + ": `" + k
                        + "` is read by nothing -- a property block carries `model`,"
                          " and for the liquid properties `mixingRule`,"
                          " `interaction` and `pin`; the liquid viscosity also"
                          " `measured`, the liquid diffusivity `returns`,"
                          " `composition`, `infiniteDilution` and"
                          " `thermodynamicFactor`; `ionDiffusivity` only"
                          " `temperatureCorrection` and `reason`.");
            if (ph == "liquid" && pr == "ionDiffusivity")
            {
                const std::string w = where + ".liquid.ionDiffusivity";
                const auto pk = pb->keys();
                auto has = [&](const char* k) { for (const auto& x : pk) if (x == k) return true; return false; };
                if (!has("temperatureCorrection") || !has("reason"))
                    throw std::runtime_error(w + ": declare BOTH `temperatureCorrection"
                        " stokesEinstein | none;` and `reason \"...\";` -- a choice"
                        " that moves every ion's D at T != 298.15 K carries its why.");
                const std::string m = pb->lookupWord("temperatureCorrection");
                if (m != "stokesEinstein" && m != "none")
                    throw std::runtime_error(w + ": `temperatureCorrection " + m
                        + ";` is not a choice -- the choices are stokesEinstein"
                          " (D = D0 (T/T0)(mu(T0)/mu(T)), needs a declared liquid"
                          " viscosity) and none (D = D0 at every T).");
            }
        }
    }
}

} // namespace transportGrammar
} // namespace Choupo
