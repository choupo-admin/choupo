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
    Choupo::Rohsenow

Description
    The Rohsenow (1952) NUCLEATE POOL-BOILING correlation.  The heat flux from
    a heated surface to a saturated pool, in the nucleate regime:

        q'' = mu_l h_fg sqrt( g (rho_l - rho_v) / sigma )
              * [ cp_l dT_excess / (C_sf h_fg Pr_l^s) ]^3              [W/m^2]

        dT_excess = T_surface - Tsat   (the wall SUPERHEAT -- NOT a dT_film;
                                        boiling super-heats the wall, it does
                                        not sub-cool it)
        Pr_l      = cp_l mu_l / lambda_l   (liquid Prandtl, built from ctx)
        s         = 1.0 for water, 1.7 for all other fluids (Rohsenow)

    HONESTY-AS-STRUCTURE -- the binding constraint of this whole feature:
    the nucleate flux is +/-100 % uncertain because C_sf is surface-FINISH
    lab data (polish, oxidation, wetting -- not a fluid property).  Rohsenow
    therefore REFUSES TO DEFAULT: there is NO built-in C_sf and NO catalogue
    in v1.  A flux cannot be obtained without a student-supplied C_sf AND a
    citation for where that C_sf came from.  The result CARRIES the +/-100 %
    scatter band [q/2, 2q] (a +/-25 % move in C_sf, cubed) -- the indicative
    flux is never read as if it were a reliable number.  The RELIABLE figure is
    the Zuber CHF ceiling, computed alongside.

    The cube is the load-bearing fact: q ~ dT_excess^3 AND q ~ C_sf^-3, so a
    modest C_sf error is amplified threefold -- this is WHY the band is so wide
    and why CHF (not the nucleate flux) is the design ceiling.

    References (textbook / primary):
      * Rohsenow, W.M. (1952) "A method of correlating heat transfer data for
        surface boiling of liquids", Trans. ASME 74, 969-976 -- the
        correlation.
      * Incropera & DeWitt, Fundamentals of Heat and Mass Transfer, Ch. 10
        (Table 10.1 the C_sf surface-fluid constants; the nucleate-boiling
        worked example, water on copper) -- the numeric anchor for verify().

    This base only arithmetises the correlation -- the caller pre-evaluates
    mu_l, cp_l, lambda_l, h_fg, rho_l, rho_v (at Tsat) and sigma into the
    PhaseChangeContext, and supplies C_sf (ctx.C_sf), s (ctx.n_exp) and
    dT_excess.  The citation requirement is enforced by the CALLER (it is a
    provenance string, not a numeric the correlation can check).
\*---------------------------------------------------------------------------*/

#pragma once

#include "PhaseChangeHTC.H"

#include <cmath>
#include <cstdio>
#include <stdexcept>

namespace Choupo {

class Rohsenow : public PhaseChangeHTC
{
public:
    const std::string& type() const override { return type_; }
    const std::string& validityWindow() const override { return validity_; }

    PhaseChangeResult evaluate(const PhaseChangeContext& c) const override
    {
        // REFUSAL-TO-DEFAULT: no C_sf, no flux.  C_sf < 0 means "unset".
        if (c.C_sf <= 0.0)
            throw std::runtime_error(
                "Rohsenow nucleate boiling needs a surface-fluid C_sf (no"
                " default -- it is surface-finish lab data, +/-100%); supply"
                " `Csf <value>;` and a `citation \"...\";` in the boiling{}"
                " block; e.g. water-copper Csf 0.013 from Incropera & DeWitt"
                " Table 10.1.");
        if (c.h_fg <= 0.0 || c.sigma <= 0.0 || c.rho_l <= c.rho_v
            || c.mu_l <= 0.0 || c.cp_l <= 0.0 || c.lambda_l <= 0.0)
            throw std::runtime_error(
                "Rohsenow: need h_fg, sigma, mu_l, cp_l, lambda_l > 0 and"
                " rho_l > rho_v at Tsat (check the liquid transport models).");
        if (c.dT_excess <= 0.0)
            throw std::runtime_error(
                "Rohsenow: wall superheat dT_excess = T_surface - Tsat must be"
                " > 0 (the wall must be HOTTER than Tsat to boil).");

        const scalar Pr_l = c.cp_l * c.mu_l / c.lambda_l;   // liquid Prandtl
        const scalar s    = (c.n_exp > 0.0) ? c.n_exp : 1.0;

        PhaseChangeResult r;
        r.regime = "NUCLEATE";
        r.q_flux = flux(c.mu_l, c.h_fg, c.gravity, c.rho_l, c.rho_v, c.sigma,
                        c.cp_l, c.dT_excess, c.C_sf, Pr_l, s);
        // Effective film coefficient h = q'' / dT_excess (a derived readout,
        // NOT a primary -- the flux is the physical quantity).
        r.h = r.q_flux / c.dT_excess;
        // The +/-100% scatter band: a +/-25% move in C_sf, cubed (q ~ C_sf^-3),
        // gives roughly q x [1/2, 2].  Carried in the validity note; the caller
        // prints the explicit [q/2, 2q] interval.
        r.valid = true;
        r.validityNote =
            "INDICATIVE +/-100%: nucleate flux, C_sf surface-finish lab data;"
            " scatter band ~ [q/2, 2q] (C_sf +/-25% -> flux x2, since q~C_sf^-3)";
        return r;
    }

