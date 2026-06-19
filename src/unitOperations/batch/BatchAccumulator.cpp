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

#include "BatchAccumulator.H"
#include "streams/Composition.H"

namespace Choupo {

void BatchAccumulator::initialise(const DictPtr&        unitDict,
                                  const ThermoPackage&  thermo,
                                  const DictPtr&        /*reactionsDict*/)
{
    const std::size_t n = thermo.n();
    auto initDict = unitDict->subDict("initial");

    state_.T = initDict->lookupScalar("T");
    state_.P = initDict->lookupScalar("P");
    state_.V = initDict->lookupScalarOrDefault("V", 0.0);
    state_.n.assign(n, 0.0);

    // Empty by convention; a non-zero initial charge is also accepted.
    const scalar nTot = initDict->lookupScalarOrDefault("totalMoles", 0.0);
    if (nTot > 0.0)
    {
        const sVector x = readComposition(initDict, thermo, "BatchAccumulator '" + name_ + "' init");
        for (std::size_t i = 0; i < n; ++i) state_.n[i] = nTot * x[i];
    }
}

} // namespace Choupo
