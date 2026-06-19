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

#include "ChungViscosity.H"
#include "thermo/Component.H"

#include <cmath>

namespace Choupo {

scalar ChungViscosity::viscosityGasPure(const Component& c, scalar T) const
{
    const scalar M  = c.MW();        // g/mol  (= kg/kmol numerically)
    const scalar Tc = c.Tc();        // K
    const scalar Pc = c.Pc();        // bar
    const scalar w  = c.omega();

    // Critical volume from Zc(omega): Vc = Zc R Tc / Pc  [cm^3/mol].
    const scalar Zc        = 0.2918 - 0.0928 * w;
    const scalar R_cm3_bar = 83.14;                 // cm^3·bar/(mol·K)
    const scalar Vc        = Zc * R_cm3_bar * Tc / Pc;

    // Neufeld collision integral.
    const scalar Tstar = 1.2593 * T / Tc;
    const scalar Omega = 1.16145 / std::pow(Tstar, 0.14874)
                       + 0.52487 / std::exp(0.77320 * Tstar)
                       + 2.16178 / std::exp(2.43787 * Tstar);

    const scalar Fc = 1.0 - 0.2756 * w;             // non-polar

    // Chung low-pressure gas viscosity in micropoise, then -> Pa·s.
    const scalar eta_uP = 40.785 * Fc * std::sqrt(M * T)
                        / (std::pow(Vc, 2.0 / 3.0) * Omega);
    return eta_uP * 1.0e-7;                          // 1 μP = 1e-7 Pa·s
}

} // namespace Choupo
