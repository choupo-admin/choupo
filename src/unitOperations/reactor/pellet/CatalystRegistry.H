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
    Choupo::CatalystRegistry

Description
    The `kind catalyst;` half of the flat assets home, loaded exactly the way
    `AdsorbentRegistry` loads the `kind adsorbent;` half: scan
    `data/standards/assets/`, then the nearest case-local `constant/assets/`
    OVER it (so a case record wins by name, announced by the ScanGuard), and
    filter on `kind`.

    THE STANDARDS CATALOGUE SHIPS NO CATALYST RECORD TODAY, and that is a
    deliberate curation position rather than an omission.  `data/standards/`
    is the frozen, committee-managed tree and every value in it is expected to
    carry a PRIMARY citation; the pellet porosity and tortuosity that would be
    needed are exactly the two numbers this author could not source.  So the
    reference case declares its pellet case-locally and labels it a TEACHING
    SURROGATE in the record itself.  Promoting a real, cited catalyst into
    `data/standards/assets/` is a curation act, and it needs no code change:
    the standards scan below already looks for it.

    A registry that finds nothing is therefore normal here, and `byName`
    reports that state honestly instead of implying the catalogue is broken.
\*---------------------------------------------------------------------------*/

#pragma once

#include "Catalyst.H"

#include <string>
#include <vector>

namespace Choupo {

class CatalystRegistry
{
public:
    //  Scan `<dataRoot>/standards/assets` then the nearest case-local
    //  `constant/assets`, keeping the `kind catalyst;` records.  Idempotent:
    //  re-loading the same paths is not an override (ScanGuard's rule).
    static void loadFrom(const std::string& dataRoot);

    //  The catalyst by name; throws naming what IS loaded (and saying so
    //  plainly when nothing is).
    static const Catalyst& byName(const std::string& name);

    static std::vector<std::string> availableNames();
};

} // namespace Choupo
