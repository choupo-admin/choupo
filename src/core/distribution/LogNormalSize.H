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
    Choupo::LogNormalSize

Description
    The log-normal size distribution -- the standard description of a powder
    produced by growth or condensation (crystallisation, aerosol, spray
    drying) rather than by fracture, which is Rosin-Rammler's domain.

        ln d ~ Normal(mu, sigma)

    DECLARED IN THE NUMBER BASIS (Q = 0), because that is how a counting
    measurement -- microscopy, an optical counter -- reports it.  Rosin-
    Rammler is declared on mass.  The two therefore sit in DIFFERENT bases in
    the same family, which is precisely why the base class carries the basis
    with the numbers: a consumer asking either of them for `d32()` gets the
    right answer without knowing which convention its author used.

    MOMENTS ARE CLOSED-FORM, and pleasantly so:

        INT d^m f(d) dd = exp(m*mu + m^2 sigma^2 / 2)

    (the m-th raw moment of a log-normal), so `rawMoment` overrides the base
    quadrature exactly as Rosin-Rammler's does.

    `dgm` is the GEOMETRIC MEAN diameter, exp(mu) -- the median of the number
    distribution, not its mean.  `sigmaG` is the geometric standard
    deviation, exp(sigma), and is DIMENSIONLESS and > 1; sigmaG = 1 would be
    a monodisperse powder.  Both names are the ones the particle-technology
    literature uses, so a student can carry a fitted value straight in.
\*---------------------------------------------------------------------------*/

#pragma once

#include "core/distribution/SizeDistribution.H"

#include <memory>
#include <string>

namespace Choupo {

class LogNormalSize : public SizeDistribution
{
public:

    static std::unique_ptr<SizeDistribution> create(const DictPtr& d);

    LogNormalSize(scalar dgm, scalar sigmaG, scalar dMin, scalar dMax);

    std::string type() const override { return "logNormal"; }

    scalar pdf(scalar d) const override;
    scalar cdf(scalar d) const override;
    scalar dMin() const override { return dMin_; }
    scalar dMax() const override { return dMax_; }

protected:

    scalar rawMoment(int m) const override;

private:

    scalar mu_, sigma_, dMin_, dMax_;
};

} // namespace Choupo
