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

#include "core/distribution/TabularSizeDistribution.H"

#include <cmath>
#include <numeric>
#include <stdexcept>
#include <memory>
#include <string>
#include <vector>

namespace Choupo {

TabularSizeDistribution::TabularSizeDistribution(std::vector<scalar> diameter,
                                                 std::vector<scalar> fraction,
                                                 int declaredBasis)
:
    SizeDistribution(declaredBasis),
    d_(std::move(diameter)), f_(std::move(fraction))
{
    if (d_.size() != f_.size() || d_.size() < 2)
        throw std::runtime_error("tabular sizeDistribution: `diameters` and "
            "`massFractions` must have the same length and at least 2 bins.");
    for (std::size_t k = 1; k < d_.size(); ++k)
        if (!(d_[k] > d_[k - 1]))
            throw std::runtime_error("tabular sizeDistribution: `diameters` "
                "must be strictly increasing -- an unsorted table has no "
                "cumulative, so no percentile and no median.");

    const scalar sum = std::accumulate(f_.begin(), f_.end(), scalar(0));
    if (sum <= 0.0)
        throw std::runtime_error("tabular sizeDistribution: the fractions sum "
            "to zero -- there is no distribution here.");
    for (auto& v : f_) v /= sum;      // normalise; the sum is a derived fact

    //  BIN EDGES from the representative diameters, geometric midpoints --
    //  the inverse of the convention `toTabular` writes, so a round trip
    //  through this class is consistent rather than merely close.
    edge_.resize(d_.size() + 1);
    for (std::size_t k = 1; k < d_.size(); ++k)
        edge_[k] = std::sqrt(d_[k - 1] * d_[k]);
    edge_.front() = d_.front() * d_.front() / edge_[1];
    edge_.back()  = d_.back()  * d_.back()  / edge_[d_.size() - 1];
}


std::unique_ptr<SizeDistribution> TabularSizeDistribution::create(const DictPtr& d)
{
    auto dia = d->lookupList("diameters");
    auto frc = d->found("massFractions") ? d->lookupList("massFractions")
                                         : d->lookupList("fractions");
    //  The basis is DECLARED, defaulting to mass -- what a sieve reports and
    //  what every existing consumer of ParticleSizeDistribution assumes.
    const std::string b = d->lookupWordOrDefault("basis", "volume");
    int Q = momentBasis::volume;
    if      (b == "number") Q = momentBasis::number;
    else if (b == "area")   Q = momentBasis::area;
    else if (b == "volume" || b == "mass") Q = momentBasis::volume;
    else throw std::runtime_error("tabular sizeDistribution: unknown `basis` '"
            + b + "' -- expected number, area, volume or mass.");
    return std::make_unique<TabularSizeDistribution>(dia, frc, Q);
}


scalar TabularSizeDistribution::pdf(scalar d) const
{
    //  Piecewise constant: fraction spread over the bin width.
    for (std::size_t k = 0; k < d_.size(); ++k)
        if (d >= edge_[k] && d < edge_[k + 1])
            return f_[k] / (edge_[k + 1] - edge_[k]);
    return 0.0;
}


scalar TabularSizeDistribution::cdf(scalar d) const
{
    scalar c = 0.0;
    for (std::size_t k = 0; k < d_.size(); ++k)
    {
        if (d >= edge_[k + 1]) { c += f_[k]; continue; }
        if (d <= edge_[k]) break;
        c += f_[k] * (d - edge_[k]) / (edge_[k + 1] - edge_[k]);
        break;
    }
    return c;
}


scalar TabularSizeDistribution::rawMoment(int m) const
{
    //  EXACT for a piecewise-constant density: INT over each bin of d^m times
    //  a constant height.  No quadrature, because none is needed -- and a
    //  quadrature here would introduce error into a table that has none.
    scalar s = 0.0;
    for (std::size_t k = 0; k < d_.size(); ++k)
    {
        const scalar a = edge_[k], b = edge_[k + 1];
        const scalar h = f_[k] / (b - a);
        const scalar mm = static_cast<scalar>(m);
        //  THE m = -1 CASE IS A LOGARITHM, not a division by zero.
        //  INT d^m dd = d^(m+1)/(m+1) for every m EXCEPT -1, where it is
        //  ln(d).  This is not a corner case here: a table declared on MASS
        //  (Q = 3, what a sieve gives) needs the -1 moment to form d32, so
        //  the commonest distribution in the corpus takes this branch every
        //  time it is asked for a Sauter mean.  The first version omitted it
        //  and returned NaN -- caught by the gate on its first run.
        s += (std::abs(mm + 1.0) < 1.0e-12)
           ? h * std::log(b / a)
           : h * (std::pow(b, mm + 1.0) - std::pow(a, mm + 1.0)) / (mm + 1.0);
    }
    return s;
}

} // namespace Choupo
