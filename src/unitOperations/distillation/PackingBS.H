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
    Choupo::PackingBS

Description
    A RANDOM OR STRUCTURED PACKING -- loading and flooding points, liquid
    holdup, pressure drop, the film coefficients and the interfacial area --
    by the Billet & Schultes method (DEV.md C513; design record
    docs/design/random-packings.md; Theory Guide sec:billetSchultes).
    Source: R. Billet, M. Schultes, "Prediction of mass transfer columns with
    dumped and arranged packings: updated summary of the calculation method of
    Billet and Schultes", Trans IChemE 77 Part A (1999) 498-504.  Every
    equation as printed, number cited (SI units; u are superficial
    velocities; g = 9.80665):

        d_h   = 4 eps / a                                                (10)
        L/V   = the mass-flow ratio (u_L rho_L)/(u_V rho_V)
        HOLDUP, below loading (41)-(43): Re_L = u_L rho_L/(a eta_L),
          Fr_L = u_L^2 a/g,  a_h/a = C_h Re_L^0.15 Fr_L^0.1 (Re_L < 5),
          = 0.85 C_h Re_L^0.25 Fr_L^0.1 (Re_L >= 5);
          h_L,S = (12 nu_L u_L a^2/g)^(1/3) (a_h/a)^(2/3)
        LOADING POINT (31)-(35), implicit in u_V,S through u_L,S =
          (rho_V/rho_L)(L/V) u_V,S:
          u_V,S = sqrt(g/psi_S) [eps/a^(1/6) - a^(1/2) X^(1/3)] X^(1/6)
                  sqrt(rho_L/rho_V),  X = 12 nu_L u_L,S/g
          psi_S = g/C_S^2 [(L/V) sqrt(rho_V/rho_L) (eta_L/eta_V)^0.4]^(-2 n_S)
          flow parameter (L/V) sqrt(rho_V/rho_L) <= 0.4: n_S = -0.326, C_S
          from Table 2; >= 0.4: n_S = -0.723, C_S = 0.695 C_S,Tab (eta_L/
          eta_V)^0.1588
        FLOODING POINT (36)-(40) and (13), implicit in h_L,Fl:
          h_L,Fl^3 (3 h_L,Fl - eps) = (6/g) a^2 eps nu_L (L/V)(rho_V/rho_L)
                                       u_V,Fl,   eps/3 <= h_L,Fl <= eps
          u_V,Fl = sqrt2 sqrt(g/psi_Fl (eps-h_L,Fl)^(3/2)/eps^(1/2))
                   sqrt(h_L,Fl/a) sqrt(rho_L/rho_V)
          psi_Fl = g/C_Fl^2 [(L/V) sqrt(rho_V/rho_L) (eta_L/eta_V)^0.2]^(-2 n_Fl)
          n_Fl = -0.194 (flow parameter <= 0.4), -0.708 above with C_Fl =
          0.6244 C_Fl,Tab (eta_L/eta_V)^0.1028
        REAL HOLDUP between loading and flooding (12), (44): h_L = h_L,S +
          (h_L,Fl,real - h_L,S)(u_V/u_V,Fl)^13, h_L,Fl,real = 2.2 h_L,S
          (eta_L rho_W/(eta_W rho_L))^0.05
        EFFECTIVE LIQUID VELOCITY (7), (16): u_L/h_L below loading;
          [g rho_V^2 u_V^2/(12 eta_L a^2 rho_L)]^(1/3) (L/V)^(2/3)
          [1 - ((u_V-u_V,S)/(u_V,Fl-u_V,S))^2] between
        INTERFACE (9), (14), (15): a_Ph,S/a = 1.5 (a d_h)^-0.5
          (u_L d_h/nu_L)^-0.2 (u_L^2 rho_L d_h/sigma)^0.75 (u_L^2/(g d_h))^-0.45;
          a_Ph,Fl/a = 10.5 (sigma/sigma_W)^0.56 times the same four factors;
          a_Ph/a = a_Ph,S/a + (a_Ph,Fl/a - a_Ph,S/a)(u_V/u_V,Fl)^13 between
          loading and flooding.  sigma is floored at 0.03 N/m in (9) and (15)
          (p. 500: below it the surface is completely wet).
        FILMS (6), (8): beta_L a_Ph = C_L 12^(1/6) ubar_L^(1/2)
          (D_L/d_h)^(1/2) a (a_Ph/a);  beta_V a_Ph = C_V (eps-h_L)^(-1/2)
          a^(3/2)/d_h^(1/2) D_V (u_V/(a nu_V))^(3/4) (nu_V/D_V)^(1/3) (a_Ph/a)
        HTU (5): H_G = u_V/(beta_V a_Ph), H_L = u_L/(beta_L a_Ph),
          H_OG = H_G + lambda H_L; HETP = H_OG ln(lambda)/(lambda - 1)
        PRESSURE DROP (23)-(30): d_P = 6 (1-eps)/a, 1/K = 1 + (2/3)
          (1/(1-eps)) d_P/d_S, Re_V = u_V d_P K/((1-eps) nu_V), psi_0 = C_P,0
          (64/Re_V + 1.8/Re_V^0.08), dp_0/H = psi_0 (a/eps^3)(F_V^2/2)(1/K);
          irrigated: dp/H = psi_L (a/(eps-h_L)^3)(F_V^2/2)(1/K), psi_L =
          C_P,0 (64/Re_V + 1.8/Re_V^0.08)((eps-h_L)/eps)^1.5 (h_L/h_L,S)^0.3
          exp(C_1 sqrt(Fr_L)), C_1 = 13300/a^(3/2), F_V = u_V sqrt(rho_V)

    THE SIX CONSTANTS C_S, C_Fl, C_h, C_P,0, C_L, C_V are the packing's, from
    Table 2 (pp. 501-502); the paper FITS them to its own database, so every
    packing in Table 2 is in-sample.  A blank cell of Table 2 is a constant
    that was not published: it is refused by name, never defaulted.
    DECLARED where the paper is silent: "water" in (15) and (44) is taken at
    20 C (sigma_W 0.0728 N/m, eta_W 1.002e-3 Pa s, rho_W 998.2 kg/m3).
    NOT IMPLEMENTED: the Marangoni correction for negative systems (17)-(20)
    -- the system is assumed neutral or positive (the run says so).
    WINDOW (Table 1, p. 499, mass-transfer column): a state outside is listed
    in Result::outside, never refused.
