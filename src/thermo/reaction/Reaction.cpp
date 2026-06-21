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
\*---------------------------------------------------------------------------*/

#include "Reaction.H"

#include "core/Constants.H"
#include "thermo/ThermoPackage.H"
#include "thermo/Component.H"

#include <cmath>

namespace Choupo
{

scalar Reaction::arrheniusRate(scalar A, scalar Ea, scalar T)
{
    return A * std::exp(-Ea / (constant::R * T));
}

// dG_rxn(T) = Σ_i ν_i · g_pure_ig_i(T)  -- standard-state (1 bar) Gibbs energy
// of reaction, then Kp(T) = exp(−dG/RT).
//
// NOTE: this returns Kp, the standard-state (pressure-basis) constant.  The
// reverse rate needs the CONCENTRATION-basis Kc = Kp·(c°)^{Σν}; that factor is
// applied in a follow-up commit.  Kept Kp-only here so the extraction is
// numerically identical to the previous inline code.

scalar Reaction::equilibriumKc(const ThermoPackage&            thermo,
                               const std::vector<std::size_t>& comps,
                               const sVector&                  nu,
                               scalar                          T)
{
    scalar dG = 0.0;
    for (std::size_t s = 0; s < comps.size(); ++s)
        dG += nu[s] * thermo.comp(comps[s]).g_pure_ig(T);
    return std::exp(-dG / (constant::R * T));
}

scalar Reaction::equilibriumKc(const ThermoPackage& thermo,
                               const sVector&       nu,
                               scalar               T)
{
    scalar dG = 0.0;
    for (std::size_t i = 0; i < nu.size(); ++i)
        if (nu[i] != 0.0)
            dG += nu[i] * thermo.comp(i).g_pure_ig(T);
    return std::exp(-dG / (constant::R * T));
}

} // namespace Choupo
