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

Description
    WHERE A FLOWSHEET MEMBER LIVES ON DISK, and how its dict is opened --
    the ONE home for the rule, read by the solver's flatten and by the
    model-boundary auditor.

    A composite lists its members by folder name (`sectors ( ... )`,
    `units ( ... )` as WORD lists).  A member is a UNIT operation or a
    SECTOR, never a generic "member": a dignified unit lives under
    `unitOperations/<name>/`, a real sector under `sectors/<name>/`; the bare
    `<name>/` layout (member folder at the domain root) is still read for
    cases not yet migrated.  The first location that actually carries a
    flowsheetDict wins.  Inside the member folder the dict is in one of two
    places, tried in this order: `<member>/flowsheetDict` (the LEAN layout)
    or `<member>/system/flowsheetDict` (kept for backwards-compat); if
    neither exists the member must be an inline block in the parent dict.

    Extracted 2026-09-03 from Flowsheet.cpp, where the rule was a `static`
    the model-boundary auditor could not reach -- so a unit reached through
    a folder was UNREADABLE to it, and esterification2sector's flash stood
    under a red UNEXPLAINED alarm with an 808 kW residual that was exactly
    the latent heat of its own declared per-unit thermo world.  An auditor
    may READ the same disk the solver reads; what it must not do is reuse
    the solver's arithmetic.  Paths are one rule with two readers, so they
    live here once.
\*---------------------------------------------------------------------------*/

#pragma once

#include "core/Dictionary.H"

#include <filesystem>
#include <stdexcept>
#include <string>

namespace Choupo {

/// The member's DIRECTORY (with trailing '/'), or the inline/legacy fallback
/// `<folderPath><member>/` when no folder carries a flowsheetDict.
inline std::string resolveMemberBase(const std::string& folderPath,
                                     const std::string& member)
{
    for (const std::string& cand : { folderPath + "unitOperations/" + member + "/",
                                     folderPath + "sectors/"        + member + "/",
                                     folderPath + member + "/" })
        if (std::filesystem::exists(cand + "system/flowsheetDict")
         || std::filesystem::exists(cand + "flowsheetDict"))
            return cand;
    return folderPath + member + "/";   // inline block / legacy fallback
}

/// Open the member's dict: its folder's flowsheetDict (lean, then system/),
/// else the parent's inline block of that name.  `memberBase` receives the
/// resolved directory.  Throws naming both paths tried when nothing is found.
/// THE VARIABLES SCOPE REACHES A MEMBER FOLDER (DEV.md 4c C66, 2026-10-12).
/// A member read from its OWN file is parsed on its own, so a `$name` in it
/// had nothing to resolve against: the plant's `variables {}` block lives in
/// the ROOT dict, and `Dictionary::fromFile` hands each file only the block
/// that file itself declares.  So a DesignSpec -- which writes
/// `variables.<name>` on a clone of the root -- could not reach a value in a
/// unit folder at all (C57: the green-ammonia beds had to be tuned by hand).
/// The rule, ONE home for both readers of a member: a member that declares
/// no `variables {}` of its own resolves its `$references` against its
/// PARENT's scope (which is the plant's, transitively), and the binding is
/// LIVE -- the parent's block is shared, never copied, so a driver's write
/// reaches the leaf exactly as it reaches an inline unit.  A member that
/// DOES declare its own block keeps it as its scope, and a name it shares
/// with an enclosing scope is REFUSED: an outer driver writing the plant's
/// `$x` would otherwise miss the member reading its own `$x`, in silence.
/// (Nothing else crosses: a member never sees its parent's other entries.)
inline void bindMemberVariables(const DictPtr&     cd,
                                const DictPtr&     parent,
                                const std::string& member,
                                const std::string& where)
{
    if (!cd || !parent || !parent->varsDict()) return;
    const DictPtr outer = parent->varsDict();
    if (cd->found("variables")
        && std::holds_alternative<DictPtr>(cd->entryValue("variables")))
    {
        const DictPtr own = cd->subDict("variables");
        for (const auto& k : own->keys())
            if (outer->found(k))
                throw std::runtime_error("Flowsheet: member '" + member + "' ("
                    + where + ") declares its own `variables { " + k
                    + " ...; }`, and an enclosing level declares `" + k
                    + "` too.  The member would read its OWN value while an"
                    " outer driver (designSpec, sweep, optimisation) writes"
                    " the enclosing one -- a manipulated variable that moves"
                    " nothing, in silence.  Declare `" + k + "` ONCE, at the"
                    " level that owns it (the plant's `variables {}`), and"
                    " delete it here: a member with no `variables {}` of its"
                    " own resolves its `$references` against the enclosing"
                    " level's.");
        return;                                   // its own scope, no collision
    }
    cd->propagateVarsDict(outer);
}

inline DictPtr readMemberDict(const DictPtr&     parent,
                              const std::string& folderPath,
                              const std::string& member,
                              std::string&       memberBase)
{
    memberBase = resolveMemberBase(folderPath, member);
    const std::string leanDict   = memberBase + "flowsheetDict";
    const std::string systemDict = memberBase + "system/flowsheetDict";
    for (const std::string& p : { leanDict, systemDict })
        if (std::filesystem::exists(p))
        {
            DictPtr cd = Dictionary::fromFile(p);
            bindMemberVariables(cd, parent, member, p);
            return cd;
        }
    if (parent && parent->found(member))      return parent->subDict(member);
    throw std::runtime_error("Flowsheet: member '" + member
        + "' has neither a folder (" + leanDict + " or " + systemDict
        + ") nor an inline block");
}

/// The NEAREST ancestor folder (the member's own included, at most six
/// levels up) that owns a `constant/parameters/` directory -- the base a
/// unit's pair records resolve from ("the data lives with the sector that
/// owns it").  Empty when none does.  The flatten hands this to the unit as
/// `binaryPairsBase`; the model-boundary auditor must assemble the unit's
/// world from the SAME base or it prices a different pair (2026-09-03:
/// esterification2sector's sector-owned ethylAcetate-water record was the
/// whole of a 7.74 kW "unexplained" remainder).
inline std::string nearestPairBase(const std::string& memberFolder)
{
    std::filesystem::path node(memberFolder);
    for (int up = 0; up < 6; ++up)
    {
        if (std::filesystem::exists(node / "constant" / "parameters"))
            return node.string();
        if (!node.has_parent_path() || node.parent_path() == node) break;
        node = node.parent_path();
    }
    return "";
}

} // namespace Choupo
