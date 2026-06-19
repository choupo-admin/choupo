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
File
    Choupo::electrolyte::PitzerForm

Description
    The ONE Pitzer ion-interaction FORM, shared by the single-salt kernel
    (PitzerSingleSalt, the validation oracle) and the multi-ion HMW activity
    model (PitzerHMW).  Pure inline functions, NO state -- every term of the
    glass-box Pitzer surface lives here exactly once, so the two callers can
    never drift (the forum's single-source-of-math rule).

    THE BUILDING BLOCKS (Pitzer 1973; Pitzer 1991 "Activity Coefficients in
    Electrolyte Solutions" 2nd ed., ch. 3; Harvie, Moller & Weare 1984 for the
    HMW assembly):

      Universal constants:  b = 1.2 (the DH closest-approach), A_phi(25 C) =
      0.3915 (the osmotic Debye-Huckel slope on the molality scale), scaled in
      T by SolventProperties::debyeHuckelFactor(T) -- the SAME A_phi the
      single-salt kernel and the eNRTL/Davies kernels use (one A_phi, not two).

      Debye-Huckel term of F (the long-range part of ln gamma):
        fGamma(I) = -A_phi [ sqrt(I)/(1 + b sqrt(I)) + (2/b) ln(1 + b sqrt(I)) ]

      Debye-Huckel term of the osmotic coefficient:
        fPhi(I)   = -A_phi sqrt(I)/(1 + b sqrt(I))

      The short-range g-functions (x = alpha sqrt(I)):
        g(x)  =  2 [1 - (1 + x) e^-x] / x^2
        gp(x) = -2 [1 - (1 + x + x^2/2) e^-x] / x^2     (Pitzer's g')
      used to build, for a (cation,anion) pair with virials beta0,beta1,beta2:
        B^gamma_ca = beta0 + beta1 g(a1 sqrt I) + beta2 g(a2 sqrt I)   [in 2B_ca]
        B'_ca      = [beta1 gp(a1 sqrt I) + beta2 gp(a2 sqrt I)] / I    [in F]
        B^phi_ca   = beta0 + beta1 e^{-a1 sqrt I} + beta2 e^{-a2 sqrt I}
        C^gamma_ca = C^phi_ca / (2 sqrt(|z_c z_a|))

    THE SINGLE-SALT REDUCTION (the oracle's anchor) ----------------------------
    For ONE salt the HMW double sums collapse to the closed single-salt kernel.
    The single-salt mean-activity B-term uses the grouping
        bGammaSingleSalt(alpha, beta, I)
          = (2 beta / (alpha^2 I)) [1 - (1 + alpha sqrt I - alpha^2 I / 2) e^{-alpha sqrt I}]
    which is ALGEBRAICALLY  beta (g(x) + e^-x)  with x = alpha sqrt(I) -- i.e.
    the HMW B^gamma combined with the I B' contribution for a single salt.  It is
    kept here in its ORIGINAL associativity (verbatim from the pre-refactor
    PitzerSingleSalt::lnGammaPM) so the refactor is BYTE-IDENTICAL: the enthalpy
    goldens (pitzer*, enthalpy_naoh_water, L_phi cases) do not move.  The HMW
    model instead uses g()/gp() directly; verify() proves the two agree to FP.
\*---------------------------------------------------------------------------*/

#pragma once

#include "thermo/electrolyte/SolventProperties.H"

#include <cmath>
#include <utility>

namespace Choupo {
namespace electrolyte {
namespace PitzerForm {

// Universal Pitzer constants (molality scale, 25 C base).
constexpr double bDH       = 1.2;     // Debye-Huckel closest-approach parameter
constexpr double aPhiRef25 = 0.3915;  // osmotic DH slope, water, 25 C

// A_phi(T): the 25 C osmotic Debye-Huckel slope scaled by the Born-Bjerrum
// factor eps_w(T), rho_w(T) (= 0.3915 at 25 C).  THE one A_phi -- the single
// salt kernel's aPhi(T) is now this function (one slope, not two).
inline double aPhi(double T)
{
    return aPhiRef25 * SolventProperties::debyeHuckelFactor(T);
}

// Long-range Debye-Huckel term of ln gamma:
//   fGamma = -A_phi [ sqrt(I)/(1 + b sqrt(I)) + (2/b) ln(1 + b sqrt(I)) ]
inline double fGamma(double I, double A)
{
    const double sI = std::sqrt(I);
    return -A * (sI / (1.0 + bDH * sI) + (2.0 / bDH) * std::log(1.0 + bDH * sI));
}

// Long-range Debye-Huckel term of the osmotic coefficient:
//   fPhi = -A_phi sqrt(I) / (1 + b sqrt(I))
inline double fPhi(double I, double A)
{
    const double sI = std::sqrt(I);
    return -A * sI / (1.0 + bDH * sI);
}

// Pitzer g(x) = 2[1 - (1 + x) e^-x] / x^2  (x = alpha sqrt(I)); -> 1 as x -> 0.
inline double g(double x)
{
    if (x <= 0.0) return 0.0;
    return 2.0 * (1.0 - (1.0 + x) * std::exp(-x)) / (x * x);
}

// Pitzer g'(x) = -2[1 - (1 + x + x^2/2) e^-x] / x^2  (x = alpha sqrt(I)).
inline double gp(double x)
{
    if (x <= 0.0) return 0.0;
    return -2.0 * (1.0 - (1.0 + x + 0.5 * x * x) * std::exp(-x)) / (x * x);
}

// B^gamma_ca = beta0 + beta1 g(a1 sqrt I) + beta2 g(a2 sqrt I)  (the term in 2B_ca).
inline double Bgamma(double I, double beta0, double beta1, double beta2,
                     double alpha1, double alpha2)
{
    const double sI = std::sqrt(I);
    double Bg = beta0 + beta1 * g(alpha1 * sI);
    if (beta2 != 0.0) Bg += beta2 * g(alpha2 * sI);
    return Bg;
}

// B'_ca = [beta1 g'(a1 sqrt I) + beta2 g'(a2 sqrt I)] / I  (the term entering F).
inline double Bprime(double I, double beta1, double beta2,
                     double alpha1, double alpha2)
{
    if (I <= 0.0) return 0.0;
    const double sI = std::sqrt(I);
    double Bp = beta1 * gp(alpha1 * sI);
    if (beta2 != 0.0) Bp += beta2 * gp(alpha2 * sI);
    return Bp / I;
}

// B^phi_ca = beta0 + beta1 e^{-a1 sqrt I} + beta2 e^{-a2 sqrt I}  (osmotic form).
inline double Bphi(double I, double beta0, double beta1, double beta2,
                   double alpha1, double alpha2)
{
    const double sI = std::sqrt(I);
    double bp = beta0 + beta1 * std::exp(-alpha1 * sI);
    if (beta2 != 0.0) bp += beta2 * std::exp(-alpha2 * sI);
    return bp;
}

// C^gamma_ca = C^phi_ca / (2 sqrt(|z_c z_a|)) -- the activity-coeff C-coefficient.
inline double Cgamma(double Cphi, double zc, double za)
{
    return Cphi / (2.0 * std::sqrt(std::fabs(zc * za)));
}

// ---- the higher-order electrostatic mixing functions J(x), J'(x) ------------
// (Pitzer 1975, "Thermodynamics of electrolytes. V. Effects of higher-order
//  electrostatic terms", J. Solution Chem. 4 (1975) 249; reproduced Pitzer 1991
//  "Activity Coefficients in Electrolyte Solutions" 2nd ed. ch. 3.)
//
// For two ions of the SAME sign but DIFFERENT charge the mixing parameter gains
// an ionic-strength-dependent electrostatic term E_theta(I) built from the
// Pitzer integral J(x).  J(x) is defined by an integral; we use Pitzer's own
// closed-form EMPIRICAL approximation (Pitzer 1975, eq. given in the cited paper
// and in Pitzer 1991 ch. 3; the SAME form used by PHRQPITZ / Plummer et al. 1988
// USGS WRI 88-4153):
//
//   J(x) = x / ( 4 + C1 x^{-C2} exp( C3 x^{C4} ) )
//   with  C1 = 4.581,  C2 = 0.7237,  C3 = 0.0120,  C4 = 0.528.
//
// Limits (both reproduced by the constants above):
//   x -> 0 : J(x) -> 0 like x^2 (the term vanishes at infinite dilution, so
//            E_theta -> 0 -- the Debye-Huckel limiting law is untouched).
//   x -> inf: denominator -> 4, so J(x) -> x/4  and  J'(x) -> 1/4.
// Spot values (verified against the published table, Pitzer 1991):
//   J(0.1) ~ 0.00353,  J(1) ~ 0.1158,  J(10) ~ 2.040.
// These are asserted in PitzerForm::verifyJ() (the glass-box anchor).
constexpr double jC1 = 4.581;
constexpr double jC2 = 0.7237;
constexpr double jC3 = 0.0120;
constexpr double jC4 = 0.528;

inline double Jfunc(double x)
{
    if (x <= 0.0) return 0.0;
    return x / (4.0 + jC1 * std::pow(x, -jC2) * std::exp(jC3 * std::pow(x, jC4)));
}

// J'(x) = dJ/dx, analytic.  With D(x) = 4 + C1 x^{-C2} exp(C3 x^{C4}):
//   D'(x) = C1 exp(C3 x^{C4}) x^{-C2-1} [ -C2 + C3 C4 x^{C4} ]
//   J'(x) = (D - x D') / D^2
// (verified to machine precision against a central finite difference of J).
inline double Jprime(double x)
{
    if (x <= 0.0) return 0.0;
    const double e  = std::exp(jC3 * std::pow(x, jC4));
    const double D  = 4.0 + jC1 * std::pow(x, -jC2) * e;
    const double Dp = jC1 * e * std::pow(x, -jC2 - 1.0)
                    * (-jC2 + jC3 * jC4 * std::pow(x, jC4));
    return (D - x * Dp) / (D * D);
}

// ---- the unsymmetrical higher-order electrostatic mixing term E_theta -------
// For two like-sign ions i, j (charges z_i, z_j, SAME sign) at ionic strength I,
// with x_ij = 6 z_i z_j A_phi sqrt(I)  (note z_i z_j > 0 for like-sign):
//   E_theta_ij(I)  = (z_i z_j / 4I) [ J(x_ij) - 0.5 J(x_ii) - 0.5 J(x_jj) ]
//   E_theta'_ij(I) = -(E_theta_ij / I)
//                  + (z_i z_j / 8 I^2) [ x_ij J'(x_ij)
//                                        - 0.5 x_ii J'(x_ii) - 0.5 x_jj J'(x_jj) ]
// For z_i == z_j (SAME charge): x_ij == x_ii == x_jj so the bracket vanishes
// IDENTICALLY -> E_theta = E_theta' = 0 (this is why same-charge mixing, and
// every single salt, is untouched -- the constant-theta path for those pairs).
// Result returned as the pair {E_theta, E_theta'}.
inline std::pair<double, double> Etheta(double zi, double zj, double I, double A)
{
    if (I <= 0.0 || zi == zj) return {0.0, 0.0};
    const double sI   = std::sqrt(I);
    const double xij  = 6.0 * zi * zj * A * sI;
    const double xii  = 6.0 * zi * zi * A * sI;
    const double xjj  = 6.0 * zj * zj * A * sI;
    const double zz   = zi * zj;
    const double Et   = (zz / (4.0 * I))
                      * (Jfunc(xij) - 0.5 * Jfunc(xii) - 0.5 * Jfunc(xjj));
    const double Etp  = -Et / I
                      + (zz / (8.0 * I * I))
                        * (xij * Jprime(xij)
                           - 0.5 * xii * Jprime(xii) - 0.5 * xjj * Jprime(xjj));
    return {Et, Etp};
}

// Glass-box self-check on J(x) (called once from PitzerHMW::verify): assert the
// published spot values and the x -> 0 (J ~ x^2) / x -> inf (J -> x/4) limits.
// Returns the max relative deviation vs the tabulated anchors (~1e-3, the
// approximation's own published accuracy -- it is an APPROXIMATION, not exact).
inline double verifyJ()
{
    struct { double x, J; } tab[] = {
        {0.1,  0.003529}, {1.0, 0.115790}, {10.0, 2.040302}
    };
    double maxDev = 0.0;
    for (const auto& t : tab)
    {
        const double dev = std::fabs(Jfunc(t.x) - t.J) / std::fabs(t.J);
        if (dev > maxDev) maxDev = dev;
    }
    return maxDev;
}

// ---- the single-salt reduction (oracle anchor; verbatim associativity) ------
// bGammaSingleSalt(alpha, beta, I) = (2 beta/(a^2 I)) [1 - (1 + a sqrt I -
//   a^2 I / 2) e^{-a sqrt I}].  Algebraically beta (g(x) + e^-x); kept in its
//   ORIGINAL form so PitzerSingleSalt stays byte-identical after the refactor.
inline double bGammaSingleSalt(double alpha, double beta, double I)
{
    if (beta == 0.0) return 0.0;        // 1:1 / 2:1 / 1:2: no second-range term
    const double sI = std::sqrt(I);
    const double aI = alpha * alpha * I;
    const double asI = alpha * sI;
    return (2.0 * beta / aI) * (1.0 - (1.0 + asI - 0.5 * aI) * std::exp(-asI));
}

} // namespace PitzerForm
} // namespace electrolyte
} // namespace Choupo
