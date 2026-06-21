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

#include "NASA7Cp.H"
#include "core/Constants.H"

#include <algorithm>
#include <cmath>
#include <stdexcept>

namespace Choupo {

NASA7Cp::NASA7Cp(const DictPtr& dict)
{
    auto lo = dict->lookupList("low");
    auto hi = dict->lookupList("high");
    if (lo.size() < 5 || hi.size() < 5)
        throw std::runtime_error("NASA7Cp: 'low' and 'high' each need >= 5"
            " coefficients (a1..a5 of the 7; a6,a7 optional/ignored for Cp)");
    for (std::size_t i = 0; i < 5; ++i) { low_[i] = lo[i]; high_[i] = hi[i]; }

    Tlow_    = dict->lookupScalarOrDefault("Tlow",    200.0);
    Tcommon_ = dict->lookupScalarOrDefault("Tcommon", 1000.0);
    Thigh_   = dict->lookupScalarOrDefault("Thigh",   3500.0);
    if (!(Tlow_ < Tcommon_ && Tcommon_ < Thigh_))
        throw std::runtime_error("NASA7Cp: need Tlow < Tcommon < Thigh");
}

const scalar* NASA7Cp::coeffsFor(scalar T) const
{
    return (T <= Tcommon_) ? low_ : high_;
}

scalar NASA7Cp::Cp(scalar T) const
{
    const scalar* a = coeffsFor(T);
    const scalar cpR = a[0] + T * (a[1] + T * (a[2] + T * (a[3] + T * a[4])));
    return constant::R * cpR;            // J/(mol·K)
}

// ∫_{Ta}^{Tb} Cp dT  with one coefficient set (segment assumed within a range).
scalar NASA7Cp::enthalpySeg_(scalar Ta, scalar Tb, const scalar* a) const
{
    auto anti = [&](scalar T) {
        // R [ a1 T + a2 T^2/2 + a3 T^3/3 + a4 T^4/4 + a5 T^5/5 ]
        return constant::R * ( a[0] * T
            + a[1] * T * T / 2.0
            + a[2] * T * T * T / 3.0
            + a[3] * T * T * T * T / 4.0
            + a[4] * T * T * T * T * T / 5.0 );
    };
    return anti(Tb) - anti(Ta);
}

// ∫_{Ta}^{Tb} Cp/T dT  with one coefficient set.
scalar NASA7Cp::entropySeg_(scalar Ta, scalar Tb, const scalar* a) const
{
    auto anti = [&](scalar T) {
        // R [ a1 lnT + a2 T + a3 T^2/2 + a4 T^3/3 + a5 T^4/4 ]
        return constant::R * ( a[0] * std::log(T)
            + a[1] * T
            + a[2] * T * T / 2.0
            + a[3] * T * T * T / 3.0
            + a[4] * T * T * T * T / 4.0 );
    };
    return anti(Tb) - anti(Ta);
}

scalar NASA7Cp::H(scalar T, scalar Tref) const
{
    // Split at Tcommon when [Tref,T] straddles the two ranges, so each segment
    // uses its own coefficients.
    const scalar a = std::min(T, Tref);
    const scalar b = std::max(T, Tref);
    scalar val;
    if (b <= Tcommon_)       val = enthalpySeg_(a, b, low_);
    else if (a >= Tcommon_)  val = enthalpySeg_(a, b, high_);
    else val = enthalpySeg_(a, Tcommon_, low_) + enthalpySeg_(Tcommon_, b, high_);
    return (T >= Tref) ? val : -val;
}

scalar NASA7Cp::S(scalar T, scalar Tref) const
{
    const scalar a = std::min(T, Tref);
    const scalar b = std::max(T, Tref);
    scalar val;
    if (b <= Tcommon_)       val = entropySeg_(a, b, low_);
    else if (a >= Tcommon_)  val = entropySeg_(a, b, high_);
    else val = entropySeg_(a, Tcommon_, low_) + entropySeg_(Tcommon_, b, high_);
    return (T >= Tref) ? val : -val;
}

} // namespace Choupo
