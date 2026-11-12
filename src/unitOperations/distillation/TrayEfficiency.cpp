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

#include "TrayEfficiency.H"

#include "core/Constants.H"

#include <algorithm>
#include <cmath>
#include <sstream>
#include <stdexcept>

namespace Choupo
{

namespace
{
    constexpr scalar g_acc = 9.80665;   // m/s^2

    void requirePositiveFinite(scalar v, const char* what, const char* hint)
    {
        if (!(v > 0.0) || !std::isfinite(v))
        {
            std::ostringstream o;
            o << "TrayEfficiency: " << what << " = " << v
              << " is not a positive finite number -- " << hint;
            throw std::runtime_error(o.str());
        }
    }
}

scalar TrayEfficiency::flowPathLength(scalar D, scalar lw)
{
    const scalar R = 0.5 * D;
    const scalar h = 0.5 * lw;
    if (!(h < R))
        throw std::runtime_error("TrayEfficiency: the weir is not shorter than "
            "the tower diameter, so there is no chord and no flow path");
    const scalar chordDepth = R - std::sqrt(R * R - h * h);
    return D - 2.0 * chordDepth;
}

// ---------------------------------------------------------------------------
//  AIChE, Treybal 3ed Eqs 6.38, 6.51-6.52, 6.61-6.64 (see the header).
// ---------------------------------------------------------------------------
void TrayEfficiency::pointAIChE(const Geometry& g, const State& s, Result& r)
{
    requirePositiveFinite(s.ScV, "the vapour Schmidt number", "it needs the gas viscosity and diffusivity");
    const scalar hw = g.weirHeight, Z = g.flowPath, zw = g.flowWidth;
    const scalar q  = s.liquidVolFlow;
    r.hL = 6.10e-3 + 0.725 * hw - 0.238 * hw * r.Fa + 1.225 * q / zw;
    requirePositiveFinite(r.hL, "the clear liquid height h_L (Treybal 6.38)",
        "the vapour load is beyond the range of the correlation");
    r.thetaL = r.hL * zw * Z / q;
    r.NG = (0.776 + 4.57 * hw - 0.238 * r.Fa + 104.6 * q / Z) / std::sqrt(s.ScV);
    requirePositiveFinite(r.NG, "N_tG (Treybal 6.61)",
        "the active-area F-factor is beyond the range of the AIChE gas-phase correlation");
    r.NL = 40000.0 * std::sqrt(s.DL) * (0.213 * r.Fa + 0.15) * r.thetaL;
    requirePositiveFinite(r.NL, "N_tL (Treybal 6.62)", "check the liquid diffusivity");
    r.NOG = 1.0 / (1.0 / r.NG + s.lambda / r.NL);
    r.EOG = 1.0 - std::exp(-r.NOG);
    const scalar sqrtDE = 3.93e-3 + 0.0171 * r.Va + 3.67 * q / Z + 0.1800 * hw;
    r.DE = sqrtDE * sqrtDE;
    r.Pe = Z * Z / (r.DE * r.thetaL);
}

// ---------------------------------------------------------------------------
//  Chan & Fair 1984, Eqs 9-26 as printed (cm and cm2/s where the paper uses
//  them).
// ---------------------------------------------------------------------------
void TrayEfficiency::pointChanFair(const Geometry& g, const State& s, Result& r)
{
    if (!(s.floodApproach > 0.0))
        throw std::runtime_error("TrayEfficiency (ChanFair): the model reads the"
            " fractional approach to flood f = U_a/U_af, and the hydraulics pass"
            " gave none -- declare the `hydraulics {}` block with a diameter");
    requirePositiveFinite(s.rhoL, "the liquid density", "the package must price the liquid");
    requirePositiveFinite(s.DV, "the vapour diffusivity", "declare a Fuller diffusivity");
    const scalar Ua   = r.Va;
    const scalar hwcm = 100.0 * g.weirHeight;
    const scalar Ks   = Ua * std::sqrt(s.rhoV / (s.rhoL - s.rhoV));         // (14)
    const scalar phie = std::exp(-12.55 * std::pow(Ks, 0.91));              // (12)
    const scalar C    = 0.0327 + 0.0286 * std::exp(-1.378 * hwcm);          // (13)
    const scalar qL   = s.liquidVolFlow / g.weirLength;                     // m3/(s m)
    const scalar hLcm = phie * hwcm + 1533.0 * phie * C * std::pow(qL / phie, 2.0 / 3.0); // (11)
    requirePositiveFinite(hLcm, "the clear liquid h_L (Chan-Fair 11)", "check the tray loads");
    r.hL = hLcm / 100.0;
    r.thetaL = hLcm * g.activeArea / (100.0 * s.liquidVolFlow);              // (10)
    const scalar tV = (1.0 - phie) * hLcm / (100.0 * phie * Ua);             // (24)
    const scalar f  = s.entrainment ? std::min(s.floodApproach, 0.6) : s.floodApproach;
    const scalar DVcm = s.DV * 1.0e4, DLcm = s.DL * 1.0e4;                  // cm2/s
    const scalar kVa = std::sqrt(DVcm) * (1030.0 * f - 867.0 * f * f) / std::sqrt(hLcm); // (26)
    const scalar kLa = (0.40 * r.Fa + 0.17) * (197.0 * std::sqrt(DLcm));     // (20)
    r.NG = kVa * tV;                                                         // (18)
    r.NL = kLa * r.thetaL;                                                   // (19)
    requirePositiveFinite(r.NG, "N_V (Chan-Fair 18, 26)", "f is outside the range where (26) is positive");
    requirePositiveFinite(r.NL, "N_L (Chan-Fair 19, 20)", "check the liquid diffusivity");
    r.NOG = 1.0 / (1.0 / r.NG + s.lambda / r.NL);                            // (17)
    r.EOG = 1.0 - std::exp(-r.NOG);                                          // (16)
    r.DE  = 6.675e-3 * std::pow(Ua, 1.44) + 0.922e-3 * hLcm - 5.62e-3;       // (9), m2/s
    if (r.DE > 0.0)
        r.Pe = g.flowPath * g.flowPath / (r.DE * r.thetaL);                  // (7)
    else
        r.plugFlow = true;
}

// ---------------------------------------------------------------------------
//  Syeda, Afacan & Chuang 2007, Eqs 1-35 (two readings, see the header);
//  conversion per Garcia & Fair 2000 Eq 12.
// ---------------------------------------------------------------------------
void TrayEfficiency::pointSyedaChuang(const Geometry& g, const State& s, Result& r)
{
    requirePositiveFinite(g.holeDiameter, "the hole diameter", "declare it in the hydraulics block");
    requirePositiveFinite(g.holeAreaFrac, "the hole area fraction", "declare it in the hydraulics block");
    requirePositiveFinite(g.holePitch, "the hole pitch", "declare `holePitch` in the efficiency block");
    requirePositiveFinite(s.rhoL, "the liquid density", "the package must price the liquid");
    requirePositiveFinite(s.DV, "the vapour diffusivity", "declare a Fuller diffusivity");
    requirePositiveFinite(s.sigma, "the surface tension", "declare a surface-tension model");
    requirePositiveFinite(s.muL, "the liquid viscosity", "declare one");
    requirePositiveFinite(s.cGoverCL, "the molar density ratio", "internal");
    if (!(s.rhoV > 1.0 && s.rhoV < 80.0))
        throw std::runtime_error("TrayEfficiency (SyedaChuang): Zuiderweg's jet k_G"
            " (Syeda Eq 29) is stated for 1 < rho_G < 80 kg/m3; this tray's vapour"
            " is outside it");
    const scalar Qv = s.vapourVolFlow;
    const scalar ua = r.Va;
    const scalar us = Qv / g.towerArea;
    const scalar uH = Qv / (g.holeAreaFrac * g.activeArea);
    const scalar hw = g.weirHeight;

    //  Large bubbles (7)-(11), Bennett froth height (13)-(15).
    const scalar d32L = 0.887 * std::pow(g.holeDiameter, 0.846) * std::pow(uH, 0.21);   // (9)
    const scalar VLB  = constant::pi * d32L * d32L * d32L / 6.0;
    const scalar ULB  = 2.5 * std::pow(VLB, 1.0 / 6.0) + ua;                             // (10)
    const scalar alphae = std::exp(-12.55 * std::pow(us * std::sqrt(s.rhoV / (s.rhoL - s.rhoV)), 0.91)); // (14)
    const scalar C    = 0.5 + 0.438 * std::exp(-137.8 * hw);                             // (15)
    const scalar hf   = hw + C * std::pow(s.liquidVolFlow / (g.weirLength * alphae), 0.67); // (13)
    const scalar tGLB = hf / ULB;                                                        // (8)
    const scalar aiG  = 6.0 / d32L;                                                      // (7)
    const scalar PeG  = d32L * ULB / s.DV;
    scalar Sh = 17.9;
    if (PeG <= 200.0)
    {
        const scalar lp = std::log10(PeG);
        Sh = -11.878 + 25.879 * lp - 5.64 * lp * lp;                                     // (12)
        if (PeG < 40.0) r.ShOutOfRange = true;
    }
    requirePositiveFinite(Sh, "the asymptotic Sherwood number (Syeda 12)", "Pe_G is far outside 40-200");
    const scalar kG   = Sh * s.DV / d32L;
    const scalar NG   = aiG * kG * tGLB;                                                 // (3)
    const scalar aiLtL = s.rhoL / s.rhoV * s.GoverL * aiG * tGLB;                        // (5)
    const scalar kL   = 1.13 * std::sqrt(s.DL / tGLB);                                   // (11)
    const scalar NL   = aiLtL * kL;                                                      // (4)
    const scalar NOGLB = 1.0 / (1.0 / NG + s.lambda / NL);
    const scalar ELB  = 1.0 - std::exp(-NOGLB);                                          // (6)

    //  Small bubbles (16), (22), (28) with t_GLB, C'' = 0.16, d32L/d32S = 5.
    const scalar Cpp  = 0.16;
    const scalar kDt  = Cpp * (3.8 * std::pow(s.rhoL, 0.1) * std::pow(s.rhoV, 0.3)
                              / std::pow(s.sigma, 0.4)) * std::pow(us * g_acc, 0.6) * tGLB;   // (28) with Delta t = n t_GLB (see header)
    const scalar e    = std::exp(-kDt);
    r.FSB = 2.0 * (1.0 - e) / (2.0 * (1.0 - e) + 125.0 * e);                             // (22)
    const scalar EB   = (1.0 - r.FSB) * ELB + r.FSB * 1.0;                               // (2), (16)

    //  Jetting zone, Zuiderweg's spray model (29)-(34).
    const scalar kGj  = 0.13 / s.rhoV - 0.065 / (s.rhoV * s.rhoV);                       // (29)
    const scalar kLj  = 2.6e-5 / std::pow(s.muL, 0.25);                                  // (30)
    const scalar KOGj = 1.0 / (1.0 / kGj + s.m * s.cGoverCL / kLj);
    const scalar FP   = std::sqrt(s.rhoV / s.rhoL);                                      // (34)
    const scalar b    = g.weirLength / g.activeArea;
    const scalar hLz  = 0.6 * std::sqrt(hw) * std::pow(g.holePitch / b * FP, 0.25);      // (33) read with h_w^0.5 (see header)
    const scalar ahf  = 40.0 / std::pow(g.holeAreaFrac, 0.3)
                      * std::pow(r.Fa * r.Fa * hLz * FP / s.sigma, 0.37);                // (32)
    const scalar Ej   = 1.0 - std::exp(-ahf * KOGj / us);                                // (31)
    r.fj = std::max(0.0, -0.1786 + 0.9857 * (1.0 - std::exp(-1.43 * r.Fa)));            // (35)
    r.EOG = (1.0 - r.fj) * EB + r.fj * Ej;                                               // (1)
    r.NG = NG;  r.NL = NL;  r.NOG = -std::log(std::max(1.0e-300, 1.0 - r.EOG));

    //  Point -> Murphree: Garcia & Fair 2000 Eqs (12)-(13).
    r.hL = alphae * hf;                                    // Bennett clear liquid
    r.thetaL = r.hL * g.activeArea / s.liquidVolFlow;
    r.DE = 0.02366 * std::pow(hf, 1.5) * std::sqrt(g_acc);
    r.Pe = g.flowPath * g.flowPath / (r.DE * r.thetaL);
}

// ---------------------------------------------------------------------------
void TrayEfficiency::murphree(const State& s, Result& r)
{
    const scalar lE = s.lambda * r.EOG;
    if (r.plugFlow)
        r.EMVdry = (lE > 1.0e-12) ? (std::exp(lE) - 1.0) / s.lambda : r.EOG;  // Lewis case 1
    else if (lE <= 1.0e-12)
        r.EMVdry = r.EOG;
    else
    {
        requirePositiveFinite(r.Pe, "the liquid Peclet number", "check the flow path length");
        //  eta = (Pe/2)[(1 + 4 lE/Pe)^0.5 - 1], written so it does not cancel.
        r.eta = 2.0 * lE / (std::sqrt(1.0 + 4.0 * lE / r.Pe) + 1.0);
        const scalar ep = r.eta + r.Pe;
        const scalar t1 = (1.0 - std::exp(-ep)) / (ep * (1.0 + ep / r.eta));
        const scalar t2 = (std::exp(r.eta) - 1.0) / (r.eta * (1.0 + r.eta / ep));
        r.EMVdry = r.EOG * (t1 + t2);
    }
    requirePositiveFinite(r.EMVdry, "the dry Murphree efficiency", "check the inputs");

    //  Entrainment, Colburn (Perry 14-98) with Fair's median psi (Perry 14-99).
    r.EMV = r.EMVdry;
    if (s.entrainment)
    {
        if (!(s.floodApproach >= 0.0))
            throw std::runtime_error("TrayEfficiency: the entrainment correction needs"
                " the approach to flood from the hydraulics pass");
        const scalar Phi = s.floodApproach;
        r.psi = std::exp(-3.2108 - 8.9049 * Phi + 11.6291 * Phi * Phi);
        if (r.psi >= 1.0)
            throw std::runtime_error("TrayEfficiency: Fair's entrainment correlation"
                " gives psi >= 1 at this approach to flood -- the tray is past"
                " entrainment flood and has no Murphree efficiency to report");
        r.EMV = r.EMVdry / (1.0 + r.EMVdry * r.psi / (1.0 - r.psi));
    }
}

TrayEfficiency::Result TrayEfficiency::evaluate(Model model, const Geometry& g, const State& s)
{
    Result r;
    requirePositiveFinite(g.activeArea, "the active area", "declare the tray geometry");
    requirePositiveFinite(s.vapourVolFlow, "the vapour flow", "a tray with no vapour is not a tray");
    requirePositiveFinite(s.liquidVolFlow, "the liquid flow", "a dry tray has no liquid-phase resistance to evaluate");
    requirePositiveFinite(s.rhoV, "the vapour density", "the package must price the vapour");
    requirePositiveFinite(s.DL, "the liquid diffusivity", "it needs a liquid viscosity and Wilke-Chang");
    r.Va = s.vapourVolFlow / g.activeArea;
    r.Fa = r.Va * std::sqrt(s.rhoV);
    switch (model)
    {
        case Model::AIChE:       pointAIChE(g, s, r); break;
        case Model::ChanFair:    pointChanFair(g, s, r); break;
        case Model::SyedaChuang: pointSyedaChuang(g, s, r); break;
    }
    requirePositiveFinite(r.EOG, "the point efficiency", "check the inputs");
    murphree(s, r);
    return r;
}

} // namespace Choupo
