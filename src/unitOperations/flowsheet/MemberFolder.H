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
inline DictPtr readMemberDict(const DictPtr&     parent,
                              const std::string& folderPath,
                              const std::string& member,
                              std::string&       memberBase)
{
    memberBase = resolveMemberBase(folderPath, member);
    const std::string leanDict   = memberBase + "flowsheetDict";
    const std::string systemDict = memberBase + "system/flowsheetDict";
    if (std::filesystem::exists(leanDict))   return Dictionary::fromFile(leanDict);
    if (std::filesystem::exists(systemDict)) return Dictionary::fromFile(systemDict);
    if (parent && parent->found(member))      return parent->subDict(member);
    throw std::runtime_error("Flowsheet: member '" + member
        + "' has neither a folder (" + leanDict + " or " + systemDict
        + ") nor an inline block");
}

} // namespace Choupo
