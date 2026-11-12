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

#include "PackingDelft.H"

#include "core/Constants.H"

#include <algorithm>
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
            o << "PackingDelft: " << what << " = " << v << " must be positive and finite";
            throw std::runtime_error(o.str());
        }
    }
}

PackingRBF::Result PackingDelft::evaluate(const Geometry& g, const PackingRBF::State& s)
{
    requirePositive(g.ap, "the specific area");
    requirePositive(g.eps, "the void fraction");
    requirePositive(g.alpha, "the corrugation angle");
    requirePositive(g.b, "the corrugation base");
    requirePositive(g.h, "the corrugation height");
    requirePositive(g.hpe, "the element height");
    requirePositive(g.hpb, "the bed height");
    requirePositive(g.dc, "the column diameter");
    requirePositive(s.UGs, "the gas velocity");
    requirePositive(s.ULs, "the liquid velocity");

    PackingRBF::Result r;
    const scalar sa = std::sin(g.alpha), ca = std::cos(g.alpha), ta = std::tan(g.alpha);
    const scalar b = g.b, h = g.h;
    const scalar sside = std::sqrt(b * b / 4.0 + h * h);                         // (3)

    //  Holdup and film (Table 4, Eqs 32-33): complete wetting, gravity only.
    const scalar delta = std::cbrt(3.0 * s.muL * s.ULs / (s.rhoL * g_acc * g.ap * sa));
    r.hL = delta * g.ap;
    //  Hydraulic diameter of the gas channel (Table 2, Eq 11).
    const scalar q = b * h - 2.0 * delta * sside;
    requirePositive(q, "the free channel section (b h - 2 delta s)");
    const scalar dhG = (q * q / (b * h))
        / (std::sqrt(std::pow(q / (2.0 * h), 2.0) + std::pow(q / b, 2.0)) + q / (2.0 * h));
    const scalar uGe = s.UGs / (g.eps * (1.0 - r.hL) * sa);                      // (6)
    const scalar uLe = s.ULs / (g.eps * r.hL * sa);                              // (7)
    const scalar ReGe  = s.rhoG * uGe * dhG / s.muG;                             // (34)
    const scalar ReGrv = s.rhoG * (uGe + uLe) * dhG / s.muG;                     // (36)
    const scalar phi   = 2.0 * sside / (b + 2.0 * sside);                        // (31)
    const scalar lGpe  = g.hpe / sa;                                             // (30)

    //  Preloading pressure drop (Eqs 38-45).
    const scalar rel = delta / dhG / 3.7;
    const scalar xiGL = std::pow(-2.0 * std::log10(rel - 5.02 / ReGrv
                                 * std::log10(rel + 14.5 / ReGrv)), -2.0);        // (40)
    const scalar zGL = phi * xiGL * g.hpb / (dhG * sa);                          // (39)
    const scalar zGG = (1.0 - phi) * 0.722 * std::pow(ca, 3.14) * g.hpb / (dhG * sa); // (41)
    const scalar r2  = g.dc * g.dc - g.hpe * g.hpe / (ta * ta);
    requirePositive(r2, "the chord term of psi");
    const scalar psi = 2.0 * g.hpe / (constant::pi * g.dc * g.dc * ta) * std::sqrt(r2)
                     + 2.0 / constant::pi * std::asin(g.hpe / (g.dc * ta));      // (43)
    const scalar xiBulk = 1.76 * std::pow(ca, 1.63);                             // (44)
    const scalar xiWall = (4092.0 * std::pow(s.ULs, 0.31) + 4715.0 * std::pow(ca, 0.445)) / ReGe
                        + 34.19 * std::pow(s.ULs, 0.44) * std::pow(ca, 0.779);   // (45)
    const scalar zDC = g.hpb / g.hpe * (xiBulk + psi * xiWall);                  // (42)
    const scalar dPbed = (zGL + zGG + zDC) * s.rhoG * uGe * uGe / 2.0;           // (38), Pa over the bed
    r.dPdry = dPbed / g.hpb;

    //  Loading region (Table 2, Eqs 8-10).
    const scalar FG  = s.UGs * std::sqrt(s.rhoG);
    const scalar FGlp = std::sqrt(0.053 * g.eps * g.eps * g_acc * dhG * (s.rhoL - s.rhoG)
        * std::pow(s.ULs / s.UGs * std::sqrt(s.rhoL / s.rhoG), -0.25) * std::pow(sa, 1.15));
    scalar Fload = 1.0;
    if (FG > FGlp)
        Fload = std::max(1.0, 3.8 * std::pow(FG / FGlp, 2.0 / sa)
                     * std::pow(s.ULs * s.ULs / (g.eps * g.eps * g_acc * dhG), 0.13));
    r.dP = r.dPdry * Fload;
    r.geff = FGlp;                     // carried for the report: the loading point

    //  Effective area (Table 4) and mass transfer (Eqs 47-53).
    const scalar beta = (1.0 - g.Omega) / (1.0 + 2.143e-6 / std::pow(s.ULs, 1.5));
    r.ae = beta * g.ap;
    const scalar ScG = s.muG / (s.rhoG * s.DG);
    const scalar ShLam = 0.664 * std::cbrt(ScG) * std::sqrt(ReGrv * dhG / lGpe);
    const scalar c = xiGL * phi / 8.0;
    const scalar ShTurb = ReGrv * ScG * c / (1.0 + 12.7 * std::sqrt(c) * (std::pow(ScG, 2.0 / 3.0) - 1.0))
                        * (1.0 + std::pow(dhG / lGpe, 2.0 / 3.0));
    const scalar kLam = ShLam * s.DG / dhG, kTurb = ShTurb * s.DG / dhG;
    r.kG = std::sqrt(kLam * kLam + kTurb * kTurb);
    r.kL = 2.0 * std::sqrt(s.DL * uLe / (constant::pi * 0.9 * dhG));
    r.HG = s.UGs / (r.kG * r.ae);
    r.HL = s.ULs / (r.kL * r.ae);
    r.HOG = r.HG + s.lambda * r.HL;
    r.HETP = (std::abs(s.lambda - 1.0) < 1.0e-9) ? r.HOG
           : r.HOG * std::log(s.lambda) / (s.lambda - 1.0);
    r.Ft = dhG;                        // carried for the report
    return r;
}

} // namespace Choupo
