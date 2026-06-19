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
    Choupo::NusseltFilm

Description
    Laminar film condensation -- Nusselt (1916) film theory.

        h_bar = C * [ k_l^3 rho_l (rho_l - rho_v) g h_fg' /
                      (mu_l L dT_film) ]^(1/4)

        C = 0.943   vertical plate / vertical tube (char length L = height)
        C = 0.729   single horizontal tube         (char length L = D)
        h_fg' = h_fg + 0.68 cp_l dT_film     (Rohsenow subcooling correction)

    The film Reynolds number Re_film = 4 Gamma / mu_l, with the per-width
    condensate flow Gamma = q'' L / h_fg' = h_bar L dT_film / h_fg', gives
        Re_film = 4 h_bar L dT_film / (mu_l h_fg').
    Laminar validity (Incropera & DeWitt, Ch. 10): a vertical surface stays
    laminar up to Re_film ~ 30 (laminar-wavy onset); the wavy regime persists
    to Re_film ~ 1800, beyond which the film is turbulent.  For a single
    horizontal tube Re_film is small and the film is laminar.  v1 models the
    LAMINAR (Nusselt) film only -- when the laminar bound binds the result is
    flagged valid = false with a regime string (wavy / turbulent = v2); it is
    NOT silently clamped (no-silent-crutch by announcement).

    References (public domain / textbook):
      * Nusselt, W. (1916), Z. Ver. Dt. Ing. 60, 541-575.
      * Incropera & DeWitt, Fundamentals of Heat and Mass Transfer, Ch. 10,
        Example 10.3 (vertical plate) and Example 10.4 (horizontal tube) --
        the numeric anchors for verify().
\*---------------------------------------------------------------------------*/

#pragma once

#include "PhaseChangeHTC.H"

#include <algorithm>
#include <cmath>
#include <cstdio>

namespace Choupo {

class NusseltFilm : public PhaseChangeHTC
{
public:
    const std::string& type() const override { return type_; }
    const std::string& validityWindow() const override { return validity_; }

    PhaseChangeResult evaluate(const PhaseChangeContext& c) const override
    {
        return evalCore(c.orientation, c.charLength, c.dT_film, c.rho_l,
                        c.rho_v, c.lambda_l, c.mu_l, c.cp_l, c.h_fg, c.gravity);
    }

    VerifyResult verify() const override
    {
        // ---- Anchor 1: vertical plate (Incropera & DeWitt, Ex. 10.3) ------
        // Saturated steam at 1 atm (Tsat = 100 C = 373.15 K) condensing on a
        // vertical plate L = 1 m maintained at Ts = 70 C (dT_film = 30 K).
        // Film properties from saturated-water Table A.6 at T_f = 85 C = 358 K;
        // rho_v and h_fg of steam at 100 C.  Published average coefficient
        // h_bar ~ 4870 W/(m^2.K) (textbook order; laminar-wavy film).
        const PhaseChangeResult vp = evalCore(
            "verticalPlate", /*L*/ 1.0, /*dT*/ 30.0,
            /*rho_l*/ 969.0, /*rho_v*/ 0.5977, /*k_l*/ 0.672,
            /*mu_l*/ 333.0e-6, /*cp_l*/ 4203.0, /*h_fg*/ 2257.0e3, /*g*/ 9.81);

        // ---- Anchor 2: horizontal tube (Incropera & DeWitt, Ex. 10.4) -----
        // Saturated steam at 1 atm on a single horizontal tube D = 0.05 m at
        // Ts = 50 C (dT_film = 50 K), film properties at T_f = 75 C = 348 K.
        // Published h_bar ~ 6520 W/(m^2.K).
        const PhaseChangeResult ht = evalCore(
            "horizontalTube", /*D*/ 0.05, /*dT*/ 50.0,
            /*rho_l*/ 974.8, /*rho_v*/ 0.5977, /*k_l*/ 0.668,
            /*mu_l*/ 378.0e-6, /*cp_l*/ 4193.0, /*h_fg*/ 2257.0e3, /*g*/ 9.81);

        const scalar h_pub_vp = 4870.0;
        const scalar h_pub_ht = 6520.0;
        const scalar dev_vp = std::abs(vp.h - h_pub_vp) / h_pub_vp;
        const scalar dev_ht = std::abs(ht.h - h_pub_ht) / h_pub_ht;

        // Report the WORSE of the two anchors (the honest bound).
        VerifyResult v;
        if (dev_vp >= dev_ht)
        {
            v.dev = dev_vp; v.h_choupo = vp.h; v.h_published = h_pub_vp;
        }
        else
        {
            v.dev = dev_ht; v.h_choupo = ht.h; v.h_published = h_pub_ht;
        }
        v.anchor =
            "vertical plate (Ex.10.3, L=1m, dT=30K): h=" + fmt(vp.h)
          + " vs ~4870; horizontal tube (Ex.10.4, D=0.05m, dT=50K): h="
          + fmt(ht.h) + " vs ~6520 W/(m^2.K) -- Incropera & DeWitt, Fund. of"
            " Heat & Mass Transfer, Ch.10 (Nusselt 1916 laminar film; tol ~15%"
            " honours film-theory scatter, NOT a 1% pin)";
        return v;
    }

private:
    // Pure Nusselt-film arithmetic, factored so verify() reuses it verbatim.
    static PhaseChangeResult evalCore(const std::string& orientation,
        scalar L, scalar dT, scalar rho_l, scalar rho_v, scalar k_l,
        scalar mu_l, scalar cp_l, scalar h_fg, scalar g)
    {
        PhaseChangeResult r;
        const scalar C = (orientation == "horizontalTube") ? 0.729 : 0.943;
        const scalar h_fg_prime = h_fg + 0.68 * cp_l * dT;
        const scalar num = k_l * k_l * k_l * rho_l * (rho_l - rho_v) * g
                         * h_fg_prime;
        const scalar den = mu_l * L * dT;
        r.h = (den > 0.0 && num > 0.0) ? C * std::pow(num / den, 0.25) : 0.0;

        // Condensate film Reynolds number Re_film = 4 h L dT / (mu_l h_fg').
        r.Re_film = (h_fg_prime > 0.0)
                  ? 4.0 * r.h * L * dT / (mu_l * h_fg_prime) : 0.0;

        // Laminar validity bound (Incropera convention).
        const bool horiz = (orientation == "horizontalTube");
        const scalar reLam = horiz ? 30.0 : 1800.0;
        if (r.Re_film <= 30.0)            r.regime = "laminar film";
        else if (r.Re_film <= 1800.0)     r.regime = "laminar-wavy film";
        else                              r.regime = "turbulent film";
        r.valid = (r.Re_film <= reLam);
        if (!r.valid)
            r.validityNote = "Re_film = " + fmt(r.Re_film) + " > "
                + fmt(reLam) + " (" + (horiz ? "single-tube laminar"
                : "wavy/turbulent") + " bound binds -- wavy/turbulent film is"
                " v2; result is the laminar Nusselt extrapolation, NOT clamped)";
        return r;
    }

    static std::string fmt(scalar x)
    {
        char buf[32];
        std::snprintf(buf, sizeof(buf), "%.1f", static_cast<double>(x));
        return std::string(buf);
    }

    inline static const std::string type_ = "NusseltFilm";
    inline static const std::string validity_ =
        "laminar film: Re_film<=30 (single horiz tube) / <=1800 (vertical,"
        " wavy); turbulent film is v2";
};

} // namespace Choupo
