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

#include <filesystem>
#include <iostream>
#include <set>
#include <string>

namespace Choupo {

// Recursive dict merge for property-context inheritance (doctrine s48): OVER wins
// over BASE.  A sub-dict merges recursively; a scalar/word/list is REPLACED (never
// appended).  A shadowed leaf is announced (glass-box, loud).
inline DictPtr mergePropertyDicts(const DictPtr& base, const DictPtr& over,
                                  const std::string& ctx)
{
    auto out = std::make_shared<Dictionary>(base->name());
    for (const auto& k : base->keys()) out->insert(k, base->entryValue(k));
    for (const auto& k : over->keys())
    {
        const bool bothDict = out->found(k)
            && std::holds_alternative<DictPtr>(out->entryValue(k))
            && std::holds_alternative<DictPtr>(over->entryValue(k));
        if (bothDict)
        {
            out->insert(k, EntryValue(mergePropertyDicts(
                std::get<DictPtr>(out->entryValue(k)),
                std::get<DictPtr>(over->entryValue(k)), ctx + "." + k)));
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
// parent propertyDict (its own inherits resolved first) is the base, the local
// declaration overrides.  Linear chain, cycle-detected, no filesystem crawling
// (the parent is named explicitly).  The returned dict carries NO `inherits` key.
inline DictPtr resolvePropertyContext(const std::string&      constantDir,
                                      std::set<std::string>&  visited)
{
    namespace fs = std::filesystem;
    const std::string path  = constantDir + "/propertyDict";
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

    auto localClean = std::make_shared<Dictionary>(local->name());
    for (const auto& k : local->keys())
        if (k != "inherits") localClean->insert(k, local->entryValue(k));
    return mergePropertyDicts(parent, localClean, "propertyDict");
}

} // namespace Choupo
