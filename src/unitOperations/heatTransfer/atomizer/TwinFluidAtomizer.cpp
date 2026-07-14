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

#include "TwinFluidAtomizer.H"

#include <cmath>
#include <stdexcept>

namespace Choupo {

TwinFluidAtomizer::TwinFluidAtomizer(const DictPtr& dict)
{
    vRel_ = dict->lookupScalarOrDefault("relativeVelocity", 100.0);   // m/s
    alr_  = dict->lookupScalarOrDefault("airLiquidMassRatio", 1.0);   // -
    if (vRel_ <= 0.0)
        throw std::runtime_error("TwinFluidAtomizer: relativeVelocity must be > 0");
    if (alr_ <= 0.0)
        throw std::runtime_error("TwinFluidAtomizer: airLiquidMassRatio must be > 0");
}

Atomizer::DropletResult TwinFluidAtomizer::dropletSize(const Feed& feed) const
{
    // Nukiyama-Tanasawa, in its ORIGINAL empirical cgs units.  Convert the SI
    // feed: sigma [N/m]->[dyn/cm] (*1e3); rho [kg/m^3]->[g/cm^3] (/1e3);
    // mu [Pa.s]->[poise] (*10).  Q_L/Q_A is the VOLUMETRIC liquid/gas ratio =
    // (rho_gas/rho_L)/ALR (from the mass ratio ALR = m_gas/m_liquid).
    const scalar sig_cgs = feed.sigma * 1.0e3;                  // dyn/cm
    const scalar rhoL_cgs = feed.rhoL / 1.0e3;                  // g/cm^3
    const scalar muL_poise = feed.muL * 10.0;                   // poise
    const scalar QLoverQA = (feed.rhoL > 0.0 && alr_ > 0.0)
                          ? (feed.rhoGas / feed.rhoL) / alr_ : 0.0;

    DropletResult out;
    out.spread = 1.6;   // pneumatic sprays are broad
    const scalar term1 = (585.0 / vRel_) * std::sqrt(sig_cgs / rhoL_cgs);
    const scalar term2 = 597.0
        * std::pow(muL_poise / std::sqrt(sig_cgs * rhoL_cgs), 0.45)
        * std::pow(1000.0 * QLoverQA, 1.5);
    out.d32  = (term1 + term2) * 1.0e-6;                        // um -> m
    out.note = "twin-fluid d32 (Nukiyama-Tanasawa, EMPIRICAL cgs correlation, "
               "converted from SI; higher air/liquid ratio -> finer; NOT "
               "dimensionless -- extrapolate with care)";
    return out;
}

} // namespace Choupo
