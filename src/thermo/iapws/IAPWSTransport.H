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
Namespace
    Choupo::IAPWSTransport

Description
    IAPWS transport-property formulations for ordinary water substance --
    a SIBLING to the frozen IF97 thermodynamic kernel (IF97.{H,cpp}), NOT
    an edit of it.  Every coefficient is transcribed below from the
    published release with its source cited; each release's own computer-
    program verification value is hard-coded in a verify*() and the maximum
    relative deviation is returned -- if a single digit is wrong, verify
    says so (mirrors IF97::verify()).

    THIS kernel implements:

      * R1-76 (2014)  -- SURFACE TENSION sigma(T) along the saturation
                         line, the explicit one-term form (eq. 1).
      * R12-08        -- VISCOSITY mu(rho,T), the INDUSTRIAL form
                         mu = mu0(T) * mu1(rho,T).  The critical-enhancement
                         factor mu2 is OMITTED (= 1) -- valid outside the
                         narrow near-critical region.
      * R15-11        -- THERMAL CONDUCTIVITY lambda(rho,T), BACKGROUND only
                         lambda = lambda0(T) * lambda1(rho,T).  The critical-
                         enhancement term lambda2 is OMITTED (= 0).

    The viscosity and conductivity kernels are keyed on (rho, T): they need a
    density, which the IF97 thermodynamic kernel supplies (Props.rho).  The
    PureFluidModel wrapper does that bridge -- this kernel stays pure (no
    state, no dependency on IF97).

    All functions are PURE.  Inputs / outputs are canonical SI:
        sigma  [N/m]      from T [K]
        mu     [Pa.s]     from (rho [kg/m3], T [K])
        lambda [W/(m.K)]  from (rho [kg/m3], T [K])

Reference
    * IAPWS, "Revised Release on the Surface Tension of Ordinary Water
      Substance", R1-76(2014), Moscow, June 2014.  eq. 1.
    * IAPWS, "Release on the IAPWS Formulation 2008 for the Viscosity of
      Ordinary Water Substance", R12-08, Berlin, September 2008.  eq. 10-13;
      Tables 1, 2.  Industrial-use computer-program verification (Table 4).
    * IAPWS, "Release on the IAPWS Formulation 2011 for the Thermal
      Conductivity of Ordinary Water Substance", R15-11, Plzen, September
      2011.  eq. 15-17; Tables 1, 2.  Computer-program verification (Table 4).
    Equations are public domain; coefficient tables cited per block.

SourceFiles
    IAPWSTransport.cpp
\*---------------------------------------------------------------------------*/

#pragma once

namespace Choupo
{
namespace IAPWSTransport
{

// --- Reference constants (shared with IF97; restated for a standalone kernel)
constexpr double Tcrit   = 647.096;     // K       critical temperature
constexpr double rhocrit = 322.0;       // kg/m3   critical density
constexpr double pcrit   = 22.064e6;    // Pa      critical pressure (unused here)

// === R1-76(2014): surface tension =========================================
// sigma(T) = B * tau^mu * (1 + b*tau),   tau = 1 - T/Tc       [N/m]
//   B = 235.8e-3 N/m,  b = -0.625,  mu = 1.256                (release eq. 1)
// Valid on the saturation line, triple point (273.16 K) to Tc (647.096 K).
double sigma(double T);

// === R12-08: viscosity, industrial form ====================================
// mu(rho,T) = mu0(T) * mu1(rho,T) * 1e-6   [Pa.s]   (mu2 critical = 1, omitted)
//   mu0 = 100*sqrt(Tbar) / Sum_{i=0..3} Hi/Tbar^i          (dilute gas)
//   mu1 = exp( rhobar * Sum Hij (1/Tbar-1)^i (rhobar-1)^j )
//   Tbar = T/Tc,  rhobar = rho/rhoc.
double mu(double rho, double T);

// === R15-11: thermal conductivity, background only =========================
// lambda(rho,T) = lambda0(T)*lambda1(rho,T) * 1e-3   [W/(m.K)]  (lambda2 = 0)
//   lambda0 = sqrt(Tbar) / Sum_{k=0..4} Lk/Tbar^k          (dilute gas)
//   lambda1 = exp( rhobar * Sum Lij (1/Tbar-1)^i (rhobar-1)^j )
double lambda(double rho, double T);

// --- Self-checks against the published verification values -----------------
// Each returns the MAXIMUM RELATIVE DEVIATION over the release's published
// computer-program verification point(s).  See the .cpp for the points used
// and the tolerance each is gated at in the regression.
double verifySigma();    // R1-76, table values (sigma table ~5-digit)
double verifyMu();       // R12-08 Table 4 (industrial, mu2 = 1)
double verifyLambda();   // R15-11 Table 4 (background, lambda2 = 0)

// Convenience: the max over all three (one number for the run header).
double verify();

} // namespace IAPWSTransport
} // namespace Choupo
