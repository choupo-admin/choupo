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
\*---------------------------------------------------------------------------*/

#include "CatalystPellet.H"

#include "core/Advisory.H"

#include <iostream>

namespace Choupo {

void announceUnresolvedPellet(const std::string& locus,
                              scalar             catalystLoading,
                              int                verbosity)
{
    //  No declared catalyst -> no pellet is claimed, so none is unresolved.
    //  An absence must go on meaning what it meant.
    if (!(catalystLoading > 0.0)) return;

    //  ONE string, used as both the advisory message and the log line -- the
    //  Advisory contract is that they are the same text, and two spellings of
    //  one sentence is the arity sin in prose.
    const std::string message =
        "catalystLoading declares a solid catalyst, but NO pellet is resolved:"
        " the rate is evaluated at bulk conditions, which is the effectiveness"
        " factor taken as eta = 1 (no intraparticle concentration gradient)."
        "  eta multiplies the rate, so where diffusion does limit it this"
        " answer is optimistic and a bed sized on it is undersized -- the"
        " first-order sphere eta = (1/phi)[1/tanh(3 phi) - 1/(3 phi)] is 0.1867"
        " at phi = 5.  Whether that is this case cannot be decided here: a"
        " Weisz-Prater check needs the pellet dimension and an effective"
        " diffusivity, and neither is declared.";

    const bool isNew = AdvisoryLog::instance().add("model", "info", locus, message);

    //  Gate the log line on the advisory being NEW so a unit whose setup runs
    //  once per sweep pass says this once, not once per pass.
    if (isNew && verbosity >= 2)
        std::cout << "  [pellet] " << locus << ": " << message << "\n";
}

} // namespace Choupo
