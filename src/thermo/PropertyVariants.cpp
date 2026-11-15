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
        const bool sector = file != "constant/thermoPhysPropDict";
        throw std::runtime_error(who + ": `thermo " + name + ";` names no"
            " variant of the property dictionary it resolves against ("
            + file + ") -- "
            + (declared.empty()
                ? std::string("that file declares no `variants {}` block.")
                : "the variants it declares are: " + list + ".")
            + (sector
                ? "  Variants are NOT inherited through `inherits`: a unit"
                  " resolves against the dictionary of the sector that owns it"
                  " when that sector has a constant/thermoPhysPropDict of its"
                  " own, and against the case root's otherwise -- declare the"
                  " variant in the dictionary the unit resolves against."
                : "")
            + "  A unit or an operation selects a variant by the name it has"
              " under `variants {}`.");
    }
    validate(system);
    //  THE READ the audit counts as "used": subDict() notes the name.
    return system->subDict("variants")->subDict(name);
}

void refuseInlineFragment(const DictPtr& unit, const std::string& who)
{
    if (!unit || selectsByName(unit)) return;
    bool present = false;
    for (const auto& k : unit->keys()) if (k == "thermo") { present = true; break; }
    if (!present) return;
    //  The engine's own copy of a selected variant's body carries the stamp key,
    //  which begins with `@` and cannot be written in a dictionary: it is not an
    //  authored block.  EVERY other `thermo` that is not a word is refused,
    //  whatever it contains.
    const EntryValue& ev = unit->entryValue("thermo");
    if (std::holds_alternative<DictPtr>(ev))
        for (const auto& k : std::get<DictPtr>(ev)->keys()) if (k == selectedKey()) return;
    const bool list = !std::holds_alternative<DictPtr>(ev);
    throw std::runtime_error(who + ": " + (list
        ? std::string("`thermo ( ... );` is not a selector")
        : std::string("an inline `thermo { ... }` block in a unit is no longer read"
                      " (DEV.md 4c C402)"))
        + ".  A unit's own property world is a NAMED variant of the property"
        " dictionary it resolves against.  Write one word, `thermo <name>;`, and"
        " move the body of the old block into `variants {}` of the dictionary the"
        " unit reads: constant/thermoPhysPropDict of the sector that owns the unit"
        " when that sector has one of its own (variants are not inherited), the case"
        " root's otherwise:\n"
        "    // constant/thermoPhysPropDict\n"
        "    variants { <name> { <the blocks the old fragment carried> } }\n"
        "    // system/flowsheetDict (or the unit's own flowsheetDict)\n"
        "    thermo <name>;\n"
        "A variant states only what differs from the system, exactly as the"
        " fragment did.  See docs/ai/dict-syntax.md, \"Named variants\".");
}

void refuseNodeThermo(const DictPtr& node, const std::string& who)
{
    if (!node) return;
    for (const auto& k : node->keys())
        if (k == "thermo")
            throw std::runtime_error(who + ": a `thermo` key in a sector's (or a"
                " plant's) flowsheetDict is not read -- a sector's property world is"
                " its own constant/thermoPhysPropDict (`inherits` the plant's), and a"
                " unit selects a named variant of it with `thermo <name>;` in the"
                " unit's own block.  Delete the key, or move its body into `variants {}`"
                " and select it in the unit (DEV.md 4c C402).");
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
