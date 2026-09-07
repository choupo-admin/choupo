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
    under the terms of the GNU General Public License as published by
    the Free Software Foundation, either version 3 of the Licence, or
    (at your option) any later version.

    SPDX-License-Identifier: GPL-3.0-or-later
    Credit and attribution: see AUTHORS ; Required legal notices: see NOTICE
\*---------------------------------------------------------------------------*/

#include "core/RegistryRefusal.H"
#include "core/DictAudit.H"

#include <algorithm>

namespace Choupo {
namespace registryRefusal {

std::string message(const std::string&              what,
                    const std::string&              asked,
                    const std::vector<std::string>& registered,
                    const std::string&              listLabel)
{
    std::string s = "unknown " + what + " '" + asked + "'.";

    if (registered.empty())
    {
        //  A registry with nothing in it is a WIRING fault, not the reader's
        //  mistake, and saying "Registered: (none)" without saying so sends a
        //  student hunting for a name that cannot exist.
        return s + "  Nothing is registered under this factory at all -- the"
                   " builtins were not installed, which is the program's"
                   " fault and not the case's.";
    }

    //  The closest registered name, by the SAME rule dictAudit uses for a
    //  mistyped key: a slip, never a different word.
    std::string  best;
    std::size_t  bestDist = std::string::npos;
    const std::size_t tol =
        std::min<std::size_t>(2, std::max<std::size_t>(1, asked.size() / 3));
    for (const auto& cand : registered)
    {
        const std::size_t d = dictAudit::editDistance(asked, cand);
        if (d <= tol && (bestDist == std::string::npos || d < bestDist))
        {
            bestDist = d;
            best     = cand;
        }
    }

    if (!best.empty()) s += "  Did you mean '" + best + "'?";

    s += "\n  " + listLabel + ":";
    for (const auto& k : registered) s += " " + k;
    s += "\n  The lookup is case-sensitive; copy one of the names above"
         " exactly.";
    return s;
}

} // namespace registryRefusal
} // namespace Choupo
