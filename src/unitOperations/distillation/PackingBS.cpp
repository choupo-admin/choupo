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
    Choupo::PackingBS -- see PackingBS.H for every equation and its source.
\*---------------------------------------------------------------------------*/

#include "PackingBS.H"

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
            o << "PackingBS: " << what << " = " << v << " must be positive and finite";
            throw std::runtime_error(o.str());
        }
    }

    //  Bisection on [lo, hi] for f(lo) and f(hi) of opposite sign.
    template <class F>
    scalar bisect(F f, scalar lo, scalar hi)
    {
        scalar flo = f(lo);
        for (int it = 0; it < 200; ++it)
        {
            const scalar mid = 0.5 * (lo + hi);
            const scalar fm = f(mid);
            if ((fm > 0.0) == (flo > 0.0)) { lo = mid; flo = fm; } else hi = mid;
            if (hi - lo <= 1.0e-15 * std::max(1.0, std::abs(hi))) break;
        }
        return 0.5 * (lo + hi);
    }
}

PackingBS::Result PackingBS::evaluate(const Geometry& g, const PackingRBF::State& s)
{
    requirePositive(g.ap, "the specific area a");
    requirePositive(g.eps, "the void fraction");
    requirePositive(g.CS, "the constant C_S (Table 2)");
    requirePositive(g.CFl, "the constant C_Fl (Table 2)");
    requirePositive(g.Ch, "the constant C_h (Table 2)");
    requirePositive(g.CP0, "the constant C_P,0 (Table 2)");
    requirePositive(g.CL, "the constant C_L (Table 2)");
    requirePositive(g.CV, "the constant C_V (Table 2)");
    requirePositive(g.colDiameter, "the column diameter");
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
    const scalar a = g.ap, eps = g.eps;
    const scalar uV = s.UGs, uL = s.ULs;
    const scalar nuL = s.muL / s.rhoL, nuV = s.muG / s.rhoG;
    const scalar dh = 4.0 * eps / a;                                      // (10)
    const scalar LV = uL * s.rhoL / (uV * s.rhoG);                        // mass L/V
    const scalar flowPar = LV * std::sqrt(s.rhoG / s.rhoL);
    const scalar etaRatio = s.muL / s.muG;

    //  ---- Window (Table 1, mass-transfer column) -------------------------
    auto check = [&](const char* name, const char* unit, scalar v, scalar lo, scalar hi)
    { if (v < lo || v > hi) r.outside.push_back({name, unit, v, lo, hi}); };
    check("F_V", "Pa^0.5", uV * std::sqrt(s.rhoG), 0.003, 2.77);
    check("u_L", "m3/m2/h", uL * 3600.0, 0.256, 118.0);
    check("rho_L", "kg/m3", s.rhoL, 361.0, 1237.0);
    check("nu_L", "m2/s", nuL, 0.14e-6, 1.66e-6);
    check("sigma", "N/m", s.sigma, 0.7e-3, 74.0e-3);
    check("D_L", "m2/s", s.DL, 0.29e-9, 6.5e-9);
    check("rho_V", "kg/m3", s.rhoG, 0.07, 97.0);
    check("nu_V", "m2/s", nuV, 0.14e-6, 126.0e-6);
    check("D_V", "m2/s", s.DG, 0.29e-6, 87.4e-6);

    //  ---- Holdup below loading, (41)-(43) --------------------------------
    const scalar ReL = uL * s.rhoL / (a * s.muL);
    const scalar FrL = uL * uL * a / g_acc;
    const scalar ahOverA = (ReL < 5.0)
        ? g.Ch * std::pow(ReL, 0.15) * std::pow(FrL, 0.1)
        : g.Ch * 0.85 * std::pow(ReL, 0.25) * std::pow(FrL, 0.1);
    const scalar hLS = std::cbrt(12.0 * nuL * uL * a * a / g_acc) * std::pow(ahOverA, 2.0 / 3.0);
    r.hLS = hLS;

    //  ---- Loading point, (31)-(35) ----------------------------------------
    const bool hiFlow = (flowPar >= 0.4);
    const scalar nS = hiFlow ? -0.723 : -0.326;
    const scalar CSeff = hiFlow ? 0.695 * g.CS * std::pow(etaRatio, 0.1588) : g.CS;
    const scalar psiS = g_acc / (CSeff * CSeff)
        * std::pow(flowPar * std::pow(etaRatio, 0.4), -2.0 * nS);         // (32)
    auto rhsLoad = [&](scalar u)                                          // (31)
    {
        const scalar uLS = (s.rhoG / s.rhoL) * LV * u;                    // (33)
        const scalar X = 12.0 * nuL * uLS / g_acc;
        const scalar br = eps / std::pow(a, 1.0 / 6.0) - std::sqrt(a) * std::cbrt(X);
        return std::sqrt(g_acc / psiS) * br * std::pow(X, 1.0 / 6.0)
             * std::sqrt(s.rhoL / s.rhoG);
    };
    //  the bracket of (31) vanishes at X = eps^3/a^2: no root lies above the
    //  gas velocity that gives it.
    const scalar uHi = std::pow(eps, 3.0) / (a * a) * g_acc / (12.0 * nuL)
                     * (s.rhoL / s.rhoG) / LV;
    r.uVS = bisect([&](scalar u) { return rhsLoad(u) - u; }, 1.0e-9 * uHi, uHi);

    //  ---- Flooding point, (36)-(40), (13) ---------------------------------
    const scalar nFl = hiFlow ? -0.708 : -0.194;
    const scalar CFleff = hiFlow ? 0.6244 * g.CFl * std::pow(etaRatio, 0.1028) : g.CFl;
    const scalar psiFl = g_acc / (CFleff * CFleff)
        * std::pow(flowPar * std::pow(etaRatio, 0.2), -2.0 * nFl);        // (37)
    auto uFlOf = [&](scalar h)
    {
        return std::sqrt(2.0) * std::sqrt(g_acc / psiFl * std::pow(eps - h, 1.5) / std::sqrt(eps))
             * std::sqrt(h / a) * std::sqrt(s.rhoL / s.rhoG);
    };
    auto resFlood = [&](scalar h)                                         // (13)
    {
        return h * h * h * (3.0 * h - eps)
             - 6.0 / g_acc * a * a * eps * nuL * LV * (s.rhoG / s.rhoL) * uFlOf(h);
    };
    const scalar hFl = bisect(resFlood, eps / 3.0, eps);
    r.uVFl = uFlOf(hFl);
    r.floodFraction = uV / r.uVFl;
    if (!(r.uVS < r.uVFl))
        throw std::runtime_error("PackingBS: the loading point (u_V,S = " + std::to_string(r.uVS)
            + " m/s) is not below the flooding point (u_V,Fl = " + std::to_string(r.uVFl)
            + " m/s) for this packing's constants at this L/V; no interpolation (Eqs 12, 14, 16) exists.");
    if (uV >= r.uVFl)
    {
        r.flooded = true;
        return r;
    }

    //  ---- Holdup, effective velocity, interface ----------------------------
    const scalar sigma = std::max(s.sigma, g.sigmaFloor);
    r.sigmaFloored = (s.sigma < g.sigmaFloor);
    auto aphOverA = [&](scalar sg, scalar factor)                         // (9), (15)
    {
        return factor * std::pow(a * dh, -0.5) * std::pow(uL * dh / nuL, -0.2)
             * std::pow(uL * uL * s.rhoL * dh / sg, 0.75)
             * std::pow(uL * uL / (g_acc * dh), -0.45);
    };
    const scalar aS = aphOverA(sigma, 1.5);
    scalar hL = hLS, ubar = uL / hLS, aOverA = aS;
    r.aboveLoading = (uV > r.uVS);
    if (r.aboveLoading)
    {
        const scalar hLFl = 2.2 * hLS
            * std::pow(s.muL * g.rhoW / (g.etaW * s.rhoL), 0.05);          // (44)
        r.hLFl = hLFl;
        const scalar f13 = std::pow(uV / r.uVFl, 13.0);
        hL = hLS + (hLFl - hLS) * f13;                                     // (12)
        const scalar aFl = aphOverA(sigma, 10.5 * std::pow(sigma / g.sigmaW, 0.56));   // (15)
        aOverA = aS + (aFl - aS) * f13;                                    // (14)
        const scalar fr = (uV - r.uVS) / (r.uVFl - r.uVS);
        ubar = std::cbrt(g_acc * s.rhoG * s.rhoG * uV * uV / (12.0 * s.muL * a * a * s.rhoL))
             * std::pow(LV, 2.0 / 3.0) * (1.0 - fr * fr);                  // (16)
    }
    if (!(hL < eps))
        throw std::runtime_error("PackingBS: the holdup reaches the void fraction (h_L = "
            + std::to_string(hL) + " >= eps = " + std::to_string(eps) + ").");
    r.hL = hL;
    r.uLeff = ubar;
    r.aPhOverAp = aOverA;
    r.ae = aOverA * a;

    //  ---- Films, (6) and (8) ----------------------------------------------
    r.kL = g.CL * std::pow(12.0, 1.0 / 6.0) * std::sqrt(ubar) * std::sqrt(s.DL / dh);
    const scalar bVaPh = g.CV / std::sqrt(eps - hL) * std::pow(a, 1.5) / std::sqrt(dh) * s.DG
        * std::pow(uV / (a * nuV), 0.75) * std::cbrt(nuV / s.DG) * aOverA;
    r.kG = bVaPh / r.ae;
    r.HG = uV / bVaPh;
    r.HL = uL / (r.kL * r.ae);
    r.HOG = r.HG + s.lambda * r.HL;
    const scalar lam = s.lambda;
    r.HETP = (std::abs(lam - 1.0) < 1.0e-9) ? r.HOG
           : r.HOG * std::log(lam) / (lam - 1.0);

    //  ---- Pressure drop, (23)-(30) ----------------------------------------
    const scalar dP_ = 6.0 * (1.0 - eps) / a;                              // (27)
    const scalar invK = 1.0 + 2.0 / (3.0 * (1.0 - eps)) * dP_ / g.colDiameter;   // (24)
    const scalar K = 1.0 / invK;
    const scalar ReV = uV * dP_ / ((1.0 - eps) * nuV) * K;                 // (26)
    const scalar psi0 = g.CP0 * (64.0 / ReV + 1.8 / std::pow(ReV, 0.08)); // (25)
    const scalar FV2 = uV * uV * s.rhoG;
    r.dPdry = psi0 * a / std::pow(eps, 3.0) * 0.5 * FV2 / K;               // (23)
    const scalar psiL = psi0 * std::pow((eps - hL) / eps, 1.5) * std::pow(hL / hLS, 0.3)
        * std::exp(13300.0 / std::pow(a, 1.5) * std::sqrt(FrL));           // (29)
    r.dP = psiL * a / std::pow(eps - hL, 3.0) * 0.5 * FV2 / K;             // (28)
    return r;
}

} // namespace Choupo
