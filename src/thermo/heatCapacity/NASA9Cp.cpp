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

//  ln x for the antiderivatives.  The reference temperature of every caller in
//  the engine is 298.15 K, and its logarithm used to be recomputed on each
//  H and S call (half of all the logarithms of a gas-phase reaction run).  The
//  constant is taken ONCE, by the same runtime std::log (volatile: a compiler
//  folding the call would round differently from libm), so every value is
//  bit-for-bit what it was.
static scalar lnOf(scalar x)
{
    static const scalar ln298 = []{ volatile scalar r = 298.15; return std::log(r); }();
    return (x == 298.15) ? ln298 : std::log(x);
}

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
    cHLoTc_ = hAnti_(Tcommon_, low_); cHHiTc_ = hAnti_(Tcommon_, high_);
    cHLoRef_ = hAnti_(298.15, low_);  cHHiRef_ = hAnti_(298.15, high_);
    cSLoTc_ = sAnti_(Tcommon_, low_); cSHiTc_ = sAnti_(Tcommon_, high_);
    cSLoRef_ = sAnti_(298.15, low_);  cSHiRef_ = sAnti_(298.15, high_);
}

scalar NASA9Cp::hLo_(scalar x) const { return x == Tcommon_ ? cHLoTc_ : (x == 298.15 ? cHLoRef_ : hAnti_(x, low_)); }
scalar NASA9Cp::hHi_(scalar x) const { return x == Tcommon_ ? cHHiTc_ : (x == 298.15 ? cHHiRef_ : hAnti_(x, high_)); }
scalar NASA9Cp::sLo_(scalar x) const { return x == Tcommon_ ? cSLoTc_ : (x == 298.15 ? cSLoRef_ : sAnti_(x, low_)); }
scalar NASA9Cp::sHi_(scalar x) const { return x == Tcommon_ ? cSHiTc_ : (x == 298.15 ? cSHiRef_ : sAnti_(x, high_)); }

const scalar* NASA9Cp::coeffsFor(scalar T) const
{
    return (T <= Tcommon_) ? low_ : high_;
}

void NASA9Cp::noteRange(scalar T) const
{
    if (T >= Tlow_ && T <= Thigh_) return;
    if (announcedOutside_.done()) return;
    deferred::note(&announcedOutside_, [this, T]
    {
        if (!announcedOutside_.claim()) return;
        const std::string who = owner_.empty() ? "NASA9" : "component '" + owner_ + "'";
        AdvisoryLog::instance().add(
            "validity", "warning", who,
            "ideal-gas Cp (NASA9) evaluated at T = " + std::to_string(T)
            + " K, OUTSIDE its published interval (" + std::to_string(Tlow_) + " "
            + std::to_string(Thigh_) + ") -- extrapolated, still returned");
    });
}

scalar NASA9Cp::Cp(scalar T) const
{
    if (T <= 0)
        throw std::runtime_error("NASA9Cp: Cp asked at T <= 0 K");
    if (!(T >= Tlow_ && T <= Thigh_)) noteRange(T);
    const scalar* a = coeffsFor(T);
    const scalar cpR = a[0] / (T * T) + a[1] / T + a[2]
                     + T * (a[3] + T * (a[4] + T * (a[5] + T * a[6])));
    return constant::R * cpR;            // J/(mol·K)
}

// ∫ Cp dT = R [ -a1/T + a2 ln T + a3 T + a4 T^2/2 + a5 T^3/3 + a6 T^4/4 + a7 T^5/5 ]
scalar NASA9Cp::hAnti_(scalar T, const scalar* a) const
{
    return constant::R * ( -a[0] / T
        + a[1] * lnOf(T)
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
        + a[2] * lnOf(T)
        + a[3] * T
        + a[4] * T * T / 2.0
        + a[5] * T * T * T / 3.0
        + a[6] * T * T * T * T / 4.0 );
}

scalar NASA9Cp::H(scalar T, scalar Tref) const
{
    if (T <= 0 || Tref <= 0)
        throw std::runtime_error("NASA9Cp: H asked at T <= 0 K");
    if (!(T >= Tlow_ && T <= Thigh_)) noteRange(T);
    if (!(Tref >= Tlow_ && Tref <= Thigh_)) noteRange(Tref);
    const scalar a = std::min(T, Tref);
    const scalar b = std::max(T, Tref);
    scalar val;
    if (b <= Tcommon_)       val = hLo_(b)  - hLo_(a);
    else if (a >= Tcommon_)  val = hHi_(b) - hHi_(a);
    else val = (hLo_(Tcommon_) - hLo_(a))
             + (hHi_(b) - hHi_(Tcommon_));
    return (T >= Tref) ? val : -val;
}

scalar NASA9Cp::S(scalar T, scalar Tref) const
{
    if (T <= 0 || Tref <= 0)
        throw std::runtime_error("NASA9Cp: S asked at T <= 0 K");
    if (!(T >= Tlow_ && T <= Thigh_)) noteRange(T);
    if (!(Tref >= Tlow_ && Tref <= Thigh_)) noteRange(Tref);
    const scalar a = std::min(T, Tref);
    const scalar b = std::max(T, Tref);
    scalar val;
    if (b <= Tcommon_)       val = sLo_(b)  - sLo_(a);
    else if (a >= Tcommon_)  val = sHi_(b) - sHi_(a);
    else val = (sLo_(Tcommon_) - sLo_(a))
             + (sHi_(b) - sHi_(Tcommon_));
    return (T >= Tref) ? val : -val;
}

} // namespace Choupo