    VerifyResult verify() const override
    {
        // ---- Anchor: water on copper, 1 atm (Incropera & DeWitt, Ch.10) ----
        // Saturated water at Tsat = 100 C boiling on a polished-copper surface
        // at Ts = 115 C  (wall superheat dT_excess = 15 K).
        // Saturated-water properties (Table A.6, 100 C):
        //   mu_l = 279e-6, h_fg = 2257e3, rho_l = 957.9, rho_v = 0.5956,
        //   sigma = 58.9e-3, cp_l = 4217, Pr_l = 1.76.
        // C_sf = 0.0130 (water-copper, polished), s = 1.0 (water).
        // Published nucleate flux q''_s ~ 4.62e5 W/m^2 (the textbook answer).
        const scalar mu_l = 279.0e-6, h_fg = 2257.0e3, rho_l = 957.9,
                     rho_v = 0.5956, sigma = 58.9e-3, cp_l = 4217.0,
                     Pr_l = 1.76, dTe = 15.0, Csf = 0.0130, s = 1.0;
        const scalar q = flux(mu_l, h_fg, 9.81, rho_l, rho_v, sigma, cp_l, dTe,
                              Csf, Pr_l, s);
        const scalar q_pub = 4.62e5;

        VerifyResult v;
        v.dev         = std::abs(q - q_pub) / q_pub;
        v.h_choupo    = q;            // reuse the slot: nucleate flux [W/m^2]
        v.h_published = q_pub;
        v.anchor =
            "water on polished copper, 1 atm (dT_excess=15K, C_sf=0.0130, s=1):"
            " q''_nucleate = " + fmt(q) + " W/m^2 vs ~4.62e5 -- Rohsenow (1952)"
            " / Incropera & DeWitt Ch.10 worked example.  This is FORMULA"
            " reproduction (the algebra is exact); the physical scatter is"
            " +/-100% (C_sf surface finish), a SEPARATE honesty statement, NOT"
            " a loosened tolerance.";
        return v;
    }

private:
    // q'' = mu_l h_fg sqrt(g(rho_l-rho_v)/sigma) [cp_l dTe/(C_sf h_fg Pr_l^s)]^3
    static scalar flux(scalar mu_l, scalar h_fg, scalar g, scalar rho_l,
                       scalar rho_v, scalar sigma, scalar cp_l, scalar dTe,
                       scalar Csf, scalar Pr_l, scalar s)
    {
        const scalar geom = std::sqrt(g * (rho_l - rho_v) / sigma);
        const scalar grp  = cp_l * dTe / (Csf * h_fg * std::pow(Pr_l, s));
        return mu_l * h_fg * geom * grp * grp * grp;        // the cube
    }

    static std::string fmt(scalar x)
    {
        char buf[32];
        std::snprintf(buf, sizeof(buf), "%.4g", static_cast<double>(x));
        return std::string(buf);
    }

    inline static const std::string type_ = "Rohsenow";
    inline static const std::string validity_ =
        "nucleate pool boiling (Rohsenow 1952); INDICATIVE +/-100% (C_sf is"
        " surface-finish lab data); CHF is the reliable ceiling";
};

} // namespace Choupo
