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
Namespace
    Choupo::ergun

Description
    THE ERGUN EQUATION, IN ONE PLACE (DEV.md 4c C454, the correlations half).

        -dP/dz = A u + B u^2,
        A = 150 (1 - eps)^2 mu / (eps^3 d_p^2),
        B = 1.75 (1 - eps) rho / (eps^3 d_p),

    with u the SUPERFICIAL velocity, eps the bed voidage and d_p the
    particle's equivalent (sphere) diameter -- the caller multiplies by its
    sphericity when it declares one.  Ergun, S., "Fluid flow through packed
    columns", Chem. Eng. Prog. 48 (1952) 89-94.

    WHY IT IS HERE.  The same two lines were written three times -- twice in
    the `pfr` (its drop and its regime KPIs) and once in the fixed-bed
    adsorber's face velocity -- and the 2026-11-19 outside census of the
    correlations (docs/reviews/2026-11-19-units-correlations-edutools/
    correlations.md) found it as one of five second homes.  Three copies of a
    correlation are three places a coefficient can be changed alone.

    WHAT THIS IS NOT, said plainly.  No validity window is declared: the
    range of Ergun's data was not read from the 1952 paper here, and a window
    typed from memory would be a citation invented (the friction family's
    windows were read from their sources).  No `verify()` anchor is wired to
    a bench: `coefficients()` is held only by the goldens of the cases that
    call it (the pfr Ergun witnesses and the fixed-bed adsorbers).  Both are
    the next step of the correlation-object campaign, not done in this slice.
\*---------------------------------------------------------------------------*/

#ifndef Choupo_ErgunEquation_H
#define Choupo_ErgunEquation_H

#include "core/Types.H"

namespace Choupo
{
namespace ergun
{

//  The two coefficients of -dP/dz = viscous u + inertial u^2 (superficial u).
struct Coefficients
{
    scalar viscous  = 0.0;   // A, Pa s / m^2
    scalar inertial = 0.0;   // B, Pa s^2 / m^3
};

//  eps: voidage [-]; dp: equivalent particle diameter [m]; mu: fluid
//  viscosity [Pa s]; rho: fluid density [kg/m^3].
Coefficients coefficients(scalar eps, scalar dp, scalar mu, scalar rho);

//  The source the coefficients 150 and 1.75 are Ergun's from.
const char* citation();

} // namespace ergun
} // namespace Choupo

#endif
