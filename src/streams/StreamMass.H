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
File
    StreamMass.H

Description
    Mass-basis views of a ProcessStream.

    Choupo stores ONE source of truth for total flow: the molar flow
    `F` in kmol/s.  Whenever a unit op or a print site needs a mass
    flow, it derives it on demand via the helpers below using the
    mole-fraction-weighted molar mass MW_mix = Σ z_i · MW_i.

    Keeping mass and molar flows as TWO stored fields would force every
    unit operation to update both consistently — easy to forget, and
    pedagogically misleading ("which is the truth?").  A derived view
    sidesteps the issue: the molar flow is canonical, the mass flow
    follows from composition + thermo.
\*---------------------------------------------------------------------------*/

#pragma once

#include "ProcessStream.H"
#include "thermo/ThermoPackage.H"

namespace Choupo {

// Σ z_i · MW_i  (mole-fraction-weighted molar mass)   [kg/kmol]
//
// If the composition is empty or sums to zero (e.g. a placeholder
// stream with F = 0), returns 0 so callers can multiply through
// without a divide-by-zero downstream.
inline scalar MWmix(const sVector& z, const ThermoPackage& thermo)
{
    const std::size_t n = std::min(z.size(), thermo.n());
    scalar mw = 0.0;
    for (std::size_t i = 0; i < n; ++i)
        mw += z[i] * thermo.comp(i).MW();
    return mw;
}

// Mass flow of a stream      [kg/s]
//
//     F_mass = F · MW_mix      with  F in kmol/s, MW_mix in kg/kmol
//
// (kmol/s · kg/kmol = kg/s; the kmol cancel.)
inline scalar F_mass(const ProcessStream& s, const ThermoPackage& thermo)
{
    return s.F * MWmix(s.z, thermo);
}

} // namespace Choupo
