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
    reached only by `efficiency { model AIChE | ChanFair | SyedaChuang; }`.
    Sections 1-2 below are the AIChE model; 3-4 serve all three.

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


    WHAT AIChE DOES NOT SEE, and the reader is told so in the case output:
    the AIChE correlations carry no hole area, no hole diameter and no tray
    spacing.  Two trays that differ only in open area get the SAME dry
    efficiency; open area reaches the result only through the hydraulics
    (flood approach -> entrainment, and the pressure drop).  Weeping is not
    modelled by any of the three models.  A binary only: for a binary the
    Murphree efficiencies of the two components are identical (y and y*
    both sum to one), so one E_MV per tray is exact; a multicomponent
    mixture needs a diffusivity matrix and is refused by the caller.

    `model ChanFair;` -- Chan & Fair, Ind. Eng. Chem. Process Des. Dev. 23
    (1984) 814, every equation as printed on pp. 816-817 (units as the
    paper's nomenclature: h_L, h_w in cm, D in cm2/s, U_a in m/s):
        h_L = phi_e h_w + 1533 phi_e C (q_L/phi_e)^(2/3)            (11)
        phi_e = exp(-12.55 K_s^0.91), K_s = U_a (rho_V/(rho_L-rho_V))^0.5
        C = 0.0327 + 0.0286 exp(-1.378 h_w)                    (12)-(14)
        k_V a_i = D_V^0.5 (1030 f - 867 f^2) / h_L^0.5             (26)
        t_V = (1 - phi_e) h_L / (100 phi_e U_a)                    (24)
        k_L a_i = (0.40 F_va + 0.17)(197 D_L^0.5)                  (20)
        t_L = h_L A_a / (100 Q)                                    (10)
        D_E = 6.675e-3 U_a^1.44 + 0.922e-3 h_L - 5.62e-3   (Barker-Self, 9)
      then (16)-(17), and (5)-(7), the same eddy-diffusion conversion as 3.
    f = U_a/U_af is the approach to flood, supplied by the hydraulics pass
    (Fair/Lygeros).  The paper (p. 817) attributes the decline of (26)
    above f = 0.6 to entrainment and says a separate entrainment correction
    should assume zero slope above 0.6: with `entrainment FairMedian` the
    dry k_V a_i is read at min(f, 0.6) and Colburn/Fair applies the loss;
    with `entrainment none` it is read at f.  Where Barker-Self's D_E is not
    positive (low U_a) the liquid is taken in plug flow (Lewis case 1,
    Perry 9ed Eq 14-137), flagged in the result.  Open area enters ONLY
    through f.  IN-SAMPLE: Table I of the paper lists Yanagi & Sakata 1982
    (14 %) and Sakata & Yanagi 1979 (8 %) in the data bank the model was
    fitted on; p. 818 says the 14 % pressure runs (165 and 1138 kPa) did
    not fit and are shown apart (Fig. 3).

    `model SyedaChuang;` -- Syeda, Afacan & Chuang, Chem. Eng. Res. Des. 85
    (2007) 269, pp. 271-273, Eqs (1)-(35): the point efficiency of the
    bubbling zone (large bubbles by two-film theory, Eqs 3-15; small
    bubbles at equilibrium, Eq 16; the small-bubble fraction from turbulent
    break-up, Eqs 22 and 28) and of the jetting zone (Zuiderweg's spray
    model, Eqs 29-34), weighted by the jetting fraction f_j (Eq 35).  Open
    area enters through the hole velocity (large-bubble diameter, Eq 9),
    the open-area ratio F and the hole pitch (Eqs 32-33).  C'' = 0.16 is the
    paper's constant, FITTED (p. 273) to seven FRI data sets that include
    Yanagi & Sakata 1982 and Sakata & Yanagi 1979: every Yanagi comparison
    with this model is IN-SAMPLE.
    TWO PRINTED EQUATIONS ARE READ DIFFERENTLY FROM THE PAGE, and why.  The
    authors' PhD thesis (Syeda, University of Alberta, NQ82172, pp. 123 and
    125, Eqs 5.26 and 5.31) prints both exactly as the paper does, so the
    page is not a typesetting slip; the readings below rest on the papers'
    own statements, not on agreement with any data:
      * Eq (28), k Delta t = C'' (3.8 rho_L^0.1 rho_G^0.3/sigma^0.4)(u_s g)^0.6,
        is introduced as the PRODUCT of (25) and (26), Delta t = n t_GLB, and
        carries no t_GLB.  Implemented WITH t_GLB.  As printed, k Delta t is
        O(10) on every Yanagi tray, every large bubble breaks (FSB ~ 1) at
        every load and pressure, and the point efficiency FALLS from weeping
        to flood -- contradicting p. 274 ("steady decrease in ... fraction of
        small bubbles ... as the F-factor approaches the weeping point";
        FSB = 1 "under high operating pressures").  With t_GLB both hold.
      * Eq (33), h_L = 0.6 h_w (p/b FP)^0.25, has units of m^1.5 and gives
        6.7 mm of clear liquid on the 51 mm weir of the FRI tray.
        Implemented as 0.6 h_w^0.5 (p/b FP)^0.25 (30 mm), the dimensionally
        consistent form -- CONFIRMED against the primary: Zuiderweg, Chem.
        Eng. Sci. 37 (1982) 1441, Eq (8), p. 1443, prints the "Hofhuis
        equation" h_l = 0.6 H_w^0.5 p^0.25 (FP/b)^0.25 (25 < H_w < 100 mm).
        Zuiderweg's own spray/mixed interfacial areas (pp. 1460-1461, Figs
        35-36) were derived from the FRI performance data of Sakata & Yanagi
        -- an efficiency model built on them would be in-sample on these
        trays; it is not implemented.
    The as-printed results are reported beside these in
    docs/design/c329-ratebased-first-delivery.md.
    Supplied here because Syeda does not print it: the jet K_OG by
    two-resistance addition on molar concentrations, 1/K_OG = 1/k_G +
    m c_G/(c_L k_L); Sh from Eq (12) below Pe_G = 40 (outside its stated
    40-200 range) is used as printed and counted; a negative f_j from Eq
    (35) at very low F_bba is taken as 0.  The point -> Murphree conversion
    follows Garcia & Fair, Ind. Eng. Chem. Res. 39 (2000) 1809, Eqs (12)-(13),
    p. 1815 (the route Syeda names on p. 271): D_e = 0.02366 h_2phi^1.5
    g^0.5 with h_2phi the Bennett froth height of Syeda Eq (13), t_L from
    the Bennett clear liquid alpha_e h_f, then (5)-(7) as in 3.
