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

#include "IoziaLeith.H"

#include <cmath>

namespace Choupo {

void IoziaLeith::readParameters(const DictPtr& oper)
{
    beta_ = oper->lookupScalarOrDefault("beta", 3.5);
}

// Iozia & Leith (1989), Aerosol Sci. Technol. 10:491 -- the flow-pattern
// (static-particle) cut diameter.  d50 from the balance of centrifugal and
// inward-drag forces at the core (their eq 4), fed by three regressed flow-
// pattern quantities (eqs 5-7) in the cyclone's OWN geometry.
//   NOTE on the eq-5 prefactor: the printed 1989 coefficient 6.1 yields a
//   Vt_max ~400 m/s (supersonic) for the Stairmand geometry, contradicting the
//   paper's OWN Figure 4 (Vt_max <= ~40 m/s) by a clean factor of 10 -- a
//   decimal-point typo.  We use the Figure-4-consistent 0.61 (forum-ratified
//   2026-07-04), which restores the physical magnitude and keeps the printed
//   (physically-correct) exponent signs; validated vs Dirgo-Leith (1985).
scalar IoziaLeith::cutDiameter(const CycloneContext& c) const
{
    constexpr scalar PI = 3.14159265358979;
    const scalar D    = c.Dc;
    const scalar Vi   = c.Q / (c.a * c.b);        // inlet velocity Q/(ab)
    const scalar abD2 = (c.a * c.b) / (D * D);
    const scalar DeD  = c.De / D;
    const scalar HD   = c.H  / D;
    const scalar Vtmax = 0.61 * Vi * std::pow(abD2, -0.61)
                       * std::pow(DeD, -0.74) * std::pow(HD, -0.33);   // eq 5*
    const scalar dc = 0.52 * D * std::pow(abD2, -0.25) * std::pow(DeD, 1.53); // eq 6
    scalar zc = c.H - c.S;                                             // eq 7
    if (dc > c.B && c.B > 0.0 && D > c.B)
        zc = (c.H - c.S) - ((c.H - c.h) / (D / c.B - 1.0)) * (dc / c.B - 1.0);
    if (zc <= 0.0) zc = c.H - c.S;
    return std::sqrt(9.0 * c.mu * c.Q / (PI * zc * c.rho_p * Vtmax * Vtmax)); // eq 4
}

scalar IoziaLeith::gradeEfficiency(scalar d, const CycloneContext& c) const
{
    const scalar d50 = cutDiameter(c);
    return 1.0 / (1.0 + std::pow(d50 / d, beta_));
}

} // namespace Choupo
