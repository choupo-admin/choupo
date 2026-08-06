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
-------------------------------------------------------------------------------
Class
    Choupo::TabularSizeDistribution

Description
    A measured distribution: explicit bins, as a sieve analysis or a laser
    diffractometer reports one.

    IT IS A SUBCLASS, NOT THE REPRESENTATION, and that inversion is the whole
    reason this family exists.  Before 2026-08-06 the tabular form WAS the
    size distribution in Choupo -- a bare struct of two vectors -- so a
    continuous law had nowhere to live and a case author had to discretise it
    by hand, putting the model in the input file.  OpenFOAM's
    `src/OpenFOAM/distributions/` has `tabulatedCumulative` and
    `tabulatedDensity` sitting as peers beside `RosinRammler` and `normal`,
    and that is the arrangement copied here.

    THE DECLARED BASIS IS EXPLICIT and defaults to MASS, because that is what
    a sieve gives and what `ParticleSizeDistribution` has always held.  A
    number-counted table declares `basis number;` and every derived quantity
    converts correctly instead of silently answering in the wrong weighting.

    The density is piecewise-constant across each bin, so `rawMoment` is an
    exact sum rather than a quadrature -- no closed form is needed and none is
    pretended.
\*---------------------------------------------------------------------------*/

#pragma once

#include "core/distribution/SizeDistribution.H"

#include <memory>
#include <string>
#include <vector>

namespace Choupo {

class TabularSizeDistribution : public SizeDistribution
{
public:

    static std::unique_ptr<SizeDistribution> create(const DictPtr& d);

    TabularSizeDistribution(std::vector<scalar> diameter,
                            std::vector<scalar> fraction,
                            int declaredBasis);

    std::string type() const override { return "tabular"; }

    scalar pdf(scalar d) const override;
    scalar cdf(scalar d) const override;
    scalar dMin() const override { return edge_.front(); }
    scalar dMax() const override { return edge_.back();  }

protected:

    scalar rawMoment(int m) const override;

private:

    std::vector<scalar> d_, f_, edge_;
};

} // namespace Choupo
