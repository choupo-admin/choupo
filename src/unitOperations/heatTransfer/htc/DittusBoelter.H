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
    Choupo::DittusBoelter

Description
    The classic turbulent in-tube correlation (Dittus & Boelter, 1930):

        Nu = 0.023 Re^0.8 Pr^n,     n = 0.4 (heating), 0.3 (cooling).

    Validity (Incropera & DeWitt, Fundamentals of Heat and Mass Transfer,
    6th ed., eq. 8.60): Re >= 1e4 (fully turbulent), 0.7 <= Pr <= 160,
    L/D >= 10.  Below Re = 1e4 the flow is transitional/laminar and the
    correlation is extrapolated WITH A WARNING (it is not silently clamped).
\*---------------------------------------------------------------------------*/

#pragma once

#include "HeatTransferCorrelation.H"
#include "thermo/Dimensionless.H"

#include <cmath>

namespace Choupo {

class DittusBoelter : public HeatTransferCorrelation
{
public:
    const std::string& type() const override { return type_; }
    const std::string& validityWindow() const override { return validity_; }

    HeatTransferResult evaluate(const HeatTransferContext& c) const override
    {
        HeatTransferResult r;
        r.Re = dimensionless::reynolds(c.rho, c.u, c.d_h, c.mu);
        r.Pr = dimensionless::prandtl(c.cp, c.mu, c.lambda);
        const scalar n = c.heating ? 0.4 : 0.3;
        r.Nu = 0.023 * std::pow(r.Re, 0.8) * std::pow(r.Pr, n);
        r.h  = r.Nu * c.lambda / c.d_h;

        r.inValidity = (r.Re >= 1.0e4) && (r.Pr >= 0.7) && (r.Pr <= 160.0);
        if (r.Re < 1.0e4)
            r.validityNote = "Re < 1e4: below Dittus-Boelter turbulent range"
                             " (extrapolated, not clamped)";
        else if (r.Pr < 0.7 || r.Pr > 160.0)
            r.validityNote = "Pr outside [0.7, 160]: outside Dittus-Boelter"
                             " validity (extrapolated)";
        return r;
    }

    VerifyResult verify() const override
    {
        // Published anchor: Incropera & DeWitt, Fund. of Heat and Mass
        // Transfer, 6th ed., Example 8.4 -- water heated in a tube,
        // Re_D = 36,933, Pr = 5.20 (heating, n = 0.4); the text reports
        // Nu_D = 0.023 Re^0.8 Pr^0.4 = 205.  We evaluate the same point.
        const scalar Re = 36933.0, Pr = 5.20;
        VerifyResult v;
        v.Nu_choupo    = 0.023 * std::pow(Re, 0.8) * std::pow(Pr, 0.4);
        v.Nu_published = 205.0;
        v.dev = std::abs(v.Nu_choupo - v.Nu_published) / v.Nu_published;
        v.anchor = "Re=36933, Pr=5.20, heating -- Incropera & DeWitt 6th ed.,"
                   " Example 8.4 (Nu=205)";
        return v;
    }

private:
    inline static const std::string type_ = "DittusBoelter";
    inline static const std::string validity_ =
        "Re>=1e4, 0.7<=Pr<=160, L/D>=10";
};

} // namespace Choupo
