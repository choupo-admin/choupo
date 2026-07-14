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
    Choupo::TwinFluidAtomizer

Description
    Two-fluid / pneumatic (airblast) atomizer -- a high-velocity gas shears the
    liquid.  Classic Nukiyama-Tanasawa empirical correlation:

      d32[um] = 585/v_rel * sqrt(sigma/rho_L)
              + 597 * (mu_L/sqrt(sigma rho_L))^0.45 * (1000 Q_L/Q_A)^1.5

    (ORIGINAL CGS units: sigma dyn/cm, rho g/cm^3, mu poise, v_rel m/s, Q ratio
    volumetric.)  Choupo converts the SI feed to those units internally and
    announces the empirical basis -- it is NOT dimensionless and extrapolates
    poorly.  Hardware: `relativeVelocity` [m/s] (gas-liquid slip at the lip),
    `airLiquidMassRatio` [-] (ALR = m_gas/m_liquid).  Higher ALR -> finer spray.
    Ref: Nukiyama & Tanasawa (1939); Lefebvre & McDonell, Atomization and Sprays
    (DOI 10.1201/9781315120911); airblast alt.: Lorenzetto & Lefebvre 1977
    (DOI 10.2514/3.60742).
\*---------------------------------------------------------------------------*/

#pragma once

#include "Atomizer.H"

namespace Choupo {

class TwinFluidAtomizer : public Atomizer
{
public:
    explicit TwinFluidAtomizer(const DictPtr& dict);

    const std::string& name() const override { return name_; }
    DropletResult dropletSize(const Feed& feed) const override;

private:
    inline static const std::string name_ = "twinFluid";
    scalar vRel_ = 0.0;    // gas-liquid relative velocity [m/s]
    scalar alr_  = 0.0;    // air/liquid mass ratio [-]
};

} // namespace Choupo
