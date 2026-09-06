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

#include "SatoRiedel.H"
#include "thermo/Component.H"

#include <cmath>
#include <stdexcept>

namespace Choupo {

scalar SatoRiedel::kernel(scalar M, scalar Tc, scalar Tb, scalar T)
{
    const scalar Tr  = T  / Tc;
    const scalar Tbr = Tb / Tc;
    const scalar num = 3.0 + 20.0 * std::pow(1.0 - Tr,  2.0 / 3.0);
    const scalar den = 3.0 + 20.0 * std::pow(1.0 - Tbr, 2.0 / 3.0);
    return (1.1053 / std::sqrt(M)) * num / den;       // W/(m·K)
}

scalar SatoRiedel::conductivityLiquidPure(const Component& c, scalar T) const
{
    const scalar M  = c.MW();        // g/mol (= kg/kmol numerically)
    const scalar Tc = c.Tc();        // K
    const scalar Tb = c.Tb();        // K
    if (M <= 0.0 || Tc <= 0.0 || Tb <= 0.0)
        throw std::runtime_error("SatoRiedel: component '" + c.name()
            + "' needs MW, Tb and Tc in its.dat.");
    return kernel(M, Tc, Tb, T);
}

CorrelationVerify SatoRiedel::verify() const
{
    //  ARITHMETIC: at T = Tb the bracket ratio is 1 by construction, so
    //  lambda(Tb) = 1.1053 / sqrt(M) whatever Tc.  Benzene's M, Tc and Tb;
    //  the literal computed ONCE and written here.  A transcription that
    //  put Tr where Tbr belongs, or lost the normalisation, fails; a right
    //  transcription of a poor correlation passes -- which is all this
    //  arm claims.
    CorrelationVerify v;
    v.value_choupo = kernel(78.11, 562.05, 353.24, 353.24);
    v.value_published = 0.125062;
    v.dev = std::abs(v.value_choupo - v.value_published) / v.value_published;
    v.kind = "arithmetic";
    v.anchor = "T = Tb (benzene M = 78.11): the form is normalised at the "
               "boiling point, so lambda(Tb) = 1.1053 / sqrt(M) = 0.12506 "
               "W/(m.K) exactly, whatever Tc.  This arm checks the "
               "TRANSCRIPTION of the bracket structure, not the physics";
    return v;
}

} // namespace Choupo