\*---------------------------------------------------------------------------*/

#pragma once

#include "core/Types.H"

#include <string>

namespace Choupo
{

class TrayEfficiency
{
public:

    enum class Model { AIChE, ChanFair, SyedaChuang };

    //  Tray geometry the correlations read, all in SI.
    struct Geometry
    {
        scalar activeArea   = 0.0;   // A_a, m2
        scalar towerArea    = 0.0;   // A_T, m2
        scalar weirHeight   = 0.0;   // h_w, m
        scalar weirLength   = 0.0;   // l_w, m
        scalar flowPath     = 0.0;   // Z, m: length of liquid travel
        scalar flowWidth    = 0.0;   // z, m: average flow width (D + l_w)/2
        scalar holeDiameter = 0.0;   // m   (SyedaChuang)
        scalar holeAreaFrac = 0.0;   // A_h/A_a (SyedaChuang)
        scalar holePitch    = 0.0;   // m   (SyedaChuang)
    };

    //  The local state of one tray.
    struct State
    {
        scalar vapourVolFlow = 0.0;  // m3/s through the tray
        scalar liquidVolFlow = 0.0;  // q, m3/s across the tray
        scalar rhoV          = 0.0;  // kg/m3
        scalar rhoL          = 0.0;  // kg/m3
        scalar ScV           = 0.0;  // mu_V/(rho_V D_V)
        scalar DV            = 0.0;  // m2/s
        scalar DL            = 0.0;  // m2/s, liquid diffusivity of the key pair
        scalar muL           = 0.0;  // Pa s
        scalar sigma         = 0.0;  // N/m
        scalar m             = 0.0;  // slope of the equilibrium line
        scalar lambda        = 0.0;  // m G/L
        scalar cGoverCL      = 0.0;  // molar density ratio vapour/liquid
        scalar GoverL        = 1.0;  // mass flow ratio vapour/liquid
        scalar floodApproach = -1.0; // f (Fair/Lygeros); < 0 => not available
        bool   entrainment   = false;// Colburn with Fair's median psi
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
        scalar FSB = 0.0, fj = 0.0;              // SyedaChuang only
        bool   plugFlow = false;                 // ChanFair: D_E <= 0
        bool   ShOutOfRange = false;             // SyedaChuang: Pe_G < 40
    };

    //  The whole chain for one tray.  Throws by name on a non-finite or
    //  non-physical intermediate rather than returning it.
    static Result evaluate(Model model, const Geometry& g, const State& s);

    //  Length of liquid travel between two segmental weirs of length l_w
    //  on a tower of diameter D: D minus twice the chord depth.
    static scalar flowPathLength(scalar D, scalar lw);

private:
    static void pointAIChE(const Geometry& g, const State& s, Result& r);
    static void pointChanFair(const Geometry& g, const State& s, Result& r);
    static void pointSyedaChuang(const Geometry& g, const State& s, Result& r);
    //  Point -> Murphree by eddy diffusion (section 3), from r.EOG, r.Pe and
    //  lambda, or plug flow when r.plugFlow; then the entrainment loss.
    static void murphree(const State& s, Result& r);
};

} // namespace Choupo
