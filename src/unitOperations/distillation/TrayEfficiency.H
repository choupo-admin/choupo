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
    Choupo::TrayEfficiency

    THE MURPHREE EFFICIENCY OF A SIEVE TRAY, COMPUTED FROM ITS GEOMETRY, ITS
    LOCAL TRAFFIC AND THE TRANSPORT PROPERTIES OF ITS TWO PHASES (DEV.md 4c
    C329, formulation (a): the stages stay equilibrium stages, and the
    efficiency that relaxes them is computed instead of declared).

    The declared `murphreeEfficiency` remains the default.  This class is
    reached only by `efficiency { model AIChE; }`.

    THE CHAIN, every equation from a source in ~/Choupo-Literature, read at
    the page cited:

    1. Transfer units of each phase -- the AIChE Bubble-Tray Manual (1958)
       correlations for sieve trays, SI form, as printed by Treybal, Mass
       Transfer Operations, 3rd ed. (1980), p. 183, Eqs. (6.61)-(6.64):

         N_tG = (0.776 + 4.57 h_w - 0.238 V_a rho_G^0.5 + 104.6 q/Z) / Sc_G^0.5
         N_tL = 40000 D_L^0.5 (0.213 V_a rho_G^0.5 + 0.15) theta_L
         D_E  = (3.93e-3 + 0.0171 V_a + 3.67 q/Z + 0.1800 h_w)^2
         theta_L = h_L z Z / q

       V_a  vapour velocity on the ACTIVE (bubbling) area [m/s]
       q    liquid volumetric flow [m3/s]
       Z    length of liquid travel between the weirs [m]
       z    average flow width, (T + W)/2 [m] (Treybal p. 172)
       h_w  weir height [m]
       h_L  clear liquid on the tray, Treybal Eq. (6.38), p. 172:
         h_L = 6.10e-3 + 0.725 h_w - 0.238 h_w V_a rho_G^0.5 + 1.225 q/z

       Treybal's Illustration 6.4 (p. 183-184) is reproduced by these
       equations as printed (N_tG 0.956, N_tL 4.70, D_E 0.0101 m2/s,
       theta_L 1.857 s, E_MG 0.716), which is how the reading of the
       printed q/Z (Z = length of travel) was checked.  NOTE: Perry 9th ed.
       Eq. (13-77), p. 13-38, prints the same N_V with Q_L/W, W the weir
       length.  The two readings differ by the ratio of the travel length to
       the weir length (about 20 % in the q-term on a 1.2 m single-pass
       tray); this class follows Treybal, whose worked example it
       reproduces, and the difference is an OPEN uncertainty, not a choice
       made on any comparison with data.

    2. Point efficiency, Treybal Eqs. (6.51)-(6.52), p. 180:
         1/N_tOG = 1/N_tG + lambda / N_tL,   lambda = m G / L
         E_OG    = 1 - exp(-N_tOG)
       m is the local slope of the equilibrium line d(y*) / dx at the tray
       liquid (the chord average of Eq. 6.53 is not taken -- one slope per
       tray, stated).

    3. Point -> Murphree by eddy diffusion in the liquid (vapour mixed
       between trays), Treybal Eqs. (6.57)-(6.59), p. 182:
         Pe = Z^2 / (D_E theta_L)
         eta = (Pe/2) [ (1 + 4 lambda E_OG / Pe)^0.5 - 1 ]
         E_MV/E_OG = (1 - e^-(eta+Pe)) / ((eta+Pe)(1 + (eta+Pe)/eta))
                   + (e^eta - 1) / (eta (1 + eta/(eta+Pe)))

    4. Entrainment (optional, default ON when the hydraulics block gives an
       approach to flood): Colburn, Perry 9th ed. Eq. (14-98), p. 14-40,
         E_a = E_MV / (1 + E_MV psi/(1 - psi))
       with psi, the fractional entrainment, from Fair's 1996 correlation as
       printed by Perry 9th ed. Eq. (14-99), p. 14-40, "median (most likely)"
       constants: ln psi = -3.2108 - 8.9049 Phi + 11.6291 Phi^2, Phi the
       fractional approach to entrainment flood.

    WHAT THIS DOES NOT SEE, and the reader is told so in the case output:
    the AIChE correlations carry no hole area, no hole diameter and no tray
    spacing.  Two trays that differ only in open area get the SAME dry
    efficiency; open area reaches the result only through the hydraulics
    (flood approach -> entrainment, and the pressure drop).  Weeping is not
    modelled.  A binary only: for a binary the Murphree efficiencies of the
    two components are identical (y and y* both sum to one), so one E_MV per
    tray is exact; a multicomponent mixture needs a diffusivity matrix and
    is refused by the caller.
\*---------------------------------------------------------------------------*/

#pragma once

#include "core/Types.H"

#include <string>

namespace Choupo
{

class TrayEfficiency
{
public:

    //  Tray geometry the correlations read, all in SI.
    struct Geometry
    {
        scalar activeArea   = 0.0;   // A_a, m2
        scalar weirHeight   = 0.0;   // h_w, m
        scalar flowPath     = 0.0;   // Z, m: length of liquid travel
        scalar flowWidth    = 0.0;   // z, m: average flow width (D + l_w)/2
    };

    //  The local state of one tray.
    struct State
    {
        scalar vapourVolFlow = 0.0;  // m3/s through the tray
        scalar liquidVolFlow = 0.0;  // q, m3/s across the tray
        scalar rhoV          = 0.0;  // kg/m3
        scalar ScV           = 0.0;  // mu_V/(rho_V D_V)
        scalar DL            = 0.0;  // m2/s, liquid diffusivity of the key pair
        scalar lambda        = 0.0;  // m G/L
        scalar floodApproach = -1.0; // Phi; < 0 => no entrainment correction
    };

    struct Result
    {
        scalar Va = 0.0, Fa = 0.0;               // m/s, active-area F-factor
        scalar hL = 0.0, thetaL = 0.0;           // m, s
        scalar NG = 0.0, NL = 0.0, NOG = 0.0;
        scalar EOG = 0.0;
        scalar DE = 0.0, Pe = 0.0, eta = 0.0;
        scalar EMVdry = 0.0;                     // eddy-diffusion Murphree
        scalar psi = 0.0;                        // fractional entrainment
        scalar EMV = 0.0;                        // what the stage uses
    };

    //  The whole chain for one tray.  Throws by name on a non-finite or
    //  non-physical intermediate (a negative N_tG at a very high F-factor,
    //  a clear-liquid height <= 0) rather than returning it.
    static Result evaluate(const Geometry& g, const State& s);

    //  Length of liquid travel between two segmental weirs of length l_w
    //  on a tower of diameter D: D minus twice the chord depth.
    static scalar flowPathLength(scalar D, scalar lw);
};

} // namespace Choupo
