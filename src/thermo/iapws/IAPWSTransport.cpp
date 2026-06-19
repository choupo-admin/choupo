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

#include "thermo/iapws/IAPWSTransport.H"

#include <algorithm>   // std::max (not pulled in transitively under libc++/emscripten)
#include <cmath>

namespace Choupo
{
namespace IAPWSTransport
{

// ===========================================================================
//  R1-76(2014): surface tension along the saturation line
// ===========================================================================
//   sigma(T) = B * tau^mu * (1 + b*tau),   tau = 1 - T/Tc          (eq. 1)
// Coefficients (release section 3):
static constexpr double S_B  = 235.8e-3;   // N/m
static constexpr double S_b  = -0.625;     // -
static constexpr double S_mu = 1.256;      // -

double sigma(double T)
{
    const double tau = 1.0 - T / Tcrit;
    return S_B * std::pow(tau, S_mu) * (1.0 + S_b * tau);
}

// ===========================================================================
//  R12-08: viscosity (industrial form, mu2 critical enhancement omitted)
// ===========================================================================
//
//   mu = mu0(T) * mu1(rho,T) * mu2 * 1e-6   [Pa.s],   mu2 = 1 here.
//
// Dilute-gas term mu0 (release eq. 11, Table 1):
//   mu0 = 100 * sqrt(Tbar) / Sum_{i=0..3} Hi/Tbar^i
static constexpr double mu_H0[4] =
{
    1.67752, 2.20462, 0.6366564, -0.241605
};

// Residual term mu1 (release eq. 12, Table 2).  The release publishes the
// non-zero coefficients only, indexed by (i,j) -- transcribed verbatim as
// three parallel arrays (i, j, Hij).  All other (i,j) entries are zero.
static constexpr int    mu_I[21] =
{
    0, 1, 2, 3, 0, 1, 2, 3, 5, 0, 1, 2, 3, 4, 0, 1, 0, 3, 4, 3, 5
};
static constexpr int    mu_J[21] =
{
    0, 0, 0, 0, 1, 1, 1, 1, 1, 2, 2, 2, 2, 2, 3, 3, 4, 4, 5, 6, 6
};
static constexpr double mu_Hij[21] =
{
     0.520094,      0.850895e-1,  -0.108374e1,  -0.289555,
     0.222531,      0.999115,      0.188797e1,   0.126613e1,
     0.120573,     -0.281378,     -0.906851,    -0.772479,
    -0.489837,     -0.257040,      0.161913,     0.257399,
    -0.325372e-1,   0.698452e-1,   0.872102e-2, -0.435673e-2,
    -0.593264e-3
};

double mu(double rho, double T)
{
    const double Tbar   = T   / Tcrit;
    const double rhobar = rho / rhocrit;

    // --- dilute-gas contribution mu0 ---
    double denom = 0.0;
    double Tpow  = 1.0;                       // Tbar^0
    for (int i = 0; i < 4; ++i)
    {
        denom += mu_H0[i] / Tpow;
        Tpow  *= Tbar;
    }
    const double mu0 = 100.0 * std::sqrt(Tbar) / denom;

    // --- residual contribution mu1 ---
    const double a = 1.0 / Tbar - 1.0;
    const double c = rhobar - 1.0;
    double s = 0.0;
    for (int k = 0; k < 21; ++k)
        s += mu_Hij[k] * std::pow(a, mu_I[k]) * std::pow(c, mu_J[k]);
    const double mu1 = std::exp(rhobar * s);

    // mu2 (critical enhancement) = 1 -- OMITTED; valid outside near-critical.
    return mu0 * mu1 * 1.0e-6;               // [Pa.s]
}

// ===========================================================================
//  R15-11: thermal conductivity (background only, lambda2 enhancement = 0)
// ===========================================================================
//
//   lambda = (lambda0(T)*lambda1(rho,T) + lambda2) * 1e-3   [W/(m.K)],
//   lambda2 = 0 here (critical enhancement OFF).
//
// Dilute-gas term lambda0 (release eq. 16, Table 1):
//   lambda0 = sqrt(Tbar) / Sum_{k=0..4} Lk/Tbar^k
static constexpr double la_L0[5] =
{
    2.443221e-3, 1.323095e-2, 6.770357e-3, -3.454586e-3, 4.096266e-4
};

// Residual term lambda1 (release eq. 17, Table 2).  Non-zero coefficients
// only, indexed by (i,j) -- three parallel arrays.  Other entries are zero.
static constexpr int    la_I[28] =
{
    0, 0, 0, 0, 0, 0, 1, 1, 1, 1, 1, 1,
    2, 2, 2, 2, 2, 2, 3, 3, 3, 3, 4, 4, 4, 4, 4, 4
};
static constexpr int    la_J[28] =
{
    0, 1, 2, 3, 4, 5, 0, 1, 2, 3, 4, 5,
    0, 1, 2, 3, 4, 5, 0, 1, 2, 3, 0, 1, 2, 3, 4, 5
};
static constexpr double la_Lij[28] =
{
     1.60397357,  -0.646013523,  0.111443906,  0.102997357, -0.0504123634,
     0.00609859258,
     2.33771842,  -2.78843778,   1.53616167,  -0.463045512,  0.0832827019,
    -0.00719201245,
     2.19650529,  -4.54580785,   3.55777244,  -1.40944978,   0.275418278,
    -0.0205938816,
    -1.21051378,   1.60812989,  -0.621178141,  0.0716373224,
    -2.7203370,    4.57586331,  -3.18369245,   1.1168348,   -0.19268305,
     0.012913842
};

double lambda(double rho, double T)
{
    const double Tbar   = T   / Tcrit;
    const double rhobar = rho / rhocrit;

    // --- dilute-gas contribution lambda0 ---
    double denom = 0.0;
    double Tpow  = 1.0;                       // Tbar^0
    for (int i = 0; i < 5; ++i)
    {
        denom += la_L0[i] / Tpow;
        Tpow  *= Tbar;
    }
    const double lam0 = std::sqrt(Tbar) / denom;

    // --- residual contribution lambda1 ---
    const double a = 1.0 / Tbar - 1.0;
    const double c = rhobar - 1.0;
    double s = 0.0;
    for (int k = 0; k < 28; ++k)
        s += la_Lij[k] * std::pow(a, la_I[k]) * std::pow(c, la_J[k]);
    const double lam1 = std::exp(rhobar * s);

    // lambda2 (critical enhancement) = 0 -- OMITTED; this is the background.
    return lam0 * lam1 * 1.0e-3;             // [W/(m.K)]
}

// ===========================================================================
//  Self-checks against published verification values
// ===========================================================================

static double reldev(double computed, double published)
{
    return std::fabs(computed - published) / std::fabs(published);
}

double verifySigma()
{
    // R1-76(2014) tabulated saturation values (the release's table; ~5-digit).
    // sigma in N/m.  Tc = 647.096 K is exact; B,b,mu are the release coeffs.
    double maxDev = 0.0;
    auto dev = [&maxDev](double T, double pub)
    {
        const double d = reldev(sigma(T), pub);
        if (d > maxDev) maxDev = d;
    };
    dev(298.15, 0.071972);    // 25 degC  -> 71.972 mN/m
    dev(323.15, 0.067944);    // 50 degC  -> 67.944 mN/m
    dev(373.15, 0.058912);    // 100 degC -> 58.912 mN/m
    return maxDev;            // table-grade (~1e-5), gated accordingly
}

double verifyMu()
{
    // R12-08 industrial computer-program verification (Table 4), the
    // no-critical-enhancement column (mu2 = 1).  mu in Pa.s.
    // Point: T = 298.15 K, rho = 998 kg/m3  ->  889.7351e-6 Pa.s.
    double maxDev = 0.0;
    auto dev = [&maxDev](double rho, double T, double pub)
    {
        const double d = reldev(mu(rho, T), pub);
        if (d > maxDev) maxDev = d;
    };
    dev(998.0, 298.15, 889.7351001498108e-6);
    return maxDev;
}

double verifyLambda()
{
    // R15-11 computer-program verification (Table 4), the BACKGROUND column
    // (lambda2 critical enhancement = 0).  lambda in W/(m.K).
    // Point: T = 298.15 K, rho = 998 kg/m3  ->  0.6077129 W/(m.K).
    double maxDev = 0.0;
    auto dev = [&maxDev](double rho, double T, double pub)
    {
        const double d = reldev(lambda(rho, T), pub);
        if (d > maxDev) maxDev = d;
    };
    dev(998.0, 298.15, 0.6077128675880629);
    return maxDev;
}

double verify()
{
    double m = verifySigma();
    m = std::max(m, verifyMu());
    m = std::max(m, verifyLambda());
    return m;
}

} // namespace IAPWSTransport
} // namespace Choupo
