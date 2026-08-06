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
\*---------------------------------------------------------------------------*/

#include "core/distribution/LogNormalSize.H"

#include <cmath>
#include <stdexcept>

namespace Choupo {

LogNormalSize::LogNormalSize(scalar dgm, scalar sigmaG, scalar dmin, scalar dmax)
:
    SizeDistribution(momentBasis::number),   // a counting measurement
    mu_(std::log(dgm)), sigma_(std::log(sigmaG)), dMin_(dmin), dMax_(dmax)
{
    if (dgm <= 0.0)
        throw std::runtime_error("logNormal: `dgm` (geometric mean diameter) "
            "must be positive [m].");
    if (!(sigmaG > 1.0))
        throw std::runtime_error("logNormal: `sigmaG` is the GEOMETRIC "
            "standard deviation -- dimensionless and strictly greater than 1 "
            "(sigmaG = 1 is monodisperse).  A value <= 1 is not a narrow "
            "distribution, it is a malformed one.");
    if (!(dMax_ > dMin_) || dMin_ <= 0.0)
        throw std::runtime_error("logNormal: need 0 < dMin < dMax [m].");
}


std::unique_ptr<SizeDistribution> LogNormalSize::create(const DictPtr& d)
{
    const scalar dgm    = d->lookupScalar("dgm");
    const scalar sigmaG = d->lookupScalar("sigmaG");
    //  +/- 5 geometric standard deviations covers the number distribution to
    //  about 3e-7 in each tail -- far below any bin resolution a case uses.
    const scalar s5 = std::pow(sigmaG, 5.0);
    const scalar lo = d->lookupScalarOrDefault("dMin", dgm / s5);
    const scalar hi = d->lookupScalarOrDefault("dMax", dgm * s5);
    return std::make_unique<LogNormalSize>(dgm, sigmaG, lo, hi);
}


scalar LogNormalSize::pdf(scalar d) const
{
    if (d <= 0.0) return 0.0;
    const scalar z = (std::log(d) - mu_) / sigma_;
    return std::exp(-0.5 * z * z)
         / (d * sigma_ * std::sqrt(2.0 * M_PI));
}


scalar LogNormalSize::cdf(scalar d) const
{
    if (d <= 0.0) return 0.0;
    const scalar z = (std::log(d) - mu_) / (sigma_ * std::sqrt(2.0));
    return 0.5 * (1.0 + std::erf(z));
}


scalar LogNormalSize::rawMoment(int m) const
{
    //  CLOSED FORM: the m-th raw moment of a log-normal.
    const scalar mm = static_cast<scalar>(m);
    return std::exp(mm * mu_ + 0.5 * mm * mm * sigma_ * sigma_);
}

} // namespace Choupo
