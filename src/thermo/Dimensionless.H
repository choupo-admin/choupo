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
    Choupo::dimensionless

Description
    The canonical transport dimensionless groups, in ONE place, so that the
    mass-transfer (Sherwood) and heat-transfer (Nusselt) correlations are
    visibly built on the SAME Reynolds / Prandtl / Schmidt definitions ---
    the glass-box analogy a student should SEE.  Stateless inline functions,
    SI throughout.

        Re = ρ u d_h / μ          (inertia / viscous)
        Pr = cp μ / λ             (momentum / thermal diffusivity)
        Sc = μ / (ρ D)            (momentum / mass diffusivity)

    BASIS NOTE (Prandtl): cp here is MASS-SPECIFIC [J/(kg·K)] and λ is the
    thermal conductivity [W/(m·K)], so Pr = cp·μ/λ is dimensionless with μ in
    [Pa·s].  A molar cp must be divided by the molar mass before it enters
    here.  (Re and Sc carry no such ambiguity.)
\*---------------------------------------------------------------------------*/

#pragma once

#include "core/Types.H"

namespace Choupo {
namespace dimensionless {

// Reynolds number  Re = ρ u d_h / μ.  rho [kg/m³], u [m/s], d_h [m], mu [Pa·s].
inline scalar reynolds(scalar rho, scalar u, scalar d_h, scalar mu)
{
    return rho * u * d_h / mu;
}

// Prandtl number  Pr = cp μ / λ.  cp MASS-SPECIFIC [J/(kg·K)], mu [Pa·s],
// lambda [W/(m·K)].  (See the basis note above.)
inline scalar prandtl(scalar cp, scalar mu, scalar lambda)
{
    return cp * mu / lambda;
}

// Schmidt number  Sc = μ / (ρ D).  mu [Pa·s], rho [kg/m³], D [m²/s].
inline scalar schmidt(scalar mu, scalar rho, scalar D)
{
    return mu / (rho * D);
}

} // namespace dimensionless
} // namespace Choupo
