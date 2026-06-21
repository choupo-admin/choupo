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
    Choupo::Reaction

    Shared kinetics + reaction-equilibrium helpers used by every reactor
    (BatchReactor, CSTR, PFR).  Before this class the Arrhenius coefficient
    and the reverse-rate equilibrium constant were copy-pasted inline in
    three places; gathering them here gives ONE audited home for the rate
    thermodynamics (and one place to grow modified-Arrhenius / third-body /
    fall-off later).

    THE EQUILIBRIUM CONSTANT, stated carefully (it was historically wrong):
      The reverse rate follows from detailed balance, k_rev = k_fwd / Kc,
      where Kc is the CONCENTRATION-basis equilibrium constant.  From the
      standard-state (1 bar) Gibbs energies,
            Kp(T) = exp( -Σν_i · g_pure_ig_i(T) / (R T) )        [dimensionless]
      and for an ideal gas the two bases are related by
            Kc(T) = Kp(T) · (P° / (R_u T))^{Σν}
      with P° = 1 bar and R_u the gas constant in J/(kmol·K) so that the
      standard concentration c° = P°/(R_u T) carries the same kmol/m³ units
      as the reactor concentrations c = n/V (or F/Q).  When Σν = 0 (e.g. the
      water-gas shift) the factor is 1 and Kc = Kp exactly.

    The product-of-concentrations rate law itself stays in each reactor: the
    three reactors carry their state differently (mole numbers n/V, molar
    flows F/Q, reaction extent ξ), so the loop that forms ∏ cⱼ^order is bound
    to that representation, while the thermodynamics here is identical.
\*---------------------------------------------------------------------------*/

#pragma once

#include "core/Types.H"

#include <cstddef>
#include <vector>

namespace Choupo
{

class ThermoPackage;

class Reaction
{
public:

    // -- Arrhenius forward coefficient:  k(T) = A · exp(−Ea / (R T)) --------
    //    A in the rate-law units, Ea in J/mol, T in K.
    static scalar arrheniusRate(scalar A, scalar Ea, scalar T);

    // -- Reaction equilibrium constant Kc(T) on a CONCENTRATION basis ------
    //    used as k_rev = k_fwd / Kc by detailed balance.  Two overloads that
    //    differ only in how the species are addressed (and so preserve each
    //    caller's exact summation order):
    //
    //    (a) compact form -- species listed in `comps`, signed coeffs `nu`
    //        in the SAME listing order (BatchReactor's stoichiometry order);
    static scalar equilibriumKc(const ThermoPackage&            thermo,
                                const std::vector<std::size_t>& comps,
                                const sVector&                  nu,
                                scalar                          T);

    //    (b) full-length form -- `nu` indexed by global component, zeros for
    //        species not in the reaction (CSTR / PFR layout).
    static scalar equilibriumKc(const ThermoPackage& thermo,
                                const sVector&       nu,
                                scalar               T);

    // -- The same computation, broken out for a glass-box report ----------
    //    Kp (pressure basis), Σν, and Kc = Kp·(P°/(R_u T))^Σν.
    struct Equilibrium { scalar Kp; scalar sumNu; scalar Kc; };
    static Equilibrium equilibrium(const ThermoPackage& thermo,
                                   const sVector&       nu,
                                   scalar               T);
};

} // namespace Choupo
