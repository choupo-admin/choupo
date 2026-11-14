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
    src/unitOperations/flowsheet/VariantSelection.H

Description
    A UNIT SELECTS A NAMED VARIANT: `thermo <name>;` in a unit's block of
    system/flowsheetDict (DEV.md 4c C398, RULED, point 1).  At wiring time
    the word is replaced by the variant's body, stamped with its name
    (PropertyVariants.H, stampedFragment), so every reader downstream --
    thermoFor, the run banner, the per-node pair plumbing, the energy
    report's model-boundary auditor -- sees the fragment it has always seen.
    The name is resolved against the dictionary of the unit's NODE: the
    nearest `constant/thermoPhysPropDict` above the unit's folder (the case
    root's for a flat case; a sector's own for a unit inside a sector,
    since a sector keeps its own dictionary and its own variants, ruling
    point 3).
\*---------------------------------------------------------------------------*/

#pragma once

#include "core/DictAudit.H"
#include "core/Dictionary.H"
#include "thermo/PropertyContext.H"
#include "thermo/PropertyVariants.H"

#include <filesystem>
#include <map>
#include <set>
#include <stdexcept>
#include <string>
#include <system_error>

namespace Choupo {
namespace flowsheetVariants {

//  THE PROPERTY CONTEXTS A RUN USES, besides the root system: each sector
//  dictionary a unit resolves against (its `constant/` directory, by
//  canonical path), and -- once a unit selected one of its variants by name
//  -- the resolved system that variant was read from.  Process-wide, like
//  the other per-run logs: what the view prints once and what the
//  unread-key audit walks after the run.
struct ContextRegistry
{
    std::map<std::string, DictPtr> resolved;   // canonical constant/ -> the system variants were read from
    std::set<std::string>          used;       // canonical constant/ of every sector context a unit took
};
inline ContextRegistry& contexts()
{
    static ContextRegistry r;
    return r;
}

inline std::string canonicalDir(const std::string& constantDir)
{
    std::error_code ec;
    const auto c = std::filesystem::weakly_canonical(constantDir, ec);
    return ec ? constantDir : c.string();
}

//  True when `constantDir/thermoPhysPropDict` is the file `rootSystem` was
//  read from.
inline bool isRootContext(const std::string& constantDir, const DictPtr& rootSystem)
{
    std::error_code ec;
    return rootSystem && !rootSystem->sourceName().empty()
        && std::filesystem::equivalent(constantDir + "/thermoPhysPropDict",
                                       rootSystem->sourceName(), ec);
}

//  The system a unit whose folder is `memberDir` (no trailing slash; "" for
//  an inline unit of the root) resolves its variant names against.  The
//  case root's dictionary is `rootSystem`, the object the run already
//  holds, so the unread-key audit sees the read; a sector's is resolved
//  through its `inherits` chain ONCE per run and kept (contexts()), so the
//  audit after the run sees the reads its variants received.
inline DictPtr nodeSystem(std::string memberDir, const DictPtr& rootSystem)
{
    namespace fs = std::filesystem;
    for (int up = 0; up < 8 && !memberDir.empty(); ++up)
    {
        const std::string p = memberDir + "/constant/thermoPhysPropDict";
        if (fs::exists(p))
        {
            if (isRootContext(memberDir + "/constant", rootSystem)) return rootSystem;
            DictPtr& r = contexts().resolved[canonicalDir(memberDir + "/constant")];
            if (!r)
            {
                std::set<std::string> visited;
                r = resolvePropertyContext(memberDir + "/constant", visited);
            }
            return r;
        }
        const auto slash = memberDir.rfind('/');
        if (slash == std::string::npos) break;
        memberDir = memberDir.substr(0, slash);
    }
    return rootSystem;
}

//  Replace unit `u`'s `thermo <name>;` by the named variant's stamped body.
//  No-op for a unit with an inline `thermo {}` or none.
inline void resolve(const DictPtr& u, const DictPtr& system, const std::string& uname)
{
    if (!propertyVariants::selectsByName(u)) return;
    const std::string name = u->lookupWord("thermo");
    if (!system)
        throw std::runtime_error("unit '" + uname + "': `thermo " + name + ";`"
            " selects a variant, but no constant/thermoPhysPropDict is in reach"
            " to declare it.");
    u->insert("thermo", EntryValue(propertyVariants::stampedFragment(
        propertyVariants::body(system, name, "unit '" + uname + "'"), name)));
}

//  THE UNREAD-KEY AUDIT OF EVERY SECTOR DICTIONARY'S `variants {}` the run
//  used (the root's is audited by the binary).  A sector whose variants no
//  unit selected by name was never resolved here: its file as written is
//  audited, so each of its variants is announced as never read -- which is
//  what happened.
inline void auditSectorVariants(int verbosity)
{
    std::set<std::string> all = contexts().used;
    for (const auto& kv : contexts().resolved) all.insert(kv.first);
    for (const auto& dir : all)
    {
        DictPtr sys;
        const auto it = contexts().resolved.find(dir);
        if (it != contexts().resolved.end()) sys = it->second;
        else if (std::filesystem::exists(dir + "/thermoPhysPropDict"))
            sys = Dictionary::fromFile(dir + "/thermoPhysPropDict");
        if (!sys) continue;
        std::error_code ec;
        const std::string rel = std::filesystem::relative(dir, ec).string();
        if (const DictPtr vb = propertyVariants::variantsBlock(sys))
            dictAudit::report(dictAudit::auditTree(*vb,
                (ec || rel.empty() ? dir : rel) + "/thermoPhysPropDict variants"), verbosity);
    }
}

} // namespace flowsheetVariants
} // namespace Choupo
