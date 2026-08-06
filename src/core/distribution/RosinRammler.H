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
Class
    Choupo::RosinRammler

Description
    The Rosin-Rammler (RRSB) distribution, the standard description of a
    milled or crushed powder:

        cumulative MASS undersize   F(d) = 1 - exp(-(d/d63)^n)

    so the distribution is DECLARED in the volume/mass basis (Q = 3), which
    is how a sieve analysis reports it and how the correlation was fitted.
    Declaring the basis rather than assuming it is the whole point of the
    base class: a consumer asking for a number-basis mean gets the conversion
    done for it instead of doing it wrongly.

    `d63` is the size at which 63.2 % (= 1 - 1/e) of the mass lies below --
    the parameter's actual meaning, which is worth stating because it is
    routinely mistaken for a mean.  `n` is the spread: large n is a narrow
    cut, n ~ 1 a very broad one.

    MOMENTS ARE CLOSED-FORM.  With x = (d/d63)^n,

        INT_0^inf d^m f(d) dd = d63^m * Gamma(1 + m/n)

    so `rawMoment` overrides the base's numerical integration.  That is the
    same split OpenFOAM draws with its `unintegrable` base: analytic where
    analytic exists, quadrature only where it does not.

    Reference: Rosin & Rammler, J. Inst. Fuel 7 (1933) 29; the RRSB form is
    standard in DIN 66145.
\*---------------------------------------------------------------------------*/

#pragma once

#include "core/distribution/SizeDistribution.H"

#include <memory>
#include <string>

namespace Choupo {

class RosinRammler : public SizeDistribution
{
public:

    static std::unique_ptr<SizeDistribution> create(const DictPtr& d);

    RosinRammler(scalar d63, scalar n, scalar dMin, scalar dMax);

    std::string type() const override { return "RosinRammler"; }

    scalar pdf(scalar d) const override;
    scalar cdf(scalar d) const override;
    scalar dMin() const override { return dMin_; }
    scalar dMax() const override { return dMax_; }

protected:

    scalar rawMoment(int m) const override;

private:

    scalar d63_, n_, dMin_, dMax_;
};

} // namespace Choupo
