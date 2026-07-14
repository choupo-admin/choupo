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
Class
    Choupo::UtilityCatalogue

Description
    Singleton-style lookup for Utility records.  Files matching
    data/standards/utilities/<name>.dat are loaded after `loadFrom(root)`
    is invoked (typically by the main application at start-up), the same
    pattern as MaterialRegistry and MembraneRegistry.
\*---------------------------------------------------------------------------*/

#pragma once

#include "Utility.H"

#include <string>
#include <vector>

namespace Choupo {

class UtilityCatalogue
{
public:
    // Populate the catalogue from data/standards/utilities/ relative to
    // `dataRoot`.  Safe to call multiple times; subsequent calls add.
    static void loadFrom(const std::string& dataRoot);

    // Look up a utility by name.  Throws std::runtime_error if unknown,
    // with a list of available names in the error message.
    static const Utility& byName(const std::string& name);

    // True if a utility of this name has been loaded.
    static bool has(const std::string& name);

    static std::vector<std::string> availableNames();

    // The ONE allocation rule (moved from the steady utilityAllocation
    // report so the batch campaign pass speaks the same policy): the
    // lowest-grade catalogue utility that can serve a duty of the given
    // sign at process temperature T -- tightest feasible margin wins
    // (heating needs T_in >= T + dTmin; cooling needs T_in <= T - dTmin).
    // Returns nullptr when no catalogue utility is adequate (the caller
    // reports "(none adequate)", never silently drops the duty).
    static const Utility* pickForDuty(bool heating, scalar T, scalar dTmin);
};

} // namespace Choupo
