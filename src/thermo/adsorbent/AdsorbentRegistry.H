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
    Choupo::AdsorbentRegistry

Description
    Singleton lookup for Adsorbent records.  `loadFrom(root)` is invoked from
    the main application at start-up (explicit, beside the MembraneRegistry /
    MaterialRegistry calls --- no auto-registration); it (1) registers the
    IsothermModel builtins explicitly, (2) reads each identity file
    data/standards/assets/<name>.dat, and (3) attaches the per-species
    equilibrium records from the pair catalogue
    data/standards/parameters/adsorption/equilibria/<name>/<species>.dat
    (forum #106: equilibrium is pair data, never embedded in the material).

    `byName` also honours a case-local overlay: the nearest
    constant/adsorbents/<name>.dat walking UP from the cwd eclipses the
    standard entry whole (the same fractal cascade as membranes /
    components), announced loudly.  Its isotherms come from the case-local
    constant/parameters/adsorption/equilibria/<name>/ when present, else
    from the standards catalogue (announced).

    Same shape as MembraneRegistry (one registry per kind-of-thing).
\*---------------------------------------------------------------------------*/

#pragma once

#include "Adsorbent.H"

#include <string>
#include <vector>

namespace Choupo {

class AdsorbentRegistry
{
public:
    static void loadFrom(const std::string& dataRoot);

    static const Adsorbent& byName(const std::string& name);

    static std::vector<std::string> availableNames();
};

} // namespace Choupo
