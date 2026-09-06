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

#include "Andrade.H"
#include "thermo/Component.H"

#include <cmath>
#include <stdexcept>

namespace Choupo {

scalar Andrade::kernel(scalar A, scalar B, scalar T)
{
    return std::exp(A + B / T);          // Pa·s
}

scalar Andrade::viscosityLiquidPure(const Component& c, scalar T) const
{
    if (!c.hasLiquidViscosity())
        throw std::runtime_error("Andrade viscosity: component '" + c.name()
            + "' has no `liquidViscosity` block in its.dat.");
    auto lv = c.liquidViscosityDict();
    if (!lv->found("andrade"))
        throw std::runtime_error("Andrade viscosity: component '" + c.name()
            + "' has a liquidViscosity block but no `andrade { A; B; }`"
            " sub-block.");
    auto a = lv->subDict("andrade");
    const scalar A = a->lookupScalar("A");
    const scalar B = a->lookupScalar("B");
    return kernel(A, B, T);
}

CorrelationVerify Andrade::verify() const
{
    //  ARITHMETIC, not physics.  exp(A + B/T) at the water record's own
    //  A = -13.03, B = 1796.1 and T = 298.15 K; the literal was computed ONCE
    //  and written here.  A fitted correlation has no theory anchor -- what
    //  it can prove without a measurement is that the transcription of its
    //  own form is right, and this says so.
    CorrelationVerify v;
    v.value_choupo = kernel(-13.03, 1796.1, 298.15);
    v.value_published = 9.065620e-04;
    v.dev = std::abs(v.value_choupo - v.value_published) / v.value_published;
    v.kind = "arithmetic";
    v.anchor = "A = -13.03, B = 1796.1 (the water record's own fit), T = "
               "298.15 K: exp(A + B/T) = 9.06562e-04 Pa.s, a literal.  This "
               "arm checks the TRANSCRIPTION of the form, not the fit's "
               "agreement with any measurement";
    return v;
}

} // namespace Choupo
