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

#include "Barth.H"

#include <cmath>

namespace Choupo {

void Barth::readParameters(const DictPtr& oper)
{
    alpha_ = oper->lookupScalarOrDefault("alpha", 1.5);
    hFac_  = oper->lookupScalarOrDefault("heightFactor", 2.0);
    beta_  = oper->lookupScalarOrDefault("beta", 4.0);
}

scalar Barth::cutDiameter(const CycloneContext& c) const
{
    constexpr scalar PI = 3.14159265358979;
    const scalar r_cs = c.Dc / 4.0;                 // vortex-finder radius
    const scalar D_cs = 2.0 * r_cs;                 // CS diameter
    const scalar H_cs = hFac_ * c.Dc;               // CS height
    const scalar v_r  = c.Q / (PI * D_cs * H_cs);   // radial velocity
    const scalar v_th = alpha_ * c.vi;              // tangential velocity
    return std::sqrt(18.0 * c.mu * v_r * r_cs / (c.rho_p * v_th * v_th));
}

scalar Barth::gradeEfficiency(scalar d, const CycloneContext& c) const
{
    const scalar d50 = cutDiameter(c);
    return 1.0 / (1.0 + std::pow(d50 / d, beta_));
}

} // namespace Choupo
