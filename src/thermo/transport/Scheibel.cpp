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

#include "Scheibel.H"
#include "thermo/Component.H"

#include <cmath>
#include <stdexcept>

namespace Choupo {

scalar Scheibel::diffusivityLiquidBinary(const Component& solute,
                                         const Component& solvent,
                                         scalar T,
                                         scalar muSolvent_PaS) const
{
    const scalar etaB   = muSolvent_PaS * 1.0e3;            // Pa·s -> cP
    const scalar Va_m3  = solute.Vliq();                    // m³/mol
    const scalar Vb_m3  = solvent.Vliq();                   // m³/mol
    if (Va_m3 <= 0.0 || Vb_m3 <= 0.0)
        throw std::runtime_error("Scheibel: solute '" + solute.name()
            + "' or solvent '" + solvent.name() + "' has no Vliq in its.dat.");
    if (etaB <= 0.0)
        throw std::runtime_error("Scheibel: non-positive solvent viscosity.");
    const scalar Va = Va_m3 * 1.0e6;                        // cm³/mol
    const scalar Vb = Vb_m3 * 1.0e6;                        // cm³/mol

    const scalar K = 8.2e-8 * (1.0 + std::pow(3.0 * Vb / Va, 2.0 / 3.0));
    const scalar D_cm2 = K * T / (etaB * std::cbrt(Va));    // cm²/s
    return D_cm2 * 1.0e-4;                                  // m²/s
}

} // namespace Choupo
