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

#include "core/distribution/RosinRammler.H"

#include <cmath>
#include <stdexcept>

namespace Choupo {

RosinRammler::RosinRammler(scalar d63, scalar n, scalar dmin, scalar dmax)
:
    SizeDistribution(momentBasis::volume),   // RRSB is declared on MASS
    d63_(d63), n_(n), dMin_(dmin), dMax_(dmax)
{
    if (d63_ <= 0.0)
        throw std::runtime_error("RosinRammler: `d63` must be positive [m].");
    if (n_ <= 0.0)
        throw std::runtime_error("RosinRammler: the spread `n` must be "
            "positive (n ~ 1 is a very broad cut, large n a narrow one).");
    if (!(dMax_ > dMin_) || dMin_ <= 0.0)
        throw std::runtime_error("RosinRammler: need 0 < dMin < dMax [m] -- "
            "the support is where the model is claimed to hold, and an "
            "impossible interval is a malformed claim, not a wide one.");
}


std::unique_ptr<SizeDistribution> RosinRammler::create(const DictPtr& d)
{
    const scalar d63 = d->lookupScalar("d63");
    const scalar n   = d->lookupScalar("n");
    //  The support defaults generously around d63 rather than to a magic
    //  constant: 1e-3 d63 to 10 d63 covers the mass to well past double
    //  precision for any n >= 0.5.  A case may state it explicitly.
    const scalar lo = d->lookupScalarOrDefault("dMin", 1.0e-3 * d63);
    const scalar hi = d->lookupScalarOrDefault("dMax", 1.0e+1 * d63);
    return std::make_unique<RosinRammler>(d63, n, lo, hi);
}


scalar RosinRammler::cdf(scalar d) const
{
    if (d <= 0.0) return 0.0;
    return 1.0 - std::exp(-std::pow(d / d63_, n_));
}


scalar RosinRammler::pdf(scalar d) const
{
    if (d <= 0.0) return 0.0;
    const scalar x = std::pow(d / d63_, n_);
    return (n_ / d63_) * std::pow(d / d63_, n_ - 1.0) * std::exp(-x);
}


scalar RosinRammler::rawMoment(int m) const
{
    //  CLOSED FORM: INT_0^inf d^m f(d) dd = d63^m * Gamma(1 + m/n).
    //  Overriding the base's quadrature is not an optimisation -- it is the
    //  difference between a moment that is exact and one that inherits the
    //  truncation of a finite support.
    return std::pow(d63_, static_cast<scalar>(m))
         * std::tgamma(1.0 + static_cast<scalar>(m) / n_);
}

} // namespace Choupo
