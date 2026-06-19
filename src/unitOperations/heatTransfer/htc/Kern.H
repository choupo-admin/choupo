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
    Choupo::Kern

Description
    The shell-side correlation of the Kern method (Kern, Process Heat
    Transfer, 1950) for a segmentally-baffled shell-and-tube exchanger:

        Nu = 0.36 Re_s^0.55 Pr^(1/3) (mu/mu_w)^0.14

    where Re_s = G_s D_e / mu is built on the shell-side crossflow mass flux
    G_s and the bundle equivalent diameter D_e (both furnished by the unit
    op from the tube layout, pitch and baffle spacing).  The wall-viscosity
    correction (mu/mu_w)^0.14 is taken as 1 in v1 (announced; isothermal-wall
    approximation).

    Validity: 2000 < Re_s < 1e6 (Kern method working range).
\*---------------------------------------------------------------------------*/

#pragma once

#include "HeatTransferCorrelation.H"
#include "thermo/Dimensionless.H"

#include <cmath>

namespace Choupo {

class Kern : public HeatTransferCorrelation
{
public:
    const std::string& type() const override { return type_; }
    const std::string& validityWindow() const override { return validity_; }

    // Nu(Re_s, Pr) by the Kern j-factor form.  The (mu/mu_w)^0.14 wall
    // correction is 1 in v1 (announced by the unit op SEE).
    static scalar nusselt(scalar Re_s, scalar Pr)
    {
        return 0.36 * std::pow(Re_s, 0.55) * std::pow(Pr, 1.0 / 3.0);
    }

    HeatTransferResult evaluate(const HeatTransferContext& c) const override
    {
        HeatTransferResult r;
        // For the shell the context's u/d_h are the crossflow velocity and
        // the equivalent diameter D_e; Re here is therefore Re_s.
        r.Re = dimensionless::reynolds(c.rho, c.u, c.d_h, c.mu);
        r.Pr = dimensionless::prandtl(c.cp, c.mu, c.lambda);
        r.Nu = nusselt(r.Re, r.Pr);
        r.h  = r.Nu * c.lambda / c.d_h;

        r.inValidity = (r.Re > 2000.0) && (r.Re < 1.0e6);
        if (r.Re <= 2000.0)
            r.validityNote = "Re_s <= 2000: below Kern-method range (extrapolated)";
        else if (r.Re >= 1.0e6)
            r.validityNote = "Re_s >= 1e6: above Kern-method range (extrapolated)";
        return r;
    }

    VerifyResult verify() const override
    {
        // No tightly-reproducible published Nu (Kern's original work reports
        // h_o through a j_H chart read by eye, not a closed Nu).  We pin the
        // SELF-CONSISTENCY of the closed Kern form at a representative shell
        // point (Re_s = 1e4, Pr = 5) and STATE that the published pin is the
        // chart, not a number -- honest per the no-fabrication rule.
        const scalar Re_s = 1.0e4, Pr = 5.0;
        VerifyResult v;
        v.Nu_choupo    = nusselt(Re_s, Pr);
        v.Nu_published = 0.36 * std::pow(Re_s, 0.55) * std::pow(Pr, 1.0 / 3.0);
        v.dev = std::abs(v.Nu_choupo - v.Nu_published)
              / std::max(v.Nu_published, 1.0e-30);
        v.anchor = "Re_s=1e4, Pr=5 -- Kern, Process Heat Transfer (1950),"
                   " closed j_H form (self-consistency; original pin is a chart)";
        return v;
    }

private:
    inline static const std::string type_ = "Kern";
    inline static const std::string validity_ = "2000<Re_s<1e6";
};

} // namespace Choupo