\*---------------------------------------------------------------------------*/

#pragma once

#include "PackingRBF.H"

#include <string>
#include <vector>

namespace Choupo
{

class PackingBS
{
public:
    struct Geometry
    {
        scalar ap = 0.0;                 // m2/m3
        scalar eps = 0.0;                // void fraction
        scalar CS = 0.0, CFl = 0.0, Ch = 0.0, CP0 = 0.0, CL = 0.0, CV = 0.0;
        scalar colDiameter = 0.0;        // m, the wall factor d_S (24)
        scalar sigmaFloor = 0.03;        // N/m, p. 500
        scalar sigmaW = 0.0728, etaW = 1.002e-3, rhoW = 998.2;   // declared 20 C water
    };

    //  A state variable outside the paper's Table 1 mass-transfer column.
    struct Outside { std::string name, unit; scalar value, lo, hi; };

    struct Result : PackingRBF::Result
    {
        scalar uVS = 0.0, uVFl = 0.0;          // loading and flooding gas velocities, m/s
        scalar floodFraction = 0.0;            // u_V/u_V,Fl
        scalar hLS = 0.0, hLFl = 0.0;          // holdup below loading, real at flooding
        scalar aPhOverAp = 0.0, uLeff = 0.0;
        bool   aboveLoading = false, sigmaFloored = false;
        std::vector<Outside> outside;
    };

    static Result evaluate(const Geometry& g, const PackingRBF::State& s);
};

} // namespace Choupo
