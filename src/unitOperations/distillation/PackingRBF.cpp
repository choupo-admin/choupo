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
\*---------------------------------------------------------------------------*/

#include "PackingRBF.H"

#include "core/Constants.H"

#include <cmath>
#include <sstream>
#include <stdexcept>

namespace Choupo
{

namespace
{
    constexpr scalar g_acc = 9.80665;

    void requirePositive(scalar v, const char* what)
    {
        if (!(v > 0.0) || !std::isfinite(v))
        {
            std::ostringstream o;
            o << "PackingRBF: " << what << " = " << v << " must be positive and finite";
            throw std::runtime_error(o.str());
        }
    }
}

PackingRBF::Result PackingRBF::evaluate(const Geometry& g, const State& s)
{
    requirePositive(g.ap, "the specific area a_p");
    requirePositive(g.eps, "the void fraction");
    requirePositive(g.theta, "the corrugation angle");
    requirePositive(g.S, "the corrugation side S");
    requirePositive(s.UGs, "the superficial gas velocity");
    requirePositive(s.ULs, "the superficial liquid velocity");
    requirePositive(s.rhoG, "the gas density");
    requirePositive(s.rhoL, "the liquid density");
    requirePositive(s.muG, "the gas viscosity");
    requirePositive(s.muL, "the liquid viscosity");
    requirePositive(s.sigma, "the surface tension");
    requirePositive(s.DG, "the gas diffusivity");
    requirePositive(s.DL, "the liquid diffusivity");

    Result r;
    const scalar sth  = std::sin(g.theta);
    const scalar S    = g.S, eps = g.eps;
    //  (27)-(28): cos(gamma) = 0.9 below sigma = 0.055 N/m.  Eq 28, for an
    //  aqueous liquid above it, is printed "5.211 x 10-16.835 sigma" and its
    //  reading is ambiguous in the scan, so that branch is refused, not guessed.
    if (!(s.sigma < 0.055))
        throw std::runtime_error("PackingRBF: sigma >= 0.055 N/m needs Eq 28 of"
            " Rocha-Bravo-Fair 1993, whose printed exponent is ambiguous in the"
            " scan; not implemented");
    const scalar cosGamma = 0.9;

    //  Liquid groups (part 1 nomenclature).
    const scalar ReL = s.ULs * S * s.rhoL / s.muL;
    const scalar WeL = s.ULs * s.ULs * s.rhoL * S / s.sigma;
    const scalar FrL = s.ULs * s.ULs / (S * g_acc);
    const scalar areaGroup = 29.12 * std::pow(WeL * FrL, 0.15) * std::pow(S, 0.359)
        / (std::pow(ReL, 0.2) * std::pow(eps, 0.6) * (1.0 - 0.93 * cosGamma) * std::pow(sth, 0.3));
    r.Ft = areaGroup;                                                     // (25)

    //  Dry pressure drop (23), K2 (29).
    const scalar A  = 0.177 * s.rhoG / (S * eps * eps * sth * sth);
    const scalar B  = 88.774 * s.muG / (S * S * eps * sth);
    r.dPdry = A * s.UGs * s.UGs + B * s.UGs;
    const scalar K2 = 0.614 + 71.35 * S;

    //  (20), (24), (26) by damped substitution on dP/dZ.
    scalar dP = r.dPdry;
    bool ok = false;
    for (int it = 0; it < 500; ++it)
    {
        const scalar geff = g_acc * ((s.rhoL - s.rhoG) / s.rhoL) * (1.0 - dP / g.dPflood);
        if (!(geff > 0.0)) break;
        const scalar hL = std::pow(4.0 * r.Ft / S, 2.0 / 3.0)
                        * std::cbrt(3.0 * s.muL * s.ULs / (s.rhoL * sth * eps * geff));
        const scalar den = 1.0 - K2 * hL;
        if (!(den > 0.0)) break;
        const scalar dPnew = r.dPdry / std::pow(den, 5.0);
        if (!(dPnew < g.dPflood)) break;
        const scalar next = 0.5 * dP + 0.5 * dPnew;
        r.hL = hL; r.geff = geff;
        if (std::abs(next - dP) <= 1.0e-12 * dPnew)
        { dP = dPnew; ok = true; break; }
        dP = next;
    }
    if (!ok)
    {
        r.flooded = true;
        r.dP = g.dPflood;
        return r;
    }
    r.dP = dP;

    //  Mass transfer (1996): (5)-(9), area (14) or (10), (16)-(17).
    const scalar Uge = s.UGs / (eps * (1.0 - r.hL) * sth);
    const scalar ULe = s.ULs / (eps * r.hL * sth);
    r.kG = 0.054 * (s.DG / S) * std::pow((Uge + ULe) * s.rhoG * S / s.muG, 0.8)
         * std::pow(s.muG / (s.DG * s.rhoG), 0.33);
    r.kL = 2.0 * std::sqrt(s.DL * g.CE * ULe / (constant::pi * S));
    const scalar beta = g.gauze ? 1.0 - 1.203 * std::pow(FrL, 0.111)
                                : g.FSE * areaGroup;
    requirePositive(beta, "the effective-area ratio a_e/a_p");
    r.ae = beta * g.ap;
    r.HG = s.UGs / (r.kG * r.ae);
    r.HL = s.ULs / (r.kL * r.ae);
    r.HOG = r.HG + s.lambda * r.HL;
    const scalar lam = s.lambda;
    r.HETP = (std::abs(lam - 1.0) < 1.0e-9) ? r.HOG
           : r.HOG * std::log(lam) / (lam - 1.0);
    return r;
}

} // namespace Choupo
