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
    Choupo::solidEq::SolidEquilibriumService

Description
    The PHASE-EQUILIBRIUM-LAYER seam of the authorised solid-equilibrium
    migration (S2b; boundaries R1-R4, docs/design/solid-equilibrium-spike.md
    section 7).  Ruling R2, as code layout:

        DATA defines what a solid IS        (the provider's MineralEntry
                                             records, loaded from the
                                             curated tree / case overlay);
        the CASE declares whether it is
        ADMITTED                            (the `admitted` list -- the
                                             chemistryDict's solidPhases,
                                             or a speciate op's set);
        THIS SERVICE decides whether it is
        PRESENT                             (the common complementarity,
                                             solidEq::equilibrate).

    Provider/client: the SpeciationSolver prices speciation, activities and
    SI, and resolves the transfer stoichiometry onto the master balances
    (the S2a `sinksFor` surface -- ONE home for the chaining); the service
    owns presence, the ONE transfer, and the narration (appearance /
    redissolution ride AdvisoryLog and the caller's event list).

    Amounts are mol per kg water, the provider's own n_p basis.  Under
    given-pH the H legs stay folded exactly as the provider folds them --
    the solid moves master totals only, and the pinned pH absorbs the H
    side by assumption (the same claim the internal path makes).

    SCOPE, said plainly: this seam does not yet serve any unit operation --
    the internal equilibrate path is untouched and dies in S3, when this
    service becomes the engine's ONE mechanism for moving material from
    the fluid inventory into a solid phase.
\*---------------------------------------------------------------------------*/

#pragma once

#include "thermo/electrolyte/SpeciationSolver.H"
#include "thermo/solidEquilibrium/SolidEquilibrium.H"

#include <map>
#include <string>
#include <vector>

namespace Choupo {
namespace solidEq {

class SolidEquilibriumService
{
public:
    struct Outcome
    {
        std::map<std::string, double>  formed;   // mineral -> mol / kg water
        electrolyte::SpeciationResult  aqueous;  // converged aqueous state
        int                            outerIters = 0;
        std::vector<std::string>       events;   // the solver's narration
        //  the provider-resolved transfer stoichiometry each candidate ran
        //  on (S2a's surface) -- echoed so a caller (and the gate) can see
        //  the chaining that was actually consumed
        std::vector<electrolyte::MineralSinks> sinks;
    };

    //  Equilibrate the ADMITTED minerals against one aqueous state.  Refuses
    //  (via the provider's own resolution) an admitted name the data does
    //  not define, naming what is available.  `state` is taken by value:
    //  its totals are the fluid inventory the one ledger moves.
    static Outcome equilibrateMinerals(
        const electrolyte::SpeciationSolver& provider,
        electrolyte::SpeciationInput state,
        const std::vector<std::string>& admitted,
        int verbosity);
};

} // namespace solidEq
} // namespace Choupo
