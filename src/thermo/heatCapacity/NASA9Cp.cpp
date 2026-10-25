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

#include "NASA9Cp.H"
#include "core/Advisory.H"
#include "core/Constants.H"

#include <algorithm>
#include <cmath>
#include <stdexcept>
#include <string>

namespace Choupo {

NASA9Cp::NASA9Cp(const DictPtr& dict)
{
    owner_ = dict->lookupWordOrDefault("owner", "");
    const std::string who = owner_.empty() ? "NASA9" : "component '" + owner_ + "'";

    auto lo = dict->lookupList("low");
    auto hi = dict->lookupList("high");
    if (lo.size() != 7 || hi.size() != 7)
        throw std::runtime_error("NASA9Cp (" + who + "): 'low' and 'high' each"
            " need exactly the 7 Cp coefficients a1..a7 of NASA/TP-2002-211556"
            " eq. (1); the integration constants b1, b2 are not part of the"
            " heat capacity and are not read");
    for (std::size_t i = 0; i < 7; ++i) { low_[i] = lo[i]; high_[i] = hi[i]; }

    for (const char* k : {"Tlow", "Tcommon", "Thigh"})
        if (!dict->found(k))
            throw std::runtime_error("NASA9Cp (" + who + "): '" + std::string(k)
                + "' is required -- the interval is part of the published fit,"
                  " so there is no default window");
    Tlow_    = dict->lookupScalar("Tlow");
    Tcommon_ = dict->lookupScalar("Tcommon");
    Thigh_   = dict->lookupScalar("Thigh");
    if (!(0.0 < Tlow_ && Tlow_ < Tcommon_ && Tcommon_ < Thigh_))
        throw std::runtime_error("NASA9Cp (" + who + "): need 0 < Tlow < Tcommon < Thigh");
}

const scalar* NASA9Cp::coeffsFor(scalar T) const
{
    return (T <= Tcommon_) ? low_ : high_;
}

void NASA9Cp::noteRange(scalar T) const
{
    if (T >= Tlow_ && T <= Thigh_) return;
    if (announcedOutside_) return;
    announcedOutside_ = true;
    const std::string who = owner_.empty() ? "NASA9" : "component '" + owner_ + "'";
    AdvisoryLog::instance().add(
        "validity", "warning", who,
        "ideal-gas Cp (NASA9) evaluated at T = " + std::to_string(T)
        + " K, OUTSIDE its published interval (" + std::to_string(Tlow_) + " "
        + std::to_string(Thigh_) + ") -- extrapolated, still returned");
}

scalar NASA9Cp::Cp(scalar T) const
{
    if (T <= 0)
        throw std::runtime_error("NASA9Cp: Cp asked at T <= 0 K");
    noteRange(T);
    const scalar* a = coeffsFor(T);
    const scalar cpR = a[0] / (T * T) + a[1] / T + a[2]
                     + T * (a[3] + T * (a[4] + T * (a[5] + T * a[6])));
    return constant::R * cpR;            // J/(mol·K)
}

// ∫ Cp dT = R [ -a1/T + a2 ln T + a3 T + a4 T^2/2 + a5 T^3/3 + a6 T^4/4 + a7 T^5/5 ]
scalar NASA9Cp::hAnti_(scalar T, const scalar* a) const
{
    return constant::R * ( -a[0] / T
        + a[1] * std::log(T)
        + a[2] * T
        + a[3] * T * T / 2.0
        + a[4] * T * T * T / 3.0
        + a[5] * T * T * T * T / 4.0
        + a[6] * T * T * T * T * T / 5.0 );
}

// ∫ Cp/T dT = R [ -a1/(2 T^2) - a2/T + a3 ln T + a4 T + a5 T^2/2 + a6 T^3/3 + a7 T^4/4 ]
scalar NASA9Cp::sAnti_(scalar T, const scalar* a) const
{
    return constant::R * ( -a[0] / (2.0 * T * T)
        - a[1] / T
        + a[2] * std::log(T)
        + a[3] * T
        + a[4] * T * T / 2.0
        + a[5] * T * T * T / 3.0
        + a[6] * T * T * T * T / 4.0 );
}

scalar NASA9Cp::H(scalar T, scalar Tref) const
{
    if (T <= 0 || Tref <= 0)
        throw std::runtime_error("NASA9Cp: H asked at T <= 0 K");
    noteRange(T);
    noteRange(Tref);
    const scalar a = std::min(T, Tref);
    const scalar b = std::max(T, Tref);
    scalar val;
    if (b <= Tcommon_)       val = hAnti_(b, low_)  - hAnti_(a, low_);
    else if (a >= Tcommon_)  val = hAnti_(b, high_) - hAnti_(a, high_);
    else val = (hAnti_(Tcommon_, low_) - hAnti_(a, low_))
             + (hAnti_(b, high_) - hAnti_(Tcommon_, high_));
    return (T >= Tref) ? val : -val;
}

scalar NASA9Cp::S(scalar T, scalar Tref) const
{
    if (T <= 0 || Tref <= 0)
        throw std::runtime_error("NASA9Cp: S asked at T <= 0 K");
    noteRange(T);
    noteRange(Tref);
    const scalar a = std::min(T, Tref);
    const scalar b = std::max(T, Tref);
    scalar val;
    if (b <= Tcommon_)       val = sAnti_(b, low_)  - sAnti_(a, low_);
    else if (a >= Tcommon_)  val = sAnti_(b, high_) - sAnti_(a, high_);
    else val = (sAnti_(Tcommon_, low_) - sAnti_(a, low_))
             + (sAnti_(b, high_) - sAnti_(Tcommon_, high_));
    return (T >= Tref) ? val : -val;
}

} // namespace Choupo
