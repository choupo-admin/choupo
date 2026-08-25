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
    Choupo::membrane::BulkState / Choupo::membrane::toBulk

Description
    ONE home for the conversion a membrane unit makes before it can ask a
    transport model anything: moles -> volume -> concentrations, closed on
    the solution mass density.

    WHY IT IS HERE AND NOT INSIDE A UNIT.  It was written in an anonymous
    namespace inside `SpiralWoundModule.cpp`, which is where it stayed while
    it had one caller.  The batch diafilter is the second, and a shared
    concept filed inside a consumer is the defect this project has paid for
    repeatedly (`FlatUnit` inside `SimulationResult`, `UnitProfile` inside
    `core`, five upward edges in one layering audit).  The second caller is
    the moment to move it, not the moment to copy it.

    IT IS DIMENSIONALLY NEUTRAL, and that is what lets one function serve
    both callers.  Feed it a molar FLOW [kmol/s] and it returns a volumetric
    flow [m^3/s] with concentrations [kmol/m^3]; feed it a molar INVENTORY
    [kmol] and it returns a VOLUME [m^3] with the same concentrations.  The
    arithmetic does not know which, because a rate is an inventory per
    second and the seconds cancel in `amount / Q`.

    THE CLOSURE, which is the whole reason it is not two lines inline.
    `rho` is the SOLUTION mass density (constant -- the dilute-aqueous
    approximation).  The volume is the TRUE mass over rho,

        Q = (sum_i z_i * amount * MW_i) / rho

    so the reconstructed density `sum_i c_i * MW_i` equals rho EXACTLY and
    mass is conserved through the unit.  An earlier shortcut took Q with
    MW_avg ~ MW_water AND pinned the downstream water concentration to the
    PURE-water value rho/MW_water; the two together added the solute mass on
    top of a full pure-water mass and created ~1 % of spurious mass across
    an element.  Getting this wrong is not visibly wrong, which is why the
    derivation is written down beside the code rather than remembered.
\*---------------------------------------------------------------------------*/

#pragma once

#include "core/Types.H"

#include <cstddef>
#include <vector>

namespace Choupo {
namespace membrane {

struct BulkState
{
    scalar              Q;   // m^3/s from a flow, or m^3 from an inventory
    std::vector<scalar> c;   // kmol/m^3 per component (the same either way)
};

//  `amount`     kmol/s (a flow) or kmol (an inventory)
//  `z`          mole fractions, size >= Ncomp
//  `MW`         kg/kmol per component, size >= Ncomp
//  `rho_kgm3`   solution mass density [kg/m^3]
inline BulkState toBulk(scalar amount, const sVector& z, const sVector& MW,
                        scalar rho_kgm3, std::size_t Ncomp)
{
    scalar MW_avg = 0.0;
    for (std::size_t i = 0; i < Ncomp; ++i) MW_avg += z[i] * MW[i];
    const scalar Q = amount * MW_avg / rho_kgm3;
    BulkState s;
    s.Q = Q;
    s.c.assign(Ncomp, 0.0);
    for (std::size_t i = 0; i < Ncomp; ++i)
        s.c[i] = z[i] * amount / Q;
    return s;
}

} // namespace membrane
} // namespace Choupo
