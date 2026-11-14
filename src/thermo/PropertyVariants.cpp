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
\*---------------------------------------------------------------------------*/

#include "thermo/PropertyVariants.H"
#include "thermo/TransportGrammar.H"

#include <memory>
#include <stdexcept>
#include <variant>

namespace Choupo {
namespace propertyVariants {

namespace {

//  The keys a variant's body may carry: the system grammar's own blocks,
//  the same list an inline fragment is held to (ThermoOverride.H).
bool fragmentBlock(const std::string& k)
{
    return k == "equilibrium" || k == "caloric" || k == "volumetric"
        || k == "transport" || k == "pureFluids";
}

//  The words a derivation would be written with.  No variant derives from
//  another (THE RULING, point 1: one base, no chain, no cycle), so each is
//  refused BY NAME rather than falling on the generic unknown-key refusal,
//  which would not say why.
bool derivationWord(const std::string& k)
{
    return k == "thermo" || k == "variant" || k == "variants"
        || k == "inherits" || k == "derivedFrom" || k == "base"
        || k == "from" || k == "package" || k == "propertyPackage";
}

//  The variants block WITHOUT noting it (keys() and childDictsUnnoted()
//  consult nothing), so validation never hides an unused variant from the
//  audit that announces it.
DictPtr variantsUnnoted(const DictPtr& system)
{
    if (!system) return nullptr;
    for (const auto& [path, d] : system->childDictsUnnoted())
        if (path == "variants") return d;
    return nullptr;
}

DictPtr childUnnoted(const DictPtr& d, const std::string& key)
{
    for (const auto& [path, c] : d->childDictsUnnoted())
        if (path == key) return c;
    return nullptr;
}

void validateBody(const std::string& name, const DictPtr& b)
{
    const std::string here = "thermoPhysPropDict: variants." + name;
    for (const auto& k : b->keys())
    {
        if (derivationWord(k))
            throw std::runtime_error(here + ": `" + k + "` -- a variant derives"
                " DIRECTLY from this file's own system and from nothing else:"
                " one base, no chain (DEV.md 4c C398, RULED, point 1).  Write"
                " in this variant every block it changes, against the system"
                " at the top of the file; a variant never names another.");
        if (k == "components" || k == "recordType" || k == "schemaVersion"
            || k == "chemistry")
            throw std::runtime_error(here + ": `" + k + "` -- a variant"
                " changes how the system's properties are computed, never"
                " which components it holds (components stay the system's;"
                " the active chemistry lives in constant/chemistryDict).");
        if (!fragmentBlock(k))
            throw std::runtime_error(here + ": unknown key `" + k + "`.  A"
                " variant carries the system grammar's own blocks, only those"
                " it changes: equilibrium / caloric / volumetric / transport /"
                " pureFluids.");
    }
    if (const DictPtr t = childUnnoted(b, "transport"))
        transportGrammar::validate(t, here + ".transport");
}

} // namespace

bool selectsByName(const DictPtr& holder)
{
    if (!holder) return false;
    //  keys() first: `found` would note the key, and a holder's `thermo` is
    //  read by its own consumers.
    bool present = false;
    for (const auto& k : holder->keys()) if (k == "thermo") { present = true; break; }
    if (!present) return false;
    return std::holds_alternative<std::string>(holder->entryValue("thermo"));
}

DictPtr variantsBlock(const DictPtr& system) { return variantsUnnoted(system); }

std::vector<std::string> names(const DictPtr& system)
{
    std::vector<std::string> out;
    if (const DictPtr v = variantsUnnoted(system))
        for (const auto& k : v->keys()) out.push_back(k);
    return out;
}

void validate(const DictPtr& system)
{
    bool present = false;
    if (system)
        for (const auto& k : system->keys()) if (k == "variants") { present = true; break; }
    if (!present) return;
    const DictPtr v = variantsUnnoted(system);
    if (!v)
        throw std::runtime_error("thermoPhysPropDict: `variants` is a block of"
            " named variants -- `variants { <name> { ...the blocks it changes...;"
            " } }`.");
    std::vector<std::pair<std::string, DictPtr>> kids = v->childDictsUnnoted();
    for (const auto& k : v->keys())
    {
        DictPtr b;
        for (const auto& [path, d] : kids) if (path == k) { b = d; break; }
        if (!b)
            throw std::runtime_error("thermoPhysPropDict: variants." + k + " is"
                " not a block.  A variant is `" + k + " { <the blocks it"
                " changes> }`.");
        validateBody(k, b);
    }
}

DictPtr body(const DictPtr& system, const std::string& name,
             const std::string& who)
{
    const std::vector<std::string> declared = names(system);
    bool known = false;
    for (const auto& n : declared) if (n == name) { known = true; break; }
    if (!known)
    {
        std::string list;
        for (const auto& n : declared) list += (list.empty() ? "" : ", ") + n;
        //  NAME THE FILE (review row SA-05): a sector unit resolves against
        //  its SECTOR's dictionary, which may hold no variants while the
        //  case's root file does -- "its constant/thermoPhysPropDict
        //  declares no variants" was false for the root.  The sentence names
        //  the file read and says variants are not inherited.
        const std::string file = system->sourceName().empty()
            ? std::string("constant/thermoPhysPropDict") : system->sourceName();
        const bool sector = file != "constant/thermoPhysPropDict"
                         && file.find("sectors/") != std::string::npos;
        throw std::runtime_error(who + ": `thermo " + name + ";` names no"
            " variant of the property dictionary it resolves against ("
            + file + ") -- "
            + (declared.empty()
                ? std::string("that file declares no `variants {}` block.")
                : "the variants it declares are: " + list + ".")
            + (sector
                ? "  Variants are NOT inherited through `inherits`: a variant a"
                  " sector's units select is declared in the sector's own"
                  " dictionary."
                : "")
            + "  A unit or an operation selects a variant by the name it has"
              " under `variants {}` (or writes an inline `thermo { ... }`).");
    }
    validate(system);
    //  THE READ the audit counts as "used": subDict() notes the name.
    return system->subDict("variants")->subDict(name);
}

DictPtr fragmentOf(const DictPtr& system, const DictPtr& holder,
                   const std::string& who, std::string& name)
{
    name.clear();
    if (!holder || !holder->found("thermo")) return nullptr;
    if (selectsByName(holder))
    {
        name = holder->lookupWord("thermo");
        return body(system, name, who);
    }
    return holder->subDict("thermo");
}

DictPtr stampedFragment(const DictPtr& b, const std::string& name)
{
    auto out = std::make_shared<Dictionary>("thermo");
    out->insert(selectedKey(), name);         // first: the banner names it first
    for (const auto& k : b->keys()) out->insert(k, b->entryValue(k));
    return out;
}

} // namespace propertyVariants
} // namespace Choupo
