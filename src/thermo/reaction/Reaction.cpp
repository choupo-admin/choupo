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

// Concentration-basis correction.  Kp = exp(−dG/RT) is the standard-state
// (1 bar) pressure-basis constant; the reverse rate k_rev = k_fwd/Kc needs the
// CONCENTRATION-basis Kc.  For an ideal gas Kc = Kp·(P°/(R_u T))^{Σν}, where
// c° = P°/(R_u T) is the standard concentration in kmol/m³ (R_u = 1000·R, so c°
// matches the reactor concentrations c = n/V or F/Q in kmol/m³).  Σν = 0 → 1.
static scalar concentrationFactor(scalar sumNu, scalar T)
{
    if (sumNu == 0.0) return 1.0;          // byte-identical to the old Kp basis
    const scalar cStd = constant::Pref / (1000.0 * constant::R * T);
    return std::pow(cStd, sumNu);
}

scalar Reaction::equilibriumKc(const ThermoPackage&            thermo,
                               const std::vector<std::size_t>& comps,
                               const sVector&                  nu,
                               scalar                          T)
{
    scalar dG    = 0.0;
    scalar sumNu = 0.0;
    for (std::size_t s = 0; s < comps.size(); ++s)
    {
        dG    += nu[s] * thermo.comp(comps[s]).g_pure_ig(T);
        sumNu += nu[s];
    }
    return std::exp(-dG / (constant::R * T)) * concentrationFactor(sumNu, T);
}

scalar Reaction::equilibriumKc(const ThermoPackage& thermo,
                               const sVector&       nu,
                               scalar               T)
{
    return equilibrium(thermo, nu, T).Kc;
}

Reaction::Equilibrium Reaction::equilibrium(const ThermoPackage& thermo,
                                            const sVector&       nu,
                                            scalar               T)
{
    scalar dG    = 0.0;
    scalar sumNu = 0.0;
    for (std::size_t i = 0; i < nu.size(); ++i)
        if (nu[i] != 0.0)
        {
            dG    += nu[i] * thermo.comp(i).g_pure_ig(T);
            sumNu += nu[i];
        }
    const scalar Kp = std::exp(-dG / (constant::R * T));
    return { Kp, sumNu, Kp * concentrationFactor(sumNu, T) };
}

} // namespace Choupo
