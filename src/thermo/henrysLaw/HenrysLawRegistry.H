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
    Choupo::HenrysLawRegistry

Description
    Singleton lookup for HenrysLaw records, keyed by the ordered pair
    (solute, solvent).  Files matching
    `data/standards/parameters/Henry/<solute>-<solvent>.dat` are loaded once
    at start-up by the application's main().

    Same shape as MembraneRegistry / MaterialRegistry.
\*---------------------------------------------------------------------------*/

#pragma once

#include "HenrysLaw.H"

#include <string>
#include <vector>

namespace Choupo {

class HenrysLawRegistry
{
public:
    static void loadFrom(const std::string& dataRoot);

    // True iff a HenrysLaw entry exists for (solute, solvent).
    static bool has(const std::string& solute, const std::string& solvent);

    // Lookup; throws if absent.
    static const HenrysLaw& byPair(const std::string& solute,
                                   const std::string& solvent);

    // "<solute>-<solvent>" labels currently loaded.
    static std::vector<std::string> availableNames();
};

} // namespace Choupo
