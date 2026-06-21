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

scalar Reaction::modifiedArrheniusRate(scalar A, scalar b, scalar Ea, scalar T)
{
    // A·T^b·exp(−Ea/RT).  b == 0 returns exactly arrheniusRate (no pow call,
    // so a plain-Arrhenius reaction is bit-for-bit unchanged).
    if (b == 0.0) return A * std::exp(-Ea / (constant::R * T));
    return A * std::pow(T, b) * std::exp(-Ea / (constant::R * T));
}

scalar Reaction::thirdBodyConcentration(const sVector& conc,
                                        const sVector& efficiencies)
{
    scalar M = 0.0;
    for (std::size_t j = 0; j < conc.size(); ++j)
    {
        const scalar eff = (j < efficiencies.size()) ? efficiencies[j] : 1.0;
        M += eff * conc[j];
    }
    return M;
}

scalar Reaction::falloffRate(scalar kLow, scalar kInf, scalar M, scalar T,
                             const sVector& troe)
{
    // Reduced pressure and the Lindemann blend.
    if (kInf <= 0.0) return 0.0;
    const scalar Pr = kLow * M / kInf;
    const scalar lindemann = kInf * Pr / (1.0 + Pr);

    if (troe.size() < 3) return lindemann;          // Lindemann (F = 1)

    // Troe broadening factor Fcent and its blending with the reduced pressure.
    const scalar alpha = troe[0];
    const scalar T3    = troe[1];   // "T***"
    const scalar T1    = troe[2];   // "T*"
    scalar Fcent = (1.0 - alpha) * std::exp(-T / T3) + alpha * std::exp(-T / T1);
    if (troe.size() >= 4)
    {
        const scalar T2 = troe[3];  // "T**"
        Fcent += std::exp(-T2 / T);
    }
    if (Fcent <= 0.0) return lindemann;

    const scalar logFcent = std::log10(Fcent);
    const scalar c   = -0.4 - 0.67 * logFcent;
    const scalar nT  =  0.75 - 1.27 * logFcent;
    const scalar dT  =  0.14;
    const scalar logPr = std::log10(std::max(Pr, 1.0e-300));
    const scalar x   = (logPr + c) / (nT - dT * (logPr + c));
    const scalar logF = logFcent / (1.0 + x * x);
    const scalar F   = std::pow(10.0, logF);
    return lindemann * F;
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
