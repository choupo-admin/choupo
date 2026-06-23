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

#include "SolutionPair.H"
#include "core/Dimensions.H"

#include <stdexcept>

namespace Choupo {

void SolutionPair::readFromDict(const DictPtr& d)
{
    solute_  = d->lookupWord("solute");
    solvent_ = d->lookupWord("solvent");

    // dHsoln / Cp are stored in Choupo's molar convention, which is J/mol
    // NUMERICALLY (Dims::molarEnergy / molarHeatCap; the "J/mol" alias has
    // factor 1.0 -- same units as Component::h_formation, so the two combine
    // directly on the aqueous rung).
    dHsoln_ = d->lookupScalar("dHsoln", Dims::molarEnergy);

    if (d->found("Cp"))
    {
        // Raw SI [J/(mol.K)] -- the molar-heat-capacity unit suffix carries a
        // `(` the dict tokenizer reads as a list, so the value is written raw
        // (unit in the .dat comment), exactly like ions.dat cpAq and every
        // component solid/liquid Cp coefficient.
        cpAq_    = d->lookupScalar("Cp");
        hasCpAq_ = true;
    }

    if (d->found("Trange"))
    {
        auto r = d->lookupList("Trange");
        if (r.size() == 2) { T_min_ = r[0]; T_max_ = r[1]; }
    }

    // Capture the primary citation for the glass-box origin line.
    if (d->found("dHsoln_provenance"))
        source_ = d->subDict("dHsoln_provenance")->lookupWordOrDefault("method", "");
}

} // namespace Choupo
