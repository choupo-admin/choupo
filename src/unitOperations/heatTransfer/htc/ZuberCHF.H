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
    Choupo::ZuberCHF

Description
    The Zuber (1959) CRITICAL HEAT FLUX (CHF, "burnout") correlation for
    saturated pool boiling.  The hydrodynamic-instability ceiling: the maximum
    heat flux a pool boiler can sustain before the vapour-jet columns leaving
    the surface choke into a blanketing film (the transition to film boiling),
    where the wall temperature jumps catastrophically.

        q''_max = 0.149 * h_fg * rho_v^(1/2)
                  * [ sigma * g * (rho_l - rho_v) ]^(1/4)               [W/m^2]

    Unlike the nucleate-boiling FLUX (Rohsenow), which is surface-finish lab
    data with +/-100 % scatter, the Zuber CHF is a RELIABLE hydrodynamic
    ceiling (+/-15 %, set by the leading coefficient 0.149 -- the
    Zuber/Kutateladze value for a large horizontal plate).  It is the design
    figure the boiling dispatch uses to HARD-REFUSE an over-CHF design: a real
    pool boiler CANNOT operate above CHF.

    The coefficient 0.149 is the most-cited "infinite flat plate" value
    (Lienhard's Zuber-Kutateladze constant); the original Zuber analysis gives
    pi/24 ~ 0.131 and Incropera & DeWitt round to 0.149 for the engineering
    correlation.

    References (textbook / primary):
      * Zuber, N. (1959) "Hydrodynamic aspects of boiling heat transfer",
        AECU-4439, U.S. Atomic Energy Commission -- the CHF analysis.
      * Incropera & DeWitt, Fundamentals of Heat and Mass Transfer, Ch. 10
        (sec. 10.4, eq. for q''_max) -- the engineering form + the saturated
        water at 1 atm anchor (q''_max ~ 1.26 MW/m^2).

    This base only arithmetises the correlation -- the caller pre-evaluates
    h_fg, rho_v, rho_l (all at Tsat) and sigma (saturation line) into the
    PhaseChangeContext.  CHF has NO dT_excess dependence (it is the ceiling,
    not a point on the boiling curve), so q_flux is left 0 and q_CHF carries
    the result.
\*---------------------------------------------------------------------------*/

#pragma once

#include "PhaseChangeHTC.H"

#include <cmath>
#include <cstdio>
#include <stdexcept>

namespace Choupo {

class ZuberCHF : public PhaseChangeHTC
{
public:
    const std::string& type() const override { return type_; }
    const std::string& validityWindow() const override { return validity_; }

    PhaseChangeResult evaluate(const PhaseChangeContext& c) const override
    {
        if (c.sigma <= 0.0)
            throw std::runtime_error(
                "ZuberCHF: surface tension sigma is required (saturation-line"
                " value) and is missing -- add a transport { surfaceTension {"
                " ... } } block, or flag a pure-fluid kernel (IF97 supplies"
                " sigma via IAPWS R1-76).");
        if (c.h_fg <= 0.0 || c.rho_v <= 0.0 || c.rho_l <= c.rho_v)
            throw std::runtime_error(
                "ZuberCHF: need h_fg > 0, rho_v > 0 and rho_l > rho_v at Tsat.");

        PhaseChangeResult r;
        r.regime = "CHF ceiling (Zuber 1959)";
        r.q_CHF  = chf(c.h_fg, c.rho_v, c.rho_l, c.sigma, c.gravity);
        // CHF carries no film coefficient and no nucleate flux -- it is the
        // ceiling, not a point on the curve.  h / q_flux stay 0.
        return r;
    }

    VerifyResult verify() const override
    {
        // ---- Anchor: saturated water at 1 atm (Incropera & DeWitt, Ch.10) --
        // Tsat = 100 C: h_fg = 2257 kJ/kg, rho_v = 0.5977 kg/m^3,
        // rho_l = 957.9 kg/m^3, sigma = 0.0589 N/m.  Published q''_max ~ 1.26
        // MW/m^2 (the classic CHF figure for a pool of water at 1 atm).
        const scalar q = chf(/*h_fg*/ 2257.0e3, /*rho_v*/ 0.5977,
                             /*rho_l*/ 957.9, /*sigma*/ 0.0589, /*g*/ 9.81);
        const scalar q_pub = 1.26e6;

        VerifyResult v;
        v.dev         = std::abs(q - q_pub) / q_pub;
        v.h_choupo    = q;            // reuse the slot: q''_max [W/m^2]
        v.h_published = q_pub;
        v.anchor =
            "saturated water, 1 atm (Tsat=100C): q''_max = " + fmt(q)
          + " W/m^2 vs ~1.26e6 -- Zuber (1959) / Incropera & DeWitt Ch.10."
            "  CHF is a RELIABLE hydrodynamic ceiling (+/-15%, NOT the +/-100%"
            " of the nucleate flux); the bench tolerance honours that.";
        return v;
    }

private:
    // q''_max = 0.149 h_fg rho_v^(1/2) [sigma g (rho_l - rho_v)]^(1/4).
    static scalar chf(scalar h_fg, scalar rho_v, scalar rho_l,
                      scalar sigma, scalar g)
    {
        return 0.149 * h_fg * std::sqrt(rho_v)
             * std::pow(sigma * g * (rho_l - rho_v), 0.25);
    }

    static std::string fmt(scalar x)
    {
        char buf[32];
        std::snprintf(buf, sizeof(buf), "%.4g", static_cast<double>(x));
        return std::string(buf);
    }

    inline static const std::string type_ = "ZuberCHF";
    inline static const std::string validity_ =
        "saturated pool boiling CHF ceiling (Zuber 1959); RELIABLE +/-15%";
};

} // namespace Choupo
