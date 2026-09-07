/*---------------------------------------------------------------------------*\
       \|/       C hemicals     | Open-source, glass-box chemical process simulator
      \\|//      H eat-transfer | https://choupo.org
     \\\|///     O perations    |
      \\|//      U nits         | Copyright (C) 2026 Vítor Geraldes
       \|/       P roperties    | Licence: GPL-3.0-or-later
        |        O ptimization  |
       /|\                      |
-------------------------------------------------------------------------------
    SPDX-License-Identifier: GPL-3.0-or-later
    Credit and attribution: see AUTHORS
    Required legal notices:  see NOTICE
\*---------------------------------------------------------------------------*/

#include "VesselMechanics.H"

#include "core/Constants.H"

namespace Choupo {
namespace vesselMechanics {

Wall wall(scalar          D_m,
          scalar          H_m,
          scalar          pressureDesign_bar,
          const Material& material,
          scalar          jointEfficiency,
          scalar          corrosionAllow_m)
{
    const scalar P_Pa     = pressureDesign_bar * 1.0e5;
    const scalar sigma_Pa = material.sigma_y * 1.0e6;

    Wall w;
    w.t_wall = P_Pa * D_m / (2.0 * sigma_Pa * jointEfficiency - 1.2 * P_Pa)
             + corrosionAllow_m;
    w.weight = material.density * constant::pi * D_m * H_m * w.t_wall;
    return w;
}

} // namespace vesselMechanics
} // namespace Choupo

// ************************************************************************* //
