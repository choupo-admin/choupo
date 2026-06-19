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
    Choupo::Gnielinski

Description
    The modern, lower-scatter turbulent in-tube correlation (Gnielinski,
    1976):

        f  = (0.790 ln Re - 1.64)^-2           (Petukhov smooth-tube friction)
        Nu = (f/8)(Re - 1000) Pr
             / [1 + 12.7 sqrt(f/8) (Pr^(2/3) - 1)]

    Validity: 3000 < Re < 5e6, 0.5 < Pr < 2000 (Incropera & DeWitt 6th ed.,
    eq. 8.62).  Preferred over Dittus-Boelter (default tube-side); accurate
    to roughly +/- 10 %.
\*---------------------------------------------------------------------------*/

#pragma once

#include "HeatTransferCorrelation.H"
#include "thermo/Dimensionless.H"

#include <cmath>

namespace Choupo {

class Gnielinski : public HeatTransferCorrelation
{
public:
    const std::string& type() const override { return type_; }
    const std::string& validityWindow() const override { return validity_; }

    // Nu(Re, Pr) by the Gnielinski formula (factored out so verify() and
    // evaluate() share ONE arithmetic path).
    static scalar nusselt(scalar Re, scalar Pr)
    {
        const scalar f = std::pow(0.790 * std::log(Re) - 1.64, -2.0);
        return (f / 8.0) * (Re - 1000.0) * Pr
             / (1.0 + 12.7 * std::sqrt(f / 8.0) * (std::pow(Pr, 2.0 / 3.0) - 1.0));
    }

    HeatTransferResult evaluate(const HeatTransferContext& c) const override
    {
        HeatTransferResult r;
        r.Re = dimensionless::reynolds(c.rho, c.u, c.d_h, c.mu);
        r.Pr = dimensionless::prandtl(c.cp, c.mu, c.lambda);
        r.Nu = nusselt(r.Re, r.Pr);
        r.h  = r.Nu * c.lambda / c.d_h;

        r.inValidity = (r.Re > 3000.0) && (r.Re < 5.0e6)
                    && (r.Pr > 0.5) && (r.Pr < 2000.0);
        if (r.Re <= 3000.0)
            r.validityNote = "Re <= 3000: below Gnielinski range (extrapolated)";
        else if (r.Re >= 5.0e6)
            r.validityNote = "Re >= 5e6: above Gnielinski range (extrapolated)";
        else if (r.Pr <= 0.5 || r.Pr >= 2000.0)
            r.validityNote = "Pr outside (0.5, 2000): outside Gnielinski validity";
        return r;
    }

    VerifyResult verify() const override
    {
        // Published anchor: Incropera & DeWitt, Fund. of Heat and Mass
        // Transfer, 6th ed., Example 8.4 -- the Gnielinski alternate solution
        // at Re_D = 36,933, Pr = 5.20 reports Nu_D ~= 224.
        const scalar Re = 36933.0, Pr = 5.20;
        VerifyResult v;
        v.Nu_choupo    = nusselt(Re, Pr);
        v.Nu_published = 224.0;
        v.dev = std::abs(v.Nu_choupo - v.Nu_published) / v.Nu_published;
        v.anchor = "Re=36933, Pr=5.20 -- Incropera & DeWitt 6th ed.,"
                   " Example 8.4 (Gnielinski alt., Nu=224)";
        return v;
    }

private:
    inline static const std::string type_ = "Gnielinski";
    inline static const std::string validity_ =
        "3000<Re<5e6, 0.5<Pr<2000";
};

} // namespace Choupo
