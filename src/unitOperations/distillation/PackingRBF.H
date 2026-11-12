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
    Choupo::PackingRBF

    A CORRUGATED STRUCTURED PACKING -- liquid holdup, pressure drop, flooding
    and the height of a transfer unit -- by the Rocha, Bravo & Fair model
    (DEV.md 4c C329, first delivery, the packed half).  Every equation as
    printed, page cited:

    HYDRAULICS -- Rocha, Bravo & Fair, Ind. Eng. Chem. Res. 32 (1993) 641,
    pp. 646-647, Eqs (20)-(29):
        dP/dZ   = dP_d/dZ [1/(1 - K2 h_L)]^5                       (20)
        dP_d/dZ = A U_gs^2 + B U_gs,
                  A = 0.177 rho_g / (S eps^2 sin^2 th),
                  B = 88.774 mu_g / (S^2 eps sin th)               (23)
        h_L     = (4 F_t/S)^(2/3) (3 mu_L U_Ls / (rho_L sin th eps g_eff))^(1/3)  (24)
        F_t     = 29.12 (We_L Fr_L)^0.15 S^0.359
                  / (Re_L^0.2 eps^0.6 (1 - 0.93 cos g)(sin th)^0.3) (25)
        g_eff   = g [(rho_L - rho_g)/rho_L][1 - (dP/dZ)/(dP/dZ)_flood]  (26)
        cos g   = 0.9 (sigma < 0.055 N/m), 5.211e-16.835 sigma above (27-28)
        K2      = 0.614 + 71.35 S                                  (29)
        (dP/dZ)_flood = 1025 Pa/m (p. 649, "all calculations")
        Re_L = U_Ls S rho_L/mu_L, We_L = U_Ls^2 rho_L S/sigma, Fr_L =
        U_Ls^2/(S g) (nomenclature, p. 651).
    Eqs (20) and (24)-(26) are implicit in h_L and dP/dZ; they are solved
    here by damped substitution.  No solution with g_eff > 0 and
    K2 h_L < 1 below the flooding pressure drop is reported as FLOODED.

    MASS TRANSFER -- Rocha, Bravo & Fair, Ind. Eng. Chem. Res. 35 (1996)
    1660, pp. 1663-1665, Eqs (5)-(17):
        k_g S/D_g = 0.054 [(U_ge + U_Le) rho_g S/mu_g]^0.8 (mu_g/(D_g rho_g))^0.33  (5)
        U_ge = U_gs/(eps (1 - h_L) sin th), U_Le = U_Ls/(eps h_L sin th)   (6)-(7)
        k_L  = 2 (D_L C_E U_Le/(pi S))^0.5, C_E = 0.9               (9)
        a_e/a_p: GAUZE  beta = 1 - 1.203 (U_Ls^2/(S g))^0.111       (14)
                 SHEET  F_SE 29.12 (We Fr)^0.15 S^0.359
                        / (Re^0.2 eps^0.6 (1-0.93 cos g)(sin th)^0.3)     (10)
        H_OG = U_gs/(k_g a_e) + lambda U_Ls/(k_L a_e)               (16)
        HETP = H_OG ln(lambda)/(lambda - 1)                         (17)
    (the paper's Eq 13 prints Re_L with 4d; the area relations use the Re_L
    of part 1, U_Ls S rho_L/mu_L, which is the group Eq 10 copies from Eq 25.)

    THE PACKING'S ONLY DECLARED NUMBERS are the specific area a_p, the void
    fraction eps, the corrugation angle th and side S, and for a sheet
    packing F_SE: the model has no fitted per-packing constant (part 1, p.
    649: "the only packing characteristics needed ... are the packing size
    (side of the corrugation) and the void fraction").
\*---------------------------------------------------------------------------*/

#pragma once

#include "core/Types.H"

namespace Choupo
{

class PackingRBF
{
public:
    struct Geometry
    {
        scalar ap      = 0.0;     // m2/m3
        scalar eps     = 0.0;     // void fraction
        scalar theta   = 0.0;     // corrugation angle from the horizontal, rad
        scalar S       = 0.0;     // corrugation side, m
        bool   gauze   = true;    // area by Eq 14 (gauze) or Eq 10 (sheet metal)
        scalar FSE     = 0.0;     // sheet metal only
        scalar CE      = 0.9;
        scalar dPflood = 1025.0;  // Pa/m
    };

    struct State
    {
        scalar UGs = 0.0, ULs = 0.0;        // superficial velocities, m/s
        scalar rhoG = 0.0, rhoL = 0.0;      // kg/m3
        scalar muG = 0.0, muL = 0.0;        // Pa s
        scalar sigma = 0.0;                 // N/m
        scalar DG = 0.0, DL = 0.0;          // m2/s
        scalar lambda = 1.0;                // m G/L
    };

    struct Result
    {
        bool   flooded = false;
        scalar dPdry = 0.0, dP = 0.0;       // Pa/m
        scalar hL = 0.0, Ft = 0.0, geff = 0.0;
        scalar ae = 0.0, kG = 0.0, kL = 0.0;
        scalar HG = 0.0, HL = 0.0, HOG = 0.0, HETP = 0.0;
    };

    static Result evaluate(const Geometry& g, const State& s);
};

} // namespace Choupo
