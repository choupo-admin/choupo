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
Description
    The Ergun equation's two coefficients; see ErgunEquation.H.
\*---------------------------------------------------------------------------*/

#include "ErgunEquation.H"

namespace Choupo
{
namespace ergun
{

Coefficients coefficients(scalar eps, scalar dp, scalar mu, scalar rho)
{
    const scalar e3 = eps * eps * eps;
    Coefficients c;
    c.viscous  = 150.0 * (1.0 - eps) * (1.0 - eps) * mu / (e3 * dp * dp);
    c.inertial = 1.75 * (1.0 - eps) * rho / (e3 * dp);
    return c;
}

const char* citation()
{
    return "Ergun, S., Fluid flow through packed columns, "
           "Chem. Eng. Prog. 48 (1952) 89-94";
}

} // namespace ergun
} // namespace Choupo
