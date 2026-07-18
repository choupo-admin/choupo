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
    src/thermo/PropertyContext.H

Description
    The `inherits` property-context resolver (ChatGPT-doctrine F2).  A
    `constant/propertyDict` may carry `inherits "<rel-to-parent-constant>";`;
    the parent context is the base and the local declaration overrides.  The
    chain is linear, cycle-detected, and loud on shadowing -- never filesystem
    crawling (the parent is named explicitly).  Shared by the case-level loader
    (choupoSolve/main.cpp) and the per-unit override (Flowsheet::thermoFor).
\*---------------------------------------------------------------------------*/

#pragma once

#include "core/Dictionary.H"
#include "thermo/ChemistrySystem.H"

#include <filesystem>
#include <iostream>
#include <set>
#include <string>

namespace Choupo {

// Recursive dict merge for property-context inheritance (doctrine s48): OVER wins
// over BASE.  A sub-dict merges recursively; a scalar/word/list is REPLACED (never
// appended).  A shadowed leaf is announced (glass-box, loud).
//
// G7 (Codex-ratified 2026-07-18): in a v2 chain the PHYSICAL blocks are
// ATOMIC -- a child declaring `equilibrium` (or aqueousProperties / caloric /
// transport / pureFluids) states a WHOLE formulation; recursively merging two
// different formulations would interleave their phase blocks into non-physics
// (a gammaPhi `liquid` orphaned beside an electrolyte `aqueous`).  The child
// block REPLACES the parent's, announced as a shadow.  v1 chains keep the
// recursive semantics byte-identically (their propertyMethods leaves are
// scalars -- the shadow announce already covered them).
inline bool v2AtomicBlock(const std::string& k)
{
    return k == "equilibrium" || k == "aqueousProperties" || k == "caloric"
        || k == "transport" || k == "pureFluids";
}

inline DictPtr mergePropertyDicts(const DictPtr& base, const DictPtr& over,
                                  const std::string& ctx,
                                  bool v2Chain = false)
{
    auto out = std::make_shared<Dictionary>(base->name());
    for (const auto& k : base->keys()) out->insert(k, base->entryValue(k));
    for (const auto& k : over->keys())
    {
        if (v2Chain && v2AtomicBlock(k))
        {
            if (out->found(k))
                std::cerr << "[inherits] " << ctx << "." << k
                          << " shadowed by local property context"
                             " (v2 physical block, replaced whole)\n";
            out->insert(k, over->entryValue(k));
            continue;
        }
        const bool bothDict = out->found(k)
            && std::holds_alternative<DictPtr>(out->entryValue(k))
            && std::holds_alternative<DictPtr>(over->entryValue(k));
        if (bothDict)
        {
            out->insert(k, EntryValue(mergePropertyDicts(
                std::get<DictPtr>(out->entryValue(k)),
                std::get<DictPtr>(over->entryValue(k)), ctx + "." + k,
                v2Chain)));
        }
        else
        {
            if (out->found(k))
                std::cerr << "[inherits] " << ctx << "." << k
                          << " shadowed by local property context\n";
            out->insert(k, over->entryValue(k));
        }
    }
    return out;
}

// Resolve a property context's `inherits "<rel-to-parent-constant>"` chain: the
// parent dict (its own inherits resolved first) is the base, the local
// declaration overrides.  Linear chain, cycle-detected, no filesystem crawling
// (the parent is named explicitly).  The returned dict carries NO `inherits` key.
//
// G7 (Codex-ratified 2026-07-18): each constant/ resolves thermoPhysPropDict
// (v2) FIRST, then propertyDict (v1).  The merge runs on the AUTHORED form --
// a v2 chain deep-merges v2 dicts (local contexts are deliberately PARTIAL,
// so translation happens ONCE, at the caller, on the completed system, never
// per child).  A MIXED chain (v2 child inheriting a v1 parent or vice versa)
// refuses loudly: migrate the whole chain atomically.
inline bool isV2System(const DictPtr& d)
{
    return d->lookupWordOrDefault("recordType", "")
           == "thermophysicalPropertySystem";
}

inline DictPtr resolvePropertyContext(const std::string&      constantDir,
                                      std::set<std::string>&  visited)
{
    namespace fs = std::filesystem;
    std::string path = constantDir + "/thermoPhysPropDict";
    if (!fs::exists(path) && fs::exists(constantDir + "/propertyDict"))
        throw std::runtime_error(
            "the v1 `constant/propertyDict` grammar is RETIRED (the 2026-07-18"
                " consolidation): this case still carries one.  Migrate it --"
                " bin/curate/migrate_thermoPhysProp.py (mechanical, golden-safe)"
                " -- then re-run.");
    const std::string canon = fs::weakly_canonical(path).string();
    if (!visited.insert(canon).second)
        throw std::runtime_error("Choupo: property-context `inherits` CYCLE at "
                                 + path);
    DictPtr local = Dictionary::fromFile(path);
    if (!local->found("inherits")) return local;

    const std::string rel = local->lookupWord("inherits");
    const std::string parentDir =
        fs::weakly_canonical(fs::path(constantDir) / rel).string();
    DictPtr parent = resolvePropertyContext(parentDir, visited);

    if (isV2System(local) != isV2System(parent))
        throw std::runtime_error("Choupo: MIXED property-context chain at "
            + path + " -- a " + (isV2System(local) ? "v2" : "v1")
            + " context inherits a " + (isV2System(parent) ? "v2" : "v1")
            + " parent.  Migrate the whole `inherits` chain atomically"
              " (one grammar per chain, never a silent hybrid).");

    auto localClean = std::make_shared<Dictionary>(local->name());
    for (const auto& k : local->keys())
        if (k != "inherits") localClean->insert(k, local->entryValue(k));
    return mergePropertyDicts(parent, localClean, "propertyDict",
                              isV2System(parent));
}

// Resolve the case's ACTIVE-CHEMISTRY SELECTION (`constant/chemistryDict`,
// ratified 2026-07-18) along the SAME `inherits` chain the property context
// walks: the NEAREST owner wins, replace-whole (a local chemistryDict
// eclipses the parent's -- no merge; chemistry selection is one fact).
// Absent everywhere -> an empty (present = false) system: chemistry is
// optional.
inline ChemistrySystem resolveChemistryContext(const std::string& constantDir,
                                               std::set<std::string>& visited)
{
    namespace fs = std::filesystem;
    const std::string path = constantDir + "/chemistryDict";
    const std::string canon = fs::weakly_canonical(path).string();
    if (!visited.insert(canon).second)
        throw std::runtime_error("Choupo: chemistry-context `inherits` CYCLE at "
                                 + path);
    if (fs::exists(path))
        return ChemistrySystem::fromDict(Dictionary::fromFile(path));

    // Follow the property context's OWN inherits pointer (the one chain).
    const std::string tp = constantDir + "/thermoPhysPropDict";
    if (fs::exists(tp))
    {
        auto local = Dictionary::fromFile(tp);
        if (local->found("inherits"))
        {
            const std::string rel = local->lookupWord("inherits");
            const std::string parentDir =
                fs::weakly_canonical(fs::path(constantDir) / rel).string();
            return resolveChemistryContext(parentDir, visited);
        }
    }
    return ChemistrySystem{};
}

inline ChemistrySystem resolveChemistryContext(const std::string& constantDir)
{
    std::set<std::string> visited;
    return resolveChemistryContext(constantDir, visited);
}

} // namespace Choupo
