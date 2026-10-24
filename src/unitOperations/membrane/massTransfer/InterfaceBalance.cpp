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
  THE FIELD-LEVEL HALF of the wall's one home (Polarisation.H declares it):
  the suction factor and its slope, and the interface balance at a GIVEN
  field with its derivatives.  Split from Polarisation.cpp on 2026-10-24
  (DEV.md 4c C142) for one reason only -- it reads no dictionary and no
  thermo package, so the solved DSPM-DE pore, which folds the wall into its
  own Newton, and bin/curate/_poreSolverProbe.cpp, which the gate compiles
  against the pore solver's sources alone, link it without the rest.  The
  kernel in Polarisation.cpp and wallAtField here evaluate C_m with the SAME
  helper (detail::wallAt, Polarisation.H).
\*---------------------------------------------------------------------------*/

#include "Polarisation.H"

#include "core/Advisory.H"

#include <algorithm>
#include <cmath>
#include <cstdio>
#include <string>

namespace Choupo {
namespace membrane {

namespace {

std::string fmtIB(scalar v)
{
    char b[32];
    std::snprintf(b, sizeof(b), "%.6g", static_cast<double>(v));
    return b;
}

} // namespace

// ---------------------------------------------------------------------------
//  Xi_i  (Eq. 5 / Eq. 6 / 1)
// ---------------------------------------------------------------------------
scalar suctionFactor(SuctionCorrection s, scalar phi)
{
    if (s == SuctionCorrection::None) return 1.0;
    if (phi == 0.0) return 1.0;
    //  A negative phi is a numerical probe (an outer Newton's finite
    //  difference straddling J_v = 0), never an operating point: the film
    //  form is defined there and used for both corrections.
    if (s == SuctionCorrection::FilmTheory || phi < 0.0)
        return phi + phi / std::expm1(phi);                         // (6)
    //  Geraldes & Afonso, AIChE J. 52 (2006) 3353, valid for phi < 20.
    if (phi >= 20.0)
        AdvisoryLog::instance().add("extrapolation", "warning",
            "polarisation suctionCorrection GeraldesAfonso2006",
            "phi = J_v/k_c reached 20 or more; the correction of Geraldes &"
            " Afonso (2006), Eq. (5), was derived for phi < 20 and is being"
            " extrapolated -- the wall concentration beyond that band is"
            " outside the correlation's evidence");
    return phi + std::pow(1.0 + 0.26 * std::pow(phi, 1.4), -1.7);     // (5)
}

// ---------------------------------------------------------------------------
//  dXi/dphi  (the derivative of Eq. 5 / Eq. 6 / 0) -- C142
// ---------------------------------------------------------------------------
scalar suctionFactorSlope(SuctionCorrection s, scalar phi)
{
    if (s == SuctionCorrection::None) return 0.0;
    if (s == SuctionCorrection::FilmTheory || phi < 0.0)
    {
        //  Xi = phi + g(phi), g = phi/(e^phi - 1);  g' = (e^phi - 1 - phi
        //  e^phi)/(e^phi - 1)^2, which cancels near 0, where its series
        //  -1/2 + phi/6 - phi^3/180 + phi^5/5040 is used.
        if (std::abs(phi) < 1.0e-3)
            return 1.0 - 0.5 + phi / 6.0 - phi * phi * phi / 180.0;
        const scalar em1 = std::expm1(phi);
        const scalar g   = phi / em1;
        //  g' = g (1 - phi - g)/phi  (the identity g(-phi) = g(phi) + phi)
        return 1.0 + g * (1.0 - phi - g) / phi;
    }
    if (phi == 0.0) return 1.0;
    //  d/dphi (1 + 0.26 phi^1.4)^-1.7 = -1.7 (1 + 0.26 phi^1.4)^-2.7 0.364 phi^0.4
    return 1.0 - 1.7 * std::pow(1.0 + 0.26 * std::pow(phi, 1.4), -2.7)
                     * 0.26 * 1.4 * std::pow(phi, 0.4);
}

// ---------------------------------------------------------------------------
//  The interface balance at a GIVEN field, with its derivatives (C142)
// ---------------------------------------------------------------------------
WallAtField wallAtField(SuctionCorrection          suction,
                        bool                       coupled,
                        scalar                     J_v,
                        const std::vector<scalar>& k,
                        const std::vector<scalar>& D,
                        const std::vector<int>&    z,
                        const std::vector<scalar>& c_b,
                        const std::vector<scalar>& c_p,
                        scalar                     xiPrime,
                        const std::vector<scalar>* B)
{
    const std::size_t n = c_b.size();
    WallAtField w;
    w.c_m.assign(n, 0.0);
    w.dc_dcp.assign(n, 0.0);
    w.dc_dxi.assign(n, 0.0);
    w.dc_dJ.assign(n, 0.0);
    for (std::size_t i = 0; i < n; ++i)
    {
        if (!(k[i] > 0.0) || !std::isfinite(k[i]))
        {
            w.ok = false;
            w.reason = "solute " + std::to_string(i) + ": film coefficient k = "
                     + fmtIB(k[i]) + " m/s";
            return w;
        }
        const scalar phi   = J_v / k[i];
        const scalar Xi    = suctionFactor(suction, phi);
        const scalar dXi   = suctionFactorSlope(suction, phi);   // dk*/dJ_v
        const scalar kstar = k[i] * Xi;
        const scalar zDxi  = (coupled && z[i] != 0) ? scalar(z[i]) * D[i] * xiPrime : 0.0;
        const scalar dzDxi = (coupled && z[i] != 0) ? scalar(z[i]) * D[i] : 0.0;
        scalar cm, den, dDen_dJ, dNum_dJ, dNum_dcp;
        if (B)
        {
            //  the solution-diffusion closure: C_p = B C_m/(J_v + B)
            const scalar Bi = (*B)[i];
            const scalar JB = J_v + Bi;
            const scalar r  = (JB > 0.0) ? J_v * Bi / JB : 0.0;
            den      = (kstar - J_v) + zDxi + r;
            cm       = kstar * c_b[i] / den;
            dNum_dJ  = dXi * c_b[i];
            dDen_dJ  = dXi - 1.0 + ((JB > 0.0) ? Bi * Bi / (JB * JB) : 0.0);
            dNum_dcp = 0.0;
        }
        else
        {
            den      = (kstar - J_v) + zDxi;
            cm       = detail::wallAt(kstar, J_v, c_b[i], c_p[i], zDxi);
            dNum_dJ  = dXi * c_b[i] - c_p[i];
            dDen_dJ  = dXi - 1.0;
            dNum_dcp = -J_v;
        }
        if (!(den > 0.0) || !(cm > 0.0) || !std::isfinite(cm))
        {
            w.ok = false;
            w.reason = "solute " + std::to_string(i) + ": the interface balance"
                       " gives C_m = " + fmtIB(cm) + " (denominator " + fmtIB(den)
                     + ") at J_v = " + fmtIB(J_v) + " m/s, xi' = " + fmtIB(xiPrime)
                     + " 1/m -- no positive wall concentration";
            return w;
        }
        w.c_m[i]    = cm;
        w.dc_dcp[i] = dNum_dcp / den;
        w.dc_dxi[i] = -cm * dzDxi / den;
        w.dc_dJ[i]  = (dNum_dJ - cm * dDen_dJ) / den;
    }
    return w;
}

} // namespace membrane
} // namespace Choupo
